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

const ALL_FIELDS = [...STRING_FIELDS, ...ARRAY_FIELDS];

function emptyDetails() {
  const out = {};
  for (const k of STRING_FIELDS) out[k] = null;
  for (const k of ARRAY_FIELDS) out[k] = [];
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

module.exports = {
  STRING_FIELDS,
  ARRAY_FIELDS,
  ALL_FIELDS,
  emptyDetails,
  sanitizeDetails,
  parseDetails,
  serializeDetails,
};
