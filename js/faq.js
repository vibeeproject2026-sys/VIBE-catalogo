// Fase 45 — acordeón accesible de "Preguntas frecuentes" (#ayuda).
//
// Patrón WAI-ARIA Accordion: cada pregunta es un <button> dentro de un
// encabezado, con aria-expanded y aria-controls apuntando a su panel
// (role="region", aria-labelledby de vuelta al botón, `hidden` cuando
// está cerrado). Enter/Espacio los resuelve el <button> nativo; además
// ↑/↓/Inicio/Fin mueven el foco entre preguntas. Varias pueden quedar
// abiertas a la vez (cada una es independiente).
//
// Módulo aparte de app.js a propósito: no comparte estado con el
// catálogo/carrito y, si fallara, nunca afectaría al resto del sitio.

export function setExpanded(button, panel, expanded) {
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  panel.hidden = !expanded;
}

export function toggle(button, panel) {
  const next = button.getAttribute("aria-expanded") !== "true";
  setExpanded(button, panel, next);
  return next;
}

// Índice de la pregunta que debe recibir el foco para una tecla dada,
// o -1 si la tecla no es de navegación.
export function nextFocusIndex(key, current, count) {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

export function bindAccordion(root) {
  if (!root) return;
  const buttons = () => [...root.querySelectorAll(".faq-q")];
  const panelFor = (button) => root.querySelector("#" + button.getAttribute("aria-controls"));

  root.addEventListener("click", (e) => {
    const button = e.target.closest(".faq-q");
    if (!button || !root.contains(button)) return;
    const panel = panelFor(button);
    if (panel) toggle(button, panel);
  });

  root.addEventListener("keydown", (e) => {
    const button = e.target.closest(".faq-q");
    if (!button) return;
    const list = buttons();
    const idx = nextFocusIndex(e.key, list.indexOf(button), list.length);
    if (idx === -1) return;
    e.preventDefault();
    list[idx].focus();
  });
}

if (typeof document !== "undefined") {
  bindAccordion(document.querySelector("[data-accordion]"));
}
