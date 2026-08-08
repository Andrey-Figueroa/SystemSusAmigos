// ===================== SUPABASE =====================
const SUPABASE_URL = 'https://gmwerwjwkrnnovvxkumj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gO9HPpqk7aMaLelBZx7oOw_Qp3VvZTR';

let supabaseClient = null;
try {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.warn('⚠️ Supabase CDN no cargó.');
    }
} catch (e) {
    console.error('⚠️ Error inicializando Supabase:', e);
}

// ===================== ESTADO DEL FORMULARIO =====================
let currentStep = 1;
const totalSteps = 7;

// ===================== DATOS DEL CHECKLIST =====================
const checklistData = {
    'checklistInteriorExterior': [
        'Luces delanteras', 'Luces traseras', 'Direccionales', 
        'Espejos', 'Limpiaparabrisas', 'Bocina / Claxon', 'Cinturones de seguridad'
    ],
    'checklistParteInferior': [
        'Escape', 'Suspensión delantera', 'Suspensión trasera', 
        'Fugas de aceite', 'Fugas de refrigerante', 'Fugas de transmisión'
    ],
    'checklistNeumaticos': [
        'Presión Delantera Izquierda', 'Presión Delantera Derecha', 
        'Presión Trasera Izquierda', 'Presión Trasera Derecha', 
        'Desgaste de banda', 'Llanta de repuesto'
    ],
    'checklistMotor': [
        'Nivel de aceite', 'Nivel de refrigerante', 'Líquido de dirección', 
        'Filtro de aire', 'Correas / Bandas', 'Batería'
    ],
    'checklistFrenos': [
        'Pastillas delanteras', 'Pastillas traseras', 'Discos / Tambores', 
        'Líquido de frenos', 'Freno de mano'
    ]
};

// ===================== INICIALIZACIÓN =====================
document.addEventListener('DOMContentLoaded', () => {
    initChecklists();
    initNavigation();
    updateUI();
});

// ===================== RENDERIZAR CHECKLISTS =====================
function initChecklists() {
    for (const [containerId, items] of Object.entries(checklistData)) {
        const container = document.getElementById(containerId);
        if (!container) continue;
        
        const html = items.map((item, index) => {
            const safeId = containerId + '_' + index;
            return `
                <div class="checklist-item" data-category="${containerId}" data-item="${item}">
                    <span class="checklist-label">${item}</span>
                    <div class="checklist-options">
                        <input type="radio" name="${safeId}" id="good_${safeId}" value="Bueno" checked>
                        <label for="good_${safeId}" class="opt-good">Bueno</label>
                        
                        <input type="radio" name="${safeId}" id="future_${safeId}" value="Regular">
                        <label for="future_${safeId}" class="opt-future">Regular</label>
                        
                        <input type="radio" name="${safeId}" id="urgent_${safeId}" value="Malo">
                        <label for="urgent_${safeId}" class="opt-urgent">Malo</label>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = html;
    }
}

// ===================== NAVEGACIÓN DE PASOS =====================
function initNavigation() {
    const btnNext = document.getElementById('btnNext');
    const btnBack = document.getElementById('btnBack');
    const btnSave = document.getElementById('btnSave');

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (currentStep === 1 && !validatePaso1()) {
                alert('Por favor, complete todos los campos obligatorios del vehículo (Placa, Cliente, Mecánico, Marca, Modelo, Año).');
                return;
            }
            if (currentStep < totalSteps) {
                currentStep++;
                if (currentStep === 7) generateSummary();
                updateUI();
            }
        });
    }

    if (btnBack) {
        btnBack.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                updateUI();
            }
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', saveForm);
    }
}

function validatePaso1() {
    const inputs = ['placa', 'cliente', 'mecanico', 'marca', 'modelo', 'anio', 'kilometraje'];
    for (const id of inputs) {
        const el = document.getElementById(id);
        if (el && el.hasAttribute('required') && !el.value.trim()) {
            return false;
        }
    }
    return true;
}

function updateUI() {
    // 1. Ocultar todas las secciones y mostrar la activa
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    const activeSection = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    if (activeSection) activeSection.classList.add('active');

    // 2. Actualizar dots superiores
    document.querySelectorAll('.step-dot').forEach(dot => {
        const stepNum = parseInt(dot.getAttribute('data-step'));
        if (stepNum <= currentStep) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });

    // 3. Barra de progreso
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        const percentage = ((currentStep - 1) / (totalSteps - 1)) * 100;
        progressFill.style.width = `${percentage}%`;
    }

    // 4. Actualizar badge superior
    const headerStep = document.getElementById('headerStep');
    if (headerStep) {
        headerStep.textContent = `Paso ${currentStep} de ${totalSteps}`;
    }

    // 5. Botones de navegación
    const btnBack = document.getElementById('btnBack');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');

    if (btnBack) btnBack.disabled = currentStep === 1;
    
    if (currentStep === totalSteps) {
        if (btnNext) btnNext.classList.add('hidden');
        if (btnSave) btnSave.classList.remove('hidden');
    } else {
        if (btnNext) btnNext.classList.remove('hidden');
        if (btnSave) btnSave.classList.add('hidden');
    }
}

// ===================== RESUMEN =====================
function generateSummary() {
    const summaryContent = document.getElementById('summaryContent');
    if (!summaryContent) return;
    
    const placa = document.getElementById('placa')?.value || '-';
    const marca = document.getElementById('marca')?.value || '-';
    const kilometraje = document.getElementById('kilometraje')?.value || '-';
    
    let badItemsCount = 0;
    document.querySelectorAll('.checklist-item').forEach(itemDiv => {
        const radio = itemDiv.querySelector('input[type="radio"]:checked');
        if (radio && radio.value === 'Malo') badItemsCount++;
    });

    summaryContent.innerHTML = `
        <p><strong>Vehículo:</strong> ${marca} (Placa: ${placa}) | <strong>Km:</strong> ${kilometraje}</p>
        <p><strong>Elementos marcados como Malo:</strong> ${badItemsCount}</p>
        <p><em>Revise las notas antes de guardar.</em></p>
    `;
}

// ===================== GUARDADO EN SUPABASE =====================
async function saveForm() {
    const btnSave = document.getElementById('btnSave');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';
    }

    if (!supabaseClient) {
        alert("Error de conexión a la base de datos.");
        if(btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Guardar Inspección'; }
        return;
    }

    // 1. Recolectar datos principales
    const fechaActual = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const inspeccionData = {
        fecha: fechaActual,
        placa: document.getElementById('placa')?.value.toUpperCase() || '',
        cliente: document.getElementById('cliente')?.value || '',
        mecanico: document.getElementById('mecanico')?.value || '',
        marca: document.getElementById('marca')?.value || '',
        modelo: document.getElementById('modelo')?.value || '',
        anio: document.getElementById('anio')?.value || '',
        kilometraje: document.getElementById('kilometraje')?.value || '',
        observaciones: document.getElementById('observaciones')?.value || ''
    };

    try {
        // 2. Insertar en tabla inspecciones
        const { data: inspData, error: inspError } = await supabaseClient
            .from('inspecciones')
            .insert([inspeccionData])
            .select();

        if (inspError) throw inspError;
        
        if (!inspData || inspData.length === 0) {
            throw new Error("No se devolvió ID al guardar.");
        }

        const newId = inspData[0].id;

        // 3. Recolectar e insertar detalles
        const detalles = [];
        document.querySelectorAll('.checklist-item').forEach(itemDiv => {
            const categoria = itemDiv.getAttribute('data-category');
            const item = itemDiv.getAttribute('data-item');
            const radio = itemDiv.querySelector('input[type="radio"]:checked');
            
            // Hacer que los nombres de categoría sean más amigables
            let catName = categoria;
            if(categoria === 'checklistInteriorExterior') catName = 'Interior/Exterior';
            else if(categoria === 'checklistParteInferior') catName = 'Parte Inferior';
            else if(categoria === 'checklistNeumaticos') catName = 'Neumáticos';
            else if(categoria === 'checklistMotor') catName = 'Motor';
            else if(categoria === 'checklistFrenos') catName = 'Frenos';

            detalles.push({
                inspeccion_id: newId,
                categoria: catName,
                item: item,
                estado: radio ? radio.value : 'Bueno'
            });
        });

        if (detalles.length > 0) {
            const { error: detError } = await supabaseClient
                .from('detalle_inspeccion')
                .insert(detalles);
            
            if (detError) console.error("Error guardando detalles:", detError);
        }

        // 4. Éxito y redirección
        alert('Inspección guardada correctamente!');
        window.location.href = 'index.html';

    } catch (err) {
        console.error(err);
        alert('Error al guardar: ' + err.message);
        if(btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Guardar Inspección'; }
    }
}
