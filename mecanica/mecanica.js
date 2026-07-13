// ===================== SUPABASE =====================
const SUPABASE_URL = 'https://jrusddndxmcztxxmzlfc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_m1oaIAYCibEvZWgWf0KQNw_1QQpiSzM';

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

// ===================== ESTADO GLOBAL =====================
let inspecciones = [];

// ===================== INICIALIZACIÓN =====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchInspecciones);
} else {
    fetchInspecciones();
}

// ===================== FETCH DATA =====================
async function fetchInspecciones() {
    const loader = document.getElementById('loader');
    if (loader) loader.textContent = "Iniciando conexión a base de datos...";

    if (!supabaseClient) {
        if (loader) {
            loader.textContent = "Error: La librería de la base de datos (Supabase) no se pudo cargar.";
            loader.style.color = "#ff4d6d";
        }
        return;
    }

    try {
        if (loader) loader.textContent = "Consultando inspecciones...";
        const { data, error } = await supabaseClient
            .from('inspecciones')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            if (loader) { loader.textContent = "Error de Supabase: " + error.message; loader.style.color = "#ff4d6d"; }
            return;
        }

        inspecciones = data || [];
        renderList();
    } catch (err) {
        console.error('Error fetching inspecciones:', err);
        if (loader) { loader.textContent = "Error al cargar: " + (err.message || err); loader.style.color = "#ff4d6d"; }
    }
}

// ===================== RENDERIZADO =====================
function renderList() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';

    const container = document.getElementById('listContainer');
    const emptyState = document.getElementById('emptyState');
    const totalCount = document.getElementById('totalCount');

    if (totalCount) {
        totalCount.textContent = `${inspecciones.length} registro${inspecciones.length !== 1 ? 's' : ''}`;
    }

    if (inspecciones.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (container) container.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    if (container) {
        container.innerHTML = inspecciones.map(insp => {
            let fechaFormat = insp.fecha;
            if (fechaFormat) {
                const parts = fechaFormat.split('-');
                if (parts.length === 3) fechaFormat = `${parts[2]}/${parts[1]}/${parts[0]}`;
            } else {
                fechaFormat = 'Sin fecha';
            }

            let horaFormat = '';
            if (insp.created_at) {
                try {
                    const dt = new Date(insp.created_at);
                    horaFormat = dt.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: true });
                } catch (e) { horaFormat = ''; }
            }

            return `
                <div class="card">
                    <div class="card-top">
                        <div>
                            <div class="card-title">
                                🚗 ${insp.marca} ${insp.modelo}
                                <span class="card-placa">${insp.placa || 'S/P'}</span>
                            </div>
                            <div class="card-date">🗓️ ${fechaFormat}${horaFormat ? ' &nbsp;⏰ ' + horaFormat : ''}</div>
                        </div>
                        <button class="btn-delete" onclick="openDeleteModal('${insp.id}')" title="Borrar inspección">✕</button>
                    </div>
                    
                    <div class="card-details">
                        <div class="detail-item">
                            <span class="detail-label">Cliente</span>
                            <span class="detail-value">👤 ${insp.cliente || 'No registrado'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Mecánico</span>
                            <span class="detail-value">🔧 ${insp.mecanico || 'No asignado'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Año</span>
                            <span class="detail-value">📅 ${insp.anio || '-'}</span>
                        </div>
                    </div>

                    <div class="card-actions">
                        <button class="btn-action btn-pdf" onclick="descargarPDF('${insp.id}')" id="btnPdf_${insp.id}">
                            📄 PDF
                        </button>
                        <button class="btn-action btn-fotos" onclick="openFotoModal('${insp.id}')" id="btnFotos_${insp.id}">
                            📷 Fotos<span class="foto-badge" id="fotoBadge_${insp.id}"></span>
                        </button>
                        <a href="javascript:void(0)" class="btn-action btn-whatsapp" onclick="enviarWhatsApp('${insp.id}')" id="btnWA_${insp.id}">
                            💬 Enviar
                        </a>
                    </div>
                </div>
            `;
        }).join('');
        setTimeout(() => loadAllFotoCounts(), 200);
    }
}

// ===================== WHATSAPP =====================
async function enviarWhatsApp(id) {
    const insp = inspecciones.find(i => String(i.id) === String(id));
    if (!insp) return;

    const btnWA = document.getElementById(`btnWA_${id}`);
    if (btnWA) { btnWA.style.pointerEvents = 'none'; btnWA.innerHTML = '⏳ Preparando...'; }

    const mensaje =
        `Hola ${insp.cliente || ''},\n\n` +
        `Te compartimos el reporte de inspección mecánica de tu vehículo *${insp.marca} ${insp.modelo}* (Placa: *${insp.placa}*).\n\n` +
        `*Sus Amigos Centro de Servicios* ✨`;

    const archivos = [];

    try {
        if (!fotosCache[id]) await loadFotoCount(id);
        const fotos = fotosCache[id] || [];

        if (btnWA) btnWA.innerHTML = '⏳ Generando PDF...';
        const pdfBlob = await generarPDFBlob(id, fotos);
        const pdfName = `Inspeccion_${insp.placa || 'SP'}_${insp.fecha || 'SF'}.pdf`;

        if (pdfBlob) {
            archivos.push(new File([pdfBlob], pdfName, { type: 'application/pdf' }));
        }

        if (btnWA) btnWA.innerHTML = '⏳ Abriendo WhatsApp...';

        const esHTTPS = location.protocol === 'https:';
        const tieneShare = typeof navigator.share === 'function';
        const tieneCanShare = typeof navigator.canShare === 'function';

        let compartidoConArchivos = false;

        // Intentar compartir con archivos de forma nativa (iOS/Android)
        if (esHTTPS && tieneShare && tieneCanShare && archivos.length > 0) {
            try {
                if (navigator.canShare({ files: archivos })) {
                    await navigator.share({ title: 'Inspección Mecánica', text: mensaje, files: archivos });
                    compartidoConArchivos = true;
                }
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') return; // Usuario canceló
                console.warn('Share nativo falló:', shareErr.message);
            }
        }

        // Si falló el share nativo o estamos en PC, descargar y abrir web
        if (!compartidoConArchivos) {
            for (const f of archivos) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(f);
                a.download = f.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
                await new Promise(r => setTimeout(r, 300));
            }

            const notaDescarga = archivos.length > 0
                ? `\n\nℹ️ El archivo PDF se descargó en tu dispositivo. Por favor adjúntalo en el chat.`
                : '';

            const textoCodificado = encodeURIComponent(mensaje + notaDescarga);

            if (esHTTPS && tieneShare) {
                try {
                    await navigator.share({ title: 'Inspección', text: mensaje + notaDescarga });
                } catch (e) {
                    if (e.name !== 'AbortError') mostrarOpcionesWhatsApp(textoCodificado);
                }
            } else {
                mostrarOpcionesWhatsApp(textoCodificado);
            }
        }

    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Error en envío:', e);
            showToast('Error: ' + (e.message || 'desconocido'), 'error');
        }
    } finally {
        if (btnWA) { btnWA.style.pointerEvents = 'auto'; btnWA.innerHTML = '💬 Enviar'; }
    }
}

function mostrarOpcionesWhatsApp(textoCodificado) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100vw'; overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';

    const modal = document.createElement('div');
    modal.style.backgroundColor = '#1a1a1a';
    modal.style.padding = '24px';
    modal.style.borderRadius = '12px';
    modal.style.textAlign = 'center';
    modal.style.border = '1px solid #d4af37';
    modal.style.width = '90%';
    modal.style.maxWidth = '320px';
    modal.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';

    modal.innerHTML = `
        <h3 style="color:#d4af37; margin-top:0; font-family:sans-serif;">Abrir en WhatsApp</h3>
        <p style="color:#ccc; font-size:14px; margin-bottom:20px; font-family:sans-serif;">El archivo PDF ya se descargó. Elige desde qué aplicación deseas enviar el mensaje:</p>
        <button id="btnWaNormal" style="background:#25D366; color:#fff; border:none; padding:12px; margin-bottom:10px; border-radius:8px; cursor:pointer; width:100%; font-weight:bold; font-size:15px; display:flex; align-items:center; justify-content:center; gap:8px;">
            WhatsApp Normal
        </button>
        <button id="btnWaBusiness" style="background:#128C7E; color:#fff; border:none; padding:12px; margin-bottom:10px; border-radius:8px; cursor:pointer; width:100%; font-weight:bold; font-size:15px; display:flex; align-items:center; justify-content:center; gap:8px;">
            WhatsApp Business
        </button>
        <button id="btnWaWeb" style="background:#273443; color:#fff; border:none; padding:12px; margin-bottom:10px; border-radius:8px; cursor:pointer; width:100%; font-weight:bold; font-size:15px; display:flex; align-items:center; justify-content:center; gap:8px;">
            🖥️ Web (PC)
        </button>
        <button id="btnWaCancel" style="background:transparent; color:#d4af37; border:1px solid #d4af37; padding:12px; margin-top:15px; border-radius:8px; cursor:pointer; width:100%; font-weight:bold; font-size:15px;">
            Cancelar
        </button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const removeModal = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };

    document.getElementById('btnWaNormal').onclick = () => {
        window.open(`whatsapp://send?text=${textoCodificado}`, '_blank');
        removeModal();
    };

    document.getElementById('btnWaBusiness').onclick = () => {
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (isAndroid) {
            window.open(`intent://send?text=${textoCodificado}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end;`, '_blank');
        } else {
            // iOS u otros sistemas (usamos link universal o scheme de business para iOS si aplica)
            window.open(`wa-business://send?text=${textoCodificado}`, '_self');
            // Por si falla en iOS, abrimos web fallback 
            setTimeout(() => { window.open(`https://wa.me/?text=${textoCodificado}`, '_blank'); }, 500);
        }
        removeModal();
    };

    document.getElementById('btnWaWeb').onclick = () => {
        window.open(`https://web.whatsapp.com/send?text=${textoCodificado}`, '_blank');
        removeModal();
    };

    document.getElementById('btnWaCancel').onclick = removeModal;
}

async function appendFotosToPDF(doc, W, H, margin, gold, darkBg, lightGray, fotos) {
    if (!fotos || fotos.length === 0) return;
    function addPageBg() { doc.setFillColor(...darkBg); doc.rect(0, 0, W, H, 'F'); }

    for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        try {
            const response = await fetch(foto.url);
            const blob = await response.blob();
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = base64;
            });

            doc.addPage();
            addPageBg();

            doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold);
            doc.text(`EVIDENCIA FOTOGRÁFICA (${i + 1}/${fotos.length})`, margin, 20);
            doc.setDrawColor(...gold); doc.setLineWidth(0.4); doc.line(margin, 22, W - margin, 22);

            const maxWidth = W - margin * 2;
            const maxHeight = H - 60; // Mayor margen para no tocar el pie de página

            let imgW = img.width;
            let imgH = img.height;
            const ratio = Math.min(maxWidth / imgW, maxHeight / imgH);

            imgW = imgW * ratio;
            imgH = imgH * ratio;

            const x = (W - imgW) / 2;
            const y = 30;

            const format = base64.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(base64, format, x, y, imgW, imgH);
        } catch (err) {
            console.error("Error al cargar foto en PDF:", err);
        }
    }
}

// Genera el PDF y lo devuelve como Blob (sin descargar)
async function generarPDFBlob(id, fotos = []) {
    const insp = inspecciones.find(i => String(i.id) === String(id));
    if (!insp) return null;
    const { data: detalles } = await supabaseClient.from('detalle_inspeccion').select('*').eq('inspeccion_id', id);
    const formData = {
        vehiculo: { fecha: insp.fecha, placa: insp.placa, cliente: insp.cliente, mecanico: insp.mecanico, marca: insp.marca, modelo: insp.modelo, anio: insp.anio },
        interiorExterior: {}, parteInferior: {}, neumaticos: {}, motor: {}, frenos: {},
        observaciones: insp.observaciones || ''
    };
    const seccionMap = { 'Interior/Exterior': 'interiorExterior', 'Parte Inferior': 'parteInferior', 'Neumáticos': 'neumaticos', 'Motor': 'motor', 'Frenos': 'frenos' };
    if (detalles) detalles.forEach(d => { const k = seccionMap[d.seccion]; if (k) formData[k][d.item] = d.estado; });
    return await buildPDFBlob(formData, fotos);
}

// Genera el ZIP de fotos y lo devuelve como Blob (sin descargar)
async function generarZipBlob(id) {
    const fotos = fotosCache[id] || [];
    if (fotos.length === 0 || !window.JSZip) return null;
    const insp = inspecciones.find(i => String(i.id) === String(id));
    const zip = new window.JSZip();
    const carpeta = zip.folder(`Fotos_${insp?.placa || id}`);
    for (const foto of fotos) {
        const resp = await fetch(foto.url);
        carpeta.file(foto.name, await resp.blob());
    }
    return await zip.generateAsync({ type: 'blob' });
}

// ===================== GENERAR PDF =====================
async function descargarPDF(id) {
    const btn = document.getElementById(`btnPdf_${id}`);
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generando...'; }

    try {
        const insp = inspecciones.find(i => String(i.id) === String(id));
        if (!insp) throw new Error("Inspección no encontrada");

        const { data: detalles, error } = await supabaseClient
            .from('detalle_inspeccion').select('*').eq('inspeccion_id', id);
        if (error) throw error;

        if (!fotosCache[id]) await loadFotoCount(id);
        const fotos = fotosCache[id] || [];

        const formData = {
            vehiculo: { fecha: insp.fecha, placa: insp.placa, cliente: insp.cliente, mecanico: insp.mecanico, marca: insp.marca, modelo: insp.modelo, anio: insp.anio },
            interiorExterior: {}, parteInferior: {}, neumaticos: {}, motor: {}, frenos: {},
            observaciones: insp.observaciones || ''
        };

        const seccionMap = {
            'Interior/Exterior': 'interiorExterior', 'Parte Inferior': 'parteInferior',
            'Neumáticos': 'neumaticos', 'Motor': 'motor', 'Frenos': 'frenos'
        };

        if (detalles) {
            detalles.forEach(d => { const k = seccionMap[d.seccion]; if (k) formData[k][d.item] = d.estado; });
        }
        await buildPDF(formData, fotos);
    } catch (err) {
        console.error("Error al generar PDF:", err);
        showToast('Error al generar PDF', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

async function buildPDF(formData, fotos = []) {
    if (!window.jspdf || !window.jspdf.jsPDF) { showToast('Error: librería PDF no cargó.', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'letter');
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = 0;
    const gold = [212, 175, 55], darkBg = [22, 22, 22], white = [255, 255, 255];
    const lightGray = [200, 200, 200], green = [39, 174, 96], orange = [243, 156, 18], red = [231, 76, 60];

    function addPageBg() { doc.setFillColor(...darkBg); doc.rect(0, 0, W, H, 'F'); }
    function checkPage(needed) { if (y + needed > H - 20) { doc.addPage(); addPageBg(); y = 20; } }

    const logoImg = await new Promise((resolve) => {
        const img = new Image(); img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = 'logo.jpg';
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

    const v = formData.vehiculo;
    const campos = [['Placa', v.placa], ['Cliente', v.cliente], ['Mecánico', v.mecanico], ['Marca', v.marca], ['Modelo', v.modelo], ['Año', v.anio]];
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

    const estadoLabel = { 'buen_estado': 'Buen estado', 'atencion_futura': 'Atención futura', 'atencion_inmediata': 'Atención inmediata' };
    const estadoColor = { 'buen_estado': green, 'atencion_futura': orange, 'atencion_inmediata': red };
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
                const color = estadoColor[estado];
                doc.setFont('helvetica', 'bold'); doc.setTextColor(...color); doc.setFillColor(...color);
                doc.circle(W - margin - 50, y - 1.2, 1.5, 'F'); doc.text(estadoLabel[estado], W - margin - 46, y);
            } else {
                doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100); doc.text('Sin evaluar', W - margin - 46, y);
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

    await appendFotosToPDF(doc, W, H, margin, gold, darkBg, lightGray, fotos);

    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p); doc.setFillColor(...gold); doc.rect(0, H - 14, W, 0.5, 'F');
        doc.setFontSize(7); doc.setTextColor(...lightGray);
        doc.text("Sus Amigos Centro de Servicios — Inspección Mecánica", margin, H - 6);
        doc.setTextColor(...gold); doc.text(`Página ${p} de ${totalPages}`, W - margin, H - 6, { align: 'right' });
    }

    doc.save(`Inspeccion_${formData.vehiculo.placa || 'SP'}_${formData.vehiculo.fecha || 'SF'}.pdf`);
    showToast('✅ PDF generado', 'success');
}

// buildPDFBlob: igual que buildPDF pero devuelve Blob en lugar de descargar
async function buildPDFBlob(formData, fotos = []) {
    if (!window.jspdf || !window.jspdf.jsPDF) return null;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'letter');
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), margin = 16;
    let y = 0;
    const gold = [212, 175, 55], darkBg = [22, 22, 22], white = [255, 255, 255], lightGray = [200, 200, 200];
    const green = [39, 174, 96], orange = [243, 156, 18], red = [231, 76, 60];
    function addPageBg() { doc.setFillColor(...darkBg); doc.rect(0, 0, W, H, 'F'); }
    function checkPage(n) { if (y + n > H - 20) { doc.addPage(); addPageBg(); y = 20; } }
    const logoImg = await new Promise(resolve => { const img = new Image(); img.crossOrigin = 'Anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = 'logo.jpg'; });
    addPageBg(); doc.setFillColor(...gold); doc.rect(0, 38, W, 1.5, 'F');
    let tx = margin; if (logoImg) { doc.addImage(logoImg, 'JPEG', margin, 10, 24, 24); tx = margin + 30; }
    doc.setTextColor(...gold); doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text('INSPECCIÓN MECÁNICA', tx, 18);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray); doc.text("Sus Amigos Centro de Servicios", tx, 26);
    doc.setTextColor(...gold); doc.setFontSize(10); doc.text('Fecha: ' + (formData.vehiculo.fecha || ''), W - margin, 18, { align: 'right' });
    y = 48; doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold); doc.text('DATOS DEL VEHÍCULO', margin, y); y += 2;
    doc.setDrawColor(...gold); doc.setLineWidth(0.4); doc.line(margin, y, W - margin, y); y += 7;
    const v = formData.vehiculo, campos = [['Placa', v.placa], ['Cliente', v.cliente], ['Mecánico', v.mecanico], ['Marca', v.marca], ['Modelo', v.modelo], ['Año', v.anio]];
    doc.setFontSize(9); const colW = (W - margin * 2) / 3;
    campos.forEach((c, i) => { const col = i % 3, x = margin + col * colW; doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray); doc.text(c[0] + ':', x, y); doc.setFont('helvetica', 'bold'); doc.setTextColor(...white); doc.text(String(c[1] || '—'), x + 22, y); if (col === 2) y += 7; });
    if (campos.length % 3 !== 0) y += 7; y += 4;
    const eLabel = { 'buen_estado': 'Buen estado', 'atencion_futura': 'Atención futura', 'atencion_inmediata': 'Atención inmediata' };
    const eColor = { 'buen_estado': green, 'atencion_futura': orange, 'atencion_inmediata': red };
    [{ titulo: 'INTERIOR / EXTERIOR', datos: formData.interiorExterior }, { titulo: 'PARTE INFERIOR', datos: formData.parteInferior }, { titulo: 'NEUMÁTICOS', datos: formData.neumaticos }, { titulo: 'MOTOR', datos: formData.motor }, { titulo: 'FRENOS', datos: formData.frenos }].forEach(sec => {
        const items = Object.entries(sec.datos || {}); if (!items.length) return;
        checkPage(12 + items.length * 7); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold); doc.text(sec.titulo, margin, y); y += 2;
        doc.setDrawColor(...gold); doc.setLineWidth(0.3); doc.line(margin, y, W - margin, y); y += 6; doc.setFontSize(9);
        items.forEach(([item, estado]) => {
            checkPage(8); doc.setFillColor(30, 30, 30); doc.roundedRect(margin, y - 4, W - margin * 2, 6.5, 1, 1, 'F'); doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray); doc.text(item, margin + 3, y);
            if (estado && eLabel[estado]) { const c = eColor[estado]; doc.setFont('helvetica', 'bold'); doc.setTextColor(...c); doc.setFillColor(...c); doc.circle(W - margin - 50, y - 1.2, 1.5, 'F'); doc.text(eLabel[estado], W - margin - 46, y); }
            else { doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100); doc.text('Sin evaluar', W - margin - 46, y); } y += 7;
        }); y += 5;
    });
    if (formData.observaciones && formData.observaciones.trim()) { checkPage(25); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold); doc.text('OBSERVACIONES', margin, y); y += 2; doc.setDrawColor(...gold); doc.line(margin, y, W - margin, y); y += 6; doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...lightGray); doc.splitTextToSize(formData.observaciones, W - margin * 2 - 4).forEach(l => { checkPage(6); doc.text(l, margin + 2, y); y += 5; }); y += 5; }

    await appendFotosToPDF(doc, W, H, margin, gold, darkBg, lightGray, fotos);

    const tp = doc.internal.getNumberOfPages(); for (let p = 1; p <= tp; p++) { doc.setPage(p); doc.setFillColor(...gold); doc.rect(0, H - 14, W, 0.5, 'F'); doc.setFontSize(7); doc.setTextColor(...lightGray); doc.text("Sus Amigos Centro de Servicios — Inspección Mecánica", margin, H - 6); doc.setTextColor(...gold); doc.text(`Página ${p} de ${tp}`, W - margin, H - 6, { align: 'right' }); }
    return doc.output('blob');
}


function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast show';
    if (type === 'error') toast.classList.add('toast-error');
    else toast.classList.add('toast-success');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ===================== BORRAR REGISTRO =====================
let deleteTargetId = null;

function openDeleteModal(id) {
    deleteTargetId = id;
    const input = document.getElementById('deletePwInput');
    const error = document.getElementById('deletePwError');
    const modal = document.getElementById('deleteModal');
    if (input) input.value = '';
    if (error) error.style.display = 'none';
    if (modal) modal.classList.add('show');
    setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.remove('show');
    deleteTargetId = null;
}

const btnConfirm = document.getElementById('btnDeleteConfirm');
if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
        const input = document.getElementById('deletePwInput');
        const pw = input ? input.value.trim() : '';
        if (pw !== "AnEd2026" && pw !== "EdAn2026") {
            const error = document.getElementById('deletePwError');
            if (error) error.style.display = 'block';
            return;
        }
        if (!deleteTargetId) return;
        const originalText = btnConfirm.innerHTML;
        btnConfirm.disabled = true; btnConfirm.innerHTML = '⏳ Borrando...';
        try {
            const resDetalle = await supabaseClient.from('detalle_inspeccion').delete().eq('inspeccion_id', deleteTargetId).select();
            if (resDetalle.error) throw resDetalle.error;
            const { data, error } = await supabaseClient.from('inspecciones').delete().eq('id', deleteTargetId).select();
            if (error) throw error;
            if (data && data.length === 0) throw new Error("Bloqueado por permisos de Supabase (RLS)");
            showToast('✅ Registro borrado permanentemente', 'success');
            closeDeleteModal();
            fetchInspecciones();
        } catch (err) {
            console.error("Error borrando:", err);
            showToast('Error al borrar el registro', 'error');
        } finally {
            btnConfirm.disabled = false; btnConfirm.innerHTML = originalText;
        }
    });
}

const deleteModal = document.getElementById('deleteModal');
if (deleteModal) {
    deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });
}

// ===================== FOTOS (Supabase Storage) =====================
const BUCKET = 'inspeccion-fotos';
let fotoTargetId = null;
let fotosCache = {};

function openFotoModal(id) {
    fotoTargetId = String(id);
    const modal = document.getElementById('fotoModal');
    const grid = document.getElementById('fotoGrid');
    if (modal) { modal.style.display = 'flex'; modal.classList.add('show'); }
    if (grid) grid.innerHTML = '<div class="foto-loading">Cargando fotos...</div>';
    loadFotos(fotoTargetId);
    const inp = document.getElementById('fotoInput');
    if (inp) inp.value = '';
}

function closeFotoModal() {
    const modal = document.getElementById('fotoModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = ''; }
    fotoTargetId = null;
}

if (document.getElementById('fotoModal')) {
    document.getElementById('fotoModal').addEventListener('click', e => {
        if (e.target === document.getElementById('fotoModal')) closeFotoModal();
    });
}

async function loadFotos(id) {
    const grid = document.getElementById('fotoGrid');
    try {
        const { data, error } = await supabaseClient.storage
            .from(BUCKET).list(String(id), { sortBy: { column: 'created_at', order: 'desc' } });
        if (error) {
            if (grid) grid.innerHTML = '<div class="foto-empty" style="color:#ff4d6d">⚠️ ' + error.message + '</div>';
            return;
        }
        const fotos = (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
        fotosCache[id] = fotos.map(f => ({
            name: f.name,
            url: supabaseClient.storage.from(BUCKET).getPublicUrl(`${id}/${f.name}`).data.publicUrl
        }));
        updateFotoBadge(id, fotos.length);
        renderFotoGrid(id);
    } catch (e) {
        if (grid) grid.innerHTML = '<div class="foto-empty" style="color:#ff4d6d">⚠️ ' + (e.message || e) + '</div>';
    }
}

function renderFotoGrid(id) {
    const grid = document.getElementById('fotoGrid');
    if (!grid) return;
    const fotos = fotosCache[id] || [];
    if (fotos.length === 0) {
        grid.innerHTML = '<div class="foto-empty">📷 Sin fotos aún. Toca arriba para agregar.</div>';
        return;
    }
    grid.innerHTML = fotos.map(f => `
        <div class="foto-item">
            <img src="${f.url}" alt="${f.name}" loading="lazy" onclick="window.open('${f.url}','_blank')">
            <button class="foto-delete" onclick="deleteFoto('${id}','${f.name}')">✕</button>
        </div>
    `).join('');
}

function updateFotoBadge(id, count) {
    const badge = document.getElementById(`fotoBadge_${id}`);
    if (!badge) return;
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

async function uploadFotos(files) {
    if (!fotoTargetId || !files || files.length === 0) return;
    const label = document.querySelector('.foto-upload-area');
    if (label) label.style.opacity = '0.5';
    let uploaded = 0;
    for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `foto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const path = `${fotoTargetId}/${fileName}`;
        try {
            const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file, { upsert: false });
            if (!error) uploaded++;
            else console.error('Upload error:', error.message);
        } catch (e) { console.error(e); }
    }
    if (label) label.style.opacity = '1';
    const inp = document.getElementById('fotoInput');
    if (inp) inp.value = '';
    if (uploaded > 0) {
        showToast(`✅ ${uploaded} foto(s) subida(s)`, 'success');
        loadFotos(fotoTargetId);
    } else {
        showToast('❌ Error al subir — revisa bucket en Supabase', 'error');
    }
}

async function deleteFoto(id, name) {
    const { error } = await supabaseClient.storage.from(BUCKET).remove([`${id}/${name}`]);
    if (error) { showToast('Error al borrar foto', 'error'); return; }
    showToast('🗑️ Foto eliminada', 'success');
    loadFotos(id);
}

async function descargarZipModal() {
    if (fotoTargetId) await descargarZip(fotoTargetId);
}

async function descargarZip(id) {
    if (!fotosCache[id]) await loadFotoCount(id);
    const fotos = fotosCache[id] || [];
    if (fotos.length === 0) { showToast('No hay fotos para comprimir', 'error'); return; }
    if (!window.JSZip) { showToast('Error: librería ZIP no cargó', 'error'); return; }
    const btn = document.getElementById('btnModalZip');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Creando ZIP...'; }
    try {
        const insp = inspecciones.find(i => String(i.id) === String(id));
        const zip = new window.JSZip();
        const carpeta = zip.folder(`Fotos_${insp?.placa || id}`);
        for (const foto of fotos) {
            const resp = await fetch(foto.url);
            const blob = await resp.blob();
            carpeta.file(foto.name, blob);
        }
        const content = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `Fotos_${insp?.placa || id}_${insp?.fecha || ''}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('✅ ZIP descargado', 'success');
    } catch (e) {
        showToast('Error al crear ZIP', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '🗜️ Descargar ZIP de Fotos'; }
    }
}

async function loadAllFotoCounts() {
    for (const insp of inspecciones) loadFotoCount(insp.id);
}

async function loadFotoCount(id) {
    try {
        const { data } = await supabaseClient.storage.from(BUCKET).list(String(id));
        const fotos = (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
        fotosCache[id] = fotos.map(f => ({
            name: f.name,
            url: supabaseClient.storage.from(BUCKET).getPublicUrl(`${id}/${f.name}`).data.publicUrl
        }));
        updateFotoBadge(id, fotos.length);
    } catch (e) { /* silent */ } a
}