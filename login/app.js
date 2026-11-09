/**
 * Sus Amigos - Login Application Logic with Supabase
 */

// La URL del webhook de correos se configura en js/config.js
const GOOGLE_EMAIL_WEBHOOK_URL = (window.APP_CONFIG && window.APP_CONFIG.alertWebhookUrl) || "";

const DASHBOARD_URL = '../dashboard/index.html';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const togglePassword = document.getElementById('toggle-password');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnLogin = document.getElementById('btn-login');
    const capsWarning = document.getElementById('caps-warning');

    // Año automático en el pie de página
    const footerYear = document.getElementById('footer-year');
    if (footerYear) footerYear.textContent = new Date().getFullYear();

    // 0. Si ya hay una sesión válida y activa, ir directo al dashboard
    redirectIfLoggedIn();

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

    // 2. Aviso de Bloq Mayús en el campo de contraseña
    if (passwordInput && capsWarning) {
        const updateCapsWarning = (e) => {
            const capsOn = e.getModifierState && e.getModifierState('CapsLock');
            const message = capsOn ? 'Bloq Mayús está activado' : '';
            // Solo tocar el DOM si cambia, para que el lector de pantalla no lo repita en cada tecla
            if (capsWarning.dataset.msg !== message) {
                capsWarning.dataset.msg = message;
                capsWarning.innerHTML = capsOn
                    ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Bloq Mayús está activado</span>'
                    : '';
            }
        };
        passwordInput.addEventListener('keydown', updateCapsWarning);
        passwordInput.addEventListener('keyup', updateCapsWarning);
        passwordInput.addEventListener('blur', () => {
            capsWarning.dataset.msg = '';
            capsWarning.innerHTML = '';
        });
    }

    // 3. Form Submission Handler
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            // Validación propia (el formulario usa novalidate para que los mensajes salgan en español)
            if (!email || !password) {
                showToast('Campos incompletos', 'Por favor, ingresa tu correo y tu contraseña.', 'error');
                (!email ? emailInput : passwordInput).focus();
                return;
            }
            if (!EMAIL_REGEX.test(email)) {
                showToast('Correo inválido', 'Revisa que el correo electrónico esté bien escrito.', 'error');
                emailInput.focus();
                return;
            }

            // Verify if Supabase is initialized
            if (!window.supabase || typeof window.supabase.auth === 'undefined' || !window.AppSession) {
                showToast('Error del sistema', 'No se pudo conectar con el sistema. Recarga la página e inténtalo de nuevo.', 'error');
                return;
            }

            // Disable button during login process
            setLoadingState(true);

            // Recordarme: decidir si la sesión sobrevive al cierre del navegador
            const rememberInput = document.getElementById('remember-me');
            window.AppSession.setRemember(!!(rememberInput && rememberInput.checked));

            try {
                // Autenticación con Supabase Auth
                const { data, error } = await window.supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    console.error('Auth Error details:', error);
                    showToast('Error de acceso', traducirErrorAuth(error), 'error');
                    setLoadingState(false);
                    return;
                }

                // Usar el correo que devuelve Supabase (ya normalizado), no el escrito por el usuario
                const authEmail = (data.user.email || email).toLowerCase();

                // Verificación compartida con auth_guard.js (perfil en 'personal' + estado Activo)
                const resultado = await window.AppSession.verificarPersonal(window.supabase, authEmail);

                if (!resultado.ok) {
                    if (resultado.error) console.error('Error fetching profile from personal table:', resultado.error);
                    showToast('Acceso denegado', resultado.motivo, 'error');
                    await window.supabase.auth.signOut();
                    window.AppSession.clearUser();
                    setLoadingState(false);
                    return;
                }

                localStorage.setItem('loginTimestamp', new Date().toISOString());

                // Trigger real email notification via Google Apps Script
                sendRealEmailNotification(resultado.profile.nombre, authEmail);

                // Ir al dashboard de inmediato (replace: "Atrás" no regresa al login)
                window.location.replace(DASHBOARD_URL);

            } catch (error) {
                console.error('Login process error:', error);
                showToast('Error', traducirErrorAuth(error), 'error');
                setLoadingState(false);
            }
        });
    }

    /**
     * Si ya existe una sesión de Supabase de personal activo, redirige al dashboard.
     * Si la persona ya no está activa, cierra esa sesión.
     * Mientras verifica, la página muestra el skeleton (clase 'auth-checking' en <html>).
     */
    async function redirectIfLoggedIn() {
        const client = window.supabase;
        let redirecting = false;
        try {
            if (!client || !client.auth || !window.AppSession) return;

            const { data: { session } } = await client.auth.getSession();
            if (!session) return;

            const resultado = await window.AppSession.verificarPersonal(client, session.user.email);

            if (resultado.error) return; // Error de red u otro: dejar que inicie sesión normalmente

            if (!resultado.ok) {
                await client.auth.signOut();
                window.AppSession.clearUser();
                return;
            }

            redirecting = true; // Se mantiene el skeleton hasta que cargue el dashboard
            window.location.replace(DASHBOARD_URL);
        } catch (err) {
            console.error('Error verificando sesión existente:', err);
        } finally {
            if (!redirecting) document.documentElement.classList.remove('auth-checking');
        }
    }

    /**
     * Convierte los errores de Supabase Auth (en inglés) a mensajes en español.
     * @param {object} error - Error devuelto o lanzado por Supabase
     * @returns {string}
     */
    function traducirErrorAuth(error) {
        const code = (error && error.code) || '';
        const status = error && error.status;
        const msg = ((error && (error.message || error.error_description)) || '').toLowerCase();

        if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
            return 'Correo o contraseña incorrectos.';
        }
        if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
            return 'Tu correo aún no ha sido confirmado. Contacta al administrador.';
        }
        if (code === 'user_banned' || msg.includes('banned')) {
            return 'Esta cuenta está bloqueada. Contacta al administrador.';
        }
        if (code === 'user_not_found') {
            return 'Correo o contraseña incorrectos.';
        }
        if (code.startsWith('over_') || status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
            return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
        }
        if (code === 'validation_failed' || msg.includes('invalid email') || msg.includes('unable to validate email')) {
            return 'El correo electrónico no es válido.';
        }
        if ((error && error.name === 'AuthRetryableFetchError') || status === 0 ||
            msg.includes('failed to fetch') || msg.includes('network') || !navigator.onLine) {
            return 'No se pudo conectar con el servidor. Revisa tu conexión a internet.';
        }
        if (status >= 500) {
            return 'El servidor no está disponible en este momento. Inténtalo más tarde.';
        }
        return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
    }

    /**
     * Sends a real email notification via Google Apps Script Webhook
     * @param {string} name - The logged in person's name
     * @param {string} email - The logged in person's email
     */
    function sendRealEmailNotification(name, email) {
        if (!GOOGLE_EMAIL_WEBHOOK_URL || GOOGLE_EMAIL_WEBHOOK_URL.trim() === "") {
            console.warn("⚠️ No se ha configurado el webhook de alertas (alertWebhookUrl en js/config.js).");
            return;
        }

        const payload = {
            action: "login_alert",
            nombre: name,
            email: email,
            fecha: new Date().toLocaleString('es-CR')
        };

        // keepalive: el envío continúa aunque la página ya esté navegando al dashboard
        fetch(GOOGLE_EMAIL_WEBHOOK_URL, {
            method: 'POST',
            mode: 'no-cors',
            keepalive: true,
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
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
    function showToast(title, message, type = 'info', duration = 3500) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        // Los errores se anuncian de inmediato en lectores de pantalla
        if (type === 'error') toast.setAttribute('role', 'alert');

        let iconClass = 'fa-circle-info';
        if (type === 'success') iconClass = 'fa-circle-check';
        if (type === 'error') iconClass = 'fa-triangle-exclamation';

        // Estructura fija; el texto se asigna con textContent para que nunca se interprete como HTML
        toast.innerHTML = `
            <i class="fa-solid ${iconClass} toast-icon" aria-hidden="true"></i>
            <div class="toast-content">
                <span class="toast-title"></span>
                <span class="toast-message"></span>
            </div>
            <div class="toast-progress" aria-hidden="true"></div>
        `;
        toast.querySelector('.toast-title').textContent = title;
        toast.querySelector('.toast-message').textContent = message;

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
        setTimeout(() => {
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
            btnLogin.setAttribute('aria-busy', 'true');
            btnLogin.innerHTML = `
                <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
                <span>Ingresando...</span>
            `;
            btnLogin.style.opacity = '0.7';
        } else {
            btnLogin.disabled = false;
            btnLogin.removeAttribute('aria-busy');
            btnLogin.innerHTML = `
                <span>Ingresar</span>
                <i class="fa-solid fa-arrow-right button-icon" aria-hidden="true"></i>
            `;
            btnLogin.style.opacity = '1';
        }
    }
});
