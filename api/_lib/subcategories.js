// Fase 53/54 — taxonomía VIBE controlada (v2), espejo para el servidor de
// SUBCATEGORIES_BY_CATEGORY en js/taxonomy.js (el navegador no puede
// requerir este módulo ni Node importar ese ESM de forma síncrona).
// scripts/test-taxonomy-v2.js verifica que ambas listas sean idénticas:
// si cambias una, cambia la otra.
//
// Reglas de guardado (validateClassification):
// - categoría: vacía, una de las 7 aprobadas, o la MISMA ya guardada;
// - subcategoría: vacía, una de la lista de su categoría, o la MISMA ya
//   guardada (valor histórico fuera de la lista: se conserva hasta que se
//   revise, nunca se reasigna ni bloquea un guardado que no lo toca).
// Fase 54 — ya no existe «Otra»: cualquier otro valor se rechaza y el
// Admin ofrece la lista (y una sugerencia editable para los históricos).
// Fase 56 — la taxonomía es editable desde el Admin (api/_lib/
// taxonomyStore.js): las funciones aceptan la lista vigente en `lists`;
// SUBCATEGORIES_BY_CATEGORY de aquí queda como valor por defecto (el de
// código, mientras no exista el documento editable).

const SUBCATEGORIES_BY_CATEGORY = {
  Rostro: ["Base y corrector", "Polvo y fijador", "Iluminador", "Rubor", "Kits de rostro"],
  Ojos: ["Sombras", "Delineado", "Máscara de pestañas", "Cejas", "Kits de ojos"],
  Labios: ["Labiales", "Gloss y oils", "Kits de labios"],
  Limpieza: ["Limpiadores", "Tónicos"],
  Tratamiento: ["Cremas faciales", "Sérums", "Contorno de ojos", "Cuello y escote", "Pestañas y cejas (crecimiento)", "Papel matificante", "Mascarillas", "Kits"],
  "Herramientas de aplicación": ["Brochas", "Esponjas", "Rizadores de pestañas"],
  "Complementos de belleza": ["Accesorios para el cabello", "Cuidado personal"],
};

const trimmed = (v) => (typeof v === "string" ? v.trim() : "");

function isListedSubcategory(category, subcategory, lists = SUBCATEGORIES_BY_CATEGORY) {
  const list = lists[category];
  return Boolean(list && list.includes(subcategory));
}

function isApprovedCategory(category, lists = SUBCATEGORIES_BY_CATEGORY) {
  return Object.prototype.hasOwnProperty.call(lists, category);
}

// Devuelve { ok: true } o { ok: false, error }.
function validateClassification({ category, subcategory, stored = {}, lists = SUBCATEGORIES_BY_CATEGORY }) {
  const cat = trimmed(category);
  const sub = trimmed(subcategory);
  if (cat && !isApprovedCategory(cat, lists) && cat !== trimmed(stored.category)) {
    return { ok: false, error: `«${cat}» no es una categoría VIBE. Elige una de la lista.` };
  }
  if (!sub || isListedSubcategory(cat, sub, lists) || sub === trimmed(stored.subcategory)) return { ok: true };
  return {
    ok: false,
    error: cat
      ? `«${sub}» no está en las subcategorías de ${cat}. Elige una de la lista.`
      : `Para asignar la subcategoría «${sub}» elige primero una categoría VIBE.`,
  };
}

module.exports = { SUBCATEGORIES_BY_CATEGORY, isListedSubcategory, isApprovedCategory, validateClassification };
