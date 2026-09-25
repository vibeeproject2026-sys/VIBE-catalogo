import { getProducts } from "./data-source.js";
import { getCart, addToCart, changeQuantity, removeFromCart, clearCart, getCartCount, getCartTotal } from "./cart.js";
import {
  getGroups,
  getCategoriesInGroup,
  getSubcategories,
  filterProducts,
  breadcrumbLabel,
  breadcrumbForState,
  selectFeatured,
  selectNew,
  selectPromotions,
  sortProducts,
  emptyStateCopy,
  activeFilterChips,
} from "./taxonomy.js";
import { readStateFromSearch, buildUrl } from "./url-state.js";

const WHATSAPP_NUMBER = "57XXXXXXXXXX";
// Fase 27: se agregan los filtros/orden de la PLP. Todos arrancan
// "apagados" — ningún filtro activo por defecto, igual que antes.
const DEFAULT_FILTERS = {
  group: "Todos",
  category: "Todos",
  subcategory: "Todos",
  search: "",
  available: false,
  promo: false,
  featuredOnly: false,
  newOnly: false,
  brand: null,
  sort: "relevance",
};
const state = { ...DEFAULT_FILTERS, product: null, variant: null, products: [] };
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const esc = s => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Reflects the current selection in the URL (shareable/bookmarkable,
// survives refresh) via replaceState — deliberately not pushState, so a
// filter click doesn't pile up browser-history entries a visitor would
// have to click "back" through one at a time. See docs/fase8-navigation.md.
function syncUrl() {
  try {
    window.history.replaceState(null, "", buildUrl(window.location.pathname, state));
  } catch {
    // history/URL APIs unavailable — non-fatal, navigation still works.
  }
}

function tabButton(label, active, dataAttr) {
  return `<button class="tab ${active ? "active" : ""}" data-${dataAttr}="${esc(label)}">${esc(label)}</button>`;
}

function renderNav() {
  const groups = ["Todos", ...getGroups(state.products)];
  $("#groupTabs").innerHTML = groups.map(g => tabButton(g, state.group === g, "group")).join("");

  const categoriesHere = getCategoriesInGroup(state.products, state.group);
  const showCategoryRow = state.group !== "Todos" && categoriesHere.length > 1;
  $("#categoryTabs").classList.toggle("hidden", !showCategoryRow);
  if (showCategoryRow) {
    const options = ["Todos", ...categoriesHere];
    $("#categoryTabs").innerHTML = options.map(c => tabButton(c, state.category === c, "category")).join("");
  }

  const effectiveCategory = state.category !== "Todos" ? state.category : (categoriesHere.length === 1 ? categoriesHere[0] : "Todos");
  const subcategoriesHere = getSubcategories(state.products, state.group, effectiveCategory);
  const showSubcategoryRow = subcategoriesHere.length > 1;
  $("#subcategoryTabs").classList.toggle("hidden", !showSubcategoryRow);
  if (showSubcategoryRow) {
    const options = ["Todos", ...subcategoriesHere];
    $("#subcategoryTabs").innerHTML = options.map(s => tabButton(s, state.subcategory === s, "subcategory")).join("");
  }
}

function productImage(p, cls = "product-photo") {
  return p.image ? `<img class="${cls}" src="${p.image}" alt="${esc(p.name)}" loading="lazy">` : `<span>${esc(p.imageLabel)}</span>`;
}

function productCard(p) {
  // Fase 26: precio promocional solo si promoActive viene resuelto por el
  // servidor (nunca calculado aquí) y hay un promoPrice real. El badge
  // visible prioriza el badge editorial (ej. "Nuevo") sobre el de
  // promoción — el precio tachado ya comunica la promoción por sí solo,
  // así que solo se usa promoText/"Promo" como badge cuando no hay
  // ningún badge editorial asignado.
  const showPromo = p.promoActive === true && p.promoPrice != null;
  const badgeText = p.badge || (showPromo ? p.promoText || "Promo" : null);
  return `<article class="card">
    <button class="card-img" data-product="${p.id}">
      ${badgeText ? `<span class="card-badge">${esc(badgeText)}</span>` : ""}
      ${productImage(p)}
    </button>
    <div class="card-body">
      <p class="product-category">${esc(p.category)}</p>
      <h3>${esc(p.name)}</h3>
      <p class="desc">${esc(p.shortDescription)}</p>
      <span class="price">${money(showPromo ? p.promoPrice : p.price)}</span>
      ${showPromo ? `<span class="old">${money(p.price)}</span>` : p.oldPrice ? `<span class="old">${money(p.oldPrice)}</span>` : ""}
      ${p.available === false ? `<span class="availability-badge">Agotado</span>` : ""}
      <button class="button dark" data-product="${p.id}">Ver producto</button>
    </div>
  </article>`;
}

function renderCatalogHeading() {
  const isAll = state.group === "Todos";
  $("#catalogTitle").textContent = isAll ? "Catálogo" : state.group;
  // Sin descripción editorial por categoría en el modelo de datos actual
  // (ver docs/fase27-plp.md) — se muestra la intro general solo en "Todos"
  // y se deja limpio en vez de inventar un texto por categoría.
  $("#catalogSubtitle").textContent = isAll ? "Esenciales de belleza seleccionados para elevar tu ritual." : "";
}

function renderBreadcrumbUI() {
  $("#catalogBreadcrumb").textContent = breadcrumbForState(state).join(" / ");
}

function renderActiveFilters() {
  const chips = activeFilterChips(state);
  const el = $("#activeFilters");
  if (!chips.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML =
    chips.map((c) => `<button type="button" class="filter-chip" data-remove="${esc(c.key)}">${esc(c.label)} ×</button>`).join("") +
    `<button type="button" class="filter-chip filter-chip-clear" id="clearAllFilters">Limpiar filtros</button>`;
}

function populateBrandFilter() {
  const brands = [...new Set(state.products.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const group = $("#filterBrandGroup");
  // No se muestra el filtro de marca si ningún producto público tiene una
  // marca curada todavía — mismo principio que ya aplican las pills de
  // subcategoría (nunca una opción que lleve a 0 resultados).
  if (!brands.length) {
    group.classList.add("hidden");
    return;
  }
  group.classList.remove("hidden");
  $("#filterBrandSelect").innerHTML =
    `<option value="">Todas</option>` +
    brands.map((b) => `<option value="${esc(b)}" ${state.brand === b ? "selected" : ""}>${esc(b)}</option>`).join("");
}

function renderProducts() {
  let list = filterProducts(state.products, state);
  list = sortProducts(list, state.sort);
  $("#productGrid").innerHTML = list.map(productCard).join("");

  const isEmpty = list.length === 0;
  $("#emptyState").classList.toggle("hidden", !isEmpty);
  if (isEmpty) $("#emptyState").textContent = emptyStateCopy(state);

  // Estado E (sección 17): la lista tiene resultados pero ninguno está
  // disponible — se avisa sin ocultar el grid (siguen siendo productos
  // reales, solo agotados).
  const allSoldOut = !isEmpty && list.every((p) => p.available === false);
  $("#allSoldOutNotice").classList.toggle("hidden", !allSoldOut);

  $("#resultCount").textContent = list.length === 1 ? "1 producto" : `${list.length} productos`;

  renderActiveFilters();
  renderCatalogHeading();
  renderBreadcrumbUI();
}

// Único punto de entrada para "algo del estado de filtros/orden cambió":
// re-renderiza navegación + grid (que a su vez actualiza heading,
// breadcrumb, chips y contador) y sincroniza la URL.
function applyFiltersAndRender() {
  renderNav();
  renderProducts();
  syncUrl();
}

// "Limpiar filtros" reinicia toda la PLP (incluida la navegación por
// mundo/categoría/subcategoría), no solo los filtros nuevos de Fase 27.
function resetFilters() {
  Object.assign(state, DEFAULT_FILTERS);
  $("#searchInput").value = "";
  applyFiltersAndRender();
}

function removeFilter(key) {
  if (key === "group") {
    state.group = "Todos";
    state.category = "Todos";
    state.subcategory = "Todos";
  } else if (key === "category") {
    state.category = "Todos";
    state.subcategory = "Todos";
  } else if (key === "subcategory") {
    state.subcategory = "Todos";
  } else if (key === "search") {
    state.search = "";
    $("#searchInput").value = "";
  } else if (key === "brand") {
    state.brand = null;
  } else {
    state[key] = false; // available / promo / featuredOnly / newOnly
  }
  applyFiltersAndRender();
}

function renderFeatured() {
  // Fase 24: destacados reales — solo featured === true, nunca "los
  // primeros N" del listado. Si todavía no hay ningún producto marcado
  // como destacado (curaduría en progreso), se muestra un estado vacío
  // en vez de inventar una selección. A diferencia de Novedades/
  // Promociones, esta sección permanece siempre visible (Fase 25/26):
  // el vacío es una invitación editorial a curar, no un error.
  const list = selectFeatured(state.products);
  $("#featuredGrid").innerHTML = list.length
    ? list.map(productCard).join("")
    : `<p class="empty">Estamos preparando la selección VIBE.</p>`;
}

// Fase 26 — Novedades: única fuente, badge === "Nuevo". Si no hay
// ninguna, la sección completa queda oculta (ausencia total, no un
// estado vacío visible) — así lo definió el blueprint v1.0.
function renderNovedades() {
  const list = selectNew(state.products);
  const section = $("#novedades");
  section.classList.toggle("hidden", list.length === 0);
  if (list.length) $("#novedadesGrid").innerHTML = list.map(productCard).join("");
}

// Fase 26 — Promociones: única fuente, promoActive === true (ya resuelto
// server-side). Sin datos reales, tanto la sección de Home como la
// entrada de navegación (desktop + mobile) quedan completamente
// ausentes — nunca un enlace vacío.
function renderPromociones() {
  const list = selectPromotions(state.products);
  const hasPromotions = list.length > 0;
  $("#promociones").classList.toggle("hidden", !hasPromotions);
  document.querySelectorAll("#navPromociones, #mobileNavPromociones").forEach((el) => el.classList.toggle("hidden", !hasPromotions));
  if (hasPromotions) $("#promocionesGrid").innerHTML = list.map(productCard).join("");
}

// Punto de entrada compartido por Shop by World, los enlaces de mundo del
// header, y los enlaces de Novedades/Promociones del header: reinicia
// todos los filtros y aplica exactamente los que se pidan, para que
// saltar desde el header nunca deje una combinación de filtros previa a
// medias.
function goToFilter(overrides) {
  Object.assign(state, DEFAULT_FILTERS, overrides);
  $("#searchInput").value = state.search;
  applyFiltersAndRender();
  $("#catalogo").scrollIntoView({ behavior: "smooth" });
}

function renderCategoryShowcase() {
  const groups = getGroups(state.products);
  $("#categoryShowcase").innerHTML = groups.map(g => {
    const count = state.products.filter(p => (p.categoryGroup || p.category) === g).length;
    return `<button class="category-card" data-group="${esc(g)}">
      <span>${count} producto${count === 1 ? "" : "s"}</span>
      <h3>${esc(g)}</h3>
      <span class="arrow">→</span>
    </button>`;
  }).join("");
}

function renderCart() {
  $("#cartCount").textContent = getCartCount();
  $("#cartTotal").textContent = money(getCartTotal());
  const items = getCart();
  $("#checkoutButton").disabled = !items.length;
  $("#checkoutButton").style.opacity = items.length ? "1" : ".45";
  $("#cartItems").innerHTML = items.length ? items.map(i => `<div class="cart-item">
    <div class="thumb">${i.image ? `<img src="${i.image}" alt="${esc(i.name)}">` : "VIBE"}</div>
    <div>
      <h3>${esc(i.name)}</h3>
      <div class="meta">${esc(i.variantName)}</div>
      <div class="qty">
        <button data-a="dec" data-p="${i.productId}" data-v="${i.variantId}">−</button>
        <span>${i.quantity}</span>
        <button data-a="inc" data-p="${i.productId}" data-v="${i.variantId}">+</button>
      </div>
      <button class="remove" data-a="del" data-p="${i.productId}" data-v="${i.variantId}">Eliminar</button>
    </div>
    <div class="cart-price">${money(i.price * i.quantity)}</div>
  </div>`).join("") : `<p class="empty">Tu carrito está vacío.</p>`;
}

function openCart() {
  $("#cartDrawer").classList.add("open");
  $("#cartDrawer").setAttribute("aria-hidden", "false");
  $("#overlay").classList.remove("hidden");
  renderCart();
}
function closeCart() {
  $("#cartDrawer").classList.remove("open");
  $("#cartDrawer").setAttribute("aria-hidden", "true");
  $("#overlay").classList.add("hidden");
}

function openProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  state.product = p;
  state.variant = p.variants[0].id;
  const unavailable = p.available === false;
  $("#productDetail").innerHTML = `<div class="detail-img">${productImage(p, "detail-photo")}</div>
  <div class="detail-copy">
    <p class="eyebrow">${esc(breadcrumbLabel(p))}</p>
    <h2>${esc(p.name)}</h2>
    <p class="description">${esc(p.description)}</p>
    <strong class="price" id="detailPrice">${money(p.variants[0].price)}</strong>
    ${unavailable ? `<span class="availability-badge">Agotado</span>` : ""}
    <div class="variants">${p.variants.map(v => `<button class="variant ${v.id === state.variant ? "selected" : ""}" data-variant="${v.id}">${esc(v.name)}</button>`).join("")}</div>
    <div class="section"><h3>Beneficios</h3><p>${p.benefits.map(esc).join(" · ")}</p></div>
    ${p.ingredients ? `<div class="section"><h3>Ingredientes</h3><p>${esc(p.ingredients)}</p></div>` : ""}
    <div class="section"><h3>Modo de uso</h3><p>${esc(p.usage)}</p></div>
    <div class="section"><h3>Presentación</h3><p>${esc(p.presentation)}</p></div>
    <div class="detail-actions">
      <div class="quantity"><button data-q="-1">−</button><input id="detailQty" type="number" min="1" value="1"><button data-q="1">+</button></div>
      <button id="addButton" class="button dark" ${unavailable ? "disabled" : ""}>${unavailable ? "Agotado" : "Agregar al carrito"}</button>
    </div>
  </div>`;
  $("#productDialog").showModal();
}

function selected() {
  return state.product.variants.find(v => v.id === state.variant) || state.product.variants[0];
}

function bindProductGrid(id) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("[data-product]");
    if (b) openProduct(b.dataset.product);
  });
}

$("#groupTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-group]");
  if (!b) return;
  state.group = b.dataset.group;
  state.category = "Todos";
  state.subcategory = "Todos";
  applyFiltersAndRender();
});

$("#categoryTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-category]");
  if (!b) return;
  state.category = b.dataset.category;
  state.subcategory = "Todos";
  applyFiltersAndRender();
});

$("#subcategoryTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-subcategory]");
  if (!b) return;
  state.subcategory = b.dataset.subcategory;
  applyFiltersAndRender();
});

$("#categoryShowcase").addEventListener("click", e => {
  const b = e.target.closest("[data-group]");
  if (!b) return;
  goToFilter({ group: b.dataset.group });
});

function bindWorldNav(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-group]");
    if (!b) return;
    e.preventDefault();
    goToFilter({ group: b.dataset.group });
  });
}
bindWorldNav(".nav-links");
bindWorldNav("#mobileNav");

// Fase 27: los enlaces de Novedades/Promociones del header ahora navegan
// a la PLP real filtrada (antes solo hacían scroll a la franja de la
// Home). Las franjas de Home (renderNovedades/renderPromociones, Fase 26)
// no cambian.
document.querySelectorAll("#navNovedades, #mobileNavNovedades").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    goToFilter({ newOnly: true });
  });
});
document.querySelectorAll("#navPromociones, #mobileNavPromociones").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    goToFilter({ promo: true });
  });
});

$("#searchInput").addEventListener("input", e => {
  state.search = e.target.value;
  applyFiltersAndRender();
});

// Filter & Sort — aplica al confirmar (no en vivo por cada click): a
// diferencia de las tabs/búsqueda (que sí aplican en vivo), este panel
// junta varios controles y se abre como diálogo modal sobre el propio
// grid, así que no tiene sentido re-renderizar en cada toggle mientras
// sigue abierto. "Limpiar filtros" es la única acción inmediata.
$("#openFilterSort").addEventListener("click", () => {
  $("#sortSelect").value = state.sort;
  $("#filterAvailable").checked = state.available;
  $("#filterPromo").checked = state.promo;
  $("#filterFeatured").checked = state.featuredOnly;
  populateBrandFilter();
  $("#filterSortDialog").showModal();
});
$("#closeFilterSort").addEventListener("click", () => $("#filterSortDialog").close());
$("#filterSortForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.sort = $("#sortSelect").value;
  state.available = $("#filterAvailable").checked;
  state.promo = $("#filterPromo").checked;
  state.featuredOnly = $("#filterFeatured").checked;
  const brandSelect = document.getElementById("filterBrandSelect");
  state.brand = brandSelect && brandSelect.value ? brandSelect.value : null;
  applyFiltersAndRender();
  $("#filterSortDialog").close();
});
$("#clearFilters").addEventListener("click", () => {
  resetFilters();
  $("#filterSortDialog").close();
});

$("#activeFilters").addEventListener("click", (e) => {
  if (e.target.id === "clearAllFilters") {
    resetFilters();
    return;
  }
  const b = e.target.closest("[data-remove]");
  if (!b) return;
  removeFilter(b.dataset.remove);
});

bindProductGrid("#productGrid");
bindProductGrid("#featuredGrid");

$("#cartButton").onclick = openCart;
$("#closeCart").onclick = closeCart;
$("#overlay").onclick = closeCart;
$("#closeProduct").onclick = () => $("#productDialog").close();
$("#checkoutButton").onclick = () => {
  if (getCart().length) {
    closeCart();
    $("#checkoutDialog").showModal();
  }
};
$("#closeCheckout").onclick = () => $("#checkoutDialog").close();

$("#cartItems").addEventListener("click", e => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const d = b.dataset.a;
  if (d === "inc") changeQuantity(b.dataset.p, b.dataset.v, 1);
  if (d === "dec") changeQuantity(b.dataset.p, b.dataset.v, -1);
  if (d === "del") removeFromCart(b.dataset.p, b.dataset.v);
  renderCart();
});

$("#productDialog").addEventListener("click", e => {
  const v = e.target.closest("[data-variant]");
  if (v) {
    state.variant = v.dataset.variant;
    document.querySelectorAll(".variant").forEach(x => x.classList.toggle("selected", x.dataset.variant === state.variant));
    $("#detailPrice").textContent = money(selected().price);
  }
  const q = e.target.closest("[data-q]");
  if (q) {
    const i = $("#detailQty");
    i.value = Math.max(1, (Number(i.value) || 1) + Number(q.dataset.q));
  }
  if (e.target.id === "addButton" && state.product.available !== false) {
    addToCart(state.product, selected(), Math.max(1, Number($("#detailQty").value) || 1));
    $("#productDialog").close();
    openCart();
  }
});

$("#checkoutForm").addEventListener("submit", e => {
  e.preventDefault();
  if (WHATSAPP_NUMBER.includes("X")) {
    alert("Configura el número de WhatsApp de VIBE en js/app.js antes de publicar.");
    return;
  }
  const d = Object.fromEntries(new FormData(e.currentTarget));
  let m = "Hola VIBE 👋\n\nQuiero realizar el siguiente pedido:\n\n";
  getCart().forEach(i => {
    m += "• " + i.name + "\n  Cantidad: " + i.quantity + "\n  Opción: " + i.variantName + "\n  Precio: " + money(i.price) + "\n  Subtotal: " + money(i.price * i.quantity) + "\n\n";
  });
  m += "TOTAL: " + money(getCartTotal()) + "\n\nNombre: " + d.name + "\nCiudad: " + d.city + "\nDirección: " + d.address + "\nInformación adicional: " + (d.notes || "N/A");
  window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(m), "_blank");
  clearCart();
  renderCart();
  e.currentTarget.reset();
  $("#checkoutDialog").close();
});

$("#menuToggle").addEventListener("click", () => {
  const open = $("#mobileNav").classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", open ? "true" : "false");
});
$("#mobileNav").addEventListener("click", e => {
  if (e.target.closest("a")) {
    $("#mobileNav").classList.remove("open");
    $("#menuToggle").setAttribute("aria-expanded", "false");
  }
});
$("#mobileSearchLink").addEventListener("click", () => {
  setTimeout(() => $("#searchInput").focus(), 450);
});

const headerEl = document.querySelector("header");
const onScroll = () => headerEl.classList.toggle("scrolled", window.scrollY > 10);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Cart rendering only needs localStorage (already loaded), never the
// catalog data — no reason to make it wait on the network.
renderCart();

async function loadCatalog() {
  const urlState = readStateFromSearch(window.location.search);
  state.group = urlState.group;
  state.category = urlState.category;
  state.subcategory = urlState.subcategory;
  state.search = urlState.search;
  state.available = urlState.available;
  state.promo = urlState.promo;
  state.featuredOnly = urlState.featuredOnly;
  state.newOnly = urlState.newOnly;
  state.sort = urlState.sort;
  $("#searchInput").value = state.search;

  $("#productGrid").innerHTML = `<p class="empty">Cargando catálogo...</p>`;
  $("#featuredGrid").innerHTML = `<p class="empty">Cargando selección...</p>`;
  $("#categoryShowcase").innerHTML = `<p class="empty">Cargando categorías...</p>`;

  try {
    state.products = await getProducts();
  } catch (e) {
    console.error("[VIBE] No se pudo inicializar el catálogo.", e);
    const message = `<p class="empty">No pudimos cargar el catálogo en este momento. Intenta de nuevo más tarde.</p>`;
    $("#productGrid").innerHTML = message;
    $("#featuredGrid").innerHTML = message;
    $("#categoryShowcase").innerHTML = message;
    return;
  }

  renderNav();
  renderProducts();
  renderFeatured();
  renderNovedades();
  renderPromociones();
  renderCategoryShowcase();
}

loadCatalog();
