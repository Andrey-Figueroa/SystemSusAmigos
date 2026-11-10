/**
 * Calendario de período (estilo agencia de vuelos)
 * - Dos meses lado a lado (uno en celular), flechas para moverse entre meses.
 * - Primer clic = fecha de inicio, segundo clic = fecha final; al pasar el mouse
 *   se ve el rango antes de elegir la fecha final.
 * - Atajos: Hoy, Ayer, Últimos 7 días, Últimos 30 días, Este mes, Mes pasado, Este año.
 * - No deja elegir días futuros.
 *
 *   const cal = RangoCalendario.crear({
 *       boton: document.getElementById('btn-periodo'),
 *       zona: 'America/Costa_Rica',
 *       inicial: { desde: '2026-11-01', hasta: '2026-11-10' },
 *       alAplicar: ({ desde, hasta }) => { ... }
 *   });
 *
 * Fechas siempre como texto AAAA-MM-DD (días de Costa Rica).
 */
window.RangoCalendario = (function () {
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
    const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

    const utc = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const ymdDe = (t) => new Date(t).toISOString().slice(0, 10);
    const sumarDias = (ymd, n) => ymdDe(utc(ymd) + n * 86400000);
    const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
    const diaSemana = (ymd) => (new Date(utc(ymd)).getUTCDay() + 6) % 7;     // 0 = lunes
    const sumarMeses = (ym, n) => {
        const [y, m] = ym.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 1 + n, 1));
        return d.toISOString().slice(0, 7);
    };
    const diasDelMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

    /** "5 nov 2026" */
    function textoCorto(ymd, conAnio = true) {
        const [y, m, d] = ymd.split('-').map(Number);
        return `${d} ${MESES_CORTOS[m - 1]}${conAnio ? ' ' + y : ''}`;
    }

    /** "12 oct – 10 nov 2026" (o "10 nov 2026" si es un solo día) */
    function textoRango(desde, hasta) {
        if (!desde) return '';
        if (!hasta || desde === hasta) return textoCorto(desde);
        const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
        return `${textoCorto(desde, !mismoAnio)} – ${textoCorto(hasta)}`;
    }

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    function crear(opciones) {
        const { boton, alAplicar } = opciones;
        const zona = opciones.zona || 'America/Costa_Rica';
        const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date());

        let desde = (opciones.inicial && opciones.inicial.desde) || hoy();
        let hasta = (opciones.inicial && opciones.inicial.hasta) || desde;
        let tDesde = desde, tHasta = hasta;    // selección temporal (antes de Aplicar)
        let hover = null;
        let mesVista = null;                   // primer mes visible 'AAAA-MM'
        let abierto = false;

        // ---------- Estructura ----------
        const pop = el('div', 'rc-pop');
        pop.hidden = true;
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Elegir período');

        const atajos = el('div', 'rc-atajos');
        const cuerpo = el('div', 'rc-cuerpo');
        const nav = el('div', 'rc-nav');
        const btnPrev = el('button', 'rc-flecha');
        btnPrev.type = 'button';
        btnPrev.setAttribute('aria-label', 'Mes anterior');
        btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>';
        const btnNext = el('button', 'rc-flecha');
        btnNext.type = 'button';
        btnNext.setAttribute('aria-label', 'Mes siguiente');
        btnNext.innerHTML = '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
        nav.append(btnPrev, btnNext);
        const meses = el('div', 'rc-meses');
        cuerpo.append(nav, meses);

        const pie = el('div', 'rc-pie');
        const estado = el('p', 'rc-estado');
        estado.setAttribute('aria-live', 'polite');
        const acciones = el('div', 'rc-acciones');
        const btnCancelar = el('button', 'rc-btn rc-btn-ghost', 'Cancelar');
        btnCancelar.type = 'button';
        const btnAplicar = el('button', 'rc-btn rc-btn-primario', 'Aplicar');
        btnAplicar.type = 'button';
        acciones.append(btnCancelar, btnAplicar);
        pie.append(estado, acciones);

        const principal = el('div', 'rc-principal');
        principal.append(atajos, cuerpo);
        pop.append(principal, pie);

        // El popover se ubica debajo del botón
        const ancla = boton.parentElement;
        ancla.classList.add('rc-ancla');
        ancla.appendChild(pop);

        // ---------- Atajos ----------
        const ATAJOS = [
            ['Hoy', () => { const h = hoy(); return [h, h]; }],
            ['Ayer', () => { const a = sumarDias(hoy(), -1); return [a, a]; }],
            ['Últimos 7 días', () => [sumarDias(hoy(), -6), hoy()]],
            ['Últimos 30 días', () => [sumarDias(hoy(), -29), hoy()]],
            ['Este mes', () => [hoy().slice(0, 8) + '01', hoy()]],
            ['Mes pasado', () => {
                const fin = sumarDias(hoy().slice(0, 8) + '01', -1);
                return [fin.slice(0, 8) + '01', fin];
            }],
            ['Este año', () => [hoy().slice(0, 4) + '-01-01', hoy()]]
        ];
        ATAJOS.forEach(([nombre, calc]) => {
            const b = el('button', 'rc-atajo', nombre);
            b.type = 'button';
            b.addEventListener('click', () => {
                const [a, z] = calc();
                tDesde = a;
                tHasta = z;
                aplicar();
            });
            atajos.appendChild(b);
        });

        // ---------- Pintar ----------
        const cuantosMeses = () => (window.matchMedia('(max-width: 720px)').matches ? 1 : 2);

        function claseDia(ymd) {
            const clases = ['rc-dia'];
            const fin = tHasta || (tDesde && hover && hover >= tDesde ? hover : null);
            if (ymd === hoy()) clases.push('is-hoy');
            if (ymd === tDesde) clases.push('is-inicio');
            if (fin && ymd === fin) clases.push('is-fin');
            if (tDesde && fin && ymd > tDesde && ymd < fin) clases.push('is-rango');
            if (!tHasta && hover && ymd === hover && ymd > (tDesde || '')) clases.push('is-preview');
            return clases.join(' ');
        }

        function pintarMeses() {
            meses.replaceChildren();
            const limite = hoy();
            const n = cuantosMeses();
            for (let i = 0; i < n; i++) {
                const ym = sumarMeses(mesVista, i);
                const [y, m] = ym.split('-').map(Number);
                const bloque = el('div', 'rc-mes');
                bloque.appendChild(el('h3', 'rc-mes-titulo', `${MESES[m - 1]} ${y}`));
                const grid = el('div', 'rc-grid');
                grid.setAttribute('role', 'grid');
                DIAS.forEach((d, j) => {
                    const c = el('span', 'rc-dia-sem', d);
                    c.title = DIAS_LARGOS[j];
                    grid.appendChild(c);
                });
                const primero = `${ym}-01`;
                for (let k = 0; k < diaSemana(primero); k++) grid.appendChild(el('span', 'rc-vacio'));
                const total = diasDelMes(ym);
                for (let d = 1; d <= total; d++) {
                    const ymd = `${ym}-${String(d).padStart(2, '0')}`;
                    const b = el('button', claseDia(ymd), String(d));
                    b.type = 'button';
                    b.dataset.dia = ymd;
                    b.setAttribute('aria-label', `${DIAS_LARGOS[diaSemana(ymd)]} ${d} de ${MESES[m - 1]} de ${y}`);
                    if (ymd === tDesde || ymd === tHasta) b.setAttribute('aria-pressed', 'true');
                    if (ymd > limite) b.disabled = true;
                    grid.appendChild(b);
                }
                bloque.appendChild(grid);
                meses.appendChild(bloque);
            }
            // No avanzar más allá del mes actual
            btnNext.disabled = sumarMeses(mesVista, n - 1) >= limite.slice(0, 7);
            pintarEstado();
        }

        /** Solo actualiza las clases (al pasar el mouse no se vuelve a crear todo). */
        function refrescarClases() {
            meses.querySelectorAll('.rc-dia').forEach(b => {
                b.className = claseDia(b.dataset.dia);
                if (b.dataset.dia === tDesde || b.dataset.dia === tHasta) b.setAttribute('aria-pressed', 'true');
                else b.removeAttribute('aria-pressed');
            });
            pintarEstado();
        }

        function pintarEstado() {
            if (!tDesde) {
                estado.textContent = 'Elige la fecha de inicio';
            } else if (!tHasta) {
                estado.textContent = `Desde ${textoCorto(tDesde)} · ahora elige la fecha final`;
            } else {
                const n = diasEntre(tDesde, tHasta) + 1;
                estado.textContent = `${textoRango(tDesde, tHasta)} · ${n} ${n === 1 ? 'día' : 'días'}`;
            }
            btnAplicar.disabled = !tDesde;
        }

        // ---------- Eventos ----------
        meses.addEventListener('click', (e) => {
            const b = e.target.closest('.rc-dia');
            if (!b || b.disabled) return;
            const d = b.dataset.dia;
            if (!tDesde || tHasta || d < tDesde) {
                tDesde = d;
                tHasta = null;
            } else {
                tHasta = d;
            }
            hover = null;
            refrescarClases();
            if (tHasta) btnAplicar.focus();
        });

        meses.addEventListener('mouseover', (e) => {
            const b = e.target.closest('.rc-dia');
            if (!b || !tDesde || tHasta) return;
            if (hover !== b.dataset.dia) {
                hover = b.dataset.dia;
                refrescarClases();
            }
        });
        meses.addEventListener('mouseleave', () => {
            if (hover) { hover = null; refrescarClases(); }
        });

        btnPrev.addEventListener('click', () => { mesVista = sumarMeses(mesVista, -1); pintarMeses(); });
        btnNext.addEventListener('click', () => { mesVista = sumarMeses(mesVista, 1); pintarMeses(); });
        btnCancelar.addEventListener('click', () => cerrar(true));
        btnAplicar.addEventListener('click', aplicar);

        boton.setAttribute('aria-haspopup', 'dialog');
        boton.setAttribute('aria-expanded', 'false');
        boton.addEventListener('click', () => (abierto ? cerrar(true) : abrir()));

        document.addEventListener('mousedown', (e) => {
            if (abierto && !pop.contains(e.target) && !boton.contains(e.target)) cerrar(true);
        });
        document.addEventListener('keydown', (e) => {
            if (abierto && e.key === 'Escape') { cerrar(true); boton.focus(); }
        });
        window.addEventListener('resize', () => { if (abierto) pintarMeses(); });

        function abrir() {
            tDesde = desde;
            tHasta = hasta;
            hover = null;
            // Mostrar el mes de la fecha final a la derecha (o solo ese en celular)
            mesVista = sumarMeses(hasta.slice(0, 7), -(cuantosMeses() - 1));
            pop.hidden = false;
            abierto = true;
            boton.setAttribute('aria-expanded', 'true');
            pintarMeses();
            const foco = meses.querySelector('.is-inicio') || meses.querySelector('.rc-dia:not(:disabled)');
            if (foco) foco.focus();
        }

        function cerrar() {
            pop.hidden = true;
            abierto = false;
            boton.setAttribute('aria-expanded', 'false');
        }

        function aplicar() {
            if (!tDesde) return;
            desde = tDesde;
            hasta = tHasta || tDesde;
            cerrar();
            pintarBoton();
            if (alAplicar) alAplicar({ desde, hasta });
        }

        function pintarBoton() {
            const txt = boton.querySelector('.rc-boton-texto');
            if (txt) txt.textContent = textoRango(desde, hasta);
            const n = diasEntre(desde, hasta) + 1;
            boton.title = `${textoRango(desde, hasta)} (${n} ${n === 1 ? 'día' : 'días'})`;
        }

        pintarBoton();

        return {
            get rango() { return { desde, hasta }; },
            texto: () => textoRango(desde, hasta)
        };
    }

    return { crear, textoRango, sumarDias, diasEntre, diaSemana };
})();
