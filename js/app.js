import { getProducts } from "./data-source.js";
import { getCart, addToCart, changeQuantity, removeFromCart, clearCart, getCartCount, getCartTotal } from "./cart.js";
import {
  getGroups,
  getCategoriesInGroup,
  getSubcategories,
  filterProducts,
  breadcrumbForState,
  selectFeatured,
  selectNew,
  selectPromotions,
  sortProducts,
  emptyStateCopy,
  activeFilterChips,
  findProduct,
  pdpPriceInfo,
  pdpBadge,
  pdpGalleryImages,
  pdpContentSections,
  breadcrumbForProduct,
  selectRelated,
  clampQuantity,
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

// Fase 28 — PDP. El precio "que paga la clienta ahora": el promocional
// cuando aplica (nunca calculado aquí, ya viene resuelto server-side en
// state.product.promoPrice), si no el de la variante seleccionada. Solo
// los productos demo tienen variantes con precios realmente distintos
// entre sí (ej. tonos de labial) — y esos nunca tienen promoción real
// detrás, así que ambos criterios nunca compiten entre sí en la práctica.
function currentEffectivePrice() {
  const p = state.product;
  if (!p) return 0;
  if (p.promoActive === true && p.promoPrice != null) return p.promoPrice;
  return selected().price;
}

function pdpGalleryHtml(p) {
  const images = pdpGalleryImages(p);
  if (!images.length) {
    // Sección 4 de la Fase 28: si no hay imagen real, nunca se inventa
    // una ni se usa un emoji — un estado visual propio, deliberado.
    return `<div class="pdp-no-image" aria-hidden="true"><span>VIBE</span></div>`;
  }
  const main = `<div class="pdp-gallery-main"><img id="pdpMainImage" class="detail-photo" src="${esc(images[0])}" alt="${esc(p.name)}" loading="eager"></div>`;
  const thumbs =
    images.length > 1
      ? `<div class="pdp-thumbs">${images
          .map(
            (img, i) =>
              `<button type="button" class="pdp-thumb${i === 0 ? " active" : ""}" data-thumb="${i}" aria-label="Imagen ${i + 1} de ${esc(p.name)}"><img src="${esc(img)}" alt="" loading="${i === 0 ? "eager" : "lazy"}"></button>`
          )
          .join("")}</div>`
      : "";
  return main + thumbs;
}

function pdpSectionsHtml(p) {
  const sections = pdpContentSections(p);
  if (!sections.length) return "";
  return `<div class="pdp-sections">${sections
    .map(
      (s, i) => `<details class="pdp-accordion"${i === 0 ? " open" : ""}>
      <summary>${esc(s.label)}</summary>
      <div class="pdp-accordion-body">${s.key === "benefits" ? `<ul>${s.content.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : `<p>${esc(s.content)}</p>`}</div>
    </details>`
    )
    .join("")}</div>`;
}

function pdpRelatedHtml() {
  const related = selectRelated(state.products, state.product);
  if (!related.length) return "";
  return `<div class="pdp-related">
    <h3>También te puede interesar</h3>
    <div class="grid">${related.map(productCard).join("")}</div>
  </div>`;
}

// Construye la ficha completa asumiendo que state.product/state.variant
// ya están asignados (ver openProduct). Separada de openProduct para
// poder re-renderizar en el lugar cuando se abre un producto relacionado
// sin cerrar/reabrir el diálogo.
function renderProductDetail(p) {
  const unavailable = p.available === false;
  const priceInfo = pdpPriceInfo(p);
  const badgeText = pdpBadge(p);
  const hasVariants = p.variants.length > 1;

  $("#productDetail").innerHTML = `<div class="detail-img pdp-gallery" data-gallery>${pdpGalleryHtml(p)}</div>
  <div class="detail-copy">
    <p class="breadcrumb pdp-breadcrumb">${esc(breadcrumbForProduct(p).join(" / "))}</p>
    ${badgeText ? `<span class="pdp-badge">${esc(badgeText)}</span>` : ""}
    ${p.brand ? `<p class="pdp-brand">${esc(p.brand)}</p>` : ""}
    <h2>${esc(p.name)}</h2>
    ${p.shortDescription ? `<p class="pdp-short-desc">${esc(p.shortDescription)}</p>` : ""}
    <div class="pdp-price">
      <strong id="detailPrice">${money(currentEffectivePrice())}</strong>
      ${priceInfo.showPromo ? `<span class="old">${money(priceInfo.originalPrice)}</span>` : ""}
      ${priceInfo.discountPercent ? `<span class="pdp-discount">-${priceInfo.discountPercent}%</span>` : ""}
    </div>
    ${priceInfo.showPromo && p.promoText ? `<p class="pdp-promo-text">${esc(p.promoText)}</p>` : ""}
    ${unavailable ? `<span class="availability-badge">Agotado</span>` : ""}
    ${hasVariants ? `<div class="variants">${p.variants.map((v) => `<button type="button" class="variant ${v.id === state.variant ? "selected" : ""}" data-variant="${v.id}">${esc(v.name)}</button>`).join("")}</div>` : ""}
    <div class="detail-actions">
      <div class="quantity">
        <button type="button" data-q="-1" ${unavailable ? "disabled" : ""}>−</button>
        <input id="detailQty" type="number" min="1" value="1" aria-label="Cantidad" ${unavailable ? "disabled" : ""}>
        <button type="button" data-q="1" ${unavailable ? "disabled" : ""}>+</button>
      </div>
      <button id="addButton" class="button dark" ${unavailable ? "disabled" : ""}>${unavailable ? "Agotado" : "Agregar al carrito"}</button>
    </div>
    ${pdpSectionsHtml(p)}
    ${pdpRelatedHtml()}
  </div>`;
  $("#productDetail").scrollTop = 0;
}

// Sección 22.B/C de la Fase 28: un id inexistente y un id de un producto
// unpublished se ven exactamente igual desde el frontend — la API nunca
// entrega productos unpublished en primer lugar (ver
// api/catalog/products.js), así que state.products jamás los contiene.
// Nunca se muestra información editorial de un producto que no llegó.
function renderProductNotFound() {
  $("#productDetail").innerHTML = `<div class="pdp-not-found">
    <p class="eyebrow">VIBE</p>
    <h2>Producto no encontrado</h2>
    <p>Es posible que ya no esté disponible o que el enlace no sea correcto.</p>
    <button type="button" class="button dark" id="pdpBackToCatalog">Ver catálogo</button>
  </div>`;
}

// pushHistory=false se usa al reconstruir el estado desde la URL (carga
// inicial de un link compartido, o navegación con back/forward) — en esos
// casos la URL ya es la correcta y no debe empujarse una entrada nueva.
function openProduct(id, { pushHistory = true } = {}) {
  const p = findProduct(state.products, id);
  if (!p) {
    state.product = null;
    renderProductNotFound();
    if (!$("#productDialog").open) $("#productDialog").showModal();
    return;
  }
  state.product = p;
  state.variant = p.variants[0].id;
  renderProductDetail(p);
  if (pushHistory) {
    try {
      window.history.pushState({ vibeProduct: String(p.id) }, "", buildUrl(window.location.pathname, { ...state, product: p.id }));
    } catch {
      // history/URL APIs unavailable — no bloquea la apertura del producto.
    }
  }
  if (!$("#productDialog").open) $("#productDialog").showModal();
}

function selected() {
  return state.product.variants.find(v => v.id === state.variant) || state.product.variants[0];
}

function selectGalleryThumb(thumb) {
  const images = pdpGalleryImages(state.product);
  const idx = Number(thumb.dataset.thumb);
  const main = $("#pdpMainImage");
  if (main && images[idx]) main.src = images[idx];
  document.querySelectorAll(".pdp-thumb").forEach((t) => t.classList.toggle("active", t === thumb));
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
// Fase 28: estas dos nunca estuvieron enlazadas desde la Fase 26 — hacer
// clic en una tarjeta de Novedades o Promociones en Home no abría nada.
bindProductGrid("#novedadesGrid");
bindProductGrid("#promocionesGrid");

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
  if (e.target.id === "pdpBackToCatalog") {
    $("#productDialog").close();
    $("#catalogo").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const thumb = e.target.closest("[data-thumb]");
  if (thumb) {
    selectGalleryThumb(thumb);
    return;
  }

  // Un producto relacionado (sección "También te puede interesar") usa
  // el mismo atributo data-product que cualquier tarjeta del catálogo —
  // reabre el PDP sobre el propio diálogo, sin cerrar/reabrir, en vez de
  // duplicar el mecanismo de apertura.
  const related = e.target.closest("[data-product]");
  if (related) {
    openProduct(related.dataset.product);
    return;
  }

  const v = e.target.closest("[data-variant]");
  if (v) {
    state.variant = v.dataset.variant;
    document.querySelectorAll(".variant").forEach(x => x.classList.toggle("selected", x.dataset.variant === state.variant));
    $("#detailPrice").textContent = money(currentEffectivePrice());
    return;
  }

  const q = e.target.closest("[data-q]");
  if (q) {
    const i = $("#detailQty");
    i.value = clampQuantity(i.value, q.dataset.q);
    return;
  }

  if (e.target.id === "addButton" && state.product && state.product.available !== false) {
    const variant = selected();
    const qty = Math.max(1, Number($("#detailQty").value) || 1);
    // Respeta el precio efectivo (promocional cuando aplica), nunca el
    // precio original de la variante — ver currentEffectivePrice().
    addToCart(state.product, { ...variant, price: currentEffectivePrice() }, qty);
    $("#productDialog").close();
    openCart();
  }
});

// Swipe táctil de la galería del PDP — mismo patrón ya usado en el Hero
// (js/hero-carousel.js): puramente pasivo, nunca preventDefault, nunca
// interfiere con el scroll vertical. Los listeners se registran una sola
// vez sobre #productDialog (que nunca se destruye, a diferencia de su
// contenido) y se acotan a [data-gallery] con closest().
const PDP_SWIPE_THRESHOLD = 40;
let pdpTouchStartX = null;
let pdpTouchStartY = null;
$("#productDialog").addEventListener(
  "touchstart",
  (e) => {
    if (!e.target.closest("[data-gallery]")) return;
    const t = e.touches[0];
    pdpTouchStartX = t.clientX;
    pdpTouchStartY = t.clientY;
  },
  { passive: true }
);
$("#productDialog").addEventListener(
  "touchend",
  (e) => {
    if (pdpTouchStartX === null || !state.product) return;
    const gallery = e.target.closest("[data-gallery]");
    const t = e.changedTouches[0];
    const deltaX = t.clientX - pdpTouchStartX;
    const deltaY = t.clientY - pdpTouchStartY;
    pdpTouchStartX = null;
    pdpTouchStartY = null;
    if (!gallery) return;
    const images = pdpGalleryImages(state.product);
    if (images.length < 2) return;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > PDP_SWIPE_THRESHOLD) {
      const thumbs = [...document.querySelectorAll(".pdp-thumb")];
      const current = thumbs.findIndex((t) => t.classList.contains("active"));
      const nextIndex = deltaX < 0 ? Math.min(current + 1, images.length - 1) : Math.max(current - 1, 0);
      if (thumbs[nextIndex]) thumbs[nextIndex].click();
    }
  },
  { passive: true }
);

// Fase 28 — el producto abierto se refleja en la URL (compartible,
// refresh-safe, back/forward), sin introducir un router nuevo: reutiliza
// exactamente el mismo mecanismo de query params de la PLP (Fase 27).
// Abrir empuja una entrada de historial nueva (ver openProduct) para que
// el botón atrás del navegador cierre el PDP en vez de salir del sitio;
// cerrar por cualquier vía (X, Escape, agregar al carrito) pasa siempre
// por este único evento nativo 'close' del <dialog>.
let suppressHistoryOnClose = false;
$("#productDialog").addEventListener("close", () => {
  state.product = null;
  if (suppressHistoryOnClose) {
    suppressHistoryOnClose = false;
    return;
  }
  try {
    if (window.history.state && window.history.state.vibeProduct) {
      window.history.back();
    } else {
      window.history.replaceState(null, "", buildUrl(window.location.pathname, { ...state, product: null }));
    }
  } catch {
    // history/URL APIs unavailable — el diálogo ya se cerró de todos modos.
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

// Compartida entre la carga inicial y popstate (back/forward): vuelca los
// campos de filtro/orden de la URL al estado en memoria. No toca
// state.product — eso lo maneja cada llamador según corresponda.
function applyUrlToFilterState(urlState) {
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
}

// Fase 28 — back/forward: como abrir un producto empuja una entrada de
// historial (ver openProduct), navegar con los botones del navegador
// dispara este evento nativo. Se reconstruye todo el estado (filtros +
// producto) desde la URL de destino, nunca se asume qué había antes.
window.addEventListener("popstate", () => {
  if (!state.products.length) return; // el catálogo aún no cargó — nada que reconciliar todavía
  const urlState = readStateFromSearch(window.location.search);
  applyUrlToFilterState(urlState);
  renderNav();
  renderProducts();

  if (urlState.product) {
    if (!state.product || String(state.product.id) !== String(urlState.product)) {
      openProduct(urlState.product, { pushHistory: false });
    }
  } else if ($("#productDialog").open) {
    suppressHistoryOnClose = true;
    $("#productDialog").close();
  }
});

async function loadCatalog() {
  const urlState = readStateFromSearch(window.location.search);
  applyUrlToFilterState(urlState);

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

  // Fase 28 — link compartido de un producto (?product=<id>): la URL ya
  // es la correcta en este punto, así que no se empuja una entrada nueva
  // de historial. Si el id no existe (o no está publicado — la API nunca
  // lo habría incluido en state.products), openProduct() ya sabe mostrar
  // el estado "producto no encontrado" en vez de fallar en silencio.
  if (urlState.product) {
    openProduct(urlState.product, { pushHistory: false });
  }
}

loadCatalog();
