/**
 * Datos de Vehículos
 * - Resumen: totales, tipos más habituales (pastel), marcas más comunes,
 *   últimas visitas y vehículos con más de 3 meses sin venir.
 * - Lista con búsqueda, crear / editar, ficha con dueños (vincular / desvincular).
 * - Eliminar y desvincular: solo Dueño y Soporte TI.  Mecánico: no crea vehículos.
 * - La última visita la actualiza la base de datos al crear una orden (supabase/ultima_visita.sql).
 * Todo el texto se inserta como texto (sin innerHTML con datos) para evitar inyecciones.
 */

const ZONA = 'America/Costa_Rica';
const DIAS_INACTIVO = 90;          // "más de 3 meses sin venir"
const POR_PAGINA = 50;
const MAX_PORCIONES = 6;           // tipos en el pastel antes de agrupar en "Otros"

// Paleta de categorías (validada para fondo oscuro: CVD y contraste); "Otros" en gris neutro
const PALETA = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const COLOR_OTROS = '#6b6a65';

const fmtNum = new Intl.NumberFormat('es-CR');
const fmtFecha = new Intl.DateTimeFormat('es-CR', { timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric' });
const fmtRel = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

const $ = (id) => document.getElementById(id);

let vehiculos = [];          // todos (con dueños)
let clientes = [];           // para vincular
let hayUltimaVisita = true;  // false si aún no se ejecutó ultima_visita.sql
let pagina = 1;
let editandoPlaca = null;
let fichaPlaca = null;
let permisos = { crear: true, desvincular: true, eliminar: false };

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
const aviso = (msg, tipo) => window.SaNotificar.aviso(msg, tipo);

function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
}

/** Clave para agrupar tipos/marcas escritos distinto ("Sedán" = "SEDAN"). */
const clave = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[\s-]+/g, '').trim();

/** Fecha de la última visita (si no hay columna/dato, la fecha de registro). */
const ultimaVisita = (v) => v.ultima_visita || v.created_at || null;

function diasDesde(fecha) {
    if (!fecha) return null;
    return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function textoRelativo(fecha) {
    const d = diasDesde(fecha);
    if (d == null) return '—';
    if (d < 1) return 'hoy';
    if (d < 30) return fmtRel.format(-d, 'day');
    if (d < 365) return fmtRel.format(-Math.round(d / 30), 'month');
    return fmtRel.format(-Math.round(d / 365), 'year');
}

const esInactivo = (v) => {
    const d = diasDesde(ultimaVisita(v));
    return d != null && d > DIAS_INACTIVO;
};

const duenosDe = (v) => (v.cliente_vehiculo || []).map(cv => cv.clientes).filter(Boolean);

function mensajeError(err) {
    const msg = ((err && err.message) || '').toLowerCase();
    if (err && err.code === '23505') return 'Ya existe un vehículo con esa placa.';
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    if ((err && err.code === '42501') || msg.includes('permission')) return 'No tienes permiso para esta acción.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/* --------------------------------------------------------------------------
   Permisos (con varios roles: basta con que alguno lo permita)
   -------------------------------------------------------------------------- */
function calcularPermisos() {
    const S = window.AppSession;
    const roles = S.rolesDe(window.SaUser).map(r => S.normalizarRol(r));
    const esTI = roles.some(r => r === 'soporte ti' || r === 'soporte ti / programador');
    const soloMecanico = roles.length > 0 && roles.every(r => r === 'mecanico');
    const puedeEliminar = window.AppSession.puedeEliminar();
    permisos = { crear: !soloMecanico, desvincular: puedeEliminar, eliminar: puedeEliminar };
    $('btn-nuevo').hidden = !permisos.crear;
}

/* --------------------------------------------------------------------------
   Cargar
   -------------------------------------------------------------------------- */
async function cargarVehiculos() {
    const pedir = async (conUltima) => {
        const columnas = `placa, marca, modelo, anio, tipo, created_at${conUltima ? ', ultima_visita' : ''}, cliente_vehiculo ( clientes ( id, nombre, telefono ) )`;
        const filas = [];
        for (let desde = 0; desde < 50000; desde += 1000) {
            const { data, error } = await window.supabase
                .from('vehiculos')
                .select(columnas)
                .order('created_at', { ascending: false })
                .range(desde, desde + 999);
            if (error) throw error;
            filas.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return filas;
    };

    try {
        try {
            vehiculos = await pedir(true);
            hayUltimaVisita = true;
        } catch (err) {
            // La columna ultima_visita aún no existe: se usa la fecha de registro
            if (err && (err.code === '42703' || /ultima_visita/i.test(err.message || ''))) {
                vehiculos = await pedir(false);
                hayUltimaVisita = false;
            } else {
                throw err;
            }
        }
        const avisoSql = $('aviso-sql');
        avisoSql.hidden = hayUltimaVisita;
        avisoSql.textContent = hayUltimaVisita ? '' :
            'La última visita aún no se registra: ejecuta supabase/ultima_visita.sql en Supabase. Mientras tanto se usa la fecha en que se registró cada vehículo.';
        pintarResumen();
        pintarTabla();
    } catch (err) {
        console.error('[Vehículos] Error al cargar:', err);
        aviso('No se pudieron cargar los vehículos. ' + mensajeError(err), 'error');
        $('tabla-vehiculos').replaceChildren();
        const tr = el('tr');
        const td = el('td', 'veh-vacio', 'No se pudieron cargar los vehículos. Recarga la página.');
        td.colSpan = 6;
        tr.appendChild(td);
        $('tabla-vehiculos').appendChild(tr);
    }
}

async function cargarClientes() {
    try {
        const { data, error } = await window.supabase.from('clientes').select('id, nombre, telefono').order('nombre');
        if (error) throw error;
        clientes = data || [];
    } catch (e) {
        console.warn('[Vehículos] No se pudieron cargar los clientes:', e);
    }
}

/* --------------------------------------------------------------------------
   Resumen
   -------------------------------------------------------------------------- */
function pintarResumen() {
    const hoyMes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date()).slice(0, 7);
    const mesDe = (f) => f ? new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(f)).slice(0, 7) : '';

    const nuevos = vehiculos.filter(v => { const d = diasDesde(v.created_at); return d != null && d <= 30; }).length;
    const delMes = vehiculos.filter(v => mesDe(ultimaVisita(v)) === hoyMes).length;
    const inactivos = vehiculos.filter(esInactivo);

    $('kpi-total').textContent = fmtNum.format(vehiculos.length);
    $('kpi-nuevos').textContent = fmtNum.format(nuevos);
    $('kpi-mes').textContent = fmtNum.format(delMes);
    $('kpi-inactivos').textContent = fmtNum.format(inactivos.length);

    pintarPastelTipos();
    pintarBarrasMarcas();

    // Últimas visitas
    const ultimos = vehiculos.slice().sort((a, b) => new Date(ultimaVisita(b)) - new Date(ultimaVisita(a))).slice(0, 6);
    pintarMiniLista('lista-ultimos', ultimos, 'Aún no hay vehículos.');

    // Más tiempo sin venir (los más antiguos primero)
    const viejos = inactivos.slice().sort((a, b) => new Date(ultimaVisita(a)) - new Date(ultimaVisita(b))).slice(0, 6);
    pintarMiniLista('lista-inactivos', viejos, 'Todos los vehículos vinieron en los últimos 3 meses.');
}

/** Agrupa por una columna (tipo/marca) sin importar mayúsculas ni tildes. */
function agrupar(campo) {
    const grupos = new Map();
    vehiculos.forEach(v => {
        const original = (v[campo] || '').trim() || 'Sin dato';
        const k = clave(original) || 'SINDATO';
        if (!grupos.has(k)) grupos.set(k, { etiqueta: original.toUpperCase(), n: 0 });
        grupos.get(k).n++;
    });
    return Array.from(grupos.values()).sort((a, b) => b.n - a.n);
}

function pintarPastelTipos() {
    const cont = $('grafico-tipos');
    cont.replaceChildren();
    const grupos = agrupar('tipo');
    const total = vehiculos.length;
    if (!total) {
        cont.appendChild(el('p', 'veh-vacio', 'Sin datos.'));
        return;
    }

    // Top 6 + "Otros"
    let porciones = grupos.slice(0, MAX_PORCIONES).map((g, i) => ({ ...g, color: PALETA[i] }));
    const resto = grupos.slice(MAX_PORCIONES).reduce((s, g) => s + g.n, 0);
    if (resto > 0) porciones.push({ etiqueta: 'OTROS', n: resto, color: COLOR_OTROS });

    // SVG del pastel (con separación de 2px del color del fondo entre porciones)
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-1.05 -1.05 2.1 2.1');
    svg.setAttribute('class', 'veh-pie-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Tipos de vehículo: ' + porciones.map(p => `${p.etiqueta} ${p.n}`).join(', '));

    let angulo = -Math.PI / 2;
    porciones.forEach(p => {
        const frac = p.n / total;
        const fin = angulo + frac * Math.PI * 2;
        let forma;
        if (frac >= 0.9999) {
            forma = document.createElementNS(NS, 'circle');
            forma.setAttribute('r', '1');
        } else {
            const x1 = Math.cos(angulo), y1 = Math.sin(angulo);
            const x2 = Math.cos(fin), y2 = Math.sin(fin);
            forma = document.createElementNS(NS, 'path');
            forma.setAttribute('d', `M0 0 L${x1} ${y1} A1 1 0 ${frac > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`);
        }
        forma.setAttribute('fill', p.color);
        forma.setAttribute('class', 'veh-pie-porcion');
        const titulo = document.createElementNS(NS, 'title');
        titulo.textContent = `${p.etiqueta}: ${fmtNum.format(p.n)} (${Math.round(frac * 100)} %)`;
        forma.appendChild(titulo);
        svg.appendChild(forma);
        angulo = fin;
    });

    // Leyenda con nombre, cantidad y porcentaje (la identidad no depende solo del color)
    const leyenda = el('ul', 'veh-leyenda');
    porciones.forEach(p => {
        const li = el('li');
        const punto = el('span', 'veh-leyenda-punto');
        punto.style.background = p.color;
        li.appendChild(punto);
        li.appendChild(el('span', 'veh-leyenda-nombre', p.etiqueta));
        li.appendChild(el('span', 'veh-leyenda-valor', `${fmtNum.format(p.n)} · ${Math.round(p.n / total * 100)} %`));
        leyenda.appendChild(li);
    });

    cont.appendChild(svg);
    cont.appendChild(leyenda);
}

function pintarBarrasMarcas() {
    const cont = $('grafico-marcas');
    cont.replaceChildren();
    const grupos = agrupar('marca').slice(0, 8);
    if (!grupos.length) {
        cont.appendChild(el('p', 'veh-vacio', 'Sin datos.'));
        return;
    }
    const max = grupos[0].n;
    grupos.forEach(g => {
        const fila = el('div', 'veh-bar');
        fila.title = `${g.etiqueta}: ${fmtNum.format(g.n)} vehículos`;
        fila.appendChild(el('span', 'veh-bar-label', g.etiqueta));
        const pista = el('div', 'veh-bar-track');
        const relleno = el('div', 'veh-bar-fill');
        relleno.style.width = `${(g.n / max) * 100}%`;
        pista.appendChild(relleno);
        fila.appendChild(pista);
        fila.appendChild(el('span', 'veh-bar-valor', fmtNum.format(g.n)));
        cont.appendChild(fila);
    });
}

function pintarMiniLista(id, lista, vacio) {
    const ul = $(id);
    ul.replaceChildren();
    if (!lista.length) {
        ul.appendChild(el('li', 'veh-vacio', vacio));
        return;
    }
    lista.forEach(v => {
        const li = el('li');
        const btn = el('button', 'veh-mini-item');
        btn.type = 'button';
        btn.appendChild(el('span', 'veh-placa', v.placa));
        btn.appendChild(el('span', 'veh-mini-nombre', `${v.marca || ''} ${v.modelo || ''}`.trim() || 'Vehículo'));
        const fecha = ultimaVisita(v);
        const cuando = el('span', 'veh-mini-fecha', textoRelativo(fecha));
        if (fecha) cuando.title = fmtFecha.format(new Date(fecha));
        btn.appendChild(cuando);
        btn.addEventListener('click', () => abrirFicha(v.placa));
        li.appendChild(btn);
        ul.appendChild(li);
    });
}

/* --------------------------------------------------------------------------
   Tabla
   -------------------------------------------------------------------------- */
function filtrados() {
    const q = clave($('buscar').value);
    const soloInactivos = $('filtro-inactivos').checked;
    return vehiculos.filter(v => {
        if (soloInactivos && !esInactivo(v)) return false;
        if (!q) return true;
        const texto = clave([v.placa, v.marca, v.modelo, ...duenosDe(v).map(c => `${c.nombre} ${c.telefono || ''}`)].join(' '));
        return texto.includes(q);
    });
}

function boton(icono, titulo, clase, accion) {
    const b = el('button', `veh-icon-btn ${clase || ''}`);
    b.type = 'button';
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    const i = el('i', `fa-solid ${icono}`);
    i.setAttribute('aria-hidden', 'true');
    b.appendChild(i);
    b.addEventListener('click', accion);
    return b;
}

function pintarTabla() {
    const tbody = $('tabla-vehiculos');
    tbody.replaceChildren();
    const lista = filtrados();
    const visibles = lista.slice(0, pagina * POR_PAGINA);

    if (!lista.length) {
        const tr = el('tr');
        const td = el('td', 'veh-vacio', vehiculos.length ? 'Ningún vehículo coincide con la búsqueda.' : 'Aún no hay vehículos registrados.');
        td.colSpan = 6;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    visibles.forEach(v => {
        const tr = el('tr');

        const tdPlaca = el('td');
        tdPlaca.appendChild(el('span', 'veh-placa', v.placa));
        tr.appendChild(tdPlaca);

        tr.appendChild(el('td', 'veh-col-nombre', `${v.marca || ''} ${v.modelo || ''}`.trim() || '—'));
        tr.appendChild(el('td', 'veh-col-sec', [v.tipo, v.anio].filter(Boolean).join(' · ') || '—'));

        const fecha = ultimaVisita(v);
        const tdVisita = el('td', 'veh-col-sec' + (esInactivo(v) ? ' is-inactivo' : ''), textoRelativo(fecha));
        if (fecha) tdVisita.title = fmtFecha.format(new Date(fecha));
        tr.appendChild(tdVisita);

        const duenos = duenosDe(v);
        const tdDuenos = el('td', 'veh-col-sec');
        if (!duenos.length) tdDuenos.appendChild(el('span', 'veh-tenue', 'Sin asignar'));
        else {
            tdDuenos.appendChild(el('span', null, duenos[0].nombre));
            if (duenos.length > 1) tdDuenos.appendChild(el('span', 'veh-mas-chip', `+${duenos.length - 1}`));
        }
        tr.appendChild(tdDuenos);

        const tdAcc = el('td', 'col-acciones');
        const acciones = el('div', 'veh-acciones');
        acciones.appendChild(boton('fa-id-card', `Ver ficha de ${v.placa}`, '', () => abrirFicha(v.placa)));
        if (permisos.crear) acciones.appendChild(boton('fa-pen', `Editar ${v.placa}`, '', () => abrirFormulario(v.placa)));
        if (permisos.eliminar) acciones.appendChild(boton('fa-trash-can', `Eliminar ${v.placa}`, 'is-peligro', () => eliminarVehiculo(v.placa)));
        tdAcc.appendChild(acciones);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
    });

    $('contador').textContent = lista.length
        ? `Mostrando ${fmtNum.format(visibles.length)} de ${fmtNum.format(lista.length)} vehículos`
        : '';
    $('btn-mas').hidden = visibles.length >= lista.length;
}

/* --------------------------------------------------------------------------
   Formulario crear / editar (tipos y marcas desde Configuración)
   -------------------------------------------------------------------------- */
let opcionesCargadas = false;

async function cargarOpcionesFormulario() {
    if (opcionesCargadas) return;
    const selTipo = $('campo-tipo');
    const selMarca = $('campo-marca');
    try {
        const tipos = await window.TiposVehiculo.cargar();
        selTipo.replaceChildren(new Option('Selecciona el tipo…', ''));
        tipos.forEach(t => selTipo.add(new Option(t.nombre, t.nombre)));
    } catch (e) {
        console.warn('[Vehículos] No se cargaron los tipos de Configuración:', e);
        selTipo.replaceChildren(new Option('Selecciona el tipo…', ''));
    }
    try {
        const { data, error } = await window.supabase.from('marcas_vehiculo').select('nombre').eq('activo', true).order('nombre');
        if (error) throw error;
        selMarca.replaceChildren(new Option('Selecciona la marca…', ''));
        (data || []).forEach(m => selMarca.add(new Option(m.nombre, m.nombre)));
    } catch (e) {
        console.warn('[Vehículos] No se cargaron las marcas de Configuración:', e);
        selMarca.replaceChildren(new Option('Selecciona la marca…', ''));
    }
    opcionesCargadas = true;
}

/** Selecciona un valor; si no está en la lista (dato viejo), lo agrega para no perderlo. */
function elegir(select, valor) {
    if (!valor) { select.value = ''; return; }
    const existe = Array.from(select.options).find(o => clave(o.value) === clave(valor));
    if (existe) select.value = existe.value;
    else {
        select.add(new Option(valor, valor));
        select.value = valor;
    }
}

async function abrirFormulario(placa = null) {
    if (!permisos.crear) return;
    await cargarOpcionesFormulario();
    editandoPlaca = placa;
    const v = placa ? vehiculos.find(x => x.placa === placa) : null;

    $('form-titulo').textContent = v ? `Editar ${v.placa}` : 'Nuevo vehículo';
    $('campo-placa').value = v ? v.placa : '';
    $('campo-placa').disabled = !!v;
    $('campo-modelo').value = v ? (v.modelo || '') : '';
    $('campo-anio').value = v ? (v.anio || '') : '';
    elegir($('campo-marca'), v ? v.marca : '');
    elegir($('campo-tipo'), v ? v.tipo : '');
    $('form-error').textContent = '';

    $('dialog-vehiculo').showModal();
    (v ? $('campo-modelo') : $('campo-placa')).focus();
}

async function guardarVehiculo(e) {
    e.preventDefault();
    const error = $('form-error');
    error.textContent = '';

    const placa = $('campo-placa').value.trim().toUpperCase().replace(/\s+/g, '');
    const marca = $('campo-marca').value;
    const modelo = $('campo-modelo').value.trim().replace(/\s+/g, ' ');
    const anio = parseInt($('campo-anio').value, 10);
    const tipo = $('campo-tipo').value;
    const maxAnio = new Date().getFullYear() + 1;

    if (!placa) { error.textContent = 'Escribe la placa.'; $('campo-placa').focus(); return; }
    if (!/^[A-Z0-9-]{2,15}$/.test(placa)) { error.textContent = 'La placa solo puede tener letras, números y guiones.'; $('campo-placa').focus(); return; }
    if (!marca) { error.textContent = 'Elige la marca.'; $('campo-marca').focus(); return; }
    if (!modelo) { error.textContent = 'Escribe el modelo.'; $('campo-modelo').focus(); return; }
    if (!anio || anio < 1900 || anio > maxAnio) { error.textContent = `El año debe estar entre 1900 y ${maxAnio}.`; $('campo-anio').focus(); return; }
    if (!tipo) { error.textContent = 'Elige el tipo de vehículo.'; $('campo-tipo').focus(); return; }

    const btn = $('btn-guardar');
    btn.disabled = true;
    try {
        if (editandoPlaca) {
            const { error: err } = await window.supabase.from('vehiculos').update({ marca, modelo, anio, tipo }).eq('placa', editandoPlaca);
            if (err) throw err;
            aviso(`${editandoPlaca} actualizado.`, 'exito');
        } else {
            const { error: err } = await window.supabase.from('vehiculos').insert([{ placa, marca, modelo, anio, tipo }]);
            if (err) throw err;
            aviso(`${placa} registrado.`, 'exito');
        }
        $('dialog-vehiculo').close();
        await cargarVehiculos();
    } catch (err) {
        console.error('[Vehículos] Error al guardar:', err);
        error.textContent = mensajeError(err);
    } finally {
        btn.disabled = false;
    }
}

/* --------------------------------------------------------------------------
   Ficha: datos + dueños (vincular / desvincular)
   -------------------------------------------------------------------------- */
function abrirFicha(placa) {
    const v = vehiculos.find(x => x.placa === placa);
    if (!v) return;
    fichaPlaca = placa;

    $('ficha-placa').textContent = v.placa;
    $('ficha-nombre').textContent = `${v.marca || ''} ${v.modelo || ''}`.trim();

    const datos = $('ficha-datos');
    datos.replaceChildren();
    const fecha = ultimaVisita(v);
    [
        ['Tipo', v.tipo || '—'],
        ['Año', v.anio || '—'],
        ['Última visita', fecha ? `${fmtFecha.format(new Date(fecha))} (${textoRelativo(fecha)})` : '—'],
        ['Registrado', v.created_at ? fmtFecha.format(new Date(v.created_at)) : '—']
    ].forEach(([k, val]) => {
        const div = el('div', 'veh-dato');
        div.appendChild(el('span', null, k));
        div.appendChild(el('strong', null, String(val)));
        datos.appendChild(div);
    });

    pintarDuenos(v);
    $('buscar-cliente').value = '';
    $('resultados-cliente').replaceChildren();
    $('dialog-ficha').showModal();
}

function pintarDuenos(v) {
    const ul = $('ficha-duenos');
    ul.replaceChildren();
    const duenos = duenosDe(v);
    if (!duenos.length) {
        ul.appendChild(el('li', 'veh-vacio', 'Ningún cliente vinculado a este vehículo.'));
        return;
    }
    duenos.forEach(c => {
        const li = el('li', 'veh-dueno');
        const info = el('div');
        info.appendChild(el('strong', null, c.nombre));
        info.appendChild(el('span', null, c.telefono || 'Sin teléfono'));
        li.appendChild(info);
        if (permisos.desvincular) {
            li.appendChild(boton('fa-link-slash', `Desvincular a ${c.nombre}`, 'is-peligro', () => desvincular(c, v.placa)));
        }
        ul.appendChild(li);
    });
}

function buscarClientes() {
    const ul = $('resultados-cliente');
    ul.replaceChildren();
    const q = clave($('buscar-cliente').value);
    if (q.length < 2) return;

    const v = vehiculos.find(x => x.placa === fichaPlaca);
    const yaVinculados = new Set(duenosDe(v).map(c => c.id));
    const lista = clientes.filter(c => !yaVinculados.has(c.id) && clave(`${c.nombre} ${c.telefono || ''}`).includes(q)).slice(0, 8);

    if (!lista.length) {
        ul.appendChild(el('li', 'veh-vacio', 'No se encontraron clientes.'));
        return;
    }
    lista.forEach(c => {
        const li = el('li', 'veh-resultado');
        const info = el('div');
        info.appendChild(el('strong', null, c.nombre));
        info.appendChild(el('span', null, c.telefono || 'Sin teléfono'));
        li.appendChild(info);
        const b = el('button', 'veh-btn veh-btn-ghost veh-btn-sm', 'Vincular');
        b.type = 'button';
        b.addEventListener('click', () => vincular(c, fichaPlaca, b));
        li.appendChild(b);
        ul.appendChild(li);
    });
}

async function vincular(cliente, placa, btn) {
    btn.disabled = true;
    try {
        const { error } = await window.supabase.from('cliente_vehiculo').insert([{ cliente_id: cliente.id, vehiculo_placa: placa }]);
        if (error) {
            if (error.code === '23505') throw new Error('Ese cliente ya está vinculado.');
            throw error;
        }
        aviso(`${cliente.nombre} vinculado a ${placa}.`, 'exito');
        await cargarVehiculos();
        const v = vehiculos.find(x => x.placa === placa);
        if (v) pintarDuenos(v);
        $('buscar-cliente').value = '';
        $('resultados-cliente').replaceChildren();
    } catch (e) {
        aviso(e.message && !e.code ? e.message : mensajeError(e), 'error');
        btn.disabled = false;
    }
}

async function desvincular(cliente, placa) {
    if (!permisos.desvincular) return;
    const ok = await window.SaNotificar.confirmar({
        titulo: 'Desvincular cliente',
        mensaje: `¿Quitar a ${cliente.nombre} como dueño de ${placa}?`,
        textoConfirmar: 'Desvincular',
        peligro: true
    });
    if (!ok) return;
    try {
        const { error } = await window.supabase.from('cliente_vehiculo').delete().match({ cliente_id: cliente.id, vehiculo_placa: placa });
        if (error) throw error;
        if (window.enviarAlertaEliminacion) {
            window.enviarAlertaEliminacion('Vehículos', `Desvinculación de cliente\nVehículo placa: ${placa}\nCliente: ${cliente.nombre} (ID ${cliente.id})`);
        }
        aviso(`${cliente.nombre} ya no está vinculado a ${placa}.`, 'exito');
        await cargarVehiculos();
        const v = vehiculos.find(x => x.placa === placa);
        if (v) pintarDuenos(v);
    } catch (e) {
        console.error('[Vehículos] Error al desvincular:', e);
        aviso('No se pudo desvincular. ' + mensajeError(e), 'error');
    }
}

/* --------------------------------------------------------------------------
   Eliminar (solo Dueño y Soporte TI)
   -------------------------------------------------------------------------- */
async function eliminarVehiculo(placa) {
    if (!permisos.eliminar) {
        aviso('Solo el Dueño y Soporte TI pueden eliminar.', 'advertencia');
        return;
    }
    const v = vehiculos.find(x => x.placa === placa);
    const ok = await window.SaNotificar.confirmar({
        titulo: `Eliminar ${placa}`,
        mensaje: 'Se eliminará el vehículo y sus vínculos con clientes. Esta acción no se puede deshacer.',
        textoConfirmar: 'Eliminar',
        peligro: true
    });
    if (!ok) return;
    try {
        const { error } = await window.supabase.from('vehiculos').delete().eq('placa', placa);
        if (error) throw error;
        if (window.enviarAlertaEliminacion) {
            const d = v ? `Vehículo placa: ${placa}\nMarca: ${v.marca || 'N/A'}\nModelo: ${v.modelo || 'N/A'}\nAño: ${v.anio || 'N/A'}\nTipo: ${v.tipo || 'N/A'}` : `Vehículo placa: ${placa}`;
            window.enviarAlertaEliminacion('Vehículos', d);
        }
        aviso(`${placa} eliminado.`, 'exito');
        await cargarVehiculos();
    } catch (e) {
        console.error('[Vehículos] Error al eliminar:', e);
        aviso('No se pudo eliminar. ' + mensajeError(e), 'error');
    }
}

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
function iniciar() {
    calcularPermisos();

    $('btn-nuevo').addEventListener('click', () => abrirFormulario());
    $('form-vehiculo').addEventListener('submit', guardarVehiculo);
    $('campo-placa').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

    let espera;
    $('buscar').addEventListener('input', () => {
        clearTimeout(espera);
        espera = setTimeout(() => { pagina = 1; pintarTabla(); }, 150);
    });
    $('filtro-inactivos').addEventListener('change', () => { pagina = 1; pintarTabla(); });
    $('btn-mas').addEventListener('click', () => { pagina++; pintarTabla(); });
    $('ver-inactivos').addEventListener('click', () => {
        $('filtro-inactivos').checked = true;
        pagina = 1;
        pintarTabla();
        $('seccion-lista').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('buscar-cliente').addEventListener('input', buscarClientes);

    ['dialog-vehiculo', 'dialog-ficha'].forEach(id => {
        const d = $(id);
        d.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });

    $('ficha-vincular').hidden = false;
    cargarVehiculos();
    cargarClientes();
}

if (window.SaUser) {
    iniciar();
} else {
    document.addEventListener('sa:auth-ready', iniciar, { once: true });
}
