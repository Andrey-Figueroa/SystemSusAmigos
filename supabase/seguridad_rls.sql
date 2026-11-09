-- ============================================================================
-- SUS AMIGOS — Seguridad de datos (RLS)
-- Proyecto: bsdeqwvyshwswgqpvvqs  (NO aplica al proyecto de Mecánica)
--
-- Qué hace:
--   * Nadie sin sesión (clave pública / anon) puede leer ni modificar datos.
--   * Solo el personal con estado 'Activo' puede usar las tablas del negocio.
--   * Una cuenta creada por registro público (que no está en 'personal')
--     no tiene acceso a nada.
--   * La tabla 'personal' solo la modifican Dueño, Administrador y Soporte TI.
--     Cada persona puede leer su propio registro (el login lo necesita para
--     mostrar "Cuenta suspendida", etc.).
--
-- Cómo ejecutarlo:
--   1. Ejecuta primero el PASO 0 (solo lectura) y revisa el resultado.
--   2. Ejecuta los PASOS 1 a 4 juntos en el SQL Editor de Supabase.
--   3. Prueba el sistema. Si algo falla, usa el bloque "REVERTIR" al final.
-- ============================================================================


-- ============================================================================
-- PASO 0 — DIAGNÓSTICO (solo lectura, ejecutar primero y por separado)
-- Lista al personal con cuenta cuyo id NO coincide con su usuario de Auth.
-- Esas personas siguen entrando gracias a la coincidencia por correo, pero
-- conviene corregirlas. Si no devuelve filas, todo está en orden.
-- ============================================================================
-- SELECT p.id, p.nombre, p.email, p.estado, u.id AS auth_id
-- FROM public.personal p
-- LEFT JOIN auth.users u ON lower(u.email) = lower(p.email::text)
-- WHERE p.email IS NOT NULL
--   AND (u.id IS NULL OR u.id::text <> p.id::text);


-- ============================================================================
-- PASO 1 — Funciones auxiliares
-- SECURITY DEFINER: leen 'personal' sin quedar bloqueadas por sus propias políticas.
-- ============================================================================

-- ¿El usuario que hace la consulta es personal con estado 'Activo'?
CREATE OR REPLACE FUNCTION public.es_personal_activo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.personal p
        WHERE (
                p.id::text = auth.uid()::text
             OR (p.email IS NOT NULL AND lower(p.email::text) = lower(auth.jwt() ->> 'email'))
              )
          AND trim(p.estado::text) = 'Activo'
    );
$$;

-- ¿Es personal activo con rol Dueño, Administrador o Soporte TI?
CREATE OR REPLACE FUNCTION public.es_admin_activo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.personal p
        WHERE (
                p.id::text = auth.uid()::text
             OR (p.email IS NOT NULL AND lower(p.email::text) = lower(auth.jwt() ->> 'email'))
              )
          AND trim(p.estado::text) = 'Activo'
          AND translate(lower(trim(p.rol::text)), 'áéíóúñ', 'aeioun')
              IN ('dueno', 'administrador', 'soporte ti', 'soporte ti / programador')
    );
$$;

REVOKE ALL ON FUNCTION public.es_personal_activo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_admin_activo()   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_personal_activo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_admin_activo()   TO authenticated;


-- ============================================================================
-- PASO 2 — Tablas del negocio: solo personal activo
-- Se borran las políticas anteriores de cada tabla (por ejemplo, las de CxC
-- que permitían a cualquier usuario autenticado) y se crea una sola política.
-- Las tablas que no existan se saltan.
-- ============================================================================
DO $$
DECLARE
    t   text;
    pol record;
    tablas text[] := ARRAY[
        'clientes',
        'vehiculos',
        'cliente_vehiculo',
        'ordenes',
        'ordenes_domicilio',
        'cxc_manuales',
        'cxc_abonos',
        'gastos',
        'ventas_productos_diarias'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'Tabla % no existe, se omite', t;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
            EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
        END LOOP;

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
             USING (public.es_personal_activo())
             WITH CHECK (public.es_personal_activo())',
            t || '_personal_activo', t
        );

        RAISE NOTICE 'RLS aplicado a %', t;
    END LOOP;
END $$;


-- ============================================================================
-- PASO 3 — Tabla 'personal'
-- ============================================================================
ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'personal' LOOP
        EXECUTE format('DROP POLICY %I ON public.personal', pol.policyname);
    END LOOP;
END $$;

-- Leer: el personal activo ve a todos; cada persona ve su propio registro
CREATE POLICY personal_select ON public.personal
    FOR SELECT TO authenticated
    USING (
        public.es_personal_activo()
        OR id::text = auth.uid()::text
        OR (email IS NOT NULL AND lower(email::text) = lower(auth.jwt() ->> 'email'))
    );

-- Crear, editar y borrar: solo Dueño, Administrador y Soporte TI
CREATE POLICY personal_insert ON public.personal
    FOR INSERT TO authenticated
    WITH CHECK (public.es_admin_activo());

CREATE POLICY personal_update ON public.personal
    FOR UPDATE TO authenticated
    USING (public.es_admin_activo())
    WITH CHECK (public.es_admin_activo());

CREATE POLICY personal_delete ON public.personal
    FOR DELETE TO authenticated
    USING (public.es_admin_activo());


-- ============================================================================
-- PASO 4 — Funciones RPC: que no se puedan llamar sin sesión
-- (reiniciar_contadores_diarios, eliminar_personal, etc.)
-- ============================================================================
DO $$
DECLARE f record;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND p.proname NOT IN ('es_personal_activo', 'es_admin_activo')
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.firma);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.firma);
    END LOOP;
END $$;


-- ============================================================================
-- VERIFICACIÓN — debe mostrar rls = true y una política por tabla
-- ============================================================================
-- SELECT c.relname AS tabla, c.relrowsecurity AS rls,
--        (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'r'
-- ORDER BY 1;


-- ============================================================================
-- REVERTIR (solo si algo deja de funcionar): vuelve a abrir las tablas.
-- Ojo: esto deja los datos expuestos otra vez, como estaban antes.
-- ============================================================================
-- DO $$
-- DECLARE t text;
-- BEGIN
--     FOREACH t IN ARRAY ARRAY['personal','clientes','vehiculos','cliente_vehiculo','ordenes',
--                              'ordenes_domicilio','cxc_manuales','cxc_abonos','gastos',
--                              'ventas_productos_diarias'] LOOP
--         IF to_regclass('public.' || t) IS NOT NULL THEN
--             EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--         END IF;
--     END LOOP;
-- END $$;
