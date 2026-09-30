import { getProducts } from "./data-source.js";
import { getCart, addToCart, changeQuantity, removeFromCart, clearCart, getCartCount, getCartTotal } from "./cart.js";
import {
  getGroups,
  getCategoriesInGroup,
  getSubcategories,
  filterProducts,
  breadcrumbForState,
  selectPromotions,
  sortProducts,
  emptyStateCopy,
  activeFilterChips,
  findProduct,
  pdpPriceInfo,
  pdpBadge,
  pdpGalleryImages,
  pdpContentSections,
  pdpSpecRows,
  pdpTagLists,
  pdpTraitBadges,
  breadcrumbForProduct,
  selectRelated,
  clampQuantity,
} from "./taxonomy.js";
import { readStateFromSearch, buildUrl } from "./url-state.js";
import { computeOrderSummary, validateCheckoutForm } from "./checkout.js";

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

// Fase 36.1 — pedido explícito: "el estado activo de la sección actual
// debe ser mucho más evidente que un simple color". Antes .nav-links no
// reflejaba en absoluto qué filtro estaba aplicado — el subrayado de
// Fase 36 solo aparecía en hover. Ahora, además, la sección
// efectivamente seleccionada (mundo/Novedades/Promociones) queda con
// una marca persistente (.nav-active, ver CSS) mientras siga aplicada,
// sin depender de que el mouse esté encima.
function updateHeaderNavActive() {
  // Fase 41 — el submenú mobile de Maquillaje (Rostro/Ojos/Labios,
  // mismo data-group="Maquillaje" + un data-category propio) no debe
  // marcarse activo solo por group — necesita que category también
  // coincida, para no iluminar "Rostro" cuando en realidad se filtró
  // por Maquillaje sin subcategoría (o por otra subcategoría).
  document.querySelectorAll(".nav-links a[data-group], #mobileNav a[data-group]").forEach((a) => {
    const matchesGroup = state.group !== "Todos" && a.dataset.group === state.group;
    const matchesCategory = !a.dataset.category || a.dataset.category === state.category;
    a.classList.toggle("nav-active", matchesGroup && matchesCategory);
  });
  document.querySelectorAll("#navNovedades, #mobileNavNovedades").forEach((a) => a.classList.toggle("nav-active", state.newOnly === true));
}

function renderNav() {
  const groups = ["Todos", ...getGroups(state.products)];
  $("#groupTabs").innerHTML = groups.map(g => tabButton(g, state.group === g, "group")).join("");
  updateHeaderNavActive();

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
  // Fase 36.1 — antes, sin foto real, esto era un <span> plano (texto
  // "VIBE" sin ningún tratamiento) sobre un cuadro gris #f2f2f2: se veía
  // como una imagen rota, no como una decisión de diseño. La mayoría del
  // catálogo real hoy no tiene foto cargada todavía (eso NO cambia
  // aquí — es un flujo de carga aparte), así que este es el estado que
  // ve la usuaria en la mayoría de las cards. Ahora reutiliza el mismo
  // lenguaje oscuro+wordmark rosa que .pdp-no-image/.discover-empty
  // (.card-img-empty en CSS) — con presencia editorial en vez de vacío.
  return p.image ? `<img class="${cls}" src="${p.image}" alt="${esc(p.name)}" loading="lazy">` : `<span class="card-img-empty">${esc(p.imageLabel)}</span>`;
}

// Fase 41 — pedido explícito: la card retail-premium retira categoría/
// descripción corta (esa información pasa a vivir solo en el PDP) y
// deja la jerarquía imagen→marca→nombre→precio→CTA. El CTA se relabela
// "Ver producto"→"+ Agregar" pero mantiene exactamente el mismo
// comportamiento (navega al PDP) — nunca un quick-add-to-cart sin
// pasar por la selección de variante/cantidad del PDP.
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
      ${p.brand ? `<p class="card-brand">${esc(p.brand)}</p>` : ""}
      <h3>${esc(p.name)}</h3>
      <span class="price">${money(showPromo ? p.promoPrice : p.price)}</span>
      ${showPromo ? `<span class="old">${money(p.price)}</span>` : p.oldPrice ? `<span class="old">${money(p.oldPrice)}</span>` : ""}
      ${p.available === false ? `<span class="availability-badge">Agotado</span>` : ""}
      <button class="button card-cta" data-product="${p.id}">+ Agregar</button>
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

// Fase 37/41 — patrón real de e.l.f.: su botón "Filter & Sort" muestra
// la CANTIDAD de filtros activos ("Filtrar + Ordenar (0)"). Cuenta solo
// los controles que en VIBE realmente viven en ese diálogo
// (disponibilidad/promoción/destacados/marca — ver #filterSortForm en
// index.html), no el grupo/categoría/búsqueda (esos son pills/buscador
// aparte, no parte de este panel) — evita un número que confunda sobre
// qué se está filtrando desde dónde.
function updateFilterSortButton() {
  const count = [state.available, state.promo, state.featuredOnly, Boolean(state.brand)].filter(Boolean).length;
  $("#openFilterSort").textContent = count ? `Filtrar + Ordenar (${count})` : "Filtrar + Ordenar";
}

function renderProducts() {
  let list = filterProducts(state.products, state);
  list = sortProducts(list, state.sort);
  $("#productGrid").innerHTML = list.map(productCard).join("");
  updateFilterSortButton();

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

// Fase 26/41 — "Ofertas VIBE" en Home (antes "Promociones"): única
// fuente, promoActive === true (ya resuelto server-side). Sin datos
// reales, la sección completa queda ausente — nunca un bloque vacío.
// El link de nav "Ofertas" ya no depende de esto (Fase 41: dejó de ser
// condicional, siempre apunta a la página completa #ofertas, que
// maneja su propio estado vacío — ver renderOfertasPage()).
function renderOfertasHome() {
  const list = selectPromotions(state.products);
  const hasPromotions = list.length > 0;
  $("#ofertasHome").classList.toggle("hidden", !hasPromotions);
  if (hasPromotions) $("#ofertasHomeGrid").innerHTML = list.map(productCard).join("");
}

// Fase 41 — página completa "Ofertas" (#ofertas, ver index.html): misma
// fuente real que renderOfertasHome(), sin paginación (la PLP tampoco
// la tiene hoy) — muestra todas las promociones activas. Sin ninguna,
// estado vacío honesto con salida al catálogo, nunca una grilla rota.
function renderOfertasPage() {
  const list = selectPromotions(state.products);
  const hasPromotions = list.length > 0;
  $("#ofertasGrid").classList.toggle("hidden", !hasPromotions);
  $("#ofertasEmpty").classList.toggle("hidden", hasPromotions);
  if (hasPromotions) $("#ofertasGrid").innerHTML = list.map(productCard).join("");
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

// Fase 41/42 — "Descubre tu VIBE": única sección de descubrimiento por
// categoría del Home (reemplaza a la vez "Shop VIBE" y "Shop by
// Category" — decisión explícita de la usuaria, nunca conviven dos
// secciones de categorías). Exactamente estas 5 categorías reales,
// pedidas tal cual: Rostro/Ojos/Labios (categorías reales del grupo
// Maquillaje), Skincare (grupo y categoría al ser lo mismo) y
// Accesorios (categoría POS real "Otro" — ver categoryGroups.js,
// Fase 41 Parte B.1). Conteos y enlaces 100% reales: mismo criterio
// exacto que categoryOf()/groupOf() en taxonomy.js
// (editorialCategory || category), nunca inventado.
//
// Fase 42.6 — pedido explícito: Rostro y Labios ganan protagonismo
// visual (tile más grande) — decisión de diseño fija, independiente de
// qué producto termine ilustrándola. La FOTO en sí sigue siendo 100%
// data-driven: se toma el primer producto real de esa categoría que
// tenga imagen subida (auditoría en producción: solo 2/68 productos
// tienen foto real hoy — id 122 "Rubor líquido" en Rostro, id 110
// "VIBE Lip Duo" en Labios — pura coincidencia que sean justo las dos
// categorías priorizadas). Si una categoría no tiene ningún producto
// con foto, cae al mismo placeholder de marca (gradiente oscuro) que
// ya usa el resto del sitio — nunca una imagen inventada ni prestada
// de otra categoría.
const DISCOVER_VIBE_TILES = [
  { label: "Rostro", group: "Maquillaje", category: "Rostro", featured: true },
  { label: "Labios", group: "Maquillaje", category: "Labios", featured: true },
  { label: "Ojos", group: "Maquillaje", category: "Ojos", featured: false },
  { label: "Skincare", group: "Skincare", category: "Skincare", featured: false },
  { label: "Accesorios", group: "Accesorios", category: "Otro", featured: false },
];

function renderDiscoverVibe() {
  $("#discoverVibeGrid").innerHTML = DISCOVER_VIBE_TILES.map(({ label, group, category, featured }) => {
    const inCategory = state.products.filter((p) => (p.editorialCategory || p.category) === category);
    const count = inCategory.length;
    const withPhoto = inCategory.find((p) => p.image);
    const sizeClass = featured ? "discover-tile-featured" : "discover-tile-compact";
    const slugClass = `discover-tile-${label.toLowerCase()}`;
    const imageHtml = withPhoto
      ? `<img class="discover-tile-photo" src="${esc(withPhoto.image)}" alt="${esc(label)}" loading="lazy">`
      : `<span class="discover-tile-empty" aria-hidden="true">VIBE</span>`;
    return `<button class="discover-tile ${sizeClass} ${slugClass}" data-group="${esc(group)}" data-category="${esc(category)}">
      ${imageHtml}
      <span class="discover-tile-scrim"></span>
      <span class="discover-tile-body">
        <span class="discover-tile-label">${esc(label)}</span>
        <span class="discover-tile-meta">
          <span class="discover-tile-cta">Explorar →</span>
          <span class="discover-tile-count">${count} producto${count === 1 ? "" : "s"}</span>
        </span>
      </span>
    </button>`;
  }).join("");
}

// Fase 29, sección 2 — una línea del carrito: imagen, marca (si existe),
// nombre, precio unitario (con el promocional tachando el original
// cuando aplica — originalPrice solo llega no-null si cart.js lo guardó
// con una promoción real, ver openProduct/addToCart), cantidad,
// subtotal de la línea y eliminar. Nunca stock ni costos: cart.js nunca
// los tuvo en primer lugar.
function cartItemHtml(i) {
  const showPromo = i.originalPrice != null && i.originalPrice > i.price;
  return `<div class="cart-item">
    <div class="thumb">${i.image ? `<img src="${i.image}" alt="${esc(i.name)}">` : "VIBE"}</div>
    <div>
      ${i.brand ? `<p class="cart-item-brand">${esc(i.brand)}</p>` : ""}
      <h3>${esc(i.name)}</h3>
      <div class="meta">${esc(i.variantName)}</div>
      <div class="cart-item-unit-price">
        <span>${money(i.price)}</span>
        ${showPromo ? `<span class="old">${money(i.originalPrice)}</span>` : ""}
      </div>
      <div class="qty">
        <button data-a="dec" data-p="${i.productId}" data-v="${i.variantId}">−</button>
        <span>${i.quantity}</span>
        <button data-a="inc" data-p="${i.productId}" data-v="${i.variantId}">+</button>
      </div>
      <button class="remove" data-a="del" data-p="${i.productId}" data-v="${i.variantId}">Eliminar</button>
    </div>
    <div class="cart-price">${money(i.price * i.quantity)}</div>
  </div>`;
}

// Fase 29, sección 11 — estado vacío VIBE: nunca contenido ficticio, solo
// invitación real a volver al catálogo.
function cartEmptyHtml() {
  return `<div class="cart-empty">
    <p>Tu carrito está vacío.</p>
    <p class="cart-empty-sub">Descubre la selección VIBE y arma tu ritual.</p>
    <a href="#catalogo" class="button dark" id="cartEmptyCta">Ver catálogo</a>
  </div>`;
}

function renderCart() {
  $("#cartCount").textContent = getCartCount();
  $("#cartTotal").textContent = money(getCartTotal());
  const items = getCart();
  $("#checkoutButton").disabled = !items.length;
  $("#checkoutButton").style.opacity = items.length ? "1" : ".45";
  $("#cartItems").innerHTML = items.length ? items.map(cartItemHtml).join("") : cartEmptyHtml();
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
  // Fase 34 — mainImageAlt es editorial y opcional: si Ana lo completó,
  // reemplaza el alt genérico (el nombre del producto), nunca al revés.
  // Fase 35.1 — navegación manual con flechas (sección 4): solo se
  // renderizan si hay más de una imagen; nunca autoplay, nunca hover.
  const arrows =
    images.length > 1
      ? `<button type="button" class="pdp-arrow pdp-arrow-prev" data-gallery-nav="-1" aria-label="Imagen anterior">‹</button>
         <button type="button" class="pdp-arrow pdp-arrow-next" data-gallery-nav="1" aria-label="Imagen siguiente">›</button>`
      : "";
  const main = `<div class="pdp-gallery-main"><img id="pdpMainImage" class="detail-photo" src="${esc(images[0])}" alt="${esc(p.mainImageAlt || p.name)}" loading="eager">${arrows}</div>`;
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
      <div class="pdp-accordion-body">${Array.isArray(s.content) ? `<ul>${s.content.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : `<p>${esc(s.content)}</p>`}</div>
    </details>`
    )
    .join("")}</div>`;
}

// Fase 34 — ficha técnica compacta (tono, acabado, cobertura, etc.):
// etiqueta/valor, cada fila solo si el campo tiene contenido real. Se
// muestra siempre visible (no en acordeón) porque cada valor es corto —
// un acordeón por cada palabra suelta sería más fricción que ayuda.
function pdpSpecHtml(p) {
  const rows = pdpSpecRows(p);
  if (!rows.length) return "";
  return `<dl class="pdp-specs">${rows.map((r) => `<div class="pdp-spec-row"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join("")}</dl>`;
}

// Cruelty-free / vegano / dermatológicamente probado: "Sí"/"No" tal cual
// se escribió, nunca un ícono ni un booleano inventado.
function pdpTraitsHtml(p) {
  const traits = pdpTraitBadges(p);
  if (!traits.length) return "";
  return `<div class="pdp-traits">${traits.map((t) => `<span class="pdp-trait">${esc(t.label)}: ${esc(t.value)}</span>`).join("")}</div>`;
}

// Claims / certificaciones: multivalor, como pills.
function pdpTagsHtml(p) {
  const lists = pdpTagLists(p);
  if (!lists.length) return "";
  return lists
    .map(
      (l) => `<div class="pdp-tag-list"><p class="pdp-tag-list-label">${esc(l.label)}</p>${l.items.map((i) => `<span class="pdp-tag">${esc(i)}</span>`).join("")}</div>`
    )
    .join("");
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
    ${
      // Fase 34 — "Nombre comercial" es editorial y nunca reemplaza el
      // nombre del POS (el <h2> de arriba): es una línea adicional,
      // opcional, debajo del nombre operativo.
      p.commercialName ? `<p class="pdp-commercial-name">${esc(p.commercialName)}</p>` : ""
    }
    ${p.shortDescription ? `<p class="pdp-short-desc">${esc(p.shortDescription)}</p>` : ""}
    <div class="pdp-price">
      <strong id="detailPrice">${money(currentEffectivePrice())}</strong>
      ${priceInfo.showPromo ? `<span class="old">${money(priceInfo.originalPrice)}</span>` : ""}
      ${priceInfo.discountPercent ? `<span class="pdp-discount">-${priceInfo.discountPercent}%</span>` : ""}
    </div>
    ${priceInfo.showPromo && p.promoText ? `<p class="pdp-promo-text">${esc(p.promoText)}</p>` : ""}
    ${hasVariants ? `<div class="variants">${p.variants.map((v) => `<button type="button" class="variant ${v.id === state.variant ? "selected" : ""}" data-variant="${v.id}">${esc(v.name)}</button>`).join("")}</div>` : ""}
    <!-- Fase 37 — reorden de jerarquía inspirado en el benchmark (imagen
         → marca → nombre → precio → variante → DISPONIBILIDAD → CTA):
         antes "Agotado" aparecía antes de las variantes; ahora va justo
         antes de la acción de compra, que es donde realmente importa. -->
    ${unavailable ? `<span class="availability-badge">Agotado</span>` : ""}
    <div class="detail-actions">
      <div class="quantity">
        <button type="button" data-q="-1" ${unavailable ? "disabled" : ""}>−</button>
        <input id="detailQty" type="number" min="1" value="1" aria-label="Cantidad" ${unavailable ? "disabled" : ""}>
        <button type="button" data-q="1" ${unavailable ? "disabled" : ""}>+</button>
      </div>
      <button id="addButton" class="button dark pdp-buy-button" ${unavailable ? "disabled" : ""}>${unavailable ? "Agotado" : "Agregar al carrito"}</button>
    </div>
    ${pdpSpecHtml(p)}
    ${pdpTraitsHtml(p)}
    ${pdpTagsHtml(p)}
    ${pdpSectionsHtml(p)}
    ${pdpRelatedHtml()}
  </div>`;
  $("#productDetail").scrollTop = 0;
  applyPdpPhotoRatio();
}

// Fase estabilización — bug real (solo desktop; ver comentario junto a
// .detail-img en css/styles.css): el contenedor de la galería asumía
// aspect-ratio:4/5 fijo, como si toda foto de producto fuera exactamente
// 1200x1500. Las fotos reales varían (verificado contra Storage: entre
// 2:3 y 4:5 según el producto), así que ese contenedor fijo dejaba
// espacio de sobra alrededor de la foto real. En vez de asumir 4:5, se
// mide la proporción REAL de la imagen principal (una sola vez al abrir
// el producto, no en cada clic de la galería — mismo criterio que el
// Hero) y se expone como --pdp-photo-ratio; el CSS solo la usa en
// desktop (mobile sigue con 4/5 fijo tal cual, sin tocar). object-fit
// contain sigue intacto: una imagen secundaria con otra proporción
// todavía puede mostrar letterboxing al navegar, nunca recorte.
function applyPdpPhotoRatio() {
  const img = $("#pdpMainImage");
  const container = $(".detail-img");
  if (!img || !container) return;
  const apply = () => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      container.style.setProperty("--pdp-photo-ratio", `${img.naturalWidth} / ${img.naturalHeight}`);
    }
  };
  if (img.complete) apply();
  else img.addEventListener("load", apply, { once: true });
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

// Fase 35.1 — mueve la galería del PDP `delta` posiciones (flechas y
// flechas de teclado comparten esta misma lógica que ya usaba el swipe:
// límites acotados, no circular — ver nota de la sección 4 de la fase).
// Delega en selectGalleryThumb (vía thumb.click()) para no duplicar el
// estado de "cuál está activa".
function moveGalleryBy(delta) {
  if (!state.product) return;
  const images = pdpGalleryImages(state.product);
  if (images.length < 2) return;
  const thumbs = [...document.querySelectorAll(".pdp-thumb")];
  const current = thumbs.findIndex((t) => t.classList.contains("active"));
  const nextIndex = Math.max(0, Math.min(images.length - 1, (current === -1 ? 0 : current) + delta));
  if (thumbs[nextIndex]) thumbs[nextIndex].click();
}

function bindProductGrid(id) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("[data-product]");
    if (b) openProduct(b.dataset.product);
  });
}

// Fase 35.1 (sección 2/3) — preview automático de imágenes al hacer
// hover sobre una card, SOLO desktop (matchMedia("hover: hover") excluye
// touch, donde no existe un verdadero hover — sección 3 lo prohíbe
// explícitamente en mobile). Delegado sobre document en vez de un
// listener por grid: las cards aparecen en varios contenedores
// (catálogo, destacados, relacionados dentro del PDP) y así se cubren
// todos sin registrar el listener una vez por sección. mouseover/mouseout
// + comprobación de relatedTarget emulan mouseenter/mouseleave (que no
// burbujean) sin necesitar un listener por card individual.
const CARD_HOVER_DELAY_MS = 500;
// Fase 35.2 — bug reportado: 1350ms se sentía como parpadeo/slideshow
// acelerado, no como una vitrina elegante. ~2.5-3s por imagen es el
// rango pedido; el crossfade de .25s (ver .product-photo en
// css/styles.css) ya viene sincronizado con el setTimeout de abajo, así
// que solo cambia el tiempo que cada foto queda quieta antes del
// siguiente crossfade.
const CARD_HOVER_STEP_MS = 2800;
const cardHoverState = new WeakMap();

// Fase 35.2 — bug reportado: salir del hover volvía a la imagen
// principal con un corte duro (opacity:1 + src instantáneo), rompiendo
// el efecto de vitrina elegante que sí tenía el ciclo entre imágenes.
// Ahora usa el mismo crossfade de .25s (nunca si ya está en la primera
// imagen — no hay nada que desvanecer). También limpia el setTimeout
// del fade en curso (fadeTimeoutId): sin esto, un hover-out justo en
// medio de un crossfade podía dejar ese swap pendiente disparándose
// después de que la card ya había vuelto a su estado de reposo.
function stopCardHover(card) {
  const s = cardHoverState.get(card);
  if (!s) return;
  clearTimeout(s.timeoutId);
  clearInterval(s.intervalId);
  clearTimeout(s.fadeTimeoutId);
  cardHoverState.delete(card);
  if (!s.img) return;
  if (s.currentIndex === 0) {
    s.img.style.opacity = "1";
    return;
  }
  s.img.style.opacity = "0";
  setTimeout(() => {
    s.img.src = s.images[0]; // siempre vuelve a la imagen principal
    s.img.style.opacity = "1";
  }, 250);
}

function startCardHover(card) {
  if (cardHoverState.has(card)) return;
  if (!window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;
  // Fase 35.2 — el autoplay del Hero ya respetaba prefers-reduced-motion
  // (ver hero-carousel.js); esta alternancia por hover no lo comprobaba
  // en absoluto. Con la preferencia activa, la card se queda quieta en
  // su imagen principal — nunca cicla automáticamente.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const img = card.querySelector(".product-photo");
  if (!img) return; // sin foto real (placeholder) -> nada que animar
  const p = findProduct(state.products, card.dataset.product);
  if (!p) return;
  const images = pdpGalleryImages(p);
  if (images.length < 2) return; // una sola imagen -> sin animación (sección 2)
  // Precarga las adicionales solo ahora (intención real de ver la card),
  // nunca al renderizar el grid completo -> evita requests innecesarios.
  images.slice(1).forEach(src => { new Image().src = src; });
  const state_ = { images, img, intervalId: null, currentIndex: 0 };
  state_.timeoutId = setTimeout(() => {
    state_.intervalId = setInterval(() => {
      state_.currentIndex = (state_.currentIndex + 1) % images.length;
      img.style.opacity = "0";
      state_.fadeTimeoutId = setTimeout(() => {
        img.src = images[state_.currentIndex];
        img.style.opacity = "1";
      }, 250);
    }, CARD_HOVER_STEP_MS);
  }, CARD_HOVER_DELAY_MS);
  cardHoverState.set(card, state_);
}

document.addEventListener("mouseover", e => {
  const card = e.target.closest(".card-img");
  if (card) startCardHover(card);
});
document.addEventListener("mouseout", e => {
  const card = e.target.closest(".card-img");
  if (card && !card.contains(e.relatedTarget)) stopCardHover(card);
});

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

// Fase 41 — el submenú mobile de Maquillaje (Rostro/Ojos/Labios) pasa
// también un data-category, además del data-group ya existente —
// goToFilter ya soporta category como filtro independiente (misma
// lógica que ya usa el panel Filter&Sort), así que esto reusa 100% de
// lo existente, solo agrega el segundo atributo al click handler.
function bindWorldNav(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-group]");
    if (!b) return;
    e.preventDefault();
    goToFilter({ group: b.dataset.group, category: b.dataset.category || "Todos" });
  });
}
bindWorldNav(".nav-links");
bindWorldNav("#mobileNav");
bindWorldNav("#discoverVibeGrid");

// Fase 27: los enlaces de Novedades del header navegan a la PLP real
// filtrada (antes solo hacían scroll a la franja de la Home). Fase 41 —
// Promociones se retiró de aquí: "Ofertas" en el nav ahora es un enlace
// normal a la página #ofertas (renderOfertasPage()), ya no un filtro
// que interceptar.
document.querySelectorAll("#navNovedades, #mobileNavNovedades").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    goToFilter({ newOnly: true });
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
bindProductGrid("#ofertasHomeGrid");
bindProductGrid("#ofertasGrid");

$("#cartButton").onclick = openCart;
$("#closeCart").onclick = closeCart;
$("#overlay").onclick = closeCart;
$("#closeProduct").onclick = () => $("#productDialog").close();
$("#checkoutButton").onclick = () => {
  if (!getCart().length) return;
  closeCart();
  openCheckout();
};
$("#closeCheckout").onclick = () => $("#checkoutDialog").close();

$("#cartItems").addEventListener("click", e => {
  if (e.target.id === "cartEmptyCta") {
    e.preventDefault();
    closeCart();
    $("#catalogo").scrollIntoView({ behavior: "smooth" });
    return;
  }
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

  const navBtn = e.target.closest("[data-gallery-nav]");
  if (navBtn) {
    moveGalleryBy(Number(navBtn.dataset.galleryNav));
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
    // precio original de la variante — ver currentEffectivePrice(). Se
    // pasa originalPrice solo cuando hay una promoción real resuelta
    // server-side (Fase 29 — el carrito lo usa para mostrar el precio
    // tachado; ver pdpPriceInfo/cart.js).
    const priceInfo = pdpPriceInfo(state.product);
    addToCart(state.product, { ...variant, price: currentEffectivePrice(), originalPrice: priceInfo.originalPrice }, qty);
    $("#productDialog").close();
    openCart();
  }
});

// Fase 35.1 — accesibilidad por teclado (sección 4): flechas ← / →
// mueven la galería mientras el PDP está abierto, salvo que el foco
// esté en un campo de formulario (ej. el input de cantidad), donde las
// flechas deben seguir su comportamiento nativo de edición de texto.
$("#productDialog").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  moveGalleryBy(e.key === "ArrowLeft" ? -1 : 1);
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


// Fase 29 — Checkout. Cruza el carrito real (cart.js) con el estado más
// fresco posible de disponibilidad (ver refreshAvailability): una línea
// "unavailable" es un producto que, según la API pública, ya no existe o
// ya no tiene stock — nunca se decide localmente sin haber preguntado.
function cartLinesWithAvailability() {
  return getCart().map((item) => {
    const product = findProduct(state.products, item.productId);
    return { ...item, unavailable: !product || product.available === false };
  });
}

// Sección 3 — no hay backend de pedidos ni de inventario nuevo: se
// reutiliza el mismo endpoint público de solo lectura que ya alimenta el
// catálogo (getProducts()), pidiéndolo de nuevo justo al abrir el
// checkout en vez de confiar en el estado cargado al entrar a la página.
// Si la red falla, no se bloquea el checkout — se documenta el hueco
// (availabilityStale) y se sigue con el último estado conocido; cerrar
// por completo esa ventana requeriría una reserva/lock real del lado del
// servidor, fuera de alcance de esta fase (regla 6/15).
async function refreshAvailability() {
  try {
    const fresh = await getProducts();
    fresh.forEach((fp) => {
      const idx = state.products.findIndex((p) => String(p.id) === String(fp.id));
      if (idx !== -1) state.products[idx] = { ...state.products[idx], available: fp.available };
    });
    return true;
  } catch (e) {
    console.error("[VIBE] No se pudo revalidar disponibilidad en tiempo real antes del checkout; se usa el último estado conocido.", e);
    return false;
  }
}

function checkoutSummaryHtml(availabilityStale) {
  const summary = computeOrderSummary(cartLinesWithAvailability());
  if (!summary.lines.length) {
    return `<div class="checkout-summary">${cartEmptyHtml()}</div>`;
  }
  const rows = summary.lines
    .map(
      (l) => `<div class="checkout-line${l.unavailable ? " unavailable" : ""}">
        <div class="thumb">${l.image ? `<img src="${esc(l.image)}" alt="${esc(l.name)}">` : "VIBE"}</div>
        <div class="checkout-line-info">
          ${l.brand ? `<p class="cart-item-brand">${esc(l.brand)}</p>` : ""}
          <h3>${esc(l.name)}</h3>
          <div class="meta">${esc(l.variantName)} · Cantidad: ${l.quantity}</div>
          ${l.unavailable ? `<p class="checkout-line-warning">Ya no está disponible — quítalo para continuar.</p>` : ""}
        </div>
        <div class="checkout-line-right">
          <span class="cart-price">${money(l.lineSubtotal)}</span>
          <button type="button" class="remove" data-remove-line data-p="${l.productId}" data-v="${l.variantId}">Quitar</button>
        </div>
      </div>`
    )
    .join("");
  return `<div class="checkout-summary">
    <h3 class="checkout-summary-title">Resumen de tu pedido</h3>
    ${rows}
    <div class="total"><span>Total</span><strong>${money(summary.total)}</strong></div>
    ${availabilityStale ? `<p class="notice">No pudimos revalidar la disponibilidad justo ahora — se muestra la última conocida.</p>` : ""}
  </div>`;
}

// Fase 39 — se agregan email y la autorización de contacto (checkbox
// obligatorio, exclusivo para gestionar ESTE pedido — nunca marketing).
// El CTA pasa a decir literalmente que se envía el pedido (ya no
// depende de que el cliente tenga WhatsApp abierto para completarlo).
function checkoutFormHtml() {
  return `<form id="checkoutForm" novalidate>
    <label>Nombre completo
      <input name="name" autocomplete="name" aria-describedby="err-name">
      <span class="field-error" id="err-name" role="alert"></span>
    </label>
    <label>WhatsApp / celular
      <input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ej. 300 123 4567" aria-describedby="err-phone phone-help">
      <span class="field-error" id="err-phone" role="alert"></span>
    </label>
    <p class="field-help" id="phone-help">📲 Este será nuestro canal de contacto<br>Verifica que el número sea correcto y que esté habilitado para recibir mensajes por WhatsApp. VIBE se comunicará contigo por este medio para confirmar tu pedido, disponibilidad, envío y forma de pago.</p>
    <label>Correo electrónico
      <input name="email" type="email" autocomplete="email" aria-describedby="err-email">
      <span class="field-error" id="err-email" role="alert"></span>
    </label>
    <label>Ciudad
      <input name="city" autocomplete="address-level2" aria-describedby="err-city">
      <span class="field-error" id="err-city" role="alert"></span>
    </label>
    <label>Dirección de entrega
      <input name="address" autocomplete="street-address" aria-describedby="err-address">
      <span class="field-error" id="err-address" role="alert"></span>
    </label>
    <label>Observaciones (opcional)<textarea name="notes" rows="3"></textarea></label>
    <label class="checkbox-field">
      <input type="checkbox" name="contactConsent" aria-describedby="err-contactConsent">
      Autorizo a VIBE a contactarme por WhatsApp al número registrado para gestionar y finalizar mi pedido.
    </label>
    <span class="field-error" id="err-contactConsent" role="alert"></span>
    <button type="submit" id="checkoutSubmit" class="button dark full">ENVIAR PEDIDO</button>
    <p class="field-error" id="checkoutSubmitError" role="alert"></p>
    <small>Tu pedido queda registrado en VIBE. Nuestro equipo te contactará por WhatsApp para confirmar disponibilidad, envío y forma de pago.</small>
  </form>`;
}

// Fase 39 — pantalla de confirmación propia de VIBE (ya no "se abrió
// WhatsApp"): el pedido queda REGISTRADO acá, WhatsApp es un canal de
// aviso posterior, no una dependencia del checkout. `order` viene de la
// respuesta real de /api/orders/create — emailSent refleja lo que de
// verdad ocurrió en este intento; nunca se afirma un envío que no pasó.
// El carrito ya se vació en el momento en que se llama a esta función
// (ver el submit handler), así que no hace falta un botón manual de
// "Vaciar carrito".
function checkoutConfirmationHtml(order) {
  const emailNote = order.emailSent
    ? `Hemos enviado el resumen de tu pedido a ${esc(order.customerEmail)}.`
    : "Tu pedido quedó registrado correctamente en VIBE.";
  return `<div class="checkout-confirmation">
    <p class="eyebrow">VIBE</p>
    <h3>¡Listo! Tu pedido llegó a VIBE 💗</h3>
    <p class="checkout-confirmation-number">Pedido #${esc(order.id)} · Total ${money(order.total)}</p>
    <p>${emailNote}</p>
    <p>Nuestro equipo se pondrá en contacto contigo por WhatsApp al número terminado en ${esc(order.customerPhoneLast4)} para confirmar disponibilidad, envío y forma de pago.</p>
    <div class="checkout-confirmation-actions">
      <button type="button" class="button dark" id="checkoutKeepShopping">Seguir explorando</button>
    </div>
  </div>`;
}

function renderCheckoutForm({ availabilityStale = false } = {}) {
  const lines = cartLinesWithAvailability();
  if (!lines.length) {
    $("#checkoutBody").innerHTML = checkoutSummaryHtml(availabilityStale);
    return;
  }
  $("#checkoutBody").innerHTML = checkoutSummaryHtml(availabilityStale) + checkoutFormHtml();
  const hasUnavailable = lines.some((l) => l.unavailable);
  const submitBtn = $("#checkoutSubmit");
  if (submitBtn) {
    submitBtn.disabled = hasUnavailable;
    if (hasUnavailable) submitBtn.textContent = "Quita los productos agotados para continuar";
  }
}

async function openCheckout() {
  renderCheckoutForm();
  $("#checkoutDialog").showModal();
  const ok = await refreshAvailability();
  // Si mientras esperábamos la red la clienta ya cerró el diálogo (o
  // vació el carrito desde la confirmación), no pisar lo que ya se ve.
  if ($("#checkoutDialog").open) renderCheckoutForm({ availabilityStale: !ok });
}

$("#checkoutDialog").addEventListener("click", (e) => {
  if (e.target.id === "cartEmptyCta") {
    e.preventDefault();
    $("#checkoutDialog").close();
    $("#catalogo").scrollIntoView({ behavior: "smooth" });
    return;
  }
  const removeBtn = e.target.closest("[data-remove-line]");
  if (removeBtn) {
    removeFromCart(removeBtn.dataset.p, removeBtn.dataset.v);
    renderCart();
    renderCheckoutForm();
    return;
  }
  if (e.target.id === "checkoutKeepShopping") {
    $("#checkoutDialog").close();
  }
});

// Fase 39 — reemplaza la apertura de WhatsApp desde el navegador por un
// pedido real: POST a /api/orders/create, que revalida
// disponibilidad/precio server-side, persiste el pedido en Supabase, e
// intenta (sin bloquear ni fingir éxito) el email de confirmación y el
// aviso por WhatsApp Business a VIBE. El carrito solo se vacía en la
// rama de éxito — antes nada estaba realmente confirmado así que vaciar
// era una acción manual; ahora el pedido queda persistido de verdad en
// el primer intento exitoso.
$("#checkoutDialog").addEventListener("submit", async (e) => {
  if (!e.target.closest("#checkoutForm")) return;
  e.preventDefault();

  const form = e.target;
  const fd = new FormData(form);
  const data = Object.fromEntries(fd);
  data.contactConsent = fd.get("contactConsent") === "on";
  const { valid, errors } = validateCheckoutForm(data);

  form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));

  if (!valid) {
    let firstInput = null;
    Object.entries(errors).forEach(([field, message]) => {
      const errEl = document.getElementById(`err-${field}`);
      if (errEl) errEl.textContent = message;
      const input = form.querySelector(`[name="${field}"]`);
      if (input) {
        input.setAttribute("aria-invalid", "true");
        if (!firstInput) firstInput = input;
      }
    });
    if (firstInput) firstInput.focus();
    return;
  }

  const lines = cartLinesWithAvailability();
  if (lines.some((l) => l.unavailable)) return; // el botón ya está deshabilitado en este caso — guarda extra.

  const submitBtn = $("#checkoutSubmit");
  const errorEl = $("#checkoutSubmitError");
  if (errorEl) errorEl.textContent = "";
  // Protección de doble-submit: el flujo anterior era síncrono y no
  // tenía este riesgo; el nuevo flujo async introduce una ventana real
  // entre el click y la respuesta del servidor.
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const res = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: { name: data.name, phone: data.phone, email: data.email, city: data.city, address: data.address, notes: data.notes },
        contactConsent: data.contactConsent,
        items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, variantName: l.variantName, sku: l.sku, quantity: l.quantity })),
      }),
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      if (errorEl) errorEl.textContent = (payload && payload.error) || "No se pudo enviar tu pedido. Intenta de nuevo.";
      submitBtn.disabled = false;
      submitBtn.textContent = "ENVIAR PEDIDO";
      return;
    }

    clearCart();
    renderCart();
    renderCheckoutConfirmation(payload);
  } catch (err) {
    console.error("[VIBE] Error de red al enviar el pedido.", err);
    if (errorEl) errorEl.textContent = "No se pudo enviar tu pedido. Revisa tu conexión e intenta de nuevo.";
    submitBtn.disabled = false;
    submitBtn.textContent = "ENVIAR PEDIDO";
  }
});

function renderCheckoutConfirmation(order) {
  $("#checkoutBody").innerHTML = checkoutConfirmationHtml(order);
}

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
  $("#discoverVibeGrid").innerHTML = `<p class="empty">Cargando categorías...</p>`;

  try {
    state.products = await getProducts();
  } catch (e) {
    console.error("[VIBE] No se pudo inicializar el catálogo.", e);
    const message = `<p class="empty">No pudimos cargar el catálogo en este momento. Intenta de nuevo más tarde.</p>`;
    $("#productGrid").innerHTML = message;
    $("#discoverVibeGrid").innerHTML = message;
    return;
  }

  renderNav();
  renderProducts();
  renderOfertasHome();
  renderOfertasPage();
  renderDiscoverVibe();

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
