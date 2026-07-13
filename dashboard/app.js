/**
 * NeuraLoom Auto - Dashboard Application Logic with Supabase
 */

document.addEventListener('DOMContentLoaded', async () => {
    const displayUser = document.getElementById('display-user');
    const displayRole = document.getElementById('display-role');
    const btnLogout = document.getElementById('btn-logout');

    // 1. Verify if Supabase SDK is loaded
    if (!window.supabase || typeof window.supabase.auth === 'undefined') {
        console.error('Supabase client is not initialized.');
        window.location.href = '../login/index.html';
        return;
    }

    try {
        // 2. Check active session directly from Supabase
        const { data: { session }, error } = await window.supabase.auth.getSession();

        if (error || !session) {
            console.warn('Session check failed or no active session found. Redirecting to login.');
            localStorage.clear();
            window.location.href = '../login/index.html';
            return;
        }

        // 3. Retrieve user name and role (from localStorage or direct query as fallback)
        let activeUser = localStorage.getItem('activeUser');
        let activeUserRole = localStorage.getItem('activeUserRole');

        if (!activeUser || !activeUserRole) {
            const userEmail = session.user.email;
            
            // Query personal table for live data
            const { data: profile, error: profileError } = await window.supabase
                .from('personal')
                .select('nombre, rol')
                .eq('email', userEmail)
                .maybeSingle();

            if (profileError || !profile) {
                console.error('Error fetching personal info or no record found:', profileError);
                // Fallback display if not registered in personal
                activeUser = session.user.email.split('@')[0];
                activeUserRole = 'Usuario';
            } else {
                activeUser = profile.nombre;
                activeUserRole = profile.rol;
                
                // Cache locally
                localStorage.setItem('activeUser', activeUser);
                localStorage.setItem('activeUserRole', activeUserRole);
            }
        }

        // 4. Update UI displays
        if (displayUser) displayUser.textContent = activeUser;
        if (displayRole) {
            displayRole.textContent = activeUserRole;
            displayRole.style.display = 'inline-block';
        }

        const navPersonal = document.getElementById('nav-personal');
        const navSheets = document.getElementById('nav-sheets');
        
        // Hacer público el botón de Google Sheets
        if (navSheets) navSheets.style.display = 'inline-flex';
        
        if (activeUserRole === 'Administrador' || activeUserRole === 'Dueño' || activeUserRole === 'Soporte TI / Programador') {
            if (navPersonal) navPersonal.style.display = 'inline-flex';
        }

        // 4.5. Disable restricted cards based on role
        if (activeUserRole !== 'Administrador' && activeUserRole !== 'Dueño' && activeUserRole !== 'Soporte TI / Programador') {
            const cardClientes = document.getElementById('card-clientes');
            if (cardClientes) {
                cardClientes.classList.add('disabled-card');
                cardClientes.setAttribute('href', '#');
                cardClientes.addEventListener('click', (e) => {
                    e.preventDefault();
                });
            }

            const cardVehiculos = document.getElementById('card-vehiculos');
            if (cardVehiculos) {
                cardVehiculos.classList.add('disabled-card');
                cardVehiculos.setAttribute('href', '#');
                cardVehiculos.addEventListener('click', (e) => {
                    e.preventDefault();
                });
            }
        }

        // 5. Initialize Live Date/Time for Dashboard Summary
        initDashboardTime();

        // 5. Setup POS Modal Interactions
        const cardPos = document.getElementById('card-pos');
        const posModal = document.getElementById('pos-modal');
        const btnClosePos = document.getElementById('btn-close-pos');
        const posOptionCards = document.querySelectorAll('.pos-option-card');

        if (cardPos && posModal) {
            // Remove any default href behavior just in case
            cardPos.setAttribute('href', '#');
            
            cardPos.addEventListener('click', (e) => {
                e.preventDefault();
                posModal.classList.add('active');
            });
        }

        if (btnClosePos && posModal) {
            btnClosePos.addEventListener('click', () => {
                posModal.classList.remove('active');
            });
        }

        // Handle clicks outside the modal content
        window.addEventListener('click', (e) => {
            if (e.target === posModal) {
                posModal.classList.remove('active');
            }
        });

        // Handle individual POS options
        posOptionCards.forEach(card => {
            card.addEventListener('click', () => {
                const action = card.getAttribute('data-action');
                
                if (action === 'productos') {
                    window.location.href = '../ventas/index.html';
                    return;
                }
                
                if (action === 'local') {
                    window.location.href = '../local_comercial/index.html';
                    return;
                }
                if (action === 'domicilio') {
                    window.location.href = '../domicilio/index.html';
                    return;
                }
                
                let message = 'Módulo en construcción.';
                
                alert(message);
                posModal.classList.remove('active');
            });
        });

    } catch (err) {
        console.error('Unexpected error checking session:', err);
        window.location.href = '../login/index.html';
    }

    // 6. Logout action
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                // Sign out of Supabase session
                await window.supabase.auth.signOut();
            } catch (err) {
                console.error('Error signing out from Supabase:', err);
            } finally {
                // Clear local storage and redirect
                localStorage.clear();
                window.location.href = '../login/index.html';
            }
        });
    }

    // 7. Dynamic Time Logic
    function initDashboardTime() {
        const datetimeElement = document.getElementById('current-datetime');
        if (!datetimeElement) return;

        function updateTime() {
            const now = new Date();
            const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            let dateString = now.toLocaleDateString('es-ES', optionsDate);
            dateString = dateString.charAt(0).toUpperCase() + dateString.slice(1);
            
            const timeString = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true });
            
            datetimeElement.innerHTML = `Dashboard de hoy, <strong>${dateString}</strong> a las <strong>${timeString}</strong>`;
        }

        updateTime();
        setInterval(updateTime, 60000);
    }

    // 8. Load Dashboard Metrics from Supabase
    async function loadDashboardMetrics() {
        try {
            // Fetch all tables
            const { data: ordenes, error: errOrdenes } = await window.supabase.from('ordenes').select('*');
            const { data: ventas, error: errVentas } = await window.supabase.from('ventas_productos_diarias').select('*');
            const { data: domicilio, error: errDomicilio } = await window.supabase.from('ordenes_domicilio').select('*');
            const { data: gastos, error: errGastos } = await window.supabase.from('gastos').select('*');
            
            if (errOrdenes || errVentas || errDomicilio || errGastos) {
                console.error("Error fetching metrics", { errOrdenes, errVentas, errDomicilio, errGastos });
                return;
            }

            // --- INICIALIZAR CONTADORES ---
            let metrics = {
                lubricentro: { efectivo: 0, tarjeta: 0, sinpe: 0, cxc: 0, c_efectivo: 0, c_tarjeta: 0, c_sinpe: 0, c_cxc: 0 },
                productos: { efectivo: 0, tarjeta: 0, sinpe: 0, cxc: 0, c_efectivo: 0, c_tarjeta: 0, c_sinpe: 0, c_cxc: 0 },
                domicilio: { efectivo: 0, tarjeta: 0, sinpe: 0, cxc: 0, c_efectivo: 0, c_tarjeta: 0, c_sinpe: 0, c_cxc: 0 },
                global: { detallado: 0, mecanica: 0, productos: 0, domicilio: 0, c_detallado: 0, c_mecanica: 0, c_productos: 0, c_domicilio: 0 },
                vehiculos: { proceso: 0, terminado: 0, retirado: 0 },
                gastos_efectivo: 0,
                total_tickets: 0,
                total_ingresos: 0
            };

            // Helper for mapping methods
            const mapMethod = (method) => {
                if(!method) return null;
                const m = method.toLowerCase();
                if(m.includes('efectivo')) return 'efectivo';
                if(m.includes('tarjeta')) return 'tarjeta';
                if(m.includes('sinpe')) return 'sinpe';
                if(m.includes('cuenta') || m.includes('cobrar') || m.includes('cxc')) return 'cxc';
                return null;
            };

            // 1. Procesar �rdenes (Lubricentro / Detallado / Mec�nica / Veh�culos)
            ordenes.forEach(o => {
                // Estado veh�culos
                if (o.estado === 'En proceso') metrics.vehiculos.proceso++;
                if (o.estado === 'Terminado') metrics.vehiculos.terminado++;
                if (o.estado === 'Retirado') metrics.vehiculos.retirado++;

                const method = mapMethod(o.metodo_pago);
                const total = parseFloat(o.total_monto) || 0;
                const mDetallado = parseFloat(o.detallado_monto) || 0;
                const mMecanica = parseFloat(o.mecanica_monto) || 0;

                if (method && total > 0) {
                    metrics.lubricentro[method] += total;
                    metrics.lubricentro['c_' + method]++;
                    
                    if (mDetallado > 0) {
                        metrics.global.detallado += mDetallado;
                        metrics.global.c_detallado++;
                    }
                    if (mMecanica > 0) {
                        metrics.global.mecanica += mMecanica;
                        metrics.global.c_mecanica++;
                    }
                    
                    metrics.total_tickets++;
                    metrics.total_ingresos += total;
                }
            });

            // 2. Procesar Productos
            ventas.forEach(v => {
                const method = mapMethod(v.metodo_pago);
                const total = parseFloat(v.total) || 0;
                if (method && total > 0) {
                    metrics.productos[method] += total;
                    metrics.productos['c_' + method]++;
                    metrics.global.productos += total;
                    metrics.global.c_productos++;
                    metrics.total_tickets++;
                    metrics.total_ingresos += total;
                }
            });

            // 3. Procesar Domicilio
            domicilio.forEach(d => {
                const method = mapMethod(d.metodo_pago);
                const total = parseFloat(d.monto) || 0;
                if (method && total > 0) {
                    metrics.domicilio[method] += total;
                    metrics.domicilio['c_' + method]++;
                    metrics.global.domicilio += total;
                    metrics.global.c_domicilio++;
                    metrics.total_tickets++;
                    metrics.total_ingresos += total;
                }
            });

            // 4. Procesar Gastos en Efectivo
            gastos.forEach(g => {
                const total = parseFloat(g.monto) || 0;
                // Todos los gastos salen de caja (efectivo)
                metrics.gastos_efectivo += total;
            });

            // --- ACTUALIZAR DOM ---
            const formatMoney = (val) => String.fromCharCode(0x20A1) + Math.round(val).toLocaleString('en-US');

            // Set Lubricentro
            document.getElementById('lub-efectivo-monto').innerText = formatMoney(metrics.lubricentro.efectivo);
            document.getElementById('lub-efectivo-cant').innerText = metrics.lubricentro.c_efectivo;
            document.getElementById('lub-tarjeta-monto').innerText = formatMoney(metrics.lubricentro.tarjeta);
            document.getElementById('lub-tarjeta-cant').innerText = metrics.lubricentro.c_tarjeta;
            document.getElementById('lub-sinpe-monto').innerText = formatMoney(metrics.lubricentro.sinpe);
            document.getElementById('lub-sinpe-cant').innerText = metrics.lubricentro.c_sinpe;
            document.getElementById('lub-cxc-monto').innerText = formatMoney(metrics.lubricentro.cxc);
            document.getElementById('lub-cxc-cant').innerText = metrics.lubricentro.c_cxc;

            // Set Productos
            document.getElementById('prod-efectivo-monto').innerText = formatMoney(metrics.productos.efectivo);
            document.getElementById('prod-efectivo-cant').innerText = metrics.productos.c_efectivo;
            document.getElementById('prod-tarjeta-monto').innerText = formatMoney(metrics.productos.tarjeta);
            document.getElementById('prod-tarjeta-cant').innerText = metrics.productos.c_tarjeta;
            document.getElementById('prod-sinpe-monto').innerText = formatMoney(metrics.productos.sinpe);
            document.getElementById('prod-sinpe-cant').innerText = metrics.productos.c_sinpe;
            document.getElementById('prod-cxc-monto').innerText = formatMoney(metrics.productos.cxc);
            document.getElementById('prod-cxc-cant').innerText = metrics.productos.c_cxc;

            // Set Domicilio
            document.getElementById('dom-efectivo-monto').innerText = formatMoney(metrics.domicilio.efectivo);
            document.getElementById('dom-efectivo-cant').innerText = metrics.domicilio.c_efectivo;
            document.getElementById('dom-tarjeta-monto').innerText = formatMoney(metrics.domicilio.tarjeta);
            document.getElementById('dom-tarjeta-cant').innerText = metrics.domicilio.c_tarjeta;
            document.getElementById('dom-sinpe-monto').innerText = formatMoney(metrics.domicilio.sinpe);
            document.getElementById('dom-sinpe-cant').innerText = metrics.domicilio.c_sinpe;
            document.getElementById('dom-cxc-monto').innerText = formatMoney(metrics.domicilio.cxc);
            document.getElementById('dom-cxc-cant').innerText = metrics.domicilio.c_cxc;

            // Set Global
            document.getElementById('glob-detallado-monto').innerText = formatMoney(metrics.global.detallado);
            document.getElementById('glob-detallado-cant').innerText = metrics.global.c_detallado;
            document.getElementById('glob-mecanica-monto').innerText = formatMoney(metrics.global.mecanica);
            document.getElementById('glob-mecanica-cant').innerText = metrics.global.c_mecanica;
            document.getElementById('glob-productos-monto').innerText = formatMoney(metrics.global.productos);
            document.getElementById('glob-productos-cant').innerText = metrics.global.c_productos;
            document.getElementById('glob-domicilio-monto').innerText = formatMoney(metrics.global.domicilio);
            document.getElementById('glob-domicilio-cant').innerText = metrics.global.c_domicilio;
            
            const globTotal = metrics.global.detallado + metrics.global.mecanica + metrics.global.productos + metrics.global.domicilio;
            const globCant = metrics.global.c_detallado + metrics.global.c_mecanica + metrics.global.c_productos + metrics.global.c_domicilio;
            document.getElementById('glob-total-monto').innerText = formatMoney(globTotal);
            document.getElementById('glob-total-cant').innerText = globCant;

            // Ventas Totales Sus Amigos
            const totEfectivo = metrics.lubricentro.efectivo + metrics.productos.efectivo + metrics.domicilio.efectivo;
            const totTarjeta = metrics.lubricentro.tarjeta + metrics.productos.tarjeta + metrics.domicilio.tarjeta;
            const totSinpe = metrics.lubricentro.sinpe + metrics.productos.sinpe + metrics.domicilio.sinpe;
            const totCxc = metrics.lubricentro.cxc + metrics.productos.cxc + metrics.domicilio.cxc;
            
            const cantEfectivo = metrics.lubricentro.c_efectivo + metrics.productos.c_efectivo + metrics.domicilio.c_efectivo;
            const cantTarjeta = metrics.lubricentro.c_tarjeta + metrics.productos.c_tarjeta + metrics.domicilio.c_tarjeta;
            const cantSinpe = metrics.lubricentro.c_sinpe + metrics.productos.c_sinpe + metrics.domicilio.c_sinpe;
            const cantCxc = metrics.lubricentro.c_cxc + metrics.productos.c_cxc + metrics.domicilio.c_cxc;

            document.getElementById('tot-efectivo-monto').innerText = formatMoney(totEfectivo);
            document.getElementById('tot-efectivo-cant').innerText = cantEfectivo;
            document.getElementById('tot-tarjeta-monto').innerText = formatMoney(totTarjeta);
            document.getElementById('tot-tarjeta-cant').innerText = cantTarjeta;
            document.getElementById('tot-sinpe-monto').innerText = formatMoney(totSinpe);
            document.getElementById('tot-sinpe-cant').innerText = cantSinpe;
            document.getElementById('tot-cxc-monto').innerText = formatMoney(totCxc);
            document.getElementById('tot-cxc-cant').innerText = cantCxc;
            
            const superTotal = totEfectivo + totTarjeta + totSinpe + totCxc;
            const superCant = cantEfectivo + cantTarjeta + cantSinpe + cantCxc;
            document.getElementById('tot-global-monto').innerText = formatMoney(superTotal);
            document.getElementById('tot-global-cant').innerText = superCant;

            // Veh�culos Pizarra
            document.getElementById('veh-proceso').innerText = metrics.vehiculos.proceso;
            document.getElementById('veh-terminado').innerText = metrics.vehiculos.terminado;
            document.getElementById('veh-retirado').innerText = metrics.vehiculos.retirado;

            // KPIs
            const ticketPromedio = metrics.total_tickets > 0 ? (metrics.total_ingresos / metrics.total_tickets) : 0;
            document.getElementById('kpi-ticket').innerText = formatMoney(ticketPromedio);
            document.getElementById('kpi-gastos').innerText = formatMoney(metrics.gastos_efectivo);
            document.getElementById('kpi-cierre-efectivo').innerText = formatMoney(totEfectivo);

            // Dinero en Caja Logic
            function updateCaja() {
                const cajaIncial = parseFloat(document.getElementById('input-caja-inicial').value) || 0;
                const dineroEnCaja = cajaIncial + totEfectivo - metrics.gastos_efectivo;
                document.getElementById('kpi-dinero-caja').innerText = formatMoney(dineroEnCaja);
            }
            document.getElementById('input-caja-inicial').addEventListener('input', updateCaja);
            updateCaja(); // Initial run
            
            // Send Alert Button
            const btnAlert = document.getElementById('btn-update-caja');
            if(btnAlert) {
                btnAlert.addEventListener('click', () => {
                    const newValue = document.getElementById('input-caja-inicial').value;
                    btnAlert.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    
                    const webhookUrl = "https://script.google.com/macros/s/AKfycbzk_1S1D3r25jlfnNXHocOuzeQZiL-GpGwgqkuilgpC2ObP-YYdX09CLH5GePMFQ9GQ/exec";
                    
                    fetch(webhookUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: "alerta_caja",
                            usuario: localStorage.getItem('activeUser') || "Usuario Desconocido",
                            nuevo_monto: newValue,
                            fecha: new Date().toLocaleString('es-CR')
                        })
                    }).then(() => {
                        btnAlert.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i>';
                        setTimeout(() => btnAlert.innerHTML = '<i class="fa-solid fa-paper-plane"></i>', 3000);
                        alert('¡Alerta de cambio de caja enviada exitosamente!');
                    }).catch(err => {
                        console.error("Error al enviar alerta", err);
                        btnAlert.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                        alert('Error al enviar la alerta.');
                    });
                });
            }

        } catch (error) {
            console.error("Crash loading metrics", error);
        }
    }

    // Run metrics
    if (document.getElementById('resumen-operaciones')) {
        loadDashboardMetrics();
    }
});






