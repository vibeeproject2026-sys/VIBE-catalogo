// Fase 57 — validación server-side de las opciones de compra (tono y
// presentación) de una línea de pedido. Espejo de js/variants.js, pero
// autoritativo: nunca confía en ids ni nombres del navegador, solo en la
// ficha publicada del producto (additional_info) y su presentación de texto.
//
// Reglas por dimensión (tonos con color / presentaciones):
//   - sin opciones configuradas → no se acepta un id para esa dimensión;
//   - con opciones (una o varias) → el id es obligatorio, debe pertenecer a
//     ESTE producto y estar activo.
// Sin presentaciones configuradas, la línea conserva la presentación de
// texto de la ficha (ej. «30 ml») si existe; si no, no se inventa ninguna.
// No hay precio ni inventario por opción: lo decide el POS por producto.

function productOptions(details, legacyPresentation) {
  const d = details || {};
  return {
    shades: (Array.isArray(d.shades) ? d.shades : []).filter((sh) => sh && sh.hex),
    presentations: Array.isArray(d.presentations) ? d.presentations : [],
    presentationText: typeof legacyPresentation === "string" && legacyPresentation.trim() ? legacyPresentation.trim() : null,
  };
}

function variantKey(shadeId, presentationId) {
  const parts = [];
  if (shadeId) parts.push(`s:${shadeId}`);
  if (presentationId) parts.push(`p:${presentationId}`);
  return parts.length ? parts.join("|") : "default";
}

const idOf = (v) => (v === undefined || v === null || v === "" ? null : String(v));

// → { ok: true, variantId, variantName, shadeId, shadeName, presentationId, presentationName }
// | { ok: false, dimension: "shade" | "presentation" }
function resolveSelection(options, item) {
  const opts = options || productOptions(null, null);
  const pick = (list, id, dim) => {
    if (!list.length) return id ? { error: dim } : { opt: null };
    const opt = id ? list.find((o) => o.id === id) : null;
    if (!opt || opt.active !== true) return { error: dim };
    return { opt };
  };
  const shade = pick(opts.shades, idOf(item && item.shadeId), "shade");
  if (shade.error) return { ok: false, dimension: shade.error };
  const pres = pick(opts.presentations, idOf(item && item.presentationId), "presentation");
  if (pres.error) return { ok: false, dimension: pres.error };
  const shadeName = shade.opt ? shade.opt.name : null;
  const presentationName = pres.opt ? pres.opt.name : opts.presentationText;
  return {
    ok: true,
    variantId: variantKey(shade.opt && shade.opt.id, pres.opt && pres.opt.id),
    variantName: [shadeName, presentationName].filter(Boolean).join(" · ") || null,
    shadeId: shade.opt ? shade.opt.id : null,
    shadeName,
    presentationId: pres.opt ? pres.opt.id : null,
    presentationName,
  };
}

module.exports = { productOptions, resolveSelection, variantKey };
