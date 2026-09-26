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
  // Fase 34 — additional_info ya llega como objeto (el servidor lo
  // parsea, ver api/admin/catalog-metadata.js): los ~40 campos
  // granulares de la ficha VIBE. Todos en null/[] si el producto no
  // tiene ficha todavía — nunca undefined, el formulario siempre puede
  // poblarse sin checks extra.
  const d = m.additional_info || {};

  $("#editContent").innerHTML = `
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
            <input name="subcategory" list="subcategorySuggestions" value="${esc(m.subcategory || "")}" placeholder="Elige una sugerencia o escribe la tuya">
          </label>
        </div>
        <datalist id="subcategorySuggestions">${VIBE_SUBCATEGORY_SUGGESTIONS.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
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
          ${textField("badge", "Badge", m.badge, "Ej. NUEVO, VIBE PICK... déjalo vacío si no aplica.")}
          <label>Orden editorial<input type="number" name="editorial_order" value="${m.editorial_order ?? ""}" placeholder="Déjalo vacío si no aplica."></label>
        </div>
        <label class="checkbox-field"><input type="checkbox" name="featured" ${m.featured ? "checked" : ""}> Producto destacado</label>
        ${textareaField("search_keywords", "Palabras clave (una por línea)", "Una palabra o frase clave por línea.", 3)}
        ${textField("commercial_angle", "Ángulo comercial VIBE", d.commercialAngle, "Nota interna de merchandising — no se muestra en el catálogo público.")}
        ${textField("usage_occasion", "Momento / ocasión de uso", d.usageOccasion, "Nota interna de merchandising — no se muestra en el catálogo público.")}
      </div>
    </details>

    <form id="editForm" class="edit-form">
      <h2>12. Publicación</h2>
      <label class="checkbox-field"><input type="checkbox" name="published" ${m.published ? "checked" : ""}> Publicado</label>
      <div class="save-row">
        <span id="saveStatus" class="save-status"></span>
        <button type="button" id="cancelEdit" class="outline-admin">Cancelar</button>
        <button type="submit" class="button dark">Guardar cambios</button>
      </div>
    </form>
  `;

  // Fase 34 — el <form> real (#editForm) solo envuelve la sección de
  // Publicación (así el submit por Enter no queda atado a un acordeón en
  // particular), pero necesita leer TODOS los campos de arriba en el
  // submit: se listan explícitamente por name en vez de depender de que
  // estén dentro de <form> (los <details> viven fuera de él a propósito,
  // para que cada acordeón se pueda abrir/cerrar sin afectar el formulario).
  const ALL_FIELD_NAMES = [
    "image", "commercial_name", "brand", "line", "category", "subcategory", "product_type", "presentation",
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

  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = readAllFields();
    const payload = {
      product_id: product.id,
      image: fd.image || null,
      category: fd.category || null,
      subcategory: fd.subcategory || null,
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
      },
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
    e.currentTarget.disabled = true;
    try {
      const updated = await uploadHeroImage(s.id, file, "desktop", statusEl);
      if (updated) {
        $("#heroPreviewBox").dataset.image = updated.image || "";
        updateHeroPreview();
        await loadHeroSlides();
      }
    } finally {
      e.currentTarget.disabled = false;
    }
  });
  $("#uploadHeroMobileBtn").addEventListener("click", async (e) => {
    const file = $("#heroMobileInput").files[0];
    const statusEl = $("#heroMobileStatus");
    if (!file) {
      setImageStatus(statusEl, "error", "No se guardó la imagen. Motivo: selecciona un archivo primero.");
      return;
    }
    e.currentTarget.disabled = true;
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
      e.currentTarget.disabled = false;
    }
  });

  $("#heroEditDialog").showModal();
}

$("#tabProducts").addEventListener("click", () => switchAdminView("products"));
$("#tabHero").addEventListener("click", () => switchAdminView("hero"));
$("#newSlideBtn").addEventListener("click", async (e) => {
  if (e.currentTarget.disabled) return;
  e.currentTarget.disabled = true;
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
    e.currentTarget.disabled = false;
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
