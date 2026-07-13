// ══════════════════════════════════════════════════════════════════
//  CUENTAS POR COBRAR — app.js  (Supabase conectado)
//  Flujo 1 : Cuenta Manual   → wizard de 3 pasos
//  Flujo 2 : Automático      → insertado desde local_comercial / domicilio
// ══════════════════════════════════════════════════════════════════

// ── Estado global ──────────────────────────────────────────────────
let activeUser     = null;
let activeUserRole = null;
let cxcData        = [];   // registros cargados desde Supabase

// ── Estado del wizard ──────────────────────────────────────────────
const wizardState = {
    currentStep : 1,
    client      : null,   // { id, nombre, telefono, isNew, vehicles[] }
    vehicle     : null,   // { placa, marca, modelo, año, tipo, isNew }
};

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabase) {
        alert('Supabase no está inicializado.');
        return;
    }

    // Verificar sesión
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) {
        window.location.href = '../login/index.html';
        return;
    }

    activeUser     = localStorage.getItem('activeUser')     || session.user.email;
    activeUserRole = localStorage.getItem('activeUserRole') || '';

    // Cargar tabla principal
    await loadCxC();

    // Fecha default paso 3
    document.getElementById('cxc-date').value = new Date().toISOString().split('T')[0];

    // Buscador
    document.getElementById('search-input').addEventListener('input', function () {
        const q = this.value.trim().toLowerCase();
        renderTable(q ? cxcData.filter(r =>
            r.cliente_nombre?.toLowerCase().includes(q)     ||
            r.cliente_telefono?.includes(q)                 ||
            r.vehiculo_placa?.toLowerCase().includes(q)     ||
            r.fecha_deuda?.includes(q)                      ||
            r.concepto?.toLowerCase().includes(q)
        ) : cxcData);
    });

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
        renderTable(cxcData);
    } catch (err) {
        console.error('Error cargando CxC:', err);
        showToast('error', 'Error', 'No se pudieron cargar las cuentas por cobrar.');
    }
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
        <tr>
            <td>
                <div class="client-cell">
                    <div class="client-avatar-sm">${getInitials(r.cliente_nombre)}</div>
                    <div>
                        <div class="client-name-cell">${r.cliente_nombre}</div>
                        <div class="client-phone-cell">${r.cliente_telefono || '—'}</div>
                    </div>
                </div>
            </td>
            <td>${r.vehiculo_placa ? `<span class="placa-tag">${r.vehiculo_placa}</span>` : '<span style="opacity:0.4">—</span>'}</td>
            <td class="date-cell">${formatDate(r.fecha_deuda)}</td>
            <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.concepto}">${r.concepto}</td>
            <td class="amount-cell">${formatMoney(r.monto_total)}</td>
            <td class="amount-cell pending">${formatMoney(r.saldo_pendiente)}</td>
            <td>${getBadgeOrigen(r.origen)}</td>
            <td>${getBadgeEstado(r.estado)}</td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon view"   title="Ver detalle"       onclick="viewCxC(${r.id})"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-icon edit"   title="Registrar abono"   onclick="openAbonoModal(${r.id})"><i class="fa-solid fa-hand-holding-dollar"></i></button>
                    ${(activeUserRole === 'Dueño' || activeUserRole === 'Soporte TI / Programador') ? `<button class="btn-icon delete" title="Eliminar" onclick="deleteCxC(${r.id})"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// ── Acciones de tabla ──────────────────────────────────────────────
function viewCxC(id) {
    const r = cxcData.find(x => x.id === id);
    if (!r) return;
    showToast('info', 'Detalle', `${r.cliente_nombre} · ${formatMoney(r.saldo_pendiente)} pendiente`);
    // TODO: abrir modal de detalle con historial de abonos
}

async function deleteCxC(id) {
    if (activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') {
        showToast('error', 'Acceso denegado', 'Solo el Dueño puede eliminar cuentas.');
        return;
    }

    const r = cxcData.find(x => x.id === id);
    const desglose = r 
        ? `Cuenta por Cobrar ID: ${id}\nCliente: ${r.cliente_nombre}\nVehículo Placa: ${r.vehiculo_placa || 'N/A'}\nMonto Total: ${formatMoney(r.monto_total)}\nSaldo Pendiente: ${formatMoney(r.saldo_pendiente)}\nConcepto: ${r.concepto || 'Sin concepto'}`
        : `Cuenta por Cobrar ID: ${id}`;

    if (!confirm('¿Eliminar esta cuenta por cobrar permanentemente?')) return;

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
        renderTable(cxcData);
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
    document.getElementById('abono-cxc-id').value    = r.id;
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
    document.getElementById('abono-notas').value       = '';
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
    document.getElementById('btn-tipo-abono').classList.toggle('active',  isParcial);
    document.getElementById('btn-tipo-saldar').classList.toggle('active', !isParcial);

    // Campos
    document.getElementById('abono-monto-group').style.display = isParcial ? 'flex' : 'none';
    document.getElementById('abono-saldar-msg').style.display  = isParcial ? 'none'  : 'block';

    const input = document.getElementById('abono-monto-input');
    if (isParcial) {
        input.required = true;
        input.focus();
    } else {
        input.required = false;
        input.value    = '';
    }

    // Texto del botón
    document.getElementById('btn-submit-abono').innerHTML = isParcial
        ? '<i class="fa-solid fa-coins"></i> Registrar Abono'
        : '<i class="fa-solid fa-circle-check"></i> Saldar Cuenta';
}

async function submitAbono(e) {
    e.preventDefault();

    const cxcId    = parseInt(document.getElementById('abono-cxc-id').value);
    const tipo     = document.getElementById('abono-tipo-hidden').value;
    const metodo   = document.querySelector('input[name="metodo_pago"]:checked')?.value || 'Efectivo';
    const notas    = document.getElementById('abono-notas').value.trim();

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
    btn.disabled  = true;

    try {
        // Insertar abono — el TRIGGER en Supabase actualiza saldo_pendiente y estado automáticamente
        const { error } = await window.supabase
            .from('cxc_abonos')
            .insert([{
                cxc_id          : cxcId,
                monto_abono     : monto,
                metodo_pago     : metodo,
                notas           : notas || null,
                registrado_por  : activeUser,
            }]);

        if (error) throw error;

        closeAbonoModal();

        // Recargar datos frescos desde Supabase (el trigger ya actualizó el saldo)
        await loadCxC();

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
        btn.disabled  = false;
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
    wizardState.client      = null;
    wizardState.vehicle     = null;

    // Pasos
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    updateProgress(1);

    // Paso 1
    document.getElementById('client-search-input').value            = '';
    document.getElementById('client-found-card').style.display      = 'none';
    document.getElementById('client-new-form-container').style.display = 'none';
    document.getElementById('found-client-name').textContent        = '—';
    document.getElementById('found-client-phone').textContent       = '—';
    document.getElementById('new-client-name').value                = '';
    document.getElementById('new-client-phone-input').value         = '';

    // Paso 2
    document.getElementById('vehicles-grid').innerHTML              = '';
    document.getElementById('new-vehicle-form-container').style.display = 'none';
    ['veh-placa','veh-marca','veh-modelo','veh-año','veh-tipo'].forEach(id => {
        document.getElementById(id).value = '';
    });

    // Paso 3
    document.getElementById('cxc-concept').value = '';
    document.getElementById('cxc-amount').value  = '';
    document.getElementById('cxc-date').value    = new Date().toISOString().split('T')[0];
    document.getElementById('cxc-notes').value   = '';
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
        if (i < active)  el.classList.add('completed');
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
    btn.disabled  = true;

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
        const newForm   = document.getElementById('client-new-form-container');

        if (data) {
            // Cliente encontrado
            document.getElementById('found-client-name').textContent  = data.nombre;
            document.getElementById('found-client-phone').textContent = data.telefono;
            foundCard.style.display = 'block';
            newForm.style.display   = 'none';

            // Extraer vehículos del JOIN
            const vehicles = (data.cliente_vehiculo || [])
                .map(cv => cv.vehiculos)
                .filter(Boolean);

            wizardState.client = {
                id       : data.id,
                nombre   : data.nombre,
                telefono : data.telefono,
                vehicles,
                isNew    : false,
            };
        } else {
            // Cliente no encontrado → mostrar formulario de registro
            if (/^\d/.test(query)) {
                document.getElementById('new-client-phone-input').value = query;
            } else {
                document.getElementById('new-client-name').value = query;
            }
            foundCard.style.display = 'none';
            newForm.style.display   = 'block';
            document.getElementById('new-client-name').focus();
        }

    } catch (err) {
        console.error(err);
        showToast('error', 'Error de búsqueda', err.message);
    } finally {
        btn.innerHTML = 'Buscar';
        btn.disabled  = false;
    }
}

async function registerNewClient(e) {
    e.preventDefault();
    const nombre   = document.getElementById('new-client-name').value.trim();
    const telefono = document.getElementById('new-client-phone-input').value.trim();

    if (!nombre || !telefono) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';
    btn.disabled  = true;

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
            id       : data.id,
            nombre   : data.nombre,
            telefono : data.telefono,
            vehicles : [],
            isNew    : true,
        };

        showToast('success', 'Cliente registrado', `${nombre} fue agregado correctamente.`);
        goToStep(2);

    } catch (err) {
        console.error(err);
        showToast('error', 'Error', err.message);
    } finally {
        btn.innerHTML = 'Registrar y Continuar <i class="fa-solid fa-arrow-right"></i>';
        btn.disabled  = false;
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
    const placa  = document.getElementById('veh-placa').value.trim().toUpperCase();
    const marca  = document.getElementById('veh-marca').value.trim();
    const modelo = document.getElementById('veh-modelo').value.trim();
    const anio   = parseInt(document.getElementById('veh-año').value) || null;
    const tipo   = document.getElementById('veh-tipo').value;

    if (!placa || !tipo) {
        showToast('error', 'Campos requeridos', 'La placa y el tipo son obligatorios.');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    btn.disabled  = true;

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
        btn.disabled  = false;
    }
}

// ══════════════════════════════════════════════════════════════════
//  PASO 3 — Detalle de la Deuda  (Supabase)
// ══════════════════════════════════════════════════════════════════
function onEnterStep3() {
    const c = wizardState.client;
    const v = wizardState.vehicle;
    document.getElementById('summary-client').textContent  = c.nombre;
    document.getElementById('summary-vehicle').textContent =
        `${v.placa}${v.marca ? ' (' + v.marca + ' ' + (v.modelo || '') + ')' : ''}`;
}

async function submitCxC(e) {
    e.preventDefault();

    const concepto = document.getElementById('cxc-concept').value.trim();
    const monto    = parseFloat(document.getElementById('cxc-amount').value);
    const fecha    = document.getElementById('cxc-date').value;
    const notas    = document.getElementById('cxc-notes').value.trim();

    if (!concepto || isNaN(monto) || monto <= 0 || !fecha) {
        showToast('error', 'Datos incompletos', 'Completa todos los campos obligatorios.');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    btn.disabled  = true;

    try {
        const { data, error } = await window.supabase
            .from('cxc_manuales')
            .insert([{
                cliente_id       : wizardState.client.id,
                cliente_nombre   : wizardState.client.nombre,
                cliente_telefono : wizardState.client.telefono,
                vehiculo_placa   : wizardState.vehicle.placa,
                concepto,
                notas            : notas || null,
                fecha_deuda      : fecha,
                monto_total      : monto,
                saldo_pendiente  : monto,    // saldo inicial = monto completo
                origen           : 'manual',
                estado           : 'pendiente',
            }])
            .select()
            .single();

        if (error) throw error;

        cxcData.unshift(data);   // agregar al inicio de la lista local
        renderTable(cxcData);
        closeWizard();
        showToast('success', 'Cuenta registrada',
            `₡${monto.toLocaleString('es-CR')} a nombre de ${wizardState.client.nombre}`);

    } catch (err) {
        console.error(err);
        showToast('error', 'Error al guardar', err.message);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Registrar Cuenta por Cobrar';
        btn.disabled  = false;
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

function formatMoney(n) {
    return '₡' + Number(n || 0).toLocaleString('es-CR');
}

function getBadgeOrigen(origen) {
    const map = {
        manual          : '<span class="badge badge-manual">Manual</span>',
        local_comercial : '<span class="badge badge-auto">Local Comercial</span>',
        domicilio       : '<span class="badge badge-auto" style="background:rgba(155,89,182,0.1);color:#a78bfa;border-color:rgba(155,89,182,0.25);">Domicilio</span>',
    };
    return map[origen] || `<span class="badge badge-manual">${origen}</span>`;
}

function getBadgeEstado(estado) {
    const map = {
        pendiente : '<span class="badge badge-pendiente">Pendiente</span>',
        parcial   : '<span class="badge badge-parcial">Parcial</span>',
        pagado    : '<span class="badge badge-pagado">Pagado</span>',
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
                    fecha_deuda     : new Date().toISOString().split('T')[0],
                    monto_total,
                    saldo_pendiente : monto_total,
                    origen          : origen || 'local_comercial',
                    orden_origen_id,
                    estado          : 'pendiente',
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


