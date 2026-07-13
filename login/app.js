/**
 * NeuraLoom Auto - Login Application Logic with Supabase
 */

// ==========================================
// ⚠️ PEGA AQUÍ LA NUEVA URL DE GOOGLE APPS SCRIPT (LA DEL CORREO)
// ==========================================
const GOOGLE_EMAIL_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzk_1S1D3r25jlfnNXHocOuzeQZiL-GpGwgqkuilgpC2ObP-YYdX09CLH5GePMFQ9GQ/exec";
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const togglePassword = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');
    const btnLogin = document.getElementById('btn-login');

    // 1. Password Visibility Toggle
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Toggle eye icon class
            togglePassword.classList.toggle('fa-eye');
            togglePassword.classList.toggle('fa-eye-slash');
        });
    }

    // 2. Form Submission Handler
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value.trim();
            const password = passwordInput.value;

            // Simple validation
            if (!email || !password) {
                showToast('Error', 'Por favor, completa todos los campos.', 'error');
                return;
            }

            // Verify if Supabase is initialized
            if (!window.supabase || typeof window.supabase.auth === 'undefined') {
                showToast('Error de Configuración', 'Supabase no está configurado. Revisa js/supabase.js', 'error');
                return;
            }

            // Disable button during login process
            setLoadingState(true);

            try {
                // Autenticación con Supabase Auth
                const { data, error } = await window.supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    let errorMessage = error.message || error.error_description;
                    if (!errorMessage) {
                        try {
                            errorMessage = JSON.stringify(error, Object.getOwnPropertyNames(error));
                        } catch(e) {
                            errorMessage = String(error);
                        }
                    }
                    showToast('Error de Acceso', errorMessage || 'Credenciales inválidas.', 'error');
                    console.error('Auth Error details:', error);
                    setLoadingState(false);
                    return;
                }

                const user = data.user;

                // Consultar información adicional del personal en la tabla 'personal'
                const { data: profile, error: profileError } = await window.supabase
                    .from('personal')
                    .select('nombre, rol, estado')
                    .eq('email', email)
                    .maybeSingle(); // Usamos maybeSingle para manejar de forma segura si no hay registro

                if (profileError) {
                    console.error('Error fetching profile from personal table:', profileError);
                    showToast('Error del Sistema', 'Error al obtener el perfil de personal.', 'error');
                    await window.supabase.auth.signOut();
                    setLoadingState(false);
                    return;
                }

                // Si la persona no está en la tabla de personal, bloquear acceso
                if (!profile) {
                    showToast('Acceso Denegado', 'Tu correo no está registrado en la tabla de personal.', 'error');
                    await window.supabase.auth.signOut();
                    setLoadingState(false);
                    return;
                }

                // Validar estado del personal: 'Activo', 'Suspendido', 'Despedido'
                if (profile.estado === 'Suspendido') {
                    showToast('Acceso Denegado', 'Tu cuenta se encuentra Suspendida. Contacta al administrador.', 'error');
                    await window.supabase.auth.signOut();
                    setLoadingState(false);
                    return;
                }

                if (profile.estado === 'Despedido') {
                    showToast('Acceso Denegado', 'Esta cuenta ha sido dada de baja del sistema.', 'error');
                    await window.supabase.auth.signOut();
                    setLoadingState(false);
                    return;
                }

                // Guardar los datos del usuario activo y su rol en localStorage para la UI local
                localStorage.setItem('activeUser', profile.nombre);
                localStorage.setItem('activeUserRole', profile.rol);
                localStorage.setItem('loginTimestamp', new Date().toISOString());

                // Trigger real email notification via Google Apps Script
                sendRealEmailNotification(profile.nombre, email);

                // Show success toast
                showToast(
                    '¡Acceso Autorizado!', 
                    `Bienvenido, ${profile.nombre} (${profile.rol}). Redirigiendo...`, 
                    'success',
                    2500
                );

                // Redirect to dashboard after showing the animation
                setTimeout(() => {
                    window.location.href = '../dashboard/index.html';
                }, 2200);

            } catch (error) {
                console.error('Login process error:', error);
                showToast('Error', 'Ocurrió un error inesperado al iniciar sesión.', 'error');
                setLoadingState(false);
            }
        });
    }

    /**
     * Sends a real email notification via Google Apps Script Webhook
     * @param {string} name - The logged in person's name
     * @param {string} email - The logged in person's email
     */
    function sendRealEmailNotification(name, email) {
        if (!GOOGLE_EMAIL_WEBHOOK_URL || GOOGLE_EMAIL_WEBHOOK_URL.trim() === "") {
            console.warn("⚠️ No se ha configurado la URL de correos. Ve a login/app.js y pega tu URL.");
            return;
        }

        const payload = {
            action: "login_alert",
            nombre: name,
            email: email,
            fecha: new Date().toLocaleString('es-CR')
        };

        fetch(GOOGLE_EMAIL_WEBHOOK_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        }).then(() => {
            console.log("Correo de alerta disparado con éxito.");
        }).catch(err => {
            console.error("Error al enviar correo de alerta:", err);
        });
    }

    /**
     * Shows a custom toast notification on screen
     * @param {string} title - Header of the toast
     * @param {string} message - Content of the toast
     * @param {string} type - 'success', 'info', or 'error'
     * @param {number} duration - Display time in milliseconds
     */
    function showToast(title, message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-circle-info';
        if (type === 'success') iconClass = 'fa-circle-check';
        if (type === 'error') iconClass = 'fa-triangle-exclamation';

        toast.innerHTML = `
            <i class="fa-solid ${iconClass} toast-icon"></i>
            <div class="toast-content">
                <span class="toast-title">${title}</span>
                <span class="toast-message">${message}</span>
            </div>
            <div class="toast-progress"></div>
        `;

        // Progress bar animation dynamic speed
        const progressBar = toast.querySelector('.toast-progress');
        if (progressBar) {
            progressBar.style.transition = `width ${duration}ms linear`;
            // Trigger layout reflow to ensure transition starts
            void progressBar.offsetWidth;
            progressBar.style.width = '0%';
        }

        container.appendChild(toast);

        // Auto remove toast
        const hideTimeout = setTimeout(() => {
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, duration);
    }

    /**
     * Toggle button loading state visual
     * @param {boolean} isLoading 
     */
    function setLoadingState(isLoading) {
        if (!btnLogin) return;
        
        if (isLoading) {
            btnLogin.disabled = true;
            btnLogin.innerHTML = `
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>Cargando...</span>
            `;
            btnLogin.style.opacity = '0.7';
        } else {
            btnLogin.disabled = false;
            btnLogin.innerHTML = `
                <span>Ingresar</span>
                <i class="fa-solid fa-arrow-right button-icon"></i>
            `;
            btnLogin.style.opacity = '1';
        }
    }
});
