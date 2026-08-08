const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbykRunJyxYMbrWyeQl7pyOxUPVr7trGFp4qS9avRi4giNaadHeo4SIs41oX7nh5j7HIRw/exec";

// Global Variables
let activeUser = null;
let activeUserRole = null;
let todayDomicilios = [];

// Wizard State
let currentClientId = null;
let currentClientName = null;
let currentClientPhone = null;
let currentClientAddress = null;

let currentVehiclePlaca = null;
let currentVehicleMarca = null;
let currentVehicleModelo = null;
let currentVehicleAno = null;
let currentVehicleTipo = null;

let ordenData = {
    hora_agendada: null,
    servicios_maestros: [],
    detallado_tipo: null,
    promo_detalle: null,
    extra_interior: null,
    extra_aroma: null,
    extra_alfombras: null,
    detallados_especiales: [],
    extras_finales: []
};

document.addEventListener('DOMContentLoaded', async () => {
    activeUser = localStorage.getItem('activeUser');
    activeUserRole = localStorage.getItem('activeUserRole');
    
    if (!activeUser) {
        window.location.href = '../login/index.html';
        return;
    }
    
    document.getElementById('display-user').textContent = activeUser;
    
    const today = new Date();
    document.getElementById('today-date-badge').textContent = today.toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    setupStep1();
    setupStep2();
    setupStep3();
    setupStep4();
    setupStep5();
    setupStep6();
    setupStep7();
    setupStep8();
    setupPagoModal();

    await loadTodayDomicilios();
});

// ==========================================
// WIZARD NAVIGATION
// ==========================================
function goToStep(stepNum) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById('step-' + stepNum).classList.add('active');

    // Update Progress Indicator
    const numEl = document.getElementById('current-step-num');
    const nameEl = document.getElementById('current-step-name');
    numEl.textContent = stepNum;
    
    switch(stepNum) {
        case 1: nameEl.textContent = 'Agenda y Cliente'; break;
        case 2: nameEl.textContent = 'Vehículo'; break;
        case 3: nameEl.textContent = 'Servicios Maestros'; break;
        case 4: nameEl.textContent = 'Tipo de Detallado'; break;
        case 5: nameEl.textContent = 'Opciones de Interior'; break;
        case 6: nameEl.textContent = 'Detallados Especiales'; break;
        case 7: nameEl.textContent = 'Extras Finales'; break;
        case 8: 
            nameEl.textContent = 'Cobro y Cierre'; 
            buildResumen();
            break;
    }

    if (stepNum === 2) {
        document.getElementById('current-client-display').textContent = currentClientName;
        loadClientVehicles();
    }
    if (stepNum === 3) {
        document.getElementById('current-vehicle-display').textContent = currentVehiclePlaca + ' (' + currentVehicleTipo + ')';
        const backBtn = document.querySelector('#step-3 .btn-back-step');
        if (backBtn) {
            backBtn.style.display = isEditingOrdenId ? 'none' : 'inline-block';
        }
    }
    if (stepNum === 6) {
        // Toggle Moto Options
        const isMoto = currentVehicleTipo === 'MOTO';
        document.querySelectorAll('#especiales-list .auto-only').forEach(el => {
            el.style.display = isMoto ? 'none' : 'flex';
            if (isMoto) el.querySelector('input').checked = false;
        });
    }
    if (stepNum === 7) {
        const isMoto = currentVehicleTipo === 'MOTO';
        document.querySelectorAll('#step-7 .auto-only').forEach(el => {
            el.style.display = isMoto ? 'none' : 'flex';
            if (isMoto) el.querySelector('input').checked = false;
        });
    }
}

// Logic to determine previous step based on selected paths
function getPreviousStep(currentStep) {
    if (currentStep === 4) return 3;
    if (currentStep === 5) return 4;
    if (currentStep === 6) {
        if (ordenData.servicios_maestros.includes('Detallado y lavado')) {
            return currentVehicleTipo === 'MOTO' ? 4 : 5;
        }
        return 3;
    }
    if (currentStep === 7) {
        if (ordenData.servicios_maestros.includes('Detallados especiales')) return 6;
        if (ordenData.servicios_maestros.includes('Detallado y lavado')) {
            return currentVehicleTipo === 'MOTO' ? 4 : 5;
        }
        return 3;
    }
    if (currentStep === 8) return 7;
    return currentStep - 1;
}

// ==========================================
// ROUTING LOGIC
// ==========================================
function proceedFromDetalladoLavadoExtras() {
    if (ordenData.servicios_maestros.includes('Detallados especiales')) {
        goToStep(6);
    } else {
        goToStep(7);
    }
}

function proceedFromDetalladosEspeciales() {
    goToStep(7);
}


// ==========================================
// STEP 1: CLIENTE
// ==========================================
function setupStep1() {
    const searchForm = document.getElementById('search-client-form');
    const newForm = document.getElementById('client-new-form');
    const foundCard = document.getElementById('client-found-card');
    const phoneInput = document.getElementById('phone-search');
    const horaInput = document.getElementById('hora-agendada');

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = phoneInput.value.trim();
        const hora = horaInput.value;
        if (!hora) {
            showToast('Error', 'Debes ingresar la hora agendada.', 'error');
            return;
        }
        
        const btn = document.getElementById('btn-search-client');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const { data, error } = await window.supabase
                .from('clientes')
                .select('*')
                .or(`telefono.eq.${phone},nombre.ilike.%${phone}%`);

            if (error) throw error;

            const resultArea = document.getElementById('client-result-area');
            resultArea.style.display = 'block';

            if (data && data.length > 0) {
                const client = data[0];
                currentClientId = client.id;
                currentClientName = client.nombre;
                currentClientPhone = client.telefono;
                
                document.getElementById('found-client-name').textContent = client.nombre;
                document.getElementById('found-client-phone').textContent = client.telefono;
                document.getElementById('found-client-address').value = client.direccion || '';
                
                foundCard.style.display = 'block';
                newForm.style.display = 'none';
            } else {
                currentClientId = null;
                currentClientPhone = phone;
                foundCard.style.display = 'none';
                newForm.style.display = 'block';
                document.getElementById('new-client-name').focus();
            }
        } catch (err) {
            console.error('Error buscando cliente:', err);
            showToast('Error', 'Hubo un error al buscar el cliente.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Buscar';
        }
    });

    document.getElementById('btn-continue-step2').addEventListener('click', async () => {
        ordenData.hora_agendada = horaInput.value;
        const addr = document.getElementById('found-client-address').value.trim();
        if(!addr) {
            showToast('Error', 'La dirección del domicilio es obligatoria.', 'error');
            return;
        }
        currentClientAddress = addr;
        
        await window.supabase.from('clientes').update({ direccion: addr }).eq('id', currentClientId);
        goToStep(2);
    });

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        ordenData.hora_agendada = horaInput.value;
        const name = document.getElementById('new-client-name').value.trim();
        const addr = document.getElementById('new-client-address').value.trim();
        
        if(!addr) {
            showToast('Error', 'La dirección del domicilio es obligatoria.', 'error');
            return;
        }
        
        const btn = document.getElementById('btn-register-client');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';

        try {
            const { data, error } = await window.supabase
                .from('clientes')
                .insert([{ nombre: name, telefono: currentClientPhone, direccion: addr }])
                .select()
                .single();

            if (error) throw error;
            
            currentClientId = data.id;
            currentClientName = data.nombre;
            currentClientAddress = data.direccion;
            
            goToStep(2);
        } catch (err) {
            console.error('Error registrando cliente:', err);
            showToast('Error', 'No se pudo registrar el cliente.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Registrar y Continuar <i class="fa-solid fa-arrow-right"></i>';
        }
    });
}

// ==========================================
// STEP 2: TIPO DE VEHÍCULO
// ==========================================
function setupStep2() {
    // Ya no se inicializan búsquedas ni modales aquí.
}

window.seleccionarVehiculoDomicilio = function(tipo) {
    currentVehicleTipo = tipo;
    currentVehiclePlaca = "SIN PLACA";
    currentVehicleMarca = "N/A";
    currentVehicleModelo = "N/A";
    document.getElementById('current-vehicle-display').textContent = tipo;
    goToStep(3);
}

async function loadClientVehicles() {
    // Ya no cargamos la lista de vehículos, pero actualizamos el UI si hace falta
    const clientDisplay = document.getElementById('current-client-display');
    if (clientDisplay) clientDisplay.textContent = currentClientName;
}

// ==========================================
// STEP 3: SERVICIOS MAESTROS
// ==========================================
function setupStep3() {
    window.processStep3 = function() {
        const checkboxes = document.querySelectorAll('#step-3 .service-checkbox:checked');
        const err = document.getElementById('error-step3');
        if (checkboxes.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';
        
        ordenData.servicios_maestros = Array.from(checkboxes).map(c => c.value);
        
        if (ordenData.servicios_maestros.includes('Detallado y lavado')) {
            goToStep(4);
        } else if (ordenData.servicios_maestros.includes('Detallados especiales')) {
            goToStep(6);
        }
    }
}

// ==========================================
// STEP 4: TIPO DE DETALLADO
// ==========================================
function setupStep4() {
    document.querySelectorAll('input[name="detallado_tipo"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const promoContainer = document.getElementById('promo-input-container');
            if (e.target.value === 'Promocion') {
                promoContainer.style.display = 'block';
            } else {
                promoContainer.style.display = 'none';
            }
            
            const warning = document.getElementById('interior-warning');
            const cardMate = document.getElementById('card-mate');
            const cardBri = document.getElementById('card-brillante');
            if (cardMate && cardBri && warning) {
                if (e.target.value === 'Detallado clasico') {
                    cardMate.style.opacity = '0.5';
                    cardMate.querySelector('input').disabled = true;
                    cardBri.style.opacity = '0.5';
                    cardBri.querySelector('input').disabled = true;
                    warning.style.display = 'block';
                    
                    let currInt = document.querySelector('input[name="extra_interior"]:checked');
                    if(currInt && (currInt.value==='Mate'||currInt.value==='Brillante')) {
                        currInt.checked = false;
                    }
                } else {
                    cardMate.style.opacity = '1';
                    cardMate.querySelector('input').disabled = false;
                    cardBri.style.opacity = '1';
                    cardBri.querySelector('input').disabled = false;
                    warning.style.display = 'none';
                }
            }
        });
    });

    window.processStep4 = function() {
        const selected = document.querySelector('input[name="detallado_tipo"]:checked');
        const err = document.getElementById('error-step4');
        if (!selected) { err.style.display = 'block'; return; }
        
        if (selected.value === 'Promocion') {
            const detail = document.getElementById('promo-detalle').value.trim();
            if (!detail) { err.style.display = 'block'; return; }
            ordenData.promo_detalle = detail;
        }
        err.style.display = 'none';
        ordenData.detallado_tipo = selected.value;
        if(currentVehicleTipo === 'MOTO') {
            proceedFromDetalladoLavadoExtras();
        } else {
            goToStep(5);
        }
    }
}

// ==========================================
// STEP 5: EXTRAS DE DETALLADO (Interior)
// ==========================================
function setupStep5() {
    window.processStep5 = function() {
        const interior = document.querySelector('input[name="extra_interior"]:checked');
        const aroma = document.querySelector('input[name="extra_aroma"]:checked');
        const alfombras = document.querySelector('input[name="extra_alfombras"]:checked');
        const err = document.getElementById('error-step5');
        
        if (!interior || !aroma || !alfombras) { err.style.display = 'block'; return; }
        err.style.display = 'none';
        
        ordenData.extra_interior = interior.value;
        ordenData.extra_aroma = aroma.value;
        ordenData.extra_alfombras = alfombras.value;
        
        proceedFromDetalladoLavadoExtras();
    }
}

// ==========================================
// STEP 6: ESPECIALES
// ==========================================
function setupStep6() {
    window.processStep6 = function() {
        const checkboxes = document.querySelectorAll('.especial-cb:checked');
        const err = document.getElementById('error-step6');
        if (checkboxes.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';
        
        ordenData.detallados_especiales = Array.from(checkboxes).map(c => c.value);
        proceedFromDetalladosEspeciales();
    }
}

// ==========================================
// STEP 7: EXTRAS FINALES
// ==========================================
window.toggleNingunoExtra = function(checkbox) {
    if(checkbox.checked) {
        document.querySelectorAll('.extra-final-cb').forEach(cb => {
            if(cb !== checkbox) cb.checked = false;
        });
    }
}

function setupStep7() {
    document.querySelectorAll('.extra-final-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if(e.target.id !== 'extra-ninguno' && e.target.checked) {
                document.getElementById('extra-ninguno').checked = false;
            }
        });
    });

    window.processStep7 = function() {
        const checked = document.querySelectorAll('.extra-final-cb:checked');
        const err = document.getElementById('error-step7');
        if(checked.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        ordenData.extras_finales = Array.from(checked).map(c => c.value);
        goToStep(8);
    }
}

// ==========================================
// STEP 8: COBRO
// ==========================================
function buildResumen() {
    document.getElementById('cobro-asesor').textContent = activeUser;

    const ul = document.getElementById('resumen-final');
    let html = `
        <li><strong>Cliente:</strong> ${currentClientName}</li>
        <li><strong>Dirección:</strong> ${currentClientAddress}</li>
        <li><strong>Hora Agendada:</strong> ${ordenData.hora_agendada}</li>
        <li><strong>Vehículo:</strong> ${currentVehiclePlaca} (${currentVehicleTipo})</li>
        <hr style="border-color:var(--border-color); margin: 12px 0;">
        <li><h3 style="color:var(--primary-accent); margin-bottom:8px;">Servicios Solicitados</h3></li>
        <li>${ordenData.servicios_maestros.join(' | ')}</li>
    `;
    
    if (ordenData.servicios_maestros.includes('Detallado y lavado')) {
        html += `<hr style="border-color:var(--border-color); margin: 12px 0;">
                 <li><h3 style="color:var(--primary-accent); margin-bottom:8px;">Detallado</h3></li>
                 <li><strong>Paquete:</strong> ${ordenData.detallado_tipo === 'Promocion' ? 'Promoción: ' + ordenData.promo_detalle : ordenData.detallado_tipo}</li>`;
        
        if (currentVehicleTipo !== 'MOTO') {
            html += `<li><strong>Interior:</strong> ${ordenData.extra_interior} | <strong>Aroma:</strong> ${ordenData.extra_aroma} | <strong>Alfombras:</strong> ${ordenData.extra_alfombras}</li>`;
        }
    }

    if (ordenData.detallados_especiales.length > 0) {
        html += `<hr style="border-color:var(--border-color); margin: 12px 0;">
                 <li><h3 style="color:var(--primary-accent); margin-bottom:8px;">Especiales</h3></li>
                 <li>${ordenData.detallados_especiales.join(', ')}</li>`;
    }

    if (ordenData.extras_finales && ordenData.extras_finales.length > 0 && !ordenData.extras_finales.includes('Ninguno')) {
        html += `<hr style="border-color:var(--border-color); margin: 12px 0;">
                 <li><h3 style="color:var(--primary-accent); margin-bottom:8px;">Extras Finales</h3></li>
                 <li>${ordenData.extras_finales.join(', ')}</li>`;
    }

    ul.innerHTML = html;
}



let isEditingOrdenId = null;

function setupStep8() {
    document.getElementById('btn-submit-final').addEventListener('click', async () => {
        const total = parseFloat(document.getElementById('orden-total').value) || 0;
        
        const btn = document.getElementById('btn-submit-final');
        const btnOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        // Armamos el texto consolidado para Supabase y Sheets
        let detalladoFull = "No aplica";
        if (ordenData.servicios_maestros.includes('Detallado y lavado')) {
            detalladoFull = ordenData.detallado_tipo === 'Promocion' ? 'Promoción: ' + ordenData.promo_detalle : ordenData.detallado_tipo;
            if (currentVehicleTipo !== 'MOTO') {
                detalladoFull += ` | Int: ${ordenData.extra_interior} | Aroma: ${ordenData.extra_aroma} | Alf: ${ordenData.extra_alfombras}`;
            }
        }

        let especialesFull = "No aplica";
        let todasEspeciales = [...ordenData.detallados_especiales];
        if (ordenData.extras_finales && ordenData.extras_finales.length > 0 && !ordenData.extras_finales.includes('Ninguno')) {
            todasEspeciales.push(...ordenData.extras_finales);
        }
        if (todasEspeciales.length > 0) {
            especialesFull = todasEspeciales.join(', ');
        }

        try {
            let orderPayload = {
                cliente_id: currentClientId,
                hora_agendada: ordenData.hora_agendada,
                direccion: currentClientAddress,
                tipo_vehiculo: currentVehicleTipo,
                placa: currentVehiclePlaca,
                marca: currentVehicleMarca,
                modelo: currentVehicleModelo,
                
                detallado_tipo: detalladoFull,
                detallados_especiales: JSON.stringify(todasEspeciales),
                
                metodo_pago: 'Pendiente',
                monto_efectivo: 0,
                monto_tarjeta: 0,
                monto_sinpe: 0,
                monto_cxc: 0,
                monto_transferencia: 0,
                monto_regalia: 0,
                total_monto: total,
                responsable: activeUser
            };

            let nuevaOrden;
            if (isEditingOrdenId) {
                if (window.originalOrderDataForAlert) {
                    const EMAIL_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzk_1S1D3r25jlfnNXHocOuzeQZiL-GpGwgqkuilgpC2ObP-YYdX09CLH5GePMFQ9GQ/exec";
                    const alertPayload = {
                        action: 'edit_alert',
                        modulo: 'Servicios a Domicilio',
                        usuario: activeUser,
                        detalle: JSON.stringify(window.originalOrderDataForAlert, null, 2)
                    };
                    fetch(EMAIL_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify(alertPayload)
                    }).catch(e => console.error(e));
                }
                const { data, error } = await window.supabase
                    .from('ordenes_domicilio')
                    .update(orderPayload)
                    .eq('id', isEditingOrdenId)
                    .select();
                if (error) throw error;
                nuevaOrden = data[0];
            } else {
                const { data, error } = await window.supabase
                    .from('ordenes_domicilio')
                    .insert([orderPayload])
                    .select();
                if (error) throw error;
                nuevaOrden = data[0];
            }

            // Enviar a Google Sheets
            if (GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "") {
                // Al ser edicion, si lo mandamos como NUEVA_ORDEN_DOMICILIO va a duplicar, asi que lo mandamos con update
                const payload = {
                    action: isEditingOrdenId ? "update_domicilio" : "create",
                    tipo_hoja: 'NUEVA_ORDEN_DOMICILIO',
                    orden_id: nuevaOrden.id,
                    hora_agendada: ordenData.hora_agendada,
                    nombre_cliente: currentClientName,
                    celular_cliente: currentClientPhone,
                    direccion: currentClientAddress,
                    tipo_vehiculo: currentVehicleTipo,
                    servicio_detallado: detalladoFull,
                    servicios_especiales: especialesFull,
                    metodo_pago: 'Pendiente',
                    monto_efectivo: 0,
                    monto_tarjeta: 0,
                    monto_sinpe: 0,
                    monto_cxc: 0,
                    monto_transferencia: 0,
                    monto_regalia: 0,
                    total_monto: total
                };
                
                try {
                    fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify(payload)
                    });
                } catch(e) {}
            }

            showToast('Éxito', 'Domicilio guardado correctamente', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (err) {
            console.error(err);
            showToast('Error', 'No se pudo guardar la orden', 'error');
            btn.innerHTML = btnOriginal;
            btn.disabled = false;
        }
    });
}

// ==========================================
// PIZARRA DERECHA (DOMICILIOS HOY)
// ==========================================
async function loadTodayDomicilios() {
    const board = document.getElementById('domicilio-board');
    const emptyState = document.getElementById('board-empty-state');
    const statCount = document.getElementById('stat-count');
    const statTotal = document.getElementById('stat-total');

    board.innerHTML = '<div style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</div>';

    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const { data, error } = await window.supabase
            .from('ordenes_domicilio')
            .select(`
                *,
                clientes(nombre, telefono)
            `)
            .gte('created_at', startOfDay.toISOString())
            .order('hora_agendada', { ascending: true });

        if (error) throw error;
        board.innerHTML = '';
        todayDomicilios = data;

        if (data.length === 0) {
            emptyState.style.display = 'block';
            statCount.textContent = '0';
            statTotal.textContent = '₡0';
            return;
        }

        emptyState.style.display = 'none';
        statCount.textContent = data.length.toString();
        
        let sum = 0;

        data.forEach(ord => {
            sum += parseFloat(ord.total_monto) || 0;
            
            const clientName = ord.clientes ? ord.clientes.nombre : 'Desconocido';
            const clientPhone = ord.clientes ? ord.clientes.telefono : '';

            // Mostrar el servicio detallado o especiales para referencia rapida
            let resumenServicio = "";
            if (ord.detallado_tipo !== "No aplica") {
                resumenServicio = ord.detallado_tipo.split('|')[0].trim(); // Mostrar solo el paquete para no recargar visual
            } else {
                resumenServicio = "Especiales";
            }

            let isPagado = (ord.metodo_pago && ord.metodo_pago !== 'Pendiente');

            let tagsHtml = `<span style="margin-right:8px;">Domicilio</span>`;
            if (resumenServicio !== "Especiales") {
                tagsHtml += `<span>Detallado</span>`;
            } else {
                tagsHtml += `<span>Especiales</span>`;
            }

            let icon = '<i class="fa-solid fa-car"></i>';
            if(ord.tipo_vehiculo === 'MOTO') icon = '<i class="fa-solid fa-motorcycle"></i>';

            let payBtnHtml = '';
            if (!isPagado) {
                payBtnHtml = `<button class="btn-pay" title="Cobrar" onclick="abrirModalPago('${ord.id}', '${ord.total_monto || 0}')"><i class="fa-solid fa-check"></i></button>`;
            } else {
                payBtnHtml = `<button class="btn-pay" title="Pagado" disabled style="opacity:0.5; cursor:not-allowed;"><i class="fa-solid fa-check"></i></button>`;
            }

            let editBtnHtml = `<button class="btn-edit" title="Editar Domicilio" onclick="modificarDomicilio('${ord.id}')"><i class="fa-solid fa-pencil"></i></button>`;
            let deleteBtnHtml = '';
            
            const activeUserRole = localStorage.getItem('activeUserRole');

            if (activeUserRole === 'Dueño' || activeUserRole === 'Administrador' || activeUserRole === 'Soporte TI / Programador') {
                deleteBtnHtml = `<button class="btn-delete" title="Eliminar Orden" onclick="deleteDomicilio('${ord.id}')"><i class="fa-solid fa-trash-can"></i></button>`;
            }

            const card = document.createElement('div');
            card.className = `car-card status-terminado`; // default nice border
            card.innerHTML = `
                <div class="car-card-header">
                    <div style="display:flex;">
                        <div class="car-icon-wrapper">${icon}</div>
                        <div class="car-info">
                            <h3 class="car-placa" style="font-size: 1rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ord.direccion || 'Sin dirección'}">${ord.direccion || 'Sin dirección'}</h3>
                            <p class="car-modelo">${ord.tipo_vehiculo || 'Vehículo'} | Agendado: ${ord.hora_agendada || '--:--'}</p>
                        </div>
                    </div>
                    <span class="car-orden-id">#${ord.id}</span>
                </div>
                
                <div class="car-details">
                    <p><i class="fa-solid fa-user"></i> ${clientName}</p>
                </div>
                
                <div class="car-tags" style="font-size:13px; color:var(--text-secondary); margin-top:8px;">${tagsHtml}</div>
                
                <div class="car-finance">
                    <span class="monto-total">${isPagado ? '<span style="color:var(--success-color); font-weight:700;">Pagado</span>' : '₡' + parseFloat(ord.total_monto || 0).toLocaleString('en-US')}</span>
                    <span class="pago-status ${isPagado ? 'pago-pagado' : 'pago-pendiente'}">${isPagado ? 'PAGADO' : 'PENDIENTE'}</span>
                </div>
                
                <div class="car-actions">
                    ${payBtnHtml}
                    ${editBtnHtml}
                    ${deleteBtnHtml}
                </div>
            `;
            board.appendChild(card);
        });
        statTotal.textContent = `₡${sum.toLocaleString()}`;

    } catch (err) {
        console.error(err);
        board.innerHTML = '<p class="text-danger" style="text-align:center;">Error al cargar domicilios.</p>';
    }
}

function setupPagoModal() {
    const modal = document.getElementById('modal-pago-domicilio');
    
    // Manejar Toggles
    document.querySelectorAll('.pay-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const container = document.getElementById(targetId);
            const label = e.target.parentElement;
            const inputField = container.querySelector('input');
            
            if (e.target.checked) {
                container.style.display = 'block';
                label.classList.add('active');
                
                // Si es el único seleccionado y está vacío, prellenarlo con el total
                const checkedBoxes = document.querySelectorAll('.pay-toggle:checked');
                if (checkedBoxes.length === 1 && !inputField.value) {
                    const total = parseFloat(document.getElementById('pago-total-real').value || 0);
                    inputField.value = total;
                }
            } else {
                container.style.display = 'none';
                label.classList.remove('active');
                inputField.value = ''; // Limpiar si se desmarca
            }
        });
    });

    document.getElementById('form-pago-domicilio').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('btn-submit-pago');
        const validationMsg = document.getElementById('modal-payment-validation-msg');
        validationMsg.style.display = 'none';
        
        const total = parseFloat(document.getElementById('pago-total-real').value || 0);
        
        let efectivo = parseFloat(document.getElementById('modal-pay-efectivo').value) || 0;
        let tarjeta = parseFloat(document.getElementById('modal-pay-tarjeta').value) || 0;
        let sinpe = parseFloat(document.getElementById('modal-pay-sinpe').value) || 0;
        let cxc = parseFloat(document.getElementById('modal-pay-cxc').value) || 0;
        let transferencia = parseFloat(document.getElementById('modal-pay-transferencia').value) || 0;
        let regalia = parseFloat(document.getElementById('modal-pay-regalia').value) || 0;
        
        const suma = efectivo + tarjeta + sinpe + cxc + transferencia + regalia;
        
        if (suma !== total) {
            validationMsg.textContent = `Los montos no cuadran. Suma: ₡${suma}, Total Orden: ₡${total}`;
            validationMsg.style.display = 'block';
            return;
        }
        
        let metodosSeleccionados = [];
        if (efectivo > 0) metodosSeleccionados.push("Efectivo");
        if (tarjeta > 0) metodosSeleccionados.push("Tarjeta");
        if (sinpe > 0) metodosSeleccionados.push("Sinpe");
        if (cxc > 0) metodosSeleccionados.push("CxC");
        if (transferencia > 0) metodosSeleccionados.push("Transferencia");
        if (regalia > 0) metodosSeleccionados.push("Regalía");
        
        if (metodosSeleccionados.length === 0) {
            validationMsg.textContent = 'Seleccione al menos un método de pago y asigne un monto.';
            validationMsg.style.display = 'block';
            return;
        }
        
        const metodoFinal = metodosSeleccionados.length > 1 ? "Mixto" : metodosSeleccionados[0];
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        
        const ordenId = document.getElementById('pago-orden-id').textContent;
        const activeUser = localStorage.getItem('activeUser') || 'Desconocido';
        
        try {
            const { error } = await window.supabase
                .from('ordenes_domicilio')
                .update({
                    metodo_pago: metodoFinal,
                    monto_efectivo: efectivo,
                    monto_tarjeta: tarjeta,
                    monto_sinpe: sinpe,
                    monto_cxc: cxc,
                    monto_transferencia: transferencia,
                    monto_regalia: regalia
                })
                .eq('id', ordenId);
                
            if (error) throw error;
            
            try {
                if (typeof GOOGLE_SHEETS_WEBHOOK_URL !== 'undefined') {
                    const sheetPayload = {
                        action: "update_pago_domicilio",
                        orden_id: ordenId,
                        metodo_pago: metodoFinal,
                        monto_efectivo: efectivo,
                        monto_tarjeta: tarjeta,
                        monto_sinpe: sinpe,
                        monto_cxc: cxc,
                        monto_transferencia: transferencia,
                        monto_regalia: regalia,
                        responsable_cobro: activeUser,
                        hora_pago: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
                    };
                    fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify(sheetPayload),
                        headers: { "Content-Type": "text/plain" }
                    });
                }
            } catch(e) { console.error("Error Sheets", e); }
            
            if (cxc > 0) {
                try {
                    let clienteId = null;
                    let clienteNombre = "Cliente Domicilio";
                    let clienteTelefono = "";
                    let vehiculoPlaca = "Sin placa";

                    const { data: orderData } = await window.supabase
                        .from('ordenes_domicilio')
                        .select('cliente_id, clientes(nombre, telefono)')
                        .eq('id', ordenId)
                        .single();
                        
                    if (orderData) {
                        clienteId = orderData.cliente_id;
                        if (orderData.clientes) {
                            clienteNombre = orderData.clientes.nombre;
                            clienteTelefono = orderData.clientes.telefono;
                        }
                    }

                    await window.supabase.from('cxc_manuales').insert([{
                        cliente_id: clienteId,
                        cliente_nombre: clienteNombre,
                        cliente_telefono: clienteTelefono,
                        vehiculo_placa: vehiculoPlaca,
                        concepto: 'Orden Domicilio #' + ordenId,
                        monto_total: cxc,
                        saldo_pendiente: cxc,
                        origen: 'domicilio',
                        orden_origen_id: ordenId,
                        estado: 'pendiente',
                        fecha_deuda: new Date().toISOString().split('T')[0]
                    }]);
                    console.log('[CxC] Cuenta generada');
                } catch(e) {
                    console.error('[CxC] Error guardando cuenta', e);
                }
            }
            
            showToast('Pagado', `Pago registrado con éxito`, 'success');
            cerrarModalPago();
            loadTodayDomicilios();
            
        } catch (err) {
            console.error(err);
            showToast('Error', 'No se pudo guardar el pago', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Guardar Pago';
        }
    });
}

window.abrirModalPago = function(id, total) {
    try {
        console.log(`Intentando abrir modal para id: ${id} total: ${total}`);
        document.getElementById('pago-orden-id').textContent = id;
        document.getElementById('pago-total').textContent = `₡${parseFloat(total || 0).toLocaleString('en-US')}`;
        document.getElementById('pago-total-real').value = total;
        
        // Reset Form
        document.getElementById('form-pago-domicilio').reset();
        document.querySelectorAll('.pay-input-container').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.pay-toggle').forEach(el => {
            el.checked = false;
            el.parentElement.classList.remove('active');
        });
        document.getElementById('modal-payment-validation-msg').style.display = 'none';
        
        document.getElementById('modal-pay-efectivo').value = '';
        document.getElementById('modal-pay-tarjeta').value = '';
        document.getElementById('modal-pay-sinpe').value = '';
        document.getElementById('modal-pay-cxc').value = '';
        document.getElementById('modal-pay-transferencia').value = '';
        document.getElementById('modal-pay-regalia').value = '';
        
        const modal = document.getElementById('modal-pago-domicilio');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        modal.style.pointerEvents = 'auto';
        modal.style.zIndex = '999999';
        modal.style.background = 'rgba(0,0,0,0.8)';
        
        console.log("Modal abierto exitosamente en el DOM");
    } catch (e) {
        alert("Error al abrir modal: " + e.message);
        console.error(e);
    }
}

window.cerrarModalPago = function() {
    const modal = document.getElementById('modal-pago-domicilio');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
    modal.style.pointerEvents = 'none';
}


window.modificarDomicilio = function(id) {
    if (!confirm("Al modificar esta orden tendrás que re-ingresar los servicios en el asistente. ¿Deseas continuar?")) return;
    
    const ordenToEdit = todayDomicilios.find(o => String(o.id) === String(id));
    if (!ordenToEdit) {
        showToast('Error', 'No se pudo cargar la orden para edición', 'error');
        return;
    }

    window.originalOrderDataForAlert = ordenToEdit;
    isEditingOrdenId = id;
    
    // Restaurar estado global
    currentClientId = ordenToEdit.cliente_id;
    currentClientName = ordenToEdit.clientes ? ordenToEdit.clientes.nombre : 'Desconocido';
    currentClientPhone = ordenToEdit.clientes ? ordenToEdit.clientes.telefono : '';
    currentClientAddress = ordenToEdit.direccion;
    
    currentVehiclePlaca = ordenToEdit.placa;
    currentVehicleTipo = ordenToEdit.tipo_vehiculo;
    currentVehicleMarca = ordenToEdit.marca;
    currentVehicleModelo = ordenToEdit.modelo;
    
    // Restaurar hora agendada en la UI y en ordenData
    document.getElementById('hora-agendada').value = ordenToEdit.hora_agendada || '';
    ordenData.hora_agendada = ordenToEdit.hora_agendada || '';

    showToast('Info', 'Orden cargada para edición.', 'success');
    document.getElementById('current-step-name').textContent += ` (Editando #DOM-${id})`;
    document.getElementById('current-step-name').style.color = "var(--warning-color)";
    
    // Lo mandamos directo al paso 3 (Servicio Detallado)
    goToStep(3);
}

window.deleteDomicilio = async function(id) {
    const activeUserRole = localStorage.getItem('activeUserRole');
    if (activeUserRole !== 'Dueño' && activeUserRole !== 'Administrador' && activeUserRole !== 'Soporte TI / Programador') {
        showToast('Acceso Denegado', 'Solo el Administrador o el Dueño pueden eliminar órdenes.', 'error');
        return;
    }

    const ord = todayDomicilios.find(x => x.id === parseInt(id) || x.id === id);
    const desglose = ord 
        ? `Domicilio ID: ${id}\nCliente: ${ord.clientes ? ord.clientes.nombre : 'Desconocido'}\nVehículo Placa: ${ord.placa || 'SIN PLACA'}\nModelo: ${ord.marca || ''} ${ord.modelo || ''}\nHora Agendada: ${ord.hora_agendada}\nDirección: ${ord.direccion}\nMonto Total: ₡${parseFloat(ord.total_monto).toLocaleString('en-US')}`
        : `Domicilio ID: ${id}`;

    if (!confirm('¿Estás seguro de que deseas eliminar este domicilio de hoy? (Se borrará de Supabase y de Google Sheets)')) return;

    try {
        const { error } = await window.supabase.from('ordenes_domicilio').delete().eq('id', id);
        if (error) throw error;

        if (GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "") {
            fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'delete_domicilio', id: id })
            }).catch(()=>{});
        }
        
        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Domicilios', desglose);
        }
        
        showToast('Éxito', 'Domicilio eliminado', 'success');
        loadTodayDomicilios();
    } catch(err) {
        console.error(err);
        showToast('Error', 'No se pudo eliminar', 'error');
    }
}

function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-check' : 'fa-triangle-exclamation';
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-content">
            <h4 class="toast-title">${title}</h4>
            <p class="toast-message">${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// End of file

