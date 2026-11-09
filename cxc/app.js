// ══════════════════════════════════════════════════════════════════
//  CUENTAS POR COBRAR — app.js  (Supabase conectado)
//  Flujo 1 : Cuenta Manual   → wizard de 3 pasos
//  Flujo 2 : Automático      → insertado desde local_comercial / domicilio
// ══════════════════════════════════════════════════════════════════

// ── Estado global ──────────────────────────────────────────────────
// Dirección en js/config.js (único lugar donde se define)
const GOOGLE_SHEETS_WEBHOOK_URL = window.APP_CONFIG.sheetsWebhookUrl;

let activeUser = null;
let activeUserRole = null;
let cxcData = [];   // registros cargados desde Supabase

// ── Estado del wizard ──────────────────────────────────────────────
const wizardState = {
    currentStep: 1,
    client: null,   // { id, nombre, telefono, isNew, vehicles[] }
    vehicle: null,   // { placa, marca, modelo, año, tipo, isNew }
};

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabase) {
        SaNotificar.aviso('Supabase no está inicializado.', 'error');
        return;
    }

    // Verificar sesión
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) {
        window.location.href = '../login/index.html';
        return;
    }

    activeUser = localStorage.getItem('activeUser') || session.user.email;
    activeUserRole = localStorage.getItem('activeUserRole') || '';

    // Cargar tabla principal
    await loadCxC();

    // Fecha default paso 3
    document.getElementById('cxc-date').value = new Date().toISOString().split('T')[0];

    // Buscador y filtro Pendientes / Pagadas / Todas
    document.getElementById('search-input').addEventListener('input', aplicarFiltros);
    document.querySelectorAll('input[name="filtro-estado"]').forEach(r => r.addEventListener('change', aplicarFiltros));

    // Pestañas: Cuentas / Historial de abonos
    document.querySelectorAll('.cxc-vista').forEach(b => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));

    // Historial de abonos
    document.getElementById('buscar-abonos').addEventListener('input', renderAbonos);
    document.getElementById('periodo-abonos').addEventListener('change', renderAbonos);
    await loadAbonos();

    // Ficha de la cuenta
    const dlg = document.getElementById('dialog-detalle');
    document.getElementById('detalle-cerrar').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

    // Cerrar wizard con Escape o clic fuera
    document.getElementById('wizard-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('wizard-overlay')) closeWizard();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeWizard(); });
});

// ══════════════════════════════════════════════════════════════════
//  TABLA PRINCIPAL — Load & Render
// ══════════════════════════════════════════════════════════════════
async function loadCxC() {
    try {
        const { data, error } = await window.supabase
            .from('cxc_manuales')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        cxcData = data || [];
        aplicarFiltros();
    } catch (err) {
        console.error('Error cargando CxC:', err);
        showToast('error', 'Error', 'No se pudieron cargar las cuentas por cobrar.');
    }
}

/** Escapa texto antes de ponerlo en HTML. */
function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Filtro por estado (Pendientes = pendiente + parcial) y búsqueda. */
function aplicarFiltros() {
    const q = (document.getElementById('search-input').value || '').trim().toLowerCase();
    const filtro = (document.querySelector('input[name="filtro-estado"]:checked') || {}).value || 'abiertas';
    const lista = cxcData.filter(r => {
        if (filtro === 'abiertas' && r.estado === 'pagado') return false;
        if (filtro === 'pagado' && r.estado !== 'pagado') return false;
        if (!q) return true;
        return r.cliente_nombre?.toLowerCase().includes(q) ||
            r.cliente_telefono?.includes(q) ||
            r.vehiculo_placa?.toLowerCase().includes(q) ||
            r.fecha_deuda?.includes(q) ||
            r.concepto?.toLowerCase().includes(q);
    });

    const titulo = document.getElementById('empty-titulo');
    const texto = document.getElementById('empty-texto');
    if (filtro === 'pagado') {
        titulo.textContent = 'Aún no hay cuentas pagadas';
        texto.textContent = 'Cuando una cuenta se salda queda aquí como historial, con todos sus abonos.';
    } else {
        titulo.textContent = q ? 'Ninguna cuenta coincide con la búsqueda' : 'No hay cuentas por cobrar pendientes';
        texto.textContent = 'Agrega una nueva cuenta manualmente o las órdenes con cuenta pendiente aparecerán aquí.';
    }
    renderTable(lista);
}

function renderTable(data = cxcData) {
    const tbody = document.getElementById('cxc-table-body');
    const empty = document.getElementById('empty-state');

    if (!data.length) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = data.map(r => `
        <tr class="${r.estado === 'pagado' ? 'cxc-fila-pagada' : ''}">
            <td>
                <div class="client-cell">
                    <div class="client-avatar-sm">${esc(getInitials(r.cliente_nombre))}</div>
                    <div>
                        <div class="client-name-cell">${esc(r.cliente_nombre)}</div>
                        <div class="client-phone-cell">${esc(r.cliente_telefono || '—')}</div>
                    </div>
                </div>
            </td>
            <td>${r.vehiculo_placa ? `<span class="placa-tag">${esc(r.vehiculo_placa)}</span>` : '<span style="opacity:0.4">—</span>'}</td>
            <td class="date-cell">${formatDate(r.fecha_deuda)}</td>
            <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(r.concepto)}">${esc(r.concepto)}</td>
            <td class="amount-cell">${formatMoney(r.monto_total)}</td>
            <td class="amount-cell ${r.estado === 'pagado' ? '' : 'pending'}">${formatMoney(r.saldo_pendiente)}</td>
            <td>${getBadgeOrigen(r.origen)}</td>
            <td>${getBadgeEstado(r.estado)}</td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon view"   title="Ver cuenta y abonos" onclick="viewCxC(${Number(r.id)})"><i class="fa-solid fa-eye"></i></button>
                    ${r.estado !== 'pagado' ? `<button class="btn-icon edit" title="Registrar abono" onclick="openAbonoModal(${Number(r.id)})"><i class="fa-solid fa-hand-holding-dollar"></i></button>` : ''}
                    ${window.AppSession.puedeEliminar() ? `<button class="btn-icon delete" title="Eliminar" onclick="deleteCxC(${r.id})"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// ── Acciones de tabla ──────────────────────────────────────────────
/** Ficha de la cuenta: datos y todos sus abonos con fecha y hora. */
async function viewCxC(id) {
    const r = cxcData.find(x => x.id === id);
    if (!r) return;

    document.getElementById('detalle-titulo').textContent = r.cliente_nombre || 'Cuenta';
    document.getElementById('detalle-sub').textContent =
        `${r.concepto || 'Sin concepto'}${r.vehiculo_placa ? ' · ' + r.vehiculo_placa : ''}`;

    const datos = document.getElementById('detalle-datos');
    const abonadoTotal = Math.max(0, Number(r.monto_total || 0) - Number(r.saldo_pendiente || 0));
    datos.innerHTML = [
        ['Fecha de la deuda', formatDate(r.fecha_deuda)],
        ['Monto total', formatMoney(r.monto_total)],
        ['Abonado', formatMoney(abonadoTotal)],
        ['Saldo pendiente', formatMoney(r.saldo_pendiente)],
        ['Origen', ({ manual: 'Manual', local_comercial: 'Local Comercial', domicilio: 'Domicilio' })[r.origen] || r.origen || '—'],
        ['Estado', ({ pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagada' })[r.estado] || r.estado || '—']
    ].map(([k, v]) => `<div class="cxc-dato"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');

    const cont = document.getElementById('detalle-abonos');
    cont.innerHTML = '<p class="cxc-detalle-vacio">Cargando abonos…</p>';
    document.getElementById('dialog-detalle').showModal();

    try {
        const { data, error } = await window.supabase
            .from('cxc_abonos')
            .select('id, monto_abono, metodo_pago, notas, registrado_por, fecha')
            .eq('cxc_id', id)
            .order('fecha', { ascending: false });
        if (error) throw error;
        if (!data || !data.length) {
            cont.innerHTML = '<p class="cxc-detalle-vacio">Esta cuenta aún no tiene abonos.</p>';
            return;
        }
        cont.innerHTML = `
            <div class="table-container cxc-detalle-tabla">
                <table class="data-table">
                    <thead><tr><th>Fecha del abono</th><th class="text-right">Monto</th><th>Método</th><th>Registrado por</th><th>Notas</th></tr></thead>
                    <tbody>${data.map(a => `
                        <tr>
                            <td class="date-cell">${esc(formatDateTime(a.fecha))}</td>
                            <td class="amount-cell text-right">${formatMoney(a.monto_abono)}</td>
                            <td>${esc(a.metodo_pago || '—')}</td>
                            <td>${esc(a.registrado_por || '—')}</td>
                            <td>${esc(a.notas || '—')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (err) {
        console.error('Error cargando abonos de la cuenta:', err);
        cont.innerHTML = '<p class="cxc-detalle-vacio">No se pudieron cargar los abonos.</p>';
    }
}

/** Recalcula saldo y estado de una cuenta con la suma de sus abonos. */
async function recalcularSaldo(cxcId) {
    try {
        const [{ data: cuenta }, { data: abonos }] = await Promise.all([
            window.supabase.from('cxc_manuales').select('monto_total').eq('id', cxcId).single(),
            window.supabase.from('cxc_abonos').select('monto_abono').eq('cxc_id', cxcId)
        ]);
        if (!cuenta) return;
        const abonado = (abonos || []).reduce((s, a) => s + Number(a.monto_abono || 0), 0);
        const saldo = Math.max(0, Number(cuenta.monto_total || 0) - abonado);
        const estado = saldo <= 0 ? 'pagado' : (abonado > 0 ? 'parcial' : 'pendiente');
        await window.supabase.from('cxc_manuales')
            .update({ saldo_pendiente: saldo, estado, updated_at: new Date().toISOString() })
            .eq('id', cxcId);
    } catch (err) {
        console.error('Error recalculando el saldo:', err);
    }
}

/* ══════════════════════════════════════════════════════════════════
   VISTAS: Cuentas / Historial de abonos
   ══════════════════════════════════════════════════════════════════ */
function cambiarVista(vista) {
    document.querySelectorAll('.cxc-vista').forEach(b => {
        const activa = b.dataset.vista === vista;
        b.classList.toggle('is-activa', activa);
        b.setAttribute('aria-selected', activa ? 'true' : 'false');
    });
    document.getElementById('vista-cuentas').hidden = vista !== 'cuentas';
    document.getElementById('vista-abonos').hidden = vista !== 'abonos';
    if (vista === 'abonos') renderAbonos();
}

let abonosData = [];

async function loadAbonos() {
    try {
        const { data, error } = await window.supabase
            .from('cxc_abonos')
            .select('id, cxc_id, monto_abono, metodo_pago, notas, registrado_por, fecha, cxc_manuales ( cliente_nombre, vehiculo_placa, concepto )')
            .order('fecha', { ascending: false })
            .limit(5000);
        if (error) throw error;
        abonosData = data || [];
        renderAbonos();
    } catch (err) {
        console.error('Error cargando abonos:', err);
        showToast('error', 'Error', 'No se pudo cargar el historial de abonos.');
    }
}

/** Inicio del período elegido (hora de Costa Rica). */
function inicioPeriodo(periodo) {
    if (periodo === 'todo') return null;
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
    let desde = hoy;
    if (periodo === 'semana') {
        const dow = new Date(hoy + 'T12:00:00Z').getUTCDay();
        const d = new Date(hoy + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
        desde = d.toISOString().slice(0, 10);
    } else if (periodo === 'mes') {
        desde = hoy.slice(0, 7) + '-01';
    }
    return new Date(desde + 'T00:00:00-06:00');
}

function renderAbonos() {
    const q = (document.getElementById('buscar-abonos').value || '').trim().toLowerCase();
    const desde = inicioPeriodo(document.getElementById('periodo-abonos').value);
    const lista = abonosData.filter(a => {
        if (desde && new Date(a.fecha) < desde) return false;
        if (!q) return true;
        const c = a.cxc_manuales || {};
        return `${c.cliente_nombre || ''} ${c.vehiculo_placa || ''} ${c.concepto || ''} ${a.metodo_pago || ''}`.toLowerCase().includes(q);
    });

    document.getElementById('abonos-cantidad').textContent = lista.length.toLocaleString('es-CR');
    document.getElementById('abonos-total').textContent = formatMoney(lista.reduce((s, a) => s + Number(a.monto_abono || 0), 0));

    const tbody = document.getElementById('abonos-table-body');
    document.getElementById('abonos-vacio').style.display = lista.length ? 'none' : 'block';
    tbody.innerHTML = lista.map(a => {
        const c = a.cxc_manuales || {};
        return `
        <tr>
            <td class="date-cell">${esc(formatDateTime(a.fecha))}</td>
            <td class="client-name-cell">${esc(c.cliente_nombre || '—')}</td>
            <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(c.concepto || '')}">
                <button type="button" class="cxc-link" onclick="viewCxC(${Number(a.cxc_id)})">${esc(c.concepto || 'Ver cuenta')}</button>
            </td>
            <td>${c.vehiculo_placa ? `<span class="placa-tag">${esc(c.vehiculo_placa)}</span>` : '<span style="opacity:0.4">—</span>'}</td>
            <td class="amount-cell text-right">${formatMoney(a.monto_abono)}</td>
            <td>${esc(a.metodo_pago || '—')}</td>
            <td>${esc(a.registrado_por || '—')}</td>
            <td>${esc(a.notas || '—')}</td>
        </tr>`;
    }).join('');
}

async function deleteCxC(id) {
    if (!window.AppSession.puedeEliminar()) {
        showToast('error', 'Acceso denegado', 'Solo el Dueño y Soporte TI pueden eliminar.');
        return;
    }

    const r = cxcData.find(x => x.id === id);
    const desglose = r
        ? `Cuenta por Cobrar ID: ${id}\nCliente: ${r.cliente_nombre}\nVehículo Placa: ${r.vehiculo_placa || 'N/A'}\nMonto Total: ${formatMoney(r.monto_total)}\nSaldo Pendiente: ${formatMoney(r.saldo_pendiente)}\nConcepto: ${r.concepto || 'Sin concepto'}`
        : `Cuenta por Cobrar ID: ${id}`;

    if (!(await SaNotificar.confirmar({ titulo: 'Eliminar cuenta por cobrar', textoConfirmar: 'Eliminar', peligro: true, mensaje: '¿Eliminar esta cuenta por cobrar permanentemente?'}))) return;

    try {
        const { error } = await window.supabase
            .from('cxc_manuales')
            .delete()
            .eq('id', id);

        if (error) throw error;

        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('CxC', desglose);
        }

        cxcData = cxcData.filter(r => r.id !== id);
        aplicarFiltros();
        showToast('success', 'Eliminado', 'La cuenta fue eliminada correctamente.');
    } catch (err) {
        console.error(err);
        showToast('error', 'Error', 'No se pudo eliminar la cuenta.');
    }
}

// ══════════════════════════════════════════════════════════════════
//  MODAL DE ABONO / SALDAR
// ══════════════════════════════════════════════════════════════════

function openAbonoModal(id) {
    const r = cxcData.find(x => x.id === id);
    if (!r) return;

    if (r.estado === 'pagado') {
        showToast('info', 'Ya pagado', 'Esta cuenta ya fue saldada completamente.');
        return;
    }

    // Rellenar encabezado
    document.getElementById('abono-cxc-id').value = r.id;
    document.getElementById('abono-modal-title').textContent = 'Registrar Pago';
    document.getElementById('abono-orden-ref').textContent =
        `${r.cliente_nombre}  ·  ${r.vehiculo_placa || 'Sin placa'}`;

    // Total grande
    document.getElementById('abono-total-big').textContent = formatMoney(r.saldo_pendiente);

    // Hint de monto
    document.getElementById('abono-monto-hint').textContent =
        `Máximo: ${formatMoney(r.saldo_pendiente)}`;

    // Limpiar formulario
    document.getElementById('abono-monto-input').value = '';
    document.getElementById('abono-notas').value = '';
    document.querySelector('input[name="metodo_pago"][value="Efectivo"]').checked = true;

    // Modo parcial por defecto
    setAbonoType('parcial');

    document.getElementById('abono-overlay').classList.add('active');
    setTimeout(() => document.getElementById('abono-monto-input').focus(), 280);
}

function closeAbonoModal() {
    document.getElementById('abono-overlay').classList.remove('active');
}

function setAbonoType(tipo) {
    const isParcial = tipo === 'parcial';
    document.getElementById('abono-tipo-hidden').value = tipo;

    // Botones
    document.getElementById('btn-tipo-abono').classList.toggle('active', isParcial);
    document.getElementById('btn-tipo-saldar').classList.toggle('active', !isParcial);

    // Campos
    document.getElementById('abono-monto-group').style.display = isParcial ? 'flex' : 'none';
    document.getElementById('abono-saldar-msg').style.display = isParcial ? 'none' : 'block';

    const input = document.getElementById('abono-monto-input');
    if (isParcial) {
        input.required = true;
        input.focus();
    } else {
        input.required = false;
        input.value = '';
    }

    // Texto del botón
    document.getElementById('btn-submit-abono').innerHTML = isParcial
        ? '<i class="fa-solid fa-coins"></i> Registrar Abono'
        : '<i class="fa-solid fa-circle-check"></i> Saldar Cuenta';
}

async function submitAbono(e) {
    e.preventDefault();

    const cxcId = parseInt(document.getElementById('abono-cxc-id').value);
    const tipo = document.getElementById('abono-tipo-hidden').value;
    const metodo = document.querySelector('input[name="metodo_pago"]:checked')?.value || 'Efectivo';
    const notas = document.getElementById('abono-notas').value.trim();

    // Calcular monto real del abono
    const registro = cxcData.find(x => x.id === cxcId);
    let monto;
    if (tipo === 'total') {
        monto = parseFloat(registro.saldo_pendiente);
    } else {
        monto = parseFloat(document.getElementById('abono-monto-input').value);
        if (!monto || monto <= 0) {
            showToast('error', 'Monto inválido', 'Ingresa un monto mayor a cero.');
            return;
        }
        if (monto > parseFloat(registro.saldo_pendiente)) {
            showToast('error', 'Monto excede el saldo', `El saldo pendiente es ${formatMoney(registro.saldo_pendiente)}.`);
            return;
        }
    }

    const btn = document.getElementById('btn-submit-abono');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
    btn.disabled = true;

    try {
        // Insertar abono — el TRIGGER en Supabase actualiza saldo_pendiente y estado automáticamente
        const { error } = await window.supabase
            .from('cxc_abonos')
            .insert([{
                cxc_id: cxcId,
                monto_abono: monto,
                metodo_pago: metodo,
                notas: notas || null,
                registrado_por: activeUser,
            }]);

        if (error) throw error;

        // Mandar el abono a Google Sheets (Transacciones)
        try {
            if (typeof GOOGLE_SHEETS_WEBHOOK_URL !== 'undefined') {
                const metodoLow = metodo.toLowerCase();
                const isEfectivo = metodoLow.includes('efectivo');
                const isTarjeta = metodoLow.includes('tarjeta');
                const isSinpe = metodoLow.includes('sinpe');
                const isTransferencia = metodoLow.includes('transferencia');

                const sheetPayload = {
                    action: "abono_cxc",
                    orden_id: "CxC",
                    placa: registro.vehiculo_placa || "CxC",
                    nombre_cliente: registro.cliente_nombre || "N/A",
                    monto_total: monto,
                    metodo_pago: metodo,
                    monto_efectivo: isEfectivo ? monto : 0,
                    monto_tarjeta: isTarjeta ? monto : 0,
                    monto_sinpe: isSinpe ? monto : 0,
                    monto_cxc: 0,
                    monto_transf: isTransferencia ? monto : 0,
                    monto_regalia: 0,
                    responsable: activeUser,
                    hora_pago: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
                };

                fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(sheetPayload)
                });
            }
        } catch (e) {
            console.error("Error enviando abono a Sheets:", e);
        }

        // La cuenta NUNCA se borra al saldarla: queda en estado "pagado" con su
        // historial de abonos. El saldo se recalcula con la suma de los abonos
        // (por si el trigger de la base de datos no estuviera instalado).
        await recalcularSaldo(cxcId);

        closeAbonoModal();

        // Recargar datos frescos desde Supabase
        await loadCxC();
        await loadAbonos();

        const esTotal = tipo === 'total';
        showToast(
            'success',
            esTotal ? '¡Cuenta saldada!' : 'Abono registrado',
            `${formatMoney(monto)} vía ${metodo} — ${registro.cliente_nombre}`
        );

    } catch (err) {
        console.error(err);
        showToast('error', 'Error al registrar', err.message);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

// Cerrar abono modal con Escape o clic fuera
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('abono-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('abono-overlay')) closeAbonoModal();
    });
});


// ══════════════════════════════════════════════════════════════════
//  WIZARD — Abrir / Cerrar / Reset
// ══════════════════════════════════════════════════════════════════
function openWizard() {
    resetWizard();
    document.getElementById('wizard-overlay').classList.add('active');
    setTimeout(() => document.getElementById('client-search-input').focus(), 300);
}

function closeWizard() {
    document.getElementById('wizard-overlay').classList.remove('active');
}

function resetWizard() {
    wizardState.currentStep = 1;
    wizardState.client = null;
    wizardState.vehicle = null;

    // Pasos
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    updateProgress(1);

    // Paso 1
    document.getElementById('client-search-input').value = '';
    document.getElementById('client-found-card').style.display = 'none';
    document.getElementById('client-new-form-container').style.display = 'none';
    document.getElementById('found-client-name').textContent = '—';
    document.getElementById('found-client-phone').textContent = '—';
    document.getElementById('new-client-name').value = '';
    document.getElementById('new-client-phone-input').value = '';

    // Paso 2
    document.getElementById('vehicles-grid').innerHTML = '';
    document.getElementById('new-vehicle-form-container').style.display = 'none';
    ['veh-placa', 'veh-marca', 'veh-modelo', 'veh-año', 'veh-tipo'].forEach(id => {
        document.getElementById(id).value = '';
    });

    // Paso 3
    document.getElementById('cxc-concept').value = '';
    document.getElementById('cxc-amount').value = '';
    document.getElementById('cxc-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('cxc-notes').value = '';
}

// ══════════════════════════════════════════════════════════════════
//  WIZARD — Navegación
// ══════════════════════════════════════════════════════════════════
function goToStep(n) {
    document.getElementById(`step-${wizardState.currentStep}`).classList.remove('active');
    wizardState.currentStep = n;
    document.getElementById(`step-${n}`).classList.add('active');
    updateProgress(n);
    document.querySelector('.wizard-body').scrollTop = 0;

    if (n === 2) onEnterStep2();
    if (n === 3) onEnterStep3();
}

function updateProgress(active) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`prog-step-${i}`);
        el.classList.remove('active', 'completed');
        if (i < active) el.classList.add('completed');
        if (i === active) el.classList.add('active');
    }
    document.getElementById('line-1-2').classList.toggle('completed', active > 1);
    document.getElementById('line-2-3').classList.toggle('completed', active > 2);
}

// ══════════════════════════════════════════════════════════════════
//  PASO 1 — Buscar / Registrar Cliente  (Supabase)
// ══════════════════════════════════════════════════════════════════
async function searchClient(e) {
    e.preventDefault();
    const query = document.getElementById('client-search-input').value.trim();
    if (!query) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        // Buscar en tabla clientes por nombre o teléfono
        const { data, error } = await window.supabase
            .from('clientes')
            .select(`
                id, nombre, telefono,
                cliente_vehiculo (
                    vehiculos ( placa, marca, modelo, anio, tipo )
                )
            `)
            .or(`nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        const foundCard = document.getElementById('client-found-card');
        const newForm = document.getElementById('client-new-form-container');

        if (data) {
            // Cliente encontrado
            document.getElementById('found-client-name').textContent = data.nombre;
            document.getElementById('found-client-phone').textContent = data.telefono;
            foundCard.style.display = 'block';
            newForm.style.display = 'none';

            // Extraer vehículos del JOIN
            const vehicles = (data.cliente_vehiculo || [])
                .map(cv => cv.vehiculos)
                .filter(Boolean);

            wizardState.client = {
                id: data.id,
                nombre: data.nombre,
                telefono: data.telefono,
                vehicles,
                isNew: false,
            };
        } else {
            // Cliente no encontrado → mostrar formulario de registro
            if (/^\d/.test(query)) {
                document.getElementById('new-client-phone-input').value = query;
            } else {
                document.getElementById('new-client-name').value = query;
            }
            foundCard.style.display = 'none';
            newForm.style.display = 'block';
            document.getElementById('new-client-name').focus();
        }

    } catch (err) {
        console.error(err);
        showToast('error', 'Error de búsqueda', err.message);
    } finally {
        btn.innerHTML = 'Buscar';
        btn.disabled = false;
    }
}

async function registerNewClient(e) {
    e.preventDefault();
    const nombre = document.getElementById('new-client-name').value.trim();
    const telefono = document.getElementById('new-client-phone-input').value.trim();

    if (!nombre || !telefono) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';
    btn.disabled = true;

    try {
        const { data, error } = await window.supabase
            .from('clientes')
            .insert([{ nombre, telefono }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') throw new Error('Ya existe un cliente con ese teléfono.');
            throw error;
        }

        wizardState.client = {
            id: data.id,
            nombre: data.nombre,
            telefono: data.telefono,
            vehicles: [],
            isNew: true,
        };

        showToast('success', 'Cliente registrado', `${nombre} fue agregado correctamente.`);
        goToStep(2);

    } catch (err) {
        console.error(err);
        showToast('error', 'Error', err.message);
    } finally {
        btn.innerHTML = 'Registrar y Continuar <i class="fa-solid fa-arrow-right"></i>';
        btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════
//  PASO 2 — Vehículos  (Supabase)
// ══════════════════════════════════════════════════════════════════
async function onEnterStep2() {
    const client = wizardState.client;
    document.getElementById('current-client-display').textContent = client.nombre;

    const grid = document.getElementById('vehicles-grid');
    grid.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;opacity:0.5;"></i></div>';

    try {
        // Si el cliente ya estaba en BD, recargar sus vehículos frescos
        if (!client.isNew) {
            const { data, error } = await window.supabase
                .from('cliente_vehiculo')
                .select('vehiculos ( placa, marca, modelo, anio, tipo )')
                .eq('cliente_id', client.id);

            if (error) throw error;
            client.vehicles = (data || []).map(cv => cv.vehiculos).filter(Boolean);
        }

        grid.innerHTML = '';

        if (client.vehicles.length > 0) {
            client.vehicles.forEach(v => {
                const card = document.createElement('div');
                card.className = 'vehicle-select-card';
                card.innerHTML = `
                    <i class="fa-solid fa-car"></i>
                    <h3>${v.placa}</h3>
                    <p>${[v.marca, v.modelo].filter(Boolean).join(' ')}<br>${v.anio ? v.anio + ' · ' : ''}${v.tipo || ''}</p>
                `;
                card.addEventListener('click', () => selectVehicle(v));
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:24px; color:var(--text-secondary); font-size:14px;">
                    <i class="fa-solid fa-car-slash" style="font-size:36px; opacity:0.35; display:block; margin-bottom:12px;"></i>
                    Este cliente no tiene vehículos registrados. Agrega uno nuevo.
                </div>`;
        }

    } catch (err) {
        console.error(err);
        grid.innerHTML = '';
        showToast('error', 'Error', 'No se pudieron cargar los vehículos.');
    }
}

function selectVehicle(v) {
    wizardState.vehicle = { ...v, isNew: false };
    goToStep(3);
}

function toggleNewVehicleForm() {
    const c = document.getElementById('new-vehicle-form-container');
    c.style.display = c.style.display === 'none' ? 'block' : 'none';
    if (c.style.display === 'block') document.getElementById('veh-placa').focus();
}

async function saveNewVehicle(e) {
    e.preventDefault();
    const placa = document.getElementById('veh-placa').value.trim().toUpperCase();
    const marca = document.getElementById('veh-marca').value.trim();
    const modelo = document.getElementById('veh-modelo').value.trim();
    const anio = parseInt(document.getElementById('veh-año').value) || null;
    const tipo = document.getElementById('veh-tipo').value;

    if (!placa || !tipo) {
        showToast('error', 'Campos requeridos', 'La placa y el tipo son obligatorios.');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        // 1. Crear vehículo en tabla vehiculos (upsert por placa)
        const { error: vErr } = await window.supabase
            .from('vehiculos')
            .upsert([{ placa, marca, modelo, anio, tipo }], { onConflict: 'placa' });
        if (vErr) throw vErr;

        // 2. Vincular vehículo al cliente
        const { error: cvErr } = await window.supabase
            .from('cliente_vehiculo')
            .upsert([{ cliente_id: wizardState.client.id, vehiculo_placa: placa }],
                { onConflict: 'cliente_id,vehiculo_placa' });
        if (cvErr) throw cvErr;

        wizardState.vehicle = { placa, marca, modelo, anio, tipo, isNew: true };
        showToast('success', 'Vehículo registrado', `${placa} fue guardado y vinculado.`);
        goToStep(3);

    } catch (err) {
        console.error(err);
        showToast('error', 'Error', err.message);
    } finally {
        btn.innerHTML = 'Guardar y Continuar <i class="fa-solid fa-arrow-right"></i>';
        btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════
//  PASO 3 — Detalle de la Deuda  (Supabase)
// ══════════════════════════════════════════════════════════════════
function onEnterStep3() {
    const c = wizardState.client;
    const v = wizardState.vehicle;
    document.getElementById('summary-client').textContent = c.nombre;
    document.getElementById('summary-vehicle').textContent =
        `${v.placa}${v.marca ? ' (' + v.marca + ' ' + (v.modelo || '') + ')' : ''}`;
}

async function submitCxC(e) {
    e.preventDefault();

    const concepto = document.getElementById('cxc-concept').value.trim();
    const monto = parseFloat(document.getElementById('cxc-amount').value);
    const fecha = document.getElementById('cxc-date').value;
    const notas = document.getElementById('cxc-notes').value.trim();

    if (!concepto || isNaN(monto) || monto <= 0 || !fecha) {
        showToast('error', 'Datos incompletos', 'Completa todos los campos obligatorios.');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        const { data, error } = await window.supabase
            .from('cxc_manuales')
            .insert([{
                cliente_id: wizardState.client.id,
                cliente_nombre: wizardState.client.nombre,
                cliente_telefono: wizardState.client.telefono,
                vehiculo_placa: wizardState.vehicle.placa,
                concepto,
                notas: notas || null,
                fecha_deuda: fecha,
                monto_total: monto,
                saldo_pendiente: monto,    // saldo inicial = monto completo
                origen: 'manual',
                estado: 'pendiente',
            }])
            .select()
            .single();

        if (error) throw error;

        cxcData.unshift(data);   // agregar al inicio de la lista local
        aplicarFiltros();
        closeWizard();
        showToast('success', 'Cuenta registrada',
            `₡${monto.toLocaleString('es-CR')} a nombre de ${wizardState.client.nombre}`);

    } catch (err) {
        console.error(err);
        showToast('error', 'Error al guardar', err.message);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Registrar Cuenta por Cobrar';
        btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS — Formato y utilidades
// ══════════════════════════════════════════════════════════════════
function getInitials(name = '') {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Fecha y hora de un abono, en hora de Costa Rica (p. ej. "9 nov 2026, 10:35 a. m."). */
function formatDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-CR", {
        timeZone: "America/Costa_Rica", day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit"
    });
}

function formatMoney(n) {
    return '₡' + Number(n || 0).toLocaleString('es-CR');
}

function getBadgeOrigen(origen) {
    const map = {
        manual: '<span class="badge badge-manual">Manual</span>',
        local_comercial: '<span class="badge badge-auto">Local Comercial</span>',
        domicilio: '<span class="badge badge-domicilio">Domicilio</span>',
    };
    return map[origen] || `<span class="badge badge-manual">${origen}</span>`;
}

function getBadgeEstado(estado) {
    const map = {
        pendiente: '<span class="badge badge-pendiente">Pendiente</span>',
        parcial: '<span class="badge badge-parcial">Parcial</span>',
        pagado: '<span class="badge badge-pagado">Pagado</span>',
    };
    return map[estado] || `<span class="badge">${estado}</span>`;
}

// ══════════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════════
function showToast(type = 'info', title = '', message = '') {
    const iconMap = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${iconMap[type] || 'fa-circle-info'} toast-icon"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-msg">${message}</div>` : ''}
        </div>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// ══════════════════════════════════════════════════════════════════
//  FLUJO 2 — API PÚBLICA para insertar CxC desde otros módulos
//
//  Uso desde local_comercial/app.js o domicilio/app.js:
//
//  window.CxC.crearDesdeOrden({
//    cliente_id, cliente_nombre, cliente_telefono,
//    vehiculo_placa, concepto, monto_total,
//    origen: 'local_comercial',  // o 'domicilio'
//    orden_origen_id: ordenId    // para poder eliminarla si se paga
//  });
//
//  window.CxC.eliminarPorOrden(ordenId, origen);
// ══════════════════════════════════════════════════════════════════
window.CxC = {

    async crearDesdeOrden({ cliente_id, cliente_nombre, cliente_telefono,
        vehiculo_placa, concepto, monto_total,
        origen, orden_origen_id }) {
        try {
            const { error } = await window.supabase
                .from('cxc_manuales')
                .insert([{
                    cliente_id,
                    cliente_nombre,
                    cliente_telefono,
                    vehiculo_placa,
                    concepto,
                    fecha_deuda: new Date().toISOString().split('T')[0],
                    monto_total,
                    saldo_pendiente: monto_total,
                    origen: origen || 'local_comercial',
                    orden_origen_id,
                    estado: 'pendiente',
                }]);
            if (error) throw error;
            console.log('[CxC] Cuenta creada automáticamente desde', origen);
        } catch (err) {
            console.error('[CxC] Error creando CxC automática:', err.message);
        }
    },

    async eliminarPorOrden(orden_origen_id, origen) {
        try {
            const { error } = await window.supabase
                .from('cxc_manuales')
                .delete()
                .match({ orden_origen_id, origen });
            if (error) throw error;
            console.log('[CxC] Cuenta eliminada automáticamente para orden', orden_origen_id);
        } catch (err) {
            console.error('[CxC] Error eliminando CxC automática:', err.message);
        }
    },
};


