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
    const btnPdf = document.getElementById('btnPdf');

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (currentStep === 1 && !validatePaso1()) {
                alert('Por favor, complete todos los campos obligatorios del vehículo (Placa, Cliente, Mecánico, Marca, Modelo, Año, Kilometraje).');
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

    if (btnPdf) {
        btnPdf.addEventListener('click', generarPDFDirecto);
    }

    // Permitir clic en los indicadores de paso
    document.querySelectorAll('.step-dot').forEach(dot => {
        dot.style.cursor = 'pointer';
        dot.addEventListener('click', () => {
            const targetStep = parseInt(dot.getAttribute('data-step'));
            if (targetStep !== currentStep) {
                if (currentStep === 1 && targetStep > 1 && !validatePaso1()) {
                    alert('Por favor, complete todos los campos obligatorios del vehículo primero.');
                    return;
                }
                currentStep = targetStep;
                if (currentStep === 7) generateSummary();
                updateUI();
            }
        });
    });
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
    const btnPdf = document.getElementById('btnPdf');

    if (btnBack) btnBack.disabled = currentStep === 1;
    
    if (currentStep === totalSteps) {
        if (btnNext) btnNext.classList.add('hidden');
        if (btnSave) btnSave.classList.remove('hidden');
        if (btnPdf) btnPdf.classList.remove('hidden');
    } else {
        if (btnNext) btnNext.classList.remove('hidden');
        if (btnSave) btnSave.classList.add('hidden');
        if (btnPdf) btnPdf.classList.add('hidden');
    }
}

// ===================== RESUMEN =====================
function generateSummary() {
    const summaryContent = document.getElementById('summaryContent');
    if (!summaryContent) return;
    
    const placa = document.getElementById('placa')?.value.toUpperCase() || '-';
    const cliente = document.getElementById('cliente')?.value || '-';
    const marca = document.getElementById('marca')?.value || '-';
    const modelo = document.getElementById('modelo')?.value || '-';
    const anio = document.getElementById('anio')?.value || '-';
    const kilometraje = document.getElementById('kilometraje')?.value || '-';
    
    let goodCount = 0;
    let regularCount = 0;
    let badCount = 0;
    const attentionItems = [];

    document.querySelectorAll('.checklist-item').forEach(itemDiv => {
        const item = itemDiv.getAttribute('data-item') || '';
        const radio = itemDiv.querySelector('input[type="radio"]:checked');
        const val = radio ? radio.value : 'Bueno';
        if (val === 'Bueno') goodCount++;
        else if (val === 'Regular') {
            regularCount++;
            attentionItems.push({ item, estado: 'Regular', color: '#f39c12' });
        } else if (val === 'Malo') {
            badCount++;
            attentionItems.push({ item, estado: 'Malo', color: '#e74c3c' });
        }
    });

    let itemsHtml = '';
    if (attentionItems.length > 0) {
        itemsHtml = `
            <div style="margin-top: 14px;">
                <p style="font-size: 13px; color: #d4af37; font-weight: 600; margin-bottom: 6px;">Puntos que requieren atención:</p>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${attentionItems.map(a => `<span style="background: rgba(255,255,255,0.05); border: 1px solid ${a.color}; color: ${a.color}; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${a.item}: ${a.estado}</span>`).join('')}
                </div>
            </div>
        `;
    }

    summaryContent.innerHTML = `
        <div style="background: rgba(0,0,0,0.3); padding: 14px; border-radius: 10px; border: 1px solid rgba(212,175,55,0.2);">
            <p><strong>Vehículo:</strong> ${marca} ${modelo} (${anio}) | <strong>Placa:</strong> ${placa} | <strong>Km:</strong> ${kilometraje}</p>
            <p style="margin-top: 4px;"><strong>Cliente:</strong> ${cliente}</p>
            <div style="display: flex; gap: 15px; margin-top: 10px; font-size: 13px;">
                <span style="color: #27ae60;">🟢 Bueno: <strong>${goodCount}</strong></span>
                <span style="color: #f39c12;">🟡 Regular: <strong>${regularCount}</strong></span>
                <span style="color: #e74c3c;">🔴 Malo: <strong>${badCount}</strong></span>
            </div>
            ${itemsHtml}
        </div>
    `;
}

// ===================== GENERAR PDF DIRECTO DESDE FORMULARIO =====================
async function generarPDFDirecto() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("Error: Librería jsPDF no disponible.");
        return;
    }
    const btnPdf = document.getElementById('btnPdf');
    if (btnPdf) { btnPdf.disabled = true; btnPdf.textContent = '⏳ Generando...'; }

    try {
        const fechaActual = new Date().toISOString().split('T')[0];
        const v = {
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

        const formData = {
            vehiculo: v,
            interiorExterior: {}, parteInferior: {}, neumaticos: {}, motor: {}, frenos: {},
            observaciones: v.observaciones
        };

        const catMap = {
            'checklistInteriorExterior': 'interiorExterior',
            'checklistParteInferior': 'parteInferior',
            'checklistNeumaticos': 'neumaticos',
            'checklistMotor': 'motor',
            'checklistFrenos': 'frenos'
        };

        document.querySelectorAll('.checklist-item').forEach(itemDiv => {
            const cat = itemDiv.getAttribute('data-category');
            const item = itemDiv.getAttribute('data-item');
            const radio = itemDiv.querySelector('input[type="radio"]:checked');
            const targetCat = catMap[cat];
            if (targetCat) {
                formData[targetCat][item] = radio ? radio.value : 'Bueno';
            }
        });

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const margin = 16;
        let y = 0;
        const gold = [212, 175, 55], darkBg = [22, 22, 22], white = [255, 255, 255], lightGray = [200, 200, 200];
        const green = [39, 174, 96], orange = [243, 156, 18], red = [231, 76, 60];

        function addPageBg() { doc.setFillColor(...darkBg); doc.rect(0, 0, W, H, 'F'); }
        function checkPage(needed) { if (y + needed > H - 20) { doc.addPage(); addPageBg(); y = 20; } }

        const logoImg = await new Promise((resolve) => {
            const img = new Image(); img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => {
                const fallback = new Image(); fallback.crossOrigin = 'Anonymous';
                fallback.onload = () => resolve(fallback);
                fallback.onerror = () => resolve(null);
                fallback.src = 'LOGO SUS AMIGOS.jpg';
            };
            img.src = '../LOGO SUS AMIGOS.jpg';
        });

        addPageBg();
        doc.setFillColor(...gold); doc.rect(0, 38, W, 1.5, 'F');
        let textStartX = margin;
        if (logoImg) { doc.addImage(logoImg, 'JPEG', margin, 10, 24, 24); textStartX = margin + 30; }
        doc.setTextColor(...gold); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
        doc.text('INSPECCIÓN MECÁNICA', textStartX, 18);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray);
        doc.text("Sus Amigos Centro de Servicios", textStartX, 26);
        doc.setTextColor(...gold); doc.setFontSize(10);
        doc.text('Fecha: ' + (formData.vehiculo.fecha || ''), W - margin, 18, { align: 'right' });

        y = 48; doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold);
        doc.text('DATOS DEL VEHÍCULO', margin, y); y += 2;
        doc.setDrawColor(...gold); doc.setLineWidth(0.4); doc.line(margin, y, W - margin, y); y += 7;

        const campos = [
            ['Placa', v.placa], ['Cliente', v.cliente], ['Mecánico', v.mecanico],
            ['Marca', v.marca], ['Modelo', v.modelo], ['Año', v.anio],
            ['Kilometraje', v.kilometraje ? `${v.kilometraje} km` : '—']
        ];
        doc.setFontSize(9);
        const colW = (W - margin * 2) / 3;
        campos.forEach((c, i) => {
            const col = i % 3, x = margin + col * colW;
            doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray); doc.text(c[0] + ':', x, y);
            doc.setFont('helvetica', 'bold'); doc.setTextColor(...white); doc.text(String(c[1] || '—'), x + 22, y);
            if (col === 2) y += 7;
        });
        if (campos.length % 3 !== 0) y += 7;
        y += 4;

        const estadoLabel = {
            'Bueno': 'Bueno', 'bueno': 'Bueno', 'buen_estado': 'Bueno',
            'Regular': 'Regular', 'regular': 'Regular', 'atencion_futura': 'Regular',
            'Malo': 'Malo', 'malo': 'Malo', 'atencion_inmediata': 'Malo'
        };
        const estadoColor = {
            'Bueno': green, 'bueno': green, 'buen_estado': green,
            'Regular': orange, 'regular': orange, 'atencion_futura': orange,
            'Malo': red, 'malo': red, 'atencion_inmediata': red
        };
        const secciones = [
            { titulo: 'INTERIOR / EXTERIOR', datos: formData.interiorExterior },
            { titulo: 'PARTE INFERIOR', datos: formData.parteInferior },
            { titulo: 'NEUMÁTICOS', datos: formData.neumaticos },
            { titulo: 'MOTOR', datos: formData.motor },
            { titulo: 'FRENOS', datos: formData.frenos }
        ];

        secciones.forEach(sec => {
            const items = Object.entries(sec.datos || {});
            if (items.length === 0) return;
            checkPage(12 + items.length * 7);
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold); doc.text(sec.titulo, margin, y);
            y += 2; doc.setDrawColor(...gold); doc.setLineWidth(0.3); doc.line(margin, y, W - margin, y); y += 6;
            doc.setFontSize(9);
            items.forEach(([item, estado]) => {
                checkPage(8);
                doc.setFillColor(30, 30, 30); doc.roundedRect(margin, y - 4, W - margin * 2, 6.5, 1, 1, 'F');
                doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray); doc.text(item, margin + 3, y);
                if (estado && estadoLabel[estado]) {
                    const color = estadoColor[estado] || lightGray;
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...color); doc.setFillColor(...color);
                    doc.circle(W - margin - 50, y - 1.2, 1.5, 'F'); doc.text(estadoLabel[estado], W - margin - 46, y);
                } else {
                    doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100); doc.text(estado || 'Sin evaluar', W - margin - 46, y);
                }
                y += 7;
            });
            y += 5;
        });

        if (formData.observaciones && formData.observaciones.trim()) {
            checkPage(25);
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold); doc.text('OBSERVACIONES', margin, y);
            y += 2; doc.setDrawColor(...gold); doc.line(margin, y, W - margin, y); y += 6;
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray);
            const lines = doc.splitTextToSize(formData.observaciones, W - margin * 2 - 4);
            lines.forEach(line => { checkPage(6); doc.text(line, margin + 2, y); y += 5; });
            y += 5;
        }

        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p); doc.setFillColor(...gold); doc.rect(0, H - 14, W, 0.5, 'F');
            doc.setFontSize(7); doc.setTextColor(...lightGray);
            doc.text("Sus Amigos Centro de Servicios — Inspección Mecánica", margin, H - 6);
            doc.setTextColor(...gold); doc.text(`Página ${p} de ${totalPages}`, W - margin, H - 6, { align: 'right' });
        }

        doc.save(`Inspeccion_${formData.vehiculo.placa || 'SP'}_${formData.vehiculo.fecha || 'SF'}.pdf`);
    } catch (err) {
        console.error("Error generando PDF:", err);
        alert("Error al generar PDF: " + err.message);
    } finally {
        if (btnPdf) { btnPdf.disabled = false; btnPdf.textContent = '📄 Generar PDF'; }
    }
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
