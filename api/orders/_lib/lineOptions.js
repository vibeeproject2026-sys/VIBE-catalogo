// Variante ELEGIDA de una línea de pedido, a partir de los campos
// estructurados que guarda api/orders/create.js (nunca del texto visual):
// - shadeId + shadeName           → «Tono: …»
// - presentationId + presentationName → «Presentación: …»
// - pedidos antiguos con variante clásica (variantId distinto de
//   "default" y sin shadeId/presentationId) → «Opción: …»
// La presentación fija de la ficha (presentationName sin presentationId,
// p. ej. «50 gr.») NO es una elección de la clienta: se muestra como
// «Presentación única: …», nunca como variante elegida.
// Lo usan el correo a VIBE, el correo a la clienta y el aviso de WhatsApp.

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

function selectedOptions(line) {
  const l = line || {};
  const out = [];
  if (clean(l.shadeId) && clean(l.shadeName)) out.push({ label: "Tono", value: clean(l.shadeName) });
  if (clean(l.presentationId) && clean(l.presentationName)) out.push({ label: "Presentación", value: clean(l.presentationName) });
  let classic = false;
  if (!out.length && !clean(l.shadeId) && !clean(l.presentationId)) {
    const vid = clean(l.variantId);
    const name = clean(l.variantName);
    // Variante clásica (o pedido muy antiguo sin variantId).
    if (vid !== "default" && name && name !== "Único" && name !== "Default") { out.push({ label: "Opción", value: name }); classic = true; }
  }
  // Presentación FIJA del producto (sin opciones de presentación para
  // elegir): se informa, rotulada como única, para que nunca se confunda con
  // una elección. También junto a un tono elegido (no se pierde el dato).
  if (!classic && !clean(l.presentationId) && clean(l.presentationName)) out.push({ label: "Presentación única", value: clean(l.presentationName), fixed: true });
  return out;
}

// «Tono: Aloe · Presentación: 50 ml», o null si la línea no tiene variante.
function variantText(line) {
  const opts = selectedOptions(line);
  return opts.length ? opts.map((o) => `${o.label}: ${o.value}`).join(" · ") : null;
}

// «Mascarilla Facial — Tono: Aloe», o solo el nombre.
function lineLabel(line) {
  const v = variantText(line);
  return v ? `${line.name} — ${v}` : line.name;
}

module.exports = { selectedOptions, variantText, lineLabel };
