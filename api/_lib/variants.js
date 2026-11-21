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
// No hay inventario por opción (lo decide el POS por producto).
// Precio por opción: si la opción elegida tiene precio propio, ese es el
// precio base de la línea (optionPrice); si el tono y la presentación tienen
// ambos precio propio, manda el de la presentación. Sin precio propio → null
// y la línea usa el precio general del producto.
// Promoción: la del POS (promo_active + vigencia, ya resuelta en
// promoActive) se aplica sobre ese precio base — ver linePrice().

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

// Solo cuenta un precio válido (entero > 0); cualquier otra cosa = sin precio propio.
const optionPriceOf = (opt) => (opt && Number.isInteger(opt.price) && opt.price > 0 ? opt.price : null);
const idOf = (v) => (v === undefined || v === null || v === "" ? null : String(v));

// → { ok: true, variantId, variantName, shadeId, shadeName, presentationId, presentationName, optionPrice, optionPriceSource }
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
    optionPrice: optionPriceOf(pres.opt) ?? optionPriceOf(shade.opt) ?? null,
    optionPriceSource: optionPriceOf(pres.opt) != null ? "presentation" : optionPriceOf(shade.opt) != null ? "shade" : null,
  };
}

// Precio de una línea de pedido (el servidor es la única autoridad).
// `product` es el producto ya resuelto del POS (price, promoActive con su
// vigencia, promoPrice, promoText); `sel` sale de resolveSelection.
//
// El POS define la promoción como un precio promocional del producto. Sobre
// el precio general se cobra ese precio, como siempre. Sobre un precio propio
// de variante se aplica la MISMA proporción de descuento
// (promoPrice / price), redondeada al peso: p. ej. promo 31.500 sobre
// 35.000 = −10 % → Coral 38.000 pasa a 34.200. Una sola vez, siempre sobre
// el precio base, nunca sobre un precio ya rebajado.
//
// → { basePrice, price, discount, priceSource, promo }
//   priceSource: "presentation" | "shade" | "product"
//   promo: null o { text, productPrice, productPromoPrice } (referencia
//   del POS con la que se calculó, para auditar y conciliar)
function linePrice(product, sel) {
  const general = product.price;
  const promoOn = product.promoActive === true && product.promoPrice != null;
  const own = sel && sel.optionPrice != null ? sel.optionPrice : null;
  const basePrice = own != null ? own : general;
  let price = basePrice;
  let promoApplied = false;
  if (promoOn && own == null) {
    // Precio general: exactamente lo que ya cobraba el pedido (effectivePrice).
    price = product.promoPrice;
    promoApplied = true;
  } else if (promoOn && general > 0 && product.promoPrice < general) {
    price = Math.round((own * product.promoPrice) / general);
    promoApplied = price < basePrice;
  }
  return {
    basePrice,
    price,
    discount: basePrice - price,
    priceSource: own != null ? sel.optionPriceSource : "product",
    promo: promoApplied ? { text: product.promoText ?? null, productPrice: general, productPromoPrice: product.promoPrice } : null,
  };
}

module.exports = { productOptions, resolveSelection, variantKey, linePrice };
