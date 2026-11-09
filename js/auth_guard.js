/**
 * Guard de autenticación y permisos.
 *
 * Se carga en el <head> de cada módulo (después de js/config.js).
 * - Oculta la página hasta terminar la verificación.
 * - Verifica la sesión REAL de Supabase (no confía en localStorage).
 * - Lee nombre, rol y estado desde la tabla 'personal'.
 * - Solo deja pasar personal con estado 'Activo'.
 * - Aplica las reglas de acceso por rol a cada módulo.
 * - Actualiza activeUser / activeUserRole en localStorage para que los módulos los muestren.
 *
 * Nota: esto protege la navegación. La protección de los DATOS debe estar en las políticas RLS de Supabase.
 */
(function () {
    const LOGIN_URL = '../login/index.html';
    const DASHBOARD_URL = '../dashboard/index.html';
    const path = window.location.pathname.toLowerCase();

    if (path.includes('/login/')) return;

    // 1. Ocultar la página mientras se verifica
    const hideStyle = document.createElement('style');
    hideStyle.id = 'auth-guard-hide';
    // Se oculta solo el <body>: el skeleton de js/layout.js (colgado de <html>) sigue visible
    hideStyle.textContent = 'body{visibility:hidden !important}';
    document.head.appendChild(hideStyle);

    function reveal() {
        const el = document.getElementById('auth-guard-hide');
        if (el) el.remove();
        if (window.SaLayout) window.SaLayout.hideSkeleton();
    }

    function clearLocalUser() {
        if (window.AppSession) window.AppSession.clearUser();
    }

    function goTo(url) {
        window.location.replace(url);
    }

    // 2. Las reglas de acceso por rol viven en js/config.js (AppSession.puedeAcceder),
    //    compartidas con el menú lateral.

    // 3. Obtener un cliente de Supabase del proyecto principal
    function getClient() {
        // Páginas que cargan js/supabase.js: window.supabase ya es el cliente
        if (window.supabase && window.supabase.auth) return window.supabase;

        // Páginas que solo cargan el SDK (p. ej. mecánica): crear un cliente propio
        const lib = (window.supabaseLib && window.supabaseLib.createClient) ? window.supabaseLib
                  : (window.supabase && window.supabase.createClient) ? window.supabase
                  : null;
        const cfg = window.APP_CONFIG;
        if (!lib || !cfg) return null;

        if (!window.__authGuardClient) {
            window.__authGuardClient = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        }
        return window.__authGuardClient;
    }

    /** Aviso a pantalla completa cuando no se pudo verificar por conexión (sin cerrar la sesión). */
    function mostrarErrorConexion() {
        if (window.SaLayout && window.SaLayout.hideSkeleton) window.SaLayout.hideSkeleton();
        const caja = document.createElement('div');
        caja.setAttribute('role', 'alert');
        caja.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
            'padding:24px;background:#0a0a0b;color:#f5f3ee;font-family:Inter,system-ui,sans-serif;text-align:center;visibility:visible;';
        caja.innerHTML =
            '<div style="max-width:360px">' +
            '<div style="font-size:40px;color:#d4a72c;margin-bottom:12px">&#9888;</div>' +
            '<h1 style="font-size:20px;margin:0 0 8px">No se pudo verificar tu sesión</h1>' +
            '<p style="font-size:14px;color:#a3a09a;margin:0 0 20px;line-height:1.5">Parece un problema de conexión. Tu sesión sigue abierta: revisa el internet y vuelve a intentarlo.</p>' +
            '<button type="button" style="padding:12px 22px;border:0;border-radius:10px;background:#d4a72c;color:#121212;font-weight:600;font-size:15px;cursor:pointer">Reintentar</button>' +
            '</div>';
        caja.querySelector('button').addEventListener('click', () => location.reload());
        document.documentElement.appendChild(caja);
    }

    async function verify() {
        const client = getClient();
        if (!client || !window.AppSession) {
            console.error('[auth_guard] No se pudo inicializar Supabase.');
            clearLocalUser();
            goTo(LOGIN_URL);
            return;
        }

        try {
            // 4. Sesión real de Supabase
            const { data: { session }, error } = await client.auth.getSession();
            if (error || !session) {
                clearLocalUser();
                goTo(LOGIN_URL);
                return;
            }

            // 5. Perfil desde la tabla 'personal' (verificación compartida en js/config.js).
            //    Si está Activo, también guarda nombre y rol en localStorage.
            const resultado = await window.AppSession.verificarPersonal(client, session.user.email);

            if (!resultado.ok) {
                if (resultado.error) {
                    // Error técnico (sin señal, internet lento, corte): NO se cierra la sesión.
                    // Se ofrece reintentar; la sesión solo se cierra si la cuenta no está activa.
                    console.error('[auth_guard] Error al leer el perfil:', resultado.error);
                    mostrarErrorConexion();
                    return;
                }
                await client.auth.signOut();
                clearLocalUser();
                goTo(LOGIN_URL);
                return;
            }

            // 6. Permisos del módulo
            // Con varios roles basta con que alguno lo permita
            if (!window.AppSession.puedeAcceder(window.AppSession.rolesDe(resultado.profile), path)) {
                goTo(DASHBOARD_URL);
                return;
            }

            // 7. Navbar y menú lateral compartidos (js/layout.js): nombre, rol y permisos
            if (window.SaLayout) window.SaLayout.setUser(resultado.profile);

            // 8. Avisar a la página que la sesión está verificada (con nombre y rol reales)
            window.SaUser = resultado.profile;
            document.dispatchEvent(new CustomEvent('sa:auth-ready', { detail: resultado.profile }));

            reveal();
        } catch (err) {
            console.error('[auth_guard] Error verificando la sesión:', err);
            clearLocalUser();
            goTo(LOGIN_URL);
        }
    }

    /**
     * Cierre de sesión común para todos los módulos.
     * Cierra la sesión en Supabase, borra solo los datos del usuario y va al login.
     */
    window.cerrarSesion = async function () {
        try {
            const client = getClient();
            if (client) await client.auth.signOut();
        } catch (err) {
            console.error('[auth_guard] Error al cerrar sesión en Supabase:', err);
        } finally {
            clearLocalUser();
            goTo(LOGIN_URL);
        }
    };

    // Esperar a que carguen los scripts del final del <body> (SDK y js/supabase.js)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', verify);
    } else {
        verify();
    }
})();
