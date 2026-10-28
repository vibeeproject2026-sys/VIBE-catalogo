// Fase 56 — taxonomía VIBE administrable desde el Admin.
//
// Fuente de verdad: un único documento JSON ("config/taxonomy.json") en el
// bucket de Storage ya existente — mismo patrón que hero/slides.json (no
// requiere migración SQL). Si el documento todavía no existe, la taxonomía
// es exactamente la aprobada en código (DEFAULT_GROUPS, espejo de
// js/taxonomy.js): nada cambia hasta el primer guardado desde el Admin.
//
// Forma: { revision, updatedAt, groups: [{ group, categories: [{ name,
// subcategories: [..] }] }] }. Los 3 grupos (Maquillaje, Skincare,
// Accesorios) son la navegación pública y no se crean ni borran aquí; las
// categorías y subcategorías sí.
//
// Los productos guardan la categoría/subcategoría por NOMBRE en
// catalog_metadata; por eso renombrar o mover actualiza explícitamente
// esas filas (ver api/admin/_lib/taxonomyAdmin.js). Valores guardados que
// no estén en la taxonomía nunca se borran ni se reasignan solos: quedan
// como históricos en revisión.
//
// Consistencia: Storage puede tardar unos segundos en reflejar una
// escritura (medido en Fase 34 con hero/slides.json). Cada guardado sube
// `revision`; un cambio solo se aplica sobre la revisión que el Admin tenía
// a la vista (si la lectura llega atrasada se reintenta; si otra persona
// guardó antes, se rechaza). Nunca se escribe sobre una lectura atrasada.

const { downloadObject, uploadObject } = require("../admin/_lib/storage");

const TAXONOMY_PATH = "config/taxonomy.json";

const DEFAULT_GROUPS = [
  { group: "Maquillaje", categories: [
    { name: "Rostro", subcategories: ["Base y corrector", "Polvo y fijador", "Iluminador", "Rubor", "Kits de rostro"] },
    { name: "Ojos", subcategories: ["Sombras", "Delineado", "Máscara de pestañas", "Cejas", "Kits de ojos"] },
    { name: "Labios", subcategories: ["Labiales", "Gloss y oils", "Kits de labios"] },
  ] },
  { group: "Skincare", categories: [
    { name: "Limpieza", subcategories: ["Limpiadores", "Tónicos"] },
    { name: "Tratamiento", subcategories: ["Cremas faciales", "Sérums", "Contorno de ojos", "Cuello y escote", "Pestañas y cejas (crecimiento)", "Papel matificante", "Mascarillas", "Kits"] },
  ] },
  { group: "Accesorios", categories: [
    { name: "Herramientas de aplicación", subcategories: ["Brochas", "Esponjas", "Rizadores de pestañas"] },
    { name: "Complementos de belleza", subcategories: ["Accesorios para el cabello", "Cuidado personal"] },
  ] },
];
const GROUP_NAMES = DEFAULT_GROUPS.map((g) => g.group);

const MAX_NAME_LENGTH = 60;
// Fase 54 — «Otra» (y equivalentes genéricos) nunca es una opción de
// clasificación.
const FORBIDDEN_KEYS = new Set(["otra", "otro", "otras", "otros"]);

// Normalización para mostrar: sin espacios sobrantes, NFC.
function cleanName(value) {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}
// Clave para detectar duplicados: sin mayúsculas ni acentos.
function nameKey(value) {
  return cleanName(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function validateName(value, what) {
  const name = cleanName(value);
  if (!name) return { error: `El nombre de la ${what} no puede estar vacío.` };
  if (name.length > MAX_NAME_LENGTH) return { error: `El nombre de la ${what} admite como máximo ${MAX_NAME_LENGTH} caracteres.` };
  if (/[<>]/.test(name)) return { error: `El nombre de la ${what} no puede contener < ni >.` };
  if (FORBIDDEN_KEYS.has(nameKey(name))) return { error: `«${name}» no se permite: usa una ${what} concreta.` };
  return { name };
}

function defaultTaxonomy() {
  return { revision: 0, updatedAt: null, groups: JSON.parse(JSON.stringify(DEFAULT_GROUPS)) };
}

// Acepta solo la forma esperada; cualquier cosa inválida → null (se usa la
// taxonomía por defecto, nunca se rompe el catálogo).
function sanitizeTaxonomy(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.groups)) return null;
  const groups = GROUP_NAMES.map((group) => {
    const src = raw.groups.find((g) => g && g.group === group) || { categories: [] };
    const seenCat = new Set();
    const categories = (Array.isArray(src.categories) ? src.categories : [])
      .map((c) => {
        const name = cleanName(c && c.name);
        if (!name || seenCat.has(nameKey(name))) return null;
        seenCat.add(nameKey(name));
        const seenSub = new Set();
        const subcategories = (Array.isArray(c.subcategories) ? c.subcategories : [])
          .map(cleanName)
          .filter((s) => s && !seenSub.has(nameKey(s)) && seenSub.add(nameKey(s)));
        return { name, subcategories };
      })
      .filter(Boolean);
    return { group, categories };
  });
  // Una categoría solo puede estar en un grupo.
  const all = groups.flatMap((g) => g.categories.map((c) => nameKey(c.name)));
  if (new Set(all).size !== all.length) return null;
  return { revision: Number.isInteger(raw.revision) && raw.revision > 0 ? raw.revision : 0, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null, groups };
}

async function loadTaxonomy(env) {
  const buffer = await downloadObject({ env, path: TAXONOMY_PATH });
  if (!buffer) return defaultTaxonomy();
  let parsed = null;
  try {
    parsed = sanitizeTaxonomy(JSON.parse(buffer.toString("utf8")));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    console.error("[taxonomy] config/taxonomy.json ilegible; se usa la taxonomía por defecto (el archivo no se toca).");
    return defaultTaxonomy();
  }
  return parsed;
}

// Lee hasta ver al menos `minRevision` (lectura atrasada de Storage).
async function loadTaxonomyAtLeast(env, minRevision, { attempts = 8, delayMs = 700 } = {}) {
  let tax = await loadTaxonomy(env);
  for (let i = 1; i < attempts && tax.revision < minRevision; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    tax = await loadTaxonomy(env);
  }
  return tax;
}

async function saveTaxonomy(env, taxonomy) {
  const doc = { revision: taxonomy.revision, updatedAt: taxonomy.updatedAt, groups: taxonomy.groups };
  await uploadObject({ env, path: TAXONOMY_PATH, buffer: Buffer.from(JSON.stringify(doc, null, 2), "utf8"), contentType: "application/json" });
}

// Vistas derivadas.
function categoryIndex(taxonomy) {
  const out = new Map();
  for (const g of taxonomy.groups) for (const c of g.categories) out.set(c.name, { group: g.group, subcategories: c.subcategories });
  return out;
}
function subcategoriesByCategory(taxonomy) {
  return Object.fromEntries([...categoryIndex(taxonomy)].map(([name, v]) => [name, [...v.subcategories]]));
}
// Forma pública/compatible con js/taxonomy.js (VIBE_CATEGORY_GROUPS +
// SUBCATEGORIES_BY_CATEGORY).
function publicTaxonomy(taxonomy) {
  return {
    revision: taxonomy.revision,
    groups: taxonomy.groups.map((g) => ({ group: g.group, categories: g.categories.map((c) => c.name) })),
    subcategories: subcategoriesByCategory(taxonomy),
  };
}

module.exports = {
  TAXONOMY_PATH,
  DEFAULT_GROUPS,
  GROUP_NAMES,
  MAX_NAME_LENGTH,
  cleanName,
  nameKey,
  validateName,
  defaultTaxonomy,
  sanitizeTaxonomy,
  loadTaxonomy,
  loadTaxonomyAtLeast,
  saveTaxonomy,
  categoryIndex,
  subcategoriesByCategory,
  publicTaxonomy,
};
