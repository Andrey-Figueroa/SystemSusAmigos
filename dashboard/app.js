/**
 * Sus Amigos - Dashboard
 *
 * La sesión, los permisos, el navbar, el menú lateral y la fecha/hora
 * ya los manejan js/auth_guard.js y js/layout.js.
 * Aquí solo va la lógica propia de los componentes del dashboard.
 */

// Zona horaria del negocio: el "día" siempre es el de Costa Rica, sin importar la del equipo
const ZONA_CR = 'America/Costa_Rica';

// Formato de colones de Costa Rica: ₡40 000
const formatoColones = new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0
});
const formatoNumero = new Intl.NumberFormat('es-CR');

/** Inicio del día de hoy en Costa Rica, en formato ISO para filtrar en Supabase. */
function inicioDelDiaCR() {
    // 'en-CA' da la fecha como AAAA-MM-DD
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CR }).format(new Date());
    return `${hoy}T00:00:00-06:00`;
}

/** Convierte un valor de la base de datos a número (null, '' o texto inválido = 0). */
function aNumero(valor) {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : 0;
}

/* ==========================================================================
   Indicador: Ticket promedio
   Suma el total de todos los tickets del día y lo divide entre la cantidad de tickets.
   Un ticket = una orden del local, una venta de productos o un servicio a domicilio
   con monto mayor a 0.
   ========================================================================== */
async function cargarTicketPromedio() {
    const card = document.getElementById('kpi-ticket-promedio');
    const valorEl = document.getElementById('kpi-ticket-valor');
    const detalleEl = document.getElementById('kpi-ticket-detalle');
    if (!card) return;

    card.classList.add('is-loading');
    card.classList.remove('is-error');

    try {
        const desde = inicioDelDiaCR();

        // Las tres consultas en paralelo y solo con la columna del monto
        const [ordenes, productos, domicilio] = await Promise.all([
            window.supabase.from('ordenes').select('total_monto').gte('created_at', desde),
            window.supabase.from('ventas_productos_diarias').select('precio_total').gte('created_at', desde),
            window.supabase.from('ordenes_domicilio').select('total_monto').gte('created_at', desde)
        ]);

        const error = ordenes.error || productos.error || domicilio.error;
        if (error) throw error;

        const montos = [
            ...ordenes.data.map(o => aNumero(o.total_monto)),
            ...productos.data.map(v => aNumero(v.precio_total)),
            ...domicilio.data.map(d => aNumero(d.total_monto))
        ].filter(m => m > 0);

        const totalVendido = montos.reduce((suma, m) => suma + m, 0);
        const cantidadTickets = montos.length;
        const promedio = cantidadTickets > 0 ? totalVendido / cantidadTickets : 0;

        valorEl.textContent = formatoColones.format(promedio);
        detalleEl.textContent = cantidadTickets === 0
            ? 'Aún no hay tickets hoy'
            : `${formatoNumero.format(cantidadTickets)} ${cantidadTickets === 1 ? 'ticket' : 'tickets'} · ${formatoColones.format(totalVendido)} en total`;
    } catch (err) {
        console.error('[Dashboard] Error al calcular el ticket promedio:', err);
        card.classList.add('is-error');
        valorEl.textContent = '—';
        detalleEl.textContent = 'No se pudo cargar. Recarga la página.';
    } finally {
        card.classList.remove('is-loading');
    }
}

/* ==========================================================================
   Indicador: Caja inicial
   Funciona igual que antes: empieza en ₡40 000, se puede editar y el botón de enviar
   manda la alerta por correo ('alerta_caja') y actualiza la hoja de Sheets
   ('update_caja_dashboard'). Al enviar, el monto se guarda en este equipo y es el que
   aparece al volver a abrir el dashboard (por defecto ₡40 000).
   ========================================================================== */
function iniciarCajaInicial() {
    const input = document.getElementById('input-caja-inicial');
    const btn = document.getElementById('btn-update-caja');
    const estado = document.getElementById('kpi-caja-estado');
    if (!input || !btn) return;

    const ICONO_ENVIAR = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
    const config = window.APP_CONFIG || {};
    const CLAVE_CAJA = 'dashCajaInicial';

    // Mostrar el último monto enviado en este equipo (si no hay, queda el ₡40 000 del HTML)
    try {
        const guardado = localStorage.getItem(CLAVE_CAJA);
        if (guardado !== null && guardado !== '' && aNumero(guardado) >= 0) input.value = guardado;
    } catch (e) { /* almacenamiento no disponible: se queda el valor por defecto */ }

    // Avisar a otros componentes (p. ej. "Dinero en caja") cuando cambia el monto
    input.addEventListener('input', () => {
        document.dispatchEvent(new CustomEvent('dash:caja-inicial', { detail: aNumero(input.value) }));
    });

    btn.addEventListener('click', async () => {
        const nuevoMonto = input.value;
        if (nuevoMonto === '' || aNumero(nuevoMonto) < 0) {
            estado.textContent = 'Ingresa un monto válido.';
            estado.classList.add('is-error-text');
            input.focus();
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
        estado.classList.remove('is-error-text');
        estado.textContent = 'Enviando…';

        const enviar = (url, payload) => fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });

        try {
            // 1. Alerta por correo (igual que antes)
            await enviar(config.alertWebhookUrl, {
                action: 'alerta_caja',
                usuario: localStorage.getItem('activeUser') || 'Usuario Desconocido',
                nuevo_monto: nuevoMonto,
                fecha: new Date().toLocaleString('es-CR')
            });

            // 2. Actualizar la caja en Google Sheets (igual que antes; si falla no bloquea)
            enviar(config.sheetsWebhookUrl, {
                action: 'update_caja_dashboard',
                nuevo_monto: nuevoMonto
            }).catch(() => {});

            // Recordar el monto para la próxima vez que se abra el dashboard
            try { localStorage.setItem(CLAVE_CAJA, nuevoMonto); } catch (e) { /* sin almacenamiento */ }

            btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
            btn.classList.add('is-ok');
            estado.textContent = `Caja actualizada a ${formatoColones.format(aNumero(nuevoMonto))} y alerta enviada.`;
        } catch (err) {
            console.error('[Dashboard] Error al enviar la alerta de caja:', err);
            btn.innerHTML = ICONO_ENVIAR;
            estado.textContent = 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.';
            estado.classList.add('is-error-text');
            btn.disabled = false;
            return;
        }

        setTimeout(() => {
            btn.innerHTML = ICONO_ENVIAR;
            btn.classList.remove('is-ok');
            btn.disabled = false;
        }, 3000);
    });
}

/* ==========================================================================
   Indicador: Dinero en caja
   Dinero en caja = Caja inicial + Ingresos totales en efectivo − Gastos en efectivo

   Ingresos en efectivo del día (cobrados hoy):
   - Órdenes del local: cobradas hoy (hora_pago), parte en efectivo.
   - Venta de productos: se cobran al registrarse (created_at), parte en efectivo.
   - Domicilio: registrados hoy (created_at), parte en efectivo.
   - Abonos a cuentas por cobrar: de hoy (fecha), pagados en efectivo.
   Gastos: todos los gastos del día salen de caja (efectivo).
   ========================================================================== */
const dineroEnCaja = { efectivo: 0, gastos: 0, cargado: false };

/** Parte en efectivo de un cobro: usa monto_efectivo; si no hay montos separados, usa el método de pago. */
function efectivoDe(registro, total) {
    const efectivo = aNumero(registro.monto_efectivo);
    if (efectivo > 0) return efectivo;

    const tieneMontosSeparados = ['monto_tarjeta', 'monto_sinpe', 'monto_cxc', 'monto_transferencia', 'monto_regalia']
        .some(campo => aNumero(registro[campo]) > 0);
    const metodo = (registro.metodo_pago || '').toLowerCase();
    if (!tieneMontosSeparados && metodo.includes('efectivo')) return aNumero(total);
    return 0;
}

function pintarDineroEnCaja() {
    const valorEl = document.getElementById('kpi-dinero-valor');
    const detalleEl = document.getElementById('kpi-dinero-detalle');
    const input = document.getElementById('input-caja-inicial');
    if (!valorEl || !dineroEnCaja.cargado) return;

    const cajaInicial = input ? aNumero(input.value) : 0;
    const total = cajaInicial + dineroEnCaja.efectivo - dineroEnCaja.gastos;

    valorEl.textContent = formatoColones.format(total);
    valorEl.classList.toggle('is-negative', total < 0);
    detalleEl.textContent =
        `${formatoColones.format(cajaInicial)} inicial + ${formatoColones.format(dineroEnCaja.efectivo)} efectivo − ` +
        `${formatoColones.format(dineroEnCaja.gastos)} gastos`;

    pintarCierre(total, cajaInicial);
}

/* ==========================================================================
   Indicador: Dinero entregado al cierre
   Dinero entregado al cierre = Dinero en caja − Caja inicial
   (la caja inicial se queda en la caja; el resto se entrega al cerrar)
   ========================================================================== */
function pintarCierre(dineroCaja, cajaInicial) {
    const card = document.getElementById('kpi-cierre');
    const valorEl = document.getElementById('kpi-cierre-valor');
    const detalleEl = document.getElementById('kpi-cierre-detalle');
    if (!card) return;

    card.classList.remove('is-loading');

    if (dineroCaja === null) {
        card.classList.add('is-error');
        valorEl.textContent = '—';
        detalleEl.textContent = 'No se pudo cargar. Recarga la página.';
        return;
    }

    const entregado = dineroCaja - cajaInicial;
    card.classList.remove('is-error');
    valorEl.textContent = formatoColones.format(entregado);
    valorEl.classList.toggle('is-negative', entregado < 0);
    detalleEl.textContent =
        `${formatoColones.format(dineroCaja)} en caja − ${formatoColones.format(cajaInicial)} de caja inicial`;
}

async function cargarDineroEnCaja() {
    const card = document.getElementById('kpi-dinero-caja');
    const valorEl = document.getElementById('kpi-dinero-valor');
    const detalleEl = document.getElementById('kpi-dinero-detalle');
    if (!card) return;

    card.classList.add('is-loading');
    card.classList.remove('is-error');

    try {
        const desde = inicioDelDiaCR();
        const montos = 'monto_efectivo, monto_tarjeta, monto_sinpe, monto_cxc, monto_transferencia, monto_regalia';
        const camposPago = `metodo_pago, ${montos}`;

        const [ordenes, productos, domicilio, abonos, gastos, pendientes] = await Promise.all([
            window.supabase.from('ordenes').select(`total_monto, detallado_monto, mecanica_monto, ${camposPago}`).gte('hora_pago', desde),
            // Venta de productos no tiene columna metodo_pago: solo montos separados
            window.supabase.from('ventas_productos_diarias').select(`precio_total, ${montos}`).gte('created_at', desde),
            window.supabase.from('ordenes_domicilio').select(`total_monto, ${camposPago}`).gte('created_at', desde),
            window.supabase.from('cxc_abonos').select('monto_abono, metodo_pago').gte('fecha', desde),
            window.supabase.from('gastos').select('monto').gte('created_at', desde),
            // Órdenes del local de hoy SIN cobrar: el negocio las cuenta como Cuenta por cobrar
            window.supabase.from('ordenes').select(`total_monto, detallado_monto, mecanica_monto, ${camposPago}`)
                .gte('created_at', desde).is('hora_pago', null)
        ]);

        const error = ordenes.error || productos.error || domicilio.error || abonos.error || gastos.error || pendientes.error;
        if (error) throw error;

        let efectivo = 0;
        ordenes.data.forEach(o => { efectivo += efectivoDe(o, o.total_monto); });
        productos.data.forEach(v => { efectivo += efectivoDe(v, v.precio_total); });
        domicilio.data.forEach(d => { efectivo += efectivoDe(d, d.total_monto); });
        abonos.data.forEach(a => {
            if ((a.metodo_pago || '').toLowerCase().includes('efectivo')) efectivo += aNumero(a.monto_abono);
        });

        dineroEnCaja.efectivo = efectivo;
        dineroEnCaja.gastos = gastos.data.reduce((suma, g) => suma + aNumero(g.monto), 0);
        dineroEnCaja.cargado = true;
        pintarDineroEnCaja();
        pintarGastos(dineroEnCaja.gastos, gastos.data.length);
        // Desglose: lo no cobrado entra como "Cuenta por cobrar" (no toca el dinero en caja)
        const ordenesSinCobrar = pendientes.data.map(o => ({ ...o, metodo_pago: 'Pendiente' }));
        pintarDesglose({
            ordenes: [...ordenes.data, ...ordenesSinCobrar],
            productos: productos.data,
            domicilio: domicilio.data,
            abonos: abonos.data
        });
    } catch (err) {
        console.error('[Dashboard] Error al calcular el dinero en caja:', err);
        card.classList.add('is-error');
        valorEl.textContent = '—';
        detalleEl.textContent = 'No se pudo cargar. Recarga la página.';
        pintarGastos(null);
        pintarCierre(null);
        pintarDesglose(null);
    } finally {
        card.classList.remove('is-loading');
    }
}

/* ==========================================================================
   Indicador: Gastos en efectivo
   Resumen de la suma de todos los gastos del día (módulo Gastos Diarios).
   Usa los mismos datos que "Dinero en caja" (una sola consulta).
   ========================================================================== */
function pintarGastos(total, cantidad) {
    const card = document.getElementById('kpi-gastos');
    const valorEl = document.getElementById('kpi-gastos-valor');
    const detalleEl = document.getElementById('kpi-gastos-detalle');
    if (!card) return;

    card.classList.remove('is-loading');

    if (total === null) {
        card.classList.add('is-error');
        valorEl.textContent = '—';
        detalleEl.textContent = 'No se pudo cargar. Recarga la página.';
        return;
    }

    card.classList.remove('is-error');
    valorEl.textContent = formatoColones.format(total);
    detalleEl.textContent = cantidad === 0
        ? 'Sin gastos registrados hoy'
        : `${formatoNumero.format(cantidad)} ${cantidad === 1 ? 'gasto registrado' : 'gastos registrados'} hoy`;
}

// Si cambia la caja inicial, se recalcula al instante
document.addEventListener('dash:caja-inicial', pintarDineroEnCaja);

/* ==========================================================================
   Desglose de ventas por categoría (6 tablas, igual que la hoja de Sheets)
   Usa los mismos datos del día que "Dinero en caja" (una sola ronda de consultas).
   Columna de cantidad = cuántos registros tienen monto en ese rubro
   (una venta pagada mitad efectivo y mitad tarjeta suma 1 en cada uno).
   ========================================================================== */
const METODOS = ['efectivo', 'tarjeta', 'sinpe', 'cxc', 'transferencia', 'regalia'];

/** Convierte el texto de metodo_pago en una de las claves de METODOS. */
function claveMetodo(texto) {
    const m = (texto || '').toLowerCase();
    if (m.includes('efectivo')) return 'efectivo';
    if (m.includes('tarjeta')) return 'tarjeta';
    if (m.includes('sinpe')) return 'sinpe';
    // Pendiente de cobro = Cuenta por cobrar (así lo maneja el negocio)
    if (m.includes('cuenta') || m.includes('cobrar') || m.includes('cxc') || m.includes('pendiente')) return 'cxc';
    if (m.includes('transferencia')) return 'transferencia';
    if (m.includes('regal')) return 'regalia';
    return null;
}

function desgloseVacio() {
    const d = {};
    METODOS.forEach(k => { d[k] = { monto: 0, cant: 0 }; });
    return d;
}

/** Suma por método de pago: usa los montos separados; si no hay, el método de pago con el total. */
function desglosarPorMetodo(registros, campoTotal) {
    const d = desgloseVacio();
    registros.forEach(r => {
        let tieneMontos = false;
        METODOS.forEach(k => {
            const monto = aNumero(r['monto_' + k]);
            if (monto > 0) {
                d[k].monto += monto;
                d[k].cant++;
                tieneMontos = true;
            }
        });
        if (!tieneMontos) {
            const k = claveMetodo(r.metodo_pago);
            const total = aNumero(r[campoTotal]);
            if (k && total > 0) {
                d[k].monto += total;
                d[k].cant++;
            }
        }
    });
    return d;
}

function desglosarAbonos(abonos) {
    const d = desgloseVacio();
    abonos.forEach(a => {
        const k = claveMetodo(a.metodo_pago);
        const monto = aNumero(a.monto_abono);
        if (k && monto > 0) {
            d[k].monto += monto;
            d[k].cant++;
        }
    });
    return d;
}

/** Filas de una tabla a partir de un desglose: [clave, etiqueta] */
const filasDe = (desglose, filas) => filas.map(([k, etiqueta]) => ({ etiqueta, ...desglose[k] }));

/** Dibuja una tabla. filas: [{etiqueta, monto, cant, total?}] | undefined (cargando) | null (error) */
function dibujarTabla(id, titulo, columnaCantidad, filas, filasSkeleton) {
    const cont = document.getElementById(id);
    if (!cont) return;

    const tabla = document.createElement('table');
    tabla.className = 'dash-tabla';

    const caption = document.createElement('caption');
    caption.textContent = titulo;
    tabla.appendChild(caption);

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th scope="col">Rubro</th><th scope="col" class="num">Monto</th><th scope="col" class="num"></th></tr>';
    thead.querySelector('th:last-child').textContent = columnaCantidad;
    tabla.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (filas === null) {
        const tr = document.createElement('tr');
        tr.className = 'dash-tabla-error';
        tr.innerHTML = '<td colspan="3">No se pudo cargar. Recarga la página.</td>';
        tbody.appendChild(tr);
    } else if (filas === undefined) {
        tabla.classList.add('is-loading');
        filasSkeleton.forEach(etiqueta => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<th scope="row"></th><td class="num"><span class="dash-sk"></span></td><td class="num"><span class="dash-sk"></span></td>';
            tr.querySelector('th').textContent = etiqueta;
            tbody.appendChild(tr);
        });
    } else {
        filas.forEach(f => {
            const tr = document.createElement('tr');
            if (f.total) tr.className = 'dash-tabla-total';
            tr.innerHTML = '<th scope="row"></th><td class="num"></td><td class="num"></td>';
            tr.children[0].textContent = f.etiqueta;
            tr.children[1].textContent = formatoColones.format(f.monto);
            tr.children[2].textContent = formatoNumero.format(f.cant);
            if (f.monto === 0 && !f.total) tr.classList.add('is-zero');
            tbody.appendChild(tr);
        });
    }

    tabla.appendChild(tbody);
    cont.replaceChildren(tabla);
}

/**
 * Pinta las 6 tablas.
 * datos: { ordenes, productos, domicilio, abonos } | undefined (cargando) | null (error)
 */
function pintarDesglose(datos) {
    // Filas de cada tabla, tal como en la hoja de Sheets
    const F = {
        lubricentro: [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['sinpe', 'Sinpe'],
                      ['cxc', 'Cuenta por cobrar'], ['transferencia', 'Transferencia'], ['regalia', 'Regalía']],
        productos:   [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta crédito / débito'],
                      ['sinpe', 'SINPE Móvil'], ['cxc', 'Cuenta por cobrar']],
        domicilio:   [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['sinpe', 'Sinpe'], ['cxc', 'CxC']],
        abonos:      [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['sinpe', 'Sinpe'],
                      ['transferencia', 'Transferencia'], ['regalia', 'Regalía']],
        global:      ['Detallado', 'Mecánica', 'Productos', 'Domicilio', 'Total'],
        totales:     [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['sinpe', 'SINPE Móvil'],
                      ['cxc', 'Cuenta por cobrar'], ['transferencia', 'Transferencia'], ['regalia', 'Regalía']]
    };
    const etiquetas = filas => filas.map(f => Array.isArray(f) ? f[1] : f);
    const VV = 'Vehículos/Ventas';

    // Cargando o error: misma estructura con skeleton o mensaje
    if (!datos) {
        const estado = datos; // undefined = cargando, null = error
        dibujarTabla('tabla-lubricentro', 'Lubricentro & Detallado', VV, estado, etiquetas(F.lubricentro));
        dibujarTabla('tabla-global', 'Reporte Global', VV, estado, F.global);
        dibujarTabla('tabla-totales', 'Ventas globales Sus Amigos', '# Vehículos', estado, [...etiquetas(F.totales), 'Ventas globales']);
        dibujarTabla('tabla-productos', 'Venta de Productos', VV, estado, etiquetas(F.productos));
        dibujarTabla('tabla-domicilio', 'Servicios a Domicilio', VV, estado, etiquetas(F.domicilio));
        dibujarTabla('tabla-abonos', 'Abonos / Saldos de Cuentas por Cobrar', VV, estado, etiquetas(F.abonos));
        return;
    }

    const lub = desglosarPorMetodo(datos.ordenes, 'total_monto');
    const prod = desglosarPorMetodo(datos.productos, 'precio_total');
    const dom = desglosarPorMetodo(datos.domicilio, 'total_monto');
    const abo = desglosarAbonos(datos.abonos);

    // Reporte Global (por tipo de servicio)
    const sumar = (lista, campo) => lista.reduce((acc, r) => {
        const m = aNumero(r[campo]);
        if (m > 0) { acc.monto += m; acc.cant++; }
        return acc;
    }, { monto: 0, cant: 0 });
    const g = {
        detallado: sumar(datos.ordenes, 'detallado_monto'),
        mecanica: sumar(datos.ordenes, 'mecanica_monto'),
        productos: sumar(datos.productos, 'precio_total'),
        domicilio: sumar(datos.domicilio, 'total_monto')
    };
    const gTotal = Object.values(g).reduce((a, x) => ({ monto: a.monto + x.monto, cant: a.cant + x.cant }), { monto: 0, cant: 0 });

    // Ventas globales Sus Amigos = Lubricentro + Productos + Domicilio + Abonos, por método
    const tot = desgloseVacio();
    [lub, prod, dom, abo].forEach(d => METODOS.forEach(k => {
        tot[k].monto += d[k].monto;
        tot[k].cant += d[k].cant;
    }));
    // Total de ventas globales: la regalía no es dinero que entra (no suma al monto, sí a la cantidad)
    const totGlobal = {
        monto: METODOS.filter(k => k !== 'regalia').reduce((s, k) => s + tot[k].monto, 0),
        cant: METODOS.reduce((s, k) => s + tot[k].cant, 0)
    };

    dibujarTabla('tabla-lubricentro', 'Lubricentro & Detallado', VV, filasDe(lub, F.lubricentro));
    dibujarTabla('tabla-global', 'Reporte Global', VV, [
        { etiqueta: 'Detallado', ...g.detallado },
        { etiqueta: 'Mecánica', ...g.mecanica },
        { etiqueta: 'Productos', ...g.productos },
        { etiqueta: 'Domicilio', ...g.domicilio },
        { etiqueta: 'Total', ...gTotal, total: true }
    ]);
    dibujarTabla('tabla-totales', 'Ventas globales Sus Amigos', '# Vehículos', [
        ...filasDe(tot, F.totales),
        { etiqueta: 'Ventas globales', ...totGlobal, total: true }
    ]);
    dibujarTabla('tabla-productos', 'Venta de Productos', VV, filasDe(prod, F.productos));
    dibujarTabla('tabla-domicilio', 'Servicios a Domicilio', VV, filasDe(dom, F.domicilio));
    dibujarTabla('tabla-abonos', 'Abonos / Saldos de Cuentas por Cobrar', VV, filasDe(abo, F.abonos));
}

/* ==========================================================================
   Inicio: los componentes arrancan cuando auth_guard.js confirma la sesión
   ========================================================================== */
function iniciarDashboard(profile) {
    const rol = window.AppSession ? window.AppSession.normalizarRol(profile && profile.rol) : '';

    // El Mecánico no ve indicadores financieros (ni se descargan los datos)
    if (rol === 'mecanico') {
        ['dash-indicadores', 'dash-desglose'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        return;
    }

    cargarTicketPromedio();
    iniciarCajaInicial();   // primero: deja puesto el último monto guardado
    pintarDesglose(undefined); // skeleton mientras cargan los datos
    cargarDineroEnCaja();      // también llena el desglose de ventas
}

if (window.SaUser) {
    iniciarDashboard(window.SaUser);
} else {
    document.addEventListener('sa:auth-ready', (e) => iniciarDashboard(e.detail), { once: true });
}
