// VIBE — Panel editorial (frontend). Talks only to /api/admin/*,
// never to /api/catalog/* and never imports js/app.js or
// js/data-source.js — completely separate from the public catalog's
// state/rendering machinery.
//
// Fase 39 — única excepción deliberada: importa dos funciones PURAS de
// js/taxonomy.js (getCategoriesInGroup/getSubcategories — sin DOM, sin
// red, sin estado del catálogo) para poblar los selects de destino del
// editor de Hero con los mismos valores reales que ya usa el sitio
// público, y js/hero-links.js (igual de puro) para no duplicar cómo se
// calcula un href/preview de destino entre el editor y el carrusel
// real.
//
// The admin token is entered once and kept in sessionStorage (cleared
// when the tab closes) — never in localStorage, never hardcoded, never
// sent anywhere except as the Authorization header on /api/admin/*
// requests.

import { getCategoriesInGroup, getSubcategories, VIBE_CATEGORY_GROUPS, SUBCATEGORIES_BY_CATEGORY, publicPlacement, isListedSubcategory, needsClassificationReview } from "../js/taxonomy.js";
import { SECTION_DESTINATIONS, describeSlideDestination } from "../js/hero-links.js";

const TOKEN_KEY = "vibe_admin_token";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

// Mirrors api/admin/_lib/imageValidation.js — client-side check is just
// for fast feedback; the server is always the authoritative validator
// (type, size, dimensions, aspect ratio warning).
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Fase estabilización — bug reportado: un upload guardado-con-warning
// ("peso sobre el objetivo de 300KB") y uno realmente rechazado se veían
// EXACTAMENTE igual (mismo texto gris neutro, .image-status), así que no
// quedaba claro si la imagen se guardó o no. 300KB sigue siendo solo un
// objetivo — nunca bloquea el guardado (confirmado contra el handler
// real) — pero ahora ÉXITO/WARNING/ERROR tienen texto y color distintos
// para que la diferencia sea obvia de un vistazo, no solo de la lectura.
function setImageStatus(el, kind, text) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("status-ok", "status-warn", "status-error", "status-pending");
  if (kind) el.classList.add(`status-${kind}`);
}

// Uploads one image (slot: "main" | "secondary") via
// POST /api/admin/product-images. Returns the parsed response payload on
// success, or null (after writing a message into statusEl) on failure —
// the server is always re-checked even when the quick client-side check
// above already passed.
async function uploadProductImage(productId, file, slot, statusEl) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: tipo de archivo no permitido (usa WebP, JPEG o PNG).");
    return null;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    setImageStatus(
      statusEl,
      "error",
      `No se guardó la imagen. Motivo: pesa ${(file.size / 1024 / 1024).toFixed(1)}MB; el máximo permitido es ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB.`
    );
    return null;
  }
  setImageStatus(statusEl, "pending", "Subiendo...");
  let dataUrl;
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: no se pudo leer el archivo.");
    return null;
  }
  const res = await adminFetch("/api/admin/product-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId, slot, contentType: file.type, dataBase64: dataUrl }),
  });
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return null;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload && Array.isArray(payload.details) ? payload.details.join(" ") : null;
    setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: " + (detail || (payload && payload.error) || "error desconocido."));
    return null;
  }
  if (payload.warnings && payload.warnings.length) {
    // 300KB es un objetivo, nunca un límite duro (confirmado contra el
    // handler real: un archivo de 498KB responde 200 y se guarda) — el
    // texto lo deja explícito para que nunca se lea como un rechazo.
    setImageStatus(statusEl, "warn", "Imagen guardada correctamente. Advertencia: " + payload.warnings.join(" "));
  } else {
    setImageStatus(statusEl, "ok", "Imagen guardada correctamente.");
  }
  return payload;
}

async function deleteSecondaryImage(productId, url, statusEl) {
  const res = await adminFetch("/api/admin/product-images", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId, path: url }),
  });
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return null;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (statusEl) setImageStatus(statusEl, "error", "No se eliminó la imagen. Motivo: " + ((payload && payload.error) || "error desconocido."));
    return null;
  }
  return payload;
}

// Taxonomía VIBE aprobada en Fase 20.2 (VIBE_CATEGORY_GROUPS, importada de
// js/taxonomy.js desde Fase 46 — la misma que usa el catálogo público
// para agrupar). Se ofrecen aquí como opciones de selección manual —
// nunca se asignan automáticamente. "Sin categoría" siempre disponible;
// la administradora puede dejarlo vacío si no lo sabe.

// Fase 53 — subcategoría CONTROLADA: un <select> con la lista de la
// Categoría VIBE elegida (SUBCATEGORIES_BY_CATEGORY en js/taxonomy.js),
// más dos casos explícitos, ambos marcados como revisión pendiente:
// - SUB_HISTORICAL: el valor ya guardado que no está en la lista; se
//   conserva tal cual mientras no elijas otra cosa (nunca se reasigna);
// - SUB_OTHER: «Otra», con nombre y justificación obligatoria (nota
//   interna, nunca pública). El servidor vuelve a validar todo esto.
const SUB_HISTORICAL = "__historical__";
const SUB_OTHER = "__other__";
const MIN_OTHER_REASON = 10;
function subcategoryOptionsHtml(category, { selected = "", historical = "" } = {}) {
  const list = SUBCATEGORIES_BY_CATEGORY[category] || [];
  const opt = (value, label) => `<option value="${esc(value)}" ${selected === value ? "selected" : ""}>${esc(label)}</option>`;
  return [
    opt("", category ? "Sin subcategoría" : "Sin subcategoría (elige primero una categoría VIBE)"),
    ...list.map((sub) => opt(sub, sub)),
    historical ? opt(SUB_HISTORICAL, `${historical} — valor guardado, revisión pendiente`) : "",
    opt(SUB_OTHER, "Otra… (requiere justificación)"),
  ].join("");
}

// Fase 51 — "dónde se verá" en el catálogo público, con la misma lógica
// que la navegación pública (publicPlacement en js/taxonomy.js).
function placementText(p) {
  const { group, category } = publicPlacement(p);
  return group ? `${group} › ${category}` : null;
}

function renderCategoryOptions(selected) {
  const opts = [`<option value="">Sin categoría</option>`];
  for (const { group, categories } of VIBE_CATEGORY_GROUPS) {
    opts.push(`<optgroup label="${esc(group)}">`);
    for (const c of categories) {
      opts.push(`<option value="${esc(c)}" ${selected === c ? "selected" : ""}>${esc(c)}</option>`);
    }
    opts.push(`</optgroup>`);
  }
  return opts.join("");
}

function renderSecondaryThumbs(images) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return `<p class="no-image">Sin imágenes secundarias todavía.</p>`;
  return `<div class="secondary-thumbs">${list
    .map(
      (url) => `<div class="secondary-thumb">
        <img src="${esc(url)}" alt="">
        <button type="button" class="delete-secondary" data-url="${esc(url)}">Eliminar</button>
      </div>`
    )
    .join("")}</div>`;
}

let state = { products: [], search: "", status: "all", category: "all" };

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}
function setToken(t) {
  try {
    sessionStorage.setItem(TOKEN_KEY, t);
  } catch {
    // sessionStorage unavailable — the session simply won't persist across reloads.
  }
}
function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function adminFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${getToken()}`,
    },
  });
  return res;
}

function showApp() {
  $("#loginGate").classList.add("hidden");
  $("#adminShell").classList.remove("hidden");
}
function showLogin(message) {
  $("#loginGate").classList.remove("hidden");
  $("#adminShell").classList.add("hidden");
  if (message) {
    $("#loginError").textContent = message;
    $("#loginError").classList.remove("hidden");
  }
}

async function loadProducts() {
  $("#loadError").classList.add("hidden");
  const res = await adminFetch("/api/admin/products");
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido. Vuelve a ingresarlo.");
    return;
  }
  if (res.status === 503) {
    $("#loadError").textContent = "El panel administrativo todavía no está configurado (falta ADMIN_API_TOKEN en el servidor).";
    $("#loadError").classList.remove("hidden");
    return;
  }
  if (!res.ok) {
    $("#loadError").textContent = "No se pudo cargar el listado. Intenta de nuevo.";
    $("#loadError").classList.remove("hidden");
    return;
  }
  const data = await res.json();
  state.products = data.products || [];
  populateCategoryFilter();
  renderTable();
  renderHome();
  renderTaxonomy();
}

// Fase 51 — se puede filtrar por categoría VIBE (editorial, la que define
// dónde aparece el producto) o por categoría POS (operativa).
function populateCategoryFilter() {
  const select = $("#filterCategory");
  const current = select.value;
  const posCategories = [...new Set(state.products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "es"));
  const vibeOptions = VIBE_CATEGORY_GROUPS.map(
    ({ group, categories }) => `<optgroup label="VIBE · ${esc(group)}">${categories.map((c) => `<option value="vibe:${esc(c)}">${esc(c)}</option>`).join("")}</optgroup>`
  ).join("");
  select.innerHTML =
    `<option value="all">Todas las categorías</option>` +
    vibeOptions +
    `<optgroup label="Categoría POS">${posCategories.map((c) => `<option value="pos:${esc(c)}">${esc(c)}</option>`).join("")}</optgroup>`;
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function filteredProducts() {
  const q = state.search.toLowerCase();
  return state.products.filter((p) => {
    if (state.category.startsWith("vibe:") && p.editorialCategory !== state.category.slice(5)) return false;
    if (state.category.startsWith("pos:") && p.category !== state.category.slice(4)) return false;
    if (state.status === "published" && !p.published) return false;
    if (state.status === "unpublished" && p.published) return false;
    if (state.status === "available" && !p.available) return false;
    if (state.status === "unavailable" && p.available) return false;
    if (state.status === "with_ficha" && !p.hasMetadata) return false;
    if (state.status === "unclassified" && p.editorialCategory) return false;
    if (state.status === "review" && !needsClassificationReview(p)) return false;
    if (state.status === "published_unclassified" && (!p.published || p.editorialCategory)) return false;
    const haystack = [String(p.id), p.name, p.category, p.editorialCategory, p.subcategory].filter(Boolean).join(" ").toLowerCase();
    if (q && !haystack.includes(q)) return false;
    return true;
  });
}

// Fase 51 — clasificación VIBE de una fila: categoría editorial (o aviso
// si falta) y dónde se verá públicamente.
function classificationCell(p) {
  const where = placementText(p);
  if (p.editorialCategory) {
    return `<span class="class-main">${esc(p.editorialCategory)}${p.subcategory ? ` › ${esc(p.subcategory)}` : ""}</span>
      <span class="class-where">Se ve en: ${where ? esc(where) : "solo «Todos» y búsqueda"}</span>`;
  }
  return `<span class="pill pill-warn">Sin categoría VIBE</span>
    <span class="class-where">${where ? `Se ve en: ${esc(where)} (por categoría POS)` : "Solo en «Todos» y búsqueda"}</span>`;
}

// Fase 52 — miniatura del producto (imagen de su ficha) o sus iniciales.
function imageUrl(src) {
  if (!src) return "";
  return /^(https?:)?\/\//.test(src) || src.startsWith("/") || src.startsWith("data:") ? src : "/" + src;
}
function productThumb(p, cls = "pc-thumb") {
  if (p.image) return `<span class="${cls}"><img src="${esc(imageUrl(p.image))}" alt="" loading="lazy"></span>`;
  const initials = p.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return `<span class="${cls} pc-thumb-empty" aria-hidden="true">${esc(initials)}</span>`;
}

// Estado editorial de un producto, en lenguaje neutro: "Solo POS" no es
// un pendiente, es un producto que todavía no decidiste trabajar.
function stateChips(p) {
  const chips = [];
  if (!p.hasMetadata) chips.push(`<span class="pill pill-muted">Solo POS</span>`);
  else chips.push(p.published ? `<span class="pill pill-pink">Publicado</span>` : `<span class="pill pill-muted">No publicado</span>`);
  if (!p.available) chips.push(`<span class="pill pill-warn">Agotado</span>`);
  if (p.featured) chips.push(`<span class="pill pill-pink">★ Más elegidos</span>`);
  if (p.badge) chips.push(`<span class="pill pill-outline">${esc(p.badge)}</span>`);
  if (needsClassificationReview(p)) chips.push(`<span class="pill pill-review" title="Subcategoría fuera de la lista controlada">Revisión pendiente</span>`);
  return chips.join("");
}

function renderTable() {
  const list = filteredProducts();
  $("#resultCount").textContent = `${list.length} de ${state.products.length} productos`;
  $("#productRows").innerHTML = list.length
    ? list
        .map(
          (p) => `<article class="product-card" role="listitem">
        <button type="button" class="product-card-btn" data-edit="${p.id}" aria-label="Abrir ${esc(p.name)}">
          ${productThumb(p)}
          <span class="pc-main">
            <span class="pc-name">${esc(p.name)} <span class="prod-id">#${p.id}</span></span>
            <span class="pc-meta">POS: ${esc(p.category)} · ${money(p.price)}</span>
            <span class="pc-class class-cell">${classificationCell(p)}</span>
          </span>
          <span class="pc-state">${stateChips(p)}</span>
        </button>
      </article>`
        )
        .join("")
    : `<p class="empty-state">Ningún producto coincide con la búsqueda o el filtro.</p>`;
}

// ---- Fase 52 — Inicio: cifras reales y lo que hoy se ve en el catálogo ----
function renderHome() {
  if (!$("#homeStats")) return;
  const products = state.products;
  const published = products.filter((p) => p.published);
  const withFicha = products.filter((p) => p.hasMetadata).length;
  const inStock = products.filter((p) => p.available).length;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentOrders = ordersState.loaded ? ordersState.orders.filter((o) => new Date(o.created_at).getTime() >= weekAgo).length : null;
  const stat = (value, label, sub = "") => `<div class="stat-card"><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  $("#homeStats").innerHTML =
    stat(published.length, "publicados en el catálogo") +
    stat(withFicha, "fichas editoriales") +
    stat(products.length, "productos en el POS", `${inStock} con stock`) +
    stat(recentOrders === null ? "—" : recentOrders, "pedidos en los últimos 7 días");

  $("#homePublished").innerHTML = published.length
    ? published
        .map((p) => {
          const where = placementText(p);
          return `<button type="button" class="home-item" data-edit="${p.id}">
          ${productThumb(p, "hi-thumb")}
          <span class="hi-main"><span class="hi-name">${esc(p.name)}</span><span class="hi-sub">${where ? esc(where) : "Solo en «Todos» y búsqueda"}${p.editorialCategory ? "" : " · por categoría POS"}</span></span>
          <span class="hi-chips">${p.available ? "" : `<span class="pill pill-warn">Agotado</span>`}${p.featured ? `<span class="pill pill-pink">★</span>` : ""}</span>
        </button>`;
        })
        .join("")
    : `<p class="empty-state">Todavía no publicaste ningún producto.</p>`;

  if (!ordersState.loaded) {
    $("#homeOrders").innerHTML = ordersState.failed ? `<p class="empty-state">No se pudieron cargar los pedidos. Abre Pedidos para reintentar.</p>` : `<p class="empty-state">Cargando pedidos…</p>`;
    return;
  }
  const latest = ordersState.orders.slice(0, 5);
  $("#homeOrders").innerHTML = latest.length
    ? latest
        .map((o) => `<div class="home-item home-order">
          <span class="hi-main"><span class="hi-name">${esc(o.customer_name)}</span><span class="hi-sub">${esc(formatOrderDate(o.created_at))} · ${esc(o.customer_city || "")}</span></span>
          <span class="hi-chips"><b>${money(Number(o.total))}</b><span class="pill pill-muted">${esc(ORDER_STATUS_LABELS[o.status] || o.status)}</span></span>
        </div>`)
        .join("")
    : `<p class="empty-state">Todavía no hay pedidos registrados.</p>`;
}

// ---- Fase 52 — Clasificación (consulta) ----
function renderTaxonomy() {
  if (!$("#taxonomyTree")) return;
  const classified = state.products.filter((p) => p.editorialCategory);
  const productLink = (p) => `<button type="button" class="tax-product" data-edit="${p.id}">${esc(p.name)}${p.published ? "" : ` <span class="tax-muted">(no publicado)</span>`}</button>`;
  const groups = VIBE_CATEGORY_GROUPS.map(({ group, categories }) => {
    const inGroup = classified.filter((p) => categories.includes(p.editorialCategory));
    const cats = categories
      .map((c) => {
        const inCat = classified.filter((p) => p.editorialCategory === c);
        const approved = SUBCATEGORIES_BY_CATEGORY[c] || [];
        const subChips = approved
          .map((sub) => {
            const n = inCat.filter((p) => p.subcategory === sub).length;
            return `<span class="sub-chip${n ? "" : " sub-zero"}">${esc(sub)}<b>${n}</b></span>`;
          })
          .join("");
        const historical = [...new Set(inCat.map((p) => p.subcategory).filter((v) => v && !approved.includes(v)))];
        const histChips = historical
          .map((v) => `<span class="sub-chip sub-hist" title="Revisión pendiente: valor fuera de la lista controlada; se conserva hasta que lo revises">${esc(v)}<b>${inCat.filter((p) => p.subcategory === v).length}</b></span>`)
          .join("");
        const noSub = inCat.filter((p) => !p.subcategory).length;
        return `<div class="tax-cat">
          <div class="tax-cat-head"><b>${esc(c)}</b><span class="tax-count">${inCat.length} ${inCat.length === 1 ? "producto" : "productos"}</span></div>
          <div class="sub-chips">${subChips}${histChips}${noSub ? `<span class="sub-chip sub-none">Sin subcategoría<b>${noSub}</b></span>` : ""}</div>
          ${inCat.length ? `<div class="tax-products">${inCat.map(productLink).join("")}</div>` : ""}
        </div>`;
      })
      .join("");
    return `<section class="tax-group"><div class="tax-group-head"><h2>${esc(group)}</h2><span class="tax-count">${inGroup.length} con clasificación VIBE</span></div>${cats}</section>`;
  }).join("");
  const unclassifiedPublished = state.products.filter((p) => p.published && !p.editorialCategory);
  const legend = `<p class="tax-legend"><span class="sub-chip sub-hist">Revisión pendiente<b>n</b></span> subcategoría fuera de la lista controlada (valor histórico o «Otra» con justificación): se conserva hasta que decidas.</p>`;
  const unclassified = unclassifiedPublished.length
    ? `<section class="tax-group tax-note"><div class="tax-group-head"><h2>Publicados sin categoría VIBE</h2><span class="tax-count">aparecen por su categoría POS</span></div><div class="tax-products">${unclassifiedPublished.map((p) => `${productLink(p)}<span class="tax-muted">${esc(placementText(p) || "Solo «Todos»")}</span>`).join("")}</div></section>`
    : "";
  $("#taxonomyTree").innerHTML = legend + groups + unclassified;

  const byPos = {};
  for (const p of state.products) {
    byPos[p.category] = byPos[p.category] || { total: 0, ficha: 0 };
    byPos[p.category].total++;
    if (p.hasMetadata) byPos[p.category].ficha++;
  }
  $("#taxonomyPos").innerHTML = Object.entries(byPos)
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([c, v]) => `<span class="pos-chip"><b>${esc(c)}</b>${v.total} en el POS · ${v.ficha} con ficha</span>`)
    .join("");
}

function arrayFieldToText(arr) {
  return Array.isArray(arr) ? arr.join("\n") : "";
}
function textToArrayField(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Fase 34 — helpers genéricos para no repetir el mismo template 55 veces.
// input/text: valor va directo en el atributo (esc() ya lo protege).
// textarea: el <textarea> se deja vacío en el HTML y su .value se llena
// aparte (mismo motivo de siempre: contenido largo no debe vivir dentro
// de un atributo/backtick).
function textField(name, label, value, placeholder = "") {
  return `<label>${label}<input name="${esc(name)}" value="${esc(value || "")}" placeholder="${esc(placeholder)}"></label>`;
}
function textareaField(name, label, placeholder = "", rows = 4) {
  return `<label>${label}<textarea name="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}"></textarea></label>`;
}
function triStateField(name, label, value) {
  const current = value || "";
  const opts = ["", "Sí", "No"]
    .map((v) => `<option value="${esc(v)}" ${current === v ? "selected" : ""}>${v || "No especificado"}</option>`)
    .join("");
  return `<label>${label}<select name="${esc(name)}">${opts}</select></label>`;
}

async function openEdit(productId) {
  // Fase 41 — la capa promocional vive en `products` (POS), no en
  // catalog_metadata, así que se carga con su propio fetch en paralelo
  // — dos orígenes de datos distintos, nunca mezclados en un mismo
  // request/guardado.
  const [res, promoRes] = await Promise.all([
    adminFetch(`/api/admin/catalog-metadata?product_id=${encodeURIComponent(productId)}`),
    adminFetch(`/api/admin/product-promo?product_id=${encodeURIComponent(productId)}`),
  ]);
  if (res.status === 401 || promoRes.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return;
  }
  if (!res.ok) {
    alert("No se pudo cargar el producto.");
    return;
  }
  const { product, metadata } = await res.json();
  const promo = promoRes.ok ? await promoRes.json() : { promoActive: false, promoPrice: null, promoStart: null, promoEnd: null, promoText: null, discountPercent: null };
  const m = metadata || {};
  // Fase 34 — additional_info ya llega como objeto (el servidor lo
  // parsea, ver api/admin/catalog-metadata.js): los ~40 campos
  // granulares de la ficha VIBE. Todos en null/[] si el producto no
  // tiene ficha todavía — nunca undefined, el formulario siempre puede
  // poblarse sin checks extra.
  const d = m.additional_info || {};

  // Fase 53 — estado inicial del selector de subcategoría.
  const storedSub = (m.subcategory || "").trim();
  const subInitial = !storedSub
    ? { selected: "", historical: "", otherName: "" }
    : isListedSubcategory(m.category || "", storedSub)
      ? { selected: storedSub, historical: "", otherName: "" }
      : d.subcategoryOtherReason
        ? { selected: SUB_OTHER, historical: "", otherName: storedSub }
        : { selected: SUB_HISTORICAL, historical: storedSub, otherName: "" };
  $("#editContent").innerHTML = `
    <div class="edit-actionbar">
      <div class="edit-actionbar-title"><strong>${esc(product.name)}</strong><span class="prod-id">#${product.id}</span></div>
      <span id="editStatusChip" class="pill ${m.published ? "pill-pink" : "pill-muted"}">${metadata ? (m.published ? "Publicado" : "No publicado") : "Solo POS"}</span>
      <span id="saveStatusTop" class="save-status" role="status"></span>
      <button type="button" id="saveTopBtn" class="button dark">Guardar cambios</button>
    </div>
    <section class="editor-summary" data-tab="summary">
      ${productThumb({ name: product.name, image: m.image }, "es-thumb")}
      <div class="es-main">
        <p class="eyebrow">Resumen</p>
        <h1 class="es-name">${esc(product.name)}</h1>
        <p class="es-pos">POS: ${esc(product.category)} · ${money(product.price)} · ${Number(product.stock) > 0 ? "Disponible" : "Agotado"}</p>
        <p class="es-place">Clasificación VIBE: <b id="summaryClassification">${m.category ? esc(m.category) + (m.subcategory ? " › " + esc(m.subcategory) : "") : "sin categoría VIBE"}</b></p>
        <p class="es-place" id="summaryPlacement"></p>
        <div class="es-content">${[
          ["Imagen", m.image],
          ["Descripción", m.description || m.short_description],
          ["Beneficios", (m.benefits || []).length],
          ["Modo de uso", m.usage],
          ["Ingredientes", m.ingredients],
        ].map(([label, has]) => `<span class="pill ${has ? "pill-ok" : "pill-muted"}">${has ? "✓" : "—"} ${label}</span>`).join("")}</div>
      </div>
    </section>
    <div class="edit-pos">
      <h2>1. Información del POS <span class="section-hint">(solo lectura)</span></h2>
      <div class="edit-pos-grid">
        <div><span>ID</span>${product.id}</div>
        <div><span>Nombre</span>${esc(product.name)}</div>
        <div><span>Categoría POS</span>${esc(product.category)}</div>
        <div><span>Precio</span>${money(product.price)}</div>
        <div><span>Disponibilidad</span>${Number(product.stock) > 0 ? "Disponible" : "Agotado"} (stock: ${product.stock})</div>
      </div>
    </div>

    <details class="admin-accordion promo-section" open>
      <summary>Promoción VIBE</summary>
      <div class="admin-accordion-body">
        <p class="section-hint">
          Precio base del POS: <strong>${money(product.price)}</strong> — esta sección nunca lo modifica,
          solo administra el descuento (mismas columnas de <code>products</code> que ya consume el catálogo
          público; el POS sigue siendo la fuente de verdad de producto/precio/inventario).
        </p>
        <label class="checkbox-field"><input type="checkbox" id="promoActiveInput" ${promo.promoActive ? "checked" : ""}> Promoción activa</label>
        <div class="edit-row">
          <label>Precio promocional<input type="number" id="promoPriceInput" min="0" step="1" value="${promo.promoPrice ?? ""}" placeholder="Ej. 16640"></label>
          <label>Texto promocional (opcional)<input id="promoTextInput" value="${esc(promo.promoText || "")}" placeholder="Ej. -20%"></label>
        </div>
        <div class="edit-row">
          <label>Fecha inicio (opcional)<input type="date" id="promoStartInput" value="${promo.promoStart ? String(promo.promoStart).slice(0, 10) : ""}"></label>
          <label>Fecha fin (opcional)<input type="date" id="promoEndInput" value="${promo.promoEnd ? String(promo.promoEnd).slice(0, 10) : ""}"></label>
        </div>
        <p id="promoSummary" class="section-hint"></p>
        <p id="promoError" class="field-error"></p>
        <div class="save-row">
          <span id="promoSaveStatus" class="save-status"></span>
          <button type="button" id="savePromoBtn" class="button dark">Guardar promoción</button>
        </div>
      </div>
    </details>

    <details class="admin-accordion" open>
      <summary>2. Identificación</summary>
      <div class="admin-accordion-body">
        ${textField("commercial_name", "Nombre comercial", d.commercialName, "Ej. Blusher Lotion Perfect Cheeks — Liquid Blush")}
        <span class="image-hint">Editorial — nunca reemplaza el nombre del POS de arriba. Ambos coexisten.</span>
        <div class="edit-row">
          ${textField("brand", "Marca", m.brand, "Ej. Kevin&COCO")}
          ${textField("line", "Línea / colección", d.line, "Ej. Perfect Cheeks")}
        </div>
        <div class="edit-row">
          <label>Categoría VIBE
            <select name="category">${renderCategoryOptions(m.category || "")}</select>
          </label>
          <label>Subcategoría VIBE
            <select name="subcategory_choice">${subcategoryOptionsHtml(m.category || "", subInitial)}</select>
          </label>
        </div>
        <div id="subcategoryOther" class="sub-other${subInitial.selected === SUB_OTHER ? "" : " hidden"}">
          ${textField("subcategory_other", "Nombre de la subcategoría «Otra»", subInitial.otherName, "Ej. Fijadores de maquillaje")}
          ${textareaField("subcategory_other_reason", "Justificación (obligatoria, nota interna)", `Por qué ninguna subcategoría de la lista sirve — mínimo ${MIN_OTHER_REASON} caracteres. No se muestra en el catálogo público.`, 2)}
        </div>
        <p id="placementHint" class="placement-hint" role="status"></p>
        <p id="subcategoryHint" class="section-hint"></p>
        <div class="edit-row">
          ${textField("product_type", "Tipo de producto", d.productType, "Ej. Rubor líquido")}
          ${textField("presentation", "Presentación", m.presentation, "Ej. 30ml, set de 5 unidades...")}
        </div>
        <div class="edit-row">
          ${textField("net_content", "Contenido neto", d.netContent, "Ej. 5 ml")}
          ${textField("sku", "SKU / referencia", d.sku, "Ej. KC240258")}
        </div>
        <div class="edit-row">
          ${textField("tone", "Tono", d.tone, "Ej. Rosa nude")}
          ${textField("tone_code", "Código de tono", d.toneCode, "Ej. 02")}
        </div>
        <div class="edit-row">
          ${textField("color", "Color", d.color, "")}
          ${textField("variant", "Variante", d.variant, "")}
        </div>
      </div>
    </details>

    <details class="admin-accordion" open>
      <summary>3. Imágenes</summary>
      <div class="admin-accordion-body">
        <div class="image-block">
          <p class="image-block-label">Imagen principal</p>
          <div class="image-preview-main" id="mainImagePreview">
            ${m.image ? `<img src="${esc(m.image)}" alt="">` : `<span class="no-image">Sin imagen</span>`}
          </div>
          <input type="file" id="mainImageInput" accept="image/webp,image/jpeg,image/png">
          <button type="button" id="uploadMainBtn" class="button dark">Subir / reemplazar principal</button>
          <p id="mainImageStatus" class="image-status"></p>
        </div>
        <label>Imagen (ruta o URL)
          <input name="image" value="${esc(m.image || "")}" placeholder="assets/products/ejemplo.svg">
          <span class="image-hint">Se actualiza automáticamente al subir arriba. También puedes pegar una ruta/URL manual (ej. una imagen legacy).</span>
        </label>
        ${textField("main_image_alt", "Alt de la imagen principal", d.mainImageAlt, "Descripción para lectores de pantalla.")}
        <div class="image-block">
          <p class="image-block-label">Imágenes adicionales</p>
          <div id="secondaryList">${renderSecondaryThumbs(m.images)}</div>
          <input type="file" id="secondaryImageInput" accept="image/webp,image/jpeg,image/png">
          <button type="button" id="uploadSecondaryBtn" class="button">Agregar adicional</button>
          <p id="secondaryImageStatus" class="image-status"></p>
        </div>
      </div>
    </details>

    <details class="admin-accordion" open>
      <summary>4. Descripción</summary>
      <div class="admin-accordion-body">
        ${textareaField("what_is", "Qué es", "Déjalo vacío si no lo sabes.", 3)}
        ${textField("short_description", "Descripción corta", m.short_description, "Si no la conoces, déjala vacía.")}
        ${textareaField("description", "Descripción completa", "Déjalo vacío si todavía no tienes esta información.", 5)}
        ${textareaField("characteristics", "Características principales", "Déjalo vacío si no lo sabes.", 4)}
      </div>
    </details>

    <details class="admin-accordion">
      <summary>5. Beneficios</summary>
      <div class="admin-accordion-body">
        ${textareaField("benefits", "Beneficios (uno por línea)", "Un beneficio por línea. Déjalo vacío si no lo sabes.", 5)}
      </div>
    </details>

    <details class="admin-accordion">
      <summary>6. Modo de uso</summary>
      <div class="admin-accordion-body">
        ${textareaField("usage", "Modo de uso", "Déjalo vacío si no lo sabes.", 3)}
        ${textField("recommended_amount", "Cantidad recomendada", d.recommendedAmount, "Ej. 2-3 gotas")}
        ${textField("application_area", "Dónde aplicar", d.applicationArea, "")}
        ${textField("recommended_tool", "Herramienta recomendada", d.recommendedTool, "Ej. Brocha densa o esponja")}
        ${textField("application_order", "Orden de aplicación", d.applicationOrder, "Ej. Después de base, antes de polvo")}
        ${textareaField("application_tips", "Consejos de aplicación", "", 3)}
      </div>
    </details>

    <details class="admin-accordion">
      <summary>7. Ingredientes</summary>
      <div class="admin-accordion-body">
        ${textareaField("ingredients", "Ingredientes / INCI", "Déjalo vacío si no lo sabes.", 4)}
        ${textareaField("highlighted_ingredients", "Ingredientes destacados (uno por línea)", "", 3)}
        ${textField("active_ingredients", "Ingredientes activos", d.activeIngredients, "")}
        ${textareaField("ingredient_properties", "Propiedades de los ingredientes", "", 3)}
        ${textareaField("warnings", "Advertencias", "", 3)}
      </div>
    </details>

    <details class="admin-accordion">
      <summary>8. Fórmula y acabado</summary>
      <div class="admin-accordion-body">
        <div class="edit-row">
          ${textField("texture", "Textura", d.texture, "")}
          ${textField("formula_type", "Tipo de fórmula", d.formulaType, "")}
        </div>
        <div class="edit-row">
          ${textField("coverage", "Cobertura", d.coverage, "")}
          ${textField("intensity", "Intensidad", d.intensity, "")}
        </div>
        <div class="edit-row">
          ${textField("finish", "Acabado", d.finish, "")}
          ${textField("duration", "Duración", d.duration, "")}
        </div>
        <div class="edit-row">
          ${textField("resistance", "Resistencia", d.resistance, "")}
          ${textField("transfer", "Transferencia", d.transfer, "")}
        </div>
      </div>
    </details>

    <details class="admin-accordion">
      <summary>9. Tipo de piel</summary>
      <div class="admin-accordion-body">
        ${textField("skin_type", "Tipo de piel recomendado", d.skinType, "Ej. Mixta a grasa")}
        ${textareaField("skin_recommendations", "Recomendaciones específicas", "", 3)}
      </div>
    </details>

    <details class="admin-accordion">
      <summary>10. Información adicional</summary>
      <div class="admin-accordion-body">
        ${textareaField("claims", "Claims (uno por línea)", "", 3)}
        ${textareaField("certifications", "Certificaciones (una por línea)", "", 3)}
        <div class="edit-row-3">
          ${triStateField("cruelty_free", "Cruelty-free", d.crueltyFree)}
          ${triStateField("vegan", "Vegano", d.vegan)}
          ${triStateField("dermatologically_tested", "Dermatológicamente probado", d.dermatologicallyTested)}
        </div>
        <div class="edit-row">
          ${textField("country_of_manufacture", "País de fabricación", d.countryOfManufacture, "")}
        </div>
        ${textareaField("manufacturer_info", "Información del fabricante", "", 3)}
      </div>
    </details>

    <details class="admin-accordion">
      <summary>11. Merchandising VIBE</summary>
      <div class="admin-accordion-body">
        <div class="edit-row">
          ${textField("badge", "Badge", m.badge, "Escribe «Nuevo» para que aparezca en Novedades. Otros textos (ej. VIBE PICK) solo se muestran como etiqueta. Déjalo vacío si no aplica.")}
          <label>Orden editorial<input type="number" name="editorial_order" value="${m.editorial_order ?? ""}" placeholder="Déjalo vacío si no aplica."></label>
        </div>
        <label class="checkbox-field"><input type="checkbox" name="featured" ${m.featured ? "checked" : ""}> Producto destacado (aparece en «Más elegidos»)</label>
        ${textareaField("search_keywords", "Palabras clave (una por línea)", "Una palabra o frase clave por línea.", 3)}
        ${textField("commercial_angle", "Ángulo comercial VIBE", d.commercialAngle, "Nota interna de merchandising — no se muestra en el catálogo público.")}
        ${textField("usage_occasion", "Momento / ocasión de uso", d.usageOccasion, "Nota interna de merchandising — no se muestra en el catálogo público.")}
      </div>
    </details>

    <form id="editForm" class="edit-form">
      <h2>12. Publicación</h2>
      <label class="checkbox-field"><input type="checkbox" name="published" ${m.published ? "checked" : ""}> Publicado</label>
      <p id="publishHint" class="publish-hint hidden" role="status"></p>
      <div class="save-row">
        <span id="saveStatus" class="save-status"></span>
        <button type="button" id="cancelEdit" class="outline-admin">Cancelar</button>
        <button type="submit" class="button dark">Guardar cambios</button>
      </div>
    </form>
  `;

  organizeEditorTabs();

  // Fase 34 — el <form> real (#editForm) solo envuelve la sección de
  // Publicación (así el submit por Enter no queda atado a un acordeón en
  // particular), pero necesita leer TODOS los campos de arriba en el
  // submit: se listan explícitamente por name en vez de depender de que
  // estén dentro de <form> (los <details> viven fuera de él a propósito,
  // para que cada acordeón se pueda abrir/cerrar sin afectar el formulario).
  const ALL_FIELD_NAMES = [
    "image", "commercial_name", "brand", "line", "category", "subcategory_choice", "subcategory_other", "subcategory_other_reason", "product_type", "presentation",
    "net_content", "sku", "tone", "tone_code", "color", "variant", "main_image_alt",
    "what_is", "short_description", "description", "characteristics",
    "benefits", "usage", "recommended_amount", "application_area", "recommended_tool", "application_order", "application_tips",
    "ingredients", "highlighted_ingredients", "active_ingredients", "ingredient_properties", "warnings",
    "texture", "formula_type", "coverage", "intensity", "finish", "duration", "resistance", "transfer",
    "skin_type", "skin_recommendations",
    "claims", "certifications", "cruelty_free", "vegan", "dermatologically_tested", "country_of_manufacture", "manufacturer_info",
    "badge", "editorial_order", "featured", "published", "search_keywords", "commercial_angle", "usage_occasion",
  ];
  function readAllFields() {
    const out = {};
    for (const name of ALL_FIELD_NAMES) {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) continue;
      out[name] = el.type === "checkbox" ? el.checked : el.value;
    }
    return out;
  }

  // Los <textarea> se llenan por separado (en vez de interpolarlos en el
  // template de arriba) para no tener que sanitizar contenido largo
  // dentro de atributos/backticks — .value asigna el texto tal cual, sin
  // riesgo de romper el HTML generado.
  $("textarea[name=what_is]").value = d.whatIs || "";
  $("textarea[name=description]").value = m.description || "";
  $("textarea[name=characteristics]").value = d.characteristics || "";
  $("textarea[name=benefits]").value = arrayFieldToText(m.benefits);
  // Fase 51 — bug real: "Modo de uso" nunca se precargaba, así que el
  // textarea abría vacío y cualquier guardado enviaba usage:null,
  // borrando el texto existente aunque nadie lo hubiera tocado.
  $("textarea[name=usage]").value = m.usage || "";
  $("textarea[name=application_tips]").value = d.applicationTips || "";
  $("textarea[name=ingredients]").value = m.ingredients || "";
  $("textarea[name=highlighted_ingredients]").value = arrayFieldToText(d.highlightedIngredients);
  $("textarea[name=ingredient_properties]").value = d.ingredientProperties || "";
  $("textarea[name=warnings]").value = d.warnings || "";
  $("textarea[name=skin_recommendations]").value = d.skinRecommendations || "";
  $("textarea[name=claims]").value = arrayFieldToText(d.claims);
  $("textarea[name=certifications]").value = arrayFieldToText(d.certifications);
  $("textarea[name=manufacturer_info]").value = d.manufacturerInfo || "";
  $("textarea[name=search_keywords]").value = arrayFieldToText(m.search_keywords);
  $("textarea[name=subcategory_other_reason]").value = d.subcategoryOtherReason || "";

  // Fase 53 — subcategoría efectiva según el selector.
  function currentSubcategory() {
    const choice = $('[name="subcategory_choice"]').value;
    if (choice === SUB_HISTORICAL) return subInitial.historical;
    if (choice === SUB_OTHER) return $('[name="subcategory_other"]').value.trim();
    return choice;
  }

  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = readAllFields();
    const isOther = fd.subcategory_choice === SUB_OTHER;
    if (isOther && (!fd.subcategory_other.trim() || fd.subcategory_other_reason.trim().length < MIN_OTHER_REASON)) {
      setSaveStatus(`No se guardó: «Otra» necesita un nombre y una justificación de al menos ${MIN_OTHER_REASON} caracteres (pestaña Identificación).`, true);
      return;
    }
    const payload = {
      product_id: product.id,
      image: fd.image || null,
      category: fd.category || null,
      subcategory: currentSubcategory() || null,
      brand: fd.brand || null,
      badge: fd.badge || null,
      presentation: fd.presentation || null,
      short_description: fd.short_description || null,
      description: fd.description || null,
      benefits: textToArrayField(fd.benefits || ""),
      ingredients: fd.ingredients || null,
      usage: fd.usage || null,
      search_keywords: textToArrayField(fd.search_keywords || ""),
      featured: Boolean(fd.featured),
      editorial_order: fd.editorial_order ? Number(fd.editorial_order) : null,
      published: Boolean(fd.published),
      // Fase 34 — los ~40 campos granulares viajan como un único objeto
      // estructurado; el servidor lo serializa hacia
      // catalog_metadata.additional_info (ver api/_lib/editorialDetails.js).
      additional_info: {
        commercialName: fd.commercial_name || null,
        line: fd.line || null,
        productType: fd.product_type || null,
        netContent: fd.net_content || null,
        tone: fd.tone || null,
        toneCode: fd.tone_code || null,
        color: fd.color || null,
        variant: fd.variant || null,
        sku: fd.sku || null,
        mainImageAlt: fd.main_image_alt || null,
        whatIs: fd.what_is || null,
        characteristics: fd.characteristics || null,
        recommendedAmount: fd.recommended_amount || null,
        applicationArea: fd.application_area || null,
        recommendedTool: fd.recommended_tool || null,
        applicationOrder: fd.application_order || null,
        applicationTips: fd.application_tips || null,
        highlightedIngredients: textToArrayField(fd.highlighted_ingredients || ""),
        activeIngredients: fd.active_ingredients || null,
        ingredientProperties: fd.ingredient_properties || null,
        warnings: fd.warnings || null,
        texture: fd.texture || null,
        formulaType: fd.formula_type || null,
        coverage: fd.coverage || null,
        intensity: fd.intensity || null,
        finish: fd.finish || null,
        duration: fd.duration || null,
        resistance: fd.resistance || null,
        transfer: fd.transfer || null,
        skinType: fd.skin_type || null,
        skinRecommendations: fd.skin_recommendations || null,
        claims: textToArrayField(fd.claims || ""),
        certifications: textToArrayField(fd.certifications || ""),
        crueltyFree: fd.cruelty_free || null,
        vegan: fd.vegan || null,
        dermatologicallyTested: fd.dermatologically_tested || null,
        countryOfManufacture: fd.country_of_manufacture || null,
        manufacturerInfo: fd.manufacturer_info || null,
        commercialAngle: fd.commercial_angle || null,
        usageOccasion: fd.usage_occasion || null,
        subcategoryOtherReason: isOther ? fd.subcategory_other_reason.trim() : fd.subcategory_choice === SUB_HISTORICAL ? d.subcategoryOtherReason || null : null,
      },
    };

    setSaveStatus("Guardando...");
    const saveRes = await adminFetch("/api/admin/catalog-metadata", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (saveRes.status === 401) {
      clearToken();
      showLogin("Token incorrecto o vencido.");
      return;
    }
    if (!saveRes.ok) {
      const errPayload = await saveRes.json().catch(() => ({}));
      setSaveStatus(`No se guardó: ${(errPayload && errPayload.error) || "error del servidor"}. Tus cambios siguen en el formulario.`, true);
      return;
    }
    editState.fichaDirty = false;
    await loadProducts();
    if (editState.promoDirty) {
      setSaveStatus("Ficha guardada. La promoción tiene cambios sin guardar: usa «Guardar promoción».");
      return;
    }
    setSaveStatus("Guardado.");
    setTimeout(() => $("#editDialog").close(), 500);
  });

  $("#cancelEdit").addEventListener("click", requestCloseEdit);

  // Fase 51 — guardar desde la barra superior (mismo envío que el botón
  // del final), estado visible arriba y abajo.
  function setSaveStatus(text, isError = false) {
    for (const id of ["#saveStatus", "#saveStatusTop"]) {
      const el = $(id);
      if (!el) continue;
      el.textContent = text;
      el.classList.toggle("save-error", isError);
    }
  }
  $("#saveTopBtn").addEventListener("click", () => $("#editForm").requestSubmit());

  // Fase 51 — cambios sin guardar: la ficha (este formulario) y la
  // promoción se guardan por separado; se rastrean por separado.
  editState.fichaDirty = false;
  editState.promoDirty = false;
  $("#editContent").addEventListener("input", (e) => {
    if (e.target.closest(".promo-section")) editState.promoDirty = true;
    else if (e.target.name) editState.fichaDirty = true;
  });
  $("#editContent").addEventListener("change", (e) => {
    if (e.target.closest(".promo-section")) editState.promoDirty = true;
    else if (e.target.name) editState.fichaDirty = true;
  });

  // Fase 51 — ubicación pública en vivo, sugerencias de subcategoría por
  // categoría y aviso al publicar sin categoría VIBE.
  const placementBase = { category: product.category, categoryGroup: product.categoryGroup };
  function refreshClassificationHints() {
    const category = $('[name="category"]').value || null;
    const sub = currentSubcategory();
    const choice = $('[name="subcategory_choice"]').value;
    $("#subcategoryOther").classList.toggle("hidden", choice !== SUB_OTHER);
    const where = placementText({ ...placementBase, editorialCategory: category });
    $("#placementHint").textContent = where
      ? `Se verá en el catálogo público en: ${where}${category ? "" : " (por categoría POS)"}.`
      : "Sin categoría VIBE, este producto solo aparece en «Todos» y en la búsqueda.";
    $("#placementHint").classList.toggle("placement-warn", !category);
    $("#summaryPlacement").textContent = $("#placementHint").textContent;
    $("#summaryClassification").textContent = category ? category + (sub ? " › " + sub : "") : "sin categoría VIBE";
    $("#subcategoryHint").textContent =
      choice === SUB_HISTORICAL
        ? `Revisión pendiente: «${sub}» no está en la lista${category ? " de " + category : ""}. Se conserva tal cual hasta que elijas otra opción.`
        : choice === SUB_OTHER
          ? "Revisión pendiente: «Otra» se guarda con su justificación (interna) y queda marcada para revisar."
          : "";
    $("#subcategoryHint").classList.toggle("review-hint", choice === SUB_HISTORICAL || choice === SUB_OTHER);
    const published = $('[name="published"]').checked;
    const chip = $("#editStatusChip");
    chip.textContent = published ? "Publicado" : "No publicado";
    chip.className = `pill ${published ? "pill-pink" : "pill-muted"}`;
    const hint = $("#publishHint");
    hint.classList.toggle("hidden", !(published && !category));
    if (published && !category) {
      hint.textContent = where
        ? `Se publicará sin categoría VIBE: aparecerá en ${where} solo por su categoría POS.`
        : "Se publicará sin categoría VIBE: solo aparecerá en «Todos» y en la búsqueda, no en Maquillaje, Skincare ni Accesorios.";
    }
  }
  $('[name="category"]').addEventListener("change", () => {
    // Conserva la elección si sigue siendo válida en la nueva categoría;
    // el valor histórico y «Otra» siempre siguen disponibles.
    const category = $('[name="category"]').value;
    const prev = $('[name="subcategory_choice"]').value;
    const keep = prev === SUB_HISTORICAL || prev === SUB_OTHER || isListedSubcategory(category, prev) ? prev : isListedSubcategory(category, storedSub) ? storedSub : "";
    $('[name="subcategory_choice"]').innerHTML = subcategoryOptionsHtml(category, { selected: keep, historical: subInitial.historical });
    refreshClassificationHints();
  });
  $('[name="subcategory_choice"]').addEventListener("change", refreshClassificationHints);
  $('[name="subcategory_other"]').addEventListener("input", refreshClassificationHints);
  $('[name="published"]').addEventListener("change", refreshClassificationHints);
  refreshClassificationHints();

  // Fase 41 — resumen en vivo + validación (promo_price siempre menor
  // al precio base, igual regla que ya aplica el servidor — se
  // recalcula acá solo para dar feedback inmediato, la fuente de
  // verdad sigue siendo la validación de api/admin/product-promo.js).
  function readPromoForm() {
    const priceStr = $("#promoPriceInput").value.trim();
    return {
      active: $("#promoActiveInput").checked,
      price: priceStr === "" ? null : Number(priceStr),
      start: $("#promoStartInput").value || null,
      end: $("#promoEndInput").value || null,
      text: $("#promoTextInput").value.trim() || null,
    };
  }
  function updatePromoSummary() {
    const f = readPromoForm();
    const errEl = $("#promoError");
    const saveBtn = $("#savePromoBtn");
    errEl.textContent = "";
    saveBtn.disabled = false;

    if (f.price != null && (!Number.isFinite(f.price) || f.price <= 0)) {
      errEl.textContent = "El precio promocional debe ser un número positivo.";
      saveBtn.disabled = true;
    } else if (f.price != null && f.price >= product.price) {
      errEl.textContent = "El precio promocional debe ser menor al precio base.";
      saveBtn.disabled = true;
    } else if (f.active && f.price == null) {
      errEl.textContent = "Necesitas un precio promocional para activar la promoción.";
      saveBtn.disabled = true;
    }

    const pct = f.price != null && f.price > 0 && f.price < product.price ? Math.round((1 - f.price / product.price) * 100) : null;
    $("#promoSummary").textContent = `Precio base: ${money(product.price)} · Precio promo: ${f.price != null ? money(f.price) : "—"} · Descuento: ${pct != null ? pct + "%" : "—"} · Estado: ${f.active ? "Activa" : "Inactiva"}`;
  }
  ["promoActiveInput", "promoPriceInput", "promoStartInput", "promoEndInput", "promoTextInput"].forEach((id) => {
    $(`#${id}`).addEventListener("input", updatePromoSummary);
  });
  updatePromoSummary();

  $("#savePromoBtn").addEventListener("click", async () => {
    const f = readPromoForm();
    const btn = $("#savePromoBtn"); // capturado antes del await — ver Fase 39, bug real de e.currentTarget tras await
    btn.disabled = true;
    $("#promoSaveStatus").textContent = "Guardando...";
    try {
      const patchRes = await adminFetch("/api/admin/product-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          promo_active: f.active,
          promo_price: f.price,
          promo_start: f.start,
          promo_end: f.end,
          promo_text: f.text,
        }),
      });
      if (patchRes.status === 401) {
        clearToken();
        showLogin("Token incorrecto o vencido.");
        return;
      }
      const payload = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) {
        $("#promoSaveStatus").textContent = "";
        $("#promoError").textContent = (payload && payload.error) || "No se pudo guardar la promoción.";
        return;
      }
      $("#promoSaveStatus").textContent = "Guardado.";
      editState.promoDirty = false;
      await loadProducts();
    } finally {
      btn.disabled = false;
    }
  });

  $("#uploadMainBtn").addEventListener("click", async () => {
    const file = $("#mainImageInput").files[0];
    const statusEl = $("#mainImageStatus");
    if (!file) {
      setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: selecciona un archivo primero.");
      return;
    }
    const result = await uploadProductImage(product.id, file, "main", statusEl);
    if (result) {
      $("#mainImagePreview").innerHTML = `<img src="${esc(result.image)}" alt="">`;
      $("input[name=image]").value = result.image || "";
      await loadProducts();
    }
  });

  $("#uploadSecondaryBtn").addEventListener("click", async () => {
    const file = $("#secondaryImageInput").files[0];
    const statusEl = $("#secondaryImageStatus");
    if (!file) {
      setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: selecciona un archivo primero.");
      return;
    }
    const result = await uploadProductImage(product.id, file, "secondary", statusEl);
    if (result) {
      $("#secondaryList").innerHTML = renderSecondaryThumbs(result.images);
      $("#secondaryImageInput").value = "";
      await loadProducts();
    }
  });

  $("#secondaryList").addEventListener("click", async (e) => {
    const btn = e.target.closest(".delete-secondary");
    if (!btn) return;
    if (!confirm("¿Eliminar esta imagen secundaria?")) return;
    const statusEl = $("#secondaryImageStatus");
    const result = await deleteSecondaryImage(product.id, btn.dataset.url, statusEl);
    if (result) {
      $("#secondaryList").innerHTML = renderSecondaryThumbs(result.images);
      setImageStatus(statusEl, "ok", "Imagen eliminada correctamente.");
      await loadProducts();
    }
  });

  $("#editDialog").showModal();
}

// ==========================================================================
// Fase 33 — Carrusel Hero. Habla con /api/admin/hero-slides y
// /api/admin/hero-slide-image, nunca con /api/admin/products ni
// /api/admin/catalog-metadata — completamente separado de la gestión de
// productos, tal como pide la fase (ninguna tabla nueva, ningún dato de
// producto involucrado).
// ==========================================================================

let heroState = { slides: [], loaded: false };

// Fase 52 — cinco áreas de trabajo (barra lateral / navegación inferior).
const ADMIN_VIEWS = ["home", "products", "taxonomy", "hero", "orders"];
function switchAdminView(view) {
  if (!ADMIN_VIEWS.includes(view)) view = "home";
  document.querySelectorAll("[data-view-panel]").forEach((el) => el.classList.toggle("hidden", el.dataset.viewPanel !== view));
  document.querySelectorAll("#adminNav .nav-item").forEach((el) => {
    const on = el.dataset.view === view;
    el.classList.toggle("active", on);
    if (on) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0 });
  if (view === "hero" && !heroState.loaded) loadHeroSlides();
  if ((view === "orders" || view === "home") && !ordersState.loaded) loadOrders().then(renderHome);
  if (view === "home") renderHome();
  if (view === "taxonomy") renderTaxonomy();
}

// Fase 52 — reparte las secciones del editor en pestañas. Solo MUEVE los
// nodos existentes (nunca los recrea ni elimina): todos los campos siguen
// dentro del editor, así readAllFields() y el guardado envían exactamente
// lo mismo que antes, aunque la pestaña esté oculta.
const EDITOR_TABS = [
  ["summary", "Resumen"],
  ["identity", "Identidad y clasificación"],
  ["images", "Imágenes"],
  ["content", "Contenido"],
  ["formula", "Fórmula"],
  ["promo", "Promoción"],
  ["merch", "Merchandising"],
];
const SECTION_TAB = {
  "Promoción VIBE": "promo",
  "2. Identificación": "identity",
  "3. Imágenes": "images",
  "4. Descripción": "content",
  "5. Beneficios": "content",
  "6. Modo de uso": "content",
  "7. Ingredientes": "formula",
  "8. Fórmula y acabado": "formula",
  "9. Tipo de piel": "formula",
  "10. Información adicional": "formula",
  "11. Merchandising VIBE": "merch",
};
function organizeEditorTabs() {
  const root = $("#editContent");
  root.querySelectorAll("details.admin-accordion").forEach((details) => {
    const title = details.querySelector("summary").textContent.trim();
    const section = document.createElement("section");
    section.className = "editor-section " + [...details.classList].filter((c) => c !== "admin-accordion").join(" ");
    section.dataset.tab = SECTION_TAB[title] || "content";
    const h = document.createElement("h2");
    h.className = "editor-section-title";
    h.textContent = title.replace(/^\d+\.\s*/, "");
    section.appendChild(h);
    const body = details.querySelector(".admin-accordion-body");
    while (body.firstChild) section.appendChild(body.firstChild);
    details.replaceWith(section);
  });
  const pos = root.querySelector(".edit-pos");
  if (pos) pos.dataset.tab = "summary";
  const form = root.querySelector("#editForm");
  if (form) form.dataset.tab = "summary";
  // Sin la numeración de la ficha larga anterior (1. … 12.): ahora el orden lo dan las pestañas.
  root.querySelectorAll(".edit-pos > h2, #editForm > h2").forEach((h) => {
    if (h.firstChild && h.firstChild.nodeType === Node.TEXT_NODE) h.firstChild.textContent = h.firstChild.textContent.replace(/^\d+\.\s*/, "");
  });

  const tabbar = document.createElement("nav");
  tabbar.className = "editor-tabs";
  tabbar.setAttribute("role", "tablist");
  tabbar.innerHTML = EDITOR_TABS.map(([key, label], i) => `<button type="button" role="tab" class="editor-tab${i === 0 ? " active" : ""}" data-tab-target="${key}" aria-selected="${i === 0}">${label}</button>`).join("");
  root.querySelector(".edit-actionbar").after(tabbar);
  const show = (key) => {
    root.querySelectorAll("[data-tab]").forEach((el) => (el.hidden = el.dataset.tab !== key));
    tabbar.querySelectorAll(".editor-tab").forEach((b) => {
      const on = b.dataset.tabTarget === key;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("#editDialog").scrollTop = 0;
  };
  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest(".editor-tab");
    if (b) show(b.dataset.tabTarget);
  });
  show("summary");
}

async function loadHeroSlides() {
  $("#heroLoadError").classList.add("hidden");
  const res = await adminFetch("/api/admin/hero-slides");
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return;
  }
  if (!res.ok) {
    $("#heroLoadError").textContent = "No se pudo cargar el carrusel Hero. Intenta de nuevo.";
    $("#heroLoadError").classList.remove("hidden");
    return;
  }
  const data = await res.json();
  heroState.slides = (data.slides || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  heroState.loaded = true;
  renderHeroTable();
}

function heroContentSummary(s) {
  const parts = [s.title, s.eyebrow, s.subtitle].filter(Boolean);
  return parts.length ? esc(parts[0]) : `<span class="section-hint">Sin texto (solo imagen)</span>`;
}

function renderHeroTable() {
  const list = heroState.slides;
  $("#heroRows").innerHTML = list.length
    ? list
        .map(
          (s, i) => `<tr>
        <td><div class="hero-thumb">${s.image ? `<img src="${esc(s.image)}" alt="">` : `<span class="no-image">Sin imagen</span>`}</div></td>
        <td class="hero-content-cell">
          <span class="prod-name">${heroContentSummary(s)}</span>
          ${s.ctaText ? `<span class="section-hint">CTA: ${esc(s.ctaText)} → ${esc(s.ctaHref || "#catalogo")}</span>` : ""}
        </td>
        <td>
          <div class="reorder-btns">
            <button type="button" data-move="up" data-id="${esc(s.id)}" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
            <button type="button" data-move="down" data-id="${esc(s.id)}" ${i === list.length - 1 ? "disabled" : ""} aria-label="Bajar">↓</button>
          </div>
          ${i + 1}
        </td>
        <td>
          <button type="button" class="toggle-active" data-toggle="${esc(s.id)}" title="${s.active ? "Desactivar" : "Activar"}">
            ${s.active ? `<span class="pill pill-ok">Activo</span>` : `<span class="pill pill-muted">Inactivo</span>`}
          </button>
        </td>
        <td>
          <button class="edit-link" data-edit-slide="${esc(s.id)}">Editar</button>
          <button class="delete-slide" data-delete-slide="${esc(s.id)}">Eliminar</button>
        </td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5"><span class="section-hint">Todavía no hay ningún slide. Crea el primero con "+ Nuevo slide".</span></td></tr>`;
}

// Fase 36.1 — bug reportado: cuando la URL de una imagen del Hero no
// carga (objeto borrado, red, URL corrupta, etc.), el <img> roto se veía
// simplemente como el fondo oscuro de .hero-thumb/.hero-preview — un
// "preview negro" indistinguible de un error real, exactamente lo que se
// pidió evitar (nunca un fallback silencioso). El evento "error" de <img>
// no burbujea, así que se escucha una sola vez en fase de captura sobre
// todo el documento (cubre tabla y diálogo de edición sin listeners por
// fila) y se reemplaza la imagen rota por un estado de error visible.
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!img || img.tagName !== "IMG") return;
    const container = img.closest(".hero-thumb, .hero-preview");
    if (!container || container.querySelector(".hero-img-error")) return;
    img.remove();
    const notice = document.createElement("span");
    notice.className = "hero-img-error";
    notice.textContent = "⚠ No se pudo cargar la imagen";
    container.appendChild(notice);
  },
  true
);

async function patchSlide(id, fields) {
  const res = await adminFetch("/api/admin/hero-slides", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...fields }),
  });
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return null;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert((payload && payload.error) || "No se pudo guardar el cambio.");
    return null;
  }
  return payload;
}

// Fase 36 — antes, mover una fila hacía dos patchSlide() secuenciales (uno
// por slide). Cada uno era su propio read-modify-write del manifiesto
// completo, así que el segundo podía escribir sobre una copia que no
// incluía lo que el primero acababa de guardar y perder ese cambio. Un
// solo PATCH con { reorder: [...] } aplica ambos `order` en un único
// read-modify-write en el servidor — ver api/admin/hero-slides.js.
async function reorderSlides(updates) {
  const res = await adminFetch("/api/admin/hero-slides", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reorder: updates }),
  });
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return null;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert((payload && payload.error) || "No se pudo reordenar.");
    return null;
  }
  return payload;
}

// Fase 39 — construye las opciones de cada sub-selector del destino de
// Hero a partir de state.products (los mismos productos ya cargados
// para la pestaña Productos) — nunca un enum inventado, así que el
// editor de Hero nunca puede ofrecer un valor que el catálogo público
// no reconocería.
function heroLinkCategoryOptions(selected) {
  return getCategoriesInGroup(state.products)
    .map((c) => `<option value="${esc(c)}" ${selected === c ? "selected" : ""}>${esc(c)}</option>`)
    .join("");
}

function heroLinkSubcategoryOptions(selected) {
  const pairs = [];
  getCategoriesInGroup(state.products).forEach((c) => {
    getSubcategories(state.products, undefined, c).forEach((sub) => pairs.push({ category: c, subcategory: sub }));
  });
  return pairs
    .map((p) => {
      const value = `${p.category}::${p.subcategory}`;
      return `<option value="${esc(value)}" ${selected === value ? "selected" : ""}>${esc(p.category)} › ${esc(p.subcategory)}</option>`;
    })
    .join("");
}

function heroLinkProductOptions(selected) {
  return state.products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((p) => `<option value="${p.id}" ${String(selected) === String(p.id) ? "selected" : ""}>#${p.id} — ${esc(p.name)}</option>`)
    .join("");
}

function heroLinkSectionOptions(selected) {
  return Object.entries(SECTION_DESTINATIONS)
    .map(([id, label]) => `<option value="${id}" ${selected === id ? "selected" : ""}>${esc(label)}</option>`)
    .join("");
}

// Fase 39 — un slide sin linkType configurado (legado, previo a esta
// fase) se representa acá como "internal_route" (reusa ctaHref, que es
// exactamente lo que ese slide ya hace hoy) en vez de "Sin enlace" — si
// el admin abre un slide legado y lo guarda por otro motivo (ej. solo
// cambiar el orden/activo) sin tocar este fieldset nuevo, el resultado
// debe seguir siendo el mismo comportamiento de siempre, nunca un slide
// que de repente deja de navegar a ningún lado.
function heroLinkFieldsetHtml(s) {
  const linkType = s.linkType || "internal_route";
  const selectedCategory = linkType === "category" ? s.linkTarget || "" : "";
  const selectedSubcategoryValue = linkType === "subcategory" && s.linkTarget ? `${s.linkTarget.category}::${s.linkTarget.subcategory}` : "";
  const selectedProduct = linkType === "product" ? s.linkTarget || "" : "";
  const selectedSection = linkType === "section" ? s.linkTarget || "" : "";

  return `<fieldset class="hero-link-fieldset">
    <legend>Destino al hacer clic</legend>
    <label>Tipo de destino
      <select name="link_type">
        <option value="none" ${linkType === "none" ? "selected" : ""}>Sin enlace</option>
        <option value="category" ${linkType === "category" ? "selected" : ""}>Categoría</option>
        <option value="subcategory" ${linkType === "subcategory" ? "selected" : ""}>Subcategoría</option>
        <option value="product" ${linkType === "product" ? "selected" : ""}>Producto</option>
        <option value="section" ${linkType === "section" ? "selected" : ""}>Sección</option>
        <option value="internal_route" ${linkType === "internal_route" ? "selected" : ""}>Ruta interna (usa "Destino del CTA" de arriba)</option>
      </select>
    </label>
    <label class="hero-link-sub${linkType === "category" ? "" : " hidden"}" data-link-type="category">Categoría
      <select name="link_category">
        <option value="">Selecciona una categoría...</option>
        ${heroLinkCategoryOptions(selectedCategory)}
      </select>
    </label>
    <label class="hero-link-sub${linkType === "subcategory" ? "" : " hidden"}" data-link-type="subcategory">Subcategoría
      <select name="link_subcategory">
        <option value="">Selecciona una subcategoría...</option>
        ${heroLinkSubcategoryOptions(selectedSubcategoryValue)}
      </select>
    </label>
    <label class="hero-link-sub${linkType === "product" ? "" : " hidden"}" data-link-type="product">Producto
      <select name="link_product">
        <option value="">Buscar producto...</option>
        ${heroLinkProductOptions(selectedProduct)}
      </select>
    </label>
    <label class="hero-link-sub${linkType === "section" ? "" : " hidden"}" data-link-type="section">Sección
      <select name="link_section">
        <option value="">Selecciona una sección...</option>
        ${heroLinkSectionOptions(selectedSection)}
      </select>
    </label>
    <p id="heroLinkPreview" class="section-hint"></p>
  </fieldset>`;
}

// Comparte la misma lógica de "qué linkTarget corresponde a este
// linkType" entre el preview en vivo y el submit real — nunca se
// duplica el parseo entre los dos.
function parseHeroLinkFromForm(fd) {
  const linkType = fd.get("link_type") || "internal_route";
  let linkTarget = null;
  if (linkType === "category") linkTarget = fd.get("link_category") || null;
  else if (linkType === "subcategory") {
    const raw = fd.get("link_subcategory") || "";
    const [category, subcategory] = raw.split("::");
    linkTarget = subcategory ? { category, subcategory } : null;
  } else if (linkType === "product") linkTarget = fd.get("link_product") || null;
  else if (linkType === "section") linkTarget = fd.get("link_section") || null;
  return { linkType, linkTarget };
}

function updateHeroLinkVisibility() {
  const form = $("#heroEditForm");
  if (!form) return;
  const fd = new FormData(form);
  const { linkType, linkTarget } = parseHeroLinkFromForm(fd);
  form.querySelectorAll(".hero-link-sub").forEach((el) => {
    el.classList.toggle("hidden", el.dataset.linkType !== linkType);
  });
  const preview = $("#heroLinkPreview");
  if (preview) {
    preview.textContent = "Destino: " + describeSlideDestination({ linkType, linkTarget, ctaHref: fd.get("cta_href") });
  }
}

function heroPreviewHtml(fields) {
  const hasCopy = fields.eyebrow || fields.title || fields.subtitle || fields.ctaText;
  return `<div class="hero-preview">
    ${fields.image ? `<img src="${esc(fields.image)}" alt="">` : `<span class="no-image">Sin imagen todavía</span>`}
    ${
      hasCopy
        ? `<div class="hero-preview-copy">
      ${fields.eyebrow ? `<p>${esc(fields.eyebrow)}</p>` : ""}
      ${fields.title ? `<h3>${esc(fields.title)}</h3>` : ""}
      ${fields.ctaText ? `<span>${esc(fields.ctaText)}</span>` : ""}
    </div>`
        : ""
    }
  </div>`;
}

function updateHeroPreview() {
  const form = $("#heroEditForm");
  if (!form) return;
  const fd = new FormData(form);
  $("#heroPreviewBox").innerHTML = heroPreviewHtml({
    image: $("#heroPreviewBox").dataset.image || "",
    eyebrow: fd.get("eyebrow"),
    title: fd.get("title"),
    subtitle: fd.get("subtitle"),
    ctaText: fd.get("cta_text"),
  });
}

async function uploadHeroImage(slideId, file, slot, statusEl) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: tipo de archivo no permitido (usa WebP, JPEG o PNG).");
    return null;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    setImageStatus(
      statusEl,
      "error",
      `No se guardó la imagen. Motivo: pesa ${(file.size / 1024 / 1024).toFixed(1)}MB; el máximo permitido es ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB.`
    );
    return null;
  }
  setImageStatus(statusEl, "pending", "Subiendo...");
  let dataUrl;
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: no se pudo leer el archivo.");
    return null;
  }
  const res = await adminFetch("/api/admin/hero-slide-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slide_id: slideId, slot, contentType: file.type, dataBase64: dataUrl }),
  });
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return null;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload && Array.isArray(payload.details) ? payload.details.join(" ") : null;
    // Fase 34, sección 12 — el servidor ya reintenta varios segundos
    // antes de responder esto (ver loadSlidesUntilFound en
    // api/_lib/heroSlides.js): si aun así llega este error específico,
    // es casi siempre una demora real de Storage al propagar la
    // creación del slide, no un id inválido de verdad. Un mensaje claro
    // y accionable en vez del texto crudo del servidor.
    if (payload && payload.error === "Ese slide_id no existe.") {
      setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: el slide se acaba de crear y Storage todavía no lo detecta. Espera unos segundos y vuelve a intentar la subida.");
      return null;
    }
    setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: " + (detail || (payload && payload.error) || "error desconocido."));
    return null;
  }
  if (payload.warnings && payload.warnings.length) {
    // 300KB es un objetivo, nunca un límite duro (confirmado contra el
    // handler real: un archivo de 498KB responde 200 y se guarda) — el
    // texto lo deja explícito para que nunca se lea como un rechazo.
    setImageStatus(statusEl, "warn", "Imagen guardada correctamente. Advertencia: " + payload.warnings.join(" "));
  } else {
    setImageStatus(statusEl, "ok", "Imagen guardada correctamente.");
  }
  return payload.slide;
}

// Fase 34, sección 12 — corrige el error real "Ese slide_id no existe.":
// antes, "+ Nuevo slide" abría el diálogo en un modo intermedio sin
// slide real (isNew), y solo se creaba la fila al enviar el formulario
// de contenido; la carga de imagen quedaba oculta hasta ese punto, pero
// cualquier fricción entre ambos pasos (doble clic, conexión lenta,
// reabrir el diálogo) podía dejar al Admin intentando subir una imagen
// para un id que todavía no existía en el manifiesto. Ahora "+ Nuevo
// slide" crea el draft en el servidor de inmediato (POST vacío, activo:
// false) y el diálogo de edición SIEMPRE recibe un slide real, con un id
// real, desde el primer render — nunca hay una ventana donde subir una
// imagen pueda apuntar a un slide inexistente.
function openHeroEdit(slide) {
  const s = slide;

  $("#heroEditContent").innerHTML = `
    <div class="edit-images">
      <h2>Editar slide</h2>
      <div id="heroPreviewBox" data-image="${esc(s.image || "")}">${heroPreviewHtml(s)}</div>
      <div class="image-block">
        <p class="image-block-label">Imagen desktop (horizontal)</p>
        <input type="file" id="heroDesktopInput" accept="image/webp,image/jpeg,image/png">
        <button type="button" id="uploadHeroDesktopBtn" class="button dark">Subir / reemplazar</button>
        <p id="heroDesktopStatus" class="image-status"></p>
      </div>
      <div class="image-block">
        <p class="image-block-label">Imagen mobile (opcional, 4:5)</p>
        <div class="hero-thumb" id="heroMobileThumb">${s.mobileImage ? `<img src="${esc(s.mobileImage)}" alt="">` : `<span class="no-image">Sin imagen</span>`}</div>
        <input type="file" id="heroMobileInput" accept="image/webp,image/jpeg,image/png">
        <button type="button" id="uploadHeroMobileBtn" class="button">Subir / reemplazar</button>
        <p id="heroMobileStatus" class="image-status"></p>
      </div>
    </div>
    <form id="heroEditForm" class="edit-form">
      <h2>Contenido (todo opcional — un slide puede ser solo imagen)</h2>
      <label>Eyebrow<input name="eyebrow" value="${esc(s.eyebrow || "")}" placeholder="Ej. NUEVA COLECCIÓN"></label>
      <label>Título<input name="title" value="${esc(s.title || "")}" placeholder="Déjalo vacío si el slide es solo imagen."></label>
      <label>Subtítulo<input name="subtitle" value="${esc(s.subtitle || "")}" placeholder="Opcional."></label>
      <div class="edit-row">
        <label>Texto del CTA<input name="cta_text" value="${esc(s.ctaText || "")}" placeholder="Ej. Explorar catálogo"></label>
        <label>Destino del CTA<input name="cta_href" value="${esc(s.ctaHref || "")}" placeholder="#catalogo, /discover, o https://..."></label>
      </div>
      ${heroLinkFieldsetHtml(s)}
      <label>Texto alternativo (accesibilidad)<input name="alt" value="${esc(s.alt || "")}" placeholder="Describe la imagen para lectores de pantalla."></label>
      <label class="checkbox-field"><input type="checkbox" name="active" ${s.active ? "checked" : ""}> Activo (visible en Home)</label>
      <div class="save-row">
        <span id="heroSaveStatus" class="save-status"></span>
        <button type="button" id="cancelHeroEdit" class="outline-admin">Cerrar</button>
        <button type="submit" class="button dark">Guardar cambios</button>
      </div>
    </form>
  `;

  $("#heroEditForm").addEventListener("input", updateHeroPreview);
  $("#heroEditForm").addEventListener("input", updateHeroLinkVisibility);
  updateHeroLinkVisibility();

  $("#heroEditForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { linkType, linkTarget } = parseHeroLinkFromForm(fd);
    const fields = {
      eyebrow: fd.get("eyebrow") || null,
      title: fd.get("title") || null,
      subtitle: fd.get("subtitle") || null,
      ctaText: fd.get("cta_text") || null,
      ctaHref: fd.get("cta_href") || null,
      alt: fd.get("alt") || null,
      active: fd.get("active") === "on",
      linkType,
      linkTarget,
    };
    $("#heroSaveStatus").textContent = "Guardando...";
    const saved = await patchSlide(s.id, fields);
    if (!saved) {
      $("#heroSaveStatus").textContent = "Error al guardar.";
      return;
    }
    $("#heroSaveStatus").textContent = "Guardado.";
    await loadHeroSlides();
    setTimeout(() => $("#heroEditDialog").close(), 400);
  });

  $("#cancelHeroEdit").addEventListener("click", () => $("#heroEditDialog").close());

  $("#uploadHeroDesktopBtn").addEventListener("click", async (e) => {
    const file = $("#heroDesktopInput").files[0];
    const statusEl = $("#heroDesktopStatus");
    if (!file) {
      setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: selecciona un archivo primero.");
      return;
    }
    // Fase 39 — bug real encontrado al probar creación repetida de
    // slides: `Event.currentTarget` deja de apuntar al elemento una vez
    // que el listener async pasa su primer `await` (así lo define el
    // spec de DOM Events — el navegador lo resetea a null apenas
    // termina el despacho síncrono del evento). El `finally` de abajo
    // corría con `e.currentTarget === null`, lanzaba silenciosamente, y
    // el botón quedaba deshabilitado para siempre. Se captura la
    // referencia real ANTES del await.
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const updated = await uploadHeroImage(s.id, file, "desktop", statusEl);
      if (updated) {
        $("#heroPreviewBox").dataset.image = updated.image || "";
        updateHeroPreview();
        await loadHeroSlides();
      }
    } finally {
      btn.disabled = false;
    }
  });
  $("#uploadHeroMobileBtn").addEventListener("click", async (e) => {
    const file = $("#heroMobileInput").files[0];
    const statusEl = $("#heroMobileStatus");
    if (!file) {
      setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: selecciona un archivo primero.");
      return;
    }
    const btn = e.currentTarget; // ver comentario arriba (mismo bug/fix)
    btn.disabled = true;
    try {
      const updated = await uploadHeroImage(s.id, file, "mobile", statusEl);
      if (updated) {
        // Fase 36.1 — antes esta miniatura no existía: subir la imagen
        // mobile no tenía NINGÚN efecto visible en el diálogo (el preview
        // grande siempre muestra la imagen desktop), lo que podía leerse
        // como "el upload no hizo nada" o confundirse con el de otro slide.
        $("#heroMobileThumb").innerHTML = updated.mobileImage ? `<img src="${esc(updated.mobileImage)}" alt="">` : `<span class="no-image">Sin imagen</span>`;
        await loadHeroSlides();
      }
    } finally {
      btn.disabled = false;
    }
  });

  $("#heroEditDialog").showModal();
}

// ==========================================================================
// Fase 39 — pestaña "Pedidos", de solo lectura. Habla únicamente con
// /api/admin/orders (GET) — nunca con /api/orders/create (ese es el
// endpoint público del checkout) ni con products/hero-slides. Sin
// acciones: no hay edición de estado ni reenvío de notificaciones acá.
//
// Fase 40 — VIBE decidió no usar WhatsApp automático: el número del
// cliente sigue mostrándose (es el dato que VIBE necesita para
// contactar manualmente por WhatsApp Business), pero la columna
// "WhatsApp enviado" se retira — nunca hubo un envío automático real
// que reportar, y dejarla visible sugería una automatización que no
// existe. whatsapp_notified sigue existiendo en Supabase (no se borra
// nada, no hay DDL) — solo deja de mostrarse como indicador operativo.
// ==========================================================================

let ordersState = { orders: [], loaded: false };

async function loadOrders() {
  $("#ordersLoadError").classList.add("hidden");
  const res = await adminFetch("/api/admin/orders");
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return;
  }
  if (!res.ok) {
    $("#ordersLoadError").textContent = "No se pudo cargar el listado de pedidos. Intenta de nuevo.";
    $("#ordersLoadError").classList.remove("hidden");
    ordersState.failed = true;
    return;
  }
  const data = await res.json();
  ordersState.orders = data.orders || [];
  ordersState.loaded = true;
  renderOrdersTable();
}

function formatOrderDate(iso) {
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const ORDER_STATUS_LABELS = { received: "Recibido", confirmed: "Confirmado", cancelled: "Cancelado" };

function renderOrdersTable() {
  const list = ordersState.orders;
  $("#ordersCount").textContent = list.length === 1 ? "1 pedido" : `${list.length} pedidos`;
  $("#ordersRows").innerHTML = list.length
    ? list
        .map(
          (o) => `<tr data-order-row="${esc(o.id)}">
        <td><b>#${esc(o.id)}</b></td>
        <td>${esc(formatOrderDate(o.created_at))}</td>
        <td>${esc(o.customer_name)}</td>
        <td>${esc(o.customer_phone)}</td>
        <td>${esc(o.customer_email)}</td>
        <td>${esc(o.customer_city)}</td>
        <td>${money(Number(o.total))}</td>
        <td>${esc(ORDER_STATUS_LABELS[o.status] || o.status)}</td>
        <td>${o.email_sent ? "Sí" : "No"}</td>
        <td><button type="button" class="order-delete" data-delete-order="${esc(o.id)}" aria-label="Eliminar pedido #${esc(o.id)}">Eliminar</button></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="10"><span class="section-hint">Todavía no hay ningún pedido registrado.</span></td></tr>`;
}

// ---- Fase 53 — eliminar un pedido (cualquier estado) ----
// El botón solo abre la confirmación; la eliminación real la autoriza el
// servidor (DELETE /api/admin/orders, protegido por el token de admin).
// Cancelar o Esc cierran el diálogo sin ninguna llamada.
let pendingOrderDelete = null;

function showOrdersNotice(text, isError = false) {
  const el = $("#ordersNotice");
  el.textContent = text;
  el.classList.toggle("is-error", isError);
  el.classList.remove("hidden");
}

function openOrderDelete(id) {
  const order = ordersState.orders.find((o) => String(o.id) === String(id));
  if (!order) return;
  pendingOrderDelete = order;
  $("#orderDeleteNumber").textContent = `#${order.id}`;
  $("#orderDeleteSummary").textContent = `${order.customer_name || "Sin nombre"} · ${formatOrderDate(order.created_at)} · ${money(Number(order.total))} · ${ORDER_STATUS_LABELS[order.status] || order.status}`;
  $("#orderDeleteError").classList.add("hidden");
  $("#orderDeleteConfirm").disabled = false;
  $("#orderDeleteConfirm").textContent = "Eliminar pedido";
  $("#orderDeleteDialog").showModal();
}

async function confirmOrderDelete() {
  const order = pendingOrderDelete;
  if (!order) return;
  const btn = $("#orderDeleteConfirm");
  btn.disabled = true;
  btn.textContent = "Eliminando…";
  let res;
  try {
    res = await adminFetch(`/api/admin/orders?id=${encodeURIComponent(order.id)}`, { method: "DELETE" });
  } catch {
    res = null;
  }
  if (res && res.status === 401) {
    $("#orderDeleteDialog").close();
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return;
  }
  if (res && (res.ok || res.status === 404)) {
    // 404: ya no existía (p. ej. eliminado en otra pestaña) — se quita igual.
    ordersState.orders = ordersState.orders.filter((o) => String(o.id) !== String(order.id));
    pendingOrderDelete = null;
    $("#orderDeleteDialog").close();
    renderOrdersTable();
    renderHome();
    showOrdersNotice(res.ok ? `Pedido #${order.id} eliminado.` : `El pedido #${order.id} ya no existía; se quitó del listado.`);
    return;
  }
  btn.disabled = false;
  btn.textContent = "Eliminar pedido";
  $("#orderDeleteError").textContent = "No se pudo eliminar el pedido. No se modificó nada; intenta de nuevo.";
  $("#orderDeleteError").classList.remove("hidden");
}

$("#ordersRows").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-delete-order]");
  if (btn) openOrderDelete(btn.dataset.deleteOrder);
});
$("#orderDeleteConfirm").addEventListener("click", confirmOrderDelete);
$("#orderDeleteDialog").addEventListener("close", () => {
  pendingOrderDelete = null;
});

// En mobile la barra lateral es navegación inferior (sin "Salir"): el
// botón de Inicio reutiliza exactamente el mismo cierre de sesión.
$("#mobileLogout").addEventListener("click", () => $("#logoutButton").click());
$("#adminNav").addEventListener("click", (e) => {
  const item = e.target.closest(".nav-item");
  if (item) switchAdminView(item.dataset.view);
});
// Accesos desde Inicio ("Ver en Productos", "Ver todos").
$("#homeApp").addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) {
    if (go.dataset.status) setStatusFilter(go.dataset.status);
    switchAdminView(go.dataset.goto);
    return;
  }
  const item = e.target.closest("[data-edit]");
  if (item) openEdit(Number(item.dataset.edit));
});
$("#taxonomyApp").addEventListener("click", (e) => {
  const item = e.target.closest("[data-edit]");
  if (item) openEdit(Number(item.dataset.edit));
});
$("#newSlideBtn").addEventListener("click", async (e) => {
  if (e.currentTarget.disabled) return;
  // Fase 39 — bug real encontrado al probar la creación de varios
  // slides en una sola sesión: `e.currentTarget` deja de ser válido
  // (el navegador lo resetea a null) apenas el listener async cruza su
  // primer `await` — el `finally` de abajo corría entonces con
  // `e.currentTarget === null`, lanzaba silenciosamente, y el botón
  // quedaba deshabilitado para siempre (había que refrescar la página
  // completa para poder crear un segundo slide). Se captura la
  // referencia real ANTES de cualquier await.
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    // Crea el draft en el servidor ANTES de abrir el diálogo — nunca hay
    // upload UI para un slide que todavía no existe (ver comentario arriba
    // de openHeroEdit).
    const res = await adminFetch("/api/admin/hero-slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 401) {
      clearToken();
      showLogin("Token incorrecto o vencido.");
      return;
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((payload && payload.error) || "No se pudo crear el slide.");
      return;
    }
    await loadHeroSlides();
    openHeroEdit(payload.slide);
  } finally {
    btn.disabled = false;
  }
});
$("#closeHeroEdit").addEventListener("click", () => $("#heroEditDialog").close());

$("#heroRows").addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit-slide]");
  if (editBtn) {
    const slide = heroState.slides.find((s) => s.id === editBtn.dataset.editSlide);
    if (slide) openHeroEdit(slide);
    return;
  }

  const toggleBtn = e.target.closest("[data-toggle]");
  const deleteBtn = e.target.closest("[data-delete-slide]");
  const moveBtn = e.target.closest("[data-move]");
  const actionBtn = toggleBtn || deleteBtn || moveBtn;
  if (!actionBtn || actionBtn.disabled) return;

  // Fase 36, sección 10 — activar/desactivar, eliminar y reordenar son
  // las tres acciones de esta tabla que van a la red; sin esto, un doble
  // clic mientras la primera solicitud sigue en curso dispara una
  // segunda antes de que la tabla se haya vuelto a renderizar. Se
  // liberan siempre en el finally (éxito o error) — nunca dependen de
  // que loadHeroSlides() las reemplace, que solo ocurre en el camino
  // feliz.
  // Solo se tocan los botones que no estaban ya deshabilitados por su
  // propio estado (las flechas ↑/↓ en el borde de la lista, ver
  // renderHeroTable) — nunca se los "reactiva" por error al terminar.
  const rowButtons = [...$("#heroRows").querySelectorAll("button")].filter((b) => !b.disabled);
  rowButtons.forEach((b) => (b.disabled = true));
  try {
    if (toggleBtn) {
      const slide = heroState.slides.find((s) => s.id === toggleBtn.dataset.toggle);
      if (slide) {
        const saved = await patchSlide(slide.id, { active: !slide.active });
        if (saved) await loadHeroSlides();
      }
      return;
    }
    if (deleteBtn) {
      if (!confirm("¿Eliminar este slide? Esta acción no se puede deshacer.")) return;
      const res = await adminFetch("/api/admin/hero-slides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteBtn.dataset.deleteSlide }),
      });
      if (res.status === 401) {
        clearToken();
        showLogin("Token incorrecto o vencido.");
        return;
      }
      if (res.ok) await loadHeroSlides();
      return;
    }
    // moveBtn
    // Fase 36.1 — bug real reportado: un slide creado antes de que
    // existiera el campo `order` (o cualquier otro sin un número real)
    // hace que a.order/b.order lleguen undefined/null; el backend los
    // rechaza (correctamente — "reorder inválido"). En vez de confiar en
    // los valores crudos de `order` de los dos slides que se intercambian
    // (que pueden no existir todavía), se recalculan de cero para TODA la
    // lista visible a partir de su posición actual ya ordenada — siempre
    // números enteros reales — y se envían todos juntos. Esto además
    // autocorrige cualquier slide viejo con `order` ausente la primera
    // vez que algo se reordena, sin necesitar una migración aparte.
    const id = moveBtn.dataset.id;
    const dir = moveBtn.dataset.move;
    const index = heroState.slides.findIndex((s) => s.id === id);
    const swapWith = dir === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= heroState.slides.length) return;
    const reordered = heroState.slides.slice();
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    const saved = await reorderSlides(reordered.map((s, i) => ({ id: s.id, order: i + 1 })));
    if (saved) await loadHeroSlides();
  } finally {
    rowButtons.forEach((b) => (b.disabled = false));
  }
});

$("#tokenSubmit").addEventListener("click", async () => {
  const value = $("#tokenInput").value.trim();
  if (!value) return;
  setToken(value);
  $("#loginError").classList.add("hidden");
  showApp();
  switchAdminView("home");
  await loadProducts();
});

$("#logoutButton").addEventListener("click", () => {
  clearToken();
  heroState = { slides: [], loaded: false };
  ordersState.loaded = false;
  switchAdminView("home");
  showLogin();
});

$("#searchInput").addEventListener("input", (e) => {
  state.search = e.target.value;
  renderTable();
});
function setStatusFilter(status) {
  state.status = status;
  document.querySelectorAll("#statusChips .chip").forEach((c) => {
    const on = c.dataset.status === status;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
  renderTable();
}
$("#statusChips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) setStatusFilter(chip.dataset.status);
});
$("#filterCategory").addEventListener("change", (e) => {
  state.category = e.target.value;
  renderTable();
});
$("#productRows").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit]");
  if (btn) openEdit(Number(btn.dataset.edit));
});
// Fase 51 — cerrar la ficha (X, Cancelar o Escape) con cambios sin
// guardar pide confirmación en vez de descartarlos en silencio.
const editState = { fichaDirty: false, promoDirty: false };
function unsavedChangesMessage() {
  const parts = [editState.fichaDirty && "la ficha", editState.promoDirty && "la promoción"].filter(Boolean);
  return parts.length ? `Tienes cambios sin guardar en ${parts.join(" y ")}. ¿Cerrar sin guardar?` : null;
}
function requestCloseEdit() {
  const msg = unsavedChangesMessage();
  if (msg && !confirm(msg)) return;
  $("#editDialog").close();
}
$("#closeEdit").addEventListener("click", requestCloseEdit);
$("#editDialog").addEventListener("cancel", (e) => {
  const msg = unsavedChangesMessage();
  if (msg && !confirm(msg)) e.preventDefault();
});
$("#editDialog").addEventListener("close", () => {
  editState.fichaDirty = false;
  editState.promoDirty = false;
});

(async function init() {
  if (getToken()) {
    showApp();
    switchAdminView("home");
    await loadProducts();
  } else {
    showLogin();
  }
})();
