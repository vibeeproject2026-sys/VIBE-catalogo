// Fase 34 — campos editoriales granulares de VIBE ("ficha Product
// Studio"). Auditoría previa a implementar (sección 5 de la fase):
// catalog_metadata.additional_info ya existe (migración 0002, columna
// `text`, nullable) y hasta ahora se usaba como una nota libre sin
// estructura. No se crea ninguna tabla ni columna nueva — este módulo es
// lo único que le da estructura, guardando/leyendo un único JSON dentro
// de esa misma columna text.
//
// Cada campo es independiente y estrictamente opcional: vacío/null
// nunca se muestra públicamente (ver js/taxonomy.js, pdpContentSections/
// pdpSpecRows) y nunca se combina con otro campo en el mismo input ni en
// el mismo valor almacenado — cada uno vive en su propia clave.
//
// Compartido entre api/admin/catalog-metadata.js (lee/escribe el objeto
// completo) y api/catalog/_lib/merge.js (lo expone en la API pública,
// aplanado como campos de primer nivel del producto, igual que
// shortDescription/ingredients/etc.). js/taxonomy.js mantiene su propia
// copia de esta misma lista de nombres (no puede requerir un módulo de
// Node desde el navegador) — si se agrega un campo aquí, agregarlo
// también ahí (EDITORIAL_STRING_FIELDS/EDITORIAL_ARRAY_FIELDS).

const STRING_FIELDS = [
  // Identificación
  "commercialName",
  "line",
  "productType",
  "netContent",
  "tone",
  "toneCode",
  "color",
  "variant",
  "sku",
  // Descripción
  "whatIs",
  "characteristics",
  // Modo de uso (nunca combinados en un solo campo)
  "recommendedAmount",
  "applicationArea",
  "recommendedTool",
  "applicationOrder",
  "applicationTips",
  // Ingredientes
  "activeIngredients",
  "ingredientProperties",
  "warnings",
  // Fórmula y acabado
  "texture",
  "formulaType",
  "coverage",
  "intensity",
  "finish",
  "duration",
  "resistance",
  "transfer",
  // Tipo de piel
  "skinType",
  "skinRecommendations",
  // Información adicional
  "crueltyFree",
  "vegan",
  "dermatologicallyTested",
  "countryOfManufacture",
  "manufacturerInfo",
  // Merchandising VIBE
  "commercialAngle",
  "usageOccasion",
  // Imágenes
  "mainImageAlt",
];

// Multivalor — sección 8: "uno por línea" en Admin, arreglo en el dato
// real (mismo patrón ya usado por benefits/search_keywords).
const ARRAY_FIELDS = ["highlightedIngredients", "claims", "certifications"];

// Fase 56 — tonos del producto (variantes de color). Lista de objetos
// { id, name, hex, active, order } administrada desde el Admin. El POS no
// tiene inventario por tono: un tono solo se puede comprar si está activo
// Y el producto tiene stock en el POS. Un tono sin color (hex null) queda
// "pendiente de configuración" y nunca se ofrece públicamente.
const SHADE_FIELDS = ["shades"];
const MAX_SHADES = 40;
const SHADE_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const HEX = /^#[0-9a-f]{6}$/i;
function sanitizeShades(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
    const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (!SHADE_ID.test(id) || !name || seen.has(id) || /[<>]/.test(name)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      hex: typeof raw.hex === "string" && HEX.test(raw.hex.trim()) ? raw.hex.trim().toLowerCase() : null,
      active: raw.active === true,
      order: Number.isInteger(raw.order) ? raw.order : out.length,
    });
    if (out.length >= MAX_SHADES) break;
  }
  return out.sort((a, b) => a.order - b.order).map((sh, i) => ({ ...sh, order: i }));
}
// Tonos que el catálogo puede mostrar (configurados: con color). Los
// inactivos se incluyen marcados como no disponibles.
function publicShades(shades) {
  return sanitizeShades(shades).filter((sh) => sh.hex);
}

// Fase 57 — presentaciones del producto (ej. «15 ml», «30 ml»,
// «Individual»): dimensión independiente de los tonos. Lista de objetos
// { id, name, active, order } que define la propietaria; nunca se generan
// solas. Mismo criterio que los tonos: sin precio ni inventario propio
// (el POS no los tiene), una inactiva no se puede comprar. Nombres únicos
// sin distinguir mayúsculas/acentos/espacios.
const PRESENTATION_FIELDS = ["presentations"];
const MAX_PRESENTATIONS = 20;
const nameKey = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function sanitizePresentations(input) {
  if (!Array.isArray(input)) return [];
  const seenIds = new Set();
  const seenNames = new Set();
  const out = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
    const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (!SHADE_ID.test(id) || !name || /[<>]/.test(name) || seenIds.has(id) || seenNames.has(nameKey(name))) continue;
    seenIds.add(id);
    seenNames.add(nameKey(name));
    out.push({ id, name, active: raw.active === true, order: Number.isInteger(raw.order) ? raw.order : out.length });
    if (out.length >= MAX_PRESENTATIONS) break;
  }
  return out.sort((a, b) => a.order - b.order).map((pr, i) => ({ ...pr, order: i }));
}

const ALL_FIELDS = [...STRING_FIELDS, ...ARRAY_FIELDS, ...SHADE_FIELDS, ...PRESENTATION_FIELDS];

// Fase 53 — campos de uso interno del Admin: se guardan y el Admin los
// lee, pero la API pública nunca los expone (publicDetails). Ya se
// presentaban en el Admin como «nota interna — no se muestra en el
// catálogo público»; tampoco viajan en el JSON. (Fase 54 — se retira
// subcategoryOtherReason junto con «Otra»: ninguna ficha lo tenía
// guardado, verificado en producción antes del cambio.)
const INTERNAL_FIELDS = ["commercialAngle", "usageOccasion"];
const PUBLIC_FIELDS = ALL_FIELDS.filter((k) => !INTERNAL_FIELDS.includes(k));

function emptyDetails() {
  const out = {};
  for (const k of STRING_FIELDS) out[k] = null;
  for (const k of ARRAY_FIELDS) out[k] = [];
  out.shades = [];
  out.presentations = [];
  return out;
}

// Nunca confía en el contenido crudo de additional_info (una columna de
// propósito general): solo copia las claves conocidas, con el tipo
// esperado, y descarta cualquier otra cosa — mismo espíritu que
// pickEditorialFields en _lib/editorialFields.js.
function sanitizeDetails(input) {
  const out = emptyDetails();
  if (!input || typeof input !== "object") return out;
  for (const k of STRING_FIELDS) {
    if (typeof input[k] === "string" && input[k].trim()) out[k] = input[k];
  }
  for (const k of ARRAY_FIELDS) {
    if (Array.isArray(input[k])) {
      const cleaned = input[k].filter((v) => typeof v === "string" && v.trim());
      if (cleaned.length) out[k] = cleaned;
    }
  }
  out.shades = sanitizeShades(input.shades);
  out.presentations = sanitizePresentations(input.presentations);
  return out;
}

// additional_info llega como texto plano (o null) desde Supabase — nunca
// lanza ante un valor corrupto/no-JSON, se degrada a "todo vacío".
function parseDetails(raw) {
  if (!raw) return emptyDetails();
  try {
    return sanitizeDetails(JSON.parse(raw));
  } catch {
    return emptyDetails();
  }
}

// Devuelve null (no un JSON de puros null/[]) cuando no hay ningún
// campo real completado — equivalente a "sin ficha", igual que una fila
// de catalog_metadata inexistente.
function serializeDetails(input) {
  const sanitized = sanitizeDetails(input);
  const hasContent = ALL_FIELDS.some((k) => {
    const v = sanitized[k];
    return Array.isArray(v) ? v.length > 0 : v !== null;
  });
  return hasContent ? JSON.stringify(sanitized) : null;
}

// Solo los campos públicos, para la API del catálogo.
function publicDetails(raw) {
  const all = parseDetails(raw);
  const out = {};
  for (const k of PUBLIC_FIELDS) out[k] = all[k];
  out.shades = publicShades(all.shades);
  out.presentations = all.presentations;
  return out;
}

module.exports = {
  SHADE_FIELDS,
  MAX_SHADES,
  sanitizeShades,
  publicShades,
  PRESENTATION_FIELDS,
  MAX_PRESENTATIONS,
  sanitizePresentations,
  STRING_FIELDS,
  ARRAY_FIELDS,
  ALL_FIELDS,
  INTERNAL_FIELDS,
  PUBLIC_FIELDS,
  publicDetails,
  emptyDetails,
  sanitizeDetails,
  parseDetails,
  serializeDetails,
};
