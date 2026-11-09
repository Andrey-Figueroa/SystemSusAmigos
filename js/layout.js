/**
 * Layout compartido: navbar superior + menú lateral fijos en TODAS las páginas.
 *
 * Se carga en el <head> de cada módulo, después de js/config.js y ANTES de js/auth_guard.js.
 * - Dibuja el navbar y el menú lateral (iguales en todas las páginas).
 * - Mete todo el contenido propio de la página en <div class="sa-content"> (el panel derecho).
 * - auth_guard.js llama a SaLayout.setUser(profile) al verificar la sesión, para mostrar
 *   nombre, rol y aplicar los permisos al menú (mismas reglas que el guard).
 *
 * Los estilos están en css/layout.css.
 */
(function () {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/login/')) return;

    const DASHBOARD_URL = '../dashboard/index.html';

    // Enlaces externos del navbar
    const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1msYzwqhPAyRn8JnYQdu3MsX7xRVHsCbvqd-olb6x104/edit?usp=sharing';
    const BACKUP_URL = 'https://drive.google.com/drive/u/1/folders/1uSuG3FWZ985dWac5djBnGBUuX4LgZnQl';

    // Módulos del menú lateral. 'rutas' sirve para marcar el activo y revisar permisos.
    const MENU = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high', href: DASHBOARD_URL, rutas: ['/dashboard/'] },
        { section: 'Módulos' },
        { id: 'vender', label: 'Vender / Atender', icon: 'fa-cash-register', href: '../vender/index.html',
          rutas: ['/vender/', '/ventas/', '/local_comercial/', '/domicilio/'] },
        { id: 'pizarra', label: 'Pizarra del Local', icon: 'fa-tv', href: '../pizarra_local/index.html', rutas: ['/pizarra_local/'] },
        { id: 'gastos', label: 'Gastos Diarios', icon: 'fa-money-bill-transfer', href: '../gastos/index.html', rutas: ['/gastos/'] },
        { id: 'cierre', label: 'Cierre de Operaciones', icon: 'fa-vault', href: '../cierre/index.html', rutas: ['/cierre/'] },
        { id: 'mecanica', label: 'Área de Mecánica', icon: 'fa-screwdriver-wrench', href: '../mecanica/index.html', rutas: ['/mecanica/'] },
        { id: 'cxc', label: 'Cuentas por Cobrar', icon: 'fa-file-invoice-dollar', href: '../cxc/index.html', rutas: ['/cxc/'] },
        { id: 'reporte', label: 'Hoja de Reporte', icon: 'fa-file-lines', href: '../reporte/index.html', rutas: ['/reporte/'],
          ocultarSinPermiso: true },
        { id: 'clientes', label: 'Datos Clientes', icon: 'fa-users', href: '../clientes/index.html', rutas: ['/clientes/'] },
        { id: 'vehiculos', label: 'Datos Vehículos', icon: 'fa-car', href: '../vehiculos/index.html', rutas: ['/vehiculos/'] },
        { id: 'personal', label: 'Personal', icon: 'fa-users-gear', href: '../personal/index.html', rutas: ['/personal/'],
          ocultarSinPermiso: true },
        { id: 'productividad', label: 'Productividad', icon: 'fa-chart-line', href: '../productividad/index.html', rutas: ['/productividad/'],
          ocultarSinPermiso: true },
        { id: 'configuracion', label: 'Configuración', icon: 'fa-gear', href: '../configuracion/index.html', rutas: ['/configuracion/'],
          ocultarSinPermiso: true }
    ];

    // 1. Estilos del layout, fuente e íconos (algunos módulos no cargan Font Awesome)
    function addStylesheet(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
    // Favicon ÚNICO del sistema (carro dorado sobre negro): se fija aquí para que
    // ninguna página quede con otro ícono aunque su HTML diga algo distinto.
    (function fijarFavicon() {
        const FAVICON = '../favicon.png';
        document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(l => l.remove());
        [['icon', 'image/png'], ['apple-touch-icon', null]].forEach(([rel, type]) => {
            const link = document.createElement('link');
            link.rel = rel;
            if (type) link.type = type;
            link.href = FAVICON;
            document.head.appendChild(link);
        });
    })();

    addStylesheet('../css/theme.css?v=2');
    addStylesheet('../css/layout.css?v=9');
    addStylesheet('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    if (!document.querySelector('link[href*="font-awesome"]')) {
        addStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
    }

    // 2. Skeleton de carga: se ve mientras auth_guard.js verifica la sesión al entrar a un módulo.
    //    Los estilos van en línea para que se pinte al instante, antes de que cargue cualquier CSS.
    const SKELETON_CSS = `
        #sa-skeleton {
            position: fixed; inset: 0; z-index: 2147483000;
            background: #0a0a0b;
            background-image: radial-gradient(ellipse at top, rgba(212, 167, 44, 0.08) 0%, transparent 60%);
            transition: opacity 0.2s ease;
        }
        #sa-skeleton.sa-skeleton-out { opacity: 0; pointer-events: none; }
        #sa-skeleton .sk {
            border-radius: 8px;
            background: linear-gradient(90deg, #141415 0%, #262628 50%, #141415 100%);
            background-size: 200% 100%;
            animation: sa-sk-shimmer 1.4s ease-in-out infinite;
        }
        #sa-skeleton .sk-top {
            position: absolute; top: 0; left: 0; right: 0; height: 80px;
            display: flex; align-items: center; gap: 12px; padding: 0 24px;
            background: rgba(10, 10, 11, 0.92); border-bottom: 1px solid #262628;
        }
        #sa-skeleton .sk-logo { height: 74px; width: auto; display: block; }
        #sa-skeleton .sk-pill { width: 130px; height: 32px; margin-left: 12px; }
        #sa-skeleton .sk-space { flex: 1; }
        #sa-skeleton .sk-user { width: 120px; height: 16px; }
        #sa-skeleton .sk-btn { width: 130px; height: 36px; border-radius: 10px; }
        #sa-skeleton .sk-side {
            position: absolute; top: 80px; left: 0; bottom: 0; width: 240px;
            padding: 20px 14px; display: flex; flex-direction: column; gap: 10px;
            background: #050505; border-right: 1px solid #262628;
        }
        #sa-skeleton .sk-item { height: 38px; border-radius: 10px; }
        #sa-skeleton .sk-item.sk-short { width: 45%; height: 12px; margin: 14px 0 4px 12px; }
        #sa-skeleton .sk-main {
            position: absolute; top: 80px; left: 240px; right: 0; bottom: 0;
            padding: 40px; display: flex; flex-direction: column; gap: 16px; overflow: hidden;
        }
        #sa-skeleton .sk-title { width: 280px; max-width: 70%; height: 28px; }
        #sa-skeleton .sk-sub { width: 420px; max-width: 90%; height: 14px; margin-bottom: 16px; }
        #sa-skeleton .sk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
        #sa-skeleton .sk-card { height: 96px; border-radius: 12px; }
        #sa-skeleton .sk-block { height: 280px; border-radius: 12px; margin-top: 8px; }
        @keyframes sa-sk-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { #sa-skeleton .sk { animation: none; } }
        @media (min-width: 768px) and (max-width: 1023px) {
            #sa-skeleton .sk-side { width: 210px; padding: 18px 10px; }
            #sa-skeleton .sk-main { left: 210px; padding: 28px 24px; }
            #sa-skeleton .sk-user { display: none; }
        }
        @media (max-width: 767px) {
            #sa-skeleton .sk-top { height: 66px; padding: 0 12px; }
            #sa-skeleton .sk-logo { height: 60px; }
            #sa-skeleton .sk-pill, #sa-skeleton .sk-user, #sa-skeleton .sk-side { display: none; }
            #sa-skeleton .sk-btn { width: 40px; }
            #sa-skeleton .sk-main { top: 66px; left: 0; padding: 24px 16px; }
        }
    `;

    function showSkeleton() {
        const style = document.createElement('style');
        style.id = 'sa-skeleton-style';
        style.textContent = SKELETON_CSS;
        document.head.appendChild(style);

        const items = '<div class="sk sk-item"></div>' +
            '<div class="sk sk-item sk-short"></div>' +
            '<div class="sk sk-item"></div>'.repeat(8);
        const cards = '<div class="sk sk-card"></div>'.repeat(4);

        const sk = document.createElement('div');
        sk.id = 'sa-skeleton';
        sk.setAttribute('role', 'status');
        sk.setAttribute('aria-label', 'Cargando');
        sk.innerHTML = `
            <div class="sk-top">
                <img class="sk-logo" src="../SusAmigosLogotipo.webp" alt="" width="450" height="300">
                <div class="sk sk-pill"></div>
                <div class="sk-space"></div>
                <div class="sk sk-user"></div>
                <div class="sk sk-btn"></div>
            </div>
            <div class="sk-side">${items}</div>
            <div class="sk-main">
                <div class="sk sk-title"></div>
                <div class="sk sk-sub"></div>
                <div class="sk-grid">${cards}</div>
                <div class="sk sk-block"></div>
            </div>
        `;
        // <body> aún no existe (este script corre en el <head>): se cuelga de <html>
        document.documentElement.appendChild(sk);
    }

    function hideSkeleton() {
        const sk = document.getElementById('sa-skeleton');
        if (!sk) return;
        sk.classList.add('sa-skeleton-out');
        setTimeout(() => {
            sk.remove();
            const style = document.getElementById('sa-skeleton-style');
            if (style) style.remove();
        }, 220);
    }

    showSkeleton();

    let pendingProfile = null;
    let built = false;

    function esActivo(item) {
        return (item.rutas || []).some(r => path.includes(r));
    }

    function buildNavbar() {
        const header = document.createElement('header');
        header.className = 'sa-topbar';
        header.innerHTML = `
            <div class="sa-topbar-left">
                <button type="button" class="sa-menu-btn" id="sa-menu-btn" aria-label="Abrir menú" aria-controls="sa-sidebar" aria-expanded="false">
                    <i class="fa-solid fa-bars" aria-hidden="true"></i>
                </button>
                <a href="${DASHBOARD_URL}" class="sa-brand" title="Ir al Dashboard">
                    <img src="../SusAmigosLogotipo.webp" alt="Sus Amigos - Centro de Servicios" width="450" height="300">
                </a>
                <nav class="sa-topnav" aria-label="Accesos rápidos">
                    <a href="${SHEETS_URL}" id="sa-nav-sheets" class="sa-topnav-link sa-link-sheets" target="_blank" rel="noopener noreferrer" hidden>
                        <i class="fa-solid fa-table-list" aria-hidden="true"></i><span>Google Sheets</span>
                    </a>
                    <a href="${BACKUP_URL}" id="sa-nav-backup" class="sa-topnav-link sa-link-backup" target="_blank" rel="noopener noreferrer" hidden>
                        <i class="fa-solid fa-folder-open" aria-hidden="true"></i><span>Carpetas de respaldo</span>
                    </a>
                </nav>
            </div>
            <div class="sa-user">
                <time id="sa-clock" class="sa-clock"></time>
                <span class="sa-greeting">Hola, <strong id="sa-user-name">Usuario</strong></span>
                <button type="button" id="sa-logout" class="sa-logout" title="Cerrar sesión">
                    <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>Cerrar sesión</span>
                </button>
            </div>
        `;
        header.querySelector('#sa-logout').addEventListener('click', () => {
            if (window.cerrarSesion) window.cerrarSesion();
        });
        return header;
    }

    function buildSidebar() {
        const aside = document.createElement('aside');
        aside.className = 'sa-sidebar';
        aside.id = 'sa-sidebar';
        aside.setAttribute('aria-label', 'Menú de módulos');

        const nav = document.createElement('nav');
        nav.className = 'sa-sidebar-nav';

        MENU.forEach(item => {
            if (item.section) {
                const s = document.createElement('span');
                s.className = 'sa-sidebar-section';
                s.textContent = item.section;
                nav.appendChild(s);
                return;
            }
            const a = document.createElement('a');
            a.className = 'sa-sidebar-link';
            a.href = item.href;
            a.dataset.menu = item.id;
            // Oculto hasta confirmar permisos (no aparece ni un instante para quien no tiene acceso)
            if (item.ocultarSinPermiso) a.hidden = true;
            a.innerHTML = `<i class="fa-solid ${item.icon}" aria-hidden="true"></i><span></span>`;
            a.querySelector('span').textContent = item.label;
            if (esActivo(item)) {
                a.classList.add('active');
                a.setAttribute('aria-current', 'page');
            }
            nav.appendChild(a);
        });


        aside.appendChild(nav);
        return aside;
    }

    function build() {
        if (built) return;
        built = true;

        const body = document.body;
        body.classList.add('sa-has-layout');

        // Todo el contenido propio de la página pasa al panel derecho
        const content = document.createElement('div');
        content.className = 'sa-content';
        while (body.firstChild) content.appendChild(body.firstChild);

        body.appendChild(buildNavbar());
        startClock();
        body.appendChild(buildSidebar());
        body.appendChild(content);
        setupMenuMovil();

        // Mientras llega la verificación, mostrar lo que ya se conoce
        if (pendingProfile) {
            applyUser(pendingProfile);
        } else {
            const nombre = localStorage.getItem('activeUser');
            const rol = localStorage.getItem('activeUserRole');
            let roles = null;
            try { roles = JSON.parse(localStorage.getItem('activeUserRoles') || 'null'); } catch (e) { roles = null; }
            if (nombre && rol) applyUser({ nombre, rol, roles });
        }
    }

    /**
     * Celular: el menú lateral se abre como panel deslizable con el botón ☰.
     * Se cierra al elegir un módulo, con Esc, tocando el fondo oscuro o al
     * pasar a pantalla grande (ahí el menú siempre está visible).
     */
    function setupMenuMovil() {
        const btn = document.getElementById('sa-menu-btn');
        const aside = document.getElementById('sa-sidebar');
        if (!btn || !aside) return;

        const fondo = document.createElement('div');
        fondo.className = 'sa-menu-fondo';
        document.body.appendChild(fondo);

        const abrir = (si) => {
            document.body.classList.toggle('sa-menu-abierto', si);
            btn.setAttribute('aria-expanded', si ? 'true' : 'false');
            btn.setAttribute('aria-label', si ? 'Cerrar menú' : 'Abrir menú');
            btn.querySelector('i').className = si ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
            if (si) {
                const primero = aside.querySelector('.sa-sidebar-link:not([hidden])');
                if (primero) primero.focus();
            }
        };

        btn.addEventListener('click', () => abrir(!document.body.classList.contains('sa-menu-abierto')));
        fondo.addEventListener('click', () => abrir(false));
        aside.addEventListener('click', (e) => { if (e.target.closest('.sa-sidebar-link')) abrir(false); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('sa-menu-abierto')) {
                abrir(false);
                btn.focus();
            }
        });
        window.matchMedia('(min-width: 768px)').addEventListener('change', (m) => { if (m.matches) abrir(false); });
    }

    // Fecha (día/mes) y hora en el navbar, p. ej. "08/11 · 1:47 p. m."
    function startClock() {
        const el = document.getElementById('sa-clock');
        if (!el) return;

        const update = () => {
            const now = new Date();
            const dia = String(now.getDate()).padStart(2, '0');
            const mes = String(now.getMonth() + 1).padStart(2, '0');
            const hora = now.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit', hour12: true });
            el.textContent = `${dia}/${mes} · ${hora}`;
            el.dateTime = now.toISOString();
            el.title = now.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        };

        update();
        // Actualizar justo al cambiar el minuto y luego cada minuto
        setTimeout(() => {
            update();
            setInterval(update, 60000);
        }, (60 - new Date().getSeconds()) * 1000);
    }

    function applyUser(profile) {
        const session = window.AppSession;
        const rol = profile.rol || '';
        // Todos sus roles (una persona puede tener varios); los permisos se suman
        const roles = session ? session.rolesDe(profile) : [rol];
        const rolesNorm = roles.map(r => session ? session.normalizarRol(r) : String(r).toLowerCase());

        const nameEl = document.getElementById('sa-user-name');
        if (nameEl) nameEl.textContent = profile.nombre || 'Usuario';

        // Accesos del navbar (mismas reglas que tenía el dashboard)
        const esTI = rolesNorm.some(r => r === 'soporte ti' || r === 'soporte ti / programador');
        const sheets = document.getElementById('sa-nav-sheets');
        const backup = document.getElementById('sa-nav-backup');
        if (sheets) sheets.hidden = false;
        if (backup) backup.hidden = !(rolesNorm.includes('dueno') || esTI);

        // Menú lateral: atenuar los módulos sin permiso (mismas reglas que auth_guard.js)
        MENU.forEach(item => {
            if (!item.id || !item.rutas) return;
            const link = document.querySelector(`.sa-sidebar-link[data-menu="${item.id}"]`);
            if (!link) return;
            const permitido = !session || session.puedeAcceder(roles, item.rutas[0]);
            if (item.ocultarSinPermiso) {
                link.hidden = !permitido;
                return;
            }
            link.classList.toggle('disabled', !permitido);
            if (permitido) {
                link.removeAttribute('aria-disabled');
                link.removeAttribute('tabindex');
            } else {
                link.setAttribute('aria-disabled', 'true');
                link.setAttribute('tabindex', '-1');
            }
        });
    }

    window.SaLayout = {
        hideSkeleton,
        setUser(profile) {
            if (!profile) return;
            if (built) applyUser(profile);
            else pendingProfile = profile;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();

/* ==========================================================================
   Notificaciones propias del sistema (reemplazan alert() y confirm())
   --------------------------------------------------------------------------
   SaNotificar.aviso('Texto', 'exito' | 'error' | 'advertencia' | 'info', { titulo, duracion })
   const ok = await SaNotificar.confirmar({ titulo, mensaje, textoConfirmar, peligro })

   - aviso(): tarjeta abajo a la derecha que se cierra sola (o con la X).
   - confirmar(): ventana propia con Cancelar / Confirmar; devuelve true o false.
     El foco queda en Cancelar para no confirmar por accidente con Enter.
   - window.alert queda redirigido a aviso() como red de seguridad: ningún
     módulo debe mostrar la ventana gris del navegador.
   Estilos en css/layout.css (.sa-notif-*, .sa-confirm-*).
   ========================================================================== */
(function () {
    'use strict';

    const ICONOS = {
        exito: 'fa-circle-check',
        error: 'fa-triangle-exclamation',
        advertencia: 'fa-circle-exclamation',
        info: 'fa-circle-info'
    };
    const TITULOS = { exito: 'Listo', error: 'Error', advertencia: 'Atención', info: 'Aviso' };

    function contenedor() {
        let c = document.getElementById('sa-notif-stack');
        if (!c) {
            c = document.createElement('div');
            c.id = 'sa-notif-stack';
            c.className = 'sa-notif-stack';
            c.setAttribute('aria-live', 'polite');
            (document.body || document.documentElement).appendChild(c);
        }
        return c;
    }

    function aviso(mensaje, tipo = 'info', opciones = {}) {
        if (!ICONOS[tipo]) tipo = 'info';
        const crear = () => {
            const n = document.createElement('div');
            n.className = `sa-notif sa-notif-${tipo}`;
            n.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
            n.innerHTML = `
                <i class="fa-solid ${ICONOS[tipo]} sa-notif-icono" aria-hidden="true"></i>
                <div class="sa-notif-texto"><strong></strong><span></span></div>
                <button type="button" class="sa-notif-cerrar" aria-label="Cerrar aviso"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
            n.querySelector('strong').textContent = opciones.titulo || TITULOS[tipo];
            n.querySelector('span').textContent = String(mensaje == null ? '' : mensaje);

            const quitar = () => {
                n.classList.add('is-saliendo');
                setTimeout(() => n.remove(), 200);
            };
            n.querySelector('.sa-notif-cerrar').addEventListener('click', quitar);
            contenedor().appendChild(n);
            requestAnimationFrame(() => n.classList.add('is-visible'));
            const duracion = opciones.duracion || (tipo === 'error' ? 6000 : 4000);
            setTimeout(quitar, duracion);
        };
        if (document.body) crear();
        else document.addEventListener('DOMContentLoaded', crear, { once: true });
    }

    let dialogo = null;
    function crearDialogo() {
        dialogo = document.createElement('dialog');
        dialogo.className = 'sa-confirm';
        dialogo.setAttribute('aria-labelledby', 'sa-confirm-titulo');
        dialogo.innerHTML = `
            <form method="dialog" class="sa-confirm-caja">
                <h2 id="sa-confirm-titulo"></h2>
                <p class="sa-confirm-mensaje"></p>
                <div class="sa-confirm-botones">
                    <button type="submit" value="no" class="sa-confirm-btn sa-confirm-cancelar">Cancelar</button>
                    <button type="submit" value="si" class="sa-confirm-btn sa-confirm-ok">Confirmar</button>
                </div>
            </form>`;
        dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close('no'); });
        document.body.appendChild(dialogo);
    }

    function confirmar(opciones = {}) {
        if (typeof opciones === 'string') opciones = { mensaje: opciones };
        if (!dialogo) crearDialogo();
        dialogo.querySelector('h2').textContent = opciones.titulo || '¿Confirmar?';
        dialogo.querySelector('.sa-confirm-mensaje').textContent = opciones.mensaje || '';
        const ok = dialogo.querySelector('.sa-confirm-ok');
        ok.textContent = opciones.textoConfirmar || 'Confirmar';
        ok.classList.toggle('is-peligro', !!opciones.peligro);
        dialogo.returnValue = 'no';
        return new Promise((resolve) => {
            dialogo.addEventListener('close', () => resolve(dialogo.returnValue === 'si'), { once: true });
            dialogo.showModal();
            dialogo.querySelector('.sa-confirm-cancelar').focus();
        });
    }

    window.SaNotificar = { aviso, confirmar };

    // Red de seguridad: si algún módulo aún llama alert(), se muestra como aviso del sistema
    window.alert = (mensaje) => aviso(mensaje, 'advertencia');
})();
