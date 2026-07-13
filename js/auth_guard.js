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
        
        // Reglas para Mecánico
        if (role === 'mecanico' || role === 'mecánico') {
            // Solo pueden ver Dashboard, Mecanica y Vehiculos
            const allowed = ['/dashboard/', '/mecánica/', '/mecanica/', '/vehículos/', '/vehiculos/'];
            const isAllowed = allowed.some(route => path.includes(route));
            
            if (!isAllowed) {
                alert('Acceso Denegado: Tu rol de mecánico solo tiene acceso a Mecánica y Vehículos.');
                window.location.href = '../dashboard/index.html';
                return;
            }
        }

        // Módulos bloqueados estrictamente para el Cajero (u otros roles básicos)
        const restrictedRoutes = [
            '/personal/', 
            '/vehiculos/',
            '/vehículos/',
            '/clientes/'
        ];
        
        // Verifica si la ruta actual está en la lista de restringidas
        const isRestricted = restrictedRoutes.some(route => path.includes(route));

        if (isRestricted) {
            // El Mecánico ya pasó su filtro arriba y está permitido en vehículos
            if (role !== 'dueño' && role !== 'administrador' && role !== 'soporte ti / programador' && role !== 'mecanico' && role !== 'mecánico') {
                alert('Acceso Denegado: No tienes los permisos necesarios para visualizar este módulo.');
                window.location.href = '../dashboard/index.html';
            }
        }
    }
})();
