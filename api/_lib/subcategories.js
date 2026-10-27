// Fase 53 — subcategorías controladas (taxonomía v2), espejo para el
// servidor de SUBCATEGORIES_BY_CATEGORY en js/taxonomy.js (el navegador
// no puede requerir este módulo ni Node importar ese ESM de forma
// síncrona). scripts/test-taxonomy-v2.mjs verifica que ambas listas sean
// idénticas: si cambias una, cambia la otra.
//
// Reglas de guardado (validateSubcategory):
// - vacío, o una subcategoría de la lista de su categoría → válido;
// - el MISMO valor que ya estaba guardado (valor histórico fuera de la
//   lista) → válido: se conserva hasta que se revise, nunca se reasigna
//   ni bloquea un guardado que no lo toca;
// - cualquier otro valor = «Otra»: solo con justificación (nota interna,
//   nunca pública) y queda marcado como revisión pendiente en el Admin.

const SUBCATEGORIES_BY_CATEGORY = {
  Rostro: ["Base y corrector", "Polvo y fijador", "Iluminador", "Rubor", "Kits de rostro"],
  Ojos: ["Sombras", "Delineado", "Máscara de pestañas", "Cejas", "Kits de ojos"],
  Labios: ["Labiales", "Gloss y oils", "Kits de labios"],
  Limpieza: ["Limpiadores", "Tónicos"],
  Tratamiento: ["Cremas faciales", "Sérums", "Contorno de ojos", "Cuello y escote", "Pestañas y cejas (crecimiento)", "Papel matificante", "Mascarillas", "Kits"],
  "Herramientas de aplicación": ["Brochas", "Esponjas", "Rizadores de pestañas"],
  "Complementos de belleza": ["Accesorios para el cabello", "Cuidado personal"],
};

const MIN_REASON_LENGTH = 10;

function isListedSubcategory(category, subcategory) {
  const list = SUBCATEGORIES_BY_CATEGORY[category];
  return Boolean(list && list.includes(subcategory));
}

// Devuelve { ok: true, other: boolean } o { ok: false, error }.
function validateSubcategory({ category, subcategory, storedSubcategory, reason }) {
  const sub = typeof subcategory === "string" ? subcategory.trim() : "";
  if (!sub) return { ok: true, other: false };
  if (isListedSubcategory(category, sub)) return { ok: true, other: false };
  if (typeof storedSubcategory === "string" && sub === storedSubcategory.trim()) return { ok: true, other: true, historical: true };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length >= MIN_REASON_LENGTH) return { ok: true, other: true };
  return {
    ok: false,
    error: category
      ? `«${sub}» no está en las subcategorías de ${category}. Elige una de la lista o usa «Otra» con una justificación (mínimo ${MIN_REASON_LENGTH} caracteres).`
      : `Para usar la subcategoría «${sub}» sin categoría VIBE, usa «Otra» con una justificación (mínimo ${MIN_REASON_LENGTH} caracteres).`,
  };
}

module.exports = { SUBCATEGORIES_BY_CATEGORY, MIN_REASON_LENGTH, isListedSubcategory, validateSubcategory };
