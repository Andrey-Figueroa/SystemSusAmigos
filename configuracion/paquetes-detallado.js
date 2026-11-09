/**
 * Configuración > Paquetes de detallado
 * Crear y editar (set) paquetes: nombre, disponible en Local/Domicilio, IVA,
 * precio por tipo de vehículo, detalladores internos y aromatizantes disponibles.
 * Tablas: supabase/paquetes_detallado.sql
 */

const IVA = Number((window.APP_CONFIG && window.APP_CONFIG.ivaPorcentaje) || 13);

const formatoColones = new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0
});

let paquetes = [];        // [{id, nombre, disponible_local, disponible_domicilio, aplica_iva, precios:[], detalladores:[], aromatizantes:[]}]
let tiposVehiculo = [];   // [{id, nombre}]
let detalladores = [];    // [{id, nombre, activo}]
let aromatizantes = [];   // [{id, nombre, activo}]
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
        return 'Sin permiso para guardar. Vuelve a ejecutar supabase/paquetes_detallado.sql en Supabase.';
    }
    if (code === '23505') return 'Ya existe un paquete con ese nombre.';
    if (code === '23514') return 'Revisa los datos: el nombre es obligatorio y los precios no pueden ser negativos.';
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/** Precio final: si el paquete lleva IVA se le suma. */
const conIva = (precio, aplica) => aplica ? precio * (1 + IVA / 100) : precio;

/* --------------------------------------------------------------------------
   Cargar datos
   -------------------------------------------------------------------------- */
async function cargarTodo() {
    try {
        const [rPaq, rPre, rDet, rTipos, rDetInt, rAro, rAroInt] = await Promise.all([
            window.supabase.from('paquetes_detallado')
                .select('id, nombre, disponible_local, disponible_domicilio, aplica_iva')
                .order('nombre', { ascending: true }),
            window.supabase.from('paquete_detallado_precios').select('paquete_id, tipo_vehiculo_id, precio'),
            window.supabase.from('paquete_detallado_detalladores').select('paquete_id, detallador_id'),
            window.supabase.from('tipos_vehiculo').select('id, nombre').order('nombre', { ascending: true }),
            window.supabase.from('detalladores_internos').select('id, nombre, activo').order('nombre', { ascending: true }),
            window.supabase.from('paquete_detallado_aromatizantes').select('paquete_id, aromatizante_id'),
            window.supabase.from('aromatizantes').select('id, nombre, activo').order('nombre', { ascending: true })
        ]);

        const error = rPaq.error || rPre.error || rDet.error || rTipos.error || rDetInt.error || rAro.error || rAroInt.error;
        if (error) throw error;

        tiposVehiculo = rTipos.data || [];
        detalladores = rDetInt.data || [];
        aromatizantes = rAroInt.data || [];
        paquetes = (rPaq.data || []).map(p => ({
            ...p,
            precios: (rPre.data || []).filter(x => x.paquete_id === p.id),
            detalladores: (rDet.data || []).filter(x => x.paquete_id === p.id).map(x => x.detallador_id),
            aromatizantes: (rAro.data || []).filter(x => x.paquete_id === p.id).map(x => x.aromatizante_id)
        }));

        dibujarLista();
    } catch (err) {
        console.error('[Paquetes] Error al cargar:', err);
        const m = mensajeError(err);
        const lista = $('lista-paquetes');
        if (m === 'FALTA_TABLA') {
            lista.innerHTML = `
                <div class="cfg-state is-error">
                    <i class="fa-solid fa-database" aria-hidden="true"></i>
                    <strong>Faltan las tablas de paquetes de detallado.</strong><br>
                    Ejecuta <code>supabase/paquetes_detallado.sql</code> en Supabase (SQL Editor) y recarga la página.
                </div>`;
            $('btn-nuevo').disabled = true;
        } else {
            lista.innerHTML = '<div class="cfg-state is-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span></span></div>';
            lista.querySelector('span').textContent = (m === 'FALTA_TABLA' ? '' : m) + ' Recarga la página.';
        }
    }
}

/* --------------------------------------------------------------------------
   Lista de paquetes
   -------------------------------------------------------------------------- */
function dibujarLista() {
    const lista = $('lista-paquetes');

    if (paquetes.length === 0) {
        lista.innerHTML = `
            <div class="cfg-state">
                <i class="fa-solid fa-spray-can-sparkles" aria-hidden="true"></i>
                <strong>Aún no hay paquetes de detallado.</strong><br>
                Presiona <strong>Nuevo paquete</strong> para crear el primero (por ejemplo: Clásico, Premium, Gold).
            </div>`;
        return;
    }

    lista.replaceChildren(...paquetes.map(dibujarPaquete));
}

function dibujarPaquete(p) {
    const card = document.createElement('article');
    card.className = 'cfg-pkg';

    // Encabezado: nombre + etiquetas + editar
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
    head.querySelector('h2').textContent = p.nombre;

    const tags = head.querySelector('.cfg-tags');
    const tag = (texto, activo) => {
        const s = document.createElement('span');
        s.className = 'cfg-tag' + (activo ? ' is-on' : '');
        s.textContent = texto;
        tags.appendChild(s);
    };
    tag(p.disponible_local ? 'Local' : 'No en Local', p.disponible_local);
    tag(p.disponible_domicilio ? 'Domicilio' : 'No en Domicilio', p.disponible_domicilio);
    tag(p.aplica_iva ? `Con IVA ${IVA} %` : 'Sin IVA', p.aplica_iva);

    const btn = head.querySelector('button');
    btn.setAttribute('aria-label', `Editar ${p.nombre}`);
    btn.addEventListener('click', () => abrirFormulario(p));
    head.querySelector('.cfg-pkg-actions').appendChild(CfgEliminar.boton(p.nombre, () => eliminarRegistro(p)));
    card.appendChild(head);

    // Precios por tipo de vehículo
    const precios = document.createElement('div');
    precios.className = 'cfg-pkg-prices';
    const filas = tiposVehiculo
        .map(t => ({ tipo: t, precio: p.precios.find(x => x.tipo_vehiculo_id === t.id) }))
        .filter(x => x.precio);

    if (filas.length === 0) {
        precios.innerHTML = '<p class="cfg-pkg-empty">Sin tipos de vehículo asignados.</p>';
    } else {
        filas.forEach(({ tipo, precio }) => {
            const base = Number(precio.precio);
            const item = document.createElement('div');
            item.className = 'cfg-price';
            item.innerHTML = '<span class="cfg-price-tipo"></span><span class="cfg-price-val"></span><span class="cfg-price-iva"></span>';
            item.querySelector('.cfg-price-tipo').textContent = tipo.nombre;
            item.querySelector('.cfg-price-val').textContent = formatoColones.format(conIva(base, p.aplica_iva));
            item.querySelector('.cfg-price-iva').textContent = p.aplica_iva ? `${formatoColones.format(base)} + IVA` : '';
            precios.appendChild(item);
        });
    }
    card.appendChild(precios);

    // Detalladores internos y aromatizantes
    card.appendChild(dibujarChipsPaquete('Detalladores internos:', detalladores, p.detalladores));
    card.appendChild(dibujarChipsPaquete('Aromatizantes:', aromatizantes, p.aromatizantes));

    return card;
}

/** Fila de etiquetas de la tarjeta (detalladores o aromatizantes asignados). */
function dibujarChipsPaquete(titulo, catalogo, idsAsignados) {
    const fila = document.createElement('div');
    fila.className = 'cfg-pkg-det';
    const lbl = document.createElement('span');
    lbl.className = 'cfg-pkg-det-label';
    lbl.textContent = titulo;
    fila.appendChild(lbl);

    const asignados = catalogo.filter(x => idsAsignados.includes(x.id));
    if (asignados.length === 0) {
        const s = document.createElement('span');
        s.className = 'cfg-pkg-empty';
        s.textContent = 'Ninguno';
        fila.appendChild(s);
    } else {
        asignados.forEach(x => {
            const s = document.createElement('span');
            s.className = 'cfg-chip';
            s.textContent = x.nombre + (x.activo === false ? ' (inactivo)' : '');
            fila.appendChild(s);
        });
    }
    return fila;
}

/* --------------------------------------------------------------------------
   Eliminar (con confirmación)
   -------------------------------------------------------------------------- */
async function eliminarRegistro(r) {
    const ok = await CfgEliminar.confirmar(r.nombre, 'Se borran también sus precios, detalladores y aromatizantes asignados. Las órdenes ya registradas no cambian.');
    if (!ok) return;
    const m = await CfgEliminar.eliminar('paquetes_detallado', r.id);
    if (m) {
        toast(m, 'error');
        return;
    }
    toast(`"${r.nombre}" eliminado.`);
    await cargarTodo();
}

/* --------------------------------------------------------------------------
   Formulario
   -------------------------------------------------------------------------- */
function dibujarVehiculosForm(paquete) {
    const cont = $('form-vehiculos');
    cont.innerHTML = '';

    if (tiposVehiculo.length === 0) {
        cont.innerHTML = '<p class="cfg-hint">No hay tipos de vehículo. Créalos primero en <a href="tipos-vehiculo.html">Configuración &gt; Tipos de vehículo</a>.</p>';
        return;
    }

    tiposVehiculo.forEach(t => {
        const actual = paquete ? paquete.precios.find(x => x.tipo_vehiculo_id === t.id) : null;
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
        if (check.checked && aplica && precio.value !== '') {
            total.textContent = `Con IVA: ${formatoColones.format(conIva(Number(precio.value), true))}`;
        } else {
            total.textContent = '';
        }
    });
}

/**
 * Etiquetas marcables del formulario (detalladores internos o aromatizantes).
 * Los inactivos solo salen si el paquete ya los tenía asignados, para poder quitarlos.
 */
function dibujarChipsForm(contId, catalogo, idsAsignados, vacio) {
    const cont = $(contId);
    cont.innerHTML = '';

    const visibles = catalogo.filter(x => x.activo !== false || idsAsignados.includes(x.id));
    if (visibles.length === 0) {
        cont.innerHTML = vacio;
        return;
    }

    visibles.forEach(x => {
        const label = document.createElement('label');
        label.className = 'cfg-chip-check';
        label.innerHTML = '<input type="checkbox"><span></span>';
        const input = label.querySelector('input');
        input.value = x.id;
        input.checked = idsAsignados.includes(x.id);
        const span = label.querySelector('span');
        span.textContent = x.nombre;
        if (x.activo === false) {
            const tag = document.createElement('small');
            tag.className = 'cfg-chip-inactivo';
            tag.textContent = '(inactivo)';
            span.appendChild(tag);
        }
        cont.appendChild(label);
    });
}

function abrirFormulario(paquete = null) {
    editandoId = paquete ? paquete.id : null;
    $('dialog-titulo').textContent = paquete ? 'Editar paquete' : 'Nuevo paquete';
    $('campo-nombre').value = paquete ? paquete.nombre : '';
    $('campo-local').checked = paquete ? !!paquete.disponible_local : true;
    $('campo-domicilio').checked = paquete ? !!paquete.disponible_domicilio : true;
    $('campo-iva').checked = paquete ? !!paquete.aplica_iva : false;
    $('form-error').textContent = '';

    dibujarVehiculosForm(paquete);
    dibujarChipsForm('form-detalladores', detalladores, paquete ? paquete.detalladores : [],
        '<p class="cfg-hint">No hay detalladores internos activos. Créalos en <a href="detalladores-internos.html">Configuración &gt; Detalladores internos</a>.</p>');
    dibujarChipsForm('form-aromatizantes', aromatizantes, paquete ? paquete.aromatizantes : [],
        '<p class="cfg-hint">No hay aromatizantes activos. Créalos en <a href="aromatizantes.html">Configuración &gt; Aromatizantes</a>.</p>');

    $('dialog-paquete').showModal();
    $('campo-nombre').focus();
}

function cerrarFormulario() {
    $('dialog-paquete').close();
}

async function guardar(e) {
    e.preventDefault();
    const errorEl = $('form-error');
    errorEl.textContent = '';

    const nombre = $('campo-nombre').value.trim().replace(/\s+/g, ' ');
    if (!nombre) {
        errorEl.textContent = 'Escribe el nombre del paquete.';
        $('campo-nombre').focus();
        return;
    }
    if (paquetes.some(p => p.id !== editandoId && p.nombre.toLowerCase() === nombre.toLowerCase())) {
        errorEl.textContent = 'Ya existe un paquete con ese nombre.';
        $('campo-nombre').focus();
        return;
    }

    // Vehículos marcados con su precio
    const precios = [];
    for (const fila of document.querySelectorAll('.cfg-veh-row')) {
        const check = fila.querySelector('input[type=checkbox]');
        if (!check.checked) continue;
        const input = fila.querySelector('input[type=number]');
        const valor = input.value.trim();
        const nombreTipo = fila.querySelector('.cfg-veh-name span').textContent;
        if (valor === '' || !Number.isFinite(Number(valor)) || Number(valor) < 0) {
            errorEl.textContent = `Escribe un precio válido para ${nombreTipo}.`;
            input.focus();
            return;
        }
        precios.push({ tipo_vehiculo_id: Number(fila.dataset.tipoId), precio: Number(valor) });
    }
    if (precios.length === 0) {
        errorEl.textContent = 'Marca al menos un tipo de vehículo y escribe su precio.';
        return;
    }

    const detalladoresSel = Array.from(document.querySelectorAll('#form-detalladores input:checked'))
        .map(i => Number(i.value));
    const aromatizantesSel = Array.from(document.querySelectorAll('#form-aromatizantes input:checked'))
        .map(i => Number(i.value));

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
        // 1. Paquete
        let paqueteId = editandoId;
        if (editandoId) {
            const { error } = await window.supabase.from('paquetes_detallado').update(datos).eq('id', editandoId);
            if (error) throw error;
        } else {
            const { data, error } = await window.supabase.from('paquetes_detallado').insert([datos]).select('id').single();
            if (error) throw error;
            paqueteId = data.id;
        }

        // 2. Precios: guardar los marcados y quitar los desmarcados
        const filasPrecio = precios.map(p => ({ paquete_id: paqueteId, ...p }));
        const { error: errUp } = await window.supabase
            .from('paquete_detallado_precios')
            .upsert(filasPrecio, { onConflict: 'paquete_id,tipo_vehiculo_id' });
        if (errUp) throw errUp;

        const idsTipos = precios.map(p => p.tipo_vehiculo_id);
        const { error: errDelP } = await window.supabase
            .from('paquete_detallado_precios')
            .delete()
            .eq('paquete_id', paqueteId)
            .not('tipo_vehiculo_id', 'in', `(${idsTipos.join(',')})`);
        if (errDelP) throw errDelP;

        // 3. Detalladores internos: quitar todos y volver a poner los marcados
        const { error: errDelD } = await window.supabase
            .from('paquete_detallado_detalladores')
            .delete()
            .eq('paquete_id', paqueteId);
        if (errDelD) throw errDelD;

        if (detalladoresSel.length) {
            const { error: errInsD } = await window.supabase
                .from('paquete_detallado_detalladores')
                .insert(detalladoresSel.map(id => ({ paquete_id: paqueteId, detallador_id: id })));
            if (errInsD) throw errInsD;
        }

        // 4. Aromatizantes: quitar todos y volver a poner los marcados
        const { error: errDelA } = await window.supabase
            .from('paquete_detallado_aromatizantes')
            .delete()
            .eq('paquete_id', paqueteId);
        if (errDelA) throw errDelA;

        if (aromatizantesSel.length) {
            const { error: errInsA } = await window.supabase
                .from('paquete_detallado_aromatizantes')
                .insert(aromatizantesSel.map(id => ({ paquete_id: paqueteId, aromatizante_id: id })));
            if (errInsA) throw errInsA;
        }

        toast(editandoId ? `"${nombre}" actualizado.` : `"${nombre}" creado.`);
        cerrarFormulario();
        await cargarTodo();
    } catch (err) {
        console.error('[Paquetes] Error al guardar:', err);
        const m = mensajeError(err);
        errorEl.textContent = m === 'FALTA_TABLA'
            ? 'Faltan las tablas de paquetes (supabase/paquetes_detallado.sql).'
            : m;
        // Si el paquete se creó pero falló lo demás, recargar para no duplicarlo al reintentar
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
    $('btn-nuevo').addEventListener('click', () => abrirFormulario());
    $('btn-cerrar').addEventListener('click', cerrarFormulario);
    $('btn-cancelar').addEventListener('click', cerrarFormulario);
    $('form-paquete').addEventListener('submit', guardar);
    $('campo-iva').addEventListener('change', actualizarTotales);

    $('dialog-paquete').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarFormulario();
    });

    cargarTodo();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
