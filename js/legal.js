// Fase final — información legal y comercial de VIBE, en un solo lugar.
//
// Cada campo está en null hasta que la propietaria entregue el dato o el
// texto REAL (lista en docs/VIBE_MASTER_REQUIREMENTS.md §14). Mientras un
// campo esté en null no se muestra nada de él; con todo en null la columna
// «Legal» del pie queda oculta. El sitio nunca publica políticas, datos
// de empresa ni condiciones comerciales inventadas.
//
// Para publicar: completar los campos (texto plano; un párrafo por línea
// en blanco) y desplegar. No hace falta tocar HTML ni CSS.
export const LEGAL = {
  business: {
    name: null, // razón social o nombre del titular
    idLabel: null, // "NIT" o "C.C."
    idNumber: null,
    city: null,
    address: null,
  },
  policies: [
    { id: "datos", title: "Tratamiento de datos personales", text: null },
    { id: "envios", title: "Envíos", text: null },
    { id: "pagos", title: "Medios de pago", text: null },
    { id: "cambios", title: "Cambios, devoluciones y retracto", text: null },
    { id: "garantia", title: "Garantía", text: null },
  ],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const filled = (v) => typeof v === "string" && v.trim() !== "";

// Devuelve el HTML de la columna, o "" si no hay nada real que mostrar.
export function legalFooterHtml(legal = LEGAL) {
  const b = legal.business || {};
  const businessLines = [
    filled(b.name) ? esc(b.name.trim()) : "",
    filled(b.idNumber) ? `${filled(b.idLabel) ? esc(b.idLabel.trim()) + " " : ""}${esc(b.idNumber.trim())}` : "",
    [b.address, b.city].filter(filled).map((x) => esc(x.trim())).join(", "),
  ].filter(Boolean);
  const policies = (legal.policies || []).filter((p) => p && filled(p.title) && filled(p.text));
  if (!businessLines.length && !policies.length) return "";
  const business = businessLines.length ? `<li class="footer-legal-business">${businessLines.join("<br>")}</li>` : "";
  const items = policies
    .map((p) => {
      const paragraphs = p.text.trim().split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join("");
      return `<li><details class="footer-legal-policy" id="legal-${esc(p.id)}"><summary>${esc(p.title.trim())}</summary><div class="footer-legal-text">${paragraphs}</div></details></li>`;
    })
    .join("");
  return `<p class="footer-title" id="footerLegalTitle">Legal</p><ul class="footer-links footer-legal">${business}${items}</ul>`;
}

export function renderLegal(root = typeof document !== "undefined" ? document.getElementById("legal") : null, legal = LEGAL) {
  if (!root) return;
  const html = legalFooterHtml(legal);
  root.innerHTML = html;
  root.hidden = !html;
}

if (typeof document !== "undefined") renderLegal();
