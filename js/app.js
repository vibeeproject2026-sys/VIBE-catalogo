import { getProducts, getTaxonomy } from "./data-source.js";
import { getCart, addToCart, changeQuantity, removeFromCart, clearCart, getCartCount, getCartTotal, syncCartPrices } from "./cart.js";
import {
  getGroups,
  getCategoriesInGroup,
  getSubcategories,
  filterProducts,
  selectPromotions,
  ofertasHeadingCopy,
  sortProducts,
  emptyStateContent,
  normalizeSelection,
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
  applyTaxonomy,
} from "./taxonomy.js";
import { readStateFromSearch, buildUrl } from "./url-state.js";
import { computeOrderSummary, validateCheckoutForm } from "./checkout.js";
import { bindCartSwipe } from "./cart-swipe.js";
import { hasOptions, resolveVariant, selectionStatus, autoShadeId, autoPresentationId, lineOptionProblem } from "./variants.js";

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
// Fase 57 — shadeId/presentationId: opciones elegidas en la ficha abierta
// (dos dimensiones independientes, ver js/variants.js).
const state = { ...DEFAULT_FILTERS, product: null, variant: null, shadeId: null, presentationId: null, products: [] };
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
// Fase 46 — el menú superior ya no repite las categorías de "Descubre tu
// VIBE": Novedades y Más elegidos son vistas filtradas del catálogo y
// quedan marcadas mientras su filtro siga aplicado.
function updateHeaderNavActive() {
  document.querySelectorAll("#navNovedades, #mobileNavNovedades").forEach((a) => a.classList.toggle("nav-active", state.newOnly === true));
  document.querySelectorAll("#navElegidos, #mobileNavElegidos").forEach((a) => a.classList.toggle("nav-active", state.featuredOnly === true));
}

function renderNav() {
  // Fase 46 — nunca renderizar una combinación contradictoria de
  // grupo/categoría/subcategoría (ver normalizeSelection en taxonomy.js).
  if (state.products.length) {
    const normalized = normalizeSelection(state.products, state);
    if (normalized.group !== state.group || normalized.category !== state.category || normalized.subcategory !== state.subcategory) {
      Object.assign(state, normalized);
      syncUrl();
    }
  }
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
  // Fase 54 — las subcategorías solo se ofrecen dentro de una categoría
  // concreta: en «Todos» (o en un grupo con varias categorías sin elegir)
  // mezclaban subcategorías de categorías distintas y la fila parecía
  // duplicar a la de grupos. Una subcategoría ya aplicada (p. ej. desde
  // la URL o un slide del Hero) sigue filtrando y visible en los chips
  // de filtros activos.
  const subcategoriesHere = effectiveCategory !== "Todos" ? getSubcategories(state.products, state.group, effectiveCategory) : [];
  const showSubcategoryRow = subcategoriesHere.length > 1;
  $("#subcategoryTabs").classList.toggle("hidden", !showSubcategoryRow);
  $("#subcategorySelectWrap").classList.toggle("hidden", !showSubcategoryRow);
  if (showSubcategoryRow) {
    const options = ["Todos", ...subcategoriesHere];
    $("#subcategoryTabs").innerHTML = options.map(s => tabButton(s, state.subcategory === s, "subcategory")).join("");
    // En mobile la misma lista va en un selector compacto (CSS decide
    // cuál de los dos se ve; ambos aplican exactamente el mismo filtro).
    $("#subcategorySelect").innerHTML = options.map(s => `<option value="${esc(s)}" ${state.subcategory === s ? "selected" : ""}>${s === "Todos" ? "Todas" : esc(s)}</option>`).join("");
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
  // Fase 57 — con versiones optimizadas (p.imageSrcset), el navegador
  // elige el ancho justo; data-fallback-src devuelve el original si alguna
  // versión falla (ver listener "error" más abajo).
  const optimized = p.image && p.imageSrcset ? ` srcset="${esc(p.imageSrcset)}" sizes="(max-width: 900px) 50vw, 300px" data-fallback-src="${esc(p.image)}"` : "";
  return p.image ? `<img class="${cls}" src="${p.image}"${optimized} alt="${esc(p.name)}" loading="lazy" decoding="async">` : `<span class="card-img-empty">${esc(p.imageLabel)}</span>`;
}

// Fase final — versiones optimizadas de CUALQUIER foto del producto
// (galería, miniaturas, carrito, checkout), no solo la principal.
const SIZES_CARD = "(max-width: 900px) 50vw, 300px";
const SIZES_PDP = "(max-width: 900px) 100vw, 560px";
const SIZES_THUMB = "96px";
function srcsetOf(p, url) {
  if (!p || !url) return null;
  return (p.srcsetByUrl && p.srcsetByUrl[url]) || (url === p.image ? p.imageSrcset : null) || null;
}
function optimizedAttrs(p, url, sizes) {
  const set = srcsetOf(p, url);
  return set ? ` srcset="${esc(set)}" sizes="${sizes}" data-fallback-src="${esc(url)}"` : "";
}
// Cambia la foto de un <img> ya pintado (galería, hover de la tarjeta):
// con srcset el navegador ignora src, así que se reemplazan los dos.
function swapImage(img, p, url, sizes) {
  const set = srcsetOf(p, url);
  if (set) {
    img.sizes = sizes;
    img.srcset = set;
    img.dataset.fallbackSrc = url;
  } else {
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    delete img.dataset.fallbackSrc;
  }
  img.src = url;
}
function productById(id) {
  return findProduct(state.products || [], id);
}

// Fase 41 — pedido explícito: la card retail-premium retira categoría/
// descripción corta (esa información pasa a vivir solo en el PDP) y
// deja la jerarquía imagen→marca→nombre→precio→CTA. El CTA se relabela
// "Ver producto"→"+ Agregar" pero mantiene exactamente el mismo
// comportamiento (navega al PDP) — nunca un quick-add-to-cart sin
// pasar por la selección de variante/cantidad del PDP.
// Fase 56 — adelanto de tonos en la tarjeta (máx. 5 muestras + "+N").
// Fase 57 — más presentaciones: «N presentaciones» si hay varias activas,
// o su nombre si es una sola. Va en una ranura fija (.card-options) que
// mide 0 cuando el producto no tiene opciones.
function cardOptionsHtml(p) {
  const out = [];
  const shades = p.shades || [];
  if (shades.length) {
    const shown = shades.slice(0, 5);
    const more = shades.length - shown.length;
    out.push(`<p class="card-shades" aria-label="${shades.length} ${shades.length === 1 ? "tono" : "tonos"}">${shown.map((v) => `<span class="card-shade${v.active ? "" : " card-shade-off"}" style="--shade:${esc(v.hex)}" aria-hidden="true"></span>`).join("")}${more > 0 ? `<span class="card-shades-more">+${more}</span>` : ""}</p>`);
  }
  const pres = (p.presentations || []).filter((x) => x.active);
  if (pres.length > 1) out.push(`<p class="card-presentations">${pres.length} presentaciones</p>`);
  else if (pres.length === 1) out.push(`<p class="card-presentations">${esc(pres[0].name)}</p>`);
  return out.join("");
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
      <p class="card-brand"${p.brand ? "" : ' aria-hidden="true"'}>${p.brand ? esc(p.brand) : ""}</p>
      <h3>${esc(p.name)}</h3>
      <div class="card-options">${cardOptionsHtml(p)}</div>
      <div class="card-buy">
        <p class="card-price-row">
          <span class="price">${money(showPromo ? p.promoPrice : p.price)}</span>
          ${showPromo ? `<span class="old">${money(p.price)}</span>` : p.oldPrice ? `<span class="old">${money(p.oldPrice)}</span>` : ""}
          ${p.available === false ? `<span class="availability-badge">Agotado</span>` : ""}
        </p>
        <button class="button card-cta" data-product="${p.id}">+ Agregar</button>
      </div>
    </div>
  </article>`;
}

// Fase 46 — Novedades y Más elegidos (menú superior) son vistas del
// catálogo con título propio, para que se lean como destinos distintos.
const CURATED_HEADINGS = {
  newOnly: { title: "Novedades", subtitle: "Lo nuevo en VIBE, seleccionado por nuestro equipo." },
  featuredOnly: { title: "Más elegidos", subtitle: "Los favoritos que VIBE recomienda." },
};

function curatedViewKey() {
  if (state.group !== "Todos" || state.search) return null;
  if (state.newOnly && !state.featuredOnly) return "newOnly";
  if (state.featuredOnly && !state.newOnly) return "featuredOnly";
  return null;
}

function renderCatalogHeading() {
  const isAll = state.group === "Todos";
  const curated = curatedViewKey();
  if (curated) {
    $("#catalogTitle").textContent = CURATED_HEADINGS[curated].title;
    $("#catalogSubtitle").textContent = CURATED_HEADINGS[curated].subtitle;
    $("#catalogSubtitle").classList.remove("catalog-lead-intro");
    return;
  }
  $("#catalogTitle").textContent = isAll ? "Catálogo" : state.group;
  // Sin descripción editorial por categoría en el modelo de datos actual
  // (ver docs/fase27-plp.md) — se muestra la intro general solo en "Todos"
  // y se deja limpio en vez de inventar un texto por categoría.
  // Fase 48 — el mensaje "Esenciales de belleza…" pasó a la zona de marca
  // (columna derecha del encabezado, fija en el HTML).
  $("#catalogSubtitle").textContent = isAll ? "Explora por categoría y encuentra tu próximo esencial." : "";
  // Fase 56 — en mobile se retira solo esta frase introductoria (CSS
  // .catalog-lead-intro); escritorio la conserva tal cual.
  $("#catalogSubtitle").classList.toggle("catalog-lead-intro", isAll);
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
  if (isEmpty) {
    const { title, message } = emptyStateContent(state);
    $("#emptyState").innerHTML = `<p class="empty-title">${esc(title)}</p>
      <p class="empty-message">${esc(message)}</p>
      <div class="empty-actions">
        <button type="button" class="button dark" data-empty-action="all">Ver todo el catálogo</button>
        <a class="button outline" href="#discoverVibe">Ver categorías</a>
      </div>`;
  }

  // Estado E (sección 17): la lista tiene resultados pero ninguno está
  // disponible — se avisa sin ocultar el grid (siguen siendo productos
  // reales, solo agotados).
  const allSoldOut = !isEmpty && list.every((p) => p.available === false);
  $("#allSoldOutNotice").classList.toggle("hidden", !allSoldOut);

  $("#resultCount").textContent = list.length === 1 ? "1 producto" : `${list.length} productos`;

  renderActiveFilters();
  renderCatalogHeading();
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

// Fase 41 — sección "Ofertas" (#ofertas, ver index.html): única fuente,
// promoActive === true (ya resuelto server-side), sin paginación (la PLP
// tampoco la tiene hoy) — muestra todas las promociones activas. Sin
// ninguna, estado vacío honesto con salida al catálogo, nunca una grilla
// rota. Fase 56 — es la ÚNICA sección de promociones: el adelanto que
// había en el Home mostraba las mismas tarjetas y las duplicaba.
function renderOfertasPage() {
  const list = selectPromotions(state.products);
  const hasPromotions = list.length > 0;
  const copy = ofertasHeadingCopy(hasPromotions);
  $("#ofertasEyebrow").textContent = copy.eyebrow;
  $("#ofertasTitle").innerHTML = `${esc(copy.title)} <span class="title-accent">${esc(copy.accent)}</span>`;
  $("#ofertasLead").textContent = copy.lead;
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
// Fase 42.7 — pedido explícito: de grilla (2 tiles grandes + 3
// compactas) a una única fila horizontal editorial, referencia
// conceptual "Shop by Category" de retail de belleza — layout/
// experiencia únicamente, ningún asset/texto/código ajeno. Mismas 5
// categorías, mismo orden, mismo tamaño de tarjeta para las 5 (ya no
// hay "featured" — la fila entera es protagonista). La FOTO sigue
// siendo 100% data-driven: primer producto real de esa categoría con
// imagen subida (auditoría en producción: solo Rostro id 122 y Labios
// id 110 tienen foto real hoy).
//
// Fase 42.8 — para Ojos/Skincare/Accesorios (sin foto real de producto
// VIBE) se agrega una fotografía editorial genérica de belleza, real y
// con licencia de uso comercial verificada (Unsplash License, ver
// assets/discover/CREDITS.md) — nunca un producto VIBE inexistente, ni
// una imagen de e.l.f., ni nada inventado. Descargadas al proyecto, no
// referenciadas por URL externa. Si algún día existe foto real de
// producto VIBE para estas categorías, reemplaza automáticamente a la
// editorial (misma lógica de "primero lo real" que ya rige Rostro/
// Labios). Nunca repite el wordmark "VIBE" encima de cada tile.
//
// Fase 44 — reemplaza todo lo anterior sobre la FOTO: cada tarjeta usa
// una imagen editorial propia de VIBE, fija y asignada explícitamente
// a su categoría (assets/discover/vibe-category-*.webp, ver
// assets/discover/CREDITS.md). Ya no depende de productos, fotos de
// producto, publicación ni inventario, así que nunca cambia cuando
// cambia el catálogo. Dos anchos (640w / 1122w original) vía srcset.
// Destinos (group/category) sin cambios.
const DISCOVER_VIBE_TILES = [
  { label: "Rostro", group: "Maquillaje", category: "Rostro", image: "vibe-category-rostro" },
  { label: "Labios", group: "Maquillaje", category: "Labios", image: "vibe-category-labios" },
  { label: "Ojos", group: "Maquillaje", category: "Ojos", image: "vibe-category-ojos" },
  // Fase 46 — Skincare y Accesorios son grupos editoriales completos: se
  // filtra solo por grupo. Antes forzaban la categoría POS ("Skincare" /
  // "Otro"), que nunca coincide con la categoría editorial asignada en
  // Admin (Limpieza, Herramientas de aplicación...) → 0 productos.
  { label: "Skincare", group: "Skincare", image: "vibe-category-skincare" },
  { label: "Accesorios", group: "Accesorios", image: "vibe-category-accesorios" },
];

function renderDiscoverVibe() {
  $("#discoverVibeGrid").innerHTML = DISCOVER_VIBE_TILES.map(({ label, group, category, image }) => {
    const slugClass = `discover-tile-${label.toLowerCase()}`;
    const base = `assets/discover/${image}`;
    const imageHtml = `<img class="discover-tile-photo" src="${base}.webp" srcset="${base}-640.webp 640w, ${base}.webp 1122w" sizes="(max-width: 900px) 265px, 25vw" width="1122" height="1402" alt="${esc(label)}" loading="lazy" decoding="async">`;
    const categoryAttr = category ? ` data-category="${esc(category)}"` : "";
    return `<button class="discover-tile ${slugClass}" data-group="${esc(group)}"${categoryAttr}>
      ${imageHtml}
      <span class="discover-tile-scrim"></span>
      <span class="discover-tile-body">
        <span class="discover-tile-label">${esc(label)}</span>
        <span class="discover-tile-cta">Explorar →</span>
      </span>
    </button>`;
  }).join("");
  // Fase 42.8 — las flechas se enlazan una sola vez al arrancar (ver
  // bindDiscoverArrows), pero su estado disabled depende del contenido
  // real recién inyectado arriba — reutiliza el mismo listener de
  // "resize" que ya recalcula ese estado, en vez de duplicar la lógica.
  window.dispatchEvent(new Event("resize"));
}

// Fase 29, sección 2 — una línea del carrito: imagen, marca (si existe),
// nombre, precio unitario (con el promocional tachando el original
// cuando aplica — originalPrice solo llega no-null si cart.js lo guardó
// con una promoción real, ver openProduct/addToCart), cantidad,
// subtotal de la línea y eliminar. Nunca stock ni costos: cart.js nunca
// los tuvo en primer lugar.
// Fase 47 — icono de papelera (trazo, hereda currentColor).
const TRASH_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Fase 47 — cada fila tiene su botón visible "Eliminar" (papelera +
// etiqueta) y, detrás, la acción que revela el gesto de deslizar en
// mobile (js/cart-swipe.js). Ambos usan data-a="del": la eliminación
// siempre pasa por el mismo handler de #cartItems.
// Fase 57 — opciones de una línea: «Tono: X · Presentación: Y». Las
// líneas guardadas antes de esta fase solo tienen variantName (se muestra
// salvo los genéricos «Único»/«Default», que no dicen nada).
function lineOptionsMeta(i) {
  const parts = [];
  if (i.shadeName) parts.push(`<span class="cart-shade" style="--shade:${esc(i.variantHex || "#cccccc")}" aria-hidden="true"></span>Tono: ${esc(i.shadeName)}`);
  if (i.presentationName) parts.push(`Presentación: ${esc(i.presentationName)}`);
  if (!parts.length && i.variantName && i.variantName !== "Único" && i.variantName !== "Default") parts.push(esc(i.variantName));
  return parts.map((t) => `<span class="opt-part">${t}</span>`).join(" · ");
}

// Fase 57 — si una versión optimizada (srcset) no carga, se vuelve al
// original: se quitan srcset/sizes y las <source> optimizadas y se usa
// data-fallback-src. "error" no burbujea: se escucha en captura.
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fallbackSrc) return;
    const picture = img.closest("picture");
    const optimizedSources = picture ? picture.querySelectorAll("source[data-optimized]") : [];
    if (!img.hasAttribute("srcset") && !optimizedSources.length) return; // ya es el original
    optimizedSources.forEach((s) => s.remove());
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.src = img.dataset.fallbackSrc;
  },
  true
);

function cartItemHtml(i) {
  const showPromo = i.originalPrice != null && i.originalPrice > i.price;
  const ids = `data-p="${i.productId}" data-v="${i.variantId}"`;
  return `<div class="cart-item" data-swipe>
    <button type="button" class="cart-swipe-action" data-a="del" ${ids} tabindex="-1" aria-hidden="true">${TRASH_ICON}<span>Eliminar</span></button>
    <div class="cart-item-inner">
    <div class="thumb">${i.image ? `<img src="${esc(i.image)}"${optimizedAttrs(productById(i.productId), i.image, SIZES_THUMB)} alt="${esc(i.name)}">` : "VIBE"}</div>
    <div>
      ${i.brand ? `<p class="cart-item-brand">${esc(i.brand)}</p>` : ""}
      <h3>${esc(i.name)}</h3>
      <div class="meta">${lineOptionsMeta(i)}</div>
      <div class="cart-item-unit-price">
        <span>${money(i.price)}</span>
        ${showPromo ? `<span class="old">${money(i.originalPrice)}</span>` : ""}
      </div>
      <div class="qty">
        <button data-a="dec" data-p="${i.productId}" data-v="${i.variantId}" aria-label="Quitar una unidad de ${esc(i.name)}">−</button>
        <span aria-label="Cantidad">${i.quantity}</span>
        <button data-a="inc" data-p="${i.productId}" data-v="${i.variantId}" aria-label="Agregar una unidad de ${esc(i.name)}">+</button>
      </div>
    </div>
    <div class="cart-item-side">
      <div class="cart-price">${money(i.price * i.quantity)}</div>
      <button type="button" class="remove" data-a="del" ${ids} aria-label="Eliminar ${esc(i.name)} del carrito">${TRASH_ICON}<span>Eliminar</span></button>
    </div>
    </div>
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
  $("#cartItems").innerHTML = items.length ? priceChangesNotice(pendingPriceNotice) + items.map(cartItemHtml).join("") : cartEmptyHtml();
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
  return (selected() || p.variants[0]).price;
}

// Fase 56 — paleta de tonos (muestras circulares); un tono inactivo se ve
// tachado y no se puede elegir. Nada se preselecciona cuando hay varios.
// Fase 57 — tonos y presentaciones por separado. Con una sola opción en
// una dimensión se muestra (sin selector) y se aplica sola; con varias,
// la clienta elige. Roving tabindex: el elegido, o el primero activo.
function optionRadio({ cls, dim, opt, on, tabbable, style = "", text = "" }) {
  const label = opt.active ? opt.name : `${opt.name} (no disponible)`;
  return `<button type="button" class="${cls}${on ? " selected" : ""}${opt.active ? "" : ` ${cls}-off`}" role="radio" aria-checked="${on}" aria-label="${esc(label)}" title="${esc(label)}" data-${dim}="${esc(opt.id)}" data-active="${opt.active}" ${opt.active ? "" : 'aria-disabled="true"'} tabindex="${tabbable ? 0 : -1}"${style}>${text}</button>`;
}
function radioList(list, currentId, render) {
  const firstActive = list.find((x) => x.active);
  const hasCurrent = list.some((x) => String(x.id) === String(currentId));
  return list.map((opt) => {
    const on = String(opt.id) === String(currentId);
    return render(opt, on, on || (!hasCurrent && opt === firstActive));
  }).join("");
}
function shadePickerHtml(p) {
  const list = p.shades || [];
  if (!list.length) return "";
  if (list.length === 1) {
    const sh = list[0];
    return `<div class="shade-picker shade-single"><p class="shade-label"><span class="cart-shade" style="--shade:${esc(sh.hex)}" aria-hidden="true"></span>Tono: <strong>${esc(sh.name)}</strong>${sh.active ? "" : " · no disponible"}</p></div>`;
  }
  const current = list.find((x) => String(x.id) === String(state.shadeId));
  const swatches = radioList(list, state.shadeId, (opt, on, tabbable) => optionRadio({ cls: "shade", dim: "shade", opt, on, tabbable, style: ` style="--shade:${esc(opt.hex)}"` }));
  return `<div class="shade-picker">
    <p class="shade-label">Tono: <strong id="shadeName">${current ? esc(current.name) : "elige uno"}</strong></p>
    <div class="shade-swatches" role="radiogroup" aria-label="Tonos disponibles">${swatches}</div>
  </div>`;
}
function presentationPickerHtml(p) {
  const list = p.presentations || [];
  if (!list.length) return "";
  if (list.length === 1) {
    const pr = list[0];
    return `<div class="presentation-picker presentation-single"><p class="shade-label">Presentación: <strong>${esc(pr.name)}</strong>${pr.active ? "" : " · no disponible"}</p></div>`;
  }
  const current = list.find((x) => String(x.id) === String(state.presentationId));
  const chips = radioList(list, state.presentationId, (opt, on, tabbable) => optionRadio({ cls: "presentation-option", dim: "presentation", opt, on, tabbable, text: esc(opt.name) }));
  return `<div class="presentation-picker">
    <p class="shade-label">Presentación: <strong id="presentationName">${current ? esc(current.name) : "elige una"}</strong></p>
    <div class="presentation-options" role="radiogroup" aria-label="Presentaciones disponibles">${chips}</div>
  </div>`;
}

function addButtonState(p) {
  if (p.available === false) return { disabled: true, label: "Agotado" };
  if (hasOptions(p)) {
    const { missing, blocked } = selectionStatus(p, state.shadeId, state.presentationId);
    if (blocked === "shade") return { disabled: true, label: p.shades.length > 1 ? "Tonos no disponibles" : "Tono no disponible" };
    if (blocked === "presentation") return { disabled: true, label: p.presentations.length > 1 ? "Presentaciones no disponibles" : "Presentación no disponible" };
    if (missing.length === 2) return { disabled: true, label: "Elige tono y presentación" };
    if (missing[0] === "shade") return { disabled: true, label: "Elige un tono" };
    if (missing[0] === "presentation") return { disabled: true, label: "Elige una presentación" };
  }
  return { disabled: false, label: "Agregar al carrito" };
}

// Refleja la selección actual en los controles de la ficha sin
// re-renderizarla (conserva foco y cantidad).
function syncOptionUi() {
  const p = state.product;
  document.querySelectorAll(".variant[data-variant]").forEach((x) => x.classList.toggle("selected", x.dataset.variant === state.variant));
  for (const [sel, key, nameEl, list] of [[".shade[data-shade]", "shadeId", "#shadeName", p.shades], [".presentation-option[data-presentation]", "presentationId", "#presentationName", p.presentations]]) {
    const nodes = [...document.querySelectorAll(sel)];
    if (!nodes.length) continue;
    const attr = key === "shadeId" ? "shade" : "presentation";
    const hasCurrent = nodes.some((x) => x.dataset[attr] === String(state[key]));
    const firstActive = nodes.find((x) => x.dataset.active === "true");
    nodes.forEach((x) => {
      const on = x.dataset[attr] === String(state[key]);
      x.classList.toggle("selected", on);
      x.setAttribute("aria-checked", on ? "true" : "false");
      x.tabIndex = on || (!hasCurrent && x === firstActive) ? 0 : -1;
    });
    const cur = (list || []).find((o) => String(o.id) === String(state[key]));
    if ($(nameEl) && cur) $(nameEl).textContent = cur.name;
  }
  const st = addButtonState(p);
  $("#addButton").disabled = st.disabled;
  $("#addButton").textContent = st.label;
  $("#detailPrice").textContent = money(currentEffectivePrice());
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
  const main = `<div class="pdp-gallery-main"><img id="pdpMainImage" class="detail-photo" src="${esc(images[0])}"${optimizedAttrs(p, images[0], SIZES_PDP)} alt="${esc(p.mainImageAlt || p.name)}" loading="eager">${arrows}</div>`;
  const thumbs =
    images.length > 1
      ? `<div class="pdp-thumbs">${images
          .map(
            (img, i) =>
              `<button type="button" class="pdp-thumb${i === 0 ? " active" : ""}" data-thumb="${i}" aria-label="Imagen ${i + 1} de ${esc(p.name)}"><img src="${esc(img)}"${optimizedAttrs(p, img, SIZES_THUMB)} alt="" loading="${i === 0 ? "eager" : "lazy"}"></button>`
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
  const hasVariants = !hasOptions(p) && p.variants.length > 1;
  const addState = addButtonState(p);

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
    ${shadePickerHtml(p)}
    ${presentationPickerHtml(p)}
    <!-- Fase 37 — reorden de jerarquía inspirado en el benchmark (imagen
         → marca → nombre → precio → variante → DISPONIBILIDAD → CTA):
         antes "Agotado" aparecía antes de las variantes; ahora va justo
         antes de la acción de compra, que es donde realmente importa. -->
    ${unavailable ? `<span class="availability-badge">Agotado</span>` : ""}
    <div class="detail-actions">
      <div class="quantity">
        <button type="button" data-q="-1" aria-label="Quitar una unidad" ${unavailable ? "disabled" : ""}>−</button>
        <input id="detailQty" type="number" min="1" value="1" aria-label="Cantidad" ${unavailable ? "disabled" : ""}>
        <button type="button" data-q="1" aria-label="Agregar una unidad" ${unavailable ? "disabled" : ""}>+</button>
      </div>
      <button id="addButton" class="button dark pdp-buy-button" ${addState.disabled ? "disabled" : ""}>${addState.label}</button>
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
// Fase 56 — URL canónica: la portada, o la ficha abierta (/?product=ID,
// las mismas URL que lista /sitemap.xml). Siempre el dominio oficial.
const CANONICAL_BASE = "https://www.vibebeautycol.com/";
function setCanonical(productId) {
  const link = document.querySelector('link[rel="canonical"]');
  if (link) link.href = productId == null ? CANONICAL_BASE : `${CANONICAL_BASE}?product=${encodeURIComponent(productId)}`;
}

function openProduct(id, { pushHistory = true } = {}) {
  const p = findProduct(state.products, id);
  if (!p) {
    state.product = null;
    renderProductNotFound();
    if (!$("#productDialog").open) $("#productDialog").showModal();
    return;
  }
  state.product = p;
  setCanonical(p.id);
  // Fase 56/57 — con varias opciones en una dimensión, nada preseleccionado
  // (la clienta elige); con una sola, se aplica sola.
  state.variant = p.variants[0].id;
  state.shadeId = autoShadeId(p);
  state.presentationId = autoPresentationId(p);
  renderProductDetail(p);
  if (pushHistory) {
    // Fase final — si el cierre anterior aún está volviendo atrás en el
    // historial (history.back() es asíncrono), empujar ahora haría que ese
    // back() pendiente aterrice sobre la entrada equivocada y su popstate
    // reabra la ficha anterior. La entrada de esta ficha se empuja cuando
    // ese back() termine (ver popstate); la ficha se muestra ya.
    // Y si la ficha anterior se acaba de cerrar pero su evento 'close'
    // (asíncrono) aún no corrió, su entrada sigue arriba: se reemplaza en
    // vez de apilar otra, para que Atrás no vuelva a la ficha cerrada.
    if (ownHistoryBackPending) deferredProductPush = String(p.id);
    else pushProductHistory(p.id, { replace: !$("#productDialog").open && Boolean(window.history.state && window.history.state.vibeProduct) });
  }
  if (!$("#productDialog").open) $("#productDialog").showModal();
}

function pushProductHistory(id, { replace = false } = {}) {
  try {
    window.history[replace ? "replaceState" : "pushState"]({ vibeProduct: String(id) }, "", buildUrl(window.location.pathname, { ...state, product: id }));
  } catch {
    // history/URL APIs unavailable — no bloquea la apertura del producto.
  }
}

function selected() {
  const p = state.product;
  if (hasOptions(p)) return resolveVariant(p, state.shadeId, state.presentationId);
  return p.variants.find((v) => String(v.id) === String(state.variant)) || p.variants[0];
}

function selectGalleryThumb(thumb) {
  const images = pdpGalleryImages(state.product);
  const idx = Number(thumb.dataset.thumb);
  const main = $("#pdpMainImage");
  if (main && images[idx]) swapImage(main, state.product, images[idx], SIZES_PDP);
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

// Fase 45 — al cerrar el PDP el foco vuelve a la tarjeta que lo abrió.
// Se guarda (grid, id) y no el nodo: cerrar dispara history.back() →
// popstate → renderProducts(), que reemplaza las tarjetas, así que el
// nodo original deja de existir. Tampoco se usa document.activeElement:
// Safari no enfoca botones al tocarlos/clickearlos.
let productTrigger = null;
let pendingTriggerFocus = null;
// Fase final — history.back() propio en curso (lanzado al cerrar la ficha)
// y, si mientras tanto se abrió otra, el id cuya entrada falta empujar.
let ownHistoryBackPending = false;
let deferredProductPush = null;

function restoreProductTriggerFocus(trigger) {
  if (!trigger || $("#productDialog").open || $("#cartDrawer").classList.contains("open")) return;
  const el = document.querySelector(`${trigger.grid} [data-product="${CSS.escape(trigger.productId)}"]`);
  if (el) el.focus({ preventScroll: true });
}

function bindProductGrid(id) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("[data-product]");
    if (!b) return;
    if (!$("#productDialog").open) productTrigger = { grid: id, productId: b.dataset.product };
    openProduct(b.dataset.product);
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
    swapImage(s.img, s.product, s.images[0], SIZES_CARD); // siempre vuelve a la imagen principal
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
  // Fase final — precarga la misma versión que se va a mostrar.
  images.slice(1).forEach((src) => {
    const pre = new Image();
    const set = srcsetOf(p, src);
    if (set) {
      pre.sizes = SIZES_CARD;
      pre.srcset = set;
    }
    pre.src = src;
  });
  const state_ = { images, img, product: p, intervalId: null, currentIndex: 0 };
  state_.timeoutId = setTimeout(() => {
    state_.intervalId = setInterval(() => {
      state_.currentIndex = (state_.currentIndex + 1) % images.length;
      img.style.opacity = "0";
      state_.fadeTimeoutId = setTimeout(() => {
        swapImage(img, p, images[state_.currentIndex], SIZES_CARD);
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

$("#subcategorySelect").addEventListener("change", e => {
  state.subcategory = e.target.value;
  applyFiltersAndRender();
});

// Navegación por grupo/categoría desde las tarjetas de "Descubre tu VIBE"
// (data-group + data-category opcional). Fase 46 — el menú superior ya no
// tiene enlaces por categoría, así que solo se enlaza esa sección.
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
bindWorldNav("#discoverVibeGrid");

// Fase 42.8 — flechas de "Descubre tu VIBE": desplazan la fila por un
// tile completo (ancho real + gap, medido en vivo — nunca un número
// fijo que se desincronice de las media queries) y se ocultan solas en
// cada extremo. Un solo listener de scroll (con rAF para no saturar)
// cubre tanto el swipe táctil como el click de las flechas, porque
// ambos disparan el mismo evento nativo sobre el contenedor.
function bindDiscoverArrows() {
  const row = $("#discoverVibeGrid");
  const prevBtn = $("#discoverPrev");
  const nextBtn = $("#discoverNext");
  if (!row || !prevBtn || !nextBtn) return;

  function step() {
    const tile = row.querySelector(".discover-tile");
    if (!tile) return row.clientWidth * 0.8;
    const gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap || "0") || 0;
    return tile.getBoundingClientRect().width + gap;
  }

  function updateArrows() {
    const maxScroll = row.scrollWidth - row.clientWidth;
    prevBtn.disabled = row.scrollLeft <= 1;
    nextBtn.disabled = maxScroll <= 1 || row.scrollLeft >= maxScroll - 1;
  }

  prevBtn.addEventListener("click", () => row.scrollBy({ left: -step(), behavior: "smooth" }));
  nextBtn.addEventListener("click", () => row.scrollBy({ left: step(), behavior: "smooth" }));

  let ticking = false;
  row.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateArrows();
      ticking = false;
    });
  });
  window.addEventListener("resize", updateArrows);
  updateArrows();
}
bindDiscoverArrows();

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
// Fase 46 — "Más elegidos": selección editorial = productos marcados
// "Producto destacado" en Admin (featured; mismo filtro que "Solo más
// elegidos VIBE" del panel Filtrar + Ordenar). No son "más vendidos": no
// hay datos de ventas detrás.
document.querySelectorAll("#navElegidos, #mobileNavElegidos").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    goToFilter({ featuredOnly: true });
  });
});

// Fase 46 — acción "Ver todo el catálogo" del estado vacío ("Ver
// categorías" es un enlace normal a #discoverVibe).
$("#emptyState").addEventListener("click", (e) => {
  if (!e.target.closest('[data-empty-action="all"]')) return;
  e.preventDefault();
  goToFilter({});
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

bindCartSwipe($("#cartItems"));

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

  // Fase 57 — tono y presentación se eligen por separado; una opción
  // inactiva no se puede elegir.
  const opt = e.target.closest("[data-shade], [data-presentation]");
  if (opt) {
    if (opt.dataset.active === "false") return;
    if (opt.dataset.shade !== undefined) state.shadeId = opt.dataset.shade;
    else state.presentationId = opt.dataset.presentation;
    syncOptionUi();
    return;
  }
  const v = e.target.closest("[data-variant]");
  if (v) {
    state.variant = v.dataset.variant;
    syncOptionUi();
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
    if (!variant) return; // Fase 56/57 — opciones obligatorias elegidas y activas
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
  // Fase 56/57 — dentro de un grupo de opciones (tonos o presentaciones),
  // las flechas recorren solo las opciones disponibles de ese grupo.
  const radio = e.target.closest && e.target.closest('[role="radiogroup"] [role="radio"]');
  if (radio && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    const list = [...radio.closest('[role="radiogroup"]').querySelectorAll('[role="radio"][data-active="true"]')];
    const idx = list.indexOf(radio);
    const next = list[(idx + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + list.length) % list.length];
    if (next) { next.focus(); next.click(); }
    return;
  }
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
  // Fase final — el evento 'close' llega en una tarea posterior: si para
  // entonces la ficha ya se volvió a abrir (con otro producto), este
  // evento pertenece a la apertura anterior y no debe cerrar ni limpiar
  // la nueva.
  if ($("#productDialog").open) return;
  state.product = null;
  setCanonical(null);
  const trigger = productTrigger;
  productTrigger = null;
  restoreProductTriggerFocus(trigger);
  if (suppressHistoryOnClose) {
    suppressHistoryOnClose = false;
    return;
  }
  // Se cerró una ficha abierta mientras el back() anterior seguía en curso:
  // su entrada nunca se empujó, así que basta con descartarla (otro back()
  // saldría del sitio).
  if (ownHistoryBackPending) {
    deferredProductPush = null;
    return;
  }
  try {
    if (window.history.state && window.history.state.vibeProduct) {
      ownHistoryBackPending = true;
      // popstate re-renderiza las tarjetas: el foco se restaura de nuevo ahí.
      pendingTriggerFocus = trigger;
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
    if (!product || product.available === false) return { ...item, unavailable: true, unavailableReason: "product" };
    // Fase 56/57 — las opciones guardadas (tono, presentación) deben seguir
    // existiendo y activas con la configuración vigente del producto.
    if (lineOptionProblem(product, item)) return { ...item, unavailable: true, unavailableReason: "option" };
    return { ...item, unavailable: false };
  });
}

// Fase 56 — precio vigente de cada línea según el catálogo cargado (el
// promocional cuando aplica). Actualiza el carrito y devuelve los cambios
// para avisar a la clienta. El servidor vuelve a calcular todo al crear
// el pedido (y rechaza un total distinto del mostrado).
function syncCartWithCatalog() {
  return syncCartPrices((item) => {
    const p = findProduct(state.products, item.productId);
    if (!p || lineOptionProblem(p, item)) return null;
    // Sin precio por opción en el POS: toda combinación usa el precio base
    // (las variantes demo sí traen precio propio).
    const v = hasOptions(p) ? p.variants[0] : p.variants.find((x) => String(x.id) === String(item.variantId)) || p.variants[0];
    const promo = p.promoActive === true && p.promoPrice != null;
    return { price: promo ? p.promoPrice : v.price, originalPrice: promo ? p.price : null };
  });
}
function priceChangesNotice(changes) {
  if (!changes || !changes.length) return "";
  return `<p class="notice price-notice" role="status">Actualizamos ${changes.length === 1 ? "un precio" : "algunos precios"} de tu carrito: ${changes.map((c) => `${esc(c.name)} ${money(c.from)} → ${money(c.to)}`).join(" · ")}. Revisa el total antes de enviar.</p>`;
}
let pendingPriceNotice = [];

// Fase 56 — clave de idempotencia por intento lógico de compra: la misma
// mientras el carrito no cambie (así un reintento tras un corte de red no
// duplica el pedido); se descarta tras un pedido exitoso.
const CHECKOUT_KEY = "vibe-checkout-attempt";
function cartSignature() {
  return getCart().map((i) => `${i.productId}:${i.variantId}:${i.quantity}`).sort().join("|");
}
function checkoutIdempotencyKey() {
  const sig = cartSignature();
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || "null");
    if (saved && saved.sig === sig && typeof saved.key === "string") return saved.key;
  } catch {
    // sessionStorage no disponible: se usa una clave nueva
  }
  const key = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
  try {
    sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ sig, key }));
  } catch {
    // sin persistencia: sigue funcionando para este intento
  }
  return key;
}
function clearCheckoutAttempt() {
  try {
    sessionStorage.removeItem(CHECKOUT_KEY);
  } catch {
    // nada que limpiar
  }
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
    // Fase 56 — se refresca el producto completo (precio, promoción, tonos
    // y disponibilidad), no solo "available"; un producto que ya no viene
    // en el catálogo queda fuera (su línea se marca no disponible).
    state.products = fresh;
    pendingPriceNotice = syncCartWithCatalog();
    renderCart();
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
        <div class="thumb">${l.image ? `<img src="${esc(l.image)}"${optimizedAttrs(productById(l.productId), l.image, SIZES_THUMB)} alt="${esc(l.name)}">` : "VIBE"}</div>
        <div class="checkout-line-info">
          ${l.brand ? `<p class="cart-item-brand">${esc(l.brand)}</p>` : ""}
          <h3>${esc(l.name)}</h3>
          <div class="meta">${[lineOptionsMeta(l), `Cantidad: ${l.quantity}`].filter(Boolean).join(" · ")}</div>
          ${l.unavailable ? `<p class="checkout-line-warning">${l.unavailableReason === "option" ? "La opción elegida (tono o presentación) ya no está disponible o cambió — quita esta línea y vuelve a elegir en el producto." : "Ya no está disponible — quítalo para continuar."}</p>` : ""}
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
    ${priceChangesNotice(pendingPriceNotice)}
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
    <!-- Fase 56 — campo trampa antispam: oculto para personas y lectores de pantalla. -->
    <div class="hp-field" aria-hidden="true"><label>No completar<input name="website" tabindex="-1" autocomplete="off"></label></div>
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
    if (hasUnavailable) submitBtn.textContent = (lines.some((l) => l.unavailableReason === "option") ? "Corrige las opciones no disponibles para continuar" : "Quita los productos agotados para continuar");
  }
}

function rerenderCheckoutSummary() {
  const el = document.querySelector("#checkoutBody .checkout-summary");
  if (!el) return renderCheckoutForm();
  el.outerHTML = checkoutSummaryHtml(false);
  const lines = cartLinesWithAvailability();
  const hasUnavailable = lines.some((l) => l.unavailable);
  const submitBtn = $("#checkoutSubmit");
  if (submitBtn) {
    submitBtn.disabled = hasUnavailable || !lines.length;
    submitBtn.textContent = hasUnavailable ? (lines.some((l) => l.unavailableReason === "option") ? "Corrige las opciones no disponibles para continuar" : "Quita los productos agotados para continuar") : "ENVIAR PEDIDO";
  }
}

async function openCheckout() {
  pendingPriceNotice = [];
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
  const expectedTotal = computeOrderSummary(lines).total;

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
        // Fase 57 — ids de tono/presentación: el servidor los valida contra la
        // ficha del producto y toma de ahí los nombres (variantName no se usa).
        items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, shadeId: l.shadeId ?? null, presentationId: l.presentationId ?? null, variantName: l.variantName, sku: l.sku, quantity: l.quantity })),
        // Fase 56 — el total que la clienta vio (el servidor rechaza si
        // cambió), la clave del intento (evita duplicados al reintentar) y
        // el campo trampa antispam.
        expectedTotal,
        idempotencyKey: checkoutIdempotencyKey(),
        website: data.website || "",
      }),
    });
    const payload = await res.json().catch(() => null);

    if (res.status === 409 && payload && (payload.code === "PRICE_CHANGED" || payload.code === "VARIANT_UNAVAILABLE")) {
      // Fase 56 — precios o tonos cambiaron: se actualiza el resumen (sin
      // borrar el formulario) y la clienta confirma de nuevo con el total real.
      await refreshAvailability();
      rerenderCheckoutSummary();
      if (errorEl) errorEl.textContent = payload.error;
      if (!$("#checkoutSubmit").disabled) $("#checkoutSubmit").textContent = "ENVIAR PEDIDO";
      return;
    }

    if (!res.ok) {
      if (errorEl) errorEl.textContent = (payload && payload.error) || "No se pudo enviar tu pedido. Intenta de nuevo.";
      submitBtn.disabled = false;
      submitBtn.textContent = "ENVIAR PEDIDO";
      return;
    }

    // 201 = pedido nuevo; 200 + replayed = este mismo intento ya estaba
    // registrado (p. ej. tras un corte de red): se confirma ese pedido.
    clearCheckoutAttempt();
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
  $("#menuToggle").setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
});
// Fase 47 — Escape cierra el menú mobile y devuelve el foco al botón.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !$("#mobileNav").classList.contains("open")) return;
  $("#mobileNav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
  $("#menuToggle").setAttribute("aria-label", "Abrir menú");
  $("#menuToggle").focus();
});
// Fase 46 — el menú mobile vive dentro del header sticky, en el flujo: si
// se cierra DESPUÉS de navegar (y con su transición de max-height), la
// página se desplaza hacia arriba lo que medía el menú y el destino
// (#ofertas, #discoverVibe, #catalogo) queda fuera de vista. Por eso se
// cierra en fase de captura —antes del handler del propio enlace— y sin
// animación, para que el layout ya sea el definitivo al hacer scroll.
$("#mobileNav").addEventListener("click", e => {
  if (!e.target.closest("a")) return;
  const nav = $("#mobileNav");
  nav.style.transition = "none";
  nav.classList.remove("open");
  void nav.offsetHeight;
  requestAnimationFrame(() => { nav.style.transition = ""; });
  $("#menuToggle").setAttribute("aria-expanded", "false");
  $("#menuToggle").setAttribute("aria-label", "Abrir menú");
}, true);
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
  // Fase final — llegó el back() lanzado al cerrar una ficha. Si entretanto
  // se abrió otra, ahora sí se empuja su entrada y no se reconcilia nada
  // (la URL de destino es el catálogo y la ficha nueva debe seguir abierta).
  if (ownHistoryBackPending) {
    ownHistoryBackPending = false;
    if (deferredProductPush) {
      const id = deferredProductPush;
      deferredProductPush = null;
      pendingTriggerFocus = null; // el foco está en la ficha nueva
      pushProductHistory(id);
      return;
    }
  }
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

  // Fase 45 — renderProducts() acaba de reemplazar las tarjetas.
  restoreProductTriggerFocus(pendingTriggerFocus);
  pendingTriggerFocus = null;
});

// Fase 56 — catálogo real no disponible (API caída): nunca se muestra un
// catálogo de demostración.
function renderCatalogUnavailable() {
  const html = `<div id="catalogUnavailable" class="catalog-unavailable" role="alert">
      <p class="catalog-unavailable-title">El catálogo no está disponible en este momento</p>
      <p class="catalog-unavailable-text">No pudimos cargar los productos. Tu carrito sigue guardado. Intenta de nuevo en unos segundos o escríbenos por WhatsApp.</p>
      <button type="button" class="button dark" data-retry-catalog>Reintentar</button>
    </div>`;
  $("#productGrid").innerHTML = html;
  $("#discoverVibeGrid").innerHTML = `<p class="empty">Categorías no disponibles por ahora.</p>`;
  $("#resultCount").textContent = "";
  $("#productGrid [data-retry-catalog]").addEventListener("click", () => loadCatalog());
}

async function loadCatalog() {
  const urlState = readStateFromSearch(window.location.search);
  applyUrlToFilterState(urlState);

  $("#productGrid").innerHTML = `<p class="empty">Cargando catálogo...</p>`;
  $("#discoverVibeGrid").innerHTML = `<p class="empty">Cargando categorías...</p>`;
  $("#catalogUnavailable")?.remove();

  // Fase 56 — la taxonomía editable se pide en paralelo; si falla, se
  // sigue con la de código (nunca bloquea el catálogo).
  const taxonomyPromise = getTaxonomy().catch(() => null);
  try {
    state.products = await getProducts();
  } catch (e) {
    console.error("[VIBE] No se pudo inicializar el catálogo.", e);
    // Fase 56 — sin productos de demostración: estado claro de
    // indisponibilidad, sin tarjetas ni precios, y opción de reintentar.
    state.products = [];
    renderCatalogUnavailable();
    return;
  }
  const taxonomy = await taxonomyPromise;
  if (taxonomy) applyTaxonomy(taxonomy);
  // Fase 56 — el carrito guardado se alinea con los precios vigentes.
  pendingPriceNotice = syncCartWithCatalog();
  renderCart();

  renderNav();
  renderProducts();
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
