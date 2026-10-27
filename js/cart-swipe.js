// Fase 47 — deslizar una fila del carrito (solo táctil) para revelar
// "Eliminar". Es un atajo ADICIONAL: cada fila conserva su botón visible
// "Eliminar" (accesible por teclado y lector de pantalla).
//
// Evitar eliminaciones accidentales: el gesto nunca elimina por sí solo,
// solo REVELA la acción; eliminar exige un toque explícito sobre ella,
// que pasa por el mismo data-a="del" que ya maneja app.js (#cartItems →
// removeFromCart → renderCart). Este módulo no toca el carrito ni hace
// ninguna solicitud al servidor.
//
// Vertical vs. horizontal: la fila declara touch-action: pan-y, así el
// navegador sigue haciendo el scroll vertical y cancela el gesto
// (pointercancel) si el dedo se mueve en vertical; además, el eje se
// decide recién tras un umbral de movimiento y solo si |dx| > |dy|.
// Nunca arranca sobre un control (botones de cantidad, enlaces, inputs).

export const REVEAL_WIDTH = 96; // px que se desplaza la fila al quedar abierta
export const AXIS_LOCK_PX = 8; // movimiento mínimo antes de decidir el eje
export const OPEN_THRESHOLD = 0.5; // fracción de REVEAL_WIDTH para quedar abierta al soltar

// Eje del gesto, o null mientras el movimiento sea demasiado chico.
export function lockAxis(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

// Desplazamiento visible de la fila mientras se arrastra (solo hacia la
// izquierda; acotado a [-REVEAL_WIDTH, 0]). startOffset es 0 (cerrada) o
// -REVEAL_WIDTH (abierta).
export function dragOffset(startOffset, dx) {
  return Math.max(-REVEAL_WIDTH, Math.min(0, startOffset + dx));
}

// Al soltar: ¿la fila queda abierta?
export function shouldOpen(offset) {
  return offset <= -REVEAL_WIDTH * OPEN_THRESHOLD;
}

const CONTROL_SELECTOR = "button, a, input, select, textarea, label";

export function bindCartSwipe(container) {
  if (!container || typeof window === "undefined" || !window.PointerEvent) return;
  let drag = null; // { row, inner, id, x0, y0, start, axis, offset }
  let suppressClick = false;

  const setOffset = (row, offset, animate) => {
    const inner = row.querySelector(".cart-item-inner");
    if (!inner) return;
    inner.style.transition = animate ? "" : "none";
    inner.style.transform = offset ? `translateX(${offset}px)` : "";
    row.classList.toggle("swiped", offset !== 0);
    const action = row.querySelector(".cart-swipe-action");
    if (action) action.tabIndex = offset ? 0 : -1;
  };
  const closeAll = (except) => {
    container.querySelectorAll(".cart-item.swiped").forEach((r) => { if (r !== except) setOffset(r, 0, true); });
  };

  container.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const row = e.target.closest(".cart-item[data-swipe]");
    if (!row || e.target.closest(CONTROL_SELECTOR)) return;
    closeAll(row);
    drag = { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, start: row.classList.contains("swiped") ? -REVEAL_WIDTH : 0, axis: null, offset: 0 };
    drag.offset = drag.start;
  });

  container.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.axis) drag.axis = lockAxis(dx, dy);
    if (drag.axis !== "x") return;
    drag.offset = dragOffset(drag.start, dx);
    setOffset(drag.row, drag.offset, false);
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.axis === "x") {
      setOffset(drag.row, shouldOpen(drag.offset) ? -REVEAL_WIDTH : 0, true);
      suppressClick = true; // el click sintético tras un arrastre no debe activar nada
      setTimeout(() => { suppressClick = false; }, 0);
    }
    drag = null;
  };
  container.addEventListener("pointerup", end);
  container.addEventListener("pointercancel", (e) => {
    if (drag && e.pointerId === drag.id) setOffset(drag.row, drag.start, true);
    drag = null;
  });

  container.addEventListener("click", (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); return; }
    // Tocar fuera de la acción revelada vuelve a cerrar la fila.
    const row = e.target.closest(".cart-item.swiped");
    if (row && !e.target.closest(".cart-swipe-action")) setOffset(row, 0, true);
  }, true);
}
