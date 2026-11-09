// Dirección en js/config.js (único lugar donde se define)
const GOOGLE_SHEETS_WEBHOOK_URL = window.APP_CONFIG.sheetsWebhookUrl;

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
    paquete: null,          // paquete de Configuración elegido ({ id, nombre, total, ... })
    promo_detalle: null,
    extra_interior: null,
    extra_aroma: null,
    extra_alfombras: null,
    
    detallados_especiales: [],
    
    mecanica_categorias: [],
    mecanica_directos: {},  // categorías sin paso de detalles: { categoría: [texto o nombre] }
    mecanica_previos: {},   // lo elegido antes, para dejar marcado al volver o editar
    mecanica_detalles: {}, // ej: { "Llantas": ["Alineacion", "Otro: parche"] }
    
    extras_finales: []
};

// Categorías y servicios de mecánica: Configuración > Mecánica (js/catalogo_mecanica.js)

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

    // Tipos de vehículo desde Configuración (tabla tipos_vehiculo)
    await cargarTiposVehiculoLocal();
    // Paquetes, detalladores y aromatizantes desde Configuración (se cargan en segundo plano)
    CatalogoDetallado.cargar('local').catch(e => console.error('[Paquetes] Error al cargar:', e));
    CatalogoDetallado.cargarEspeciales('local').catch(e => console.error('[Especiales] Error al cargar:', e));
    CatalogoMecanica.cargar().catch(e => console.error('[Mecánica] Error al cargar:', e));

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('editar_orden');

    setupStep1();
    setupStep9();
    setupStep2();
    setupStep3();
    setupStep4();
    setupStep5();
    setupStep6();
    setupStep7();
    setupStep8();
    setupStep10();
    
    if (editId) {
        await cargarOrdenParaEdicion(editId);
    } else {
        // Al entrar, el cursor queda listo en el teléfono del cliente
        enfocarTelefono();
    }
});

/**
 * Pone el cursor en el campo de teléfono (paso 1).
 * auth_guard.js oculta la página hasta verificar la sesión, y un campo oculto
 * no recibe el foco: por eso se reintenta hasta que la página se muestra.
 */
function enfocarTelefono() {
    const input = document.getElementById('phone-search');
    const paso1 = document.getElementById('step-1');
    if (!input || !paso1 || !paso1.classList.contains('active')) return;

    let intentos = 0;
    (function intentar() {
        if (getComputedStyle(document.body).visibility !== 'hidden') {
            input.focus();
            input.select();
            return;
        }
        if (++intentos < 200) setTimeout(intentar, 50); // hasta ~10 s
    })();
}

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
        
        // Dejar elegido el tipo de vehículo de la orden
        seleccionarTipoEnSelect(currentVehicleTipo);

        // Jump to Step 3 (Servicios Maestros) because they need to re-select what to do
        goToStep(2);
        
    } catch (err) {
        console.error('Error cargando orden:', err);
        SaNotificar.aviso('No se pudo cargar la orden para edición. Mostrando el inicio.', 'error');
    }
}

// ==========================================
// TIPOS DE VEHÍCULO (Configuración > Tipos de vehículo)
// ==========================================
async function cargarTiposVehiculoLocal() {
    const cont = document.getElementById('tipos-vehiculo-local');
    if (!cont) return;

    const mensaje = (texto, esError) => {
        cont.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'step-desc';
        p.style.gridColumn = '1 / -1';
        if (esError) p.style.color = 'var(--danger-color)';
        p.textContent = texto;
        cont.appendChild(p);
    };

    mensaje('Cargando tipos de vehículo…');

    try {
        const tipos = await TiposVehiculo.cargar('local');
        if (!tipos.length) {
            mensaje('No hay tipos de vehículo disponibles para Local. Créalos en Configuración > Tipos de vehículo.', true);
            return;
        }
        cont.innerHTML = '';
        tipos.forEach(t => cont.appendChild(crearTarjetaTipo(t.nombre)));
        // Si ya había un tipo elegido (p. ej. al editar una orden), marcarlo
        seleccionarTipoEnSelect(document.getElementById('veh-tipo-temp').value);
    } catch (e) {
        console.error('[Local] Error al cargar tipos de vehículo:', e);
        mensaje(TiposVehiculo.mensajeError(e), true);
    }
}

/** Tarjeta de un tipo de vehículo (mismo estilo que en Domicilio). */
function crearTarjetaTipo(nombre) {
    const label = document.createElement('label');
    label.className = 'radio-card';
    label.innerHTML = '<input type="radio" name="tipo_vehiculo_local">' +
        '<div class="radio-card-content"><i class="fa-solid ' + TiposVehiculo.icono(nombre) +
        '" style="font-size: 24px; margin-bottom: 8px;" aria-hidden="true"></i><span></span></div>';
    const input = label.querySelector('input');
    input.value = nombre;
    input.addEventListener('change', () => {
        document.getElementById('veh-tipo-temp').value = nombre;
        const err = document.getElementById('error-step2-tipo');
        if (err) err.style.display = 'none';
    });
    label.querySelector('span').textContent = nombre;
    return label;
}

/** Deja elegido un tipo; si es un tipo viejo que ya no está en la tabla, agrega su tarjeta para no perderlo. */
function seleccionarTipoEnSelect(nombre) {
    const hidden = document.getElementById('veh-tipo-temp');
    const cont = document.getElementById('tipos-vehiculo-local');
    if (!hidden || !nombre) return;
    hidden.value = nombre;
    if (!cont || !cont.querySelector('input[name="tipo_vehiculo_local"]')) return; // aún cargando

    let input = Array.from(cont.querySelectorAll('input[name="tipo_vehiculo_local"]'))
        .find(i => i.value.toLowerCase() === nombre.toLowerCase());
    if (!input) {
        const tarjeta = crearTarjetaTipo(nombre);
        cont.appendChild(tarjeta);
        input = tarjeta.querySelector('input');
    }
    input.checked = true;
    hidden.value = input.value;
}

/** Paso 2a: tarjetas de tipo de vehículo. */
function mostrarSubpasoTipo() {
    document.getElementById('step2-tipo').style.display = '';
    document.getElementById('step2-servicios').style.display = 'none';
    const label = document.getElementById('current-step-name');
    if (label && !isEditingOrdenId) label.textContent = 'Tipo de vehículo';
}

/** Paso 2b: servicios para el tipo elegido. */
function mostrarSubpasoServicios() {
    const tipo = document.getElementById('veh-tipo-temp').value;
    document.getElementById('step2-tipo-elegido').textContent = tipo;
    document.getElementById('step2-tipo').style.display = 'none';
    document.getElementById('step2-servicios').style.display = '';
    const label = document.getElementById('current-step-name');
    if (label && !isEditingOrdenId) label.textContent = 'Servicios';
    if (window.updateServicesByTipo) window.updateServicesByTipo();
    // "Detallados especiales" solo si el vehículo tiene alguno configurado (p. ej. Moto no)
    CatalogoDetallado.mostrarServicioEspeciales('local', tipo);
}

/** Botón "Siguiente" de las tarjetas de tipo. */
window.continuarConTipoVehiculo = function() {
    const tipo = document.getElementById('veh-tipo-temp').value;
    const err = document.getElementById('error-step2-tipo');
    if (!tipo) {
        err.textContent = 'Seleccione el tipo de vehículo.';
        err.style.display = 'block';
        return;
    }
    err.style.display = 'none';
    mostrarSubpasoServicios();
};
window.mostrarSubpasoTipo = mostrarSubpasoTipo;

// ==========================================
// NAVIGATION LOGIC
// ==========================================
window.getPreviousStep = function(currentStep) {
    if (currentStep === 5) return 2; // De Especiales regresa a Servicios
    if (currentStep === 6) return 2; // De Mecanica Categorias regresa a Servicios
    if (currentStep === 7) return 6; // De Mecanica Detalles regresa a Categorias
    if (currentStep === 8) return 2; // El regreso para extras varía, por defecto a Servicios
    
    if (isEditingOrdenId && currentStep === 2) return 2; // No volver a Cliente si edita
    if (isEditingOrdenId && currentStep === 10) return 10; // Evitar retrocesos extraños al editar si aplica
    
    return currentStep - 1;
}

window.goToStep = function(stepNum) {
    if (isEditingOrdenId && stepNum === 1) {
        SaNotificar.aviso("No se puede cambiar el cliente o vehículo al modificar una orden.", 'advertencia');
        return;
    }

    // Sin interior (p. ej. Moto): se saltan interior y servicios solo para carros
    const isMoto = !TiposVehiculo.tieneInterior(currentVehicleTipo);

    // Update the single progress indicator
    const stepNames = {
        1: "Cliente", 2: "Servicios", 3: "Detallado", 4: "Interior", 
        5: "Especiales", 6: "Mecánica", 7: "Detalles Mecánicos", 8: "Extras Finales", 
        9: "Vehículo", 10: "Cobro"
    };
    const circle = document.getElementById('current-step-num');
    const label = document.getElementById('current-step-name');
    if (circle && label) {
        circle.innerHTML = stepNum === 10 ? '<i class="fa-solid fa-check"></i>' : stepNum;
        label.textContent = stepNames[stepNum] || "Paso";
    }

    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${stepNum}`).classList.add('active');

    if (stepNum === 1) {
        enfocarTelefono();
    }

    if (stepNum === 9) {
        document.getElementById('current-client-display').textContent = currentClientName;
        document.getElementById('current-espera-display').textContent = currentEspera;
        loadClientVehicles();
    }
    
    if (stepNum === 2) {
        // Oculta Mecánica y Pendientes para tipos sin interior (p. ej. Moto), como antes
        window.updateServicesByTipo = function() {
            const tipo = document.getElementById('veh-tipo-temp').value;
            const isMotoTipo = !TiposVehiculo.tieneInterior(tipo);
            document.getElementById('card-mecanica').style.display = isMotoTipo ? 'none' : 'flex';
            document.getElementById('card-pendientes').style.display = isMotoTipo ? 'none' : 'flex';
            if (isMotoTipo) {
                const cbMec = document.querySelector('input[value="Mecanica"]');
                if (cbMec) cbMec.checked = false;
                const cbPend = document.querySelector('input[value="Entrada pero servicios pendientes"]');
                if (cbPend) cbPend.checked = false;
            }
        };
        // Si ya hay tipo elegido (al volver desde un paso siguiente o al editar) se va directo a servicios
        if (document.getElementById('veh-tipo-temp').value) {
            mostrarSubpasoServicios();
        } else {
            mostrarSubpasoTipo();
        }
    }

    if (stepNum === 3) {
        // Paquetes configurados para Local y para el tipo de vehículo elegido
        pintarPasoPaquetes();
    }

    if (stepNum === 4) {
        // Detalladores y aromatizantes asignados al paquete elegido
        pintarPasoInterior();
    }

    if (stepNum === 5) {
        // Detallados especiales configurados para Local y el tipo de vehículo
        pintarPasoEspeciales();
    }

    if (stepNum === 6) {
        // Categorías configuradas (Configuración > Mecánica)
        pintarPasoMecanica();
    }

    if (stepNum === 7) {
        renderMecanicaDetalles();
    }

    if (stepNum === 8) {
        // Extras configurados (los "solo con interior" no salen para Moto)
        pintarPasoExtras();
    }

    if (stepNum === 10) {
        buildResumen();
    }
}

// ==========================================
// PAQUETES, DETALLADORES Y AROMATIZANTES (Configuración)
// Solo se muestra lo configurado y con sus reglas: módulo, tipo de vehículo,
// activos y asignados al paquete. Ver js/catalogo_detallado.js
// ==========================================
async function pintarPasoPaquetes() {
    const cont = document.getElementById('paquetes-detallado-lista');
    const promo = document.getElementById('promo-input-container');
    CatalogoDetallado.mensaje(cont, 'Cargando paquetes…');
    promo.style.display = 'none';

    try {
        await CatalogoDetallado.cargar('local');
    } catch (e) {
        console.error('[Paquetes] Error al cargar:', e);
        CatalogoDetallado.mensaje(cont, CatalogoDetallado.mensajeError(e), true);
        return;
    }

    const esPromo = ordenData.detallado_tipo === CatalogoDetallado.PROMOCION;
    CatalogoDetallado.pintarPaquetes(cont, currentVehicleTipo, {
        seleccionado: ordenData.detallado_tipo,
        onChange: (paquete) => { promo.style.display = paquete ? 'none' : 'block'; }
    });
    promo.style.display = esPromo ? 'block' : 'none';
    if (esPromo && ordenData.promo_detalle) document.getElementById('promo-detalle').value = ordenData.promo_detalle;
}

/** Detalladores internos y aromatizantes del paquete elegido. */
function pintarPasoInterior() {
    const paqueteId = ordenData.paquete ? ordenData.paquete.id : null;
    CatalogoDetallado.pintarOpciones(
        document.getElementById('detalladores-lista'), 'extra_interior',
        CatalogoDetallado.detalladores(paqueteId), ordenData.extra_interior,
        { vacio: 'Este paquete no tiene detalladores internos configurados para Local.' }
    );
    CatalogoDetallado.pintarOpciones(
        document.getElementById('aromatizantes-lista'), 'extra_aroma',
        CatalogoDetallado.aromatizantes(paqueteId), ordenData.extra_aroma,
        { extraFinal: CatalogoDetallado.SIN_AROMA }
    );
}

/** Extras finales configurados (Configuración > Extras). */
async function pintarPasoExtras() {
    const cont = document.getElementById('extras-lista');
    CatalogoDetallado.mensaje(cont, 'Cargando extras…');
    try {
        await CatalogoDetallado.cargarExtras('local');
    } catch (e) {
        console.error('[Extras] Error al cargar:', e);
        CatalogoDetallado.mensaje(cont, CatalogoDetallado.mensajeErrorExtras(e), true);
        return;
    }
    CatalogoDetallado.pintarExtras(cont, currentVehicleTipo, ordenData.extras_finales);
}

/** Detallados especiales configurados (Configuración > Detallados especiales). */
async function pintarPasoEspeciales() {
    const cont = document.getElementById('especiales-list');
    CatalogoDetallado.mensaje(cont, 'Cargando detallados especiales…');
    try {
        await CatalogoDetallado.cargarEspeciales('local');
    } catch (e) {
        console.error('[Especiales] Error al cargar:', e);
        CatalogoDetallado.mensaje(cont, CatalogoDetallado.mensajeErrorEspeciales(e), true);
        return;
    }
    CatalogoDetallado.pintarEspeciales(cont, currentVehicleTipo, ordenData.detallados_especiales);
}

/** Lo que suma el cobro sugerido: paquete (si hay detallado) + especiales elegidos. */
function partesDelCobro() {
    const partes = [];
    if (ordenData.servicios_maestros.includes('Detallado y lavado') && ordenData.paquete) {
        partes.push(ordenData.paquete);
    }
    if (ordenData.servicios_maestros.includes('Detallados especiales')) {
        partes.push(...CatalogoDetallado.especialesElegidos(currentVehicleTipo, ordenData.detallados_especiales));
    }
    return partes;
}

/** Paquete elegido en el paso de Tipo de Detallado (null si es Promoción o no aplica). */
function paqueteElegido(valor) {
    if (!valor || valor === CatalogoDetallado.PROMOCION) return null;
    return CatalogoDetallado.paquetes(currentVehicleTipo).find(p => p.nombre === valor) || null;
}

// Funciones de ruteo del árbol (Lógica de saltos)
function proceedFromDetalladoLavadoExtras() {
    if (ordenData.servicios_maestros.includes('Detallados especiales')) {
        goToStep(5);
    } else if (ordenData.servicios_maestros.includes('Mecanica')) {
        goToStep(6);
    } else {
        goToStep(8); // Siempre a extras finales si eligió Detallado
    }
}

function proceedFromDetalladosEspeciales() {
    if (ordenData.servicios_maestros.includes('Mecanica')) {
        goToStep(6);
    } else {
        goToStep(8); // Siempre a extras finales si eligió Detallados Especiales
    }
}

function proceedFromMecanicaCategorias() {
    // Si seleccionó una categoria de Salto Directo sin seleccionar categorías específicas, salta.
    // Ej: Mantenimiento General, Promo, Otro.
    const hasSpecific = ordenData.mecanica_categorias.some(c => CatalogoMecanica.usaServicios(CatalogoMecanica.buscar(c)));
    
    if (hasSpecific) {
        goToStep(7);
    } else {
        proceedFromMecanicaDetalles();
    }
}

function proceedFromMecanicaDetalles() {
    // Extras finales solo se muestran si eligió detallado
    if (ordenData.servicios_maestros.includes('Detallado y lavado') || 
ordenData.servicios_maestros.includes('Detallados especiales')) {
        goToStep(8); // Ir a Extras Finales
    } else {
        goToStep(9); // Ir a Vehículo (saltando Extras Finales)
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

function setupStep9() {
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
        // El tipo ya viene asignado del step 2 al HTML (veh-tipo)
        const tipo = document.getElementById('veh-tipo').value || currentVehicleTipo || 'OTRO';
        const btn = document.getElementById('btn-save-vehicle');
        btn.disabled = true;
        try {
            const { data: vehData, error: vehError } = await window.supabase.from('vehiculos')
                .insert([{ placa, marca: document.getElementById('veh-marca').value, modelo: document.getElementById('veh-modelo').value, anio: document.getElementById('veh-año').value || null, tipo }]).select();
            
            if (vehError) {
                if (vehError.code === '23505') {
                    throw new Error('Ya existe un vehículo registrado con esta placa. Usa el buscador de arriba para asignarlo.');
                }
                throw vehError; // FIX: changed from error to vehError
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
            goToStep(10);
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

    // Marcas desde Configuración > Marcas de vehículo (solo activas).
    // Si no cargan, el campo sigue aceptando cualquier marca escrita a mano.
    let marcasLista = [];
    window.supabase
        .from('marcas_vehiculo')
        .select('nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .then(({ data, error }) => {
            if (error) throw error;
            marcasLista = (data || []).map(m => m.nombre.toUpperCase());
            // "OTRA" siempre al final, como antes
            marcasLista.sort((a, b) => (a === 'OTRA') - (b === 'OTRA'));
        })
        .catch(e => console.error('[Marcas] Error al cargar:', e));
    
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
        goToStep(10);
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
                currentVehicleModel = v.modelo || '';
                currentVehicleMarca = v.marca || '';
                goToStep(10);
            });
            grid.appendChild(card);
        });
    } catch (err) {}
}

// ==========================================
// STEP 3: SERVICIOS MAESTROS
// ==========================================
function setupStep2() {
    window.processStep2 = function() {
        const tipoSel = document.getElementById('veh-tipo-temp').value;
        const err = document.getElementById('error-step2');
        if (!tipoSel) {
            mostrarSubpasoTipo();
            return;
        }
        currentVehicleTipo = tipoSel;
        
        const checkboxes = document.querySelectorAll('.service-checkbox:checked');
        if (checkboxes.length === 0) { 
            err.textContent = "Selecciona al menos un servicio.";
            err.style.display = 'block'; 
            return; 
        }
        err.style.display = 'none';
        
        ordenData.servicios_maestros = Array.from(checkboxes).map(c => c.value);
        
        if (ordenData.servicios_maestros.includes('Entrada pero servicios pendientes')) {
            goToStep(9); // Vehículo
        } else if (ordenData.servicios_maestros.includes('Detallado y lavado')) {
            goToStep(3);
        } else if (ordenData.servicios_maestros.includes('Detallados especiales')) {
            goToStep(5);
        } else if (ordenData.servicios_maestros.includes('Mecanica')) {
            goToStep(6);
        }
    }
}

// ==========================================
// STEP 4 & 5: DETALLADO
// ==========================================
function setupStep3() {
    window.processStep3 = function() {
        const selected = document.querySelector('input[name="detallado_tipo"]:checked');
        const err = document.getElementById('error-step3');
        if (!selected) { err.style.display = 'block'; return; }
        
        if (selected.value === 'Promocion') {
            const detail = document.getElementById('promo-detalle').value.trim();
            if (!detail) { err.style.display = 'block'; return; }
            ordenData.promo_detalle = detail;
        } else {
            ordenData.promo_detalle = null;
        }
        err.style.display = 'none';
        ordenData.detallado_tipo = selected.value;
        ordenData.paquete = paqueteElegido(selected.value);
        if(!TiposVehiculo.tieneInterior(currentVehicleTipo)) {
            // Tipos sin interior (p. ej. Motos) no tienen extras de interior
            proceedFromDetalladoLavadoExtras();
        } else {
            goToStep(4);
        }
    }
}

function setupStep4() {
    window.processStep4 = function() {
        const interior = document.querySelector('input[name="extra_interior"]:checked');
        const aroma = document.querySelector('input[name="extra_aroma"]:checked');
        const alfombras = document.querySelector('input[name="extra_alfombras"]:checked');
        const err = document.getElementById('error-step4');
        // Si el paquete no tiene detalladores internos configurados, no se pide
        const hayDetalladores = !!document.querySelector('input[name="extra_interior"]');

        if ((hayDetalladores && !interior) || !aroma || !alfombras) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        ordenData.extra_interior = interior ? interior.value : 'No aplica';
        ordenData.extra_aroma = aroma.value;
        ordenData.extra_alfombras = alfombras.value;
        
        proceedFromDetalladoLavadoExtras();
    }
}

// ==========================================
// STEP 6: ESPECIALES
// ==========================================
function setupStep5() {
    window.processStep5 = function() {
        const checkboxes = document.querySelectorAll('.especial-cb:checked');
        const err = document.getElementById('error-step5');
        if (checkboxes.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';
        
        ordenData.detallados_especiales = Array.from(checkboxes).map(c => c.value);
        proceedFromDetalladosEspeciales();
    }
}

// ==========================================
// MECÁNICA: CATEGORÍAS (Configuración > Mecánica)
// ==========================================
function mensajeEn(cont, texto, esError) {
    cont.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'step-desc';
    p.style.gridColumn = '1 / -1';
    if (esError) p.style.color = 'var(--danger-color, var(--sa-error))';
    p.textContent = texto;
    cont.appendChild(p);
}

/** Tarjetas de categorías configuradas (activas). Las que piden detalle muestran su campo de texto. */
async function pintarPasoMecanica() {
    const cont = document.getElementById('mecanica-cat-list');
    mensajeEn(cont, 'Cargando categorías…');
    try {
        await CatalogoMecanica.cargar();
    } catch (e) {
        console.error('[Mecánica] Error al cargar:', e);
        mensajeEn(cont, CatalogoMecanica.mensajeError(e), true);
        return;
    }

    const categorias = CatalogoMecanica.lista();
    if (!categorias.length) {
        mensajeEn(cont, 'No hay categorías de mecánica activas. Se crean en Configuración > Mecánica.', true);
        return;
    }

    const elegidas = ordenData.mecanica_categorias || [];
    const previos = ordenData.mecanica_detalles || {};
    cont.innerHTML = '';

    categorias.forEach(cat => {
        const label = document.createElement('label');
        label.className = 'checkbox-card';
        // Las que no abren lista de servicios ocupan todo el ancho (como antes)
        if (!CatalogoMecanica.usaServicios(cat)) label.style.gridColumn = 'span 2';
        label.innerHTML = '<input type="checkbox" class="mecanica-cat-cb"><div class="checkbox-card-content"><span></span></div>';
        const input = label.querySelector('input');
        input.value = cat.nombre;
        input.checked = elegidas.includes(cat.nombre);
        label.querySelector('span').textContent = cat.nombre;
        cont.appendChild(label);

        if (cat.pide_detalle) {
            const caja = document.createElement('div');
            caja.style.gridColumn = 'span 2';
            caja.style.display = input.checked ? 'block' : 'none';
            caja.innerHTML = '<input type="text" class="form-control mec-cat-texto" placeholder="Describa…">';
            const texto = caja.querySelector('input');
            texto.dataset.cat = cat.nombre;
            texto.setAttribute('aria-label', `Detalle de ${cat.nombre}`);
            if (previos[cat.nombre] && previos[cat.nombre][0]) texto.value = previos[cat.nombre][0];
            input.addEventListener('change', () => {
                caja.style.display = input.checked ? 'block' : 'none';
                if (input.checked) texto.focus();
            });
            cont.appendChild(caja);
        }
    });
}

function setupStep6() {
    window.processStep6 = function() {
        const checkboxes = Array.from(document.querySelectorAll('.mecanica-cat-cb:checked'));
        const err = document.getElementById('error-step6');
        if (checkboxes.length === 0) { err.style.display = 'block'; return; }

        const cats = [];
        const directos = {};   // categorías que no pasan por "Detalles Mecánicos"
        const textos = Array.from(document.querySelectorAll('.mec-cat-texto'));

        for (const cb of checkboxes) {
            const cat = CatalogoMecanica.buscar(cb.value);
            cats.push(cb.value);
            if (cat && cat.pide_detalle) {
                const input = textos.find(t => t.dataset.cat === cb.value);
                const text = input ? input.value.trim() : '';
                if (!text) {
                    err.style.display = 'block';
                    if (input) input.focus();
                    return;
                }
                directos[cb.value] = [text];
            } else if (!CatalogoMecanica.usaServicios(cat)) {
                directos[cb.value] = [cb.value];   // p. ej. Mantenimiento general
            }
        }

        err.style.display = 'none';
        // Lo elegido antes (al volver atrás o al editar) sirve para dejar marcados los servicios
        ordenData.mecanica_previos = ordenData.mecanica_detalles || {};
        ordenData.mecanica_categorias = cats;
        ordenData.mecanica_directos = directos;
        ordenData.mecanica_detalles = { ...directos };

        proceedFromMecanicaCategorias();
    }
}

// ==========================================
// MECÁNICA: DETALLES (servicios de cada categoría)
// ==========================================
function renderMecanicaDetalles() {
    const container = document.getElementById('mecanica-dynamic-container');
    container.innerHTML = '';
    const previos = ordenData.mecanica_previos || {};

    ordenData.mecanica_categorias.forEach(nombre => {
        const cat = CatalogoMecanica.buscar(nombre);
        if (!CatalogoMecanica.usaServicios(cat)) return;
        const antes = previos[nombre] || [];

        const seccion = document.createElement('div');
        seccion.className = 'extra-section';
        seccion.innerHTML = '<h3 class="extra-title"></h3><div class="checkbox-group-cards grid-2" style="margin-top: 16px;"></div>';
        seccion.querySelector('h3').textContent = nombre;
        const grid = seccion.querySelector('.checkbox-group-cards');

        cat.servicios.forEach(servicio => {
            const label = document.createElement('label');
            label.className = 'checkbox-card';
            label.innerHTML = '<input type="checkbox" class="mec-det-cb"><div class="checkbox-card-content"><span></span></div>';
            const input = label.querySelector('input');
            input.value = servicio;
            input.dataset.cat = nombre;
            input.checked = antes.includes(servicio);
            label.querySelector('span').textContent = servicio;
            grid.appendChild(label);
        });

        // "Otro" con texto en cada categoría
        const otroPrevio = antes.find(x => typeof x === 'string' && x.startsWith('Otro: '));
        const otro = document.createElement('label');
        otro.className = 'checkbox-card';
        otro.style.gridColumn = 'span 2';
        otro.innerHTML = '<input type="checkbox" class="mec-det-cb mec-otro-cb"><div class="checkbox-card-content"><span>Otro</span></div>';
        const otroCb = otro.querySelector('input');
        otroCb.dataset.cat = nombre;
        otroCb.checked = !!otroPrevio;

        const caja = document.createElement('div');
        caja.style.gridColumn = 'span 2';
        caja.style.display = otroPrevio ? 'block' : 'none';
        caja.innerHTML = '<input type="text" class="form-control mec-otro-text" placeholder="Describa…">';
        const texto = caja.querySelector('input');
        texto.dataset.cat = nombre;
        texto.setAttribute('aria-label', `Otro servicio de ${nombre}`);
        if (otroPrevio) texto.value = otroPrevio.slice('Otro: '.length);
        otroCb.addEventListener('change', () => {
            caja.style.display = otroCb.checked ? 'block' : 'none';
            if (otroCb.checked) texto.focus();
        });

        grid.appendChild(otro);
        grid.appendChild(caja);
        container.appendChild(seccion);
    });
}

function setupStep7() {
    window.processStep7 = function() {
        let isValid = true;
        const detalles = {};
        const cbs = Array.from(document.querySelectorAll('.mec-det-cb'));
        const textos = Array.from(document.querySelectorAll('.mec-otro-text'));
        const catsRendered = Array.from(new Set(cbs.map(cb => cb.dataset.cat)));

        catsRendered.forEach(cat => {
            const checked = cbs.filter(cb => cb.dataset.cat === cat && cb.checked);
            if (checked.length === 0) isValid = false;

            const arr = [];
            checked.forEach(cb => {
                if (cb.classList.contains('mec-otro-cb')) {
                    const input = textos.find(t => t.dataset.cat === cat);
                    const text = input ? input.value.trim() : '';
                    if (!text) isValid = false;
                    arr.push('Otro: ' + text);
                } else {
                    arr.push(cb.value);
                }
            });
            detalles[cat] = arr;
        });

        const err = document.getElementById('error-step7');
        if (!isValid) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        // Se suman las categorías directas (con detalle escrito o "se marca y listo")
        ordenData.mecanica_detalles = { ...(ordenData.mecanica_directos || {}), ...detalles };
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

function setupStep8() {
    document.querySelectorAll('.extra-final-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if(e.target.id !== 'extra-ninguno' && e.target.checked) {
                document.getElementById('extra-ninguno').checked = false;
            }
        });
    });

    window.processStep8 = function() {
        const checked = document.querySelectorAll('.extra-final-cb:checked');
        const err = document.getElementById('error-step8');
        if(checked.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        ordenData.extras_finales = Array.from(checked).map(c => c.value);
        goToStep(9);
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
            SaNotificar.aviso('Por favor ingrese un monto válido (mayor a 0).', 'advertencia');
            return;
        }

        const btn = document.getElementById('btn-finalizar-orden');
        const btnOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            // Limpieza y coherencia de datos según los servicios maestros activos
            const tieneDetallado = ordenData.servicios_maestros.includes('Detallado y lavado');
            const tieneEspeciales = ordenData.servicios_maestros.includes('Detallados especiales');
            const tieneMecanica = ordenData.servicios_maestros.includes('Mecanica');
            const isMoto = !TiposVehiculo.tieneInterior(currentVehicleTipo);

            let detalladoTipoFinal = "No aplica";
            let extraInteriorFinal = "No aplica";
            let extraAromaFinal = "No aplica";
            let extraAlfombrasFinal = "No aplica";

            if (tieneDetallado) {
                detalladoTipoFinal = ordenData.detallado_tipo === 'Promocion' 
                    ? ('Promocion: ' + (ordenData.promo_detalle || ''))
                    : (ordenData.detallado_tipo || "Detallado");
                
                if (!isMoto) {
                    extraInteriorFinal = ordenData.extra_interior || "No aplica";
                    extraAromaFinal = ordenData.extra_aroma || "No aplica";
                    extraAlfombrasFinal = ordenData.extra_alfombras || "No aplica";
                } else {
                    extraInteriorFinal = "No aplica";
                    extraAromaFinal = "No aplica";
                    extraAlfombrasFinal = "No aplica";
                }
            }

            let mecanicaCategoriasFinal = tieneMecanica ? (ordenData.mecanica_categorias || []) : [];
            let mecanicaDetallesFinal = tieneMecanica ? { ...(ordenData.mecanica_detalles || {}) } : {};
            if (tieneMecanica) {
                // Categorías directas (detalle escrito o "se marca y listo") por si no pasaron por el paso 7
                Object.entries(ordenData.mecanica_directos || {}).forEach(([cat, valor]) => {
                    if (!mecanicaDetallesFinal[cat]) mecanicaDetallesFinal[cat] = valor;
                });
            }

            let especialesFinal = tieneEspeciales ? (ordenData.detallados_especiales || []) : [];
            let extrasFinalesArr = (ordenData.extras_finales && ordenData.extras_finales.length > 0) ? ordenData.extras_finales : ["Ninguno"];

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
                
                detallado_monto: (tieneDetallado || tieneEspeciales) ? montoDetallado : 0,
                mecanica_monto: tieneMecanica ? montoMecanica : 0,
                total_monto: total,
                
                servicios_maestros: ordenData.servicios_maestros,
                detallados_especiales: especialesFinal,
                mecanica_categorias: mecanicaCategoriasFinal,
                mecanica_detalles: mecanicaDetallesFinal,
                extras_finales: extrasFinalesArr,
                
                detallado_tipo: detalladoTipoFinal,
                extra_interior: extraInteriorFinal,
                extra_aroma: extraAromaFinal,
                extra_alfombras: extraAlfombrasFinal
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
                if (window.originalOrderDataForAlert) {
                    const EMAIL_WEBHOOK_URL = window.APP_CONFIG.alertWebhookUrl; // js/config.js
                    const alertPayload = {
                        action: 'edit_alert',
                        modulo: 'Local Comercial',
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
                    modelo: (currentVehicleMarca ? currentVehicleMarca + ' ' : '') + (currentVehicleModel || "Vehículo"),
                    tipo_vehiculo: currentVehicleTipo,
                    
                    estado: ordenGenerada.estado,
                    espera: ordenGenerada.espera,
                    total_monto: ordenGenerada.total_monto,
                    
                    servicios_maestros: ordenGenerada.servicios_maestros ? ordenGenerada.servicios_maestros.join(", ") : "",
                    
                    detallado_tipo: ordenGenerada.detallado_tipo || "No aplica",
                    extra_interior: ordenGenerada.extra_interior || "No aplica",
                    extra_aroma: ordenGenerada.extra_aroma || "No aplica",
                    extra_alfombras: ordenGenerada.extra_alfombras || "No aplica",
                    servicios_extra: ordenGenerada.extras_finales && ordenGenerada.extras_finales.length > 0 ? ordenGenerada.extras_finales.join(", ") : "No aplica",
                    detallados_especiales: ordenGenerada.detallados_especiales && ordenGenerada.detallados_especiales.length > 0 ? ordenGenerada.detallados_especiales.join(", ") : "No aplica",
                    detallado_monto: ordenGenerada.detallado_monto || 0,
                    
                    mecanica_categorias: ordenGenerada.mecanica_categorias && ordenGenerada.mecanica_categorias.length > 0 ? ordenGenerada.mecanica_categorias.join(", ") : "No aplica",
                    mecanica_detalles: (ordenGenerada.mecanica_detalles && typeof ordenGenerada.mecanica_detalles === 'object' && Object.keys(ordenGenerada.mecanica_detalles).length > 0) ? JSON.stringify(ordenGenerada.mecanica_detalles) : "No aplica",
                    mecanica_monto: ordenGenerada.mecanica_monto || 0,
                    
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

                // Generar Ticket PDF Silencioso
                const TICKET_WEBHOOK_URL = window.APP_CONFIG.ticketWebhookUrl; // js/config.js
                const ticketPayload = {
                    action: "generar_ticket",
                    orden_id: ordenGenerada.id,
                    fecha: new Date().toLocaleDateString('es-CR'),
                    cliente_nombre: currentClientName,
                    cliente_telefono: currentClientPhone || "N/A",
                    placa: currentVehiclePlaca,
                    categorias: ordenGenerada.servicios_maestros ? ordenGenerada.servicios_maestros.join(", ") : "N/A",
                    tipo_lavado: ordenGenerada.detallado_tipo || "N/A",
                    detallado_interior: ordenGenerada.extra_interior || "N/A",
                    aromatizante: ordenGenerada.extra_aroma || "N/A",
                    alfombras: ordenGenerada.extra_alfombras || "N/A",
                    servicios_especiales: (ordenGenerada.detallados_especiales && ordenGenerada.detallados_especiales.length > 0) ? ordenGenerada.detallados_especiales.join(", ") : "N/A",
                    mecanica: (ordenGenerada.mecanica_categorias && ordenGenerada.mecanica_categorias.length > 0) ? ordenGenerada.mecanica_categorias.join(", ") : "N/A",
                    extras: (ordenGenerada.extras_finales && ordenGenerada.extras_finales.length > 0) ? ordenGenerada.extras_finales.join(", ") : "N/A",
                    observaciones: ordenGenerada.observaciones || "Ninguna"
                };

                try {
                    fetch(TICKET_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify(ticketPayload)
                    });
                } catch(e) {
                    console.error("Error silencioso Ticket:", e);
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

    // Monto sugerido: paquete + detallados especiales, según tipo de vehículo
    CatalogoDetallado.sugerirMonto(
        document.getElementById('monto-detallado'),
        document.getElementById('precio-paquete-sugerido'),
        partesDelCobro(),
        currentVehicleTipo
    );

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
        
        if (TiposVehiculo.tieneInterior(currentVehicleTipo)) {
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
            if (ordenData.mecanica_detalles[cat]) html += ordenData.mecanica_detalles[cat].join(', ');
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
    toast.style.background = 'rgba(20, 20, 21, 0.95)';
    toast.style.border = type === 'error' ? '1px solid var(--sa-error)' : '1px solid var(--sa-success)';
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
    const iconColor = type === 'error' ? 'var(--sa-error)' : 'var(--sa-success)';
    
    toast.innerHTML = `
        <div class="toast-header" style="display:flex; align-items:center; gap:8px; font-weight:600; margin-bottom:4px; color:${iconColor}">
            <i class="fa-solid ${icon}"></i>
            <span>${title}</span>
        </div>
        <div class="toast-message" style="font-size:14px; color:var(--sa-text-secondary);">${message}</div>
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


