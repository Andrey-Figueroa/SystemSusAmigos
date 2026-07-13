(function() {
    const activeUser = localStorage.getItem('activeUser');
    const activeUserRole = localStorage.getItem('activeUserRole');
    
    const path = window.location.pathname;

    // Si no está en el login y no hay sesión, echarlo al login
    if (!path.includes('/login/')) {
        if (!activeUser || !activeUserRole) {
            window.location.href = '../login/index.html';
            return;
        }

        // --- VALIDACIÓN DE RUTAS ---
        
        // Módulos bloqueados estrictamente para el Cajero (u otros roles básicos)
        const restrictedRoutes = [
            '/personal/', 
            '/vehiculos/', 
            '/clientes/'
        ];
        
        // Verifica si la ruta actual está en la lista de restringidas
        const isRestricted = restrictedRoutes.some(route => path.includes(route));

        if (isRestricted) {
            if (activeUserRole !== 'Dueño' && activeUserRole !== 'Administrador' && activeUserRole !== 'Soporte TI / Programador') {
                alert('Acceso Denegado: No tienes los permisos necesarios para visualizar este módulo.');
                window.location.href = '../dashboard/index.html';
            }
        }
    }
})();
