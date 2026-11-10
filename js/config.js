/**
 * Configuración central del sistema.
 * Debe cargarse ANTES que js/supabase.js y js/auth_guard.js.
 * Si cambian las credenciales de Supabase o el webhook, se cambian solo aquí.
 */
window.APP_CONFIG = {
    supabaseUrl: 'https://bsdeqwvyshwswgqpvvqs.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZGVxd3Z5c2h3c3dncXB2dnFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzA4NjEsImV4cCI6MjA5ODU0Njg2MX0.Nkrc9hb4sX_X8nmua-rva7GM9gnipXCtuascW9yqd7Y',
    // ------------------------------------------------------------------
    // Webhooks de Google Apps Script. ÚNICO lugar donde se definen:
    // si un script cambia de dirección, se cambia solo aquí.
    // ------------------------------------------------------------------
    // Alertas por correo (login, eliminaciones y modificaciones de órdenes)
    alertWebhookUrl: 'https://script.google.com/macros/s/AKfycbzk_1S1D3r25jlfnNXHocOuzeQZiL-GpGwgqkuilgpC2ObP-YYdX09CLH5GePMFQ9GQ/exec',
    // IVA de Costa Rica (%), usado por los paquetes que se cobran con IVA
    ivaPorcentaje: 13,
    // Hoja de Google Sheets (órdenes, ventas, gastos, CxC, cierre y caja inicial)
    sheetsWebhookUrl: 'https://script.google.com/macros/s/AKfycbykRunJyxYMbrWyeQl7pyOxUPVr7trGFp4qS9avRi4giNaadHeo4SIs41oX7nh5j7HIRw/exec',
    // Tiquete de la orden (Local Comercial)
    ticketWebhookUrl: 'https://script.google.com/macros/s/AKfycbyhxNlGauKA8DQDsmDpEAPUzXT_TraP2_oimr6YsuTDv74zrQsIXMYYh83w_p9WnMtn6w/exec'
};

/**
 * Convierte el rol guardado en la tabla 'personal' al nombre oficial que usan los módulos.
 * El formulario de personal guarda 'Dueno', 'Soporte TI', 'Mecanico', pero los módulos
 * comparan contra 'Dueño', 'Soporte TI / Programador', etc.
 */
window.canonicalRole = function (rol) {
    const key = (rol || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim();
    const map = {
        'dueno': 'Dueño',
        'administrador': 'Administrador',
        'cajero': 'Cajero',
        'mecanico': 'Mecánico',
        'detallador': 'Detallador',
        'soporte ti': 'Soporte TI / Programador',
        'soporte ti / programador': 'Soporte TI / Programador'
    };
    return map[key] || (rol || '').trim();
};

/**
 * Utilidades de sesión compartidas por el login y el guard.
 */
window.AppSession = {
    // Borra solo los datos del usuario (no otras preferencias guardadas).
    // 'rememberMe' y la cookie se limpian por si quedaron de una versión anterior.
    clearUser() {
        ['activeUser', 'activeUserRole', 'activeUserRoles', 'loginTimestamp', 'rememberMe']
            .forEach(k => localStorage.removeItem(k));
        document.cookie = 'sa_sesion_navegador=; path=/; max-age=0; SameSite=Lax';
    },

    // Se llama al iniciar sesión.
    // remember = true  -> la sesión queda guardada en este dispositivo.
    // remember = false -> la sesión termina al cerrar el navegador (cookie de sesión).
    setRemember(remember) {
        if (remember) {
            localStorage.setItem('rememberMe', '1');
            document.cookie = 'sa_sesion_navegador=; path=/; max-age=0; SameSite=Lax';
        } else {
            localStorage.removeItem('rememberMe');
            document.cookie = 'sa_sesion_navegador=1; path=/; SameSite=Lax';
        }
    },

    // Normaliza el rol: minúsculas y sin tildes ("Mecánico" -> "mecanico", "Dueño" -> "dueno")
    normalizarRol(rol) {
        return (rol || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim();
    },

    /**
     * Una persona puede tener varios roles (columna 'roles' de 'personal').
     * El "rol principal" es el de más permisos; se guarda también en la columna 'rol'
     * y en localStorage 'activeUserRole', así los módulos que comparan un solo rol
     * siguen funcionando igual.
     */
    PRIORIDAD_ROLES: ['dueno', 'soporte ti / programador', 'soporte ti', 'administrador', 'cajero', 'mecanico', 'detallador'],

    /** Lista de roles de un perfil: 'roles' si tiene, si no el 'rol' de siempre. */
    rolesDe(profile) {
        if (!profile) return [];
        const lista = Array.isArray(profile.roles) ? profile.roles.filter(Boolean) : [];
        return lista.length ? lista : (profile.rol ? [profile.rol] : []);
    },

    /** El rol de más permisos de la lista (tal como viene, sin normalizar). */
    rolPrincipal(roles) {
        const lista = (roles || []).filter(Boolean);
        if (!lista.length) return '';
        const puesto = (r) => {
            const i = this.PRIORIDAD_ROLES.indexOf(this.normalizarRol(r));
            return i < 0 ? 99 : i;
        };
        return lista.slice().sort((a, b) => puesto(a) - puesto(b))[0];
    },

    /**
     * Reglas de acceso por rol, usadas por auth_guard.js y por el menú lateral (js/layout.js).
     * @param {string|string[]} rol - Un rol o la lista de roles de la persona: con varios,
     *                                puede entrar si ALGUNO de sus roles lo permite.
     * @param {string} ruta - Ruta del módulo, p. ej. '/ventas/' o window.location.pathname
     */
    puedeAcceder(rol, ruta) {
        if (Array.isArray(rol)) {
            return rol.length ? rol.some(r => this.puedeAcceder(r, ruta)) : this.puedeAcceder('', ruta);
        }
        const role = this.normalizarRol(rol);
        const path = (ruta || '').toLowerCase();

        // Mecánico: solo dashboard, mecánica y vehículos
        if (role === 'mecanico') {
            return ['/dashboard/', '/mecanica/', '/vehiculos/'].some(r => path.includes(r));
        }

        // Configuración: Dueño, Soporte TI y Administrador (con todos los permisos adentro)
        if (path.includes('/configuracion/')) {
            return this.ROLES_DUENO_TI.includes(role) || role === 'administrador';
        }

        // Solo Dueño y Soporte TI (el Administrador no)
        const soloDuenoTI = ['/productividad/', '/reporte/'];
        if (soloDuenoTI.some(r => path.includes(r))) {
            return this.ROLES_DUENO_TI.includes(role);
        }

        // Módulos restringidos para Cajero y otros roles básicos
        const restricted = ['/personal/', '/vehiculos/', '/clientes/'];
        if (restricted.some(r => path.includes(r))) {
            return ['dueno', 'administrador', 'soporte ti', 'soporte ti / programador'].includes(role);
        }

        return true;
    },

    /** Roles con permisos máximos: entrar a Productividad / Reporte / Configuración y ELIMINAR (el Administrador también entra a Configuración). */
    ROLES_DUENO_TI: ['dueno', 'soporte ti', 'soporte ti / programador'],

    /**
     * ¿Puede eliminar? Regla ÚNICA para todo el sistema: solo Dueño y Soporte TI.
     * Con varios roles basta con que alguno lo sea. Si no se pasa nada, usa el
     * usuario de la sesión (window.SaUser o lo guardado en localStorage).
     */
    puedeEliminar(perfilORoles) {
        let roles;
        if (Array.isArray(perfilORoles)) roles = perfilORoles;
        else if (perfilORoles) roles = this.rolesDe(perfilORoles);
        else if (window.SaUser) roles = this.rolesDe(window.SaUser);
        else {
            try { roles = JSON.parse(localStorage.getItem('activeUserRoles') || '[]'); } catch (e) { roles = []; }
            roles = roles.concat(localStorage.getItem('activeUserRole') || []);
        }
        return roles.some(r => this.ROLES_DUENO_TI.includes(this.normalizarRol(r)));
    },

    /**
     * ¿Puede eliminar lo operativo del día? Dueño, Soporte TI y también el Administrador.
     * Se usa en: órdenes de la Pizarra, órdenes a Domicilio y Gastos.
     * (En los demás módulos el Administrador sigue sin poder eliminar: ver puedeEliminar.)
     */
    puedeEliminarOrdenes(perfilORoles) {
        if (this.puedeEliminar(perfilORoles)) return true;
        let roles;
        if (Array.isArray(perfilORoles)) roles = perfilORoles;
        else if (perfilORoles) roles = this.rolesDe(perfilORoles);
        else if (window.SaUser) roles = this.rolesDe(window.SaUser);
        else {
            try { roles = JSON.parse(localStorage.getItem('activeUserRoles') || '[]'); } catch (e) { roles = []; }
            roles = roles.concat(localStorage.getItem('activeUserRole') || []);
        }
        return roles.some(r => this.normalizarRol(r) === 'administrador');
    },

    /**
     * Verificación ÚNICA del personal, usada por el login y por auth_guard.js.
     * Busca el perfil en la tabla 'personal' por correo (sin distinguir mayúsculas)
     * y, si está Activo, guarda nombre y rol en localStorage.
     *
     * Devuelve { ok, profile, error, motivo }:
     *  - ok: true solo si existe y su estado es 'Activo'
     *  - error: error de Supabase al consultar (red, permisos, etc.)
     *  - motivo: mensaje en español para mostrar cuando ok es false
     */
    async verificarPersonal(client, email) {
        // Se escapan % y _ porque ilike los trata como comodines
        const emailPattern = (email || '').toLowerCase().replace(/[\\%_]/g, '\\$&');
        const buscar = (columnas) => client
            .from('personal')
            .select(columnas)
            .ilike('email', emailPattern)
            .maybeSingle();

        let { data: profile, error } = await buscar('nombre, rol, roles, estado');
        // Si aún no se ejecutó supabase/personal_roles.sql, la columna 'roles' no existe
        if (error && (error.code === '42703' || /roles/i.test(error.message || ''))) {
            ({ data: profile, error } = await buscar('nombre, rol, estado'));
        }

        if (error) {
            return { ok: false, profile: null, error, motivo: 'No se pudo verificar tu perfil de personal. Inténtalo de nuevo.' };
        }
        if (!profile) {
            return { ok: false, profile: null, error: null, motivo: 'Tu cuenta no tiene acceso al sistema. Contacta al administrador.' };
        }

        // Solo 'Activo' puede entrar; cualquier otro valor se bloquea
        const estado = (profile.estado || '').trim();
        if (estado !== 'Activo') {
            let motivo = 'Tu cuenta no está activa. Contacta al administrador.';
            if (estado === 'Suspendido') motivo = 'Tu cuenta se encuentra suspendida. Contacta al administrador.';
            if (estado === 'Despedido') motivo = 'Esta cuenta ha sido dada de baja del sistema.';
            return { ok: false, profile, error: null, motivo };
        }

        // Varios roles: 'roles' queda con la lista y 'rol' con el principal (el de más permisos)
        profile.roles = this.rolesDe(profile);
        profile.rol = this.rolPrincipal(profile.roles) || profile.rol;

        localStorage.setItem('activeUser', profile.nombre);
        localStorage.setItem('activeUserRole', window.canonicalRole(profile.rol));
        localStorage.setItem('activeUserRoles', JSON.stringify(profile.roles.map(r => window.canonicalRole(r))));
        return { ok: true, profile, error: null, motivo: '' };
    }
};

/**
 * "Recordarme": si la persona NO marcó recordarme y el navegador se cerró
 * (la cookie de sesión ya no existe), se borra la sesión de Supabase guardada
 * antes de que se cree el cliente, así el guard la manda al login.
 */
(function () {
    try {
        if (localStorage.getItem('rememberMe') === '1') return;
        if (document.cookie.split('; ').includes('sa_sesion_navegador=1')) return;

        const ref = new URL(window.APP_CONFIG.supabaseUrl).hostname.split('.')[0];
        const tokenKey = 'sb-' + ref + '-auth-token';
        if (localStorage.getItem(tokenKey) === null) return;

        localStorage.removeItem(tokenKey);
        localStorage.removeItem(tokenKey + '-code-verifier');
        window.AppSession.clearUser();
    } catch (err) {
        console.error('[config] Error verificando "Recordarme":', err);
    }
})();
