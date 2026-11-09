/**
 * Catálogo de detallado compartido por Local Comercial y Domicilio.
 * Lee lo que se configura en Configuración y aplica sus reglas:
 *
 *  - Paquetes de detallado: solo los disponibles en el módulo (Local / Domicilio)
 *    y con precio para el tipo de vehículo elegido. Precio final con IVA si aplica.
 *  - Detalladores internos: solo los asignados al paquete, activos y disponibles en el módulo.
 *  - Aromatizantes: igual que los detalladores; "Sin aromatizante" sale siempre.
 *  - Detallados especiales: los del módulo con precio para el tipo de vehículo (con IVA si aplica).
 *  - Extras: activos, del módulo y "solo con interior" según el vehículo.
 *
 * Uso:
 *   await CatalogoDetallado.cargar('local' | 'domicilio');
 *   CatalogoDetallado.pintarPaquetes(contenedor, tipoVehiculo, { seleccionado, onChange });
 *   CatalogoDetallado.pintarOpciones(contenedor, 'extra_interior', lista, seleccionado);
 *
 * Requiere window.supabase (js/supabase.js) y APP_CONFIG.ivaPorcentaje (js/config.js).
 */
window.CatalogoDetallado = (function () {
    const SIN_AROMA = 'Sin aromatizante';
    const PROMOCION = 'Promocion';
    const IVA = Number((window.APP_CONFIG && window.APP_CONFIG.ivaPorcentaje) || 13);

    const formatoColones = new Intl.NumberFormat('es-CR', {
        style: 'currency', currency: 'CRC', maximumFractionDigits: 0
    });

    let modulo = null;
    let promesa = null;
    let datos = { tipos: [], paquetes: [], precios: [], detalladores: [], aromatizantes: [], relDet: [], relAro: [] };

    const norm = (s) => (s || '').trim().toLowerCase();
    const enModulo = (x) => modulo === 'domicilio' ? !!x.disponible_domicilio : !!x.disponible_local;

    /** Carga todo una sola vez por página. */
    function cargar(mod) {
        modulo = mod;
        if (promesa) return promesa;

        const sb = window.supabase;
        promesa = Promise.all([
            sb.from('tipos_vehiculo').select('id, nombre'),
            sb.from('paquetes_detallado').select('id, nombre, disponible_local, disponible_domicilio, aplica_iva').order('nombre', { ascending: true }),
            sb.from('paquete_detallado_precios').select('paquete_id, tipo_vehiculo_id, precio'),
            sb.from('detalladores_internos').select('id, nombre, activo, disponible_local, disponible_domicilio').order('nombre', { ascending: true }),
            sb.from('aromatizantes').select('id, nombre, activo, disponible_local, disponible_domicilio').order('nombre', { ascending: true }),
            sb.from('paquete_detallado_detalladores').select('paquete_id, detallador_id'),
            sb.from('paquete_detallado_aromatizantes').select('paquete_id, aromatizante_id')
        ]).then(([rT, rP, rPr, rD, rA, rRD, rRA]) => {
            const error = rT.error || rP.error || rPr.error || rD.error || rA.error || rRD.error || rRA.error;
            if (error) throw error;
            datos = {
                tipos: rT.data || [],
                paquetes: rP.data || [],
                precios: rPr.data || [],
                detalladores: rD.data || [],
                aromatizantes: rA.data || [],
                relDet: rRD.data || [],
                relAro: rRA.data || []
            };
            return datos;
        });
        // Si falla, permitir reintentar
        promesa.catch(() => { promesa = null; });
        return promesa;
    }

    const precioFinal = (precio, aplicaIva) => {
        const base = Number(precio) || 0;
        return Math.round(aplicaIva ? base * (1 + IVA / 100) : base);
    };

    /** Paquetes disponibles en el módulo para ese tipo de vehículo, con su precio. */
    function paquetes(tipoVehiculo) {
        const tipo = datos.tipos.find(t => norm(t.nombre) === norm(tipoVehiculo));
        if (!tipo) return [];
        return datos.paquetes
            .filter(enModulo)
            .map(p => {
                const pr = datos.precios.find(x => x.paquete_id === p.id && x.tipo_vehiculo_id === tipo.id);
                if (!pr) return null;
                return {
                    id: p.id,
                    nombre: p.nombre,
                    aplica_iva: !!p.aplica_iva,
                    precio: Number(pr.precio),
                    total: precioFinal(pr.precio, p.aplica_iva)
                };
            })
            .filter(Boolean);
    }

    /** Detalladores internos del paquete (activos y del módulo). Sin paquete (promoción): todos los del módulo. */
    function detalladores(paqueteId) {
        const ids = paqueteId ? datos.relDet.filter(r => r.paquete_id === paqueteId).map(r => r.detallador_id) : null;
        return datos.detalladores.filter(d => d.activo && enModulo(d) && (!ids || ids.includes(d.id)));
    }

    /** Aromatizantes del paquete (activos y del módulo). Sin paquete (promoción): todos los del módulo. */
    function aromatizantes(paqueteId) {
        const ids = paqueteId ? datos.relAro.filter(r => r.paquete_id === paqueteId).map(r => r.aromatizante_id) : null;
        return datos.aromatizantes.filter(a => a.activo && enModulo(a) && (!ids || ids.includes(a.id)));
    }

    /* ----------------------------------------------------------------------
       Pintar tarjetas
       ---------------------------------------------------------------------- */
    function mensaje(cont, texto, esError) {
        cont.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'step-desc';
        p.style.gridColumn = '1 / -1';
        if (esError) p.style.color = 'var(--danger-color, #ef4444)';
        p.textContent = texto;
        cont.appendChild(p);
    }

    function tarjeta(name, valor, titulo, detalle, checked) {
        const label = document.createElement('label');
        label.className = 'radio-card';
        label.innerHTML = '<input type="radio"><div class="radio-card-content"><span></span></div>';
        const input = label.querySelector('input');
        input.name = name;
        input.value = valor;
        input.checked = !!checked;
        label.querySelector('span').textContent = titulo;
        if (detalle) {
            const small = document.createElement('small');
            small.className = 'radio-card-precio';
            small.textContent = detalle;
            label.querySelector('.radio-card-content').appendChild(small);
        }
        return label;
    }

    /**
     * Tarjetas de paquetes para el tipo de vehículo + "Promoción especial".
     * onChange(paquete | null) recibe null cuando se elige Promoción.
     */
    function pintarPaquetes(cont, tipoVehiculo, { seleccionado, onChange } = {}) {
        const lista = paquetes(tipoVehiculo);
        cont.innerHTML = '';

        if (lista.length === 0) {
            mensaje(cont, `No hay paquetes de detallado configurados para "${tipoVehiculo}" en ${modulo === 'domicilio' ? 'Domicilio' : 'Local'}. Configúralos en Configuración > Paquetes de detallado.`, true);
        }

        lista.forEach(p => {
            const detalle = formatoColones.format(p.total) + (p.aplica_iva ? ' (IVA incl.)' : '');
            const card = tarjeta('detallado_tipo', p.nombre, p.nombre, detalle, norm(seleccionado) === norm(p.nombre));
            card.querySelector('input').addEventListener('change', () => onChange && onChange(p));
            cont.appendChild(card);
        });

        const promo = tarjeta('detallado_tipo', PROMOCION, 'Promoción Especial', '', seleccionado === PROMOCION);
        promo.style.gridColumn = 'span 2';
        promo.querySelector('input').id = 'radio-promocion';
        promo.querySelector('input').addEventListener('change', () => onChange && onChange(null));
        cont.appendChild(promo);

        return lista;
    }

    /**
     * Tarjetas de opciones (detalladores o aromatizantes).
     * extraFinal: texto de una opción fija al final (p. ej. "Sin aromatizante").
     */
    function pintarOpciones(cont, name, lista, seleccionado, { extraFinal, vacio } = {}) {
        cont.innerHTML = '';
        lista.forEach(x => cont.appendChild(tarjeta(name, x.nombre, x.nombre, '', norm(seleccionado) === norm(x.nombre))));
        if (extraFinal) cont.appendChild(tarjeta(name, extraFinal, extraFinal, '', norm(seleccionado) === norm(extraFinal)));
        if (!lista.length && !extraFinal && vacio) mensaje(cont, vacio);
    }

    /**
     * Pone como monto sugerido del cobro la suma de lo elegido (paquete + detallados especiales).
     * partes: [{ nombre, total, aplica_iva }]
     * Solo lo escribe si el campo está vacío o si el valor lo había puesto el sistema,
     * así no se pisa un monto que la persona ya ajustó a mano.
     */
    function sugerirMonto(input, aviso, partes, tipoVehiculo) {
        if (!input || !aviso) return;
        partes = (partes || []).filter(Boolean);
        if (!partes.length) {
            if (input.dataset.autoPaquete && input.value === input.dataset.autoPaquete) input.value = '';
            delete input.dataset.autoPaquete;
            aviso.style.display = 'none';
            return;
        }
        const total = partes.reduce((suma, p) => suma + (Number(p.total) || 0), 0);
        const valor = String(total);
        if (input.value === '' || input.value === input.dataset.autoPaquete) {
            input.value = valor;
            input.dataset.autoPaquete = valor;
        }
        const detalle = partes
            .map(p => `${p.nombre} ${formatoColones.format(p.total)}${p.aplica_iva ? ' (IVA incl.)' : ''}`)
            .join(' + ');
        aviso.textContent = `Precios para ${tipoVehiculo}: ${detalle}` +
            (partes.length > 1 ? ` = ${formatoColones.format(total)}` : '') + '. Puedes ajustarlo.';
        aviso.style.display = 'block';
    }

    /* ----------------------------------------------------------------------
       Detallados especiales (Configuración > Detallados especiales)
       Se cargan aparte para que un problema con estas tablas no bloquee lo demás.
       ---------------------------------------------------------------------- */
    let promesaEspeciales = null;
    let datosEspeciales = { tipos: [], especiales: [], precios: [] };

    function cargarEspeciales(mod) {
        modulo = mod;
        if (promesaEspeciales) return promesaEspeciales;
        const sb = window.supabase;
        promesaEspeciales = Promise.all([
            sb.from('tipos_vehiculo').select('id, nombre'),
            sb.from('detallados_especiales').select('id, nombre, disponible_local, disponible_domicilio, aplica_iva').order('nombre', { ascending: true }),
            sb.from('detallado_especial_precios').select('especial_id, tipo_vehiculo_id, precio')
        ]).then(([rT, rE, rP]) => {
            const error = rT.error || rE.error || rP.error;
            if (error) throw error;
            datosEspeciales = { tipos: rT.data || [], especiales: rE.data || [], precios: rP.data || [] };
            return datosEspeciales;
        });
        promesaEspeciales.catch(() => { promesaEspeciales = null; });
        return promesaEspeciales;
    }

    /** Detallados especiales del módulo con precio para ese tipo de vehículo (total con IVA si aplica). */
    function especiales(tipoVehiculo) {
        const tipo = datosEspeciales.tipos.find(t => norm(t.nombre) === norm(tipoVehiculo));
        if (!tipo) return [];
        return datosEspeciales.especiales
            .filter(enModulo)
            .map(e => {
                const pr = datosEspeciales.precios.find(x => x.especial_id === e.id && x.tipo_vehiculo_id === tipo.id);
                if (!pr) return null;
                return {
                    id: e.id,
                    nombre: e.nombre,
                    aplica_iva: !!e.aplica_iva,
                    precio: Number(pr.precio),
                    total: precioFinal(pr.precio, e.aplica_iva)
                };
            })
            .filter(Boolean);
    }

    /** Tarjetas de detallados especiales (checkbox, clase 'especial-cb') con su precio. */
    function pintarEspeciales(cont, tipoVehiculo, seleccionados) {
        const marcados = (seleccionados || []).map(norm);
        cont.innerHTML = '';
        const lista = especiales(tipoVehiculo);
        if (!lista.length) {
            mensaje(cont, `No hay detallados especiales configurados para "${tipoVehiculo}" en ${modulo === 'domicilio' ? 'Domicilio' : 'Local'}. Se crean en Configuración > Detallados especiales.`, true);
            return;
        }
        lista.forEach(e => {
            const label = document.createElement('label');
            label.className = 'checkbox-card';
            label.innerHTML = '<input type="checkbox" class="especial-cb"><div class="checkbox-card-content"><span></span><small class="radio-card-precio"></small></div>';
            const input = label.querySelector('input');
            input.value = e.nombre;
            input.checked = marcados.includes(norm(e.nombre));
            label.querySelector('span').textContent = e.nombre;
            label.querySelector('small').textContent = formatoColones.format(e.total) + (e.aplica_iva ? ' (IVA incl.)' : '');
            cont.appendChild(label);
        });
    }

    /**
     * Muestra u oculta el servicio "Detallados especiales" (paso de servicios) según
     * si el vehículo tiene al menos uno configurado. P. ej. Moto: si ningún detallado
     * especial tiene precio para Moto, la opción no sale.
     * Si no se pudo cargar la configuración, se deja visible (el paso mostrará el aviso).
     */
    async function mostrarServicioEspeciales(mod, tipoVehiculo) {
        const cb = document.querySelector('.service-checkbox[value="Detallados especiales"]');
        if (!cb) return;
        const card = cb.closest('.checkbox-card') || cb.parentElement;
        let hay = true;
        try {
            await cargarEspeciales(mod);
            hay = especiales(tipoVehiculo).length > 0;
        } catch (e) {
            console.error('[Especiales] Error al cargar:', e);
        }
        card.style.display = hay ? '' : 'none';
        if (!hay) cb.checked = false;
    }

    /** Detallados especiales elegidos (por nombre) con su precio para el vehículo. */
    function especialesElegidos(tipoVehiculo, nombres) {
        const marcados = (nombres || []).map(norm);
        return especiales(tipoVehiculo).filter(e => marcados.includes(norm(e.nombre)));
    }

    function mensajeErrorEspeciales(err) {
        const code = (err && err.code) || '';
        const msg = ((err && err.message) || '').toLowerCase();
        if (code === '42P01' || code === 'PGRST205' || code === '42703' || msg.includes('could not find') || msg.includes('does not exist')) {
            return 'Faltan las tablas de detallados especiales. Ejecuta supabase/detallados_especiales.sql en Supabase.';
        }
        if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
            return 'Sin permiso para leer los detallados especiales. Ejecuta supabase/detallados_especiales.sql en Supabase.';
        }
        return 'No se pudieron cargar los detallados especiales. Revisa tu conexión y vuelve a intentarlo.';
    }

    /* ----------------------------------------------------------------------
       Extras finales (Configuración > Extras, tabla 'extras')
       Se cargan aparte para que un problema con esta tabla no bloquee los paquetes.
       ---------------------------------------------------------------------- */
    let promesaExtras = null;
    let listaExtras = [];

    function cargarExtras(mod) {
        modulo = mod;
        if (promesaExtras) return promesaExtras;
        promesaExtras = window.supabase
            .from('extras')
            .select('id, nombre, precio, activo, disponible_local, disponible_domicilio, solo_con_interior')
            .order('nombre', { ascending: true })
            .then(({ data, error }) => {
                if (error) throw error;
                listaExtras = data || [];
                return listaExtras;
            });
        promesaExtras.catch(() => { promesaExtras = null; });
        return promesaExtras;
    }

    /** Extras activos del módulo; los "solo con interior" no salen para tipos sin interior (Moto). */
    function extras(tipoVehiculo) {
        const conInterior = window.TiposVehiculo ? window.TiposVehiculo.tieneInterior(tipoVehiculo) : true;
        return listaExtras.filter(e => e.activo && enModulo(e) && (!e.solo_con_interior || conInterior));
    }

    /**
     * Tarjetas de extras (checkbox, clase 'extra-final-cb') dentro de cont.
     * Al marcar uno se desmarca "Ninguno" (#extra-ninguno).
     */
    function pintarExtras(cont, tipoVehiculo, seleccionados) {
        const marcados = (seleccionados || []).map(norm);
        cont.innerHTML = '';
        const lista = extras(tipoVehiculo);
        if (!lista.length) {
            mensaje(cont, 'No hay extras configurados para este vehículo. Se crean en Configuración > Extras.');
            return;
        }
        lista.forEach(e => {
            const label = document.createElement('label');
            label.className = 'checkbox-card';
            label.innerHTML = '<input type="checkbox" class="extra-final-cb"><div class="checkbox-card-content"><span></span></div>';
            const input = label.querySelector('input');
            input.value = e.nombre;
            input.checked = marcados.includes(norm(e.nombre));
            input.addEventListener('change', () => {
                const ninguno = document.getElementById('extra-ninguno');
                if (input.checked && ninguno) ninguno.checked = false;
            });
            label.querySelector('span').textContent = e.nombre;
            // Precio aproximado de referencia
            if (e.precio !== null && e.precio !== undefined) {
                const small = document.createElement('small');
                small.className = 'radio-card-precio';
                small.textContent = '≈ ' + formatoColones.format(Number(e.precio));
                label.querySelector('.checkbox-card-content').appendChild(small);
            }
            cont.appendChild(label);
        });
    }

    function mensajeErrorExtras(err) {
        const code = (err && err.code) || '';
        const msg = ((err && err.message) || '').toLowerCase();
        if (code === '42P01' || code === 'PGRST205' || code === '42703' || msg.includes('could not find') || msg.includes('does not exist')) {
            return 'Falta la tabla de extras. Ejecuta supabase/extras.sql en Supabase.';
        }
        if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
            return 'Sin permiso para leer los extras. Ejecuta supabase/extras.sql en Supabase.';
        }
        return 'No se pudieron cargar los extras. Revisa tu conexión y vuelve a intentarlo.';
    }

    /** Mensaje en español si falla la carga. */
    function mensajeError(err) {
        const code = (err && err.code) || '';
        const msg = ((err && err.message) || '').toLowerCase();
        if (code === '42P01' || code === 'PGRST205' || code === '42703' || msg.includes('could not find') || msg.includes('does not exist')) {
            return 'Faltan las tablas de paquetes de detallado. Ejecuta supabase/paquetes_detallado.sql en Supabase.';
        }
        if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
            return 'Sin permiso para leer los paquetes de detallado. Ejecuta supabase/paquetes_detallado.sql en Supabase.';
        }
        if (msg.includes('failed to fetch') || msg.includes('network')) {
            return 'No se pudieron cargar los paquetes. Revisa tu conexión y vuelve a intentarlo.';
        }
        return 'No se pudieron cargar los paquetes de detallado. Recarga la página.';
    }

    return {
        SIN_AROMA, PROMOCION,
        cargar, paquetes, detalladores, aromatizantes,
        pintarPaquetes, pintarOpciones, sugerirMonto, mensaje, mensajeError,
        cargarEspeciales, especiales, pintarEspeciales, especialesElegidos, mensajeErrorEspeciales,
        mostrarServicioEspeciales,
        cargarExtras, extras, pintarExtras, mensajeErrorExtras,
        formato: (n) => formatoColones.format(n)
    };
})();
