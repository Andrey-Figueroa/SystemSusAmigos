/**
 * Tipos de vehículo compartidos (tabla 'tipos_vehiculo', se configuran en
 * Configuración > Tipos de vehículo). Lo usan Local Comercial y Domicilio.
 *
 * - TiposVehiculo.cargar('local' | 'domicilio') -> lista de tipos disponibles en ese módulo
 * - TiposVehiculo.tieneInterior(nombre)        -> si se muestran las opciones de interior
 * - TiposVehiculo.icono(nombre)                -> clase de Font Awesome para mostrarlo
 *
 * Requiere que js/supabase.js ya haya creado el cliente (window.supabase).
 */
window.TiposVehiculo = (function () {
    let todos = [];
    let promesa = null;

    /** Carga todos los tipos una sola vez y devuelve los disponibles para el módulo. */
    async function cargar(modulo) {
        if (!promesa) {
            promesa = window.supabase
                .from('tipos_vehiculo')
                .select('nombre, tiene_interior, disponible_local, disponible_domicilio')
                .order('nombre', { ascending: true })
                .then(({ data, error }) => {
                    if (error) throw error;
                    todos = data || [];
                    return todos;
                });
            // Si falla, permitir reintentar en la próxima llamada
            promesa.catch(() => { promesa = null; });
        }
        const lista = await promesa;
        if (modulo === 'local') return lista.filter(t => t.disponible_local);
        if (modulo === 'domicilio') return lista.filter(t => t.disponible_domicilio);
        return lista;
    }

    /** Busca un tipo por nombre, sin importar mayúsculas ni espacios. */
    function buscar(nombre) {
        const n = (nombre || '').trim().toLowerCase();
        return todos.find(t => t.nombre.trim().toLowerCase() === n) || null;
    }

    /**
     * Si el tipo tiene interior. Para vehículos y órdenes viejas cuyo tipo ya no
     * existe en la tabla (p. ej. 'MOTO' escrito a mano), se mantiene la regla anterior.
     */
    function tieneInterior(nombre) {
        const t = buscar(nombre);
        if (t) return !!t.tiene_interior;
        return (nombre || '').trim().toUpperCase() !== 'MOTO';
    }

    /** Ícono según el nombre del tipo (solo visual). */
    function icono(nombre) {
        const n = (nombre || '').toLowerCase();
        if (n.includes('moto')) return 'fa-motorcycle';
        if (n.includes('cuadra')) return 'fa-truck-monster';
        if (n.includes('pick') || n.includes('4x4')) return 'fa-truck-pickup';
        if (n.includes('cami')) return 'fa-truck';
        if (n.includes('bus') || n.includes('van')) return 'fa-van-shuttle';
        if (n.includes('suv')) return 'fa-car';
        return 'fa-car-side';
    }

    /** Mensaje en español si falla la carga. */
    function mensajeError(err) {
        const code = (err && err.code) || '';
        const msg = ((err && err.message) || '').toLowerCase();
        if (code === '42P01' || code === 'PGRST205' || msg.includes('could not find the table')) {
            return 'Falta crear la tabla de tipos de vehículo (supabase/tipos_vehiculo.sql).';
        }
        if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
            return 'Sin permiso para leer los tipos de vehículo. Ejecuta supabase/permisos_configuracion.sql en Supabase.';
        }
        if (msg.includes('failed to fetch') || msg.includes('network')) {
            return 'No se pudieron cargar los tipos de vehículo. Revisa tu conexión y recarga la página.';
        }
        return 'No se pudieron cargar los tipos de vehículo. Recarga la página.';
    }

    return { cargar, buscar, tieneInterior, icono, mensajeError };
})();
