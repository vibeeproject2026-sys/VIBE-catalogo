// Fase 57 — opciones de compra por producto: dos dimensiones
// independientes que la propietaria configura en el Admin
// (catalog_metadata.additional_info):
//   - tonos (shades):          { id, name, hex, active }
//   - presentaciones:          { id, name, active }
// Cada dimensión puede no existir (sin selector), tener una sola opción
// (se muestra, sin selector, y se aplica sola) o varias (la clienta elige;
// nada viene preseleccionado). Nunca se generan opciones por categoría.
//
// El POS no tiene inventario por opción: toda combinación usa la
// disponibilidad del producto. Una opción inactiva no se puede elegir.
// Precio por variante: una opción puede tener `price` propio (pesos, entero
// > 0). La combinación cuesta el precio de la presentación elegida, si lo
// tiene; si no, el del tono; si ninguno, el precio general del producto. La
// promoción del POS se aplica sobre ese precio (ver optionPriceInfo). El servidor vuelve a validar
// todo al crear el pedido con la misma regla (api/_lib/variants.js) y toma
// nombres y precios de la ficha, nunca del carrito.

const HEX = /^#[0-9a-f]{6}$/i;
// Precio propio válido de una opción (entero > 0) o null.
export const priceOf = (o) => (o && Number.isInteger(o.price) && o.price > 0 ? o.price : null);
const ownPrice = (o) => (priceOf(o) != null ? { price: o.price } : {});

export function normalizeShades(list) {
  return (Array.isArray(list) ? list : [])
    .filter((sh) => sh && typeof sh.id === "string" && typeof sh.name === "string" && HEX.test(sh.hex || ""))
    .map((sh) => ({ id: sh.id, name: sh.name, hex: sh.hex, active: sh.active === true, ...ownPrice(sh) }));
}

export function normalizePresentations(list) {
  return (Array.isArray(list) ? list : [])
    .filter((pr) => pr && typeof pr.id === "string" && typeof pr.name === "string" && pr.name.trim())
    .map((pr) => ({ id: pr.id, name: pr.name, active: pr.active === true, ...ownPrice(pr) }));
}

export const hasOptions = (p) => Boolean(p && ((p.shades && p.shades.length) || (p.presentations && p.presentations.length)));

// Clave estable de la combinación — es el variantId de la línea del
// carrito, así dos combinaciones del mismo producto son líneas distintas y
// la misma combinación se agrupa. "default" = producto sin opciones (igual
// que los carritos guardados antes de esta fase).
export function variantKey(shadeId, presentationId) {
  const parts = [];
  if (shadeId) parts.push(`s:${shadeId}`);
  if (presentationId) parts.push(`p:${presentationId}`);
  return parts.length ? parts.join("|") : "default";
}

// Opción que se aplica sola: la única de su dimensión. Con varias, null
// (la clienta debe elegir).
export const autoShadeId = (p) => (p.shades && p.shades.length === 1 ? p.shades[0].id : null);
export const autoPresentationId = (p) => (p.presentations && p.presentations.length === 1 ? p.presentations[0].id : null);

// Qué falta elegir / qué impide comprar con la selección actual.
// → { missing: ["shade"|"presentation"], blocked: null|"shade"|"presentation" }
export function selectionStatus(p, shadeId, presentationId) {
  const missing = [];
  let blocked = null;
  const check = (list, id, dim) => {
    if (!list || !list.length) return;
    if (!list.some((o) => o.active)) {
      blocked = blocked || dim;
      return;
    }
    const opt = id ? list.find((o) => String(o.id) === String(id)) : null;
    if (!opt) missing.push(dim);
    else if (!opt.active) blocked = blocked || dim;
  };
  check(p.shades, shadeId, "shade");
  check(p.presentations, presentationId, "presentation");
  return { missing, blocked };
}

// Variante comprable para (tono, presentación), o null si falta elegir
// algo, si una opción no existe o si está inactiva.
export function resolveVariant(p, shadeId, presentationId) {
  const base = p.variants && p.variants[0];
  if (!hasOptions(p)) return base || null;
  const { missing, blocked } = selectionStatus(p, shadeId, presentationId);
  if (missing.length || blocked) return null;
  const shade = p.shades.length ? p.shades.find((o) => String(o.id) === String(shadeId)) : null;
  const pres = p.presentations.length ? p.presentations.find((o) => String(o.id) === String(presentationId)) : null;
  return {
    id: variantKey(shade && shade.id, pres && pres.id),
    name: [shade && shade.name, pres && pres.name].filter(Boolean).join(" · "),
    hex: shade ? shade.hex : null,
    shadeId: shade ? shade.id : null,
    shadeName: shade ? shade.name : null,
    presentationId: pres ? pres.id : null,
    presentationName: pres ? pres.name : null,
    ...optionPriceInfo(p, shade && shade.id, pres && pres.id),
    sku: null,
    active: true,
  };
}

// Precio unitario de una combinación (tono, presentación). Base: el precio
// propio de la presentación, si lo tiene; si no, el del tono; si ninguno, el
// precio general del producto. La promoción vigente del POS se aplica una
// sola vez sobre esa base: al precio general, su precio promocional; a un
// precio propio, la misma proporción (promoPrice / precio general),
// redondeada al peso. Mismo cálculo que el servidor (api/_lib/variants.js
// linePrice). → { price, originalPrice, ownPrice } — originalPrice es la
// base tachada cuando hay promoción, si no null.
const generalPrice = (p) => (p.variants && p.variants[0] ? p.variants[0].price : p.price);
const promoOn = (p) => p.promoActive === true && p.promoPrice != null;

// Precio propio con la promoción vigente del POS aplicada (o el mismo
// precio si no hay promoción que aplicar).
export function ownPriceWithPromo(p, own) {
  const general = generalPrice(p);
  return promoOn(p) && general > 0 && p.promoPrice < general ? Math.round((own * p.promoPrice) / general) : own;
}

export function optionPriceInfo(p, shadeId, presentationId) {
  const find = (list, id) => (id != null && Array.isArray(list) ? list.find((o) => String(o.id) === String(id)) : null);
  const own = priceOf(find(p.presentations, presentationId)) ?? priceOf(find(p.shades, shadeId));
  if (own != null) {
    const final = ownPriceWithPromo(p, own);
    return { price: final, originalPrice: final < own ? own : null, ownPrice: true };
  }
  const general = generalPrice(p);
  return { price: promoOn(p) ? p.promoPrice : general, originalPrice: promoOn(p) ? general : null, ownPrice: false };
}

// Precios posibles de las combinaciones que se pueden comprar (opciones
// activas). → { min, max } — iguales cuando todas cuestan lo mismo.
export function priceRange(p) {
  const active = (list) => (Array.isArray(list) && list.length ? list.filter((o) => o.active) : [null]);
  const prices = [];
  for (const sh of active(p.shades)) for (const pr of active(p.presentations)) prices.push(optionPriceInfo(p, sh && sh.id, pr && pr.id).price);
  if (!prices.length) prices.push(optionPriceInfo(p, null, null).price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// ¿Sigue siendo válida una línea del carrito con la configuración vigente
// del producto? (la propietaria puede haber desactivado o quitado una
// opción, o agregado una dimensión nueva después de que se agregó).
// → null si es válida; "option" si hay que corregir la selección.
export function lineOptionProblem(p, line) {
  const shadeId = line.shadeId ?? null;
  const presentationId = line.presentationId ?? null;
  if (!hasOptions(p)) return shadeId || presentationId ? "option" : null;
  if (!(p.shades && p.shades.length) && shadeId) return "option";
  if (!(p.presentations && p.presentations.length) && presentationId) return "option";
  return resolveVariant(p, shadeId, presentationId) ? null : "option";
}
