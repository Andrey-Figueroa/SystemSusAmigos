(function() {
    const activeUser = localStorage.getItem('activeUser');
    const activeUserRole = localStorage.getItem('activeUserRole');
    
    const path = window.location.pathname.toLowerCase();

    // Si no está en el login y no hay sesión, echarlo al login
    if (!path.includes('/login/')) {
        if (!activeUser || !activeUserRole) {
            window.location.href = '../login/index.html';
            return;
        }

        // --- VALIDACIÓN DE RUTAS ---
        const role = activeUserRole.toLowerCase();
        
        // Reglas para Mecánico: solo dashboard, mecanica y vehiculos
        if (role === 'mecanico' || role === 'mecánico') {
            const allowed = ['/dashboard/', '/mecanica/', '/vehiculos/'];
            const isAllowed = allowed.some(route => path.includes(route));
            
            if (!isAllowed) {
                window.location.href = '../dashboard/index.html';
                return;
            }
        }

        // Módulos bloqueados para Cajero y otros roles básicos
        const restrictedRoutes = ['/personal/', '/vehiculos/', '/clientes/'];
        const isRestricted = restrictedRoutes.some(route => path.includes(route));

        if (isRestricted) {
            if (role !== 'dueño' && role !== 'dueno' && role !== 'administrador' && role !== 'soporte ti / programador' && role !== 'soporte ti' && role !== 'mecanico' && role !== 'mecánico') {
                window.location.href = '../dashboard/index.html';
            }
        }
    }
})();

