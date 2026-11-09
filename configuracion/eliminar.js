/**
 * Configuración: eliminar registros (compartido por todos los configuradores).
 *
 *   const ok = await CfgEliminar.confirmar('SUV', 'Se quitará también de los paquetes.');
 *   const error = await CfgEliminar.eliminar('tipos_vehiculo', id);  // null si se eliminó
 *
 * Usa un <dialog> propio (no el confirm() del navegador) con el estilo de Configuración.
 * Permisos: supabase/permisos_eliminar.sql
 */
window.CfgEliminar = (function () {
    let dialog = null;

    function crearDialogo() {
        dialog = document.createElement('dialog');
        dialog.className = 'cfg-dialog cfg-dialog-confirm';
        dialog.setAttribute('aria-labelledby', 'cfg-elim-titulo');
        dialog.innerHTML = `
            <form method="dialog">
                <div class="cfg-dialog-head">
                    <h2 id="cfg-elim-titulo"></h2>
                </div>
                <div class="cfg-dialog-body">
                    <p class="cfg-elim-texto"></p>
                    <p class="cfg-elim-detalle"></p>
                </div>
                <div class="cfg-dialog-foot">
                    <button type="submit" value="no" class="cfg-btn cfg-btn-ghost">Cancelar</button>
                    <button type="submit" value="si" class="cfg-btn cfg-btn-danger">
                        <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Eliminar
                    </button>
                </div>
            </form>`;
        // Clic fuera del panel = cancelar
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.close('no');
        });
        document.body.appendChild(dialog);
    }

    /** Pregunta antes de eliminar. Devuelve true si la persona confirma. */
    function confirmar(nombre, detalle) {
        if (!dialog) crearDialogo();
        dialog.querySelector('h2').textContent = `¿Eliminar "${nombre}"?`;
        dialog.querySelector('.cfg-elim-texto').textContent = 'Esta acción no se puede deshacer.';
        const det = dialog.querySelector('.cfg-elim-detalle');
        det.textContent = detalle || '';
        det.hidden = !detalle;
        dialog.returnValue = 'no';

        return new Promise((resolve) => {
            dialog.addEventListener('close', () => resolve(dialog.returnValue === 'si'), { once: true });
            dialog.showModal();
            // Foco en Cancelar para no eliminar por accidente con Enter
            dialog.querySelector('button[value="no"]').focus();
        });
    }

    /**
     * Elimina por id. Devuelve null si se eliminó, o un mensaje en español.
     * Se pide la fila eliminada de vuelta: si la seguridad de Supabase no lo
     * permite, no hay error pero tampoco filas, y así se detecta.
     */
    async function eliminar(tabla, id) {
        try {
            const { data, error } = await window.supabase.from(tabla).delete().eq('id', id).select('id');
            if (error) throw error;
            if (!data || data.length === 0) {
                return 'Sin permiso para eliminar. Ejecuta supabase/permisos_eliminar.sql en Supabase.';
            }
            return null;
        } catch (err) {
            console.error(`[Eliminar ${tabla}]`, err);
            const code = (err && err.code) || '';
            const msg = ((err && err.message) || '').toLowerCase();
            if (code === '42501' || (err && err.status === 403) || msg.includes('permission denied') || msg.includes('row-level security')) {
                return 'Sin permiso para eliminar. Ejecuta supabase/permisos_eliminar.sql en Supabase.';
            }
            if (code === '23503') return 'No se puede eliminar porque otro registro lo está usando.';
            if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
            return 'No se pudo eliminar. Inténtalo de nuevo.';
        }
    }

    /** Botón de basurero listo para poner en una fila o tarjeta. */
    function boton(nombre, alHacerClic) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cfg-icon-btn cfg-icon-btn-danger';
        btn.title = 'Eliminar';
        btn.setAttribute('aria-label', `Eliminar ${nombre}`);
        btn.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
        btn.addEventListener('click', alHacerClic);
        return btn;
    }

    return { confirmar, eliminar, boton };
})();
