// Global Variables
let activeUser = null;
let activeUserRole = null;
let todaySales = [];

// ==========================================
// ⚠️ PEGA AQUÍ LA URL DE TU GOOGLE APPS SCRIPT
// ==========================================
const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbykRunJyxYMbrWyeQl7pyOxUPVr7trGFp4qS9avRi4giNaadHeo4SIs41oX7nh5j7HIRw/exec";
// ==========================================

// DOM Elements
const formSale = document.getElementById('sale-form');
const inputProductName = document.getElementById('product-name');
const inputPrice = document.getElementById('product-price');
const payEfectivo = document.getElementById('pay-efectivo');
const payTarjeta = document.getElementById('pay-tarjeta');
const paySinpe = document.getElementById('pay-sinpe');
const payCxc = document.getElementById('pay-cxc');

const balanceBadge = document.getElementById('balance-badge');
const validationMsg = document.getElementById('payment-validation-msg');
const btnSubmit = document.getElementById('btn-submit-sale');

const salesList = document.getElementById('sales-list');
const emptyState = document.getElementById('sales-empty-state');
const statTotal = document.getElementById('stat-total');
const statCxc = document.getElementById('stat-cxc');

const detailsModal = document.getElementById('sale-details-modal');
const btnCloseDetails = document.getElementById('btn-close-details');

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session Check
    if (!window.supabase) {
        alert('Supabase client not initialized');
        return;
    }

    try {
        const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
            window.location.href = '../login/index.html';
            return;
        }

        const activeUserStr = localStorage.getItem('activeUser') || session.user.email;
        const activeUserRoleStr = localStorage.getItem('activeUserRole');

        if (!activeUserRoleStr) {
            window.location.href = '../login/index.html';
            return;
        }

        activeUser = activeUserStr;
        activeUserRole = activeUserRoleStr;

        document.getElementById('display-user').textContent = activeUser;
        document.getElementById('responsable-text').innerHTML = `Responsable: <strong>${activeUser}</strong>`;

        // Show Cerrar Caja for Dueños
        const btnCerrarCaja = document.getElementById('btn-cerrar-caja');
        if ((activeUserRole === 'Dueño' || activeUserRole === 'Soporte TI / Programador') && btnCerrarCaja) {
            btnCerrarCaja.style.display = 'flex';
        }

        // Setup Date Header
        const now = new Date();
        document.getElementById('today-date-badge').textContent = now.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' });

        // Event Listeners
        setupEventListeners();

        // Load Today's Sales
        await loadTodaySales();

    } catch (err) {
        console.error('Initialization error:', err);
    }
});

function setupEventListeners() {
    // Toggles logic
    const toggles = document.querySelectorAll('.pay-toggle');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const container = document.getElementById(targetId);
            const input = container.querySelector('.pay-input');
            
            if (e.target.checked) {
                container.style.display = 'block';
                input.focus();
                e.target.closest('.toggle-btn').classList.add('active');
            } else {
                container.style.display = 'none';
                input.value = ''; // reset to empty
                e.target.closest('.toggle-btn').classList.remove('active');
                calculateBalance(); // recalculate live
            }
        });
    });

    // Live Calculation of Payments
    const payInputs = [payEfectivo, payTarjeta, paySinpe, payCxc];
    
    inputPrice.addEventListener('input', calculateBalance);
    payInputs.forEach(input => {
        input.addEventListener('input', calculateBalance);
    });

    // Form Submit
    formSale.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const price = parseFloat(inputPrice.value) || 0;
        const efe = parseFloat(payEfectivo.value) || 0;
        const tar = parseFloat(payTarjeta.value) || 0;
        const sin = parseFloat(paySinpe.value) || 0;
        const cxc = parseFloat(payCxc.value) || 0;

        const totalPaid = efe + tar + sin + cxc;

        if (Math.abs(price - totalPaid) > 0.01) {
            showValidation('La suma de los pagos debe ser igual al Precio Total.');
            return;
        }

        const saleData = {
            nombre_producto: inputProductName.value.trim(),
            precio_total: price,
            monto_efectivo: efe,
            monto_tarjeta: tar,
            monto_sinpe: sin,
            monto_cxc: cxc,
            vendedor: activeUser
        };

        const originalBtnHTML = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btnSubmit.disabled = true;

        try {
            const { data: insertedData, error } = await window.supabase
                .from('ventas_productos_diarias')
                .insert([saleData])
                .select();
            
            if (error) throw error;

            const insertedSale = insertedData[0];

            // Enviar copia a Google Sheets silenciosamente
            if (GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "") {
                try {
                    // Agregamos el ID generado para futuras eliminaciones
                    const payload = { ...saleData, id: insertedSale.id };
                    fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors', // Evita problemas de CORS con Google Scripts
                        headers: {
                            'Content-Type': 'text/plain', // Obligatorio para no-cors
                        },
                        body: JSON.stringify(payload)
                    }).catch(err => console.error("Error silencioso Sheets:", err));
                } catch (e) {
                    console.error("Fallo al contactar Sheets", e);
                }
            }

            showToast('Éxito', 'Venta registrada correctamente.', 'success');
            
            // Reset Form and toggles
            formSale.reset();
            toggles.forEach(t => {
                const container = document.getElementById(t.getAttribute('data-target'));
                container.style.display = 'none';
                t.closest('.toggle-btn').classList.remove('active');
            });
            calculateBalance();
            inputProductName.focus();

            // Reload List
            await loadTodaySales();
            
        } catch (err) {
            console.error('Error saving sale:', err);
            showToast('Error', 'No se pudo guardar la venta.', 'error');
        } finally {
            btnSubmit.innerHTML = originalBtnHTML;
        }
    });

    // Close Details Modal
    if (btnCloseDetails) btnCloseDetails.addEventListener('click', closeDetailsModal);
    window.addEventListener('click', (e) => {
        if (e.target === detailsModal) closeDetailsModal();
    });

    // Cierre de Caja Event
    const btnCerrarCaja = document.getElementById('btn-cerrar-caja');
    if (btnCerrarCaja) {
        btnCerrarCaja.addEventListener('click', async () => {
            if (activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') return;
            if (!confirm('¿Estás seguro de hacer el Cierre de Caja? Esto guardará el respaldo en Drive, moverá las ventas a la maestra y borrará la hoja diaria de Google Sheets.')) return;
            
            const originalHTML = btnCerrarCaja.innerHTML;
            btnCerrarCaja.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
            btnCerrarCaja.disabled = true;

            try {
                if (GOOGLE_SHEETS_WEBHOOK_URL.trim() === "") {
                    throw new Error("No hay URL de Google Sheets configurada.");
                }

                const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'cierre_caja' })
                });

                showToast('Cierre Completado', 'El respaldo y la limpieza se han ejecutado en Google Sheets.', 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'No se pudo completar el cierre automático en Google Sheets.', 'error');
            } finally {
                btnCerrarCaja.innerHTML = originalHTML;
                btnCerrarCaja.disabled = false;
            }
        });
    }
}

function calculateBalance() {
    const price = parseFloat(inputPrice.value) || 0;
    
    const efe = parseFloat(payEfectivo.value) || 0;
    const tar = parseFloat(payTarjeta.value) || 0;
    const sin = parseFloat(paySinpe.value) || 0;
    const cxc = parseFloat(payCxc.value) || 0;

    const totalPaid = efe + tar + sin + cxc;
    const diff = price - totalPaid;

    if (price === 0) {
        balanceBadge.textContent = 'Ingrese Precio';
        balanceBadge.className = 'balance-badge';
        btnSubmit.disabled = true;
        validationMsg.style.display = 'none';
        return;
    }

    if (Math.abs(diff) < 0.01) {
        // Balanced
        balanceBadge.textContent = '¡Cuadrado!';
        balanceBadge.className = 'balance-badge balanced';
        btnSubmit.disabled = false;
        validationMsg.style.display = 'none';
    } else if (diff > 0) {
        // Missing
        balanceBadge.textContent = `Falta: ₡${formatNumber(diff)}`;
        balanceBadge.className = 'balance-badge';
        btnSubmit.disabled = true;
        showValidation(`Faltan ₡${formatNumber(diff)} por asignar en los métodos de pago.`);
    } else {
        // Overpaid
        balanceBadge.textContent = `Sobra: ₡${formatNumber(Math.abs(diff))}`;
        balanceBadge.className = 'balance-badge';
        btnSubmit.disabled = true;
        showValidation(`Se excedió el precio total por ₡${formatNumber(Math.abs(diff))}.`);
    }
}

function showValidation(msg) {
    validationMsg.textContent = msg;
    validationMsg.style.display = 'block';
}

async function loadTodaySales() {
    try {
        // Get today's start and end in local time to query properly
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        
        const { data, error } = await window.supabase
            .from('ventas_productos_diarias')
            .select('*')
            .gte('created_at', startOfDay)
            .order('created_at', { ascending: false });

        if (error) throw error;

        todaySales = data || [];
        renderSales();
        updateStats();

    } catch (err) {
        console.error('Error fetching today sales:', err);
    }
}

function renderSales() {
    salesList.innerHTML = '';
    
    if (todaySales.length === 0) {
        salesList.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    salesList.style.display = 'flex';
    emptyState.style.display = 'none';

    todaySales.forEach(sale => {
        const li = document.createElement('li');
        li.className = 'sale-item';

        const time = new Date(sale.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        // Generate payment tags
        let tagsHTML = '';
        if (sale.monto_efectivo > 0) tagsHTML += `<span class="pay-tag"><i class="fa-solid fa-money-bill-wave"></i> Efe</span>`;
        if (sale.monto_tarjeta > 0) tagsHTML += `<span class="pay-tag"><i class="fa-solid fa-credit-card"></i> Tar</span>`;
        if (sale.monto_sinpe > 0) tagsHTML += `<span class="pay-tag"><i class="fa-solid fa-mobile-screen"></i> Sinpe</span>`;
        if (sale.monto_cxc > 0) tagsHTML += `<span class="pay-tag" style="color:var(--warning-color)"><i class="fa-solid fa-file-invoice-dollar"></i> CxC</span>`;

        // Delete button restricted to Dueño
        const deleteBtnHTML = (activeUserRole === 'Dueño' || activeUserRole === 'Soporte TI / Programador') ? 
            `<button class="btn-icon delete" style="width:26px; height:26px;" title="Eliminar Venta" onclick="deleteSale('${sale.id}')"><i class="fa-solid fa-trash-can" style="font-size:10px;"></i></button>` : '';

        li.innerHTML = `
            <div class="sale-header">
                <span class="sale-product">${sale.nombre_producto}</span>
                <span class="sale-time">${time}</span>
            </div>
            <div class="sale-body">
                <div class="payment-tags">
                    ${tagsHTML}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="sale-total">₡${formatNumber(sale.precio_total)}</span>
                    <button class="btn-icon view" style="width:26px; height:26px;" title="Ver Ficha" onclick="viewSaleDetails('${sale.id}')"><i class="fa-solid fa-eye" style="font-size:10px;"></i></button>
                    ${deleteBtnHTML}
                </div>
            </div>
        `;
        salesList.appendChild(li);
    });
}

window.viewSaleDetails = function(id) {
    const sale = todaySales.find(s => s.id === id);
    if (!sale) return;

    document.getElementById('detail-product').textContent = sale.nombre_producto;
    const time = new Date(sale.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('detail-time').innerHTML = `<i class="fa-solid fa-clock"></i> Hoy a las ${time}`;
    document.getElementById('detail-seller').textContent = sale.vendedor || 'Sistema';

    let breakdownHTML = '';
    if (sale.monto_efectivo > 0) {
        breakdownHTML += `<div style="display:flex; justify-content:space-between;"><span style="color:var(--text-secondary);"><i class="fa-solid fa-money-bill-wave" style="margin-right:6px;"></i>Efectivo</span> <strong>₡${formatNumber(sale.monto_efectivo)}</strong></div>`;
    }
    if (sale.monto_tarjeta > 0) {
        breakdownHTML += `<div style="display:flex; justify-content:space-between;"><span style="color:var(--text-secondary);"><i class="fa-solid fa-credit-card" style="margin-right:6px;"></i>Tarjeta</span> <strong>₡${formatNumber(sale.monto_tarjeta)}</strong></div>`;
    }
    if (sale.monto_sinpe > 0) {
        breakdownHTML += `<div style="display:flex; justify-content:space-between;"><span style="color:var(--text-secondary);"><i class="fa-solid fa-mobile-screen" style="margin-right:6px;"></i>Sinpe Móvil</span> <strong>₡${formatNumber(sale.monto_sinpe)}</strong></div>`;
    }
    if (sale.monto_cxc > 0) {
        breakdownHTML += `<div style="display:flex; justify-content:space-between;"><span style="color:var(--warning-color);"><i class="fa-solid fa-file-invoice-dollar" style="margin-right:6px;"></i>Cuenta por Cobrar</span> <strong style="color:var(--warning-color);">₡${formatNumber(sale.monto_cxc)}</strong></div>`;
    }
    
    document.getElementById('detail-payment-breakdown').innerHTML = breakdownHTML;
    document.getElementById('detail-total').textContent = `₡${formatNumber(sale.precio_total)}`;

    detailsModal.classList.add('active');
}

window.deleteSale = async function(id) {
    if (activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') {
        showToast('Acceso Denegado', 'Solo el Dueño puede eliminar ventas.', 'error');
        return;
    }

    const sale = todaySales.find(s => s.id === parseInt(id) || s.id === id);
    const desglose = sale 
        ? `Venta ID: ${id}\nProducto: ${sale.nombre_producto}\nMonto Total: ₡${parseFloat(sale.precio_total).toLocaleString('en-US')}\nResponsable: ${sale.responsable}\nFecha: ${new Date(sale.created_at).toLocaleString('es-CR')}`
        : `Venta ID: ${id}`;

    if (!confirm('¿Estás seguro de eliminar esta venta permanentemente?')) return;

    try {
        const { error } = await window.supabase
            .from('ventas_productos_diarias')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Ventas', desglose);
        }
        
        // Enviar orden de eliminación a Google Sheets
        if (GOOGLE_SHEETS_WEBHOOK_URL.trim() !== "") {
            fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'delete_sale', id: id })
            }).catch(e => console.error(e));
        }

        showToast('Eliminada', 'Venta eliminada con éxito.', 'success');
        await loadTodaySales();
    } catch (err) {
        showToast('Error', 'No se pudo eliminar la venta.', 'error');
    }
}

function closeDetailsModal() {
    detailsModal.classList.remove('active');
}

function updateStats() {
    let totalIngresos = 0;
    let totalCxc = 0;

    todaySales.forEach(s => {
        // Ingresos reales (efectivo, tarjeta, sinpe)
        totalIngresos += (s.monto_efectivo + s.monto_tarjeta + s.monto_sinpe);
        totalCxc += s.monto_cxc;
    });

    statTotal.textContent = `₡${formatNumber(totalIngresos)}`;
    statCxc.textContent = `₡${formatNumber(totalCxc)}`;
}

function formatNumber(num) {
    return Number(num).toLocaleString('es-CR');
}

// Global Toast function
function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <div class="toast-header">
            <i class="fa-solid ${icon}"></i>
            <span>${title}</span>
        </div>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}
