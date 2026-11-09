/**
 * Configuración > catálogos simples (Detalladores internos, Aromatizantes).
 * Crear y editar (set) registros con: nombre, activo, disponible_local, disponible_domicilio.
 * En qué paquetes sale cada uno se escoge desde Paquetes de detallado.
 *
 * Cada página define antes de cargar este archivo:
 *   window.CATALOGO = {
 *     tabla:     'aromatizantes',            // tabla de Supabase
 *     singular:  'aromatizante',             // para los mensajes
 *     icono:     'fa-wind',                  // icono del estado vacío
 *     ejemplos:  'Limón, Frutos rojos'       // texto del estado vacío
 *     sql:       'supabase/paquetes_detallado.sql',  // archivo que crea la tabla
 *     opcionesExtra: [ { campo, titulo, si, no, etiqueta, defecto } ]  // sí/no adicionales (opcional)
 *     precio:    { etiqueta: 'Precio aproximado' }  // agrega columna 'precio' (opcional)
 *     sinModulos: true   // sin Local / Domicilio: solo nombre y activo (opcional)
 *     mayusculas: true   // guarda el nombre en MAYÚSCULAS, p. ej. marcas (opcional)
 *     femenino:   true   // textos en femenino: "Nueva marca", "eliminada" (opcional)
 *   };
 * Tablas: según CATALOGO.sql
 */

const CAT = window.CATALOGO;

// Género del nombre del catálogo (CATALOGO.femenino = true para "marca")
const G = CAT.femenino
    ? { un: 'una', del: 'de la', nuevo: 'Nueva', o: (raiz) => raiz + 'a' }
    : { un: 'un', del: 'del', nuevo: 'Nuevo', o: (raiz) => raiz + 'o' };

// Columnas de sí/no que se pueden cambiar directo desde la lista
const SQL = CAT.sql || 'supabase/paquetes_detallado.sql';
const OPCIONES = [
    { campo: 'activo', titulo: 'Activo', si: 'activado', no: 'desactivado' },
    // Local / Domicilio (no aplica a catálogos como Marcas: CATALOGO.sinModulos)
    ...(CAT.sinModulos ? [] : [
        { campo: 'disponible_local', titulo: 'Local', si: 'disponible en Local', no: 'no disponible en Local' },
        { campo: 'disponible_domicilio', titulo: 'Domicilio', si: 'disponible en Domicilio', no: 'no disponible en Domicilio' }
    ]),
    ...(CAT.opcionesExtra || [])
];

const formatoColones = new Intl.NumberFormat('es-CR', {
    style: 'currency', currency: 'CRC', maximumFractionDigits: 0
});

let registros = [];
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
    if (code === '42P01' || code === 'PGRST205' || code === '42703' || code === 'PGRST204'
        || msg.includes('could not find') || msg.includes('does not exist')) {
        return 'FALTA_TABLA';
    }
    if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
        return `Sin permiso para guardar. Vuelve a ejecutar ${SQL} en Supabase.`;
    }
    if (code === '23505') return `Ya existe ${G.un} ${CAT.singular} con ese nombre.`;
    if (code === '23514') return `Escribe el nombre ${G.del} ${CAT.singular}.`;
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/* --------------------------------------------------------------------------
   Cargar y dibujar la lista
   -------------------------------------------------------------------------- */
async function cargar() {
    try {
        const { data, error } = await window.supabase
            .from(CAT.tabla)
            .select(['id', 'nombre', ...(CAT.precio ? ['precio'] : []), ...OPCIONES.map(o => o.campo)].join(', '))
            .order('nombre', { ascending: true });
        if (error) throw error;
        registros = data || [];
        dibujarLista();
    } catch (err) {
        console.error(`[${CAT.tabla}] Error al cargar:`, err);
        const m = mensajeError(err);
        const lista = $('lista');
        if (m === 'FALTA_TABLA') {
            lista.innerHTML = `
                <div class="cfg-state is-error">
                    <i class="fa-solid fa-database" aria-hidden="true"></i>
                    <strong>Falta crear o actualizar la tabla en Supabase.</strong><br>
                    Ejecuta <code>${SQL}</code> en Supabase (SQL Editor) y recarga la página.
                </div>`;
            $('btn-nuevo').disabled = true;
        } else {
            lista.innerHTML = '<div class="cfg-state is-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span></span></div>';
            lista.querySelector('span').textContent = m + ' Recarga la página.';
        }
    }
}

function dibujarLista() {
    const lista = $('lista');

    if (registros.length === 0) {
        lista.innerHTML = `
            <div class="cfg-state">
                <i class="fa-solid ${CAT.icono}" aria-hidden="true"></i>
                <strong></strong><br>
                Presiona <strong>${G.nuevo}</strong> para crear ${CAT.femenino ? "la primera" : "el primero"} (por ejemplo: <span></span>).
            </div>`;
        lista.querySelector('strong').textContent = `Aún no hay ${CAT.plural}.`;
        lista.querySelector('span').textContent = CAT.ejemplos;
        return;
    }

    const table = document.createElement('table');
    table.className = 'cfg-table cfg-table-head';
    table.innerHTML = `
        <thead>
            <tr>
                <th scope="col">Nombre</th>
                ${CAT.precio ? `<th scope="col" class="col-precio">${CAT.precio.etiqueta}</th>` : ''}
                ${OPCIONES.map(o => `<th scope="col" class="col-estado">${o.titulo}</th>`).join('')}
                <th scope="col" class="col-acciones"><span class="sr-only">Acciones</span></th>
            </tr>
        </thead>`;
    const tbody = document.createElement('tbody');

    registros.forEach(r => {
        const tr = document.createElement('tr');
        if (!r.activo) tr.className = 'is-inactive';

        const tdNombre = document.createElement('td');
        tdNombre.innerHTML = '<span class="cfg-nombre"></span>';
        tdNombre.firstChild.textContent = r.nombre;
        tr.appendChild(tdNombre);

        if (CAT.precio) {
            const tdPrecio = document.createElement('td');
            tdPrecio.className = 'col-precio';
            tdPrecio.textContent = r.precio === null || r.precio === undefined
                ? '—'
                : formatoColones.format(Number(r.precio));
            tr.appendChild(tdPrecio);
        }

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
            input.checked = !!r[o.campo];
            input.setAttribute('aria-label', `${r.nombre}: ${o.titulo}`);
            input.addEventListener('change', () => cambiarOpcion(r, o, input, tr));
            tr.appendChild(td);
        });

        const tdAcc = document.createElement('td');
        tdAcc.className = 'col-acciones';
        tdAcc.innerHTML = '<button type="button" class="cfg-icon-btn" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>';
        const btn = tdAcc.querySelector('button');
        btn.setAttribute('aria-label', `Editar ${r.nombre}`);
        btn.addEventListener('click', () => abrirFormulario(r));
        tdAcc.appendChild(CfgEliminar.boton(r.nombre, () => eliminarRegistro(r)));
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    lista.replaceChildren(table);
}

/* --------------------------------------------------------------------------
   Cambiar un sí/no directo desde la lista
   -------------------------------------------------------------------------- */
async function cambiarOpcion(registro, opcion, input, tr) {
    const nuevo = input.checked;
    input.disabled = true;
    try {
        const { error } = await window.supabase
            .from(CAT.tabla)
            .update({ [opcion.campo]: nuevo })
            .eq('id', registro.id);
        if (error) throw error;
        registro[opcion.campo] = nuevo;
        if (opcion.campo === 'activo') tr.classList.toggle('is-inactive', !nuevo);
        toast(`${registro.nombre}: ${nuevo ? opcion.si : opcion.no}.`);
    } catch (err) {
        console.error(`[${CAT.tabla}] Error al actualizar:`, err);
        input.checked = !nuevo;
        const m = mensajeError(err);
        toast(m === 'FALTA_TABLA' ? `Falta actualizar la tabla (${SQL}).` : m, 'error');
    } finally {
        input.disabled = false;
    }
}

/* --------------------------------------------------------------------------
   Eliminar (con confirmación)
   -------------------------------------------------------------------------- */
async function eliminarRegistro(r) {
    const ok = await CfgEliminar.confirmar(r.nombre, CAT.avisoEliminar);
    if (!ok) return;
    const m = await CfgEliminar.eliminar(CAT.tabla, r.id);
    if (m) {
        toast(m, 'error');
        return;
    }
    toast(`"${r.nombre}" ${G.o("eliminad")}.`);
    await cargar();
}

/* --------------------------------------------------------------------------
   Formulario crear / editar
   -------------------------------------------------------------------------- */
function abrirFormulario(registro = null) {
    editandoId = registro ? registro.id : null;
    $('dialog-titulo').textContent = registro ? `Editar ${CAT.singular}` : `${G.nuevo} ${CAT.singular}`;
    $('campo-nombre').value = registro ? registro.nombre : '';
    $('campo-activo').checked = registro ? !!registro.activo : true;
    if (!CAT.sinModulos) {
        $('campo-local').checked = registro ? !!registro.disponible_local : true;
        $('campo-domicilio').checked = registro ? !!registro.disponible_domicilio : true;
    }
    if (CAT.precio) {
        $('campo-precio').value = registro && registro.precio !== null && registro.precio !== undefined
            ? Number(registro.precio) : '';
    }
    (CAT.opcionesExtra || []).forEach(o => {
        $('campo-' + o.campo).checked = registro ? !!registro[o.campo] : !!o.defecto;
    });
    $('form-error').textContent = '';

    $('dialog-registro').showModal();
    $('campo-nombre').focus();
}

function cerrarFormulario() {
    $('dialog-registro').close();
}

async function guardar(e) {
    e.preventDefault();
    const errorEl = $('form-error');
    errorEl.textContent = '';

    let nombre = $('campo-nombre').value.trim().replace(/\s+/g, ' ');
    if (CAT.mayusculas) nombre = nombre.toUpperCase();
    if (!nombre) {
        errorEl.textContent = `Escribe el nombre ${G.del} ${CAT.singular}.`;
        $('campo-nombre').focus();
        return;
    }
    if (CAT.reservados && CAT.reservados.includes(nombre.toLowerCase())) {
        errorEl.textContent = `"${nombre}" ya sale siempre como opción fija; no hace falta crearlo.`;
        $('campo-nombre').focus();
        return;
    }
    if (registros.some(r => r.id !== editandoId && r.nombre.toLowerCase() === nombre.toLowerCase())) {
        errorEl.textContent = `Ya existe ${G.un} ${CAT.singular} con ese nombre.`;
        $('campo-nombre').focus();
        return;
    }

    // Precio aproximado (opcional, sin decimales)
    let precio = null;
    if (CAT.precio) {
        const valor = $('campo-precio').value.trim();
        if (valor !== '') {
            precio = Number(valor);
            if (!Number.isFinite(precio) || precio < 0) {
                errorEl.textContent = 'Escribe un precio válido (0 o más), o déjalo vacío.';
                $('campo-precio').focus();
                return;
            }
            precio = Math.round(precio);
        }
    }

    const datos = {
        nombre,
        activo: $('campo-activo').checked
    };
    if (!CAT.sinModulos) {
        datos.disponible_local = $('campo-local').checked;
        datos.disponible_domicilio = $('campo-domicilio').checked;
    }
    (CAT.opcionesExtra || []).forEach(o => { datos[o.campo] = $('campo-' + o.campo).checked; });
    if (CAT.precio) datos.precio = precio;

    const btn = $('btn-guardar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando…';

    try {
        let error;
        if (editandoId) {
            ({ error } = await window.supabase.from(CAT.tabla).update(datos).eq('id', editandoId));
        } else {
            ({ error } = await window.supabase.from(CAT.tabla).insert([datos]));
        }
        if (error) throw error;

        toast(editandoId ? `"${nombre}" ${G.o("actualizad")}.` : `"${nombre}" ${G.o("cread")}.`);
        cerrarFormulario();
        await cargar();
    } catch (err) {
        console.error(`[${CAT.tabla}] Error al guardar:`, err);
        const m = mensajeError(err);
        errorEl.textContent = m === 'FALTA_TABLA'
            ? `Falta crear o actualizar la tabla (${SQL}).`
            : m;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Guardar';
    }
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
/** Casillas del formulario para los sí/no adicionales del catálogo. */
function crearCamposExtra() {
    const antesDe = $('form-error');

    // Precio aproximado, debajo del nombre
    if (CAT.precio) {
        const campo = document.createElement('div');
        campo.className = 'cfg-field';
        campo.innerHTML = `
            <label for="campo-precio"></label>
            <div class="cfg-money">
                <span aria-hidden="true">₡</span>
                <input type="number" class="cfg-input" id="campo-precio" min="0" step="1" inputmode="numeric" placeholder="Ej.: 5000">
            </div>
            <p class="cfg-hint">Opcional. Es una referencia que se muestra al vender.</p>`;
        campo.querySelector('label').textContent = CAT.precio.etiqueta;
        const nombre = $('campo-nombre').closest('.cfg-field');
        nombre.parentNode.insertBefore(campo, nombre.nextSibling);
    }

    (CAT.opcionesExtra || []).forEach(o => {
        const label = document.createElement('label');
        label.className = 'cfg-check';
        label.innerHTML = '<input type="checkbox"> <span></span>';
        label.querySelector('input').id = 'campo-' + o.campo;
        label.querySelector('span').textContent = o.etiqueta;
        antesDe.parentNode.insertBefore(label, antesDe);
    });
}

function iniciar() {
    crearCamposExtra();
    $('btn-nuevo').addEventListener('click', () => abrirFormulario());
    $('btn-cerrar').addEventListener('click', cerrarFormulario);
    $('btn-cancelar').addEventListener('click', cerrarFormulario);
    $('form-registro').addEventListener('submit', guardar);
    $('dialog-registro').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarFormulario();
    });
    cargar();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
