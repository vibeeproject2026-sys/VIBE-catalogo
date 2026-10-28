// Información legal y comercial de VIBE, en un solo lugar.
//
// Fuente de cada dato:
// - Identidad, ubicación comercial, contacto, horario, cobertura de envíos y
//   medios de pago: confirmados por la propietaria (2026-10-28).
// - Lo que ocurre con un pedido y con los datos: descripción del flujo real
//   del sitio (checkout, correo de resumen, contacto por WhatsApp).
// - Garantía, retracto, reversión del pago y derechos del titular: lo que
//   establecen la Ley 1480 de 2011 y la Ley 1581 de 2012, atribuido a la ley.
//   No hay políticas voluntarias adicionales.
//
// Reservado por decisión de la propietaria: su nombre legal, número de
// identificación y dirección particular NO se publican ni se agregan aquí.
// VIBE se presenta como marca comercial, no como sociedad constituida.
// Requisitos legales que dependen de esos datos: docs/VIBE_MASTER_REQUIREMENTS.md §19.
//
// Formato de cada bloque de una política: un texto (párrafo),
// { lead, text } (párrafo con título corto resaltado) o { list: [...] }
// (lista con viñetas). Todo se escapa al pintarse.

export const LEGAL_PAGE = "legal.html";
export const LEGAL_UPDATED = "28 de octubre de 2026";

export const LEGAL = {
  identity: {
    brand: "VIBE",
    expandedName: "Vibrant Iconic Beauty Essentials",
    location: "Chía, Cundinamarca, Colombia",
    hours: "Lunes a domingo, de 8:00 a. m. a 10:00 p. m.",
  },
  contact: {
    whatsapp: "314 349 0825",
    whatsappUrl: "https://wa.me/573143490825",
    email: "vibeeproject2026@gmail.com",
    instagram: "@beautyvibe.col",
    instagramUrl: "https://www.instagram.com/beautyvibe.col/",
  },
  policies: [
    {
      id: "envios",
      title: "Envíos",
      blocks: [
        "Realizamos envíos dentro de Colombia.",
        "El costo y las condiciones del envío dependen del destino y te los confirmamos por WhatsApp antes de cerrar tu pedido. Enviar el pedido desde el catálogo no genera ningún cobro.",
      ],
    },
    {
      id: "pagos",
      title: "Medios de pago",
      blocks: [
        "El pago se realiza después de que confirmemos contigo el pedido por WhatsApp. Medios de pago aceptados:",
        { list: ["Transferencia bancaria", "Nequi", "PSE", "Bre-B", "Tarjeta de crédito"] },
        "El catálogo no recibe pagos ni pide datos de tarjetas o cuentas bancarias.",
      ],
    },
    {
      id: "cambios",
      title: "Garantía, retracto y reversión del pago",
      blocks: [
        "Respetamos los derechos que la ley colombiana reconoce a los consumidores (Ley 1480 de 2011, Estatuto del Consumidor). VIBE no ofrece una política adicional de cambios por gusto o preferencia.",
        { lead: "Garantía legal.", text: "Todos los productos tienen la garantía legal de calidad, idoneidad y seguridad, por el término que establece la ley. Abrir un cosmético no elimina por sí solo la garantía legal frente a defectos de calidad, idoneidad o seguridad. La garantía no aplica en los casos que prevé la ley (artículo 16), por ejemplo el uso indebido del producto o no seguir sus instrucciones de uso." },
        { lead: "Derecho de retracto.", text: "En las compras a distancia puedes ejercer el derecho de retracto dentro de los cinco (5) días hábiles siguientes a la entrega, en los términos del artículo 47 de la Ley 1480 de 2011: el producto se devuelve en las mismas condiciones en que lo recibiste, los costos de transporte y demás que implique la devolución corren por tu cuenta, y el dinero se reintegra dentro de los treinta (30) días calendario siguientes. La ley prevé excepciones a este derecho, entre ellas la de los bienes de uso personal. Si quieres ejercerlo, escríbenos y revisaremos tu solicitud conforme a la ley." },
        { lead: "Reversión del pago.", text: "Si pagaste con tarjeta de crédito u otro instrumento de pago electrónico, puedes solicitar la reversión del pago en los casos y plazos del artículo 51 de la Ley 1480 de 2011 (fraude, operación no solicitada, producto no recibido, o producto que no corresponde a lo solicitado o es defectuoso), avisándonos a nosotros y a la entidad emisora del medio de pago." },
        { lead: "Cómo hacer una solicitud.", text: "Escríbenos por WhatsApp o al correo de contacto con tu número de pedido y la descripción de lo ocurrido. Responderemos dentro de los plazos legales." },
        "Si no estás de acuerdo con nuestra respuesta, puedes acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co).",
      ],
    },
    {
      id: "datos",
      title: "Tratamiento de datos personales",
      blocks: [
        "Esta política describe cómo VIBE trata los datos personales que recibe a través de este catálogo, en el marco de la Ley 1581 de 2012.",
        { lead: "Responsable.", text: "VIBE (Vibrant Iconic Beauty Essentials), marca comercial con ubicación en Chía, Cundinamarca, Colombia. Canal para temas de datos personales: vibeeproject2026@gmail.com. Teléfono y WhatsApp: 314 349 0825." },
        { lead: "Datos que recibimos.", text: "Cuando envías un pedido: nombre, número de celular o WhatsApp, correo electrónico, ciudad, dirección de entrega, observaciones (opcional) y los productos de tu pedido." },
        "Para qué los usamos:",
        {
          list: [
            "Registrar y gestionar tu pedido.",
            "Contactarte por WhatsApp para confirmar disponibilidad, envío y forma de pago.",
            "Enviarte por correo el resumen de tu pedido.",
            "Prevenir pedidos duplicados o abusivos.",
            "Atender tus solicitudes, incluidas las de garantía, retracto o reversión del pago.",
          ],
        },
        { lead: "Autorización.", text: "Al marcar la casilla de autorización y enviar tu pedido, nos autorizas a tratar tus datos para estas finalidades. Sin esa autorización no podemos registrar el pedido." },
        { lead: "Proveedores.", text: "Para operar el catálogo usamos proveedores tecnológicos de alojamiento, base de datos y envío de correos, que tratan los datos por cuenta de VIBE." },
        "Tus derechos (artículo 8 de la Ley 1581 de 2012):",
        {
          list: [
            "Conocer, actualizar y rectificar tus datos.",
            "Solicitar prueba de la autorización que nos diste.",
            "Ser informado sobre el uso que les damos.",
            "Revocar la autorización o pedir la supresión de tus datos, cuando no exista un deber legal o contractual de conservarlos.",
            "Acceder gratuitamente a tus datos.",
            "Presentar quejas ante la Superintendencia de Industria y Comercio.",
          ],
        },
        { lead: "Cómo ejercerlos.", text: "Escribe a vibeeproject2026@gmail.com indicando tu nombre, un dato de contacto y tu solicitud. La ley establece que las consultas se atienden en un máximo de diez (10) días hábiles y los reclamos en un máximo de quince (15) días hábiles, prorrogables en los casos que ella prevé." },
      ],
    },
  ],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const filled = (v) => typeof v === "string" && v.trim() !== "";
const validPolicies = (legal) => (legal.policies || []).filter((p) => p && filled(p.id) && filled(p.title) && Array.isArray(p.blocks) && p.blocks.length);

function blockHtml(b) {
  if (b && Array.isArray(b.list)) return `<ul>${b.list.filter(filled).map((i) => `<li>${esc(i.trim())}</li>`).join("")}</ul>`;
  if (b && filled(b.lead) && filled(b.text)) return `<p><strong>${esc(b.lead.trim())}</strong> ${esc(b.text.trim())}</p>`;
  return filled(b) ? `<p>${esc(b.trim())}</p>` : "";
}

// Columna «Legal» del pie: enlaces a cada política de la página legal.
// Devuelve "" si no hay políticas (la columna queda oculta).
export function legalFooterHtml(legal = LEGAL) {
  const policies = validPolicies(legal);
  if (!policies.length) return "";
  const items = policies.map((p) => `<li><a href="${LEGAL_PAGE}#${esc(p.id)}">${esc(p.title)}</a></li>`).join("");
  return `<p class="footer-title" id="footerLegalTitle">Legal</p><ul class="footer-links footer-legal">${items}</ul>`;
}

// Contenido de legal.html: índice + una sección por política.
export function legalPageHtml(legal = LEGAL) {
  const policies = validPolicies(legal);
  const id = legal.identity || {};
  const c = legal.contact || {};
  const index = policies.map((p) => `<li><a href="#${esc(p.id)}">${esc(p.title)}</a></li>`).join("");
  const sections = policies
    .map((p) => `<section class="legal-section" id="${esc(p.id)}" aria-labelledby="${esc(p.id)}-title"><h2 id="${esc(p.id)}-title">${esc(p.title)}</h2>${p.blocks.map(blockHtml).join("")}</section>`)
    .join("");
  const identity = `<section class="legal-section legal-identity" id="contacto-legal" aria-labelledby="contacto-legal-title"><h2 id="contacto-legal-title">Quiénes somos y cómo contactarnos</h2>
    <p><strong>${esc(id.brand)}</strong> · ${esc(id.expandedName)}</p>
    <ul>
      <li>Ubicación comercial: ${esc(id.location)}</li>
      <li>WhatsApp: <a href="${esc(c.whatsappUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.whatsapp)}</a></li>
      <li>Correo: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>
      <li>Instagram: <a href="${esc(c.instagramUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.instagram)}</a></li>
      <li>Horario de atención: ${esc(id.hours)}</li>
    </ul></section>`;
  return `<nav class="legal-index" aria-label="Contenido"><ul>${index}<li><a href="#contacto-legal">Contacto</a></li></ul></nav>${sections}${identity}<p class="legal-updated">Vigente desde el ${esc(LEGAL_UPDATED)}.</p>`;
}

// Pinta la columna «Legal» del pie de la portada. La página legal.html
// lleva su contenido ya escrito (scripts/build-legal.mjs).
export function renderLegal(root = typeof document !== "undefined" ? document.getElementById("legal") : null, legal = LEGAL) {
  if (!root) return;
  const html = legalFooterHtml(legal);
  root.innerHTML = html;
  root.hidden = !html;
}

if (typeof document !== "undefined") renderLegal();
