/**
 * Configuración > Tipos de vehículo
 * Crear y editar (set) tipos de vehículo en la tabla 'tipos_vehiculo' de Supabase.
 * Campos: nombre, tiene_interior, disponible_local, disponible_domicilio.
 * La tabla se crea con supabase/tipos_vehiculo.sql.
 */

// Columnas de sí/no que se pueden cambiar directo desde la lista
const OPCIONES = [
    { campo: 'tiene_interior', titulo: 'Interior', texto: 'tiene interior' },
    { campo: 'disponible_local', titulo: 'Local', texto: 'disponible en Local' },
    { campo: 'disponible_domicilio', titulo: 'Domicilio', texto: 'disponible en Domicilio' }
];

let tipos = [];          // tipos cargados
let editandoId = null;   // id en edición (null = nuevo)

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

/** Mensaje en español para los errores de Supabase. */
function mensajeError(err) {
    const code = (err && err.code) || '';
    const msg = ((err && err.message) || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || msg.includes('could not find the table') || msg.includes('does not exist')) {
        return 'FALTA_TABLA';
    }
    if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
        return 'Sin permiso para guardar. Ejecuta supabase/permisos_configuracion.sql en Supabase.';
    }
    if (code === '23505') return 'Ya existe un tipo de vehículo con ese nombre.';
    if (code === '23514') return 'Escribe el nombre del tipo de vehículo.';
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/* --------------------------------------------------------------------------
   Cargar y dibujar la lista
   -------------------------------------------------------------------------- */
async function cargarTipos() {
    try {
        const { data, error } = await window.supabase
            .from('tipos_vehiculo')
            .select('id, nombre, tiene_interior, disponible_local, disponible_domicilio')
            .order('nombre', { ascending: true });

        if (error) throw error;
        tipos = data || [];
        dibujarLista();
    } catch (err) {
        console.error('[Tipos de vehículo] Error al cargar:', err);
        const m = mensajeError(err);
        const lista = $('lista-tipos');
        if (m === 'FALTA_TABLA') {
            lista.innerHTML = `
                <div class="cfg-state is-error">
                    <i class="fa-solid fa-database" aria-hidden="true"></i>
                    <strong>Falta crear la tabla de tipos de vehículo.</strong><br>
                    Ejecuta el archivo <code>supabase/tipos_vehiculo.sql</code> en Supabase (SQL Editor) y recarga la página.
                </div>`;
            $('btn-nuevo').disabled = true;
        } else {
            lista.innerHTML = '<div class="cfg-state is-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span></span></div>';
            lista.querySelector('span').textContent = m + ' Recarga la página.';
        }
    }
}

function dibujarLista() {
    const lista = $('lista-tipos');

    if (tipos.length === 0) {
        lista.innerHTML = `
            <div class="cfg-state">
                <i class="fa-solid fa-car-side" aria-hidden="true"></i>
                <strong>Aún no hay tipos de vehículo.</strong><br>
                Presiona <strong>Nuevo tipo</strong> para crear el primero (por ejemplo: SUV, Sedán).
            </div>`;
        return;
    }

    const table = document.createElement('table');
    table.className = 'cfg-table cfg-table-head';
    table.innerHTML = `
        <thead>
            <tr>
                <th scope="col">Tipo de vehículo</th>
                ${OPCIONES.map(o => `<th scope="col" class="col-estado">${o.titulo}</th>`).join('')}
                <th scope="col" class="col-acciones"><span class="sr-only">Acciones</span></th>
            </tr>
        </thead>`;
    const tbody = document.createElement('tbody');

    tipos.forEach(t => {
        const tr = document.createElement('tr');

        const tdNombre = document.createElement('td');
        tdNombre.innerHTML = '<span class="cfg-nombre"></span>';
        tdNombre.firstChild.textContent = t.nombre;
        tr.appendChild(tdNombre);

        // Interruptores sí/no: se guardan al instante
        OPCIONES.forEach(o => {
            const td = document.createElement('td');
            td.className = 'col-estado';
            td.innerHTML = `
                <label class="cfg-switch">
                    <input type="checkbox">
                    <span class="cfg-switch-track" aria-hidden="true"></span>
                </label>`;
            const input = td.querySelector('input');
            input.checked = !!t[o.campo];
            input.setAttribute('aria-label', `${t.nombre}: ${o.texto}`);
            input.addEventListener('change', () => cambiarOpcion(t, o, input));
            tr.appendChild(td);
        });

        const tdAcc = document.createElement('td');
        tdAcc.className = 'col-acciones';
        tdAcc.innerHTML = '<button type="button" class="cfg-icon-btn" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>';
        const btn = tdAcc.querySelector('button');
        btn.setAttribute('aria-label', `Editar ${t.nombre}`);
        btn.addEventListener('click', () => abrirFormulario(t));
        tdAcc.appendChild(CfgEliminar.boton(t.nombre, () => eliminarRegistro(t)));
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    lista.replaceChildren(table);
}

/* --------------------------------------------------------------------------
   Cambiar un sí/no directo desde la lista
   -------------------------------------------------------------------------- */
async function cambiarOpcion(tipo, opcion, input) {
    const nuevo = input.checked;
    input.disabled = true;
    try {
        const { error } = await window.supabase
            .from('tipos_vehiculo')
            .update({ [opcion.campo]: nuevo })
            .eq('id', tipo.id);
        if (error) throw error;
        tipo[opcion.campo] = nuevo;
        toast(`${tipo.nombre}: ${nuevo ? '' : 'no '}${opcion.texto}.`);
    } catch (err) {
        console.error('[Tipos de vehículo] Error al actualizar:', err);
        input.checked = !nuevo;
        const m = mensajeError(err);
        toast(m === 'FALTA_TABLA' ? 'Falta crear la tabla de tipos de vehículo.' : m, 'error');
    } finally {
        input.disabled = false;
    }
}

/* --------------------------------------------------------------------------
   Eliminar (con confirmación)
   -------------------------------------------------------------------------- */
async function eliminarRegistro(r) {
    const ok = await CfgEliminar.confirmar(r.nombre, 'Se quitará también de los paquetes de detallado (su precio para este tipo). Los vehículos y órdenes ya registrados no cambian.');
    if (!ok) return;
    const m = await CfgEliminar.eliminar('tipos_vehiculo', r.id);
    if (m) {
        toast(m, 'error');
        return;
    }
    toast(`"${r.nombre}" eliminado.`);
    await cargarTipos();
}

/* --------------------------------------------------------------------------
   Formulario crear / editar
   -------------------------------------------------------------------------- */
function abrirFormulario(tipo = null) {
    editandoId = tipo ? tipo.id : null;
    $('dialog-titulo').textContent = tipo ? 'Editar tipo de vehículo' : 'Nuevo tipo de vehículo';
    $('campo-nombre').value = tipo ? tipo.nombre : '';
    $('campo-interior').checked = tipo ? !!tipo.tiene_interior : true;
    $('campo-local').checked = tipo ? !!tipo.disponible_local : true;
    $('campo-domicilio').checked = tipo ? !!tipo.disponible_domicilio : true;
    $('form-error').textContent = '';

    $('dialog-tipo').showModal();
    $('campo-nombre').focus();
}

function cerrarFormulario() {
    $('dialog-tipo').close();
}

async function guardar(e) {
    e.preventDefault();
    const errorEl = $('form-error');
    errorEl.textContent = '';

    const nombre = $('campo-nombre').value.trim().replace(/\s+/g, ' ');
    if (!nombre) {
        errorEl.textContent = 'Escribe el nombre del tipo de vehículo.';
        $('campo-nombre').focus();
        return;
    }

    // Evitar duplicados antes de ir a la base de datos (la tabla también lo impide)
    if (tipos.some(t => t.id !== editandoId && t.nombre.toLowerCase() === nombre.toLowerCase())) {
        errorEl.textContent = 'Ya existe un tipo de vehículo con ese nombre.';
        $('campo-nombre').focus();
        return;
    }

    const datos = {
        nombre,
        tiene_interior: $('campo-interior').checked,
        disponible_local: $('campo-local').checked,
        disponible_domicilio: $('campo-domicilio').checked
    };

    const btn = $('btn-guardar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando…';

    try {
        let error;
        if (editandoId) {
            ({ error } = await window.supabase.from('tipos_vehiculo').update(datos).eq('id', editandoId));
        } else {
            ({ error } = await window.supabase.from('tipos_vehiculo').insert([datos]));
        }
        if (error) throw error;

        toast(editandoId ? `"${nombre}" actualizado.` : `"${nombre}" creado.`);
        cerrarFormulario();
        await cargarTipos();
    } catch (err) {
        console.error('[Tipos de vehículo] Error al guardar:', err);
        const m = mensajeError(err);
        errorEl.textContent = m === 'FALTA_TABLA'
            ? 'Falta crear la tabla de tipos de vehículo (supabase/tipos_vehiculo.sql).'
            : m;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Guardar';
    }
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
function iniciar() {
    $('btn-nuevo').addEventListener('click', () => abrirFormulario());
    $('btn-cerrar').addEventListener('click', cerrarFormulario);
    $('btn-cancelar').addEventListener('click', cerrarFormulario);
    $('form-tipo').addEventListener('submit', guardar);

    // Cerrar al hacer clic fuera del panel
    $('dialog-tipo').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarFormulario();
    });

    cargarTipos();
}

// Arranca cuando auth_guard.js confirma la sesión
if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
