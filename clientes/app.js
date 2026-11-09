/**
 * Datos de Clientes
 * - Resumen: totales, quién más ha gastado, últimas visitas y clientes con más
 *   de 3 meses sin venir.
 * - Lista con búsqueda (nombre, teléfono o placa), crear / editar.
 * - Ficha: datos, saldo de Cuenta por cobrar, HISTORIAL DE SERVICIOS (órdenes de
 *   Local y Domicilio) y vehículos (vincular / desvincular).
 * - Eliminar y desvincular: solo Dueño y Soporte TI.
 * - La última visita la actualiza la base de datos al crear una orden (supabase/ultima_visita.sql).
 * Todo el texto se inserta como texto (sin innerHTML con datos) para evitar inyecciones.
 */

const ZONA = 'America/Costa_Rica';
const DIAS_INACTIVO = 90;
const POR_PAGINA = 50;


const fmtNum = new Intl.NumberFormat('es-CR');
const fmtCRC = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });
const fmtFecha = new Intl.DateTimeFormat('es-CR', { timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric' });
const fmtRel = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

const $ = (id) => document.getElementById(id);

let clientes = [];                 // con vehículos vinculados
let vehiculos = [];                // para vincular
let resumenOrdenes = new Map();    // cliente_id -> { visitas, total, local, domicilio, ultima }
let pagina = 1;
let editandoId = null;
let fichaId = null;
let permisos = { eliminar: false, desvincular: false };

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
const aviso = (msg, tipo) => window.SaNotificar.aviso(msg, tipo);

function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
}

const clave = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[\s-]+/g, '').trim();

function diasDesde(fecha) {
    if (!fecha) return null;
    return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function textoRelativo(fecha) {
    const d = diasDesde(fecha);
    if (d == null) return '—';
    if (d < 1) return 'hoy';
    if (d < 30) return fmtRel.format(-d, 'day');
    if (d < 365) return fmtRel.format(-Math.round(d / 30), 'month');
    return fmtRel.format(-Math.round(d / 365), 'year');
}

/** Última visita: la de la base de datos, la de sus órdenes o la fecha de registro. */
function ultimaVisita(c) {
    const r = resumenOrdenes.get(c.id);
    const fechas = [c.ultima_visita, r && r.ultima, c.created_at].filter(Boolean).map(f => new Date(f).getTime());
    return fechas.length ? new Date(Math.max(...fechas)).toISOString() : null;
}

const esInactivo = (c) => {
    const d = diasDesde(ultimaVisita(c));
    return d != null && d > DIAS_INACTIVO;
};

const vehiculosDe = (c) => (c.cliente_vehiculo || []).map(cv => cv.vehiculos).filter(Boolean);

const aNumero = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

function mensajeError(err) {
    const msg = ((err && err.message) || '').toLowerCase();
    if (err && err.code === '23505') return 'Ya existe un cliente con ese número de teléfono.';
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    if ((err && err.code === '42501') || msg.includes('permission')) return 'No tienes permiso para esta acción.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function boton(icono, titulo, clase, accion) {
    const b = el('button', `veh-icon-btn ${clase || ''}`);
    b.type = 'button';
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    const i = el('i', `fa-solid ${icono}`);
    i.setAttribute('aria-hidden', 'true');
    b.appendChild(i);
    b.addEventListener('click', accion);
    return b;
}

/** Trae todas las filas de una consulta, de 1000 en 1000. */
async function todas(construir) {
    const filas = [];
    for (let desde = 0; desde < 100000; desde += 1000) {
        const { data, error } = await construir().range(desde, desde + 999);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return filas;
}

/* --------------------------------------------------------------------------
   Permisos: eliminar y desvincular solo Dueño y Soporte TI
   -------------------------------------------------------------------------- */
function calcularPermisos() {
    const S = window.AppSession;
    const roles = S.rolesDe(window.SaUser).map(r => S.normalizarRol(r));
    permisos.eliminar = window.AppSession.puedeEliminar();
    permisos.desvincular = permisos.eliminar;
}

/* --------------------------------------------------------------------------
   Cargar
   -------------------------------------------------------------------------- */
async function cargarTodo() {
    try {
        const [cli, ord, dom] = await Promise.all([
            todas(() => window.supabase
                .from('clientes')
                .select('id, nombre, telefono, ultima_visita, created_at, cliente_vehiculo ( vehiculos ( placa, marca, modelo ) )')
                .order('created_at', { ascending: false })),
            todas(() => window.supabase.from('ordenes').select('cliente_id, total_monto, created_at').not('cliente_id', 'is', null)),
            todas(() => window.supabase.from('ordenes_domicilio').select('cliente_id, total_monto, created_at').not('cliente_id', 'is', null))
                .catch(e => { console.warn('[Clientes] Sin órdenes a domicilio:', e); return []; })
        ]);

        // Resumen de órdenes por cliente
        resumenOrdenes = new Map();
        const sumar = (o, origen) => {
            const r = resumenOrdenes.get(o.cliente_id) || { visitas: 0, total: 0, local: 0, domicilio: 0, ultima: null };
            r.visitas++;
            r.total += aNumero(o.total_monto);
            r[origen]++;
            if (o.created_at && (!r.ultima || new Date(o.created_at) > new Date(r.ultima))) r.ultima = o.created_at;
            resumenOrdenes.set(o.cliente_id, r);
        };
        ord.forEach(o => sumar(o, 'local'));
        dom.forEach(o => sumar(o, 'domicilio'));

        clientes = cli;

        // Aviso si la última visita aún no la registra la base de datos
        const sinRegistro = clientes.length > 0 && clientes.every(c => !c.ultima_visita);
        const avisoSql = $('aviso-sql');
        avisoSql.hidden = !sinRegistro;
        avisoSql.textContent = sinRegistro
            ? 'La última visita aún no se registra en la base de datos: ejecuta supabase/ultima_visita.sql en Supabase. Mientras tanto se calcula con las órdenes y la fecha de registro.'
            : '';

        pintarResumen();
        pintarTabla();
    } catch (err) {
        console.error('[Clientes] Error al cargar:', err);
        aviso('No se pudieron cargar los clientes. ' + mensajeError(err), 'error');
        const tr = el('tr');
        const td = el('td', 'veh-vacio', 'No se pudieron cargar los clientes. Recarga la página.');
        td.colSpan = 7;
        tr.appendChild(td);
        $('tabla-clientes').replaceChildren(tr);
    }
}

async function cargarVehiculos() {
    try {
        vehiculos = await todas(() => window.supabase.from('vehiculos').select('placa, marca, modelo').order('placa'));
    } catch (e) {
        console.warn('[Clientes] No se pudieron cargar los vehículos:', e);
    }
}

/* --------------------------------------------------------------------------
   Resumen
   -------------------------------------------------------------------------- */
function pintarResumen() {
    const mes = (f) => f ? new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(f)).slice(0, 7) : '';
    const hoyMes = mes(new Date());

    const nuevos = clientes.filter(c => { const d = diasDesde(c.created_at); return d != null && d <= 30; }).length;
    const delMes = clientes.filter(c => mes(ultimaVisita(c)) === hoyMes).length;
    const inactivos = clientes.filter(esInactivo);

    $('kpi-total').textContent = fmtNum.format(clientes.length);
    $('kpi-nuevos').textContent = fmtNum.format(nuevos);
    $('kpi-mes').textContent = fmtNum.format(delMes);
    $('kpi-inactivos').textContent = fmtNum.format(inactivos.length);

    pintarBarrasGasto();

    const ultimos = clientes.slice().sort((a, b) => new Date(ultimaVisita(b)) - new Date(ultimaVisita(a))).slice(0, 6);
    pintarMiniLista('lista-ultimos', ultimos, 'Aún no hay clientes.');
    const viejos = inactivos.slice().sort((a, b) => new Date(ultimaVisita(a)) - new Date(ultimaVisita(b))).slice(0, 6);
    pintarMiniLista('lista-inactivos', viejos, 'Todos los clientes vinieron en los últimos 3 meses.');
}

function pintarBarrasGasto() {
    const cont = $('grafico-gasto');
    cont.replaceChildren();
    const top = clientes
        .map(c => ({ c, r: resumenOrdenes.get(c.id) }))
        .filter(x => x.r && x.r.total > 0)
        .sort((a, b) => b.r.total - a.r.total)
        .slice(0, 8);
    if (!top.length) {
        cont.appendChild(el('p', 'veh-vacio', 'Aún no hay órdenes registradas en el sistema.'));
        return;
    }
    const max = top[0].r.total;
    top.forEach(({ c, r }) => {
        const fila = el('button', 'veh-bar cli-bar-btn');
        fila.type = 'button';
        fila.title = `${c.nombre}: ${fmtCRC.format(r.total)} en ${r.visitas} visita${r.visitas === 1 ? '' : 's'}`;
        fila.appendChild(el('span', 'veh-bar-label', c.nombre));
        const pista = el('div', 'veh-bar-track');
        const relleno = el('div', 'veh-bar-fill');
        relleno.style.width = `${(r.total / max) * 100}%`;
        pista.appendChild(relleno);
        fila.appendChild(pista);
        fila.appendChild(el('span', 'veh-bar-valor cli-bar-monto', fmtCRC.format(r.total)));
        fila.addEventListener('click', () => abrirFicha(c.id));
        cont.appendChild(fila);
    });
}

function pintarMiniLista(id, lista, vacio) {
    const ul = $(id);
    ul.replaceChildren();
    if (!lista.length) {
        ul.appendChild(el('li', 'veh-vacio', vacio));
        return;
    }
    lista.forEach(c => {
        const li = el('li');
        const btn = el('button', 'veh-mini-item');
        btn.type = 'button';
        btn.appendChild(el('span', 'cli-mini-nombre', c.nombre));
        btn.appendChild(el('span', 'veh-mini-nombre', c.telefono || ''));
        const fecha = ultimaVisita(c);
        const cuando = el('span', 'veh-mini-fecha', textoRelativo(fecha));
        if (fecha) cuando.title = fmtFecha.format(new Date(fecha));
        btn.appendChild(cuando);
        btn.addEventListener('click', () => abrirFicha(c.id));
        li.appendChild(btn);
        ul.appendChild(li);
    });
}

/* --------------------------------------------------------------------------
   Tabla
   -------------------------------------------------------------------------- */
function filtrados() {
    const q = clave($('buscar').value);
    const soloInactivos = $('filtro-inactivos').checked;
    return clientes.filter(c => {
        if (soloInactivos && !esInactivo(c)) return false;
        if (!q) return true;
        const texto = clave([c.nombre, c.telefono, ...vehiculosDe(c).map(v => `${v.placa} ${v.marca} ${v.modelo}`)].join(' '));
        return texto.includes(q);
    });
}

function pintarTabla() {
    const tbody = $('tabla-clientes');
    tbody.replaceChildren();
    const lista = filtrados();
    const visibles = lista.slice(0, pagina * POR_PAGINA);

    if (!lista.length) {
        const tr = el('tr');
        const td = el('td', 'veh-vacio', clientes.length ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes registrados.');
        td.colSpan = 7;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    visibles.forEach(c => {
        const tr = el('tr');
        const r = resumenOrdenes.get(c.id);

        tr.appendChild(el('td', 'veh-col-nombre', c.nombre));
        tr.appendChild(el('td', 'veh-col-sec', c.telefono || '—'));

        const vehs = vehiculosDe(c);
        const tdV = el('td', 'veh-col-sec');
        if (!vehs.length) tdV.appendChild(el('span', 'veh-tenue', 'Sin vehículos'));
        else {
            tdV.appendChild(el('span', 'veh-placa', vehs[0].placa));
            if (vehs.length > 1) tdV.appendChild(el('span', 'veh-mas-chip', `+${vehs.length - 1}`));
        }
        tr.appendChild(tdV);

        tr.appendChild(el('td', 'veh-col-sec num', r ? fmtNum.format(r.visitas) : '0'));
        tr.appendChild(el('td', 'veh-col-sec num', r ? fmtCRC.format(r.total) : '—'));

        const fecha = ultimaVisita(c);
        const tdU = el('td', 'veh-col-sec' + (esInactivo(c) ? ' is-inactivo' : ''), textoRelativo(fecha));
        if (fecha) tdU.title = fmtFecha.format(new Date(fecha));
        tr.appendChild(tdU);

        const tdAcc = el('td', 'col-acciones');
        const acc = el('div', 'veh-acciones');
        acc.appendChild(boton('fa-id-card', `Ver ficha de ${c.nombre}`, '', () => abrirFicha(c.id)));
        acc.appendChild(boton('fa-pen', `Editar ${c.nombre}`, '', () => abrirFormulario(c.id)));
        if (permisos.eliminar) acc.appendChild(boton('fa-trash-can', `Eliminar ${c.nombre}`, 'is-peligro', () => eliminarCliente(c.id)));
        tdAcc.appendChild(acc);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
    });

    $('contador').textContent = lista.length
        ? `Mostrando ${fmtNum.format(visibles.length)} de ${fmtNum.format(lista.length)} clientes`
        : '';
    $('btn-mas').hidden = visibles.length >= lista.length;
}

/* --------------------------------------------------------------------------
   Formulario crear / editar
   -------------------------------------------------------------------------- */
function abrirFormulario(id = null) {
    editandoId = id;
    const c = id ? clientes.find(x => x.id === id) : null;
    $('form-titulo').textContent = c ? `Editar ${c.nombre}` : 'Nuevo cliente';
    $('campo-nombre').value = c ? c.nombre : '';
    $('campo-telefono').value = c ? (c.telefono || '') : '';
    $('form-error').textContent = '';
    $('dialog-cliente').showModal();
    $('campo-nombre').focus();
}

async function guardarCliente(e) {
    e.preventDefault();
    const error = $('form-error');
    error.textContent = '';
    const nombre = $('campo-nombre').value.trim().replace(/\s+/g, ' ');
    const telefono = $('campo-telefono').value.replace(/[\s-]/g, '');

    if (!nombre) { error.textContent = 'Escribe el nombre.'; $('campo-nombre').focus(); return; }
    if (!/^\+?\d{8,15}$/.test(telefono)) { error.textContent = 'El teléfono debe tener al menos 8 dígitos (solo números).'; $('campo-telefono').focus(); return; }
    if (clientes.some(c => c.id !== editandoId && (c.telefono || '').replace(/[\s-]/g, '') === telefono)) {
        error.textContent = 'Ya existe un cliente con ese número de teléfono.';
        $('campo-telefono').focus();
        return;
    }

    const btn = $('btn-guardar');
    btn.disabled = true;
    try {
        if (editandoId) {
            const { error: err } = await window.supabase.from('clientes').update({ nombre, telefono }).eq('id', editandoId);
            if (err) throw err;
            aviso(`${nombre} actualizado.`, 'exito');
        } else {
            const { error: err } = await window.supabase.from('clientes').insert([{ nombre, telefono }]);
            if (err) throw err;
            aviso(`${nombre} registrado.`, 'exito');
        }
        $('dialog-cliente').close();
        await cargarTodo();
    } catch (err) {
        console.error('[Clientes] Error al guardar:', err);
        error.textContent = mensajeError(err);
    } finally {
        btn.disabled = false;
    }
}

/* --------------------------------------------------------------------------
   Ficha: datos, saldo CxC, historial y vehículos
   -------------------------------------------------------------------------- */
function dato(contenedor, etiqueta, valor, clase) {
    const div = el('div', 'veh-dato' + (clase ? ' ' + clase : ''));
    div.appendChild(el('span', null, etiqueta));
    const s = el('strong', null, valor);
    div.appendChild(s);
    contenedor.appendChild(div);
    return s;
}

function abrirFicha(id) {
    const c = clientes.find(x => x.id === id);
    if (!c) return;
    fichaId = id;
    $('ficha-nombre').textContent = c.nombre;
    $('ficha-telefono').textContent = c.telefono || 'Sin teléfono';

    const datos = $('ficha-datos');
    datos.replaceChildren();
    const r = resumenOrdenes.get(c.id);
    const fecha = ultimaVisita(c);
    dato(datos, 'Visitas', r ? fmtNum.format(r.visitas) : '0');
    dato(datos, 'Total gastado', r ? fmtCRC.format(r.total) : '₡0');
    dato(datos, 'Ticket promedio', r && r.visitas ? fmtCRC.format(r.total / r.visitas) : '—');
    dato(datos, 'Última visita', fecha ? `${fmtFecha.format(new Date(fecha))} (${textoRelativo(fecha)})` : '—');
    dato(datos, 'Cliente desde', c.created_at ? fmtFecha.format(new Date(c.created_at)) : '—');
    const saldo = dato(datos, 'Saldo pendiente (CxC)', '…', 'cli-saldo');
    calcularSaldoCxC(c.id, saldo);

    cargarHistorial(c.id);
    pintarVehiculos(c);
    $('buscar-vehiculo').value = '';
    $('resultados-vehiculo').replaceChildren();
    $('dialog-ficha').showModal();
}

/** Saldo de Cuenta por cobrar (misma regla que antes: deudas - abonos). */
async function calcularSaldoCxC(clienteId, elemento) {
    try {
        let total = 0;
        const ids = [];
        const [v, p, m] = await Promise.all([
            window.supabase.from('ordenes').select('id, monto_cxc').eq('cliente_id', clienteId).gt('monto_cxc', 0),
            window.supabase.from('ordenes_domicilio').select('id, monto_cxc').eq('cliente_id', clienteId).gt('monto_cxc', 0),
            window.supabase.from('cxc_manuales').select('id, monto_cxc').eq('cliente_id', clienteId).eq('estado', 'Activo')
        ]);
        [v, p, m].forEach(res => (res.data || []).forEach(d => { total += aNumero(d.monto_cxc); ids.push(d.id); }));
        let abonos = 0;
        if (ids.length) {
            const { data } = await window.supabase.from('cxc_abonos').select('monto_abono').in('origen_id', ids);
            (data || []).forEach(a => { abonos += aNumero(a.monto_abono); });
        }
        const saldo = Math.max(0, total - abonos);
        if (fichaId !== clienteId) return;
        elemento.textContent = fmtCRC.format(saldo);
        elemento.classList.toggle('is-deuda', saldo > 0);
    } catch (e) {
        console.error('[Clientes] Error calculando saldo:', e);
        elemento.textContent = 'No disponible';
    }
}

/** Texto corto de lo realizado en una orden. */
function serviciosDe(o) {
    const lista = Array.isArray(o.servicios_maestros) ? o.servicios_maestros : [];
    const partes = [];
    if (o.detallado_tipo && o.detallado_tipo !== 'No aplica') partes.push(String(o.detallado_tipo).split('|')[0].trim());
    if (lista.includes('Mecanica')) {
        const cats = Array.isArray(o.mecanica_categorias) ? o.mecanica_categorias : [];
        partes.push(cats.length ? `Mecánica: ${cats.join(', ')}` : 'Mecánica');
    }
    if (lista.includes('Entrada pero servicios pendientes')) partes.push('Entrada (servicios pendientes)');
    if (!partes.length && lista.length) partes.push(lista.join(', '));
    return partes.join(' · ') || 'Servicio';
}

async function cargarHistorial(clienteId) {
    const cont = $('ficha-historial');
    cont.replaceChildren(el('div', 'veh-sk'));
    try {
        const [loc, dom] = await Promise.all([
            window.supabase.from('ordenes')
                .select('id, created_at, placa, tipo_vehiculo, servicios_maestros, detallado_tipo, mecanica_categorias, total_monto, metodo_pago, estado')
                .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(50),
            window.supabase.from('ordenes_domicilio')
                .select('id, created_at, placa, tipo_vehiculo, detallado_tipo, total_monto, metodo_pago')
                .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(50)
        ]);
        if (loc.error) throw loc.error;
        if (fichaId !== clienteId) return;

        const ordenes = [
            ...(loc.data || []).map(o => ({ ...o, origen: 'Local' })),
            ...((dom.data || []).map(o => ({ ...o, origen: 'Domicilio' })))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        cont.replaceChildren();
        if (!ordenes.length) {
            cont.appendChild(el('p', 'veh-vacio', 'Este cliente aún no tiene órdenes registradas en el sistema.'));
            return;
        }

        // Servicios más frecuentes
        const frecuencia = new Map();
        ordenes.forEach(o => serviciosDe(o).split(' · ').forEach(s => frecuencia.set(s, (frecuencia.get(s) || 0) + 1)));
        const chips = el('div', 'cli-chips');
        Array.from(frecuencia.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([s, n]) => {
            chips.appendChild(el('span', 'cli-chip', `${s} · ${n}`));
        });
        cont.appendChild(chips);

        // Tabla de órdenes
        const wrap = el('div', 'veh-table-wrap');
        const tabla = el('table', 'veh-table cli-historial');
        const thead = el('thead');
        const trh = el('tr');
        ['Fecha', 'Orden', 'Vehículo', 'Servicio', 'Monto', 'Pago'].forEach((t, i) => {
            const th = el('th', i === 4 ? 'num' : null, t);
            th.scope = 'col';
            trh.appendChild(th);
        });
        thead.appendChild(trh);
        tabla.appendChild(thead);
        const tb = el('tbody');
        ordenes.slice(0, 30).forEach(o => {
            const tr = el('tr');
            tr.appendChild(el('td', 'veh-col-sec', fmtFecha.format(new Date(o.created_at))));
            tr.appendChild(el('td', 'veh-col-sec', `${o.origen} #${o.id}`));
            const tdV = el('td', 'veh-col-sec');
            if (o.placa && o.placa !== 'SIN PLACA') tdV.appendChild(el('span', 'veh-placa', o.placa));
            else tdV.textContent = o.tipo_vehiculo || '—';
            tr.appendChild(tdV);
            tr.appendChild(el('td', null, serviciosDe(o)));
            tr.appendChild(el('td', 'num', fmtCRC.format(aNumero(o.total_monto))));
            const pagado = o.metodo_pago && o.metodo_pago !== 'Pendiente';
            tr.appendChild(el('td', 'veh-col-sec ' + (pagado ? 'cli-pagado' : 'cli-pendiente'), pagado ? o.metodo_pago : 'Pendiente'));
            tb.appendChild(tr);
        });
        tabla.appendChild(tb);
        wrap.appendChild(tabla);
        cont.appendChild(wrap);
        if (ordenes.length > 30) cont.appendChild(el('p', 'veh-contador', `Se muestran las últimas 30 de ${ordenes.length} órdenes.`));
    } catch (e) {
        console.error('[Clientes] Error cargando historial:', e);
        cont.replaceChildren(el('p', 'veh-vacio', 'No se pudo cargar el historial.'));
    }
}

function pintarVehiculos(c) {
    const ul = $('ficha-vehiculos');
    ul.replaceChildren();
    const vehs = vehiculosDe(c);
    if (!vehs.length) {
        ul.appendChild(el('li', 'veh-vacio', 'Ningún vehículo vinculado.'));
        return;
    }
    vehs.forEach(v => {
        const li = el('li', 'veh-dueno');
        const info = el('div');
        info.appendChild(el('span', 'veh-placa', v.placa));
        info.appendChild(el('span', null, `${v.marca || ''} ${v.modelo || ''}`.trim()));
        li.appendChild(info);
        if (permisos.desvincular) li.appendChild(boton('fa-link-slash', `Desvincular ${v.placa}`, 'is-peligro', () => desvincular(c, v.placa)));
        ul.appendChild(li);
    });
}

function buscarVehiculos() {
    const ul = $('resultados-vehiculo');
    ul.replaceChildren();
    const q = clave($('buscar-vehiculo').value);
    if (q.length < 2) return;
    const c = clientes.find(x => x.id === fichaId);
    const ya = new Set(vehiculosDe(c).map(v => v.placa));
    const lista = vehiculos.filter(v => !ya.has(v.placa) && clave(`${v.placa} ${v.marca} ${v.modelo}`).includes(q)).slice(0, 8);
    if (!lista.length) {
        ul.appendChild(el('li', 'veh-vacio', 'No se encontraron vehículos.'));
        return;
    }
    lista.forEach(v => {
        const li = el('li', 'veh-resultado');
        const info = el('div');
        info.appendChild(el('span', 'veh-placa', v.placa));
        info.appendChild(el('span', null, `${v.marca || ''} ${v.modelo || ''}`.trim()));
        li.appendChild(info);
        const b = el('button', 'veh-btn veh-btn-ghost veh-btn-sm', 'Vincular');
        b.type = 'button';
        b.addEventListener('click', () => vincular(c, v.placa, b));
        li.appendChild(b);
        ul.appendChild(li);
    });
}

async function refrescarFicha(id) {
    await cargarTodo();
    const c = clientes.find(x => x.id === id);
    if (c) pintarVehiculos(c);
}

async function vincular(c, placa, btn) {
    btn.disabled = true;
    try {
        const { error } = await window.supabase.from('cliente_vehiculo').insert([{ cliente_id: c.id, vehiculo_placa: placa }]);
        if (error) {
            if (error.code === '23505') throw new Error('Ese vehículo ya está vinculado.');
            throw error;
        }
        aviso(`${placa} vinculado a ${c.nombre}.`, 'exito');
        $('buscar-vehiculo').value = '';
        $('resultados-vehiculo').replaceChildren();
        await refrescarFicha(c.id);
    } catch (e) {
        aviso(e.message && !e.code ? e.message : mensajeError(e), 'error');
        btn.disabled = false;
    }
}

async function desvincular(c, placa) {
    if (!permisos.desvincular) return;
    const ok = await window.SaNotificar.confirmar({
        titulo: 'Desvincular vehículo',
        mensaje: `¿Quitar ${placa} de ${c.nombre}?`,
        textoConfirmar: 'Desvincular',
        peligro: true
    });
    if (!ok) return;
    try {
        const { error } = await window.supabase.from('cliente_vehiculo').delete().match({ cliente_id: c.id, vehiculo_placa: placa });
        if (error) throw error;
        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Clientes', `Desvinculación de vehículo\nCliente: ${c.nombre} (ID ${c.id})\nVehículo placa: ${placa}`);
        }
        aviso(`${placa} ya no está vinculado a ${c.nombre}.`, 'exito');
        await refrescarFicha(c.id);
    } catch (e) {
        console.error('[Clientes] Error al desvincular:', e);
        aviso('No se pudo desvincular. ' + mensajeError(e), 'error');
    }
}

/* --------------------------------------------------------------------------
   Eliminar (solo Dueño y Soporte TI)
   -------------------------------------------------------------------------- */
async function eliminarCliente(id) {
    if (!permisos.eliminar) {
        aviso('Solo el Dueño y Soporte TI pueden eliminar.', 'advertencia');
        return;
    }
    const c = clientes.find(x => x.id === id);
    const ok = await window.SaNotificar.confirmar({
        titulo: `Eliminar a ${c ? c.nombre : 'este cliente'}`,
        mensaje: 'Se eliminará el cliente y sus vínculos con vehículos. Esta acción no se puede deshacer.',
        textoConfirmar: 'Eliminar',
        peligro: true
    });
    if (!ok) return;
    try {
        const { error } = await window.supabase.from('clientes').delete().eq('id', id);
        if (error) throw error;
        if (window.enviarAlertaEliminacion) {
            const d = c ? `ID: ${id}\nNombre: ${c.nombre}\nTeléfono: ${c.telefono}\nCreado el: ${new Date(c.created_at).toLocaleString('es-CR')}` : `ID: ${id}`;
            window.enviarAlertaEliminacion('Clientes', d);
        }
        aviso(`${c ? c.nombre : 'Cliente'} eliminado.`, 'exito');
        await cargarTodo();
    } catch (e) {
        console.error('[Clientes] Error al eliminar:', e);
        aviso('No se pudo eliminar. Si tiene órdenes registradas, no se puede borrar. ' + mensajeError(e), 'error');
    }
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
function iniciar() {
    calcularPermisos();
    $('btn-nuevo').addEventListener('click', () => abrirFormulario());
    $('form-cliente').addEventListener('submit', guardarCliente);

    let espera;
    $('buscar').addEventListener('input', () => {
        clearTimeout(espera);
        espera = setTimeout(() => { pagina = 1; pintarTabla(); }, 150);
    });
    $('filtro-inactivos').addEventListener('change', () => { pagina = 1; pintarTabla(); });
    $('btn-mas').addEventListener('click', () => { pagina++; pintarTabla(); });
    $('ver-inactivos').addEventListener('click', () => {
        $('filtro-inactivos').checked = true;
        pagina = 1;
        pintarTabla();
        $('seccion-lista').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('buscar-vehiculo').addEventListener('input', buscarVehiculos);

    ['dialog-cliente', 'dialog-ficha'].forEach(id => {
        const d = $(id);
        d.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });

    cargarTodo();
    cargarVehiculos();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
