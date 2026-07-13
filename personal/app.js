document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const displayUser = document.getElementById('display-user');
    const displayRole = document.getElementById('display-role');
    const btnLogout = document.getElementById('btn-logout');
    const staffTableBody = document.getElementById('staff-table-body');
    const toastContainer = document.getElementById('toast-container');
    
    // Modal Elements
    const btnAddStaff = document.getElementById('btn-add-staff');
    const modalAddStaff = document.getElementById('modal-add-staff');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const formAddStaff = document.getElementById('form-add-staff');
    const requireAccountCheckbox = document.getElementById('require-account');
    const accountFields = document.getElementById('account-fields');

    let currentUser = null;

    // --- Authentication & Authorization ---
    async function checkSession() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error || !session) {
                window.location.href = '../login/index.html';
                return;
            }

            const activeUser = localStorage.getItem('activeUser') || session.user.email;
            const activeUserRole = localStorage.getItem('activeUserRole');

            // Access Control: Only Administrador and Dueño can access this module
            if (activeUserRole !== 'Administrador' && activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') {
                showToast('No tienes permisos para acceder a este módulo.', 'error');
                setTimeout(() => {
                    window.location.href = '../dashboard/index.html';
                }, 2000);
                return;
            }

            currentUser = { email: activeUser, role: activeUserRole };

            if (displayUser) displayUser.textContent = activeUser;
            if (displayRole) {
                displayRole.textContent = activeUserRole;
                displayRole.style.display = 'inline-block';
            }

            // Load staff data
            await loadStaffData();

        } catch (err) {
            console.error('Unexpected error:', err);
            window.location.href = '../login/index.html';
        }
    }

    // --- Logout Handling ---
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabase.auth.signOut();
            localStorage.removeItem('activeUser');
            localStorage.removeItem('activeUserRole');
            window.location.href = '../login/index.html';
        });
    }

    // --- Staff Management ---
    async function loadStaffData() {
        try {
            const { data: staff, error } = await supabase
                .from('personal')
                .select('*')
                .order('nombre', { ascending: true });

            if (error) throw error;

            renderStaffTable(staff);
        } catch (error) {
            console.error('Error fetching staff:', error);
            showToast('Error al cargar la lista de personal.', 'error');
            staffTableBody.innerHTML = `<tr><td colspan="5" class="text-center">Error al cargar datos.</td></tr>`;
        }
    }

    function renderStaffTable(staff) {
        staffTableBody.innerHTML = '';

        if (!staff || staff.length === 0) {
            staffTableBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay personal registrado.</td></tr>`;
            return;
        }

        staff.forEach(person => {
            const tr = document.createElement('tr');
            
            // Status classes
            let statusActionHtml = '';
            if (person.estado === 'Activo') {
                statusActionHtml = `
                    <button class="btn-action suspend" onclick="changeStaffStatus('${person.id}', 'Suspendido')" title="Suspender">
                        <i class="fa-solid fa-pause"></i>
                    </button>
                    <button class="btn-action fire" onclick="changeStaffStatus('${person.id}', 'Despedido')" title="Despedir">
                        <i class="fa-solid fa-user-xmark"></i>
                    </button>
                `;
            } else if (person.estado === 'Suspendido') {
                statusActionHtml = `
                    <button class="btn-action activate" onclick="changeStaffStatus('${person.id}', 'Activo')" title="Activar">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="btn-action fire" onclick="changeStaffStatus('${person.id}', 'Despedido')" title="Despedir">
                        <i class="fa-solid fa-user-xmark"></i>
                    </button>
                `;
            } else if (person.estado === 'Despedido') {
                statusActionHtml = `
                    <button class="btn-action activate" onclick="changeStaffStatus('${person.id}', 'Activo')" title="Recontratar">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                `;
            }

            // Determine if they have an account based on data (e.g. requiere_cuenta)
            // If they are linked to auth, we assume they have an account
            const hasAccount = person.requiere_cuenta;
            const accountHtml = hasAccount 
                ? `<span class="account-status has-account"><i class="fa-solid fa-circle-check"></i> Sí</span>`
                : `<span class="account-status"><i class="fa-solid fa-circle-xmark"></i> No</span>`;

            tr.innerHTML = `
                <td><strong>${person.nombre}</strong></td>
                <td>${person.rol}</td>
                <td><span class="status-badge ${person.estado}">${person.estado}</span></td>
                <td>${accountHtml}</td>
                <td class="actions-cell">
                    ${statusActionHtml}
                </td>
            `;
            staffTableBody.appendChild(tr);
        });
    }

    // Global function to be called from inline onclick handlers
    window.changeStaffStatus = async function(id, newStatus) {
        if (!confirm(`¿Estás seguro de que deseas cambiar el estado a ${newStatus}?`)) return;

        try {
            if (newStatus === 'Despedido') {
                // Usamos la función de la base de datos para borrar al usuario de Auth y de Personal al mismo tiempo
                const { error } = await supabase.rpc('eliminar_personal', { p_id: id });

                if (error) {
                    // Fallback por si la función RPC aún no está creada, intentamos borrar solo de personal
                    console.warn("RPC eliminar_personal falló, intentando borrado simple:", error);
                    const fallback = await supabase.from('personal').delete().eq('id', id);
                    if (fallback.error) throw fallback.error;
                }
                
                if (window.enviarAlertaEliminacion) {
                    window.enviarAlertaEliminacion('Personal', `Personal ID ${id} eliminado/despedido permanentemente.`);
                }
                showToast('Personal eliminado completamente del sistema.', 'success');
            } else {
                const { error } = await supabase
                    .from('personal')
                    .update({ estado: newStatus })
                    .eq('id', id);

                if (error) throw error;
                showToast(`Estado actualizado a ${newStatus}.`, 'success');
            }

            await loadStaffData();
        } catch (error) {
            console.error('Error updating status:', error);
            showToast('Error al actualizar el estado.', 'error');
        }
    };

    // --- Modal Handling ---
    btnAddStaff.addEventListener('click', () => {
        formAddStaff.reset();
        accountFields.classList.add('hidden');
        modalAddStaff.classList.remove('hidden');
    });

    const closeModal = () => {
        modalAddStaff.classList.add('hidden');
    };

    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    // Close on outside click
    modalAddStaff.addEventListener('click', (e) => {
        if (e.target === modalAddStaff) {
            closeModal();
        }
    });

    requireAccountCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            accountFields.classList.remove('hidden');
            document.getElementById('staff-email').required = true;
            document.getElementById('staff-password').required = true;
        } else {
            accountFields.classList.add('hidden');
            document.getElementById('staff-email').required = false;
            document.getElementById('staff-password').required = false;
        }
    });

    // --- Form Submission ---
    formAddStaff.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nombre = document.getElementById('staff-name').value.trim();
        const rol = document.getElementById('staff-role').value;
        const requiereCuenta = requireAccountCheckbox.checked;

        try {
            if (requiereCuenta) {
                // 1. Crear cliente temporal para Auth que NO guarde sesión local (así no saca al Admin)
                // supabaseUrl y supabaseAnonKey vienen de js/supabase.js
                const tempSupabase = window.supabaseLib.createClient(
                    supabaseUrl,
                    supabaseAnonKey,
                    { auth: { persistSession: false, autoRefreshToken: false } }
                );

                const emailVal = document.getElementById('staff-email').value.trim();
                const passVal = document.getElementById('staff-password').value;

                // 2. Crear usuario oficial en Authentication
                const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                    email: emailVal,
                    password: passVal,
                });

                if (authError) {
                    throw new Error(authError.message || 'Error al crear la cuenta en Autenticación de Supabase');
                }

                // 3. Insertar en tabla pública 'personal'
                const newStaff = {
                    id: authData.user.id,
                    nombre: nombre,
                    rol: rol,
                    estado: 'Activo',
                    requiere_cuenta: true,
                    email: emailVal
                };

                const { error: dbError } = await window.supabase
                    .from('personal')
                    .insert([newStaff]);

                if (dbError) throw dbError;

            } else {
                // Si no requiere cuenta, solo insertamos en la tabla personal con ID auto-generado por defecto
                const newStaff = {
                    nombre: nombre,
                    rol: rol,
                    estado: 'Activo',
                    requiere_cuenta: false,
                    email: null
                };

                const { error } = await window.supabase
                    .from('personal')
                    .insert([newStaff]);

                if (error) throw error;
            }

            showToast('Personal agregado y configurado correctamente.', 'success');

            closeModal();
            await loadStaffData();

        } catch (error) {
            console.error('Error adding staff:', error);
            showToast('Error al agregar personal. Verifica la base de datos.', 'error');
        }
    });

    // --- Toast Notification System ---
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation';
        
        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Initialize
    checkSession();
});


