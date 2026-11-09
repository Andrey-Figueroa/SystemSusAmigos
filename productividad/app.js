/**
 * Productividad por empleado
 * Lee la tabla 'orden_trabajos' (se llena desde la Pizarra al pasar a Terminado)
 * y calcula por persona: trabajos, ingreso, tiempo, ingreso por hora, eficiencia
 * y un puntaje ponderado (0-100).
 * Tabla: supabase/productividad.sql
 */

// Pesos del puntaje (suman 100)
const PESOS = [
    { clave: 'ingreso', texto: 'Ingreso generado', peso: 30 },
    { clave: 'ingresoHora', texto: 'Ingreso por hora', peso: 25 },
    { clave: 'eficiencia', texto: 'Eficiencia (tiempo vs. promedio del mismo servicio y vehículo)', peso: 25 },
    { clave: 'trabajos', texto: 'Volumen de trabajos', peso: 20 }
];

const AREAS = { detallado: 'Detallado', mecanica: 'Mecánica' };
const ZONA = 'America/Costa_Rica';

const fmtCRC = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtFecha = new Intl.DateTimeFormat('es-CR', { timeZone: ZONA, day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('es-CR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

const $ = (id) => document.getElementById(id);

let trabajos = [];        // filas cargadas del período
let resumen = [];         // una fila por persona (ya con puntaje)
let personaElegida = null;

/* --------------------------------------------------------------------------
   Fechas (hora de Costa Rica)
   -------------------------------------------------------------------------- */
/** 'YYYY-MM-DD' de hoy en Costa Rica. */
function hoyCR() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
}

/** Suma días a una fecha 'YYYY-MM-DD'. */
function sumarDias(ymd, dias) {
    const [y, m, d] = ymd.split('-').map(Number);
    const f = new Date(Date.UTC(y, m - 1, d + dias));
    return f.toISOString().slice(0, 10);
}

const inicioDia = (ymd) => `${ymd}T00:00:00-06:00`;

/** Rango del filtro: { desde, hasta } en 'YYYY-MM-DD' (hasta = último día incluido). */
function rangoElegido() {
    const hoy = hoyCR();
    const [y, m] = hoy.split('-').map(Number);
    const periodo = $('filtro-periodo').value;

    if (periodo === 'hoy') return { desde: hoy, hasta: hoy };
    if (periodo === 'semana') {
        // Semana de lunes a domingo
        const dow = new Date(hoy + 'T12:00:00Z').getUTCDay();   // 0 = domingo
        return { desde: sumarDias(hoy, -((dow + 6) % 7)), hasta: hoy };
    }
    if (periodo === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    if (periodo === 'mes-pasado') {
        const primero = `${hoy.slice(0, 7)}-01`;
        const anterior = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
        return { desde: anterior, hasta: sumarDias(primero, -1) };
    }
    // Rango personalizado
    let desde = $('filtro-desde').value || hoy;
    let hasta = $('filtro-hasta').value || desde;
    if (hasta < desde) [desde, hasta] = [hasta, desde];
    return { desde, hasta };
}

function textoRango({ desde, hasta }) {
    const f = (ymd) => fmtDia.format(new Date(ymd + 'T00:00:00Z'));
    return desde === hasta ? f(desde) : `${f(desde)} – ${f(hasta)}`;
}

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
function textoMinutos(min) {
    if (min == null || !isFinite(min)) return '—';
    min = Math.round(min);
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/** Servicio realizado (para comparar tiempos y ver qué agarra cada persona). */
function servicioDe(t) {
    const d = t.detalle || {};
    if (t.area === 'detallado') {
        if (d.paquete && d.paquete !== 'No aplica') return String(d.paquete).replace(/^Promocion:?\s*/i, 'Promoción: ').trim();
        if (Array.isArray(d.especiales) && d.especiales.length) return 'Detallados especiales';
        return 'Detallado';
    }
    const cats = Array.isArray(d.categorias) ? d.categorias.filter(Boolean) : [];
    return cats.length ? cats.slice().sort().join(' + ') : 'Mecánica';
}

const claveComparacion = (t) => `${t.area}|${(t.tipo_vehiculo || '').toUpperCase()}|${servicioDe(t)}`;

function mensajeError(err) {
    const code = (err && err.code) || '';
    const msg = ((err && err.message) || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || msg.includes('could not find') || msg.includes('does not exist')) {
        return 'Falta crear la tabla de productividad. Ejecuta supabase/productividad.sql en Supabase y recarga la página.';
    }
    if (code === '42501' || (err && err.status === 403) || msg.includes('permission') || msg.includes('row-level security')) {
        return 'Sin permiso para leer la productividad. Ejecuta supabase/productividad.sql en Supabase.';
    }
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    return 'No se pudo cargar la productividad. Recarga la página.';
}

/* --------------------------------------------------------------------------
   Cargar
   -------------------------------------------------------------------------- */
async function cargar() {
    const rango = rangoElegido();
    $('periodo-texto').textContent = textoRango(rango);
    $('ranking').innerHTML = '<div class="prod-sk"></div><div class="prod-sk"></div><div class="prod-sk"></div>';

    try {
        // Se pide por páginas de 1000 (límite de Supabase por consulta)
        const filas = [];
        const TAM = 1000;
        for (let desde = 0; desde < 20000; desde += TAM) {
            const { data, error } = await window.supabase
                .from('orden_trabajos')
                .select('orden_id, area, personal_id, personal_nombre, monto_asignado, minutos, tipo_vehiculo, detalle, fin_at')
                .gte('fin_at', inicioDia(rango.desde))
                .lt('fin_at', inicioDia(sumarDias(rango.hasta, 1)))
                .order('fin_at', { ascending: false })
                .range(desde, desde + TAM - 1);
            if (error) throw error;
            filas.push(...(data || []));
            if (!data || data.length < TAM) break;
        }
        trabajos = filas;
        calcularYPintar();
    } catch (err) {
        console.error('[Productividad] Error al cargar:', err);
        trabajos = [];
        pintarKpis([]);
        const cont = $('ranking');
        cont.innerHTML = '<div class="prod-estado is-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span></span></div>';
        cont.querySelector('span').textContent = mensajeError(err);
        $('detalle').hidden = true;
    }
}

/* --------------------------------------------------------------------------
   Cálculos
   -------------------------------------------------------------------------- */
function areaElegida() {
    const r = document.querySelector('input[name="filtro-area"]:checked');
    return r ? r.value : 'todas';
}

function trabajosFiltrados() {
    const area = areaElegida();
    return area === 'todas' ? trabajos : trabajos.filter(t => t.area === area);
}

function calcular(lista) {
    // Tiempo promedio del equipo por servicio + tipo de vehículo (base de la eficiencia)
    const bases = {};
    lista.forEach(t => {
        if (!(t.minutos > 0)) return;
        const k = claveComparacion(t);
        bases[k] = bases[k] || { suma: 0, n: 0 };
        bases[k].suma += t.minutos;
        bases[k].n++;
    });

    const porPersona = new Map();
    lista.forEach(t => {
        const id = t.personal_id || ('nombre:' + t.personal_nombre);
        if (!porPersona.has(id)) {
            porPersona.set(id, {
                id,
                nombre: t.personal_nombre,
                trabajos: 0,
                ingreso: 0,
                minutosPorOrden: new Map(),   // el tiempo de una orden se cuenta una vez
                eficiencias: [],
                areas: new Set(),
                servicios: new Map(),
                lista: []
            });
        }
        const p = porPersona.get(id);
        p.trabajos++;
        p.ingreso += Number(t.monto_asignado) || 0;
        p.areas.add(t.area);
        p.lista.push(t);

        const servicio = servicioDe(t);
        const etiqueta = `${AREAS[t.area] || t.area} · ${servicio}`;
        p.servicios.set(etiqueta, (p.servicios.get(etiqueta) || 0) + 1);

        if (t.minutos > 0) {
            p.minutosPorOrden.set(t.orden_id, Math.max(p.minutosPorOrden.get(t.orden_id) || 0, t.minutos));
            const base = bases[claveComparacion(t)];
            if (base && base.n > 0) {
                const promedio = base.suma / base.n;
                // Se limita para que un dato raro no distorsione todo
                p.eficiencias.push(Math.min(4, Math.max(0.25, promedio / t.minutos)));
            }
        }
    });

    const filas = Array.from(porPersona.values()).map(p => {
        const minutos = Array.from(p.minutosPorOrden.values()).reduce((a, b) => a + b, 0);
        const ordenesConTiempo = p.minutosPorOrden.size;
        return {
            ...p,
            minutos,
            tiempoPromedio: ordenesConTiempo ? minutos / ordenesConTiempo : null,
            ingresoHora: minutos > 0 ? p.ingreso / (minutos / 60) : null,
            eficiencia: p.eficiencias.length ? p.eficiencias.reduce((a, b) => a + b, 0) / p.eficiencias.length : null
        };
    });

    // Puntaje: cada indicador contra el mejor del período (mejor = 100), con pesos
    const maximos = {};
    PESOS.forEach(({ clave }) => {
        maximos[clave] = Math.max(0, ...filas.map(f => Number(f[clave]) || 0));
    });
    filas.forEach(f => {
        f.puntaje = PESOS.reduce((suma, { clave, peso }) => {
            const max = maximos[clave];
            const valor = Number(f[clave]) || 0;
            return suma + (max > 0 ? (valor / max) * peso : 0);
        }, 0);
    });

    filas.sort((a, b) => b.puntaje - a.puntaje || b.ingreso - a.ingreso);
    return filas;
}

/* --------------------------------------------------------------------------
   Pintar
   -------------------------------------------------------------------------- */
function calcularYPintar() {
    const lista = trabajosFiltrados();
    resumen = calcular(lista);
    pintarKpis(lista);
    pintarRanking();

    // Mantener el detalle si la persona sigue en el período
    const sigue = personaElegida && resumen.find(r => r.id === personaElegida);
    if (sigue) pintarDetalle(sigue);
    else {
        personaElegida = null;
        $('detalle').hidden = true;
    }
}

function pintarKpis(lista) {
    const ingreso = lista.reduce((s, t) => s + (Number(t.monto_asignado) || 0), 0);
    // Tiempo por orden (una vez por orden aunque tenga dos áreas)
    const porOrden = new Map();
    lista.forEach(t => { if (t.minutos > 0) porOrden.set(t.orden_id, t.minutos); });
    const tiempos = Array.from(porOrden.values());
    const personas = new Set(lista.map(t => t.personal_id || t.personal_nombre));

    $('kpi-trabajos').textContent = fmtNum.format(lista.length);
    $('kpi-ingreso').textContent = fmtCRC.format(ingreso);
    $('kpi-tiempo').textContent = tiempos.length ? textoMinutos(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : '—';
    $('kpi-personas').textContent = fmtNum.format(personas.size);
}

function celda(texto, clase) {
    const td = document.createElement('td');
    if (clase) td.className = clase;
    td.textContent = texto;
    return td;
}

function pintarRanking() {
    const cont = $('ranking');
    if (!resumen.length) {
        cont.innerHTML = `
            <div class="prod-estado">
                <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                <strong>No hay trabajos registrados en este período.</strong><br>
                Se registran desde la Pizarra al pasar una orden a <strong>Terminado</strong> y elegir quién la realizó.
            </div>`;
        return;
    }

    const table = document.createElement('table');
    table.className = 'prod-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th scope="col" class="num">#</th>
                <th scope="col">Empleado</th>
                <th scope="col" class="col-puntaje">Puntaje</th>
                <th scope="col" class="num">Trabajos</th>
                <th scope="col" class="num">Ingreso</th>
                <th scope="col" class="num">Ingreso / hora</th>
                <th scope="col" class="num">Tiempo prom.</th>
                <th scope="col" class="num">Eficiencia</th>
                <th scope="col">Áreas</th>
            </tr>
        </thead>`;
    const tbody = document.createElement('tbody');

    resumen.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.tabIndex = 0;
        tr.className = p.id === personaElegida ? 'is-selected' : '';
        tr.setAttribute('aria-label', `Ver detalle de ${p.nombre}`);

        tr.appendChild(celda(String(i + 1), 'num prod-pos'));
        tr.appendChild(celda(p.nombre, 'prod-nombre'));

        // Puntaje: barra de un solo color con su valor escrito
        const tdP = document.createElement('td');
        tdP.className = 'col-puntaje';
        const puntaje = Math.round(p.puntaje);
        tdP.innerHTML = `
            <div class="prod-meter" role="img">
                <div class="prod-meter-track"><div class="prod-meter-fill"></div></div>
                <span class="prod-meter-valor"></span>
            </div>`;
        tdP.querySelector('.prod-meter').setAttribute('aria-label', `Puntaje ${puntaje} de 100`);
        tdP.querySelector('.prod-meter-fill').style.width = `${Math.max(2, puntaje)}%`;
        tdP.querySelector('.prod-meter-valor').textContent = puntaje;
        tr.appendChild(tdP);

        tr.appendChild(celda(fmtNum.format(p.trabajos), 'num'));
        tr.appendChild(celda(fmtCRC.format(p.ingreso), 'num'));
        tr.appendChild(celda(p.ingresoHora != null ? fmtCRC.format(p.ingresoHora) : '—', 'num'));
        tr.appendChild(celda(textoMinutos(p.tiempoPromedio), 'num'));
        tr.appendChild(celda(p.eficiencia != null ? fmtDec.format(p.eficiencia) : '—', 'num'));
        tr.appendChild(celda(Array.from(p.areas).map(a => AREAS[a] || a).join(', ')));

        const abrir = () => {
            personaElegida = p.id;
            tbody.querySelectorAll('tr').forEach(x => x.classList.remove('is-selected'));
            tr.classList.add('is-selected');
            pintarDetalle(p);
            $('detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        tr.addEventListener('click', abrir);
        tr.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    cont.replaceChildren(table);
}

function pintarDetalle(p) {
    const sec = $('detalle');
    sec.hidden = false;
    sec.innerHTML = `
        <div class="prod-card-head">
            <h2></h2>
            <button type="button" class="prod-btn-ghost" id="cerrar-detalle"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cerrar</button>
        </div>
        <div class="prod-mini-kpis"></div>
        <div class="prod-detalle-grid">
            <div>
                <h3>Qué servicios realiza</h3>
                <div class="prod-bars"></div>
            </div>
            <div>
                <h3>Últimos trabajos</h3>
                <div class="prod-table-wrap prod-ultimos"></div>
            </div>
        </div>`;
    sec.querySelector('h2').textContent = p.nombre;
    sec.querySelector('#cerrar-detalle').addEventListener('click', () => {
        personaElegida = null;
        sec.hidden = true;
        document.querySelectorAll('.prod-table tbody tr').forEach(x => x.classList.remove('is-selected'));
    });

    // Mini indicadores
    const mini = sec.querySelector('.prod-mini-kpis');
    [
        ['Puntaje', `${Math.round(p.puntaje)} / 100`],
        ['Trabajos', fmtNum.format(p.trabajos)],
        ['Ingreso', fmtCRC.format(p.ingreso)],
        ['Tiempo total (aprox.)', textoMinutos(p.minutos)],
        ['Ingreso / hora', p.ingresoHora != null ? fmtCRC.format(p.ingresoHora) : '—'],
        ['Eficiencia', p.eficiencia != null ? fmtDec.format(p.eficiencia) : '—']
    ].forEach(([etq, val]) => {
        const div = document.createElement('div');
        div.className = 'prod-mini';
        div.innerHTML = '<span></span><strong></strong>';
        div.querySelector('span').textContent = etq;
        div.querySelector('strong').textContent = val;
        mini.appendChild(div);
    });

    // Mezcla de servicios: barras horizontales de un color, con su cantidad escrita
    const bars = sec.querySelector('.prod-bars');
    const servicios = Array.from(p.servicios.entries()).sort((a, b) => b[1] - a[1]);
    const max = servicios.length ? servicios[0][1] : 1;
    servicios.forEach(([nombre, n]) => {
        const fila = document.createElement('div');
        fila.className = 'prod-bar';
        fila.title = `${nombre}: ${n} trabajo${n === 1 ? '' : 's'}`;
        fila.innerHTML = '<span class="prod-bar-label"></span><div class="prod-bar-track"><div class="prod-bar-fill"></div></div><span class="prod-bar-valor"></span>';
        fila.querySelector('.prod-bar-label').textContent = nombre;
        fila.querySelector('.prod-bar-fill').style.width = `${(n / max) * 100}%`;
        fila.querySelector('.prod-bar-valor').textContent = n;
        bars.appendChild(fila);
    });

    // Últimos trabajos
    const tabla = document.createElement('table');
    tabla.className = 'prod-table prod-table-sm';
    tabla.innerHTML = `
        <thead>
            <tr>
                <th scope="col">Fecha</th>
                <th scope="col" class="num">Orden</th>
                <th scope="col">Servicio</th>
                <th scope="col">Vehículo</th>
                <th scope="col" class="num">Tiempo</th>
                <th scope="col" class="num">Monto</th>
            </tr>
        </thead>`;
    const tb = document.createElement('tbody');
    p.lista.slice(0, 15).forEach(t => {
        const tr = document.createElement('tr');
        tr.appendChild(celda(fmtFecha.format(new Date(t.fin_at))));
        tr.appendChild(celda('#' + t.orden_id, 'num'));
        tr.appendChild(celda(`${AREAS[t.area] || t.area} · ${servicioDe(t)}`));
        tr.appendChild(celda(t.tipo_vehiculo || '—'));
        tr.appendChild(celda(textoMinutos(t.minutos), 'num'));
        tr.appendChild(celda(fmtCRC.format(Number(t.monto_asignado) || 0), 'num'));
        tb.appendChild(tr);
    });
    tabla.appendChild(tb);
    sec.querySelector('.prod-ultimos').appendChild(tabla);
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
function iniciar() {
    // Lista de pesos en la ayuda
    const ul = $('lista-pesos');
    PESOS.forEach(({ texto, peso }) => {
        const li = document.createElement('li');
        li.innerHTML = '<strong></strong> ';
        li.querySelector('strong').textContent = `${peso} %`;
        li.append(texto);
        ul.appendChild(li);
    });

    const hoy = hoyCR();
    $('filtro-desde').value = `${hoy.slice(0, 7)}-01`;
    $('filtro-hasta').value = hoy;

    $('filtro-periodo').addEventListener('change', () => {
        $('filtro-rango').hidden = $('filtro-periodo').value !== 'rango';
        cargar();
    });
    $('filtro-desde').addEventListener('change', cargar);
    $('filtro-hasta').addEventListener('change', cargar);
    document.querySelectorAll('input[name="filtro-area"]').forEach(r => r.addEventListener('change', calcularYPintar));

    cargar();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
