const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbykRunJyxYMbrWyeQl7pyOxUPVr7trGFp4qS9avRi4giNaadHeo4SIs41oX7nh5j7HIRw/exec";
let gastosData = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    const activeUser = localStorage.getItem('activeUser');
    const activeUserRole = localStorage.getItem('activeUserRole');
    if (!activeUser || !['Dueño', 'Administrador', 'Cajero', 'Soporte TI / Programador'].includes(activeUserRole)) {
        window.location.href = '../login/index.html';
        return;
    }
    document.getElementById('display-user').textContent = activeUser;

    await loadPersonal();
    await loadGastos();

    // Configurar form
    document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);
});

async function loadPersonal() {
    try {
        const { data: personal, error } = await window.supabase
            .from('personal')
            .select('nombre')
            .order('nombre', { ascending: true });
        
        if (error) throw error;

        const container = document.getElementById('responsable-container');
        if (!personal || personal.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 14px;">No hay personal registrado en la base de datos.</p>';
            return;
        }

        container.innerHTML = '';
        personal.forEach(p => {
            const label = document.createElement('label');
            label.className = 'toggle-btn responsive-toggle';
            label.innerHTML = `
                <input type="radio" name="responsable-radio" value="${p.nombre}" required>
                ${p.nombre}
            `;
            // Listener para actualizar el hidden input y UI
            label.querySelector('input').addEventListener('change', (e) => {
                document.querySelectorAll('.responsable-grid .toggle-btn').forEach(l => l.classList.remove('active'));
                if (e.target.checked) {
                    label.classList.add('active');
                    document.getElementById('expense-responsable').value = p.nombre;
                }
            });
            container.appendChild(label);
        });
    } catch (err) {
        console.error("Error al cargar personal:", err);
        showToast('Error', 'No se pudo cargar la lista de personal', 'error');
    }
}

async function loadGastos() {
    try {
        const todayStr = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
        document.getElementById('today-date-badge').textContent = todayStr;

        // Fetch gastos de hoy
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const endOfDay = new Date();
        endOfDay.setHours(23,59,59,999);

        const { data, error } = await window.supabase
            .from('gastos')
            .select('*')
            .gte('created_at', startOfDay.toISOString())
            .lte('created_at', endOfDay.toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;
        gastosData = data || [];

        const list = document.getElementById('expenses-list');
        const emptyState = document.getElementById('expenses-empty-state');
        
        if (!data || data.length === 0) {
            list.innerHTML = '';
            emptyState.style.display = 'flex';
            document.getElementById('stat-total').textContent = '₡0';
            return;
        }

        emptyState.style.display = 'none';
        list.innerHTML = '';
        let totalGastos = 0;

        data.forEach(gasto => {
            totalGastos += Number(gasto.monto || 0);

            const li = document.createElement('li');
            li.className = 'sale-item';
            
            const time = new Date(gasto.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
            
            let tagsHTML = `<span class="pay-tag"><i class="fa-solid fa-money-bill-wave"></i> Efe</span>`;

            // Setup data for modal
            const gastoData = encodeURIComponent(JSON.stringify(gasto));

            const activeUserRole = localStorage.getItem('activeUserRole');
            const deleteBtnHTML = activeUserRole === 'Dueño' || activeUserRole === 'Administrador' || activeUserRole === 'Soporte TI / Programador' ? 
                `<button class="btn-icon delete" style="width:26px; height:26px;" title="Eliminar Gasto" onclick="eliminarGasto('${gasto.id}')"><i class="fa-solid fa-trash-can" style="font-size:10px;"></i></button>` : '';

            li.innerHTML = `
                <div class="sale-header">
                    <span class="sale-product">${gasto.descripcion}</span>
                    <span class="sale-time">${time}</span>
                </div>
                <div class="sale-body">
                    <div class="payment-tags">
                        ${tagsHTML}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="sale-total text-red">₡${Number(gasto.monto).toLocaleString('en-US')}</span>
                        <button class="btn-icon view" style="width:26px; height:26px;" title="Ver Ficha" onclick="viewExpenseDetails('${gastoData}')"><i class="fa-solid fa-eye" style="font-size:10px;"></i></button>
                        ${deleteBtnHTML}
                    </div>
                </div>
            `;
            list.appendChild(li);
        });

        document.getElementById('stat-total').textContent = `₡${totalGastos.toLocaleString('en-US')}`;

    } catch (err) {
        console.error("Error al cargar gastos:", err);
        showToast('Error', 'No se pudieron cargar los gastos de hoy', 'error');
    }
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-expense');
    
    try {
        const monto = parseFloat(document.getElementById('expense-amount').value);
        const responsable = document.getElementById('expense-responsable').value;
        const descripcion = document.getElementById('expense-desc').value.trim();
        const autoriza = localStorage.getItem('activeUser') || 'Desconocido';

        if (!responsable) {
            showToast('Alerta', 'Debe seleccionar un responsable.', 'warning');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando...';

        // 1. Insertar en Supabase
        const { data: newGasto, error } = await window.supabase
            .from('gastos')
            .insert([{
                monto: monto,
                responsable: responsable,
                descripcion: descripcion,
                autoriza: autoriza
            }])
            .select()
            .single();

        if (error) throw error;

        // 2. Enviar Webhook a Google Sheets (Asíncrono)
        try {
            fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({
                    action: 'gasto',
                    id: newGasto.id,
                    monto: monto,
                    responsable: responsable,
                    descripcion: descripcion,
                    autoriza: autoriza
                }),
                headers: { "Content-Type": "application/json" }
            });
        } catch (sheetsErr) {
            console.error("Error enviando gasto a sheets", sheetsErr);
        }

        // Reset UI
        e.target.reset();
        document.querySelectorAll('.responsable-grid .toggle-btn').forEach(l => l.classList.remove('active'));
        document.getElementById('expense-responsable').value = '';
        
        showToast('Éxito', 'Gasto registrado correctamente.', 'success');
        loadGastos();

    } catch (err) {
        console.error("Error al registrar gasto:", err);
        showToast('Error', 'Hubo un error al registrar el gasto.', 'error');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Registrar gastos <i class="fa-solid fa-arrow-right"></i>';
    }
}

window.eliminarGasto = async function(id) {
    const activeUserRole = localStorage.getItem('activeUserRole');
    if (activeUserRole !== 'Dueño' && activeUserRole !== 'Administrador' && activeUserRole !== 'Soporte TI / Programador') {
        showToast('Acceso Denegado', 'No tienes permisos para eliminar gastos.', 'error');
        return;
    }
    const g = gastosData.find(x => x.id === parseInt(id) || x.id === id);
    const desglose = g 
        ? `Gasto ID: ${id}\nMonto: ₡${parseFloat(g.monto).toLocaleString('en-US')}\nDescripción: ${g.descripcion}\nResponsable: ${g.responsable}\nAutorizó: ${g.autoriza || 'N/A'}`
        : `Gasto ID: ${id}`;

    if (!confirm(`¿Estás seguro de que deseas eliminar este gasto de la base de datos permanentemente?`)) return;

    try {
        const { error } = await window.supabase
            .from('gastos')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Avisar a sheets
        try {
            fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({
                    action: 'delete_gasto',
                    id: id
                }),
                headers: { "Content-Type": "text/plain" }
            });
        } catch (sheetsErr) {
            console.error("Error sending delete_gasto to sheets", sheetsErr);
        }

        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Gastos', desglose);
        }

        showToast('Eliminado', 'El gasto fue eliminado.', 'success');
        loadGastos();
    } catch (err) {
        console.error("Error eliminando gasto:", err);
        showToast('Error', 'No se pudo eliminar el gasto.', 'error');
    }
};

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: '<i class="fa-solid fa-circle-check"></i>',
        error: '<i class="fa-solid fa-circle-exclamation"></i>',
        warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
        info: '<i class="fa-solid fa-circle-info"></i>'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOutRight 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// ==========================================
// MODAL DETAILS
// ==========================================
window.viewExpenseDetails = function(encodedData) {
    const gasto = JSON.parse(decodeURIComponent(encodedData));
    const modal = document.getElementById('expense-details-modal');
    
    document.getElementById('detail-desc').textContent = gasto.descripcion;
    
    const time = new Date(gasto.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('detail-time').innerHTML = `<i class="fa-regular fa-clock"></i> Hoy a las ${time}`;
    
    document.getElementById('detail-responsable').textContent = gasto.responsable;
    document.getElementById('detail-autoriza').textContent = gasto.autoriza;
    
    document.getElementById('detail-efectivo').textContent = '₡' + Number(gasto.monto).toLocaleString('en-US');
    document.getElementById('detail-total').textContent = '₡' + Number(gasto.monto).toLocaleString('en-US');
    
    modal.classList.add('active');
};

document.addEventListener('DOMContentLoaded', () => {
    // Close modal
    const modal = document.getElementById('expense-details-modal');
    const btnClose = document.getElementById('btn-close-details');
    
    if (btnClose) {
        btnClose.addEventListener('click', () => modal.classList.remove('active'));
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    }
});
