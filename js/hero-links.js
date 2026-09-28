// Fase 39 — destino de clic configurable de cada slide del Hero. Lógica
// pura (sin DOM, sin red), misma disciplina que js/taxonomy.js/
// js/checkout.js/js/url-state.js — importado tanto por
// js/hero-carousel.js (render público) como por admin/admin.js (preview
// en vivo del editor), para que ambos lados nunca puedan desincronizarse
// sobre qué destinos existen o cómo se calcula un href.
//
// Propiedad de seguridad: linkTarget para category/subcategory/product
// NUNCA se usa como href crudo — siempre se le aplica encodeURIComponent
// dentro de una plantilla de query string fija. Para "section", el
// valor siempre viene de un <select> de opciones fijas en Admin (ver
// SECTION_DESTINATIONS), nunca de texto libre, así que "#<id>" nunca
// puede ser otra cosa que uno de los ids reales conocidos. Solo
// "internal_route" reusa ctaHref tal cual (ya validado por
// isSafeCtaHref del lado del servidor) — es el único caso que sigue
// siendo un href crudo.

// Único punto de verdad de qué secciones del Home son destinos válidos
// — deliberadamente no incluye secciones condicionales/con datos que
// pueden no existir un día dado (Campaña/Novedades/Promociones): un
// slide que apuntara ahí podría aterrizar en una sección oculta, lo
// cual se sentiría roto aunque técnicamente no lo esté.
export const SECTION_DESTINATIONS = {
  inicio: "Hero / Inicio",
  shopVibe: "Shop VIBE",
  editorialMoment: "Editorial Beauty Moment",
  shopByCategory: "Shop by Category",
  productDiscovery: "Product Discovery",
  discoverHome: "Discover VIBE (Home)",
  catalogo: "Catálogo completo",
  discover: "Discover (landing completa)",
  editorialQuote: "Editorial — Cita",
  community: "Community",
};

// Sección → destino navegable. Sin linkType (slides existentes,
// retrocompatibilidad — sección 16 del brief), o con linkType "none",
// nunca se navega. Ver comentario de seguridad arriba: cada rama
// construye el href desde una plantilla fija, nunca a partir de
// linkTarget crudo.
export function buildSlideHref(slide) {
  const linkType = slide && slide.linkType;
  const linkTarget = slide && slide.linkTarget;

  if (!linkType) return slide && slide.ctaHref ? slide.ctaHref : "#catalogo";

  switch (linkType) {
    case "none":
      return null;
    case "category":
      return typeof linkTarget === "string" && linkTarget ? `?category=${encodeURIComponent(linkTarget)}#catalogo` : null;
    case "subcategory": {
      if (!linkTarget || !linkTarget.subcategory) return null;
      const params = new URLSearchParams();
      if (linkTarget.category) params.set("category", linkTarget.category);
      params.set("subcategory", linkTarget.subcategory);
      return `?${params.toString()}#catalogo`;
    }
    case "product":
      return typeof linkTarget === "string" && linkTarget ? `?product=${encodeURIComponent(linkTarget)}#catalogo` : null;
    case "section":
      return typeof linkTarget === "string" && linkTarget && SECTION_DESTINATIONS[linkTarget] ? `#${linkTarget}` : null;
    case "internal_route":
      return slide.ctaHref || null;
    default:
      return null;
  }
}

// Texto de preview para el editor de Admin ("Destino: Producto → #122").
export function describeSlideDestination(slide) {
  const linkType = slide && slide.linkType;
  const linkTarget = slide && slide.linkTarget;

  if (!linkType || linkType === "none") return "Sin enlace";
  switch (linkType) {
    case "category":
      return linkTarget ? `Categoría → ${linkTarget}` : "Categoría → (sin elegir)";
    case "subcategory":
      return linkTarget && linkTarget.subcategory ? `Subcategoría → ${linkTarget.category} › ${linkTarget.subcategory}` : "Subcategoría → (sin elegir)";
    case "product":
      return linkTarget ? `Producto → #${linkTarget}` : "Producto → (sin elegir)";
    case "section":
      return linkTarget && SECTION_DESTINATIONS[linkTarget] ? `Sección → ${SECTION_DESTINATIONS[linkTarget]}` : "Sección → (sin elegir)";
    case "internal_route":
      return slide.ctaHref ? `Ruta interna → ${slide.ctaHref}` : "Ruta interna → (sin definir)";
    default:
      return "Sin enlace";
  }
}
