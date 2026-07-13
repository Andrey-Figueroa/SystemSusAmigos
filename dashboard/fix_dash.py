import re

def fix_dashboard():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Add date filter logic before querying
    fetch_code_old = """    // 8. Load Dashboard Metrics from Supabase
    async function loadDashboardMetrics() {
        try {
            // Fetch all tables
            const { data: ordenes, error: errOrdenes } = await window.supabase.from('ordenes').select('*');
            const { data: ventas, error: errVentas } = await window.supabase.from('ventas_productos_diarias').select('*');
            const { data: domicilio, error: errDomicilio } = await window.supabase.from('ordenes_domicilio').select('*');
            const { data: gastos, error: errGastos } = await window.supabase.from('gastos').select('*');"""
    
    fetch_code_new = """    // 8. Load Dashboard Metrics from Supabase
    async function loadDashboardMetrics() {
        try {
            const nowCR = new Date();
            const year = nowCR.getFullYear();
            const month = String(nowCR.getMonth() + 1).padStart(2, '0');
            const day = String(nowCR.getDate()).padStart(2, '0');
            const startOfDay = `${year}-${month}-${day}T00:00:00-06:00`;

            // Fetch all tables with date filter
            const { data: ordenes, error: errOrdenes } = await window.supabase.from('ordenes').select('*').gte('created_at', startOfDay);
            const { data: ventas, error: errVentas } = await window.supabase.from('ventas_productos_diarias').select('*').gte('created_at', startOfDay);
            const { data: domicilio, error: errDomicilio } = await window.supabase.from('ordenes_domicilio').select('*').gte('created_at', startOfDay);
            const { data: gastos, error: errGastos } = await window.supabase.from('gastos').select('*').gte('created_at', startOfDay);"""

    code = code.replace(fetch_code_old, fetch_code_new)

    # 2. Fix the loop processors to handle split payments
    old_processor = """            // 1. Procesar rdenes (Lubricentro / Detallado / Mecnica / Vehculos)
            ordenes.forEach(o => {
                // Estado vehculos
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
            });"""

    # We can rewrite the loop logic without mapMethod since we can just read the `monto_` fields directly
    # Notice: we must handle tickets counting correctly. A ticket is counted ONCE per row if total_monto > 0.
    new_processor = """            // 1. Procesar Órdenes (Lubricentro / Detallado / Mecánica / Vehículos)
            ordenes.forEach(o => {
                if (o.estado === 'En proceso') metrics.vehiculos.proceso++;
                if (o.estado === 'Terminado') metrics.vehiculos.terminado++;
                if (o.estado === 'Retirado') metrics.vehiculos.retirado++;

                const total = parseFloat(o.total_monto) || 0;
                const mDetallado = parseFloat(o.detallado_monto) || 0;
                const mMecanica = parseFloat(o.mecanica_monto) || 0;
                
                if (total > 0) {
                    const keys = ['efectivo', 'tarjeta', 'sinpe', 'cxc', 'transferencia', 'regalia'];
                    let hasPayment = false;
                    keys.forEach(k => {
                        const m = parseFloat(o['monto_' + k]) || 0;
                        if (m > 0) {
                            metrics.lubricentro[k] += m;
                            metrics.lubricentro['c_' + k]++;
                            hasPayment = true;
                        }
                    });

                    // Si no tiene pagos divididos guardados explícitamente pero tiene un total y un método, intentar fallback:
                    if (!hasPayment) {
                        const method = mapMethod(o.metodo_pago);
                        if (method) {
                            metrics.lubricentro[method] += total;
                            metrics.lubricentro['c_' + method]++;
                        }
                    }
                    
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
                const total = parseFloat(v.total) || parseFloat(v.total_monto) || 0;
                if (total > 0) {
                    const keys = ['efectivo', 'tarjeta', 'sinpe', 'cxc', 'transferencia', 'regalia'];
                    let hasPayment = false;
                    keys.forEach(k => {
                        const m = parseFloat(v['monto_' + k]) || 0;
                        if (m > 0) {
                            metrics.productos[k] += m;
                            metrics.productos['c_' + k]++;
                            hasPayment = true;
                        }
                    });

                    if (!hasPayment) {
                        const method = mapMethod(v.metodo_pago);
                        if (method) {
                            metrics.productos[method] += total;
                            metrics.productos['c_' + method]++;
                        }
                    }
                    
                    metrics.global.productos += total;
                    metrics.global.c_productos++;
                    metrics.total_tickets++;
                    metrics.total_ingresos += total;
                }
            });

            // 3. Procesar Domicilio
            domicilio.forEach(d => {
                const total = parseFloat(d.total_monto) || parseFloat(d.monto) || 0;
                if (total > 0) {
                    const keys = ['efectivo', 'tarjeta', 'sinpe', 'cxc', 'transferencia', 'regalia'];
                    let hasPayment = false;
                    keys.forEach(k => {
                        const m = parseFloat(d['monto_' + k]) || 0;
                        if (m > 0) {
                            metrics.domicilio[k] += m;
                            metrics.domicilio['c_' + k]++;
                            hasPayment = true;
                        }
                    });

                    if (!hasPayment) {
                        const method = mapMethod(d.metodo_pago);
                        if (method) {
                            metrics.domicilio[method] += total;
                            metrics.domicilio['c_' + method]++;
                        }
                    }

                    metrics.global.domicilio += total;
                    metrics.global.c_domicilio++;
                    metrics.total_tickets++;
                    metrics.total_ingresos += total;
                }
            });"""

    # Wait, the `old_processor` string might not match perfectly because of the weird unicode 'Ó' vs ''.
    # Let's use regex to replace it safely.
    
    match = re.search(r'// 1\. Procesar.*?// 4\. Procesar Gastos en Efectivo', code, flags=re.DOTALL | re.IGNORECASE)
    if match:
        code = code.replace(match.group(0), new_processor + "\n\n            // 4. Procesar Gastos en Efectivo")
    else:
        print("Could not find the processors block!")

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)

if __name__ == '__main__':
    fix_dashboard()
