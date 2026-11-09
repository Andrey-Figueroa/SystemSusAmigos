/**
 * Catálogo de mecánica (Configuración > Mecánica) para Local Comercial.
 * Solo categorías y servicios ACTIVOS, en el orden configurado.
 *
 *  - Categoría con servicios          -> se eligen en "Detalles Mecánicos" (+ "Otro" con texto).
 *  - Categoría que pide detalle       -> se escribe un texto (Otro, Promociones).
 *  - Categoría sin servicios ni detalle -> se marca y listo (Mantenimiento general).
 *
 * Tablas en el Supabase principal (supabase/mecanica_config.sql).
 */
window.CatalogoMecanica = (function () {
    let promesa = null;
    let categorias = [];   // [{ id, nombre, pide_detalle, servicios: [nombre, ...] }]

    const norm = (s) => (s || '').trim().toLowerCase();

    function cargar() {
        if (promesa) return promesa;
        const sb = window.supabase;
        promesa = Promise.all([
            sb.from('mecanica_categorias')
                .select('id, nombre, activo, pide_detalle, orden')
                .eq('activo', true)
                .order('orden', { ascending: true })
                .order('nombre', { ascending: true }),
            sb.from('mecanica_servicios')
                .select('categoria_id, nombre, activo, orden')
                .eq('activo', true)
                .order('orden', { ascending: true })
                .order('nombre', { ascending: true })
        ]).then(([rC, rS]) => {
            const error = rC.error || rS.error;
            if (error) throw error;
            categorias = (rC.data || []).map(c => ({
                id: c.id,
                nombre: c.nombre,
                pide_detalle: !!c.pide_detalle,
                servicios: (rS.data || []).filter(s => s.categoria_id === c.id).map(s => s.nombre)
            }));
            return categorias;
        });
        promesa.catch(() => { promesa = null; });
        return promesa;
    }

    const lista = () => categorias;
    const buscar = (nombre) => categorias.find(c => norm(c.nombre) === norm(nombre)) || null;

    /** Si la categoría lleva al paso de "Detalles Mecánicos". */
    const usaServicios = (cat) => !!cat && !cat.pide_detalle && cat.servicios.length > 0;

    function mensajeError(err) {
        const code = (err && err.code) || '';
        const msg = ((err && err.message) || '').toLowerCase();
        if (code === '42P01' || code === 'PGRST205' || code === '42703' || msg.includes('could not find') || msg.includes('does not exist')) {
            return 'Faltan las tablas de mecánica. Ejecuta supabase/mecanica_config.sql en Supabase.';
        }
        if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
            return 'Sin permiso para leer la configuración de mecánica. Ejecuta supabase/mecanica_config.sql en Supabase.';
        }
        return 'No se pudieron cargar las categorías de mecánica. Revisa tu conexión y vuelve a intentarlo.';
    }

    return { cargar, lista, buscar, usaServicios, mensajeError };
})();
