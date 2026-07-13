const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbykRunJyxYMbrWyeQl7pyOxUPVr7trGFp4qS9avRi4giNaadHeo4SIs41oX7nh5j7HIRw/exec";

let activeUser = null;
let activeUserRole = null;

let currentClientId = null;
let currentClientName = null;
let currentVehicleId = null;
let currentVehiclePlaca = null;
let currentVehicleTipo = null;
let currentVehicleModel = null;
let currentVehicleMarca = null;
let currentEspera = null;
let currentClientPhone = null;

let isEditingOrdenId = null; // Guardará el ID de la orden si estamos editando

// Respuestas del Wizard
let ordenData = {
    servicios_maestros: [],
    detallado_tipo: null,
    promo_detalle: null,
    extra_interior: null,
    extra_aroma: null,
    extra_alfombras: null,
    
    detallados_especiales: [],
    
    mecanica_categorias: [],
    promo_mec_detalle: null,
    otro_mec_detalle: null,
    mecanica_detalles: {}, // ej: { "Llantas": ["Alineacion", "Otro: parche"] }
    
    extras_finales: []
};

const MECANICA_OPTIONS = {
    "Llantas": ["Rotacion de llantas", "Alineacion", "Balanceo", "Cambio de llantas", "Reparacion de pinchazos", "Cambio de valvulas"],
    "Sistema de frenos": ["Cambio de pastilla", "Cambio de discos", "Purga de liquido de frenos", "Revision de freno de mano"],
    "Lubricacion y Fluidos": ["Cambio de aceite de motor", "Cambio de filtro de aceite", "Cambio de aceite de transmision", "Cambio de liquido refrigerante", "Cambio de liquido de direccion"],
    "Motor": ["Diagnostico computarizado", "Cambio de bujias", "Cambio de filtro de aire", "Limpieza de inyectores", "Revision de correa de distribucion", "Afinacion completa"],
    "Sistema Electrico": ["Revision/Cambio de bateria", "Revision de alternador", "Cambio de luces/focos", "Revision sistema de arranque"],
    "Aire acondicionado": ["Recarga de aire acondicionado", "Limpieza de tuberia"]
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabase) {
        window.location.href = '../login/index.html';
        return;
    }

    const activeUserStr = localStorage.getItem('activeUser');
    const activeUserRoleStr = localStorage.getItem('activeUserRole');

    if (!activeUserRoleStr) {
        window.location.href = '../login/index.html';
        return;
    }

    activeUser = activeUserStr;
    activeUserRole = activeUserRoleStr;
    document.getElementById('display-user').textContent = activeUser;

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('editar_orden');

    setupStep1();
    setupStep2();
    setupStep3();
    setupStep4();
    setupStep5();
    setupStep6();
    setupStep7();
    setupStep8();
    setupStep9();
    setupStep10();
    
    if (editId) {
        await cargarOrdenParaEdicion(editId);
    }
});

async function cargarOrdenParaEdicion(id) {
    try {
        const { data: orden, error } = await window.supabase
            .from('ordenes')
            .select('*')
            .eq('id', id)
            .single();
            
        if (error || !orden) throw error;
        
        window.originalOrderDataForAlert = orden;
        
        let clienteData = {};
        if (orden.cliente_id) {
            const { data: c } = await window.supabase.from('clientes').select('*').eq('id', orden.cliente_id).maybeSingle();
            if (c) clienteData = c;
        }
        
        let vehiculoData = {};
        if (orden.vehiculo_id) {
            const { data: v } = await window.supabase.from('vehiculos').select('*').eq('id', orden.vehiculo_id).maybeSingle();
            if (v) vehiculoData = v;
        }
        
        isEditingOrdenId = orden.id;
        
        currentClientId = orden.cliente_id;
        currentVehicleId = orden.vehiculo_id;
        currentClientName = clienteData.nombre || 'Cliente';
        currentClientPhone = clienteData.telefono || '';
        currentVehiclePlaca = vehiculoData.placa || 'Placa';
        currentVehicleModel = vehiculoData.modelo || '';
        currentVehicleTipo = vehiculoData.tipo || 'SEDAN';
        currentEspera = orden.espera || '';
        
        // Populate Wizard state if exists
        ordenData.servicios_maestros = orden.servicios_maestros || [];
        ordenData.detallado_tipo = orden.detallado_tipo;
        ordenData.extra_interior = orden.extra_interior;
        ordenData.extra_aroma = orden.extra_aroma;
        ordenData.extra_alfombras = orden.extra_alfombras;
        ordenData.detallados_especiales = orden.detallados_especiales || [];
        ordenData.mecanica_categorias = orden.mecanica_categorias || [];
        ordenData.mecanica_detalles = orden.mecanica_detalles || {};
        ordenData.extras_finales = orden.extras_finales || [];
        
        // Jump to Step 3 (Servicios Maestros) because they need to re-select what to do
        goToStep(3);
        
    } catch (err) {
        console.error('Error cargando orden:', err);
        alert('No se pudo cargar la orden para edición. Mostrando el inicio.');
    }
}

// ==========================================
// NAVIGATION LOGIC
// ==========================================
window.getPreviousStep = function(currentStep) {
    if (currentStep === 6) return 3; // De Especiales regresa a Servicios
    if (currentStep === 7) return 3; // De Mecanica Categorias regresa a Servicios
    if (currentStep === 8) return 7; // De Mecanica Detalles regresa a Categorias
    if (currentStep === 9) return 3; // El regreso exacto para el 9 puede variar, pero por defecto a 3. En UI mejor usar botones fijos donde tenga sentido.
    
    // Si estamos editando y tratar de volver al paso 2 desde el 3
    if (isEditingOrdenId && currentStep === 3) return 3; 
    
    return currentStep - 1;
}

window.goToStep = function(stepNum) {
    if (isEditingOrdenId && (stepNum === 1 || stepNum === 2)) {
        alert("No se puede cambiar el cliente o vehículo al modificar una orden.");
        return;
    }

    const isMoto = (currentVehicleTipo === 'MOTO');

    // Update the single progress indicator
    const stepNames = {
        1: "Cliente", 2: "Vehículo", 3: "Servicios", 4: "Detallado", 
        5: "Interior", 6: "Especiales", 7: "Mecánica", 8: "Detalles Mecánicos", 
        9: "Extras Finales", 10: "Cobro"
    };
    const circle = document.getElementById('current-step-num');
    const label = document.getElementById('current-step-name');
    if (circle && label) {
        circle.innerHTML = stepNum === 10 ? '<i class="fa-solid fa-check"></i>' : stepNum;
        label.textContent = stepNames[stepNum] || "Paso";
    }

    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${stepNum}`).classList.add('active');

    if (stepNum === 2) {
        document.getElementById('current-client-display').textContent = currentClientName;
        document.getElementById('current-espera-display').textContent = currentEspera;
        loadClientVehicles();
    }
    
    if (stepNum === 3) {
        // Lógica: Si es MOTO ocultar mecánica y pendientes
        document.getElementById('card-mecanica').style.display = isMoto ? 'none' : 'flex';
        document.getElementById('card-pendientes').style.display = isMoto ? 'none' : 'flex';
    }

    if (stepNum === 5) {
        // Bloqueo condicional si eligió Clásico
        const isClasico = (ordenData.detallado_tipo === 'Detallado clasico');
        const cardMate = document.getElementById('card-mate');
        const cardBrillante = document.getElementById('card-brillante');
        const warn = document.getElementById('interior-warning');
        if (isClasico) {
            cardMate.classList.add('disabled');
            cardBrillante.classList.add('disabled');
            warn.style.display = 'block';
            const checkedInterior = document.querySelector('input[name="extra_interior"]:checked');
            if (checkedInterior && (checkedInterior.value === 'Mate' || checkedInterior.value === 'Brillante')) {
                checkedInterior.checked = false;
            }
        } else {
            cardMate.classList.remove('disabled');
            cardBrillante.classList.remove('disabled');
            warn.style.display = 'none';
        }
    }

    if (stepNum === 6) {
        // Ocultar opciones de no-moto
        document.querySelectorAll('.auto-only').forEach(el => {
            el.style.display = isMoto ? 'none' : 'flex';
        });
    }

    if (stepNum === 8) {
        renderMecanicaDetalles();
    }

    if (stepNum === 9) {
        // Ocultar protector interior si es moto
        document.querySelectorAll('.auto-only').forEach(el => {
            el.style.display = isMoto ? 'none' : 'flex';
        });
    }

    if (stepNum === 10) {
        buildResumen();
    }
}

// Funciones de ruteo del árbol (Lógica de saltos)
function proceedFromDetalladoLavadoExtras() {
    if (ordenData.servicios_maestros.includes('Detallados especiales')) {
        goToStep(6);
    } else if (ordenData.servicios_maestros.includes('Mecanica')) {
        goToStep(7);
    } else {
        goToStep(9); // Siempre a extras finales si eligió Detallado
    }
}

function proceedFromDetalladosEspeciales() {
    if (ordenData.servicios_maestros.includes('Mecanica')) {
        goToStep(7);
    } else {
        goToStep(9); // Siempre a extras finales si eligió Detallados Especiales
    }
}

function proceedFromMecanicaCategorias() {
    // Si seleccionó una categoria de Salto Directo sin seleccionar categorías específicas, salta.
    // Ej: Mantenimiento General, Promo, Otro.
    const hasSpecific = ordenData.mecanica_categorias.some(c => MECANICA_OPTIONS[c]);
    
    if (hasSpecific) {
        goToStep(8);
    } else {
        proceedFromMecanicaDetalles();
    }
}

function proceedFromMecanicaDetalles() {
    // Extras finales solo se muestran si eligió detallado
    if (ordenData.servicios_maestros.includes('Detallado y lavado') || ordenData.servicios_maestros.includes('Detallados especiales')) {
        goToStep(9);
    } else {
        goToStep(10); // Cobro directo
    }
}

// ==========================================
// STEP 1 & 2
// ==========================================
function setupStep1() {
    const searchForm = document.getElementById('search-client-form');
    const newClientForm = document.getElementById('client-new-form');

    function saveEspera() {
        const checked = document.querySelector('input[name="cliente_espera"]:checked');
        currentEspera = checked ? checked.value : 'En sala de espera';
    }

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('phone-search').value.trim();
        if (!phone) return;
        const btnSearch = document.getElementById('btn-search-client');
        btnSearch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btnSearch.disabled = true;

        try {
            const { data, error } = await window.supabase.from('clientes').select('*').eq('telefono', phone).maybeSingle();
            if (error) throw error;
            if (data) {
                currentClientId = data.id;
                currentClientName = data.nombre;
                currentClientPhone = data.telefono;
                document.getElementById('client-result-area').style.display = 'block';
                document.getElementById('client-found-card').style.display = 'block';
                document.getElementById('found-client-name').textContent = data.nombre;
                document.getElementById('found-client-phone').textContent = data.telefono;
                document.getElementById('client-new-form').style.display = 'none';
            } else {
                currentClientId = null;
                currentClientName = null;
                currentClientPhone = null;
                document.getElementById('client-result-area').style.display = 'block';
                document.getElementById('client-found-card').style.display = 'none';
                document.getElementById('client-new-form').style.display = 'block';
            }
        } catch (err) {
            showToast('Error', 'No se pudo buscar.', 'error');
        } finally {
            btnSearch.innerHTML = 'Buscar';
            btnSearch.disabled = false;
        }
    });

    document.getElementById('btn-continue-step2').addEventListener('click', () => {
        if (currentClientId) { saveEspera(); goToStep(2); }
    });

    newClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveEspera();
        const phone = document.getElementById('phone-search').value.trim();
        const name = document.getElementById('new-client-name').value.trim();
        const btn = document.getElementById('btn-register-client');
        btn.disabled = true;
        try {
            const { data, error } = await window.supabase.from('clientes').insert([{ nombre: name, telefono: phone }]).select();
            if (error) {
                if (error.code === '23505') throw new Error('Ya existe un cliente registrado con este número de teléfono.');
                throw error;
            }
            currentClientId = data[0].id; 
            currentClientName = data[0].nombre;
            currentClientPhone = data[0].telefono;
            goToStep(2);
        } catch (err) {
            showToast('Error', err.message || 'No se pudo registrar.', 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

function setupStep2() {
    const btnShowNew = document.getElementById('btn-show-new-vehicle');
    const formContainer = document.getElementById('new-vehicle-form-container');
    const newVehicleForm = document.getElementById('form-new-vehicle');

    btnShowNew.addEventListener('click', () => {
        formContainer.style.display = 'block';
        btnShowNew.style.display = 'none';
    });

    document.getElementById('btn-cancel-new-vehicle').addEventListener('click', () => {
        formContainer.style.display = 'none';
        btnShowNew.style.display = 'flex';
        newVehicleForm.reset();
    });

    newVehicleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const placa = document.getElementById('veh-placa').value.trim().toUpperCase();
        const tipo = document.getElementById('veh-tipo').value;
        const btn = document.getElementById('btn-save-vehicle');
        btn.disabled = true;
        try {
            const { data: vehData, error: vehError } = await window.supabase.from('vehiculos')
                .insert([{ placa, marca: document.getElementById('veh-marca').value, modelo: document.getElementById('veh-modelo').value, anio: document.getElementById('veh-año').value || null, tipo }]).select();
            
            if (vehError) {
                if (vehError.code === '23505') {
                    throw new Error('Ya existe un vehículo registrado con esta placa. Usa el buscador de arriba para asignarlo.');
                }
                throw error;
            }
            
            let vid = vehData ? vehData[0].id : null;
            if(!vid) { throw new Error('No se pudo procesar la placa.'); }

            // Vincular al cliente
            const { error: linkErr } = await window.supabase.from('cliente_vehiculo').insert([{ cliente_id: currentClientId, vehiculo_placa: placa }]);
            if (linkErr && linkErr.code !== '23505') throw linkErr;

            currentVehicleId = vid; 
            currentVehiclePlaca = placa; 
            currentVehicleTipo = tipo;
            currentVehicleModel = document.getElementById('veh-modelo').value;
            currentVehicleMarca = document.getElementById('veh-marca').value;
            goToStep(3);
        } catch (err) {
            console.error(err);
            showToast('Error', err.message || 'Error guardando el vehículo.', 'error');
        } finally { btn.disabled = false; }
    });

    // Buscador Global de Vehículos
    const searchInput = document.getElementById('global-vehicle-search');
    const searchResults = document.getElementById('global-vehicle-results');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim().toUpperCase();
        if (q.length < 2) {
            searchResults.style.display = 'none';
            return;
        }
        searchTimeout = setTimeout(async () => {
            try {
                const { data, error } = await window.supabase.from('vehiculos').select('*').ilike('placa', `%${q}%`).limit(5);
                if (error) throw error;
                if (data.length > 0) {
                    searchResults.innerHTML = data.map(v => `
                        <div style="padding: 12px; border-bottom: 1px solid var(--border-color); cursor: pointer;" onclick="vincularVehiculoGlobal(${v.id}, '${v.placa}', '${v.tipo || 'OTRO'}', '${v.modelo || ''}', '${v.marca || ''}')">
                            <strong style="color: var(--primary-accent);">${v.placa}</strong> - ${v.marca || ''} ${v.modelo || ''}
                            <br><span style="font-size: 12px; color: var(--text-muted);"><i class="fa-solid fa-link"></i> Vincular a este cliente</span>
                        </div>
                    `).join('');
                    searchResults.style.display = 'block';
                } else {
                    searchResults.innerHTML = `<div style="padding: 12px; color: var(--text-muted);">No se encontraron placas con "${q}". Puedes crearlo abajo.</div>`;
                    searchResults.style.display = 'block';
                }
            } catch (err) { console.error(err); }
        }, 300);
    });

    // Custom Dropdown para Marcas
    const marcasLista = [
        "TOYOTA", "LEXUS", "HONDA", "ACURA", "NISSAN", "INFINITI", "MAZDA", "SUBARU", "MITSUBISHI", "SUZUKI", "ISUZU",
        "HYUNDAI", "KIA", "GENESIS", "SSANGYONG", "FORD", "CHEVROLET", "GMC", "CADILLAC", "BUICK", "JEEP", "DODGE", "RAM", "CHRYSLER", "TESLA",
        "MERCEDES-BENZ", "BMW", "MINI", "AUDI", "VOLKSWAGEN", "PORSCHE", "OPEL", "FERRARI", "LAMBORGHINI", "MASERATI", "FIAT", "ALFA ROMEO", "ABARTH",
        "RENAULT", "PEUGEOT", "CITROËN", "DS AUTOMOBILES", "LAND ROVER", "RANGE ROVER", "JAGUAR", "ASTON MARTIN", "BENTLEY", "ROLLS-ROYCE", "MCLAREN",
        "VOLVO", "POLESTAR", "SEAT", "CUPRA", "ŠKODA", "DACIA",
        "BYD", "CHERY", "GEELY", "JETOUR", "OMODA", "JAECOO", "JAC", "MG", "GAC", "AION", "HAVAL", "TANK", "ORA", "WEY", "CHANGAN", "DONGFENG", "BAIC", "FOTON", "MAXUS", "KAIYI", "FAW", "BESTUNE", "JMC", "SERES", "NIO", "XPENG", "ZEEKR", "LEAPMOTOR", "LI AUTO",
        "TATA", "MAHINDRA", "VINFAST",
        "YAMAHA", "KAWASAKI", "KTM", "FREEDOM", "FORMULA", "KATANA", "SERPENTO", "OTRA"
    ];
    
    const marcaInput = document.getElementById('veh-marca');
    const marcaList = document.getElementById('marca-autocomplete-list');

    function renderMarcas(filtro = '') {
        marcaList.innerHTML = '';
        const filtradas = marcasLista.filter(m => m.includes(filtro));
        filtradas.forEach(m => {
            const div = document.createElement('div');
            div.style.cssText = "padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border-color); color: var(--text-color);";
            div.textContent = m;
            div.onmouseover = () => div.style.background = 'rgba(255,255,255,0.05)';
            div.onmouseout = () => div.style.background = 'transparent';
            div.onclick = () => {
                marcaInput.value = m;
                marcaList.style.display = 'none';
            };
            marcaList.appendChild(div);
        });
    }

    marcaInput.addEventListener('focus', () => {
        renderMarcas(marcaInput.value.trim().toUpperCase());
        marcaList.style.display = 'block';
    });

    marcaInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toUpperCase();
        renderMarcas(val);
        marcaList.style.display = 'block';
    });

    // Cerrar al hacer click afuera
    document.addEventListener('click', (e) => {
        if (e.target !== marcaInput && e.target !== marcaList) {
            marcaList.style.display = 'none';
        }
    });
}

// Función global para vincular desde la búsqueda
window.vincularVehiculoGlobal = async function(vid, placa, tipo, modelo, marca) {
    try {
        const { error: linkErr } = await window.supabase.from('cliente_vehiculo').insert([{ cliente_id: currentClientId, vehiculo_placa: placa }]);
        if (linkErr && linkErr.code !== '23505') throw linkErr;
        
        currentVehicleId = vid; 
        currentVehiclePlaca = placa; 
        currentVehicleTipo = tipo;
        currentVehicleModel = modelo;
        currentVehicleMarca = marca;
        goToStep(3);
    } catch (err) {
        console.error(err);
        showToast('Error', 'No se pudo vincular el vehículo', 'error');
    }
}

async function loadClientVehicles() {
    const grid = document.getElementById('vehicles-grid');
    grid.innerHTML = 'Cargando...';
    document.getElementById('new-vehicle-form-container').style.display = 'none';
    document.getElementById('btn-show-new-vehicle').style.display = 'flex';
    try {
        const { data, error } = await window.supabase.from('cliente_vehiculo').select('vehiculos(*)').eq('cliente_id', currentClientId);
        if (error) throw error;
        grid.innerHTML = '';
        if (data.length === 0) {
            document.getElementById('btn-show-new-vehicle').click();
            return;
        }
        data.forEach(link => {
            const v = link.vehiculos;
            const card = document.createElement('div');
            card.className = 'vehicle-select-card';
            card.innerHTML = `<h3>${v.placa}</h3><p>${v.tipo || 'OTRO'} - ${v.modelo || 'N/A'}</p>`;
            card.addEventListener('click', () => {
                currentVehicleId = v.id; 
                currentVehiclePlaca = v.placa; 
                currentVehicleTipo = v.tipo || 'OTRO';
                currentVehicleModel = v.modelo || 'Vehículo';
                currentVehicleMarca = v.marca || '';
                goToStep(3);
            });
            grid.appendChild(card);
        });
    } catch (err) {}
}

// ==========================================
// STEP 3: SERVICIOS MAESTROS
// ==========================================
function setupStep3() {
    window.processStep3 = function() {
        const checkboxes = document.querySelectorAll('.service-checkbox:checked');
        const err = document.getElementById('error-step3');
        if (checkboxes.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';
        
        ordenData.servicios_maestros = Array.from(checkboxes).map(c => c.value);
        
        if (ordenData.servicios_maestros.includes('Entrada pero servicios pendientes')) {
            goToStep(10); // Cobro directo
        } else if (ordenData.servicios_maestros.includes('Detallado y lavado')) {
            goToStep(4);
        } else if (ordenData.servicios_maestros.includes('Detallados especiales')) {
            goToStep(6);
        } else if (ordenData.servicios_maestros.includes('Mecanica')) {
            goToStep(7);
        }
    }
}

// ==========================================
// STEP 4 & 5: DETALLADO
// ==========================================
function setupStep4() {
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
            // Motos no tienen extras de interior
            proceedFromDetalladoLavadoExtras();
        } else {
            goToStep(5);
        }
    }
}

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
// STEP 7: MECANICA CATEGORIAS
// ==========================================
function setupStep7() {
    window.processStep7 = function() {
        const checkboxes = document.querySelectorAll('.mecanica-cat-cb:checked');
        const err = document.getElementById('error-step7');
        if (checkboxes.length === 0) { err.style.display = 'block'; return; }
        
        let cats = [];
        for (let cb of checkboxes) {
            cats.push(cb.value);
            if (cb.value === 'Promociones mecanicas') {
                const text = document.getElementById('promo-mec-text').value.trim();
                if(!text) { err.style.display='block'; return; }
                ordenData.promo_mec_detalle = text;
            }
            if (cb.value === 'Otro') {
                const text = document.getElementById('otro-mec-text').value.trim();
                if(!text) { err.style.display='block'; return; }
                ordenData.otro_mec_detalle = text;
            }
        }
        
        err.style.display = 'none';
        ordenData.mecanica_categorias = cats;
        proceedFromMecanicaCategorias();
    }
}

// ==========================================
// STEP 8: MECANICA DETALLES
// ==========================================
function renderMecanicaDetalles() {
    const container = document.getElementById('mecanica-dynamic-container');
    container.innerHTML = '';
    ordenData.mecanica_detalles = {}; // reset

    ordenData.mecanica_categorias.forEach(cat => {
        if (MECANICA_OPTIONS[cat]) {
            let html = `<div class="extra-section" style="margin-bottom: 24px;">
                            <h3>${cat}</h3>
                            <div class="checkbox-group-cards grid-2" id="grid-${cat.replace(/\s/g,'')}">`;
            
            MECANICA_OPTIONS[cat].forEach(opt => {
                html += `<label class="checkbox-card">
                            <input type="checkbox" value="${opt}" class="mec-det-cb" data-cat="${cat}">
                            <div class="checkbox-card-content"><span>${opt}</span></div>
                         </label>`;
            });

            // "Otro" field for each category
            html += `<label class="checkbox-card" style="grid-column: span 2;">
                        <input type="checkbox" class="mec-det-cb mec-otro-cb" data-cat="${cat}" onchange="document.getElementById('otro-div-${cat.replace(/\s/g,'')}').style.display = this.checked ? 'block' : 'none'">
                        <div class="checkbox-card-content"><span>Otro</span></div>
                     </label>
                     <div id="otro-div-${cat.replace(/\s/g,'')}" style="display:none; grid-column:span 2;">
                        <input type="text" class="form-control mec-otro-text" data-cat="${cat}" placeholder="Describa...">
                     </div>`;

            html += `</div></div>`;
            container.innerHTML += html;
        }
    });
}

function setupStep8() {
    window.processStep8 = function() {
        let isValid = true;
        ordenData.mecanica_detalles = {};
        const catsRendered = Array.from(new Set(Array.from(document.querySelectorAll('.mec-det-cb')).map(cb => cb.dataset.cat)));
        
        catsRendered.forEach(cat => {
            const checked = document.querySelectorAll(`.mec-det-cb[data-cat="${cat}"]:checked`);
            if(checked.length === 0) isValid = false;
            
            let arr = [];
            checked.forEach(cb => {
                if(cb.classList.contains('mec-otro-cb')) {
                    const text = document.querySelector(`.mec-otro-text[data-cat="${cat}"]`).value.trim();
                    if(!text) isValid = false;
                    arr.push("Otro: " + text);
                } else {
                    arr.push(cb.value);
                }
            });
            ordenData.mecanica_detalles[cat] = arr;
        });

        const err = document.getElementById('error-step8');
        if (!isValid) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        proceedFromMecanicaDetalles();
    }
}

// ==========================================
// STEP 9: EXTRAS FINALES
// ==========================================
window.toggleNingunoExtra = function(checkbox) {
    if(checkbox.checked) {
        document.querySelectorAll('.extra-final-cb').forEach(cb => {
            if(cb !== checkbox) cb.checked = false;
        });
    }
}

function setupStep9() {
    document.querySelectorAll('.extra-final-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if(e.target.id !== 'extra-ninguno' && e.target.checked) {
                document.getElementById('extra-ninguno').checked = false;
            }
        });
    });

    window.processStep9 = function() {
        const checked = document.querySelectorAll('.extra-final-cb:checked');
        const err = document.getElementById('error-step9');
        if(checked.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        ordenData.extras_finales = Array.from(checked).map(c => c.value);
        goToStep(10);
    }
}

// ==========================================
// STEP 10: COBRO / RESUMEN
// ==========================================
function setupStep10() {
    const formCobro = document.getElementById('form-cobro');
    formCobro.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let montoDetallado = document.getElementById('monto-detallado') ? parseFloat(document.getElementById('monto-detallado').value) || 0 : 0;
        let montoMecanica = document.getElementById('monto-mecanica') ? parseFloat(document.getElementById('monto-mecanica').value) || 0 : 0;
        let obs = document.getElementById('cobro-observaciones') ? document.getElementById('cobro-observaciones').value.trim() : "";
        if(!obs) obs = "Sin observaciones adicionales";
        
        const total = montoDetallado + montoMecanica;
        if (total <= 0 && (!ordenData.servicios_maestros.includes('Entrada pero servicios pendientes'))) {
            alert('Por favor ingrese un monto válido (mayor a 0).');
            return;
        }

        const btn = document.getElementById('btn-finalizar-orden');
        const btnOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const orderPayload = {
                cliente_id: currentClientId,
                vehiculo_id: currentVehicleId,
                placa: currentVehiclePlaca,
                marca: currentVehicleMarca,
                modelo: currentVehicleModel,
                tipo_vehiculo: currentVehicleTipo,
                responsable: activeUser,
                estado: 'En proceso',
                espera: currentEspera,
                observaciones: obs,
                
                detallado_monto: montoDetallado,
                mecanica_monto: montoMecanica,
                total_monto: total,
                
                servicios_maestros: ordenData.servicios_maestros,
                detallados_especiales: ordenData.detallados_especiales,
                mecanica_categorias: ordenData.mecanica_categorias,
                mecanica_detalles: ordenData.mecanica_detalles,
                extras_finales: ordenData.extras_finales,
                
                detallado_tipo: ordenData.detallado_tipo === 'Promocion' ? 'Promocion: ' + ordenData.promo_detalle : ordenData.detallado_tipo,
                extra_interior: ordenData.extra_interior,
                extra_aroma: ordenData.extra_aroma,
                extra_alfombras: ordenData.extra_alfombras
            };

            if (isEditingOrdenId) {
                orderPayload.metodo_pago = 'Pendiente';
                orderPayload.monto_efectivo = 0;
                orderPayload.monto_tarjeta = 0;
                orderPayload.monto_sinpe = 0;
                orderPayload.monto_cxc = 0;
                orderPayload.monto_transferencia = 0;
                orderPayload.monto_regalia = 0;
                orderPayload.hora_pago = null;
                orderPayload.responsable_cobro = null;
            }

            let nuevaOrden;
            if (isEditingOrdenId) {
                if (GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "" && window.originalOrderDataForAlert) {
                    const alertPayload = {
                        action: 'edit_alert',
                        modulo: 'Local Comercial',
                        usuario: activeUser,
                        detalle: JSON.stringify(window.originalOrderDataForAlert, null, 2)
                    };
                    fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify(alertPayload)
                    }).catch(e => console.error(e));
                }
                const { data, error } = await window.supabase
                    .from('ordenes')
                    .update(orderPayload)
                    .eq('id', isEditingOrdenId)
                    .select();
                if (error) throw error;
                nuevaOrden = data;
            } else {
                const { data, error } = await window.supabase
                    .from('ordenes')
                    .insert([orderPayload])
                    .select();
                if (error) throw error;
                nuevaOrden = data;
            }
            
            const ordenGenerada = nuevaOrden[0];

            // 2. Enviar a Google Sheets
            if (GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "") {
                const sheetPayload = {
                    action: isEditingOrdenId ? "update" : "create",
                    tipo_hoja: "NUEVA_ORDEN",
                    orden_id: ordenGenerada.id,
                    created_at: new Date(ordenGenerada.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                    placa: currentVehiclePlaca,
                    nombre_cliente: currentClientName,
                    celular_cliente: currentClientPhone || "", 
                    modelo: currentVehicleModel || "Vehículo",
                    tipo_vehiculo: currentVehicleTipo,
                    
                    estado: ordenGenerada.estado,
                    espera: ordenGenerada.espera,
                    total_monto: ordenGenerada.total_monto,
                    
                    servicios_maestros: ordenGenerada.servicios_maestros ? ordenGenerada.servicios_maestros.join(", ") : "",
                    
                    detallado_tipo: ordenGenerada.detallado_tipo,
                    extra_interior: ordenGenerada.extra_interior,
                    extra_aroma: ordenGenerada.extra_aroma,
                    extra_alfombras: ordenGenerada.extra_alfombras,
                    servicios_extra: ordenGenerada.extras_finales && ordenGenerada.extras_finales.length > 0 ? ordenGenerada.extras_finales.join(", ") : "No aplica",
                    detallados_especiales: ordenGenerada.detallados_especiales && ordenGenerada.detallados_especiales.length > 0 ? ordenGenerada.detallados_especiales.join(", ") : "No aplica",
                    detallado_monto: ordenGenerada.detallado_monto,
                    
                    mecanica_categorias: ordenGenerada.mecanica_categorias && ordenGenerada.mecanica_categorias.length > 0 ? ordenGenerada.mecanica_categorias.join(", ") : "No aplica",
                    mecanica_detalles: ordenGenerada.mecanica_detalles ? JSON.stringify(ordenGenerada.mecanica_detalles) : "No aplica",
                    mecanica_monto: ordenGenerada.mecanica_monto,
                    
                    observaciones: ordenGenerada.observaciones
                };

                try {
                    fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify(sheetPayload)
                    });
                } catch(e) {
                    console.error("Error silencioso Google Sheets:", e);
                }
            }

            showToast('Éxito', `¡Orden #${ordenGenerada.id} guardada correctamente!`, 'success');
            setTimeout(() => {
                window.location.href = '../pizarra_local/index.html';
            }, 1500);

        } catch (err) {
            console.error('Error guardando orden:', err);
            showToast('Error', 'No se pudo guardar la orden.', 'error');
            btn.innerHTML = btnOriginal;
            btn.disabled = false;
        }
    });
}

function buildResumen() {
    document.getElementById('cobro-asesor').textContent = activeUser;

    // Mostrar/Ocultar inputs de cobro
    const hasDetallado = ordenData.servicios_maestros.includes('Detallado y lavado') || ordenData.servicios_maestros.includes('Detallados especiales');
    const hasMecanica = ordenData.servicios_maestros.includes('Mecanica') || ordenData.servicios_maestros.includes('Entrada pero servicios pendientes');

    document.getElementById('cobro-detallado-container').style.display = hasDetallado ? 'block' : 'none';
    document.getElementById('cobro-mecanico-container').style.display = hasMecanica ? 'block' : 'none';

    const ul = document.getElementById('resumen-final');
    let html = `
        <li><strong>Cliente:</strong> ${currentClientName} (${currentEspera})</li>
        <li><strong>Vehículo:</strong> ${currentVehiclePlaca} (${currentVehicleTipo})</li>
        <hr style="border-color:var(--border-color); margin: 12px 0;">
        <li><h3 style="color:var(--primary-accent); margin-bottom:8px;">Servicios Maestros</h3></li>
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

    if (ordenData.mecanica_categorias.length > 0) {
        html += `<hr style="border-color:var(--border-color); margin: 12px 0;">
                 <li><h3 style="color:var(--primary-accent); margin-bottom:8px;">Mecánica</h3></li>`;
        
        ordenData.mecanica_categorias.forEach(cat => {
            html += `<li><strong>${cat}:</strong> `;
            if (cat === 'Promociones mecanicas') html += ordenData.promo_mec_detalle;
            else if (cat === 'Otro') html += ordenData.otro_mec_detalle;
            else if (ordenData.mecanica_detalles[cat]) html += ordenData.mecanica_detalles[cat].join(', ');
            else html += 'General';
            html += `</li>`;
        });
    }

    if (ordenData.extras_finales.length > 0) {
        html += `<hr style="border-color:var(--border-color); margin: 12px 0;">
                 <li><h3 style="color:var(--primary-accent); margin-bottom:8px;">Extras Finales</h3></li>
                 <li>${ordenData.extras_finales.join(', ')}</li>`;
    }

    ul.innerHTML = html;
}

// Global Toast function
function showToast(title, message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        // Force container styles just in case CSS is missing
        container.style.position = 'fixed';
        container.style.bottom = '24px';
        container.style.right = '24px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
        container.style.zIndex = '999999';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Force toast base styles
    toast.style.background = 'rgba(30, 38, 55, 0.95)';
    toast.style.border = type === 'error' ? '1px solid #ef4444' : '1px solid #10b981';
    toast.style.padding = '16px 20px';
    toast.style.borderRadius = '12px';
    toast.style.color = '#fff';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.8)';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.minWidth = '300px';
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation';
    const iconColor = type === 'error' ? '#ef4444' : '#10b981';
    
    toast.innerHTML = `
        <div class="toast-header" style="display:flex; align-items:center; gap:8px; font-weight:600; margin-bottom:4px; color:${iconColor}">
            <i class="fa-solid ${icon}"></i>
            <span>${title}</span>
        </div>
        <div class="toast-message" style="font-size:14px; color:#94a3b8;">${message}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}


