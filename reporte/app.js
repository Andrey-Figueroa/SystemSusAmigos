/**
 * Hoja de Reporte
 * - Período: calendario tipo agencia de vuelos (calendario.js). Por defecto: este mes.
 * - Vista "Reporte": detalle de cada movimiento del período (órdenes del local,
 *   domicilio, venta de productos y gastos) con totales al final.
 * - Vista "Dashboard": ingresos por área, métodos de pago, ingresos vs gastos (utilidad)
 *   y gastos más grandes.
 *
 * Reglas (las mismas que el Dashboard principal):
 * - Las órdenes y ventas se cuentan por su fecha de registro (created_at).
 * - Lavacar = detallado_monto de la orden; Mecánica = mecanica_monto. Si una orden vieja
 *   no tiene el monto separado, lo que falte del total se cuenta como Lavacar.
 * - Método de pago: los montos separados (efectivo, tarjeta...); si no hay, el método
 *   de pago con el total. "Pendiente" = Cuenta por cobrar.
 * - Utilidad = ingresos − gastos.
 * Todo el texto se inserta como texto (sin innerHTML con datos).
 */

const ZONA = 'America/Costa_Rica';
const POR_PAGINA = 100;
const NS = 'http://www.w3.org/2000/svg';

const fmtCRC = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-CR');
const fmtPct = new Intl.NumberFormat('es-CR', { style: 'percent', maximumFractionDigits: 0 });
const fmtCompacto = new Intl.NumberFormat('es-CR', { notation: 'compact', maximumFractionDigits: 1 });
const fmtFechaHora = new Intl.DateTimeFormat('es-CR', { timeZone: ZONA, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const fmtDiaCR = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA });
const fmtCortoUTC = new Intl.DateTimeFormat('es-CR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const fmtLargoUTC = new Intl.DateTimeFormat('es-CR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtMesUTC = new Intl.DateTimeFormat('es-CR', { timeZone: 'UTC', month: 'short', year: 'numeric' });

const METODOS = [
    ['efectivo', 'Efectivo'],
    ['tarjeta', 'Tarjeta'],
    ['sinpe', 'SINPE Móvil'],
    ['transferencia', 'Transferencia'],
    ['cxc', 'Cuenta por cobrar'],
    ['regalia', 'Regalía']
];
const NOMBRE_METODO = Object.fromEntries(METODOS);

const TIPOS = {
    local: 'Local',
    domicilio: 'Domicilio',
    producto: 'Producto',
    gasto: 'Gasto'
};

const AREAS = [
    ['lavacar', 'Lavacar', 'fa-spray-can-sparkles'],
    ['mecanica', 'Mecánica', 'fa-wrench'],
    ['domicilio', 'Domicilio', 'fa-house-chimney'],
    ['productos', 'Productos', 'fa-box']
];

const $ = (id) => document.getElementById(id);

let rango = null;              // { desde, hasta } AAAA-MM-DD
let movimientos = [];          // todo el período
let pagina = 1;
let tipoFiltro = '';
let cargaId = 0;               // para ignorar respuestas viejas si se cambia el período rápido
let cargado = false;           // ya hay datos del período

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
}

const aNumero = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const clave = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dinero = (v) => (v ? fmtCRC.format(v) : '');

const utc = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fechaUTC = (ymd) => new Date(utc(ymd));
const { sumarDias, diasEntre, diaSemana } = window.RangoCalendario;

/** Inicio de un día de Costa Rica en ISO, para filtrar en Supabase. */
const inicioDia = (ymd) => `${ymd}T00:00:00-06:00`;

/** Convierte el texto de metodo_pago en una clave de METODOS. */
function claveMetodo(texto) {
    const m = clave(texto);
    if (m.includes('efectivo')) return 'efectivo';
    if (m.includes('tarjeta')) return 'tarjeta';
    if (m.includes('sinpe')) return 'sinpe';
    if (m.includes('cuenta') || m.includes('cobrar') || m.includes('cxc') || m.includes('pendiente')) return 'cxc';
    if (m.includes('transferencia')) return 'transferencia';
    if (m.includes('regal')) return 'regalia';
    return null;
}

/** Montos por método de pago de un registro: los separados, o el método con el total. */
function metodosDe(r, total) {
    const res = {};
    let alguno = false;
    METODOS.forEach(([k]) => {
        const m = aNumero(r['monto_' + k]);
        if (m > 0) { res[k] = m; alguno = true; }
    });
    if (!alguno && total > 0) {
        const k = claveMetodo(r.metodo_pago) || 'cxc';     // sin método = aún no se cobra
        res[k] = total;
    }
    return res;
}

function textoMetodos(metodos) {
    const claves = Object.keys(metodos);
    if (!claves.length) return '—';
    if (claves.length === 1) return NOMBRE_METODO[claves[0]];
    return claves.map(k => `${NOMBRE_METODO[k]} ${fmtCRC.format(metodos[k])}`).join(' + ');
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

/** Igual que todas(), pero si falla con el select completo, reintenta con el básico. */
async function todasConRespaldo(tabla, completo, basico, rangoISO) {
    const consulta = (sel) => todas(() => window.supabase.from(tabla).select(sel)
        .gte('created_at', rangoISO.desde).lt('created_at', rangoISO.hasta)
        .order('created_at', { ascending: false }));
    try {
        return await consulta(completo);
    } catch (e) {
        console.warn(`[Reporte] ${tabla}: se usan las columnas básicas.`, e);
        return consulta(basico);
    }
}

/* --------------------------------------------------------------------------
   Cargar datos del período
   -------------------------------------------------------------------------- */
const MONTOS = 'metodo_pago, monto_efectivo, monto_tarjeta, monto_sinpe, monto_cxc, monto_transferencia, monto_regalia';
const MONTOS_PROD = 'monto_efectivo, monto_tarjeta, monto_sinpe, monto_cxc, monto_transferencia, monto_regalia';

async function cargar() {
    const id = ++cargaId;
    $('aviso-error').hidden = true;
    mostrarCargando();

    const rangoISO = { desde: inicioDia(rango.desde), hasta: inicioDia(sumarDias(rango.hasta, 1)) };

    try {
        const [ordenes, domicilio, productos, gastos] = await Promise.all([
            todasConRespaldo('ordenes',
                `id, created_at, placa, total_monto, detallado_monto, mecanica_monto, ${MONTOS}, clientes ( nombre )`,
                `id, created_at, placa, total_monto, detallado_monto, mecanica_monto, ${MONTOS}`, rangoISO),
            todasConRespaldo('ordenes_domicilio',
                `id, created_at, placa, total_monto, ${MONTOS}, clientes ( nombre )`,
                `id, created_at, placa, total_monto, ${MONTOS}`, rangoISO),
            todasConRespaldo('ventas_productos_diarias',
                `id, created_at, nombre_producto, precio_total, vendedor, ${MONTOS_PROD}`,
                'id, created_at, nombre_producto, precio_total', rangoISO),
            todasConRespaldo('gastos',
                'id, created_at, monto, descripcion, responsable, autoriza',
                'id, created_at, monto, descripcion', rangoISO)
        ]);
        if (id !== cargaId) return;

        movimientos = [
            ...ordenes.map(movimientoOrden),
            ...domicilio.map(movimientoDomicilio),
            ...productos.map(movimientoProducto),
            ...gastos.map(movimientoGasto)
        ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

        pagina = 1;
        cargado = true;
        pintarTodo();
    } catch (err) {
        if (id !== cargaId) return;
        console.error('[Reporte] Error al cargar:', err);
        const msg = ((err && err.message) || '').toLowerCase();
        $('aviso-error').textContent = (msg.includes('fetch') || msg.includes('network'))
            ? 'No se pudo conectar con el servidor. Revisa tu conexión y vuelve a elegir el período.'
            : 'No se pudo cargar el reporte. Recarga la página.';
        $('aviso-error').hidden = false;
        movimientos = [];
        cargado = true;
        pintarTodo();
    }
}

function base(r, tipo) {
    return {
        id: r.id,
        tipo,
        fecha: r.created_at,
        dia: r.created_at ? fmtDiaCR.format(new Date(r.created_at)) : null,
        lavacar: 0, mecanica: 0, domicilio: 0, productos: 0, gasto: 0,
        metodos: {}
    };
}

function movimientoOrden(o) {
    const m = base(o, 'local');
    const total = aNumero(o.total_monto);
    m.lavacar = aNumero(o.detallado_monto);
    m.mecanica = aNumero(o.mecanica_monto);
    // Órdenes viejas sin monto separado: lo que falta del total va a Lavacar
    const resto = total - m.lavacar - m.mecanica;
    if (resto > 0.5) m.lavacar += resto;
    m.ingreso = m.lavacar + m.mecanica;
    m.metodos = metodosDe(o, m.ingreso);
    const cliente = o.clientes && o.clientes.nombre;
    m.detalle = `Orden #${o.id}` + (o.placa && o.placa !== 'SIN PLACA' ? ` · ${o.placa}` : '') + (cliente ? ` · ${cliente}` : '');
    return m;
}

function movimientoDomicilio(o) {
    const m = base(o, 'domicilio');
    m.domicilio = aNumero(o.total_monto);
    m.ingreso = m.domicilio;
    m.metodos = metodosDe(o, m.ingreso);
    const cliente = o.clientes && o.clientes.nombre;
    m.detalle = `Domicilio #${o.id}` + (o.placa && o.placa !== 'SIN PLACA' ? ` · ${o.placa}` : '') + (cliente ? ` · ${cliente}` : '');
    return m;
}

function movimientoProducto(v) {
    const m = base(v, 'producto');
    m.productos = aNumero(v.precio_total);
    m.ingreso = m.productos;
    m.metodos = metodosDe(v, m.ingreso);
    m.detalle = (v.nombre_producto || 'Producto') + (v.vendedor ? ` · vendió ${v.vendedor}` : '');
    return m;
}

function movimientoGasto(g) {
    const m = base(g, 'gasto');
    m.gasto = aNumero(g.monto);
    m.ingreso = 0;
    const partes = [g.descripcion || 'Gasto'];
    if (g.responsable) partes.push(g.responsable);
    if (g.autoriza) partes.push(`autoriza ${g.autoriza}`);
    m.detalle = partes.join(' · ');
    m.pagoTexto = 'Efectivo (caja)';
    return m;
}

/* --------------------------------------------------------------------------
   Totales
   -------------------------------------------------------------------------- */
function totalesDe(lista) {
    const t = { lavacar: 0, mecanica: 0, domicilio: 0, productos: 0, gasto: 0, ingresos: 0, metodos: {}, cuenta: {} };
    METODOS.forEach(([k]) => { t.metodos[k] = 0; });
    ['lavacar', 'mecanica', 'domicilio', 'productos'].forEach(k => { t.cuenta[k] = 0; });
    lista.forEach(m => {
        t.lavacar += m.lavacar;
        t.mecanica += m.mecanica;
        t.domicilio += m.domicilio;
        t.productos += m.productos;
        t.gasto += m.gasto;
        t.ingresos += m.ingreso;
        if (m.lavacar > 0) t.cuenta.lavacar++;
        if (m.mecanica > 0) t.cuenta.mecanica++;
        if (m.domicilio > 0) t.cuenta.domicilio++;
        if (m.productos > 0) t.cuenta.productos++;
        Object.entries(m.metodos).forEach(([k, v]) => { t.metodos[k] += v; });
    });
    t.utilidad = t.ingresos - t.gasto;
    t.gastosCant = lista.filter(m => m.tipo === 'gasto').length;
    return t;
}

/* --------------------------------------------------------------------------
   Pintar
   -------------------------------------------------------------------------- */
function mostrarCargando() {
    const tr = el('tr');
    const td = el('td');
    td.colSpan = 9;
    td.append(el('div', 'rep-sk'), el('div', 'rep-sk'), el('div', 'rep-sk'));
    tr.appendChild(td);
    $('tabla-detalle').replaceChildren(tr);
    $('tabla-totales').replaceChildren();
    $('resumen-final').hidden = true;
    $('contador').textContent = '';
    $('btn-mas').hidden = true;
}

function pintarTodo() {
    $('titulo-detalle').textContent = `Detalle · ${window.RangoCalendario.textoRango(rango.desde, rango.hasta)}`;
    pintarDetalle();
    if (!$('vista-dashboard').hidden) pintarDashboard();
}

function filtrados() {
    const q = clave($('buscar').value.trim());
    return movimientos.filter(m =>
        (!tipoFiltro || m.tipo === tipoFiltro) &&
        (!q || clave(`${m.detalle} ${TIPOS[m.tipo]} ${m.pagoTexto || textoMetodos(m.metodos)}`).includes(q)));
}

function pintarDetalle() {
    const lista = filtrados();
    const tbody = $('tabla-detalle');
    tbody.replaceChildren();

    if (!lista.length) {
        const tr = el('tr');
        const td = el('td', 'rep-vacio', movimientos.length
            ? 'Ningún movimiento coincide con el filtro.'
            : 'No hay movimientos en este período.');
        td.colSpan = 9;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    const visibles = lista.slice(0, pagina * POR_PAGINA);
    visibles.forEach(m => {
        const tr = el('tr', m.tipo === 'gasto' ? 'is-gasto' : null);
        const tdF = el('td', 'rep-col-fecha', m.fecha ? fmtFechaHora.format(new Date(m.fecha)) : '—');
        tr.appendChild(tdF);
        const tdT = el('td');
        tdT.appendChild(el('span', `rep-tipo rep-tipo-${m.tipo}`, TIPOS[m.tipo]));
        tr.appendChild(tdT);
        tr.appendChild(el('td', 'rep-col-detalle', m.detalle));
        tr.appendChild(el('td', 'rep-col-pago', m.pagoTexto || textoMetodos(m.metodos)));
        tr.appendChild(el('td', 'num', dinero(m.lavacar)));
        tr.appendChild(el('td', 'num', dinero(m.mecanica)));
        tr.appendChild(el('td', 'num', dinero(m.domicilio)));
        tr.appendChild(el('td', 'num', dinero(m.productos)));
        tr.appendChild(el('td', 'num rep-col-gasto', m.gasto ? '−' + fmtCRC.format(m.gasto) : ''));
        tbody.appendChild(tr);
    });

    // Fila de totales (de lo filtrado)
    const t = totalesDe(lista);
    const tfoot = $('tabla-totales');
    tfoot.replaceChildren();
    if (lista.length) {
        const tr = el('tr');
        const th = el('th', null, `Totales (${fmtNum.format(lista.length)} movimientos)`);
        th.scope = 'row';
        th.colSpan = 4;
        tr.appendChild(th);
        tr.appendChild(el('td', 'num', fmtCRC.format(t.lavacar)));
        tr.appendChild(el('td', 'num', fmtCRC.format(t.mecanica)));
        tr.appendChild(el('td', 'num', fmtCRC.format(t.domicilio)));
        tr.appendChild(el('td', 'num', fmtCRC.format(t.productos)));
        tr.appendChild(el('td', 'num rep-col-gasto', t.gasto ? '−' + fmtCRC.format(t.gasto) : fmtCRC.format(0)));
        tfoot.appendChild(tr);
    }

    $('contador').textContent = lista.length
        ? `Mostrando ${fmtNum.format(visibles.length)} de ${fmtNum.format(lista.length)} movimientos` +
          (lista.length !== movimientos.length ? ` (filtrados de ${fmtNum.format(movimientos.length)})` : '')
        : '';
    $('btn-mas').hidden = visibles.length >= lista.length;

    // Resumen final: resultado y métodos de pago
    const resumen = $('resumen-final');
    resumen.hidden = !lista.length;
    const res = $('resumen-resultado');
    res.replaceChildren();
    const fila = (dl, etiqueta, valor, clase) => {
        const d = el('div', 'rep-dl-fila' + (clase ? ' ' + clase : ''));
        d.append(el('dt', null, etiqueta), el('dd', null, valor));
        dl.appendChild(d);
    };
    fila(res, 'Ingresos', fmtCRC.format(t.ingresos));
    fila(res, 'Gastos', (t.gasto ? '−' : '') + fmtCRC.format(t.gasto));
    fila(res, 'Utilidad', fmtCRC.format(t.utilidad), 'is-total' + (t.utilidad < 0 ? ' is-negativo' : ''));

    const pagos = $('resumen-pagos');
    pagos.replaceChildren();
    METODOS.forEach(([k, nombre]) => {
        if (t.metodos[k] > 0) fila(pagos, nombre, fmtCRC.format(t.metodos[k]));
    });
    if (!pagos.children.length) fila(pagos, 'Sin ingresos', fmtCRC.format(0));
    else fila(pagos, 'Total', fmtCRC.format(t.ingresos), 'is-total');
}

/* --------------------------------------------------------------------------
   Exportar (CSV para Excel) lo que se ve con el filtro actual
   -------------------------------------------------------------------------- */
function exportarCSV() {
    const lista = filtrados();
    if (!lista.length) {
        window.SaNotificar && window.SaNotificar.aviso('No hay movimientos para exportar.', 'advertencia');
        return;
    }
    const celda = (v) => {
        let s = v == null ? '' : String(v);
        if (/^[=+\-@]/.test(s)) s = "'" + s;           // evita que Excel lo tome como fórmula
        return `"${s.replace(/"/g, '""')}"`;
    };
    const filas = [['Fecha', 'Tipo', 'Detalle', 'Método de pago', 'Lavacar', 'Mecánica', 'Domicilio', 'Productos', 'Gastos']];
    lista.forEach(m => filas.push([
        m.fecha ? new Intl.DateTimeFormat('sv-SE', { timeZone: ZONA, dateStyle: 'short', timeStyle: 'short' }).format(new Date(m.fecha)) : '',
        TIPOS[m.tipo], m.detalle, m.pagoTexto || textoMetodos(m.metodos),
        Math.round(m.lavacar), Math.round(m.mecanica), Math.round(m.domicilio), Math.round(m.productos), Math.round(m.gasto)
    ]));
    const t = totalesDe(lista);
    filas.push([]);
    filas.push(['', '', 'Totales', '', Math.round(t.lavacar), Math.round(t.mecanica), Math.round(t.domicilio), Math.round(t.productos), Math.round(t.gasto)]);
    filas.push(['', '', 'Ingresos', '', Math.round(t.ingresos)]);
    filas.push(['', '', 'Gastos', '', Math.round(t.gasto)]);
    filas.push(['', '', 'Utilidad', '', Math.round(t.utilidad)]);
    filas.push([]);
    METODOS.forEach(([k, nombre]) => { if (t.metodos[k] > 0) filas.push(['', '', nombre, '', Math.round(t.metodos[k])]); });

    const csv = '﻿' + filas.map(f => f.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${rango.desde}_a_${rango.hasta}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------------------------------------------------
   Dashboard
   -------------------------------------------------------------------------- */
function pintarDashboard() {
    const t = totalesDe(movimientos);
    pintarKpis(t);
    pintarEvolucion();
    pintarAreas(t);
    pintarPagos();
    pintarUtilidad(t);
    pintarGastos();
}

function pintarKpis(t) {
    const cont = $('d-kpis');
    cont.replaceChildren();
    const ventas = movimientos.filter(m => m.tipo !== 'gasto').length;
    [
        ['Ingresos', fmtCRC.format(t.ingresos), `${fmtNum.format(ventas)} órdenes y ventas`, null],
        ['Gastos', fmtCRC.format(t.gasto), `${fmtNum.format(t.gastosCant)} ${t.gastosCant === 1 ? 'gasto' : 'gastos'}`, null],
        ['Utilidad', fmtCRC.format(t.utilidad),
            t.ingresos ? `${fmtPct.format(t.utilidad / t.ingresos)} de los ingresos` : 'Ingresos − gastos',
            t.utilidad < 0 ? 'is-negativo' : 'is-destacado'],
        ['Promedio por día', fmtCRC.format(t.ingresos / (diasEntre(rango.desde, rango.hasta) + 1)),
            `${fmtNum.format(diasEntre(rango.desde, rango.hasta) + 1)} días en el período`, null]
    ].forEach(([etiqueta, valor, detalle, clase]) => {
        const art = el('article', 'rep-kpi' + (clase ? ' ' + clase : ''));
        art.append(el('span', 'rep-kpi-label', etiqueta), el('strong', 'rep-kpi-valor', valor), el('span', 'rep-kpi-detalle', detalle));
        cont.appendChild(art);
    });
}

/* Ingresos por área: total, cantidad y ticket promedio */
function pintarAreas(t) {
    const cont = $('d-areas');
    cont.replaceChildren();
    const max = Math.max(...AREAS.map(([k]) => t[k]), 0);
    if (!max) {
        cont.appendChild(el('p', 'rep-vacio', 'No hay ingresos en este período.'));
        return;
    }
    AREAS.forEach(([k, nombre, icono]) => {
        const fila = el('div', 'rep-area');
        const cab = el('div', 'rep-area-cab');
        const nom = el('span', 'rep-area-nombre');
        const i = el('i', `fa-solid ${icono}`);
        i.setAttribute('aria-hidden', 'true');
        nom.append(i, document.createTextNode(' ' + nombre));
        cab.append(nom, el('strong', 'rep-area-valor', fmtCRC.format(t[k])));
        const pista = el('div', 'rep-bar-track');
        const relleno = el('div', 'rep-bar-fill');
        relleno.style.width = `${(t[k] / max) * 100}%`;
        pista.appendChild(relleno);
        const n = t.cuenta[k];
        const det = el('p', 'rep-area-det',
            n ? `${fmtNum.format(n)} ${k === 'productos' ? (n === 1 ? 'venta' : 'ventas') : (n === 1 ? 'orden' : 'órdenes')} · ticket promedio ${fmtCRC.format(t[k] / n)}` +
                (t.ingresos ? ` · ${fmtPct.format(t[k] / t.ingresos)} del total` : '')
              : 'Sin movimientos');
        fila.title = `${nombre}: ${fmtCRC.format(t[k])}`;
        fila.append(cab, pista, det);
        cont.appendChild(fila);
    });
}

/* Métodos de pago, con filtro propio por área */
function pintarPagos() {
    const origen = $('d-pago-origen').value;
    const t = totalesDe(movimientos.filter(m => m.tipo !== 'gasto' && (!origen || m.tipo === origen)));
    const lista = METODOS.map(([k, nombre]) => ({ k, nombre, v: t.metodos[k] })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const cont = $('d-pagos');
    cont.replaceChildren();
    if (!lista.length) {
        cont.appendChild(el('p', 'rep-vacio', 'No hay ingresos para este filtro.'));
        return;
    }
    const max = lista[0].v;
    lista.forEach(x => {
        const fila = el('div', 'rep-bar');
        fila.title = `${x.nombre}: ${fmtCRC.format(x.v)} (${fmtPct.format(x.v / t.ingresos)} de los ingresos)`;
        fila.appendChild(el('span', 'rep-bar-label', x.nombre));
        const pista = el('div', 'rep-bar-track');
        const relleno = el('div', 'rep-bar-fill');
        relleno.style.width = `${(x.v / max) * 100}%`;
        pista.appendChild(relleno);
        fila.appendChild(pista);
        const val = el('span', 'rep-bar-valor');
        val.append(el('strong', null, fmtCRC.format(x.v)), el('small', null, fmtPct.format(x.v / t.ingresos)));
        fila.appendChild(val);
        cont.appendChild(fila);
    });
}

/* Ingresos − gastos = utilidad (cuadro tipo cascada simple) */
function pintarUtilidad(t) {
    const cont = $('d-utilidad');
    cont.replaceChildren();
    const max = Math.max(t.ingresos, t.gasto, Math.abs(t.utilidad), 1);
    [
        ['Ingresos', t.ingresos, 'is-ingreso', ''],
        ['Gastos', t.gasto, 'is-gasto', '−'],
        ['Utilidad', t.utilidad, t.utilidad < 0 ? 'is-perdida' : 'is-utilidad', '']
    ].forEach(([nombre, v, clase, signo]) => {
        const fila = el('div', 'rep-bar rep-bar-util');
        fila.appendChild(el('span', 'rep-bar-label', nombre));
        const pista = el('div', 'rep-bar-track');
        const relleno = el('div', `rep-bar-fill ${clase}`);
        relleno.style.width = `${(Math.abs(v) / max) * 100}%`;
        pista.appendChild(relleno);
        fila.appendChild(pista);
        fila.appendChild(el('span', 'rep-bar-valor', (v && signo ? signo : '') + fmtCRC.format(v)));
        cont.appendChild(fila);
    });
    const nota = el('p', 'rep-nota', t.ingresos
        ? `De cada ₡1 000 que entraron, quedaron ₡${fmtNum.format(Math.round((t.utilidad / t.ingresos) * 1000))} después de gastos.`
        : 'Sin ingresos en el período.');
    cont.appendChild(nota);
}

/* Gastos más grandes */
function pintarGastos() {
    const ul = $('d-gastos');
    ul.replaceChildren();
    const lista = movimientos.filter(m => m.tipo === 'gasto').sort((a, b) => b.gasto - a.gasto).slice(0, 8);
    if (!lista.length) {
        ul.appendChild(el('li', 'rep-vacio', 'No hay gastos en este período.'));
        return;
    }
    lista.forEach(m => {
        const li = el('li', 'rep-lista-item');
        li.append(
            el('span', 'rep-lista-nombre', m.detalle),
            el('span', 'rep-lista-fecha', fmtFechaHora.format(new Date(m.fecha))),
            el('strong', 'rep-lista-valor', '−' + fmtCRC.format(m.gasto))
        );
        ul.appendChild(li);
    });
}

/* Ingresos / gastos / utilidad en el tiempo (columnas en SVG con tooltip) */
function claveGrupo(dia, g) {
    if (g === 'mes') return dia.slice(0, 7);
    if (g === 'semana') return sumarDias(dia, -diaSemana(dia));
    return dia;
}

function etiquetaGrupo(k, g, larga) {
    if (g === 'mes') return fmtMesUTC.format(fechaUTC(k + '-01'));
    if (g === 'semana') return (larga ? 'Semana del ' : '') + fmtCortoUTC.format(fechaUTC(k));
    return larga ? fmtLargoUTC.format(fechaUTC(k)) : fmtCortoUTC.format(fechaUTC(k));
}

function pasoNice(rangoValores) {
    if (rangoValores <= 0) return 1;
    const crudo = rangoValores / 4;
    const p = Math.pow(10, Math.floor(Math.log10(crudo)));
    for (const m of [1, 2, 2.5, 5, 10]) if (p * m >= crudo) return p * m;
    return p * 10;
}

function pintarEvolucion() {
    const cont = $('d-evo');
    cont.replaceChildren();
    const metrica = $('d-evo-metrica').value;
    let g = $('d-evo-grupo').value;
    const nDias = diasEntre(rango.desde, rango.hasta) + 1;
    if (g === 'auto') g = nDias <= 45 ? 'dia' : nDias <= 210 ? 'semana' : 'mes';

    const NOMBRES = { ingresos: 'Ingresos', gastos: 'Gastos', utilidad: 'Utilidad' };
    $('d-evo-titulo').textContent = `${NOMBRES[metrica]} ${g === 'dia' ? 'por día' : g === 'semana' ? 'por semana' : 'por mes'}`;

    // Grupos del período (incluye los vacíos)
    const grupos = new Map();
    for (let d = rango.desde, i = 0; d <= rango.hasta && i < 4000; d = sumarDias(d, 1), i++) {
        const k = claveGrupo(d, g);
        if (!grupos.has(k)) grupos.set(k, { k, ingresos: 0, gastos: 0 });
    }
    movimientos.forEach(m => {
        if (!m.dia) return;
        const b = grupos.get(claveGrupo(m.dia, g));
        if (!b) return;
        b.ingresos += m.ingreso;
        b.gastos += m.gasto;
    });
    const lista = Array.from(grupos.values()).map(b => ({ ...b, utilidad: b.ingresos - b.gastos }));
    const valores = lista.map(b => b[metrica]);

    if (!valores.some(v => v !== 0)) {
        cont.appendChild(el('p', 'rep-vacio', 'No hay datos en este período.'));
        return;
    }

    const ancho = Math.max(300, cont.clientWidth || 600);
    const alto = 250, izq = 62, der = 8, arr = 12, abj = 30;
    const plotW = ancho - izq - der, plotH = alto - arr - abj;
    const vMax = Math.max(0, ...valores), vMin = Math.min(0, ...valores);
    const paso = pasoNice(vMax - vMin);
    const top = Math.ceil(vMax / paso) * paso || paso;
    const bot = Math.floor(vMin / paso) * paso;
    const y = (v) => arr + plotH - ((v - bot) / (top - bot)) * plotH;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', ancho);
    svg.setAttribute('height', alto);
    svg.setAttribute('class', 'rep-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${$('d-evo-titulo').textContent}. Total: ${fmtCRC.format(valores.reduce((a, b) => a + b, 0))}.`);

    // Cuadrícula y eje
    for (let v = bot; v <= top + paso / 2; v += paso) {
        const yy = Math.round(y(v)) + 0.5;
        const linea = document.createElementNS(NS, 'line');
        linea.setAttribute('x1', izq); linea.setAttribute('x2', ancho - der);
        linea.setAttribute('y1', yy); linea.setAttribute('y2', yy);
        linea.setAttribute('class', Math.abs(v) < paso / 1000 ? 'rep-eje-base' : 'rep-grid');
        svg.appendChild(linea);
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', izq - 8); t.setAttribute('y', yy + 4);
        t.setAttribute('text-anchor', 'end');
        t.setAttribute('class', 'rep-eje-txt');
        t.textContent = (v < 0 ? '−₡' : '₡') + fmtCompacto.format(Math.abs(v));
        svg.appendChild(t);
    }

    const n = lista.length;
    const ancho1 = plotW / n;
    const hueco = Math.max(2, ancho1 * 0.25);
    const wBar = Math.max(1, ancho1 - hueco);
    const cada = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 72))));
    const y0 = y(0);
    const tooltip = el('div', 'rep-tooltip');
    tooltip.hidden = true;
    const barras = [];
    const claseSerie = metrica === 'gastos' ? 'is-gasto' : 'is-ingreso';

    lista.forEach((b, i) => {
        const v = b[metrica];
        const x = izq + i * ancho1 + hueco / 2;
        let barra = null;
        if (v !== 0) {
            const yv = y(v);
            const alto1 = Math.abs(y0 - yv);
            const r = Math.min(4, wBar / 2, alto1);
            barra = document.createElementNS(NS, 'path');
            // Esquinas redondeadas solo en el extremo de datos (lejos del cero)
            barra.setAttribute('d', v > 0
                ? `M${x} ${y0} V${yv + r} Q${x} ${yv} ${x + r} ${yv} H${x + wBar - r} Q${x + wBar} ${yv} ${x + wBar} ${yv + r} V${y0} Z`
                : `M${x} ${y0} V${yv - r} Q${x} ${yv} ${x + r} ${yv} H${x + wBar - r} Q${x + wBar} ${yv} ${x + wBar} ${yv - r} V${y0} Z`);
            barra.setAttribute('class', `rep-col ${v < 0 ? 'is-perdida' : claseSerie}`);
            svg.appendChild(barra);
        }
        barras.push(barra);

        if (i % cada === 0) {
            const t = document.createElementNS(NS, 'text');
            t.setAttribute('x', izq + i * ancho1 + ancho1 / 2);
            t.setAttribute('y', alto - 10);
            t.setAttribute('text-anchor', 'middle');
            t.setAttribute('class', 'rep-eje-txt');
            t.textContent = etiquetaGrupo(b.k, g, false);
            svg.appendChild(t);
        }

        const zona = document.createElementNS(NS, 'rect');
        zona.setAttribute('x', izq + i * ancho1);
        zona.setAttribute('y', arr);
        zona.setAttribute('width', ancho1);
        zona.setAttribute('height', plotH);
        zona.setAttribute('class', 'rep-zona');
        const mostrar = () => {
            svg.classList.add('is-hover');
            barras.forEach((bb, j) => bb && bb.classList.toggle('is-activa', j === i));
            tooltip.replaceChildren(
                el('strong', null, etiquetaGrupo(b.k, g, true)),
                el('span', null, `Ingresos: ${fmtCRC.format(b.ingresos)}`),
                el('span', null, `Gastos: ${fmtCRC.format(b.gastos)}`),
                el('span', 'rep-tooltip-total', `Utilidad: ${fmtCRC.format(b.utilidad)}`)
            );
            tooltip.hidden = false;
            const cx = izq + i * ancho1 + ancho1 / 2;
            const tw = tooltip.offsetWidth;
            tooltip.style.left = `${Math.min(Math.max(0, cx - tw / 2), ancho - tw)}px`;
            tooltip.style.top = `${Math.max(0, Math.min(y(Math.max(v, 0)), y0) - tooltip.offsetHeight - 10)}px`;
        };
        zona.addEventListener('mouseenter', mostrar);
        zona.addEventListener('click', mostrar);
        svg.appendChild(zona);
    });

    svg.addEventListener('mouseleave', () => {
        svg.classList.remove('is-hover');
        barras.forEach(bb => bb && bb.classList.remove('is-activa'));
        tooltip.hidden = true;
    });

    const marco = el('div', 'rep-chart');
    marco.append(svg, tooltip);
    cont.appendChild(marco);

    // Los mismos datos en tabla
    const det = el('details', 'rep-detalles');
    det.appendChild(el('summary', null, 'Ver los datos en tabla'));
    const wrap = el('div', 'rep-table-wrap');
    const tabla = el('table', 'rep-table rep-table-mini');
    const thead = el('thead');
    const trh = el('tr');
    ['Período', 'Ingresos', 'Gastos', 'Utilidad'].forEach((txt, i) => {
        const th = el('th', i ? 'num' : null, txt);
        th.scope = 'col';
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tb = el('tbody');
    lista.slice().reverse().forEach(b => {
        const tr = el('tr');
        tr.append(
            el('td', null, etiquetaGrupo(b.k, g, true)),
            el('td', 'num', fmtCRC.format(b.ingresos)),
            el('td', 'num', fmtCRC.format(b.gastos)),
            el('td', 'num' + (b.utilidad < 0 ? ' is-negativo' : ''), fmtCRC.format(b.utilidad))
        );
        tb.appendChild(tr);
    });
    tabla.append(thead, tb);
    wrap.appendChild(tabla);
    det.appendChild(wrap);
    cont.appendChild(det);
}

/* --------------------------------------------------------------------------
   Vistas
   -------------------------------------------------------------------------- */
function mostrarVista(vista) {
    const esDash = vista === 'dashboard';
    $('vista-reporte').hidden = esDash;
    $('vista-dashboard').hidden = !esDash;
    document.querySelectorAll('.rep-vista-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vista === vista)));
    const hash = esDash ? '#dashboard' : '';
    if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
    if (esDash && cargado) pintarDashboard();
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
function iniciar() {
    const hoy = fmtDiaCR.format(new Date());
    rango = { desde: hoy.slice(0, 8) + '01', hasta: hoy };   // por defecto: este mes

    window.RangoCalendario.crear({
        boton: $('btn-periodo'),
        zona: ZONA,
        inicial: rango,
        alAplicar: (r) => { rango = r; cargar(); }
    });

    document.querySelectorAll('.rep-vista-btn').forEach(b => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

    $('chips-tipo').addEventListener('click', (e) => {
        const b = e.target.closest('.rep-chip');
        if (!b) return;
        tipoFiltro = b.dataset.tipo;
        document.querySelectorAll('.rep-chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
        pagina = 1;
        pintarDetalle();
    });

    let espera;
    $('buscar').addEventListener('input', () => {
        clearTimeout(espera);
        espera = setTimeout(() => { pagina = 1; pintarDetalle(); }, 150);
    });
    $('btn-mas').addEventListener('click', () => { pagina++; pintarDetalle(); });
    $('btn-csv').addEventListener('click', exportarCSV);

    // Filtros propios de cada gráfico
    $('d-evo-metrica').addEventListener('change', pintarEvolucion);
    $('d-evo-grupo').addEventListener('change', pintarEvolucion);
    $('d-pago-origen').addEventListener('change', pintarPagos);

    // El gráfico de columnas se ajusta al ancho
    let ultimoAncho = 0, esperaR;
    new ResizeObserver(entradas => {
        const w = Math.round(entradas[0].contentRect.width);
        if (Math.abs(w - ultimoAncho) < 8 || $('vista-dashboard').hidden) return;
        ultimoAncho = w;
        clearTimeout(esperaR);
        esperaR = setTimeout(pintarEvolucion, 120);
    }).observe($('d-evo'));

    mostrarVista(location.hash === '#dashboard' ? 'dashboard' : 'reporte');
    cargar();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
