/**
 * Configuración > Detallados especiales
 * Crear, editar y eliminar: nombre, disponible en Local / Domicilio, IVA y precio por tipo de vehículo.
 * El precio se escribe SIN IVA; si aplica, se muestra también el total con IVA.
 * Si un tipo de vehículo no tiene precio, el detallado no sale para ese vehículo.
 * Tablas: supabase/detallados_especiales.sql
 */

const IVA = Number((window.APP_CONFIG && window.APP_CONFIG.ivaPorcentaje) || 13);

/** Precio final: si lleva IVA se le suma. */
const conIva = (precio, aplica) => Math.round(aplica ? precio * (1 + IVA / 100) : precio);

const formatoColones = new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0
});

let especiales = [];      // [{id, nombre, disponible_local, disponible_domicilio, aplica_iva, precios:[]}]
let tiposVehiculo = [];   // [{id, nombre}]
let editandoId = null;

const $ = (id) => document.getElementById(id);

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
function toast(mensaje, tipo = 'ok') {
    const t = document.createElement('div');
    t.className = 'cfg-toast' + (tipo === 'error' ? ' is-error' : '');
    if (tipo === 'error') t.setAttribute('role', 'alert');
    t.innerHTML = `<i class="fa-solid ${tipo === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}" aria-hidden="true"></i><span></span>`;
    t.querySelector('span').textContent = mensaje;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function mensajeError(err) {
    const code = (err && err.code) || '';
    const msg = ((err && err.message) || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || code === '42703' || msg.includes('could not find') || msg.includes('does not exist')) {
        return 'FALTA_TABLA';
    }
    if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
        return 'Sin permiso para guardar. Ejecuta supabase/detallados_especiales.sql en Supabase.';
    }
    if (code === '23505') return 'Ya existe un detallado especial con ese nombre.';
    if (code === '23514') return 'Revisa los datos: el nombre es obligatorio y los precios no pueden ser negativos.';
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/* --------------------------------------------------------------------------
   Cargar datos
   -------------------------------------------------------------------------- */
async function cargarTodo() {
    try {
        const [rEsp, rPre, rTipos] = await Promise.all([
            window.supabase.from('detallados_especiales')
                .select('id, nombre, disponible_local, disponible_domicilio, aplica_iva')
                .order('nombre', { ascending: true }),
            window.supabase.from('detallado_especial_precios').select('especial_id, tipo_vehiculo_id, precio'),
            window.supabase.from('tipos_vehiculo').select('id, nombre').order('nombre', { ascending: true })
        ]);
        const error = rEsp.error || rPre.error || rTipos.error;
        if (error) throw error;

        tiposVehiculo = rTipos.data || [];
        especiales = (rEsp.data || []).map(e => ({
            ...e,
            precios: (rPre.data || []).filter(x => x.especial_id === e.id)
        }));
        dibujarLista();
    } catch (err) {
        console.error('[Detallados especiales] Error al cargar:', err);
        const m = mensajeError(err);
        const lista = $('lista');
        if (m === 'FALTA_TABLA') {
            lista.innerHTML = `
                <div class="cfg-state is-error">
                    <i class="fa-solid fa-database" aria-hidden="true"></i>
                    <strong>Faltan las tablas de detallados especiales.</strong><br>
                    Ejecuta <code>supabase/detallados_especiales.sql</code> en Supabase (SQL Editor) y recarga la página.
                </div>`;
            $('btn-nuevo').disabled = true;
        } else {
            lista.innerHTML = '<div class="cfg-state is-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span></span></div>';
            lista.querySelector('span').textContent = m + ' Recarga la página.';
        }
    }
}

/* --------------------------------------------------------------------------
   Lista
   -------------------------------------------------------------------------- */
function dibujarLista() {
    const lista = $('lista');
    if (especiales.length === 0) {
        lista.innerHTML = `
            <div class="cfg-state">
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                <strong>Aún no hay detallados especiales.</strong><br>
                Presiona <strong>Nuevo detallado</strong> para crear el primero (por ejemplo: Pulido de vidrios).
            </div>`;
        return;
    }
    lista.replaceChildren(...especiales.map(dibujarEspecial));
}

function dibujarEspecial(e) {
    const card = document.createElement('article');
    card.className = 'cfg-pkg';

    const head = document.createElement('div');
    head.className = 'cfg-pkg-head';
    head.innerHTML = `
        <div class="cfg-pkg-title">
            <h2></h2>
            <div class="cfg-tags"></div>
        </div>
        <div class="cfg-pkg-actions">
            <button type="button" class="cfg-icon-btn" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        </div>`;
    head.querySelector('h2').textContent = e.nombre;

    const tags = head.querySelector('.cfg-tags');
    [[e.disponible_local, 'Local'], [e.disponible_domicilio, 'Domicilio']].forEach(([on, texto]) => {
        const s = document.createElement('span');
        s.className = 'cfg-tag' + (on ? ' is-on' : '');
        s.textContent = on ? texto : `No en ${texto}`;
        tags.appendChild(s);
    });
    const tagIva = document.createElement('span');
    tagIva.className = 'cfg-tag' + (e.aplica_iva ? ' is-on' : '');
    tagIva.textContent = e.aplica_iva ? `Con IVA ${IVA} %` : 'Sin IVA';
    tags.appendChild(tagIva);

    const btn = head.querySelector('button');
    btn.setAttribute('aria-label', `Editar ${e.nombre}`);
    btn.addEventListener('click', () => abrirFormulario(e));
    head.querySelector('.cfg-pkg-actions').appendChild(CfgEliminar.boton(e.nombre, () => eliminarRegistro(e)));
    card.appendChild(head);

    // Precio por tipo de vehículo
    const precios = document.createElement('div');
    precios.className = 'cfg-pkg-prices';
    const filas = tiposVehiculo
        .map(t => ({ tipo: t, precio: e.precios.find(x => x.tipo_vehiculo_id === t.id) }))
        .filter(x => x.precio);

    if (filas.length === 0) {
        precios.innerHTML = '<p class="cfg-pkg-empty">Sin tipos de vehículo asignados.</p>';
    } else {
        filas.forEach(({ tipo, precio }) => {
            const item = document.createElement('div');
            item.className = 'cfg-price';
            const base = Number(precio.precio);
            item.innerHTML = '<span class="cfg-price-tipo"></span><span class="cfg-price-val"></span><span class="cfg-price-iva"></span>';
            item.querySelector('.cfg-price-tipo').textContent = tipo.nombre;
            item.querySelector('.cfg-price-val').textContent = formatoColones.format(conIva(base, e.aplica_iva));
            item.querySelector('.cfg-price-iva').textContent = e.aplica_iva ? `${formatoColones.format(base)} + IVA` : '';
            precios.appendChild(item);
        });
    }
    card.appendChild(precios);
    return card;
}

/* --------------------------------------------------------------------------
   Eliminar (con confirmación)
   -------------------------------------------------------------------------- */
async function eliminarRegistro(e) {
    const ok = await CfgEliminar.confirmar(e.nombre,
        'Se borran también sus precios. Dejará de salir en Vender / Atender. Las órdenes ya registradas no cambian.');
    if (!ok) return;
    const m = await CfgEliminar.eliminar('detallados_especiales', e.id);
    if (m) {
        toast(m, 'error');
        return;
    }
    toast(`"${e.nombre}" eliminado.`);
    await cargarTodo();
}

/* --------------------------------------------------------------------------
   Formulario
   -------------------------------------------------------------------------- */
function dibujarVehiculosForm(especial) {
    const cont = $('form-vehiculos');
    cont.innerHTML = '';

    if (tiposVehiculo.length === 0) {
        cont.innerHTML = '<p class="cfg-hint">No hay tipos de vehículo. Créalos primero en <a href="tipos-vehiculo.html">Configuración &gt; Tipos de vehículo</a>.</p>';
        return;
    }

    tiposVehiculo.forEach(t => {
        const actual = especial ? especial.precios.find(x => x.tipo_vehiculo_id === t.id) : null;
        const fila = document.createElement('div');
        fila.className = 'cfg-veh-row';
        fila.dataset.tipoId = t.id;
        fila.innerHTML = `
            <label class="cfg-check cfg-veh-name"><input type="checkbox"> <span></span></label>
            <div class="cfg-money">
                <span aria-hidden="true">₡</span>
                <input type="number" class="cfg-input" min="0" step="1" inputmode="numeric" placeholder="Precio">
            </div>
            <span class="cfg-veh-total"></span>`;
        const check = fila.querySelector('input[type=checkbox]');
        const precio = fila.querySelector('input[type=number]');
        fila.querySelector('.cfg-veh-name span').textContent = t.nombre;
        precio.setAttribute('aria-label', `Precio para ${t.nombre}`);

        check.checked = !!actual;
        precio.value = actual ? Number(actual.precio) : '';
        precio.disabled = !actual;
        check.addEventListener('change', () => {
            precio.disabled = !check.checked;
            if (check.checked) precio.focus();
            actualizarTotales();
        });
        precio.addEventListener('input', actualizarTotales);
        cont.appendChild(fila);
    });

    actualizarTotales();
}

/** Muestra el precio con IVA al lado de cada vehículo (si aplica). */
function actualizarTotales() {
    const aplica = $('campo-iva').checked;
    document.querySelectorAll('.cfg-veh-row').forEach(fila => {
        const check = fila.querySelector('input[type=checkbox]');
        const precio = fila.querySelector('input[type=number]');
        const total = fila.querySelector('.cfg-veh-total');
        total.textContent = (check.checked && aplica && precio.value !== '')
            ? `Con IVA: ${formatoColones.format(conIva(Number(precio.value), true))}`
            : '';
    });
}

function abrirFormulario(especial = null) {
    editandoId = especial ? especial.id : null;
    $('dialog-titulo').textContent = especial ? 'Editar detallado especial' : 'Nuevo detallado especial';
    $('campo-nombre').value = especial ? especial.nombre : '';
    $('campo-local').checked = especial ? !!especial.disponible_local : true;
    $('campo-domicilio').checked = especial ? !!especial.disponible_domicilio : true;
    $('campo-iva').checked = especial ? !!especial.aplica_iva : false;
    $('form-error').textContent = '';
    dibujarVehiculosForm(especial);
    $('dialog-especial').showModal();
    $('campo-nombre').focus();
}

function cerrarFormulario() {
    $('dialog-especial').close();
}

async function guardar(ev) {
    ev.preventDefault();
    const errorEl = $('form-error');
    errorEl.textContent = '';

    const nombre = $('campo-nombre').value.trim().replace(/\s+/g, ' ');
    if (!nombre) {
        errorEl.textContent = 'Escribe el nombre del detallado especial.';
        $('campo-nombre').focus();
        return;
    }
    if (especiales.some(e => e.id !== editandoId && e.nombre.toLowerCase() === nombre.toLowerCase())) {
        errorEl.textContent = 'Ya existe un detallado especial con ese nombre.';
        $('campo-nombre').focus();
        return;
    }

    // Vehículos marcados con su precio
    const precios = [];
    for (const fila of document.querySelectorAll('.cfg-veh-row')) {
        if (!fila.querySelector('input[type=checkbox]').checked) continue;
        const input = fila.querySelector('input[type=number]');
        const valor = input.value.trim();
        if (valor === '' || !Number.isFinite(Number(valor)) || Number(valor) < 0) {
            errorEl.textContent = `Escribe un precio válido para ${fila.querySelector('.cfg-veh-name span').textContent}.`;
            input.focus();
            return;
        }
        precios.push({ tipo_vehiculo_id: Number(fila.dataset.tipoId), precio: Math.round(Number(valor)) });
    }
    if (precios.length === 0) {
        errorEl.textContent = 'Marca al menos un tipo de vehículo y escribe su precio.';
        return;
    }

    const datos = {
        nombre,
        disponible_local: $('campo-local').checked,
        disponible_domicilio: $('campo-domicilio').checked,
        aplica_iva: $('campo-iva').checked
    };

    const btn = $('btn-guardar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando…';

    try {
        // 1. Detallado especial
        let especialId = editandoId;
        if (editandoId) {
            const { error } = await window.supabase.from('detallados_especiales').update(datos).eq('id', editandoId);
            if (error) throw error;
        } else {
            const { data, error } = await window.supabase.from('detallados_especiales').insert([datos]).select('id').single();
            if (error) throw error;
            especialId = data.id;
        }

        // 2. Precios: guardar los marcados y quitar los desmarcados
        const { error: errUp } = await window.supabase
            .from('detallado_especial_precios')
            .upsert(precios.map(p => ({ especial_id: especialId, ...p })), { onConflict: 'especial_id,tipo_vehiculo_id' });
        if (errUp) throw errUp;

        const { error: errDel } = await window.supabase
            .from('detallado_especial_precios')
            .delete()
            .eq('especial_id', especialId)
            .not('tipo_vehiculo_id', 'in', `(${precios.map(p => p.tipo_vehiculo_id).join(',')})`);
        if (errDel) throw errDel;

        toast(editandoId ? `"${nombre}" actualizado.` : `"${nombre}" creado.`);
        cerrarFormulario();
        await cargarTodo();
    } catch (err) {
        console.error('[Detallados especiales] Error al guardar:', err);
        const m = mensajeError(err);
        errorEl.textContent = m === 'FALTA_TABLA'
            ? 'Faltan las tablas (supabase/detallados_especiales.sql).'
            : m;
        // Si se creó pero falló lo demás, recargar para no duplicarlo al reintentar
        if (!editandoId) await cargarTodo();
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Guardar';
    }
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
function iniciar() {
    $('iva-pct').textContent = IVA;
    $('campo-iva').addEventListener('change', actualizarTotales);
    $('btn-nuevo').addEventListener('click', () => abrirFormulario());
    $('btn-cerrar').addEventListener('click', cerrarFormulario);
    $('btn-cancelar').addEventListener('click', cerrarFormulario);
    $('form-especial').addEventListener('submit', guardar);
    $('dialog-especial').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarFormulario();
    });
    cargarTodo();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
