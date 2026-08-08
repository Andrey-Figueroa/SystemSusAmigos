// supabase is already globally available from js/supabase.js

// State
let activeUser = null;
let activeUserRole = null;
let clientsData = [];
let allVehicles = [];
let currentClientId = null;

// DOM Elements
const clientsTableBody = document.getElementById('clients-table-body');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const btnAddClient = document.getElementById('btn-add-client');

const clientModal = document.getElementById('client-modal');
const clientForm = document.getElementById('client-form');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const modalTitle = document.getElementById('modal-title');

const detailsModal = document.getElementById('details-modal');
const btnCloseDetails = document.getElementById('btn-close-details');

const assignVehicleModal = document.getElementById('assign-vehicle-modal');
const btnCloseAssignVehicle = document.getElementById('btn-close-assign-vehicle');
const btnOpenAssignVehicle = document.getElementById('btn-open-assign-vehicle');
const assignVehicleSearch = document.getElementById('assign-vehicle-search');
const assignVehicleResults = document.getElementById('assign-vehicle-results');
const assignedVehiclesList = document.getElementById('assigned-vehicles-list');

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session & Role Verification
    if (!window.supabase) {
        alert('Supabase client not initialized');
        return;
    }

    try {
        const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
        if (sessionError) {
            alert('Session Error: ' + JSON.stringify(sessionError));
            return;
        }
        if (!session) {
            alert('No hay sesión activa. Por favor, inicia sesión.');
            window.location.href = '../login/index.html';
            return;
        }

        const activeUserStr = localStorage.getItem('activeUser') || session.user.email;
        const activeUserRoleStr = localStorage.getItem('activeUserRole');

        if (!activeUserRoleStr) {
            alert('No se pudo determinar el rol del usuario.');
            window.location.href = '../login/index.html';
            return;
        }

        activeUser = activeUserStr;
        activeUserRole = activeUserRoleStr;

        // Security check: Block unauthorized access
        if (activeUserRole !== 'Administrador' && activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') {
            alert('Acceso Denegado por rol.');
            window.location.href = '../dashboard/index.html';
            return;
        }

        // 2. Load Initial Data
        await loadClients();
        await preloadVehicles();

        // 3. Event Listeners
        setupEventListeners();

    } catch (error) {
        alert('Initialization exception: ' + error.message);
    }
});

async function preloadVehicles() {
    try {
        const { data, error } = await window.supabase
            .from('vehiculos')
            .select('placa, marca, modelo');
        if (!error) allVehicles = data || [];
    } catch (e) { console.warn(e); }
}

function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        renderClients(query);
    });

    // Modal Add
    btnAddClient.addEventListener('click', (e) => {
        e.preventDefault();
        window.openClientModal();
    });

    // Close Modals
    btnCloseModal.addEventListener('click', closeModals);
    btnCancelModal.addEventListener('click', closeModals);
    btnCloseDetails.addEventListener('click', closeModals);
    btnCloseAssignVehicle.addEventListener('click', () => { assignVehicleModal.classList.remove('active'); });

    // Form Submit (Create / Update)
    clientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('client-id').value;
        const nombre = document.getElementById('client-name').value.trim();
        const telefono = document.getElementById('client-phone').value.trim();

        const submitBtn = document.getElementById('btn-save-client');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        submitBtn.disabled = true;

        try {
            if (id) {
                // Update
                const { error } = await window.supabase
                    .from('clientes')
                    .update({ nombre, telefono })
                    .eq('id', id);

                if (error) throw error;
                showToast('Éxito', 'Cliente actualizado correctamente', 'success');
            } else {
                // Insert
                const { error } = await window.supabase
                    .from('clientes')
                    .insert([{ nombre, telefono }]);
                
                if (error) {
                    if (error.code === '23505') { // Unique violation error code in Postgres
                        throw new Error('Ya existe un cliente con este número de teléfono.');
                    }
                    throw error;
                }
                showToast('Éxito', 'Cliente registrado correctamente', 'success');
            }

            closeModals();
            await loadClients();
            searchInput.value = ''; // Reset search
        } catch (error) {
            console.error('Error saving client:', error);
            showToast('Error', error.message || 'No se pudo guardar el cliente', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    // Assign Vehicle UI logic
    btnOpenAssignVehicle.addEventListener('click', () => {
        assignVehicleSearch.value = '';
        renderAssignVehicleResults('');
        assignVehicleModal.classList.add('active');
    });

    assignVehicleSearch.addEventListener('input', (e) => {
        renderAssignVehicleResults(e.target.value.toLowerCase());
    });

    // Close Modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === clientModal) closeModals();
        if (e.target === detailsModal) closeModals();
        if (e.target === assignVehicleModal) assignVehicleModal.classList.remove('active');
    });
}

async function loadClients() {
    try {
        const { data, error } = await window.supabase
            .from('clientes')
            .select(`
                *,
                cliente_vehiculo (
                    vehiculos ( placa, marca, modelo )
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        clientsData = data || [];
        renderClients();
    } catch (error) {
        console.error('Error loading clients:', error);
        showToast('Error', 'No se pudieron cargar los clientes', 'error');
    }
}

function renderClients(searchQuery = '') {
    clientsTableBody.innerHTML = '';
    
    const filteredClients = clientsData.filter(client => {
        const searchStr = `${client.nombre} ${client.telefono}`.toLowerCase();
        return searchStr.includes(searchQuery);
    });

    if (filteredClients.length === 0) {
        clientsTableBody.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    clientsTableBody.style.display = 'table-row-group';
    emptyState.style.display = 'none';

    filteredClients.forEach(client => {
        const tr = document.createElement('tr');
        
        // Format Date
        const dateObj = new Date(client.created_at);
        const registeredDate = dateObj.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
        
        const lastVisit = client.ultima_visita ? 
            new Date(client.ultima_visita).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : 
            '<span style="opacity:0.5">-</span>';

        // Delete button restricted to Dueño
        const deleteBtnHTML = (activeUserRole === 'Dueño' || activeUserRole === 'Soporte TI / Programador') ? 
            `<button class="btn-icon delete" title="Eliminar" onclick="deleteClient(${client.id})"><i class="fa-solid fa-trash-can"></i></button>` : '';

        tr.innerHTML = `
            <td>
                <div style="font-weight: 500; color: var(--text-primary)">${client.nombre}</div>
            </td>
            <td>
                <span class="tag"><i class="fa-solid fa-phone" style="font-size:10px"></i> ${client.telefono}</span>
            </td>
            <td>${lastVisit}</td>
            <td>${registeredDate}</td>
            <td class="text-right">
                <div class="actions-cell">
                    <button class="btn-icon view" title="Ver Detalles" onclick="viewClientDetails(${client.id})"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-icon edit" title="Editar" onclick="openClientModal(${client.id})"><i class="fa-solid fa-pen"></i></button>
                    ${deleteBtnHTML}
                </div>
            </td>
        `;
        clientsTableBody.appendChild(tr);
    });
}

// Modal Functions
window.openClientModal = function(id = null) {
    document.getElementById('client-id').value = '';
    document.getElementById('client-name').value = '';
    document.getElementById('client-phone').value = '';
    
    if (id) {
        modalTitle.textContent = 'Editar Cliente';
        const client = clientsData.find(c => c.id === id);
        if (client) {
            document.getElementById('client-id').value = client.id;
            document.getElementById('client-name').value = client.nombre;
            document.getElementById('client-phone').value = client.telefono;
        }
    } else {
        modalTitle.textContent = 'Registrar Nuevo Cliente';
    }
    
    clientModal.classList.add('active');
}

window.viewClientDetails = function(id) {
    const client = clientsData.find(c => c.id === id);
    if (!client) return;

    document.getElementById('detail-name').textContent = client.nombre;
    document.getElementById('detail-phone').innerHTML = `<i class="fa-solid fa-phone"></i> ${client.telefono}`;
    
    const createdDate = new Date(client.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('detail-created-at').textContent = createdDate;

    if (client.ultima_visita) {
        const visitDate = new Date(client.ultima_visita).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('detail-last-visit').textContent = visitDate;
    } else {
        document.getElementById('detail-last-visit').innerHTML = '<span style="opacity: 0.5">Sin visitas previas</span>';
    }
    
    document.getElementById('detail-saldo-cxc').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    calcularSaldoCxC(id);

    currentClientId = id;
    renderAssignedVehicles(client);

    detailsModal.classList.add('active');
}

async function calcularSaldoCxC(clienteId) {
    try {
        let totalOriginal = 0;
        let totalAbonos = 0;
        let idsDeudas = [];

        // 1. Pizarra Local
        const { data: vData } = await window.supabase.from('ordenes').select('id, monto_cxc').eq('cliente_id', clienteId).gt('monto_cxc', 0);
        (vData || []).forEach(d => { totalOriginal += Number(d.monto_cxc); idsDeudas.push(d.id); });

        // 2. Domicilio
        const { data: pData } = await window.supabase.from('ordenes_domicilio').select('id, monto_cxc').eq('cliente_id', clienteId).gt('monto_cxc', 0);
        (pData || []).forEach(d => { totalOriginal += Number(d.monto_cxc); idsDeudas.push(d.id); });

        // 3. Manuales
        const { data: mData } = await window.supabase.from('cxc_manuales').select('id, monto_cxc').eq('cliente_id', clienteId).eq('estado', 'Activo');
        (mData || []).forEach(d => { totalOriginal += Number(d.monto_cxc); idsDeudas.push(d.id); });

        if (idsDeudas.length > 0) {
            const { data: aData } = await window.supabase.from('cxc_abonos').select('monto_abono').in('origen_id', idsDeudas);
            (aData || []).forEach(a => { totalAbonos += Number(a.monto_abono); });
        }

        const saldoReal = totalOriginal - totalAbonos;
        
        const saldoElement = document.getElementById('detail-saldo-cxc');
        if (saldoReal > 0) {
            saldoElement.innerHTML = `₡${saldoReal.toLocaleString()}`;
            saldoElement.style.color = 'var(--danger)'; // Rojo si debe
        } else {
            saldoElement.innerHTML = `₡0`;
            saldoElement.style.color = 'var(--success)'; // Verde si no debe
        }
    } catch (error) {
        console.error("Error calculando saldo CxC:", error);
        document.getElementById('detail-saldo-cxc').textContent = 'Error';
    }
}

function renderAssignedVehicles(client) {
    assignedVehiclesList.innerHTML = '';

    if (!client.cliente_vehiculo || client.cliente_vehiculo.length === 0) {
        assignedVehiclesList.innerHTML = `<div class="empty-vehicles">Ningún vehículo vinculado a este cliente.</div>`;
        return;
    }

    client.cliente_vehiculo.forEach(cv => {
        if (!cv.vehiculos) return;
        
        const div = document.createElement('div');
        div.className = 'assigned-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.background = 'rgba(255, 255, 255, 0.03)';
        div.style.border = '1px solid var(--border-color)';
        div.style.padding = '12px 16px';
        div.style.borderRadius = '10px';
        
        div.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                <span style="font-weight:500; font-size:15px; color:var(--primary-accent);"><i class="fa-solid fa-car" style="font-size:12px; opacity:0.7; margin-right:6px; color:var(--text-secondary);"></i>${cv.vehiculos.placa}</span>
                <span style="font-size:12px; color:var(--text-secondary);">${cv.vehiculos.marca} ${cv.vehiculos.modelo}</span>
            </div>
            <button class="btn-icon delete" style="width:30px; height:30px;" title="Desvincular" onclick="unassignVehicle(${client.id}, '${cv.vehiculos.placa}')">
                <i class="fa-solid fa-link-slash" style="font-size: 12px;"></i>
            </button>
        `;
        assignedVehiclesList.appendChild(div);
    });
}

function renderAssignVehicleResults(searchQuery) {
    assignVehicleResults.innerHTML = '';
    
    if (searchQuery.length < 2) {
        assignVehicleResults.innerHTML = '<div style="padding:10px; color:var(--text-secondary); text-align:center; font-size:13px;">Escribe al menos 2 letras...</div>';
        return;
    }

    const filtered = allVehicles.filter(v => {
        return v.placa.toLowerCase().includes(searchQuery) || v.marca.toLowerCase().includes(searchQuery) || v.modelo.toLowerCase().includes(searchQuery);
    });

    if (filtered.length === 0) {
        assignVehicleResults.innerHTML = '<div style="padding:10px; color:var(--text-secondary); text-align:center; font-size:13px;">No se encontraron vehículos.</div>';
        return;
    }

    filtered.forEach(v => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '12px';
        div.style.background = 'rgba(255, 255, 255, 0.03)';
        div.style.borderRadius = '8px';
        div.innerHTML = `
            <div>
                <div style="font-weight:500; color:var(--primary-accent);">${v.placa}</div>
                <div style="font-size:12px; color:var(--text-secondary);">${v.marca} ${v.modelo}</div>
            </div>
            <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; border-radius:8px;" onclick="assignVehicle(${currentClientId}, '${v.placa}')">Vincular</button>
        `;
        assignVehicleResults.appendChild(div);
    });
}

window.assignVehicle = async function(clienteId, vehiculoPlaca) {
    if (!clienteId || !vehiculoPlaca) return;

    try {
        const { error } = await window.supabase
            .from('cliente_vehiculo')
            .insert([{ cliente_id: clienteId, vehiculo_placa: vehiculoPlaca }]);
        
        if (error) {
            if (error.code === '23505') throw new Error('Este vehículo ya está vinculado al cliente.');
            throw error;
        }

        showToast('Vinculado', 'Vehículo asociado al cliente con éxito.', 'success');
        assignVehicleModal.classList.remove('active');
        
        await loadClients();
        const updatedClient = clientsData.find(c => c.id === clienteId);
        if (updatedClient) renderAssignedVehicles(updatedClient);

    } catch (e) {
        showToast('Error', e.message || 'No se pudo vincular.', 'error');
    }
}

window.unassignVehicle = async function(clienteId, vehiculoPlaca) {
    const client = clientsData.find(c => c.id === clienteId);
    const desglose = `Desvinculación de Vehículo\nCliente: ${client ? client.nombre : clienteId} (ID: ${clienteId})\nVehículo Placa: ${vehiculoPlaca}`;

    if (!confirm(`¿Deseas desvincular el vehículo ${vehiculoPlaca} del cliente ${client ? client.nombre : clienteId}?`)) return;

    try {
        const { error } = await window.supabase
            .from('cliente_vehiculo')
            .delete()
            .match({ cliente_id: clienteId, vehiculo_placa: vehiculoPlaca });
        
        if (error) throw error;

        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Clientes', desglose);
        }

        showToast('Desvinculado', 'Vehículo removido del cliente.', 'success');
        
        await loadClients();
        const updatedClient = clientsData.find(c => c.id === clienteId);
        if (updatedClient) renderAssignedVehicles(updatedClient);

    } catch (e) {
        showToast('Error', 'No se pudo desvincular el vehículo.', 'error');
    }
}

function closeModals() {
    clientModal.classList.remove('active');
    detailsModal.classList.remove('active');
}

window.deleteClient = async function(id) {
    if (activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') {
        showToast('Acceso Denegado', 'Solo el Dueño puede eliminar clientes.', 'error');
        return;
    }

    const client = clientsData.find(c => c.id === id);
    const desglose = client 
        ? `ID: ${id}\nNombre: ${client.nombre}\nTeléfono: ${client.telefono}\nCreado el: ${new Date(client.created_at).toLocaleString('es-CR')}`
        : `ID: ${id}`;

    if (!confirm(`¿Estás absolutamente seguro de eliminar al cliente "${client ? client.nombre : id}"? Esta acción no se puede deshacer.`)) return;

    try {
        const { error } = await window.supabase
            .from('clientes')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Clientes', desglose);
        }
        showToast('Éxito', 'Cliente eliminado permanentemente.', 'success');
        await loadClients();
    } catch (error) {
        console.error('Error deleting client:', error);
        showToast('Error', 'No se pudo eliminar el cliente', 'error');
    }
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
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 4s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}


