/**
 * Configuración > Mecánica
 * Categorías (nombre, activa, pide detalle escrito) y sus servicios (nombre, categoría, activo).
 * Sin precios: el monto de mecánica se define al cobrar.
 * Tablas: supabase/mecanica_config.sql (Supabase principal).
 */

let categorias = [];      // [{id, nombre, activo, pide_detalle, orden, servicios:[]}]
let editandoCategoria = null;
let editandoServicio = null;

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

function mensajeError(err, duplicado) {
    const code = (err && err.code) || '';
    const msg = ((err && err.message) || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || code === '42703' || msg.includes('could not find') || msg.includes('does not exist')) {
        return 'FALTA_TABLA';
    }
    if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
        return 'Sin permiso para guardar. Ejecuta supabase/mecanica_config.sql en Supabase.';
    }
    if (code === '23505') return duplicado;
    if (code === '23514') return 'Escribe el nombre.';
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

const limpiar = (texto) => texto.trim().replace(/\s+/g, ' ');
const siguienteOrden = (lista) => lista.reduce((max, x) => Math.max(max, x.orden || 0), 0) + 10;

/* --------------------------------------------------------------------------
   Cargar
   -------------------------------------------------------------------------- */
async function cargarTodo() {
    try {
        const [rCat, rSrv] = await Promise.all([
            window.supabase.from('mecanica_categorias')
                .select('id, nombre, activo, pide_detalle, orden')
                .order('orden', { ascending: true })
                .order('nombre', { ascending: true }),
            window.supabase.from('mecanica_servicios')
                .select('id, categoria_id, nombre, activo, orden')
                .order('orden', { ascending: true })
                .order('nombre', { ascending: true })
        ]);
        const error = rCat.error || rSrv.error;
        if (error) throw error;

        categorias = (rCat.data || []).map(c => ({
            ...c,
            servicios: (rSrv.data || []).filter(s => s.categoria_id === c.id)
        }));
        dibujarLista();
    } catch (err) {
        console.error('[Mecánica] Error al cargar:', err);
        const m = mensajeError(err, '');
        const lista = $('lista');
        if (m === 'FALTA_TABLA') {
            lista.innerHTML = `
                <div class="cfg-state is-error">
                    <i class="fa-solid fa-database" aria-hidden="true"></i>
                    <strong>Faltan las tablas de mecánica.</strong><br>
                    Ejecuta <code>supabase/mecanica_config.sql</code> en Supabase (SQL Editor) y recarga la página.
                </div>`;
            $('btn-nueva-categoria').disabled = true;
        } else {
            lista.innerHTML = '<div class="cfg-state is-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span></span></div>';
            lista.querySelector('span').textContent = m + ' Recarga la página.';
        }
    }
}

/* --------------------------------------------------------------------------
   Lista: una tarjeta por categoría con sus servicios
   -------------------------------------------------------------------------- */
function dibujarLista() {
    const lista = $('lista');
    if (categorias.length === 0) {
        lista.innerHTML = `
            <div class="cfg-state">
                <i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i>
                <strong>Aún no hay categorías de mecánica.</strong><br>
                Presiona <strong>Nueva categoría</strong> para crear la primera.
            </div>`;
        return;
    }
    lista.replaceChildren(...categorias.map(dibujarCategoria));
}

function interruptor(etiqueta, valor, alCambiar) {
    const label = document.createElement('label');
    label.className = 'cfg-switch';
    label.innerHTML = '<input type="checkbox"><span class="cfg-switch-track" aria-hidden="true"></span>';
    const input = label.querySelector('input');
    input.checked = !!valor;
    input.setAttribute('aria-label', etiqueta);
    input.addEventListener('change', () => alCambiar(input));
    return label;
}

function dibujarCategoria(c) {
    const card = document.createElement('article');
    card.className = 'cfg-pkg' + (c.activo ? '' : ' is-inactive');

    // Encabezado
    const head = document.createElement('div');
    head.className = 'cfg-pkg-head';
    head.innerHTML = `
        <div class="cfg-pkg-title">
            <h2></h2>
            <div class="cfg-tags"></div>
        </div>
        <div class="cfg-pkg-actions"></div>`;
    head.querySelector('h2').textContent = c.nombre;

    const tags = head.querySelector('.cfg-tags');
    const tag = (texto, on) => {
        const s = document.createElement('span');
        s.className = 'cfg-tag' + (on ? ' is-on' : '');
        s.textContent = texto;
        tags.appendChild(s);
    };
    tag(c.activo ? 'Activa' : 'Inactiva', c.activo);
    if (c.pide_detalle) tag('Pide detalle escrito', true);
    else if (c.servicios.length === 0) tag('Se marca y listo', true);
    else tag(`${c.servicios.length} servicio${c.servicios.length === 1 ? '' : 's'}`, true);

    const acciones = head.querySelector('.cfg-pkg-actions');
    acciones.appendChild(interruptor(`${c.nombre}: activa`, c.activo, (input) =>
        cambiar('mecanica_categorias', c, 'activo', input, c.nombre + (input.checked ? ': activada.' : ': desactivada.'))));
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'cfg-icon-btn';
    editar.title = 'Editar';
    editar.setAttribute('aria-label', `Editar ${c.nombre}`);
    editar.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    editar.addEventListener('click', () => abrirCategoria(c));
    acciones.appendChild(editar);
    acciones.appendChild(CfgEliminar.boton(c.nombre, () => eliminarCategoria(c)));
    card.appendChild(head);

    // Cuerpo: servicios o explicación
    const cuerpo = document.createElement('div');
    cuerpo.className = 'cfg-mec-body';

    if (c.pide_detalle) {
        cuerpo.innerHTML = '<p class="cfg-pkg-empty">Al vender se escribe el detalle; no usa lista de servicios.</p>';
    } else {
        if (c.servicios.length === 0) {
            cuerpo.innerHTML = '<p class="cfg-pkg-empty">Sin servicios: al vender se marca y listo.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.className = 'cfg-mec-list';
            c.servicios.forEach(s => ul.appendChild(dibujarServicio(s)));
            cuerpo.appendChild(ul);
        }
        const agregar = document.createElement('button');
        agregar.type = 'button';
        agregar.className = 'cfg-btn cfg-btn-ghost cfg-mec-add';
        agregar.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Agregar servicio';
        agregar.addEventListener('click', () => abrirServicio(null, c.id));
        cuerpo.appendChild(agregar);
    }
    card.appendChild(cuerpo);
    return card;
}

function dibujarServicio(s) {
    const li = document.createElement('li');
    li.className = 'cfg-mec-item' + (s.activo ? '' : ' is-inactive');
    li.innerHTML = '<span class="cfg-nombre"></span><div class="cfg-mec-item-actions"></div>';
    li.querySelector('.cfg-nombre').textContent = s.nombre;

    const acciones = li.querySelector('.cfg-mec-item-actions');
    acciones.appendChild(interruptor(`${s.nombre}: activo`, s.activo, (input) =>
        cambiar('mecanica_servicios', s, 'activo', input, s.nombre + (input.checked ? ': activado.' : ': desactivado.'))));
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'cfg-icon-btn';
    editar.title = 'Editar';
    editar.setAttribute('aria-label', `Editar ${s.nombre}`);
    editar.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    editar.addEventListener('click', () => abrirServicio(s));
    acciones.appendChild(editar);
    acciones.appendChild(CfgEliminar.boton(s.nombre, () => eliminarServicio(s)));
    return li;
}

/* --------------------------------------------------------------------------
   Cambiar activo directo desde la lista
   -------------------------------------------------------------------------- */
async function cambiar(tabla, registro, campo, input, mensajeOk) {
    const nuevo = input.checked;
    input.disabled = true;
    try {
        const { error } = await window.supabase.from(tabla).update({ [campo]: nuevo }).eq('id', registro.id);
        if (error) throw error;
        registro[campo] = nuevo;
        toast(mensajeOk);
        dibujarLista();
    } catch (err) {
        console.error('[Mecánica] Error al actualizar:', err);
        input.checked = !nuevo;
        const m = mensajeError(err, '');
        toast(m === 'FALTA_TABLA' ? 'Faltan las tablas (supabase/mecanica_config.sql).' : m, 'error');
    } finally {
        input.disabled = false;
    }
}

/* --------------------------------------------------------------------------
   Categoría: crear / editar / eliminar
   -------------------------------------------------------------------------- */
function abrirCategoria(c = null) {
    editandoCategoria = c;
    $('titulo-categoria').textContent = c ? 'Editar categoría' : 'Nueva categoría';
    $('cat-nombre').value = c ? c.nombre : '';
    $('cat-activo').checked = c ? !!c.activo : true;
    $('cat-detalle').checked = c ? !!c.pide_detalle : false;
    $('error-categoria').textContent = '';
    $('dialog-categoria').showModal();
    $('cat-nombre').focus();
}

async function guardarCategoria(e) {
    e.preventDefault();
    const errorEl = $('error-categoria');
    errorEl.textContent = '';
    const nombre = limpiar($('cat-nombre').value);
    const id = editandoCategoria ? editandoCategoria.id : null;

    if (!nombre) {
        errorEl.textContent = 'Escribe el nombre de la categoría.';
        $('cat-nombre').focus();
        return;
    }
    if (categorias.some(c => c.id !== id && c.nombre.toLowerCase() === nombre.toLowerCase())) {
        errorEl.textContent = 'Ya existe una categoría con ese nombre.';
        $('cat-nombre').focus();
        return;
    }

    const datos = { nombre, activo: $('cat-activo').checked, pide_detalle: $('cat-detalle').checked };
    if (!id) datos.orden = siguienteOrden(categorias);

    const btn = $('guardar-categoria');
    btn.disabled = true;
    try {
        const { error } = id
            ? await window.supabase.from('mecanica_categorias').update(datos).eq('id', id)
            : await window.supabase.from('mecanica_categorias').insert([datos]);
        if (error) throw error;
        toast(id ? `"${nombre}" actualizada.` : `"${nombre}" creada.`);
        $('dialog-categoria').close();
        await cargarTodo();
    } catch (err) {
        console.error('[Mecánica] Error al guardar categoría:', err);
        const m = mensajeError(err, 'Ya existe una categoría con ese nombre.');
        errorEl.textContent = m === 'FALTA_TABLA' ? 'Faltan las tablas (supabase/mecanica_config.sql).' : m;
    } finally {
        btn.disabled = false;
    }
}

async function eliminarCategoria(c) {
    const detalle = c.servicios.length
        ? `Se borran también sus ${c.servicios.length} servicio(s). Las órdenes ya registradas no cambian.`
        : 'Dejará de salir en Local Comercial. Las órdenes ya registradas no cambian.';
    if (!(await CfgEliminar.confirmar(c.nombre, detalle))) return;
    const m = await CfgEliminar.eliminar('mecanica_categorias', c.id);
    if (m) {
        toast(m, 'error');
        return;
    }
    toast(`"${c.nombre}" eliminada.`);
    await cargarTodo();
}

/* --------------------------------------------------------------------------
   Servicio: crear / editar / eliminar
   -------------------------------------------------------------------------- */
function abrirServicio(s = null, categoriaId = null) {
    editandoServicio = s;
    $('titulo-servicio').textContent = s ? 'Editar servicio' : 'Nuevo servicio';
    $('srv-nombre').value = s ? s.nombre : '';
    $('srv-activo').checked = s ? !!s.activo : true;
    $('error-servicio').textContent = '';

    // Solo categorías que usan lista de servicios
    const select = $('srv-categoria');
    select.innerHTML = '';
    categorias.filter(c => !c.pide_detalle).forEach(c => {
        const op = document.createElement('option');
        op.value = c.id;
        op.textContent = c.nombre + (c.activo ? '' : ' (inactiva)');
        select.appendChild(op);
    });
    select.value = String(s ? s.categoria_id : categoriaId);

    $('dialog-servicio').showModal();
    $('srv-nombre').focus();
}

async function guardarServicio(e) {
    e.preventDefault();
    const errorEl = $('error-servicio');
    errorEl.textContent = '';
    const nombre = limpiar($('srv-nombre').value);
    const categoriaId = Number($('srv-categoria').value);
    const id = editandoServicio ? editandoServicio.id : null;
    const categoria = categorias.find(c => c.id === categoriaId);

    if (!nombre) {
        errorEl.textContent = 'Escribe el nombre del servicio.';
        $('srv-nombre').focus();
        return;
    }
    if (!categoria) {
        errorEl.textContent = 'Elige la categoría.';
        return;
    }
    if (categoria.servicios.some(s => s.id !== id && s.nombre.toLowerCase() === nombre.toLowerCase())) {
        errorEl.textContent = 'Esa categoría ya tiene un servicio con ese nombre.';
        $('srv-nombre').focus();
        return;
    }

    const datos = { nombre, categoria_id: categoriaId, activo: $('srv-activo').checked };
    // Nuevo, o movido a otra categoría: va al final de la lista
    if (!id || editandoServicio.categoria_id !== categoriaId) datos.orden = siguienteOrden(categoria.servicios);

    const btn = $('guardar-servicio');
    btn.disabled = true;
    try {
        const { error } = id
            ? await window.supabase.from('mecanica_servicios').update(datos).eq('id', id)
            : await window.supabase.from('mecanica_servicios').insert([datos]);
        if (error) throw error;
        toast(id ? `"${nombre}" actualizado.` : `"${nombre}" creado.`);
        $('dialog-servicio').close();
        await cargarTodo();
    } catch (err) {
        console.error('[Mecánica] Error al guardar servicio:', err);
        const m = mensajeError(err, 'Esa categoría ya tiene un servicio con ese nombre.');
        errorEl.textContent = m === 'FALTA_TABLA' ? 'Faltan las tablas (supabase/mecanica_config.sql).' : m;
    } finally {
        btn.disabled = false;
    }
}

async function eliminarServicio(s) {
    if (!(await CfgEliminar.confirmar(s.nombre, 'Dejará de salir en Local Comercial. Las órdenes ya registradas no cambian.'))) return;
    const m = await CfgEliminar.eliminar('mecanica_servicios', s.id);
    if (m) {
        toast(m, 'error');
        return;
    }
    toast(`"${s.nombre}" eliminado.`);
    await cargarTodo();
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
function iniciar() {
    $('btn-nueva-categoria').addEventListener('click', () => abrirCategoria());
    $('form-categoria').addEventListener('submit', guardarCategoria);
    $('form-servicio').addEventListener('submit', guardarServicio);

    ['dialog-categoria', 'dialog-servicio'].forEach(id => {
        const d = $(id);
        d.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });

    cargarTodo();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
