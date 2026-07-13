const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbykRunJyxYMbrWyeQl7pyOxUPVr7trGFp4qS9avRi4giNaadHeo4SIs41oX7nh5j7HIRw/exec";

document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    const activeUser = localStorage.getItem('activeUser');
    const activeUserRole = localStorage.getItem('activeUserRole');
    if (!activeUser || !['Dueño', 'Administrador', 'Cajero', 'Soporte TI / Programador'].includes(activeUserRole)) {
        window.location.href = '../login/index.html';
        return;
    }
    document.getElementById('display-user').textContent = activeUser;

    loadOrdenes();
    
    // Configurar Modal Pago
    setupPagoModal();
});

let ordenesGlobales = [];

function getVehicleIcon(tipo) {
    if (!tipo) return '<i class="fa-solid fa-car"></i>';
    tipo = tipo.toUpperCase();
    if (tipo.includes('MOTO')) return '<i class="fa-solid fa-motorcycle"></i>';
    if (tipo.includes('PICKUP') || tipo.includes('PICK UP')) return '<i class="fa-solid fa-truck-pickup"></i>';
    if (tipo.includes('SUV')) return '<i class="fa-solid fa-car-side"></i>'; // FontAwesome doesn't have a perfect SUV, car-side or truck works
    if (tipo.includes('SEDAN')) return '<i class="fa-solid fa-car"></i>';
    if (tipo.includes('HATCHBACK')) return '<i class="fa-solid fa-car-rear"></i>';
    return '<i class="fa-solid fa-car"></i>';
}

async function loadOrdenes() {
    try {
        // Obtener la fecha local (ignorando UTC para el inicio del día)
        const tzDate = new Date();
        tzDate.setMinutes(tzDate.getMinutes() - tzDate.getTimezoneOffset());
        const hoyStr = tzDate.toISOString().split('T')[0];
        
        // Supabase guarda en UTC, así que le pedimos desde la medianoche de la zona horaria actual (aprox -06:00).
        // Si el usuario no está en -06:00, usamos el offset local.
        const offsetHours = -tzDate.getTimezoneOffset() / 60;
        const offsetSign = offsetHours >= 0 ? '+' : '-';
        const offsetStr = offsetSign + String(Math.abs(offsetHours)).padStart(2, '0') + ':00';
        
        const startOfDay = `${hoyStr}T00:00:00${offsetStr}`;

        const { data: ordenes, error: errOrdenes } = await window.supabase
            .from('ordenes')
            .select('*')
            .gte('created_at', startOfDay) // Traer SOLO las de hoy
            .order('id', { ascending: true });

        if (errOrdenes) throw errOrdenes;
        
        const clienteIds = [...new Set(ordenes.map(o => o.cliente_id).filter(Boolean))];
        let clientesMap = {};
        
        if (clienteIds.length > 0) {
            const { data: clientes } = await window.supabase.from('clientes').select('id, nombre, telefono').in('id', clienteIds);
            if (clientes) clientes.forEach(c => clientesMap[String(c.id)] = c);
        }
        
        ordenesGlobales = ordenes.map(o => ({
            ...o,
            clientes: clientesMap[String(o.cliente_id)] || {}
        }));
        renderPizarra();
        
    } catch (err) {
        console.error("Error cargando órdenes:", err);
        showToast('Error', 'No se pudieron cargar las órdenes de la pizarra.', 'error');
    }
    
    // Si necesitas tarjetas de prueba, se pueden inyectar aquí.
    renderPizarra(); // Por ahora renderiza vacío.
}

function renderPizarra() {
    const contProceso = document.getElementById('container-proceso');
    const contTerminado = document.getElementById('container-terminado');
    const contRetirado = document.getElementById('container-retirado');
    
    contProceso.innerHTML = '';
    contTerminado.innerHTML = '';
    contRetirado.innerHTML = '';

    let countP = 0, countT = 0, countR = 0;

    ordenesGlobales.forEach((orden, index) => {
        const card = document.createElement('div');
        card.className = `car-card status-${orden.estado.toLowerCase().replace(' ', '')}`;
        
        const c = orden.clientes || {};
        const icon = getVehicleIcon(orden.tipo_vehiculo);
        
        const isPagado = orden.metodo_pago && orden.metodo_pago !== 'Pendiente';
        const isDetallado = orden.servicios_maestros && (orden.servicios_maestros.includes('Detallado y lavado') || orden.servicios_maestros.includes('Detallados especiales'));
        const isMecanica = orden.servicios_maestros && orden.servicios_maestros.includes('Mecanica');
        
        // Tags
        let tagsHtml = '';
        if (isDetallado) tagsHtml += `<span class="tag tag-detallado">Detallado</span>`;
        if (isMecanica) tagsHtml += `<span class="tag tag-mecanica">Mecánica</span>`;
        if (orden.espera) tagsHtml += `<span class="tag tag-espera"><i class="fa-regular fa-clock"></i> ${orden.espera.includes('Llamar') ? 'Llamar' : 'Espera'}</span>`;

        // Botones de acción avanzada
        let moveBtnHtml = '';
        if (orden.estado === 'En proceso') {
            moveBtnHtml = `<button class="btn-move" title="Pasar a Terminado" onclick="cambiarEstado(${orden.id}, 'Terminado')"><i class="fa-solid fa-check-double"></i></button>`;
        } else if (orden.estado === 'Terminado') {
            moveBtnHtml = `<button class="btn-move" title="Pasar a Retirado" onclick="cambiarEstado(${orden.id}, 'Retirado')"><i class="fa-solid fa-flag-checkered"></i></button>`;
        }
        
        let payBtnHtml = '';
        if (!isPagado) {
            payBtnHtml = `<button class="btn-pay" title="Cobrar" onclick="abrirPago(${orden.id})"><i class="fa-solid fa-money-bill"></i></button>`;
        } else {
            payBtnHtml = `<button class="btn-pay" title="Pagado" disabled><i class="fa-solid fa-check"></i></button>`;
        }

        let editBtnHtml = '';
        let deleteBtnHtml = '';
        
        const activeUserRole = localStorage.getItem('activeUserRole');

        if (isPagado || orden.estado === 'Retirado' || orden.estado === 'Terminado') {
            editBtnHtml = `<button class="btn-edit" title="Bloqueado" disabled style="opacity:0.5; cursor:not-allowed;"><i class="fa-solid fa-pencil"></i></button>`;
            deleteBtnHtml = `<button class="btn-delete" title="Bloqueado" disabled style="opacity:0.5; cursor:not-allowed;"><i class="fa-solid fa-trash-can"></i></button>`;
        } else {
            editBtnHtml = `<button class="btn-edit" title="Añadir / Editar Servicios" onclick="window.location.href='../local_comercial/index.html?editar_orden=${orden.id}'"><i class="fa-solid fa-pencil"></i></button>`;
            if (activeUserRole === 'Dueño' || activeUserRole === 'Administrador' || activeUserRole === 'Soporte TI / Programador') {
                deleteBtnHtml = `<button class="btn-delete" title="Eliminar Orden" onclick="eliminarOrden(${orden.id})"><i class="fa-solid fa-trash-can"></i></button>`;
            }
        }

        card.innerHTML = `
            <div class="car-card-header">
                <div style="display:flex;">
                    <div class="car-icon-wrapper">${icon}</div>
                    <div class="car-info">
                        <h3 class="car-placa">${orden.placa || 'Sin Placa'}</h3>
                        <p class="car-modelo">${orden.marca ? orden.marca + ' ' : ''}${orden.modelo || 'Vehículo'} (${orden.tipo_vehiculo || 'OTRO'})</p>
                    </div>
                </div>
                <span class="car-orden-id">#${orden.id}</span>
            </div>
            
            <div class="car-details">
                <p><i class="fa-solid fa-user"></i> ${c.nombre || 'Cliente Final'}</p>
            </div>
            
            <div class="car-tags">${tagsHtml}</div>
            
            <div class="car-finance">
                <span class="monto-total">₡${parseFloat(orden.total_monto || 0).toLocaleString('en-US')}</span>
                <span class="pago-status ${isPagado ? 'pago-pagado' : 'pago-pendiente'}">${isPagado ? 'Pagado' : 'Pendiente'}</span>
            </div>
            
            <div class="car-actions">
                ${payBtnHtml}
                ${moveBtnHtml}
                ${editBtnHtml}
                ${deleteBtnHtml}
            </div>
        `;

        if (orden.estado === 'En proceso') {
            contProceso.appendChild(card);
            countP++;
        } else if (orden.estado === 'Terminado') {
            contTerminado.appendChild(card);
            countT++;
        } else if (orden.estado === 'Retirado') {
            contRetirado.appendChild(card);
            countR++;
        }
    });

    document.getElementById('count-proceso').textContent = countP;
    document.getElementById('count-terminado').textContent = countT;
    document.getElementById('count-retirado').textContent = countR;
}

// ============== ESTADOS =================
window.cambiarEstado = async function(ordenId, nuevoEstado) {
    try {
        const updateData = { estado: nuevoEstado };
        if (nuevoEstado === 'Terminado') {
            updateData.hora_terminado = new Date().toISOString();
        } else if (nuevoEstado === 'Retirado') {
            const orden = ordenesGlobales.find(o => o.id === ordenId);
            if (orden.estado === 'En proceso') {
                // Si brincó directo a retirado, ponemos ambas horas
                updateData.hora_terminado = new Date().toISOString();
            }
            updateData.hora_retirado = new Date().toISOString();
        }

        const { error } = await window.supabase
            .from('ordenes')
            .update(updateData)
            .eq('id', ordenId);

        if (error) throw error;
        
        try {
            if (typeof GOOGLE_SHEETS_WEBHOOK_URL !== 'undefined') {
                const sheetPayload = {
                    action: "update_estado",
                    orden_id: ordenId,
                    estado: nuevoEstado,
                    hora_terminado: updateData.hora_terminado ? new Date(updateData.hora_terminado).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : null,
                    hora_retirado: updateData.hora_retirado ? new Date(updateData.hora_retirado).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : null
                };
                fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    body: JSON.stringify(sheetPayload),
                    headers: { "Content-Type": "application/json" }
                });
            }
        } catch(e) { console.error("Error Sheets", e); }
        
        showToast('Actualizado', `Vehículo movido a ${nuevoEstado}`, 'success');
        loadOrdenes();
        
    } catch (err) {
        console.error(err);
        showToast('Error', 'No se pudo cambiar el estado.', 'error');
    }
}

window.eliminarOrden = async function(ordenId) {
    const activeUserRole = localStorage.getItem('activeUserRole');
    if (activeUserRole !== 'Dueño' && activeUserRole !== 'Administrador' && activeUserRole !== 'Soporte TI / Programador') {
        showToast('Acceso Denegado', 'Solo el Administrador o el Dueño pueden eliminar órdenes.', 'error');
        return;
    }

    const o = ordenesGlobales.find(x => x.id === parseInt(ordenId) || x.id === ordenId);
    const desglose = o 
        ? `Orden ID: ${ordenId}\nCliente: ${o.clientes ? o.clientes.nombre : 'Desconocido'}\nVehículo Placa: ${o.placa || 'SIN PLACA'}\nModelo: ${o.marca || ''} ${o.modelo || ''}\nServicios: ${o.servicios_maestros ? o.servicios_maestros.join(', ') : 'Ninguno'}\nMonto Total: ₡${parseFloat(o.total_monto || 0).toLocaleString('en-US')}`
        : `Orden ID: ${ordenId}`;

    if (!confirm(`¿Estás seguro de que deseas eliminar la orden #${ordenId}? Esto no se puede deshacer.`)) return;
    
    try {
        const { error } = await window.supabase
            .from('ordenes')
            .delete()
            .eq('id', ordenId);
            
        if (error) throw error;
        
        // Eliminar CxC automática asociada a esta orden (si existía)
        try {
            await window.supabase
                .from('cxc_manuales')
                .delete()
                .eq('orden_origen_id', ordenId);
        } catch(e) { /* silencioso */ }
        
        // Avisarle a Google Sheets que elimine la fila
        try {
            fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({
                    action: "delete",
                    ordenId: ordenId
                }),
                headers: { "Content-Type": "text/plain" }
            });
        } catch(e) { console.error("Error enviando delete a sheets", e); }

        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Pizarra Local', desglose);
        }
        showToast('Eliminada', `La orden #${ordenId} ha sido eliminada.`, 'success');
        loadOrdenes();
    } catch (err) {
        console.error("Error en eliminarOrden:", err);
        showToast('Error', err.message || 'No se pudo eliminar la orden.', 'error');
    }
}

// ============== PAGOS =================
let pagoActualOrdenId = null;

window.abrirPago = function(ordenId) {
    pagoActualOrdenId = ordenId;
    const orden = ordenesGlobales.find(o => o.id === ordenId);
    if (!orden) return;
    
    document.getElementById('pago-orden-id').textContent = orden.id;
    document.getElementById('pago-placa').textContent = orden.placa || 'Sin Placa';
    document.getElementById('pago-total').textContent = `₡${parseFloat(orden.total_monto || 0).toLocaleString('en-US')}`;
    
    // Reset Form
    document.getElementById('form-pago').reset();
    document.querySelectorAll('.pay-input-container').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.toggle-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('payment-validation-msg').style.display = 'none';
    
    // Si solo hay un método obvio, pre-llenar, pero por ahora en 0 todo.
    document.getElementById('pago-efectivo').value = '';
    document.getElementById('pago-tarjeta').value = '';
    document.getElementById('pago-sinpe').value = '';
    document.getElementById('pago-cxc').value = '';
    document.getElementById('pago-transferencia').value = '';
    document.getElementById('pago-regalia').value = '';
    
    document.getElementById('modal-pago').style.display = 'flex';
}

function setupPagoModal() {
    const modal = document.getElementById('modal-pago');
    
    document.getElementById('btn-close-pago').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Manejar Toggles
    document.querySelectorAll('.pay-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const container = document.getElementById(targetId);
            const label = e.target.parentElement;
            const inputField = container.querySelector('input');
            
            if (e.target.checked) {
                container.style.display = 'block';
                label.classList.add('active');
                
                // Si es el único seleccionado y está vacío, prellenarlo con el total
                const checkedBoxes = document.querySelectorAll('.pay-toggle:checked');
                if (checkedBoxes.length === 1 && !inputField.value) {
                    const orden = ordenesGlobales.find(o => o.id === pagoActualOrdenId);
                    inputField.value = parseFloat(orden.total_monto || 0);
                }
            } else {
                container.style.display = 'none';
                label.classList.remove('active');
                inputField.value = ''; // Limpiar si se desmarca
            }
        });
    });
    
    document.getElementById('form-pago').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('btn-guardar-pago');
        const validationMsg = document.getElementById('payment-validation-msg');
        validationMsg.style.display = 'none';
        
        const orden = ordenesGlobales.find(o => o.id === pagoActualOrdenId);
        const total = parseFloat(orden.total_monto || 0);
        
        let efectivo = parseFloat(document.getElementById('pago-efectivo').value) || 0;
        let tarjeta = parseFloat(document.getElementById('pago-tarjeta').value) || 0;
        let sinpe = parseFloat(document.getElementById('pago-sinpe').value) || 0;
        let cxc = parseFloat(document.getElementById('pago-cxc').value) || 0;
        let transferencia = parseFloat(document.getElementById('pago-transferencia').value) || 0;
        let regalia = parseFloat(document.getElementById('pago-regalia').value) || 0;
        
        const suma = efectivo + tarjeta + sinpe + cxc + transferencia + regalia;
        
        if (suma !== total) {
            validationMsg.textContent = `Los montos no cuadran. Suma: ₡${suma}, Total Orden: ₡${total}`;
            validationMsg.style.display = 'block';
            return;
        }
        
        let metodosSeleccionados = [];
        if (efectivo > 0) metodosSeleccionados.push("Efectivo");
        if (tarjeta > 0) metodosSeleccionados.push("Tarjeta");
        if (sinpe > 0) metodosSeleccionados.push("Sinpe");
        if (cxc > 0) metodosSeleccionados.push("CxC");
        if (transferencia > 0) metodosSeleccionados.push("Transferencia");
        if (regalia > 0) metodosSeleccionados.push("Regalía");
        
        if (metodosSeleccionados.length === 0) {
            validationMsg.textContent = 'Seleccione al menos un método de pago y asigne un monto.';
            validationMsg.style.display = 'block';
            return;
        }
        
        const metodoFinal = metodosSeleccionados.length > 1 ? "Mixto" : metodosSeleccionados[0];
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        
        try {
            const activeUser = localStorage.getItem('activeUser');
            
            const { error } = await window.supabase
                .from('ordenes')
                .update({
                    metodo_pago: metodoFinal,
                    monto_efectivo: efectivo,
                    monto_tarjeta: tarjeta,
                    monto_sinpe: sinpe,
                    monto_cxc: cxc,
                    monto_transferencia: transferencia,
                    monto_regalia: regalia,
                    estado: 'Pagada',
                    responsable_cobro: activeUser,
                    hora_pago: new Date().toISOString()
                })
                .eq('id', pagoActualOrdenId);
                
            if (error) throw error;
            
            try {
                if (typeof GOOGLE_SHEETS_WEBHOOK_URL !== 'undefined') {
                    const sheetPayload = {
                        action: "update_pago",
                        orden_id: pagoActualOrdenId,
                        metodo_pago: metodoFinal,
                        monto_efectivo: efectivo,
                        monto_tarjeta: tarjeta,
                        monto_sinpe: sinpe,
                        monto_cxc: cxc,
                        monto_transferencia: transferencia,
                        monto_regalia: regalia,
                        estado: 'Pagada',
                        responsable_cobro: activeUser,
                        hora_pago: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
                    };
                    fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify(sheetPayload),
                        headers: { "Content-Type": "application/json" }
                    });
                }
            } catch(e) { console.error("Error Sheets", e); }
            
            // ── FLUJO 2 CxC: si hay monto en "Por Cobrar", crear entrada en cxc_manuales ──
            if (cxc > 0) {
                try {
                    // Evitar duplicado: eliminar CxC anterior si ya existía para esta orden
                    await window.supabase
                        .from('cxc_manuales')
                        .delete()
                        .match({ orden_origen_id: pagoActualOrdenId, origen: 'local_comercial' });

                    await window.supabase
                        .from('cxc_manuales')
                        .insert([{
                            cliente_id       : orden.cliente_id || null,
                            cliente_nombre   : orden.clientes?.nombre || 'Cliente Final',
                            cliente_telefono : orden.clientes?.telefono || null,
                            vehiculo_placa   : orden.placa || null,
                            concepto         : `Orden #${orden.id} - Local Comercial`,
                            fecha_deuda      : new Date().toISOString().split('T')[0],
                            monto_total      : cxc,
                            saldo_pendiente  : cxc,
                            origen           : 'local_comercial',
                            orden_origen_id  : orden.id,
                            estado           : 'pendiente',
                        }]);
                } catch(cxcErr) {
                    console.error('Error creando CxC automática:', cxcErr);
                }
            } else {
                // Si el pago ya NO incluye CxC (cambio de método), eliminar CxC de esta orden si existía
                try {
                    await window.supabase
                        .from('cxc_manuales')
                        .delete()
                        .match({ orden_origen_id: pagoActualOrdenId, origen: 'local_comercial' });
                } catch(e) { /* no importa si no existía */ }
            }
            
            showToast('Pagado', `Pago registrado con éxito`, 'success');
            modal.style.display = 'none';
            loadOrdenes();
            
        } catch (err) {
            console.error(err);
            showToast('Error', 'No se pudo guardar el pago', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Guardar Pago';
        }
    });
}

function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '<i class="fa-solid fa-check-circle"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if(container.contains(toast)) container.removeChild(toast);
        }, 300);
    }, 3000);
}


