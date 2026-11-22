// Admin › Analítica comercial. Lee /api/admin/products?resource=analytics
// (GA4 en el servidor + ventas confirmadas del POS, solo lectura) y pinta el
// panel. Nunca muestra cifras inventadas: sin GA4 configurado, las secciones
// de GA4 explican qué falta y solo se muestran las fuentes reales disponibles.

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nf = new Intl.NumberFormat("es-CO");
const n = (v) => nf.format(Math.round(Number(v) || 0));
const money = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(v) || 0);
const pct = (v) => (v == null || !Number.isFinite(v) ? "—" : `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(v * 100)} %`);
const fmtDate = (ymd, opts = { day: "numeric", month: "short" }) => new Date(ymd + "T12:00:00Z").toLocaleDateString("es-CO", { ...opts, timeZone: "UTC" });
const fmtRange = (a, b) => (a === b ? fmtDate(a, { day: "numeric", month: "short", year: "numeric" }) : `${fmtDate(a)} – ${fmtDate(b, { day: "numeric", month: "short", year: "numeric" })}`);

const RANGES = [["today", "Hoy"], ["7d", "7 días"], ["30d", "30 días"], ["90d", "90 días"], ["custom", "Personalizado"]];
const DEVICE = { desktop: "Computador", mobile: "Celular", tablet: "Tableta", "smart tv": "Televisor" };
const CHANNEL = { Direct: "Directo", "Organic Social": "Redes sociales (orgánico)", "Paid Social": "Redes sociales (pagado)", "Organic Search": "Búsqueda orgánica", "Paid Search": "Búsqueda pagada", Referral: "Referencias externas", Email: "Correo", "Organic Shopping": "Shopping orgánico", "Organic Video": "Video orgánico", Display: "Display", Unassigned: "Sin asignar", "Cross-network": "Varias redes", SMS: "SMS", Affiliates: "Afiliados", "Mobile Push Notifications": "Notificaciones" };
const SERIES_METRICS = [["activeUsers", "Usuarios activos"], ["sessions", "Sesiones"], ["screenPageViews", "Vistas de página"]];

let st = { range: "7d", start: "", end: "", data: null, loading: false, error: null, metric: "activeUsers", classMode: "current", group: "", category: "", q: "", sort: "views", showAll: false, noViews: false, openId: null };
let deps = null; // { adminFetch, onUnauthorized }

function delta(cur, prev) {
  if (!prev) return `<span class="an-delta an-delta-na">Sin datos del período anterior</span>`;
  const d = (cur - prev) / prev;
  const cls = d > 0.0005 ? "an-up" : d < -0.0005 ? "an-down" : "an-flat";
  const arrow = cls === "an-up" ? "▲" : cls === "an-down" ? "▼" : "＝";
  return `<span class="an-delta ${cls}"><span aria-hidden="true">${arrow}</span> ${pct(Math.abs(d))} <span class="an-delta-vs">vs. período anterior (${n(prev)})</span></span>`;
}

function kpi(label, value, help, cur, prev, fmt = n) {
  const missing = value === null || value === undefined;
  return `<div class="an-kpi"><span class="an-kpi-label">${esc(label)}</span><b>${missing ? "—" : fmt(value)}</b>${missing ? `<span class="an-delta an-delta-na">Sin datos de la fuente</span>` : cur != null ? delta(cur, prev) : ""}${help ? `<small>${esc(help)}</small>` : ""}</div>`;
}

function card(title, body, { sub = "", id = "", wide = false } = {}) {
  return `<section class="an-card${wide ? " an-wide" : ""}"${id ? ` id="${id}"` : ""}><header class="an-card-head"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ""}</header>${body}</section>`;
}

function empty(text) {
  return `<p class="an-empty">${esc(text)}</p>`;
}

// Barras horizontales de una sola serie (magnitud). rows: [{ label, value, note? }].
function bars(rows, { fmt = n, max = null } = {}) {
  const list = rows.filter((r) => r.value > 0);
  if (!list.length) return empty("Sin datos en este período.");
  const top = max || Math.max(...list.map((r) => r.value));
  return `<ul class="an-bars">${list.map((r) => `<li title="${esc(r.label)}: ${esc(fmt(r.value))}${r.note ? " · " + esc(r.note) : ""}">
    <span class="an-bar-label">${esc(r.label)}</span>
    <span class="an-bar-track"><span class="an-bar-fill" style="width:${Math.max(1.5, (r.value / top) * 100).toFixed(1)}%"></span></span>
    <span class="an-bar-value">${esc(fmt(r.value))}${r.note ? `<small>${esc(r.note)}</small>` : ""}</span>
  </li>`).join("")}</ul>`;
}

// Línea de evolución: período actual (rosa) vs. anterior (gris, discontinua),
// alineados por día del período. Tooltip con cruz al pasar el cursor.
function lineChart(series, metric, width = 720) {
  const cur = series.actual || [];
  const prev = series.anterior || [];
  if (!cur.length || !cur.some((d) => d[metric] > 0) && !prev.some((d) => d[metric] > 0)) return empty("Sin datos en este período.");
  const W = Math.max(280, Math.round(width)), H = 220, L = 44, R = 12, T = 12, B = 28;
  const len = Math.max(cur.length, prev.length);
  const maxV = Math.max(1, ...cur.map((d) => d[metric]), ...prev.map((d) => d[metric]));
  const nice = Math.pow(10, Math.floor(Math.log10(maxV)));
  const top = Math.ceil(maxV / nice) * nice;
  const x = (i) => L + (len === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (len - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const path = (arr) => arr.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[metric]).toFixed(1)}`).join("");
  const ticks = [0, top / 2, top];
  const step = Math.max(1, Math.ceil(len / 6));
  const xLabels = cur.map((d, i) => (i % step === 0 || i === cur.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(fmtDate(d.date))}</text>` : "")).join("");
  return `<div class="an-line" data-len="${len}" data-w="${W}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución diaria del período actual comparada con el anterior">
      ${ticks.map((t) => `<line class="an-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="an-ytick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${n(t)}</text>`).join("")}
      ${prev.length ? `<path class="an-prev" d="${path(prev)}"/>` : ""}
      <path class="an-cur" d="${path(cur)}"/>
      ${len <= 31 ? cur.map((d, i) => `<circle class="an-dot" cx="${x(i)}" cy="${y(d[metric])}" r="3"/>`).join("") : ""}
      <g class="an-xticks">${xLabels}</g>
      <line class="an-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <rect class="an-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    </svg>
    <div class="an-tip" hidden></div>
  </div>`;
}

function bindLineChart(root, series, metric, label, fmt = n) {
  const box = root && root.classList && root.classList.contains("an-line") ? root : $(".an-line", root);
  if (!box) return;
  const svg = $("svg", box), tip = $(".an-tip", box), cross = $(".an-cross", box), hit = $(".an-hit", box);
  const cur = series.actual || [], prev = series.anterior || [];
  const len = Number(box.dataset.len);
  const W = Number(box.dataset.w), L = 44, R = 12;
  const move = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(len - 1, Math.round(((vx - L) / (W - L - R)) * (len - 1))));
    const cx = L + (len === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (len - 1));
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
    const c = cur[i], p = prev[i];
    tip.innerHTML = `<b>${esc(label)}</b>${c ? `<span><i class="an-sw an-sw-cur"></i>${esc(fmtDate(c.date, { weekday: "short", day: "numeric", month: "short" }))}: <b>${fmt(c[metric])}</b></span>` : ""}${p ? `<span><i class="an-sw an-sw-prev"></i>${esc(fmtDate(p.date, { weekday: "short", day: "numeric", month: "short" }))}: ${fmt(p[metric])}</span>` : ""}`;
    tip.hidden = false;
    const left = ((cx / W) * r.width);
    tip.style.left = `${Math.min(Math.max(left, 80), r.width - 80)}px`;
  };
  // En pantallas táctiles el navegador emite un «mouseleave» justo después
  // del toque: se ignora para que el detalle quede visible tras tocar.
  let lastTouch = 0;
  hit.addEventListener("mousemove", (e) => move(e.clientX));
  hit.addEventListener("touchstart", (e) => { lastTouch = Date.now(); move(e.touches[0].clientX); }, { passive: true });
  hit.addEventListener("click", (e) => move(e.clientX));
  hit.addEventListener("mouseleave", () => {
    if (Date.now() - lastTouch < 1000) return;
    tip.hidden = true;
    cross.setAttribute("visibility", "hidden");
  });
}

// Ancho disponible para el gráfico (card del resumen, sin su relleno).
function chartWidth() {
  const root = $("#analyticsRoot");
  const w = root ? root.clientWidth : 720;
  return (w || 720) - (window.innerWidth <= 720 ? 34 : 46);
}

// ── Secciones ───────────────────────────────────────────────────────────
function configSection(d) {
  const miss = d.configured.missing;
  const what = {
    GA4_MEASUREMENT_ID: "el ID de medición del flujo web (empieza por «G-»), para que la tienda registre las visitas",
    GA4_PROPERTY_ID: "el ID numérico de la propiedad de GA4, para consultar los informes",
    GA4_SERVICE_ACCOUNT_KEY: "la clave JSON de una cuenta de servicio con acceso de «Lector» a la propiedad",
  };
  return `<section class="an-card an-wide an-setup" role="status">
    <header class="an-card-head"><h2>Google Analytics 4 aún no está conectado</h2>
    <p>Las secciones de tráfico, productos, vitrinas y embudo se llenan con datos reales de GA4 en cuanto se configure. Las ventas confirmadas del POS ya están disponibles más abajo.</p></header>
    <p class="an-setup-lead">Falta configurar en Vercel (Settings › Environment Variables):</p>
    <ul class="an-setup-list">${miss.map((k) => `<li><code>${esc(k)}</code> — ${esc(what[k] || "")}</li>`).join("")}</ul>
    <p class="an-note">GA4 empieza a medir desde el día en que se activa: no existen datos de visitas anteriores.</p>
  </section>`;
}

function ga4ErrorSection(err) {
  return `<section class="an-card an-wide an-error" role="alert"><header class="an-card-head"><h2>No se pudo consultar Google Analytics</h2><p>${esc(err.message)}</p></header>
    <button type="button" class="button" data-an-refresh>Reintentar</button><p class="an-note">Las ventas confirmadas del POS (abajo) no dependen de GA4.</p></section>`;
}

function overviewSection(g, d) {
  const t = g ? g.totals.actual : null, p = g ? g.totals.anterior : null;
  const ev = (k) => (g ? g.events[k].count : null), evp = (k) => (g ? g.eventsPrevious[k].count : null);
  const nvr = g ? Object.fromEntries(g.newVsReturning.map((x) => [x.type, x.activeUsers])) : {};
  const s = d.sales && !d.sales.error ? d.sales : null;
  return card("A. Resumen general", `<div class="an-kpis">
      ${kpi("Visitantes", t ? t.totalUsers : null, "Personas distintas que visitaron el catálogo.", t && t.totalUsers, p && p.totalUsers)}
      ${kpi("Usuarios nuevos", g ? nvr.new ?? 0 : null, "Visitaron por primera vez en el período.")}
      ${kpi("Usuarios recurrentes", g ? nvr.returning ?? 0 : null, "Ya habían visitado antes.")}
      ${kpi("Sesiones", t ? t.sessions : null, "Visitas: una persona puede tener varias.", t && t.sessions, p && p.sessions)}
      ${kpi("Vistas de página", t ? t.screenPageViews : null, "Páginas cargadas en total.", t && t.screenPageViews, p && p.screenPageViews)}
      ${kpi("Productos consultados", ev("view_item"), "Fichas de producto abiertas.", ev("view_item"), evp("view_item"))}
      ${kpi("Solicitudes de pedido", ev("generate_lead"), "Pedidos enviados desde el catálogo. No son ventas.", ev("generate_lead"), evp("generate_lead"))}
      ${kpi("Clics en WhatsApp", ev("contact_whatsapp"), "Contactos iniciados. No son ventas.", ev("contact_whatsapp"), evp("contact_whatsapp"))}
      ${kpi("Unidades vendidas (POS)", s ? s.current.units : null, "Ventas confirmadas del POS, todos los canales. Fuente independiente de GA4.", s && s.current.units, s && s.previous.units)}
    </div>${g ? "" : `<p class="an-note">Los indicadores de navegación mostrarán datos cuando GA4 esté conectado; las unidades vendidas ya provienen del POS.</p>`}`, { id: "anA", wide: true, sub: `Comparado con los ${esc(String(d.range.days))} días anteriores.` });
}

function trafficSection(g, d) {
  const dev = g.devices.map((x) => ({ label: DEVICE[x.device] || x.device, value: x.activeUsers }));
  const ch = g.channels.map((c) => ({ label: CHANNEL[c.channel] || c.channel, value: c.sessions, note: c.previousSessions ? `antes ${n(c.previousSessions)}` : "" }));
  const src = g.sources.length
    ? `<div class="an-table-wrap"><table class="an-table"><thead><tr><th>Fuente</th><th>Medio</th><th>Campaña (UTM)</th><th class="num">Sesiones</th><th class="num">Usuarios</th></tr></thead><tbody>${g.sources.map((s) => `<tr><td>${esc(s.source)}</td><td>${esc(s.medium)}</td><td>${s.campaign ? esc(s.campaign) : '<span class="an-muted">—</span>'}</td><td class="num">${n(s.sessions)}</td><td class="num">${n(s.activeUsers)}</td></tr>`).join("")}</tbody></table></div>`
    : empty("Sin datos en este período.");
  return card("B. Tráfico y visitantes", `
    <div class="an-chart-head">
      <h3>Evolución diaria</h3>
      <div class="an-seg" role="tablist" aria-label="Métrica del gráfico">${SERIES_METRICS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === st.metric}" class="an-seg-btn${k === st.metric ? " active" : ""}" data-an-metric="${k}">${esc(l)}</button>`).join("")}</div>
      <p class="an-legend"><span><i class="an-sw an-sw-cur"></i>${esc(fmtRange(d.range.start, d.range.end))}</span><span><i class="an-sw an-sw-prev"></i>Período anterior (${esc(fmtRange(d.range.previousStart, d.range.previousEnd))})</span></p>
    </div>
    <div id="anTrafficChart">${lineChart(g.series, st.metric, chartWidth())}</div>
    <div class="an-cols"><div><h3>Dispositivos <small>(usuarios activos)</small></h3>${bars(dev)}</div><div><h3>Ubicación aproximada <small>(usuarios activos)</small></h3>${bars(g.geo.map((x) => ({ label: x.city ? `${x.city}, ${x.country}` : x.country, value: x.activeUsers })))}</div></div>
    <div class="an-cols"><div><h3>Canales de adquisición <small>(sesiones)</small></h3>${bars(ch)}</div><div><h3>Fuentes, medios y campañas</h3>${src}</div></div>
    <p class="an-note">Las campañas aparecen cuando los enlaces llevan parámetros UTM (por ejemplo <code>?utm_source=instagram&amp;utm_medium=social&amp;utm_campaign=navidad</code>).</p>`, { id: "anB", wide: true, sub: "Usuarios = personas; sesiones = visitas; vistas = páginas cargadas." });
}

function acquisitionSectionUnused(g) {
  const ch = g.channels.map((c) => ({ label: CHANNEL[c.channel] || c.channel, value: c.sessions, note: c.previousSessions ? `antes ${n(c.previousSessions)}` : "" }));
  const src = g.sources.length
    ? `<div class="an-table-wrap"><table class="an-table"><thead><tr><th>Fuente</th><th>Medio</th><th>Campaña (UTM)</th><th class="num">Sesiones</th><th class="num">Usuarios</th></tr></thead><tbody>${g.sources.map((s) => `<tr><td>${esc(s.source)}</td><td>${esc(s.medium)}</td><td>${s.campaign ? esc(s.campaign) : '<span class="an-muted">—</span>'}</td><td class="num">${n(s.sessions)}</td><td class="num">${n(s.activeUsers)}</td></tr>`).join("")}</tbody></table></div>`
    : empty("Sin datos en este período.");
  return card("Tráfico y adquisición", `<div class="an-cols"><div><h3>Canales <small>(sesiones)</small></h3>${bars(ch)}</div><div><h3>Fuentes, medios y campañas</h3>${src}</div></div>
    <p class="an-note">Las campañas aparecen cuando los enlaces llevan parámetros UTM (por ejemplo <code>?utm_source=instagram&amp;utm_medium=social&amp;utm_campaign=navidad</code>).</p>`, { wide: true });
}

function productsSection(g, d) {
  const groups = [...new Set(d.catalog.map((c) => c.group))].sort();
  const cats = [...new Set(d.catalog.filter((c) => !st.group || c.group === st.group).map((c) => c.category).filter(Boolean))].sort();
  let rows = g.products.filter((p) => (!st.group || p.group === st.group) && (!st.category || p.category === st.category));
  if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter((p) => p.name.toLowerCase().includes(q) || String(p.id) === q); }
  if (st.noViews) rows = rows.filter((p) => p.views === 0);
  const sorters = { views: (a, b) => b.views - a.views || b.adds - a.adds, interactions: (a, b) => (b.listClicks + b.adds) - (a.listClicks + a.adds) || b.views - a.views, least: (a, b) => a.views - b.views || a.adds - b.adds || a.name.localeCompare(b.name), sold: (a, b) => b.unitsSold - a.unitsSold || b.views - a.views };
  rows = [...rows].sort(sorters[st.sort]);
  const shown = st.showAll ? rows : rows.slice(0, 15);
  const table = rows.length ? `<div class="an-table-wrap"><table class="an-table an-products"><thead><tr><th>Producto</th><th>Clasificación vigente</th><th class="num">Vistas de ficha</th><th class="num">Antes</th><th class="num">Clics en listas</th><th class="num">Agregados al carrito</th><th class="num">Unidades vendidas <small>(POS)</small></th></tr></thead><tbody>
    ${shown.map((p) => `<tr class="an-prow" data-an-open="${p.id}" tabindex="0" aria-expanded="${st.openId === p.id}"><td><b>${esc(p.name)}</b> <span class="an-muted">#${p.id}</span></td><td>${esc([p.group, p.category, p.subcategory].filter(Boolean).join(" › "))}${p.reclassified ? `<small class="an-hist" title="${esc(p.classifiedAs.map((c) => c.filter(Boolean).join(" › ")).join(" | "))}">Tenía otra clasificación en parte del período</small>` : ""}</td><td class="num">${n(p.views)}</td><td class="num an-muted">${n(p.prevViews || 0)}</td><td class="num">${n(p.listClicks)}</td><td class="num">${n(p.adds)}</td><td class="num">${n(p.unitsSold)}</td></tr>${st.openId === p.id ? productDetail(p) : ""}`).join("")}
    </tbody></table></div>${rows.length > 15 ? `<button type="button" class="an-link" data-an-showall>${st.showAll ? "Ver menos" : `Ver los ${rows.length} productos`}</button>` : ""}` : empty("Ningún producto publicado coincide con el filtro.");

  const current = st.classMode === "current";
  const groupRows = current ? g.groupsCurrent.map((x) => ({ label: x.key, value: x.views, note: `antes ${n(x.prevViews)} · ${n(x.adds)} al carrito` })) : aggregateEvent(g.categoriesAtEvent, (c) => c.group);
  const catRows = current
    ? g.categoriesCurrent.filter((x) => !st.group || x.key.startsWith(st.group + "›")).map((x) => ({ label: x.key.replace("›", " › "), value: x.views, note: `antes ${n(x.prevViews)} · ${n(x.adds)} al carrito` }))
    : g.categoriesAtEvent.filter((x) => !st.group || x.group === st.group).map((x) => ({ label: `${x.group} › ${x.category}`, value: x.views, note: `${n(x.adds)} al carrito` }));
  const subRows = g.subcategoriesCurrent.filter((x) => !st.group || x.key.startsWith(st.group + "›")).slice(0, 12).map((x) => ({ label: x.key.split("›").slice(1).join(" › "), value: x.views }));

  return card("C. Productos y categorías", `
    <div class="an-filters">
      <label>Grupo<select data-an-filter="group"><option value="">Todos</option>${groups.map((x) => `<option${x === st.group ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label>Categoría<select data-an-filter="category"><option value="">Todas</option>${cats.map((x) => `<option${x === st.category ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="an-grow">Producto<input type="search" data-an-filter="q" value="${esc(st.q)}" placeholder="Nombre o #id"></label>
      <label class="an-check"><input type="checkbox" data-an-filter="noViews"${st.noViews ? " checked" : ""}> Solo publicados sin visitas</label>
      <label>Ordenar<select data-an-filter="sort">${[["views", "Más vistos"], ["interactions", "Más interacciones"], ["least", "Menos consultados"], ["sold", "Más vendidos (POS)"]].map(([k, l]) => `<option value="${k}"${k === st.sort ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    ${table}
    <div class="an-chart-head"><h3>Interés por grupo y categoría <small>(vistas de ficha)</small></h3>
      <div class="an-seg" role="tablist" aria-label="Clasificación">${[["current", "Clasificación vigente"], ["event", "Al momento del evento"]].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === st.classMode}" class="an-seg-btn${k === st.classMode ? " active" : ""}" data-an-class="${k}">${l}</button>`).join("")}</div></div>
    <p class="an-note">${current ? "Las cifras de cada producto sumadas según su clasificación actual." : "La clasificación que tenía cada producto cuando ocurrió la visita (GA4 la conserva tal cual; nunca se reescribe)."}</p>
    <div class="an-cols"><div><h3>Grupos</h3>${bars(groupRows)}</div><div><h3>Categorías</h3>${bars(catRows.slice(0, 12))}</div></div>
    <div class="an-cols">
      <div><h3>Subcategorías más consultadas <small>(vigente)</small></h3>${bars(subRows)}</div>
      <div><h3>Clics en grupos y categorías del catálogo</h3>${bars(g.categoryClicks.slice(0, 12).map((c) => ({ label: c.path.replaceAll("›", " › "), value: c.clicks })))}</div>
    </div>
    <div><h3>Búsquedas en el catálogo</h3>${g.searches.length ? `<ul class="an-chips">${g.searches.map((s) => `<li><span>${esc(s.term)}</span><b>${n(s.count)}</b></li>`).join("")}</ul>` : empty("Sin búsquedas en este período.")}</div>
    <p class="an-note">Solo productos publicados hoy (${n(d.publishedProducts)}). ${g.excludedItemRows ? `${n(g.excludedItemRows)} fila(s) de GA4 de productos que hoy no están publicados quedaron fuera.` : ""}</p>`, { id: "anC", wide: true });
}

function productDetail(p) {
  const hist = p.classifiedAs.length ? p.classifiedAs.map((c) => c.filter(Boolean).join(" › ") || "(sin clasificación)").join("; ") : "Sin eventos en el período";
  const ctr = p.listImpressions ? pct(p.listClicks / p.listImpressions) : "—";
  return `<tr class="an-pdetail"><td colspan="7"><dl class="an-dl">
    <div><dt>Clasificación vigente</dt><dd>${esc([p.group, p.category, p.subcategory].filter(Boolean).join(" › "))}</dd></div>
    <div><dt>Clasificación al momento de los eventos</dt><dd>${esc(hist)}</dd></div>
    <div><dt>Vistas de ficha</dt><dd>${n(p.views)} (período anterior: ${n(p.prevViews || 0)})</dd></div>
    <div><dt>Mostrado en listas / clics</dt><dd>${n(p.listImpressions)} / ${n(p.listClicks)} · tasa de clic ${ctr}</dd></div>
    <div><dt>Agregado al carrito</dt><dd>${n(p.adds)}</dd></div>
    <div><dt>Unidades vendidas (POS)</dt><dd>${n(p.unitsSold)} <span class="an-muted">— fuente independiente</span></dd></div>
  </dl></td></tr>`;
}

function aggregateEvent(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); const e = m.get(k) || m.set(k, { label: k, value: 0, adds: 0 }).get(k); e.value += r.views; e.adds += r.adds; }
  return [...m.values()].sort((a, b) => b.value - a.value).map((e) => ({ ...e, note: `${n(e.adds)} al carrito` }));
}

function showcasesSection(g) {
  const rate = (c, i) => (i > 0 ? pct(c / i) : "—");
  const rows = g.showcases;
  const listRows = rows.filter((s) => s.id !== "banner");
  const table = `<div class="an-table-wrap"><table class="an-table an-showcases"><thead><tr><th>Vitrina</th><th class="num">Productos mostrados</th><th class="num">Clics en productos</th><th class="num">Tasa de clic</th><th class="num">Fichas vistas desde aquí</th><th class="num">Agregados al carrito</th><th class="num">Tarjetas mostradas</th><th class="num">Clics en tarjetas</th></tr></thead><tbody>
    ${listRows.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td class="num">${n(s.productImpressions)}</td><td class="num">${n(s.productClicks)}</td><td class="num">${rate(s.productClicks, s.productImpressions)}</td><td class="num">${n(s.productsViewed)}</td><td class="num">${n(s.addsToCart)}</td><td class="num">${s.id === "colecciones" || s.id === "descubre" ? n(s.tileImpressions) : '<span class="an-muted">—</span>'}</td><td class="num">${s.id === "colecciones" || s.id === "descubre" ? n(s.tileClicks) : '<span class="an-muted">—</span>'}</td></tr>`).join("")}
  </tbody></table></div>`;
  const pieces = rows.filter((s) => s.pieces.length).map((s) => `<div><h3>${esc(s.name)} <small>(piezas)</small></h3>${bars(s.pieces.slice(0, 8).map((p) => ({ label: p.name, value: p.clicks, note: `${n(p.impressions)} vistas · ${rate(p.clicks, p.impressions)}` })))}</div>`).join("");
  const top = listRows.filter((s) => ["novedades", "mas_elegidos", "destacados", "ofertas", "colecciones", "descubre"].includes(s.id)).map((s) => ({ label: s.name, value: s.productClicks + s.tileClicks }));
  return card("E. Vitrinas comerciales", `
    <div class="an-cols"><div><h3>Clics por vitrina <small>(productos + tarjetas)</small></h3>${bars(top)}</div><div class="an-explain">
      <p><b>Productos mostrados:</b> productos de la vitrina que estuvieron en pantalla.</p>
      <p><b>Tasa de clic:</b> clics ÷ productos mostrados.</p>
      <p><b>Colecciones VIBE y Descubre tu VIBE</b> llevan al catálogo filtrado: sus columnas de productos cuentan lo que se miró después de entrar por ellas.</p>
    </div></div>
    ${table}
    ${pieces ? `<div class="an-cols">${pieces}</div>` : ""}`, { id: "anE", wide: true });
}

function funnelSection(g, d) {
  const steps = g.funnel;
  const base = steps[0].users || 0;
  const sales = d.sales && !d.sales.error ? d.sales.current : null;
  const body = base
    ? `<ol class="an-funnel">${steps.map((s, i) => {
        const prev = i ? steps[i - 1].users : null;
        const adv = prev ? s.users / prev : null;
        return `<li><span class="an-f-label">${i + 1}. ${esc(s.label)}</span><span class="an-bar-track"><span class="an-bar-fill" style="width:${Math.max(1.5, (s.users / base) * 100).toFixed(1)}%"></span></span><span class="an-f-value"><b>${n(s.users)}</b> personas${s.id === "contact_whatsapp" ? `<small>${pct(base ? s.users / base : null)} de los visitantes</small>` : i ? (adv == null || adv > 1 ? "<small>avance — (etapa no secuencial)</small>" : `<small>avance ${pct(adv)} · abandono ${pct(1 - adv)}</small>`) : "<small>base del embudo</small>"}</span></li>`;
      }).join("")}</ol>`
    : empty("Sin visitas registradas en este período.");
  return card("D. Embudo de compra", `${body}
    <div class="an-side">
      <div class="an-kpi"><span class="an-kpi-label">Solicitudes de pedido</span><b>${n(g.events.generate_lead.count)}</b><small>Pedidos enviados. No son ventas: la venta se confirma después con la clienta.</small></div>
      <div class="an-kpi"><span class="an-kpi-label">Ventas confirmadas (POS)</span><b>${sales ? n(sales.sales) : "—"}</b><small>Otra fuente, todos los canales. No se atribuye a visitas.</small></div>
    </div>
    <p class="an-note">Cada etapa cuenta personas que hicieron esa acción al menos una vez en el período. Avance = etapa ÷ etapa anterior. El clic en WhatsApp puede ocurrir sin pasar por las demás etapas.</p>`, { id: "anD", wide: true });
}

function salesSection(d) {
  const s = d.sales, o = d.orders;
  if (!s || s.error) return card("F. Ventas reales del POS", `<p class="field-error">${esc((s && s.error) || "No disponible.")}</p>`, { id: "anF", wide: true });
  const c = s.current, p = s.previous;
  const days = [];
  for (let i = 0; i < d.range.days; i++) {
    const cur = new Date(Date.parse(d.range.start + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10);
    const prev = new Date(Date.parse(d.range.previousStart + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10);
    days.push([cur, prev]);
  }
  const series = { actual: days.map(([x]) => ({ date: x, units: c.unitsByDay[x] || 0 })), anterior: days.map(([, y]) => ({ date: y, units: p.unitsByDay[y] || 0 })) };
  const byId = new Map(d.catalog.map((x) => [x.id, x]));
  const prodRows = Object.entries(s.unitsByProduct || {}).map(([id, u]) => ({ id: Number(id), units: u, info: byId.get(Number(id)) })).sort((a, b) => b.units - a.units);
  const catMap = new Map();
  for (const r of prodRows) { const k = r.info ? `${r.info.group} › ${r.info.category || "(sin categoría)"}` : "No publicados en el catálogo"; catMap.set(k, (catMap.get(k) || 0) + r.units); }
  const ch = Object.entries(c.byChannel).map(([k, val]) => ({ label: k, value: val })).sort((a, b) => b.value - a.value);
  const ord = o && !o.error
    ? `<div class="an-kpis an-kpis-3">${kpi("Solicitudes recibidas", o.total, "Pedidos enviados desde el catálogo.")}${kpi("Confirmadas", o.confirmed, "Marcadas como confirmadas en Pedidos.")}${kpi("Canceladas", o.cancelled, "")}</div>`
    : `<p class="field-error">${esc((o && o.error) || "No disponible.")}</p>`;
  return card("F. Ventas reales del POS", `
    <p class="an-note">Fuente: POS, solo lectura. Ventas pagadas, activas y no anuladas, de todos los canales. Se muestran aparte de GA4: no se vincula una venta con una visita ni con un clic en WhatsApp.</p>
    <div class="an-kpis an-kpis-3">
      ${kpi("Unidades vendidas", c.units, "", c.units, p.units)}
      ${kpi("Ventas", c.sales, "", c.sales, p.sales)}
      ${kpi("Total vendido", c.revenue, "Según el total registrado en cada venta.", c.revenue, p.revenue, money)}
    </div>
    <div class="an-chart-head"><h3>Evolución de unidades vendidas</h3><p class="an-legend"><span><i class="an-sw an-sw-cur"></i>Período actual</span><span><i class="an-sw an-sw-prev"></i>Período anterior</span></p></div>
    <div id="anSalesChart">${lineChart(series, "units", chartWidth())}</div>
    <div class="an-cols">
      <div><h3>Productos con mayor volumen <small>(unidades)</small></h3>${bars(prodRows.slice(0, 10).map((r) => ({ label: r.info ? r.info.name : `Producto #${r.id} (no publicado)`, value: r.units })))}</div>
      <div><h3>Categorías con mayor volumen <small>(unidades, clasificación vigente)</small></h3>${bars([...catMap].map(([k, val]) => ({ label: k, value: val })).sort((a, b) => b.value - a.value).slice(0, 10))}</div>
    </div>
    <div class="an-cols"><div><h3>Ventas por canal <small>(según el POS)</small></h3>${bars(ch)}</div><div><h3>Solicitudes de pedido del catálogo</h3>${ord}</div></div>
    ${s.linesUnreadable ? `<p class="an-note">${n(s.linesUnreadable)} venta(s) sin detalle de productos legible: cuentan en ventas y total, no en unidades.</p>` : ""}`, { id: "anF", wide: true });
}

// ── Render ──────────────────────────────────────────────────────────────
function toolbar(d) {
  const meta = d
    ? `Período: <b>${esc(fmtRange(d.range.start, d.range.end))}</b> · comparado con ${esc(fmtRange(d.range.previousStart, d.range.previousEnd))} · Actualizado ${esc(new Date(d.generatedAt).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))} (hora de Colombia)`
    : "";
  return `<div class="an-toolbar">
    <div class="an-seg" role="group" aria-label="Período">${RANGES.map(([k, l]) => `<button type="button" class="an-seg-btn${k === st.range ? " active" : ""}" aria-pressed="${k === st.range}" data-an-range="${k}">${l}</button>`).join("")}</div>
    <form class="an-custom${st.range === "custom" ? "" : " hidden"}" data-an-custom novalidate><label>Desde<input type="date" name="start" value="${esc(st.start)}" required></label><label>Hasta<input type="date" name="end" value="${esc(st.end)}" required></label><button type="submit" class="button dark">Aplicar</button></form>
    <button type="button" class="an-refresh" data-an-refresh ${st.loading ? "disabled" : ""}>↻ Actualizar</button>
    <p class="an-meta">${meta}${st.range === "today" ? " · GA4 puede tardar unas horas en mostrar la actividad de hoy." : ""}</p>
  </div>`;
}

function render() {
  const root = $("#analyticsRoot");
  if (!root) return;
  const d = st.data;
  let html = toolbar(d);
  if (st.loading && !d) html += `<div class="an-loading" role="status"><span class="an-spinner" aria-hidden="true"></span>Consultando las fuentes…</div>`;
  else if (st.error) html += `<section class="an-card an-wide an-error" role="alert"><header class="an-card-head"><h2>No se pudo cargar la analítica</h2><p>${esc(st.error)}</p></header><button type="button" class="button" data-an-refresh>Reintentar</button></section>`;
  else if (d) {
    const g = d.ga4;
    if (!d.configured.reporting) html += configSection(d);
    else if (g && g.error) html += ga4ErrorSection(g.error);
    const ready = g && !g.error;
    html += `<nav class="an-nav" aria-label="Áreas de Analítica">${[["anA", "Resumen"], ["anB", "Tráfico"], ["anC", "Productos"], ["anD", "Embudo"], ["anE", "Vitrinas"], ["anF", "Ventas POS"]].map(([id, l]) => `<a href="#${id}" data-an-goto="${id}">${l}</a>`).join("")}</nav>`;
    html += overviewSection(ready ? g : null, d);
    if (ready) html += trafficSection(g, d) + productsSection(g, d) + funnelSection(g, d) + showcasesSection(g);
    else if (d.configured.reporting) html += "";
    else html += ["B. Tráfico y visitantes", "C. Productos y categorías", "D. Embudo de compra", "E. Vitrinas comerciales"].map((t, i) => card(t, empty("Disponible cuando GA4 esté conectado. No hay datos de navegación todavía."), { id: ["anB", "anC", "anD", "anE"][i], wide: true })).join("");
    if (d.configured.reporting && !d.configured.measurement) html += `<p class="an-note an-warn">Falta <code>GA4_MEASUREMENT_ID</code>: la tienda no está enviando visitas a GA4, así que los informes no recibirán datos nuevos.</p>`;
    html += salesSection(d);
    html = html.replace('id="anSummary"', "");
  }
  root.innerHTML = html;
  root.classList.toggle("an-busy", st.loading && Boolean(d));
  if (d && d.ga4 && !d.ga4.error && $("#anTrafficChart .an-line", root)) bindLineChart($("#anTrafficChart .an-line", root), d.ga4.series, st.metric, SERIES_METRICS.find(([k]) => k === st.metric)[1]);
  const sc = $("#anSalesChart .an-line", root);
  if (sc && d && d.sales && !d.sales.error) {
    const days = [...Array(d.range.days).keys()].map((i) => [new Date(Date.parse(d.range.start + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10), new Date(Date.parse(d.range.previousStart + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10)]);
    bindLineChart(sc, { actual: days.map(([x]) => ({ date: x, units: d.sales.current.unitsByDay[x] || 0 })), anterior: days.map(([, y]) => ({ date: y, units: d.sales.previous.unitsByDay[y] || 0 })) }, "units", "Unidades vendidas");
  }
}

async function fetchData({ refresh = false } = {}) {
  const params = new URLSearchParams({ resource: "analytics", range: st.range });
  if (st.range === "custom") { params.set("start", st.start); params.set("end", st.end); }
  if (refresh) params.set("refresh", "1");
  st.loading = true; st.error = null;
  render();
  try {
    const res = await deps.adminFetch(`/api/admin/products?${params.toString()}`);
    if (res.status === 401) { deps.onUnauthorized(); return; }
    const body = await res.json().catch(() => null);
    if (!res.ok) { st.error = (body && body.error) || "Error del servidor."; st.data = null; }
    else st.data = body;
  } catch {
    st.error = "Sin conexión con el servidor. Revisa tu conexión e intenta de nuevo.";
    st.data = null;
  } finally {
    st.loading = false;
    render();
  }
}

function bind(root) {
  root.addEventListener("click", (e) => {
    const r = e.target.closest("[data-an-range]");
    if (r) {
      st.range = r.dataset.anRange;
      if (st.range === "custom") { render(); const f = $("[data-an-custom] input", root); if (f) f.focus(); return; }
      fetchData();
      return;
    }
    if (e.target.closest("[data-an-refresh]")) return fetchData({ refresh: true });
    const m = e.target.closest("[data-an-metric]");
    if (m) { st.metric = m.dataset.anMetric; return render(); }
    const c = e.target.closest("[data-an-class]");
    if (c) { st.classMode = c.dataset.anClass; return render(); }
    if (e.target.closest("[data-an-showall]")) { st.showAll = !st.showAll; return render(); }
    const go = e.target.closest("[data-an-goto]");
    if (go) { e.preventDefault(); const t = document.getElementById(go.dataset.anGoto); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const row = e.target.closest("[data-an-open]");
    if (row) { const id = Number(row.dataset.anOpen); st.openId = st.openId === id ? null : id; return render(); }
  });
  root.addEventListener("change", (e) => {
    const f = e.target.closest("[data-an-filter]");
    if (!f || f.dataset.anFilter === "q") return;
    st[f.dataset.anFilter] = f.type === "checkbox" ? f.checked : f.value;
    if (f.dataset.anFilter === "group") st.category = "";
    render();
  });
  root.addEventListener("keydown", (e) => {
    const row = e.target.closest("[data-an-open]");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); row.click(); }
  });
  root.addEventListener("input", (e) => {
    const f = e.target.closest('[data-an-filter="q"]');
    if (!f) return;
    st.q = f.value;
    const pos = f.selectionStart;
    render();
    const again = $('[data-an-filter="q"]', root);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  root.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-an-custom]");
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    st.start = String(fd.get("start") || "");
    st.end = String(fd.get("end") || "");
    if (!st.start || !st.end) { st.error = "Elige una fecha de inicio y una de fin."; st.data = null; return render(); }
    fetchData();
  });
}

let bound = false;
let resizeTimer = null;
let lastWidth = 0;
export function openAnalytics(dependencies) {
  deps = dependencies;
  const root = $("#analyticsRoot");
  if (!root) return;
  if (!bound) {
    bind(root);
    bound = true;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const w = root.clientWidth;
        if (st.data && root.offsetParent !== null && Math.abs(w - lastWidth) > 8) { lastWidth = w; render(); }
      }, 150);
    });
  }
  if (!st.data && !st.loading) fetchData();
  else render();
}

// Solo para pruebas.
export const __test = { lineChart, bars, delta, kpi };
