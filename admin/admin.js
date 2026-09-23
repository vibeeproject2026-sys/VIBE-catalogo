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
      <h2>Información del POS (solo lectura)</h2>
      <div class="edit-pos-grid">
        <div><span>ID</span>${product.id}</div>
        <div><span>Nombre</span>${esc(product.name)}</div>
        <div><span>Categoría</span>${esc(product.category)}</div>
        <div><span>Precio</span>${money(product.price)}</div>
        <div><span>Disponibilidad</span>${Number(product.stock) > 0 ? "Disponible" : "Agotado"} (stock: ${product.stock})</div>
      </div>
    </div>
    <form id="editForm" class="edit-form">
      <h2>Información VIBE (editorial)</h2>
      <label>Imagen (ruta o URL)
        <input name="image" value="${esc(m.image || "")}" placeholder="assets/products/ejemplo.svg">
        <span class="image-hint">La carga de archivos todavía no está implementada — pega una ruta o URL ya existente. Ver docs/fase17-admin.md.</span>
      </label>
      <div class="edit-row">
        <label>Subcategoría
          <input name="subcategory" value="${esc(m.subcategory || "")}" placeholder="Ej. Brochas">
        </label>
        <label>Marca
          <input name="brand" value="${esc(m.brand || "")}">
        </label>
      </div>
      <div class="edit-row">
        <label>Badge
          <input name="badge" value="${esc(m.badge || "")}" placeholder="NUEVO / BEST SELLER / VIBE PICK">
        </label>
        <label>Presentación
          <input name="presentation" value="${esc(m.presentation || "")}">
        </label>
      </div>
      <label>Descripción corta
        <input name="short_description" value="${esc(m.short_description || "")}">
      </label>
      <label>Descripción
        <textarea name="description">${esc(m.description || "")}</textarea>
      </label>
      <label>Beneficios (uno por línea)
        <textarea name="benefits">${esc(arrayFieldToText(m.benefits))}</textarea>
      </label>
      <label>Ingredientes
        <textarea name="ingredients">${esc(m.ingredients || "")}</textarea>
      </label>
      <label>Modo de uso
        <textarea name="usage">${esc(m.usage || "")}</textarea>
      </label>
      <label>Keywords de búsqueda (uno por línea)
        <textarea name="search_keywords">${esc(arrayFieldToText(m.search_keywords))}</textarea>
      </label>
      <div class="edit-row-3">
        <label class="checkbox-field"><input type="checkbox" name="featured" ${m.featured ? "checked" : ""}> Destacado</label>
        <label>Orden editorial
          <input type="number" name="editorial_order" value="${m.editorial_order ?? ""}">
        </label>
        <label class="checkbox-field"><input type="checkbox" name="published" ${m.published ? "checked" : ""}> Publicado</label>
      </div>
      <div class="save-row">
        <span id="saveStatus" class="save-status"></span>
        <button type="submit" class="button dark">Guardar</button>
      </div>
    </form>
  `;

  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      product_id: product.id,
      image: fd.get("image") || null,
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

  $("#editDialog").showModal();
}

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
