// Fase 33 — Hero carousel administrable. Fuente de datos: NO una tabla
// SQL (este entorno no tiene acceso de escritura DDL a Supabase — ver
// decisión explícita del usuario en esta fase) sino un único manifiesto
// JSON ("hero/slides.json") dentro del bucket de Storage YA existente
// ("product-images", reutilizado vía api/admin/_lib/storage.js — nunca
// se crea un bucket nuevo). Completamente separado de products y de
// catalog_metadata: ningún slide vive ahí, y esta fuente nunca se
// consulta para nada relacionado con productos.
//
// Este archivo es lógica compartida entre el endpoint público
// (api/hero/slides.js) y el administrativo (api/admin/hero-slides.js) —
// deliberadamente sin llamar a requireAdmin ni a nada de auth: eso es
// responsabilidad exclusiva de cada handler.

const { downloadObject, uploadObject, deleteObject, isOwnedPath, pathFromUrl } = require("../admin/_lib/storage");

const MANIFEST_PATH = "hero/slides.json";

// Único punto de verdad de "qué campos puede tener un slide" — igual que
// EDITORIAL_FIELDS en api/admin/_lib/editorialFields.js, esto es lo que
// realmente impide que cualquier otra clave (o un intento de escribir
// products/categories) llegue al manifiesto.
const SLIDE_FIELDS = ["image", "mobileImage", "eyebrow", "title", "subtitle", "ctaText", "ctaHref", "alt", "order", "active"];

function makeSlideId() {
  return `hero-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// CTA seguro (sección 7): una ruta/ancla interna, o una URL http(s)
// válida. Nunca javascript:, data:, ni ningún otro esquema.
function isSafeCtaHref(href) {
  if (href === null || href === undefined || href === "") return true; // opcional
  if (typeof href !== "string") return false;
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function loadSlides(env) {
  const buffer = await downloadObject({ env, path: MANIFEST_PATH });
  if (!buffer) return [];
  try {
    const parsed = JSON.parse(buffer.toString("utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Manifiesto corrupto/ilegible: se trata como vacío en vez de
    // romper el Home o el Admin — nunca se sobreescribe automáticamente
    // aquí (loadSlides nunca escribe), así que el archivo original queda
    // intacto para inspección manual si esto llegara a pasar.
    return [];
  }
}

async function saveSlides(env, slides) {
  await uploadObject({
    env,
    path: MANIFEST_PATH,
    buffer: Buffer.from(JSON.stringify(slides, null, 2), "utf8"),
    contentType: "application/json",
  });
}

// Sección 4/18 — jamás se muestran públicamente slides con active !== true.
// Orden ascendente por `order`; sin campo `order`, al final, por id como
// desempate estable.
function getActiveSlides(slides) {
  return (slides || [])
    .filter((s) => s.active === true)
    .sort((a, b) => {
      const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
      const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });
}

// Sección 10 — el público nunca recibe createdAt/updatedAt ni ningún
// campo administrativo: solo lo que el Home necesita para renderizar.
function shapePublicSlide(s) {
  return {
    id: s.id,
    image: s.image ?? null,
    mobileImage: s.mobileImage ?? null,
    eyebrow: s.eyebrow ?? null,
    title: s.title ?? null,
    subtitle: s.subtitle ?? null,
    ctaText: s.ctaText ?? null,
    ctaHref: s.ctaHref ?? null,
    alt: s.alt ?? null,
    order: typeof s.order === "number" ? s.order : null,
  };
}

function nextOrder(slides) {
  const max = (slides || []).reduce((m, s) => (typeof s.order === "number" && s.order > m ? s.order : m), 0);
  return max + 1;
}

function pickSlideFields(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  for (const key of SLIDE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

function buildHeroImagePath(slideId, slot, ext) {
  return `hero/${slideId}/${slot === "mobile" ? "mobile" : "main"}.${ext}`;
}

module.exports = {
  MANIFEST_PATH,
  SLIDE_FIELDS,
  makeSlideId,
  isSafeCtaHref,
  loadSlides,
  saveSlides,
  getActiveSlides,
  shapePublicSlide,
  nextOrder,
  pickSlideFields,
  buildHeroImagePath,
  // reexportados para que los handlers de imagen no tengan que conocer
  // el path relativo de _lib/storage.js
  isOwnedPath,
  pathFromUrl,
  deleteObject,
};
