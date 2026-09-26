// VIBE — Panel editorial (frontend). Talks only to /api/admin/*,
// never to /api/catalog/* and never imports js/app.js or
// js/data-source.js — completely separate from the public catalog.
//
// The admin token is entered once and kept in sessionStorage (cleared
// when the tab closes) — never in localStorage, never hardcoded, never
// sent anywhere except as the Authorization header on /api/admin/*
// requests.

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

// Uploads one image (slot: "main" | "secondary") via
// POST /api/admin/product-images. Returns the parsed response payload on
// success, or null (after writing a message into statusEl) on failure —
// the server is always re-checked even when the quick client-side check
// above already passed.
async function uploadProductImage(productId, file, slot, statusEl) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    statusEl.textContent = "Tipo de archivo no permitido. Usa WebP, JPEG o PNG.";
    return null;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    statusEl.textContent = `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)}MB; el máximo es ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB.`;
    return null;
  }
  statusEl.textContent = "Subiendo...";
  let dataUrl;
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    statusEl.textContent = "No se pudo leer el archivo.";
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
    statusEl.textContent = detail || (payload && payload.error) || "No se pudo subir la imagen.";
    return null;
  }
  statusEl.textContent = payload.warnings && payload.warnings.length ? "Guardada, con avisos: " + payload.warnings.join(" ") : "Imagen guardada.";
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
    if (statusEl) statusEl.textContent = (payload && payload.error) || "No se pudo eliminar la imagen.";
    return null;
  }
  return payload;
}

// Taxonomía VIBE aprobada en Fase 20.2 (docs/fase20-curaduria-editorial-decisiones.md):
// 3 grupos, 7 categorías. Se ofrecen aquí como opciones de selección
// manual — nunca se asignan automáticamente. "Sin categoría" siempre
// disponible; la administradora puede dejarlo vacío si no lo sabe.
const VIBE_CATEGORY_GROUPS = [
  { group: "Maquillaje", categories: ["Rostro", "Ojos", "Labios"] },
  { group: "Skincare", categories: ["Limpieza", "Tratamiento"] },
  { group: "Accesorios", categories: ["Herramientas de aplicación", "Complementos de belleza"] },
];

// Subcategorías propuestas en la Fase 20 — ofrecidas como sugerencias en
// un <datalist>, nunca forzadas: el campo sigue siendo texto libre, así
// que la administradora puede escribir cualquier otro valor o dejarlo
// vacío.
const VIBE_SUBCATEGORY_SUGGESTIONS = [
  "Base y corrector", "Polvo y fijador", "Iluminador", "Rubor",
  "Sombras", "Delineado", "Pestañas", "Cejas", "Kits de ojos",
  "Labiales", "Gloss y oils", "Kits de labios",
  "Limpiadores", "Tónicos", "Cremas faciales", "Contorno de ojos",
  "Cuello y escote", "Pestañas (crecimiento)", "Papel matificante",
  "Mascarillas", "Kits",
  "Brochas", "Esponjas", "Accesorios para el cabello", "Cuidado personal",
];

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
  $("#adminHeader").classList.remove("hidden");
  $("#app").classList.remove("hidden");
}
function showLogin(message) {
  $("#loginGate").classList.remove("hidden");
  $("#adminHeader").classList.add("hidden");
  $("#app").classList.add("hidden");
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
}

function populateCategoryFilter() {
  const select = $("#filterCategory");
  const current = select.value;
  const categories = [...new Set(state.products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "es"));
  select.innerHTML =
    `<option value="all">Todas las categorías</option>` +
    categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if (categories.includes(current)) select.value = current;
}

function filteredProducts() {
  const q = state.search.toLowerCase();
  return state.products.filter((p) => {
    if (state.category !== "all" && p.category !== state.category) return false;
    if (state.status === "published" && !p.published) return false;
    if (state.status === "unpublished" && p.published) return false;
    if (state.status === "available" && !p.available) return false;
    if (state.status === "unavailable" && p.available) return false;
    if (q && !(String(p.id).includes(q) || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))) {
      return false;
    }
    return true;
  });
}

function renderTable() {
  const list = filteredProducts();
  $("#resultCount").textContent = `${list.length} de ${state.products.length} productos`;
  $("#productRows").innerHTML = list
    .map(
      (p) => `<tr>
        <td><span class="prod-name">${esc(p.name)}</span><span class="prod-id">#${p.id}</span></td>
        <td>${esc(p.category)}</td>
        <td>${money(p.price)}</td>
        <td>${p.available ? `<span class="pill pill-ok">Disponible</span>` : `<span class="pill pill-warn">Agotado</span>`}</td>
        <td>${p.hasMetadata ? `<span class="pill pill-ok">Completa</span>` : `<span class="pill pill-muted">Pendiente</span>`}</td>
        <td>${p.published ? `<span class="pill pill-pink">Sí</span>` : `<span class="pill pill-muted">No</span>`}</td>
        <td>${p.featured ? `<span class="pill pill-pink">★</span>` : `<span class="pill pill-muted">—</span>`}</td>
        <td><button class="edit-link" data-edit="${p.id}">Editar</button></td>
      </tr>`
    )
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

async function openEdit(productId) {
  const res = await adminFetch(`/api/admin/catalog-metadata?product_id=${encodeURIComponent(productId)}`);
  if (res.status === 401) {
    clearToken();
    showLogin("Token incorrecto o vencido.");
    return;
  }
  if (!res.ok) {
    alert("No se pudo cargar el producto.");
    return;
  }
  const { product, metadata } = await res.json();
  const m = metadata || {};

  $("#editContent").innerHTML = `
    <div class="edit-pos">
      <h2>Producto <span class="section-hint">(POS · solo lectura)</span></h2>
      <div class="edit-pos-grid">
        <div><span>ID</span>${product.id}</div>
        <div><span>Nombre</span>${esc(product.name)}</div>
        <div><span>Categoría POS</span>${esc(product.category)}</div>
        <div><span>Precio</span>${money(product.price)}</div>
        <div><span>Disponibilidad</span>${Number(product.stock) > 0 ? "Disponible" : "Agotado"} (stock: ${product.stock})</div>
      </div>
    </div>
    <div class="edit-images">
      <h2>Imágenes</h2>
      <div class="image-block">
        <p class="image-block-label">Imagen principal</p>
        <div class="image-preview-main" id="mainImagePreview">
          ${m.image ? `<img src="${esc(m.image)}" alt="">` : `<span class="no-image">Sin imagen</span>`}
        </div>
        <input type="file" id="mainImageInput" accept="image/webp,image/jpeg,image/png">
        <button type="button" id="uploadMainBtn" class="button dark">Subir / reemplazar principal</button>
        <p id="mainImageStatus" class="image-status"></p>
      </div>
      <div class="image-block">
        <p class="image-block-label">Imágenes secundarias</p>
        <div id="secondaryList">${renderSecondaryThumbs(m.images)}</div>
        <input type="file" id="secondaryImageInput" accept="image/webp,image/jpeg,image/png">
        <button type="button" id="uploadSecondaryBtn" class="button">Agregar secundaria</button>
        <p id="secondaryImageStatus" class="image-status"></p>
      </div>
    </div>
    <form id="editForm" class="edit-form">
      <h2>Información del producto</h2>
      <label>Imagen (ruta o URL)
        <input name="image" value="${esc(m.image || "")}" placeholder="assets/products/ejemplo.svg">
        <span class="image-hint">Se actualiza automáticamente al subir una imagen principal arriba. También puedes pegar una ruta o URL manualmente (por ejemplo, una imagen legacy ya existente).</span>
      </label>
      <label>Descripción corta
        <input name="short_description" value="${esc(m.short_description || "")}" placeholder="Si no la conoces, déjala vacía.">
      </label>
      <label>Descripción
        <textarea name="description" rows="5" placeholder="Déjalo vacío si todavía no tienes esta información."></textarea>
      </label>
      <label>Beneficios (uno por línea)
        <textarea name="benefits" rows="5" placeholder="Un beneficio por línea. Déjalo vacío si no lo sabes."></textarea>
      </label>
      <label>Ingredientes
        <textarea name="ingredients" rows="4" placeholder="Déjalo vacío si no lo sabes."></textarea>
      </label>
      <label>Modo de uso
        <textarea name="usage" rows="4" placeholder="Déjalo vacío si no lo sabes."></textarea>
      </label>
      <div class="edit-row">
        <label>Presentación
          <input name="presentation" value="${esc(m.presentation || "")}" placeholder="Ej. 30ml, set de 5 unidades...">
        </label>
        <label>Marca
          <input name="brand" value="${esc(m.brand || "")}" placeholder="Déjalo vacío si no la conoces.">
        </label>
      </div>

      <h2>Clasificación VIBE</h2>
      <div class="edit-row">
        <label>Categoría VIBE
          <select name="category">${renderCategoryOptions(m.category || "")}</select>
        </label>
        <label>Subcategoría VIBE
          <input name="subcategory" list="subcategorySuggestions" value="${esc(m.subcategory || "")}" placeholder="Elige una sugerencia o escribe la tuya">
        </label>
      </div>
      <datalist id="subcategorySuggestions">
        ${VIBE_SUBCATEGORY_SUGGESTIONS.map((s) => `<option value="${esc(s)}">`).join("")}
      </datalist>
      <label>Palabras clave (una por línea)
        <textarea name="search_keywords" rows="3" placeholder="Una palabra o frase clave por línea."></textarea>
      </label>

      <h2>Editorial</h2>
      <div class="edit-row">
        <label>Badge
          <input name="badge" value="${esc(m.badge || "")}" placeholder="Ej. NUEVO, VIBE PICK... déjalo vacío si no aplica.">
        </label>
        <label>Orden editorial
          <input type="number" name="editorial_order" value="${m.editorial_order ?? ""}" placeholder="Déjalo vacío si no aplica.">
        </label>
      </div>
      <label class="checkbox-field"><input type="checkbox" name="featured" ${m.featured ? "checked" : ""}> Producto destacado</label>

      <h2>Información adicional</h2>
      <label>Notas, características u observaciones que no tengan un campo específico
        <textarea name="additional_info" rows="5" placeholder="Texto libre. No se procesa ni se interpreta automáticamente."></textarea>
      </label>

      <h2>Publicación</h2>
      <label class="checkbox-field"><input type="checkbox" name="published" ${m.published ? "checked" : ""}> Publicado</label>

      <div class="save-row">
        <span id="saveStatus" class="save-status"></span>
        <button type="button" id="cancelEdit" class="outline-admin">Cancelar</button>
        <button type="submit" class="button dark">Guardar cambios</button>
      </div>
    </form>
  `;

  // Los <textarea> se llenan por separado (en vez de interpolarlos en el
  // template de arriba) para no tener que sanitizar contenido largo
  // dentro de atributos/backticks — .value asigna el texto tal cual, sin
  // riesgo de romper el HTML generado.
  $("textarea[name=description]").value = m.description || "";
  $("textarea[name=benefits]").value = arrayFieldToText(m.benefits);
  $("textarea[name=ingredients]").value = m.ingredients || "";
  $("textarea[name=usage]").value = m.usage || "";
  $("textarea[name=search_keywords]").value = arrayFieldToText(m.search_keywords);
  $("textarea[name=additional_info]").value = m.additional_info || "";

  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      product_id: product.id,
      image: fd.get("image") || null,
      category: fd.get("category") || null,
      subcategory: fd.get("subcategory") || null,
      brand: fd.get("brand") || null,
      badge: fd.get("badge") || null,
      presentation: fd.get("presentation") || null,
      short_description: fd.get("short_description") || null,
      description: fd.get("description") || null,
      benefits: textToArrayField(fd.get("benefits") || ""),
      ingredients: fd.get("ingredients") || null,
      usage: fd.get("usage") || null,
      search_keywords: textToArrayField(fd.get("search_keywords") || ""),
      featured: fd.get("featured") === "on",
      editorial_order: fd.get("editorial_order") ? Number(fd.get("editorial_order")) : null,
      additional_info: fd.get("additional_info") || null,
      published: fd.get("published") === "on",
    };

    $("#saveStatus").textContent = "Guardando...";
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
      $("#saveStatus").textContent = "Error al guardar.";
      return;
    }
    $("#saveStatus").textContent = "Guardado.";
    await loadProducts();
    setTimeout(() => $("#editDialog").close(), 500);
  });

  $("#cancelEdit").addEventListener("click", () => $("#editDialog").close());

  $("#uploadMainBtn").addEventListener("click", async () => {
    const file = $("#mainImageInput").files[0];
    const statusEl = $("#mainImageStatus");
    if (!file) {
      statusEl.textContent = "Selecciona un archivo primero.";
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
      statusEl.textContent = "Selecciona un archivo primero.";
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
      statusEl.textContent = "Imagen eliminada.";
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

function switchAdminView(view) {
  const isHero = view === "hero";
  $("#tabProducts").classList.toggle("active", !isHero);
  $("#tabHero").classList.toggle("active", isHero);
  $("#app").classList.toggle("hidden", isHero);
  $("#heroApp").classList.toggle("hidden", !isHero);
  if (isHero && !heroState.loaded) loadHeroSlides();
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
    statusEl.textContent = "Tipo de archivo no permitido. Usa WebP, JPEG o PNG.";
    return null;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    statusEl.textContent = `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)}MB; el máximo es ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB.`;
    return null;
  }
  statusEl.textContent = "Subiendo...";
  let dataUrl;
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    statusEl.textContent = "No se pudo leer el archivo.";
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
    statusEl.textContent = detail || (payload && payload.error) || "No se pudo subir la imagen.";
    return null;
  }
  statusEl.textContent = payload.warnings && payload.warnings.length ? "Guardada, con avisos: " + payload.warnings.join(" ") : "Imagen guardada.";
  return payload.slide;
}

function openHeroEdit(slide) {
  const isNew = !slide;
  const s = slide || { id: null, image: null, mobileImage: null, eyebrow: "", title: "", subtitle: "", ctaText: "", ctaHref: "", alt: "", active: false };

  $("#heroEditContent").innerHTML = `
    <div class="edit-images">
      <h2>${isNew ? "Nuevo slide" : "Editar slide"}</h2>
      <div id="heroPreviewBox" data-image="${esc(s.image || "")}">${heroPreviewHtml(s)}</div>
      ${
        isNew
          ? `<p class="image-hint">Guarda el slide primero para poder subirle una imagen.</p>`
          : `<div class="image-block">
        <p class="image-block-label">Imagen desktop (horizontal)</p>
        <input type="file" id="heroDesktopInput" accept="image/webp,image/jpeg,image/png">
        <button type="button" id="uploadHeroDesktopBtn" class="button dark">Subir / reemplazar</button>
        <p id="heroDesktopStatus" class="image-status"></p>
      </div>
      <div class="image-block">
        <p class="image-block-label">Imagen mobile (opcional, 4:5)</p>
        <input type="file" id="heroMobileInput" accept="image/webp,image/jpeg,image/png">
        <button type="button" id="uploadHeroMobileBtn" class="button">Subir / reemplazar</button>
        <p id="heroMobileStatus" class="image-status"></p>
      </div>`
      }
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
      <label>Texto alternativo (accesibilidad)<input name="alt" value="${esc(s.alt || "")}" placeholder="Describe la imagen para lectores de pantalla."></label>
      <label class="checkbox-field"><input type="checkbox" name="active" ${s.active ? "checked" : ""}> Activo (visible en Home)</label>
      <div class="save-row">
        <span id="heroSaveStatus" class="save-status"></span>
        <button type="button" id="cancelHeroEdit" class="outline-admin">Cancelar</button>
        <button type="submit" class="button dark">${isNew ? "Crear slide" : "Guardar cambios"}</button>
      </div>
    </form>
  `;

  $("#heroEditForm").addEventListener("input", updateHeroPreview);

  $("#heroEditForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      eyebrow: fd.get("eyebrow") || null,
      title: fd.get("title") || null,
      subtitle: fd.get("subtitle") || null,
      ctaText: fd.get("cta_text") || null,
      ctaHref: fd.get("cta_href") || null,
      alt: fd.get("alt") || null,
      active: fd.get("active") === "on",
    };
    $("#heroSaveStatus").textContent = "Guardando...";
    if (isNew) {
      const res = await adminFetch("/api/admin/hero-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (res.status === 401) {
        clearToken();
        showLogin("Token incorrecto o vencido.");
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        $("#heroSaveStatus").textContent = (payload && payload.error) || "Error al crear.";
        return;
      }
      $("#heroSaveStatus").textContent = "Creado. Ahora puedes subirle una imagen.";
      await loadHeroSlides();
      $("#heroEditDialog").close();
      openHeroEdit(payload.slide);
      return;
    }
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

  if (!isNew) {
    $("#uploadHeroDesktopBtn").addEventListener("click", async () => {
      const file = $("#heroDesktopInput").files[0];
      const statusEl = $("#heroDesktopStatus");
      if (!file) {
        statusEl.textContent = "Selecciona un archivo primero.";
        return;
      }
      const updated = await uploadHeroImage(s.id, file, "desktop", statusEl);
      if (updated) {
        $("#heroPreviewBox").dataset.image = updated.image || "";
        updateHeroPreview();
        await loadHeroSlides();
      }
    });
    $("#uploadHeroMobileBtn").addEventListener("click", async () => {
      const file = $("#heroMobileInput").files[0];
      const statusEl = $("#heroMobileStatus");
      if (!file) {
        statusEl.textContent = "Selecciona un archivo primero.";
        return;
      }
      const updated = await uploadHeroImage(s.id, file, "mobile", statusEl);
      if (updated) await loadHeroSlides();
    });
  }

  $("#heroEditDialog").showModal();
}

$("#tabProducts").addEventListener("click", () => switchAdminView("products"));
$("#tabHero").addEventListener("click", () => switchAdminView("hero"));
$("#newSlideBtn").addEventListener("click", () => openHeroEdit(null));
$("#closeHeroEdit").addEventListener("click", () => $("#heroEditDialog").close());

$("#heroRows").addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit-slide]");
  if (editBtn) {
    const slide = heroState.slides.find((s) => s.id === editBtn.dataset.editSlide);
    if (slide) openHeroEdit(slide);
    return;
  }
  const toggleBtn = e.target.closest("[data-toggle]");
  if (toggleBtn) {
    const slide = heroState.slides.find((s) => s.id === toggleBtn.dataset.toggle);
    if (slide) {
      const saved = await patchSlide(slide.id, { active: !slide.active });
      if (saved) await loadHeroSlides();
    }
    return;
  }
  const deleteBtn = e.target.closest("[data-delete-slide]");
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
  const moveBtn = e.target.closest("[data-move]");
  if (moveBtn) {
    const id = moveBtn.dataset.id;
    const dir = moveBtn.dataset.move;
    const index = heroState.slides.findIndex((s) => s.id === id);
    const swapWith = dir === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= heroState.slides.length) return;
    const a = heroState.slides[index];
    const b = heroState.slides[swapWith];
    await patchSlide(a.id, { order: b.order });
    await patchSlide(b.id, { order: a.order });
    await loadHeroSlides();
  }
});

$("#tokenSubmit").addEventListener("click", async () => {
  const value = $("#tokenInput").value.trim();
  if (!value) return;
  setToken(value);
  $("#loginError").classList.add("hidden");
  showApp();
  await loadProducts();
});

$("#logoutButton").addEventListener("click", () => {
  clearToken();
  heroState = { slides: [], loaded: false };
  switchAdminView("products");
  showLogin();
});

$("#searchInput").addEventListener("input", (e) => {
  state.search = e.target.value;
  renderTable();
});
$("#filterStatus").addEventListener("change", (e) => {
  state.status = e.target.value;
  renderTable();
});
$("#filterCategory").addEventListener("change", (e) => {
  state.category = e.target.value;
  renderTable();
});
$("#productRows").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit]");
  if (btn) openEdit(Number(btn.dataset.edit));
});
$("#closeEdit").addEventListener("click", () => $("#editDialog").close());

(async function init() {
  if (getToken()) {
    showApp();
    await loadProducts();
  } else {
    showLogin();
  }
})();
