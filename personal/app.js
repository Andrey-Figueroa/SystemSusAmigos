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
    let staffList = [];        // personal cargado (para editar)
    let editandoId = null;     // id de la persona en edición (null = nueva)

    const modalTitle = document.getElementById('modal-staff-title');
    const rolesBox = document.getElementById('staff-roles');
    const accountInfo = document.getElementById('account-info');
    const requireAccountRow = document.getElementById('require-account-row');

    // Escapa texto antes de ponerlo en HTML
    const esc = (t) => String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /** Roles de una persona (lista nueva o el rol de siempre). */
    const rolesDe = (person) => window.AppSession.rolesDe(person);

    /** Mensaje si falta la columna 'roles' en la base de datos. */
    const faltaColumnaRoles = (err) => !!err && (err.code === '42703' || err.code === 'PGRST204' || /roles/i.test(err.message || ''));

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
        // Cierre de sesión común, definido en js/auth_guard.js
        btnLogout.addEventListener('click', () => window.cerrarSesion());
    }

    // --- Staff Management ---
    async function loadStaffData() {
        try {
            const { data: staff, error } = await supabase
                .from('personal')
                .select('*')
                .order('nombre', { ascending: true });

            if (error) throw error;

            staffList = staff || [];
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

            // Despedir = eliminar del sistema: solo Dueño y Soporte TI
            const botonDespedir = window.AppSession.puedeEliminar()
                ? `<button class="btn-action fire" onclick="changeStaffStatus('${esc(person.id)}', 'Despedido')" title="Despedir (elimina del sistema)">
                        <i class="fa-solid fa-user-xmark"></i>
                    </button>`
                : '';

            // Status classes
            let statusActionHtml = '';
            if (person.estado === 'Activo') {
                statusActionHtml = `
                    <button class="btn-action suspend" onclick="changeStaffStatus('${person.id}', 'Suspendido')" title="Suspender">
                        <i class="fa-solid fa-pause"></i>
                    </button>
                    ${botonDespedir}
                `;
            } else if (person.estado === 'Suspendido') {
                statusActionHtml = `
                    <button class="btn-action activate" onclick="changeStaffStatus('${person.id}', 'Activo')" title="Activar">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    ${botonDespedir}
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

            // Todos sus roles como etiquetas (el principal primero)
            const principal = window.AppSession.rolPrincipal(rolesDe(person));
            const roles = rolesDe(person).slice().sort((a, b) => (b === principal) - (a === principal));
            const rolesHtml = roles.length
                ? roles.map(r => `<span class="role-tag${r === principal ? ' is-main' : ''}">${esc(window.canonicalRole(r))}</span>`).join(' ')
                : '<span class="role-tag">Sin rol</span>';

            tr.innerHTML = `
                <td><strong>${esc(person.nombre)}</strong></td>
                <td class="roles-cell">${rolesHtml}</td>
                <td><span class="status-badge ${esc(person.estado)}">${esc(person.estado)}</span></td>
                <td>${accountHtml}</td>
                <td class="actions-cell">
                    <button class="btn-action edit" onclick="editarPersonal('${esc(person.id)}')" title="Editar" aria-label="Editar ${esc(person.nombre)}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${statusActionHtml}
                </td>
            `;
            staffTableBody.appendChild(tr);
        });
    }

    // Global function to be called from inline onclick handlers
    window.changeStaffStatus = async function(id, newStatus) {
        if (newStatus === 'Despedido' && !window.AppSession.puedeEliminar()) {
            showToast('Solo el Dueño y Soporte TI pueden despedir (elimina del sistema).', 'error');
            return;
        }
        if (!(await SaNotificar.confirmar({ titulo: 'Cambiar estado', textoConfirmar: 'Cambiar', peligro: false, mensaje: `¿Estás seguro de que deseas cambiar el estado a ${newStatus}?`}))) return;

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
    function marcarRoles(roles) {
        const elegidos = (roles || []).map(r => window.AppSession.normalizarRol(r));
        rolesBox.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.checked = elegidos.includes(window.AppSession.normalizarRol(cb.value));
        });
    }

    // Nuevo
    btnAddStaff.addEventListener('click', () => {
        editandoId = null;
        formAddStaff.reset();
        marcarRoles([]);
        modalTitle.textContent = 'Nuevo Miembro del Personal';
        accountInfo.classList.add('hidden');
        requireAccountRow.classList.remove('hidden');
        accountFields.classList.add('hidden');
        document.getElementById('staff-email').required = false;
        document.getElementById('staff-password').required = false;
        modalAddStaff.classList.remove('hidden');
        document.getElementById('staff-name').focus();
    });

    // Editar: nombre y roles. La cuenta de acceso (correo) no se cambia desde aquí.
    window.editarPersonal = function(id) {
        const person = staffList.find(p => String(p.id) === String(id));
        if (!person) {
            showToast('No se encontró a esa persona. Recarga la página.', 'error');
            return;
        }
        editandoId = person.id;
        formAddStaff.reset();
        document.getElementById('staff-name').value = person.nombre || '';
        marcarRoles(rolesDe(person));
        modalTitle.textContent = 'Editar Personal';

        requireAccountRow.classList.add('hidden');
        accountFields.classList.add('hidden');
        document.getElementById('staff-email').required = false;
        document.getElementById('staff-password').required = false;
        accountInfo.textContent = person.requiere_cuenta && person.email
            ? `Cuenta de acceso: ${person.email} (el correo no se cambia desde aquí).`
            : 'Sin cuenta de acceso al sistema.';
        accountInfo.classList.remove('hidden');

        modalAddStaff.classList.remove('hidden');
        document.getElementById('staff-name').focus();
    };

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
        
        const nombre = document.getElementById('staff-name').value.trim().replace(/\s+/g, ' ');
        const roles = Array.from(rolesBox.querySelectorAll('input:checked')).map(cb => cb.value);
        // 'rol' guarda el principal (el de más permisos) para lo que usa un solo rol
        const rol = window.AppSession.rolPrincipal(roles);
        const requiereCuenta = !editandoId && requireAccountCheckbox.checked;

        if (!nombre) {
            showToast('Escribe el nombre completo.', 'error');
            document.getElementById('staff-name').focus();
            return;
        }
        if (roles.length === 0) {
            showToast('Marca al menos un rol.', 'error');
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-staff');
        btnSubmit.disabled = true;

        try {
            if (editandoId) {
                // Editar: nombre y roles
                const { error } = await window.supabase
                    .from('personal')
                    .update({ nombre, rol, roles })
                    .eq('id', editandoId);
                if (error) throw error;

                showToast('Personal actualizado correctamente.', 'success');
                closeModal();
                await loadStaffData();
                return;
            }

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
                    roles: roles,
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
                    roles: roles,
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
            console.error('Error guardando personal:', error);
            if (faltaColumnaRoles(error)) {
                showToast('Falta ejecutar supabase/personal_roles.sql en Supabase para guardar varios roles.', 'error');
            } else {
                showToast(editandoId ? 'Error al actualizar el personal.' : 'Error al agregar personal. Verifica la base de datos.', 'error');
            }
        } finally {
            btnSubmit.disabled = false;
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


