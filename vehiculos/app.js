// Supabase is globally available from js/supabase.js

// State
let activeUser = null;
let activeUserRole = null;
let vehiclesData = [];
let allClients = []; // For the assignment search
let currentVehiclePlaca = null;

// DOM Elements
const vehiclesTableBody = document.getElementById('vehicles-table-body');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const btnAddVehicle = document.getElementById('btn-add-vehicle');

const vehicleModal = document.getElementById('vehicle-modal');
const vehicleForm = document.getElementById('vehicle-form');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const modalTitle = document.getElementById('modal-title');

const detailsModal = document.getElementById('details-modal');
const btnCloseDetails = document.getElementById('btn-close-details');

const assignModal = document.getElementById('assign-client-modal');
const btnCloseAssign = document.getElementById('btn-close-assign');
const btnOpenAssign = document.getElementById('btn-open-assign');
const assignSearchInput = document.getElementById('assign-search-input');
const assignResultsContainer = document.getElementById('assign-results');
const assignedClientsList = document.getElementById('assigned-clients-list');

const marcasPopulares = [
    'Toyota', 'Nissan', 'Honda', 'Hyundai', 'Kia', 'Ford', 'Chevrolet', 
    'Volkswagen', 'BMW', 'Mercedes-Benz', 'Audi', 'Mazda', 'Mitsubishi', 
    'Suzuki', 'Subaru', 'Peugeot', 'Renault', 'Fiat', 'Jeep', 'Dodge', 
    'Lexus', 'Volvo', 'Porsche', 'Land Rover', 'Isuzu', 'Geely', 'BYD', 'MG', 'Otro'
];

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

        // 2. Populate Selects
        populateMarcas();

        // 3. Load Initial Data
        await loadVehicles();
        await preloadClients(); // Preload for assignment search

        // 4. Event Listeners
        setupEventListeners();

    } catch (error) {
        alert('Initialization exception: ' + error.message);
    }
});

function populateMarcas() {
    const selectMarca = document.getElementById('vehicle-marca');
    marcasPopulares.sort().forEach(marca => {
        const option = document.createElement('option');
        option.value = marca;
        option.textContent = marca;
        selectMarca.appendChild(option);
    });
}

async function preloadClients() {
    try {
        const { data, error } = await window.supabase
            .from('clientes')
            .select('id, nombre, telefono');
        if (!error) {
            allClients = data || [];
        }
    } catch (e) {
        console.warn('Could not preload clients', e);
    }
}

function setupEventListeners() {
    // Search Vehicles
    searchInput.addEventListener('input', (e) => {
        renderVehicles(e.target.value.toLowerCase());
    });

    // Modal Add
    btnAddVehicle.addEventListener('click', (e) => {
        e.preventDefault();
        window.openVehicleModal();
    });

    // Close Modals
    btnCloseModal.addEventListener('click', closeModals);
    btnCancelModal.addEventListener('click', closeModals);
    btnCloseDetails.addEventListener('click', closeModals);
    btnCloseAssign.addEventListener('click', () => {
        assignModal.classList.remove('active');
    });

    // Form Submit (Create / Update)
    vehicleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const isEditing = document.getElementById('vehicle-is-editing').value === 'true';
        let placa = document.getElementById('vehicle-placa').value.trim().toUpperCase().replace(/\s+/g, '');
        const marca = document.getElementById('vehicle-marca').value;
        const modelo = document.getElementById('vehicle-modelo').value.trim();
        const anio = parseInt(document.getElementById('vehicle-anio').value, 10);
        const tipo = document.getElementById('vehicle-tipo').value;

        // Basic validations
        const maxYear = new Date().getFullYear() + 1;
        if (anio < 1900 || anio > maxYear) {
            showToast('Año Inválido', `El año debe estar entre 1900 y ${maxYear}`, 'error');
            return;
        }

        const submitBtn = document.getElementById('btn-save-vehicle');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        submitBtn.disabled = true;

        try {
            if (isEditing) {
                // Update
                const { error } = await window.supabase
                    .from('vehiculos')
                    .update({ marca, modelo, anio, tipo })
                    .eq('placa', placa);

                if (error) throw error;
                showToast('Éxito', 'Vehículo actualizado correctamente', 'success');
            } else {
                // Insert
                const { error } = await window.supabase
                    .from('vehiculos')
                    .insert([{ placa, marca, modelo, anio, tipo }]);
                
                if (error) {
                    if (error.code === '23505') { // Unique constraint violation
                        throw new Error('Ya existe un vehículo registrado con esta placa.');
                    }
                    throw error;
                }
                showToast('Éxito', 'Vehículo registrado correctamente', 'success');
            }

            closeModals();
            await loadVehicles();
            searchInput.value = '';
        } catch (error) {
            console.error('Error saving vehicle:', error);
            showToast('Error', error.message || 'No se pudo guardar el vehículo', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    // Assign Client UI logic
    btnOpenAssign.addEventListener('click', () => {
        assignSearchInput.value = '';
        renderAssignResults('');
        assignModal.classList.add('active');
    });

    assignSearchInput.addEventListener('input', (e) => {
        renderAssignResults(e.target.value.toLowerCase());
    });

    // Close Modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === vehicleModal) closeModals();
        if (e.target === detailsModal) closeModals();
        if (e.target === assignModal) assignModal.classList.remove('active');
    });
}

async function loadVehicles() {
    try {
        // Fetch vehicles along with their assigned clients via the junction table
        const { data, error } = await window.supabase
            .from('vehiculos')
            .select(`
                *,
                cliente_vehiculo (
                    clientes ( id, nombre, telefono )
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        vehiclesData = data || [];
        renderVehicles();
    } catch (error) {
        console.error('Error loading vehicles:', error);
        showToast('Error', 'No se pudieron cargar los vehículos', 'error');
    }
}

function renderVehicles(searchQuery = '') {
    vehiclesTableBody.innerHTML = '';
    
    const filteredVehicles = vehiclesData.filter(v => {
        const searchStr = `${v.placa} ${v.marca} ${v.modelo}`.toLowerCase();
        return searchStr.includes(searchQuery);
    });

    if (filteredVehicles.length === 0) {
        vehiclesTableBody.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    vehiclesTableBody.style.display = 'table-row-group';
    emptyState.style.display = 'none';

    filteredVehicles.forEach(v => {
        const tr = document.createElement('tr');
        
        // Format Owners
        let ownersHtml = '<span style="opacity:0.5; font-size:12px;">Sin asignar</span>';
        if (v.cliente_vehiculo && v.cliente_vehiculo.length > 0) {
            const clientNames = v.cliente_vehiculo
                .filter(cv => cv.clientes)
                .map(cv => cv.clientes.nombre);
            
            if (clientNames.length > 0) {
                if (clientNames.length === 1) {
                    ownersHtml = `<span style="font-size:13px; font-weight:500;">${clientNames[0]}</span>`;
                } else {
                    ownersHtml = `<span style="font-size:13px; font-weight:500;">${clientNames[0]} <span class="tag" style="padding:2px 6px; font-size:10px;">+${clientNames.length - 1}</span></span>`;
                }
            }
        }

        const deleteBtnHTML = (activeUserRole === 'Dueño' || activeUserRole === 'Soporte TI / Programador') ? 
            `<button class="btn-icon delete" title="Eliminar" onclick="deleteVehicle('${v.placa}')"><i class="fa-solid fa-trash-can"></i></button>` : '';

        tr.innerHTML = `
            <td>
                <div style="font-weight: 700; color: var(--primary-accent); letter-spacing: 1px;">${v.placa}</div>
            </td>
            <td>
                <div style="font-weight: 500;">${v.marca} ${v.modelo}</div>
            </td>
            <td>
                <span class="tag" style="background: rgba(255,255,255,0.05);">${v.tipo} • ${v.anio}</span>
            </td>
            <td>${ownersHtml}</td>
            <td class="text-right">
                <div class="actions-cell">
                    <button class="btn-icon view" title="Ver / Asignar Dueño" onclick="viewVehicleDetails('${v.placa}')"><i class="fa-solid fa-users"></i></button>
                    <button class="btn-icon edit" title="Editar" onclick="openVehicleModal('${v.placa}')"><i class="fa-solid fa-pen"></i></button>
                    ${deleteBtnHTML}
                </div>
            </td>
        `;
        vehiclesTableBody.appendChild(tr);
    });
}

window.openVehicleModal = function(placa = null) {
    const inputPlaca = document.getElementById('vehicle-placa');
    document.getElementById('vehicle-is-editing').value = 'false';
    inputPlaca.value = '';
    inputPlaca.disabled = false; // Primary key can't be changed if editing
    document.getElementById('vehicle-marca').value = '';
    document.getElementById('vehicle-modelo').value = '';
    document.getElementById('vehicle-anio').value = '';
    document.getElementById('vehicle-tipo').value = '';
    
    if (placa) {
        modalTitle.textContent = 'Editar Vehículo';
        const v = vehiclesData.find(v => v.placa === placa);
        if (v) {
            document.getElementById('vehicle-is-editing').value = 'true';
            inputPlaca.value = v.placa;
            inputPlaca.disabled = true; // Block primary key edit
            document.getElementById('vehicle-marca').value = v.marca;
            document.getElementById('vehicle-modelo').value = v.modelo;
            document.getElementById('vehicle-anio').value = v.anio;
            document.getElementById('vehicle-tipo').value = v.tipo;
        }
    } else {
        modalTitle.textContent = 'Registrar Nuevo Vehículo';
    }
    
    vehicleModal.classList.add('active');
}

window.viewVehicleDetails = function(placa) {
    const v = vehiclesData.find(v => v.placa === placa);
    if (!v) return;

    currentVehiclePlaca = placa;

    document.getElementById('detail-placa').textContent = v.placa;
    document.getElementById('detail-vehicle-name').innerHTML = `<i class="fa-solid fa-tag"></i> ${v.marca} ${v.modelo}`;
    document.getElementById('detail-anio').textContent = v.anio;
    document.getElementById('detail-tipo').textContent = v.tipo;
    
    renderAssignedClients(v);

    detailsModal.classList.add('active');
}

function renderAssignedClients(vehicle) {
    assignedClientsList.innerHTML = '';

    if (!vehicle.cliente_vehiculo || vehicle.cliente_vehiculo.length === 0) {
        assignedClientsList.innerHTML = `<div class="empty-vehicles">Ningún cliente vinculado a este vehículo.</div>`;
        return;
    }

    vehicle.cliente_vehiculo.forEach(cv => {
        if (!cv.clientes) return;
        
        const div = document.createElement('div');
        div.className = 'assigned-item';
        div.innerHTML = `
            <div class="assigned-item-info">
                <span class="assigned-item-name"><i class="fa-solid fa-user" style="font-size:12px; opacity:0.7; margin-right:6px;"></i>${cv.clientes.nombre}</span>
                <span class="assigned-item-phone">${cv.clientes.telefono}</span>
            </div>
            <button class="btn-icon delete" style="width:30px; height:30px;" title="Desvincular" onclick="unassignClient(${cv.clientes.id}, '${vehicle.placa}')">
                <i class="fa-solid fa-link-slash" style="font-size: 12px;"></i>
            </button>
        `;
        assignedClientsList.appendChild(div);
    });
}

function renderAssignResults(searchQuery) {
    assignResultsContainer.innerHTML = '';
    
    if (searchQuery.length < 2) {
        assignResultsContainer.innerHTML = '<div style="padding:10px; color:var(--text-secondary); text-align:center; font-size:13px;">Escribe al menos 2 letras...</div>';
        return;
    }

    // Filter all clients
    const filtered = allClients.filter(c => {
        return c.nombre.toLowerCase().includes(searchQuery) || c.telefono.includes(searchQuery);
    });

    if (filtered.length === 0) {
        assignResultsContainer.innerHTML = '<div style="padding:10px; color:var(--text-secondary); text-align:center; font-size:13px;">No se encontraron clientes.</div>';
        return;
    }

    filtered.forEach(c => {
        const div = document.createElement('div');
        div.className = 'assign-result-item';
        div.innerHTML = `
            <div>
                <div style="font-weight:500;">${c.nombre}</div>
                <div style="font-size:12px; color:var(--text-secondary);">${c.telefono}</div>
            </div>
            <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; border-radius:8px;" onclick="assignClient(${c.id}, '${currentVehiclePlaca}')">Vincular</button>
        `;
        assignResultsContainer.appendChild(div);
    });
}

window.assignClient = async function(clienteId, vehiculoPlaca) {
    if (!clienteId || !vehiculoPlaca) return;

    try {
        const { error } = await window.supabase
            .from('cliente_vehiculo')
            .insert([{ cliente_id: clienteId, vehiculo_placa: vehiculoPlaca }]);
        
        if (error) {
            if (error.code === '23505') throw new Error('Este cliente ya está vinculado al vehículo.');
            throw error;
        }

        showToast('Vinculado', 'Cliente asociado al vehículo con éxito.', 'success');
        assignModal.classList.remove('active');
        
        // Refresh data
        await loadVehicles();
        // Update the details modal view
        const updatedVehicle = vehiclesData.find(v => v.placa === vehiculoPlaca);
        if (updatedVehicle) renderAssignedClients(updatedVehicle);

    } catch (e) {
        showToast('Error', e.message || 'No se pudo vincular.', 'error');
    }
}

window.unassignClient = async function(clienteId, vehiculoPlaca) {
    const v = vehiclesData.find(x => x.placa === vehiculoPlaca);
    const desglose = `Desvinculación de Cliente\nVehículo Placa: ${vehiculoPlaca}\nCliente ID: ${clienteId}`;

    if (!confirm('¿Deseas desvincular a este cliente del vehículo?')) return;

    try {
        const { error } = await window.supabase
            .from('cliente_vehiculo')
            .delete()
            .match({ cliente_id: clienteId, vehiculo_placa: vehiculoPlaca });
        
        if (error) throw error;

        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Vehículos', desglose);
        }
        showToast('Desvinculado', 'Cliente removido del vehículo.', 'success');
        
        // Refresh data
        await loadVehicles();
        const updatedVehicle = vehiclesData.find(v => v.placa === vehiculoPlaca);
        if (updatedVehicle) renderAssignedClients(updatedVehicle);

    } catch (e) {
        showToast('Error', 'No se pudo desvincular al cliente.', 'error');
    }
}

function closeModals() {
    vehicleModal.classList.remove('active');
    detailsModal.classList.remove('active');
    assignModal.classList.remove('active');
}

window.deleteVehicle = async function(placa) {
    if (activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') {
        showToast('Acceso Denegado', 'Solo el Dueño puede eliminar vehículos.', 'error');
        return;
    }

    const v = vehiclesData.find(x => x.placa === placa);
    const desglose = v 
        ? `Vehículo Placa: ${placa}\nMarca: ${v.marca || 'N/A'}\nModelo: ${v.modelo || 'N/A'}\nAño: ${v.anio || 'N/A'}\nTipo: ${v.tipo || 'N/A'}`
        : `Vehículo Placa: ${placa}`;

    if (!confirm(`¿Estás absolutamente seguro de eliminar el vehículo ${placa}? Esta acción borrará su historial.`)) return;

    try {
        const { error } = await window.supabase
            .from('vehiculos')
            .delete()
            .eq('placa', placa);

        if (error) throw error;
        
        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Vehículos', desglose);
        }
        showToast('Éxito', 'Vehículo eliminado permanentemente.', 'success');
        await loadVehicles();
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        showToast('Error', 'No se pudo eliminar el vehículo', 'error');
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
