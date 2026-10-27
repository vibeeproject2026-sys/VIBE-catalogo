// Runs with plain Node, no test framework, no network:
//   node scripts/test-cart-swipe.js
//
// Fase 47 — deslizar una fila del carrito para revelar "Eliminar"
// (js/cart-swipe.js): decisión de eje, recorrido, umbral de apertura y
// el binding sobre un DOM mínimo simulado. El gesto nunca elimina por sí
// solo: solo revela la acción (la eliminación sigue siendo data-a="del").

const assert = require("assert/strict");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.error("  FAIL - " + name);
    console.error("    " + e.message);
  }
}

// --- DOM mínimo -----------------------------------------------------------
function el(tag, { classes = [], attrs = {} } = {}) {
  const cls = new Set(classes);
  const node = {
    tagName: tag.toUpperCase(),
    style: {},
    tabIndex: -1,
    parent: null,
    children: [],
    attrs,
    classList: {
      contains: (c) => cls.has(c),
      toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)),
      add: (c) => cls.add(c),
    },
    matches(sel) {
      return sel.split(",").some((part) => {
        const p = part.trim();
        if (p === "button" || p === "a" || p === "input" || p === "select" || p === "textarea" || p === "label") return node.tagName === p.toUpperCase();
        if (p === ".cart-item[data-swipe]") return cls.has("cart-item") && "data-swipe" in attrs;
        if (p === ".cart-item.swiped") return cls.has("cart-item") && cls.has("swiped");
        if (p.startsWith(".")) return cls.has(p.slice(1));
        return false;
      });
    },
    closest(sel) {
      let n = node;
      while (n) {
        if (n.matches && n.matches(sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) {
      for (const c of node.children) {
        if (c.matches(sel)) return c;
        const deep = c.querySelector(sel);
        if (deep) return deep;
      }
      return null;
    },
    append(...kids) {
      for (const k of kids) { k.parent = node; node.children.push(k); }
      return node;
    },
  };
  return node;
}

function makeCart() {
  const listeners = {};
  const container = el("div");
  container.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
  container.querySelectorAll = () => rows.filter((r) => r.classList.contains("swiped"));
  const rows = [];
  function row() {
    const r = el("div", { classes: ["cart-item"], attrs: { "data-swipe": "" } });
    const action = el("button", { classes: ["cart-swipe-action"] });
    const inner = el("div", { classes: ["cart-item-inner"] });
    const thumb = el("div", { classes: ["thumb"] });
    const qtyBtn = el("button", { classes: ["qty-btn"] });
    inner.append(thumb, qtyBtn);
    r.append(action, inner);
    container.append(r);
    rows.push(r);
    return { r, action, inner, thumb, qtyBtn };
  }
  const fire = (type, ev) => {
    for (const fn of listeners[type] || []) fn({ pointerId: 1, pointerType: "touch", stopPropagation() {}, preventDefault() {}, ...ev });
  };
  return { container, row, fire };
}

async function main() {
  global.window = { PointerEvent: function PointerEvent() {} };
  const swipe = await import("../js/cart-swipe.js");
  const { lockAxis, dragOffset, shouldOpen, REVEAL_WIDTH, bindCartSwipe } = swipe;

  console.log("Decisión del gesto");
  await test("movimientos menores al umbral no deciden eje (un toque no es un gesto)", () => {
    assert.equal(lockAxis(3, 2), null);
    assert.equal(lockAxis(-7, 0), null);
  });
  await test("horizontal solo si |dx| > |dy|; si no, es scroll vertical", () => {
    assert.equal(lockAxis(-30, 5), "x");
    assert.equal(lockAxis(10, 25), "y");
    assert.equal(lockAxis(-12, 12), "y");
  });
  await test("el desplazamiento solo va hacia la izquierda y se acota a la acción", () => {
    assert.equal(dragOffset(0, 40), 0);
    assert.equal(dragOffset(0, -50), -50);
    assert.equal(dragOffset(0, -400), -REVEAL_WIDTH);
    assert.equal(dragOffset(-REVEAL_WIDTH, 30), -REVEAL_WIDTH + 30);
  });
  await test("al soltar, queda abierta solo pasada la mitad del recorrido", () => {
    assert.equal(shouldOpen(-REVEAL_WIDTH / 2 + 1), false);
    assert.equal(shouldOpen(-REVEAL_WIDTH / 2), true);
    assert.equal(shouldOpen(-REVEAL_WIDTH), true);
  });

  console.log("Binding sobre el carrito");
  await test("deslizar a la izquierda revela la acción (no elimina) y la hace enfocable", () => {
    const { container, row, fire } = makeCart();
    const { r, action, inner, thumb } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: thumb, clientX: 300, clientY: 100 });
    fire("pointermove", { target: thumb, clientX: 220, clientY: 104 });
    assert.equal(inner.style.transform, "translateX(-80px)");
    fire("pointerup", { target: thumb, clientX: 220, clientY: 104 });
    assert.equal(r.classList.contains("swiped"), true);
    assert.equal(inner.style.transform, `translateX(-${REVEAL_WIDTH}px)`);
    assert.equal(action.tabIndex, 0);
  });
  await test("un deslizamiento corto vuelve a cerrar la fila", () => {
    const { container, row, fire } = makeCart();
    const { r, thumb } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: thumb, clientX: 300, clientY: 100 });
    fire("pointermove", { target: thumb, clientX: 270, clientY: 100 });
    fire("pointerup", { target: thumb, clientX: 270, clientY: 100 });
    assert.equal(r.classList.contains("swiped"), false);
  });
  await test("un movimiento vertical (scroll) no desplaza la fila", () => {
    const { container, row, fire } = makeCart();
    const { r, inner, thumb } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: thumb, clientX: 300, clientY: 100 });
    fire("pointermove", { target: thumb, clientX: 290, clientY: 160 });
    fire("pointermove", { target: thumb, clientX: 200, clientY: 170 });
    fire("pointerup", { target: thumb, clientX: 200, clientY: 170 });
    assert.equal(inner.style.transform, undefined);
    assert.equal(r.classList.contains("swiped"), false);
  });
  await test("el gesto no arranca sobre un control (botones de cantidad)", () => {
    const { container, row, fire } = makeCart();
    const { r, inner, qtyBtn } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: qtyBtn, clientX: 300, clientY: 100 });
    fire("pointermove", { target: qtyBtn, clientX: 150, clientY: 100 });
    fire("pointerup", { target: qtyBtn, clientX: 150, clientY: 100 });
    assert.equal(inner.style.transform, undefined);
    assert.equal(r.classList.contains("swiped"), false);
  });
  await test("con mouse (escritorio) no hay gesto: solo el botón visible", () => {
    const { container, row, fire } = makeCart();
    const { r, thumb } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: thumb, pointerType: "mouse", clientX: 300, clientY: 100 });
    fire("pointermove", { target: thumb, pointerType: "mouse", clientX: 150, clientY: 100 });
    fire("pointerup", { target: thumb, pointerType: "mouse", clientX: 150, clientY: 100 });
    assert.equal(r.classList.contains("swiped"), false);
  });
  await test("pointercancel (el navegador tomó el scroll) restaura la posición inicial", () => {
    const { container, row, fire } = makeCart();
    const { r, inner, thumb } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: thumb, clientX: 300, clientY: 100 });
    fire("pointermove", { target: thumb, clientX: 250, clientY: 100 });
    fire("pointercancel", { target: thumb });
    assert.equal(inner.style.transform, "");
    assert.equal(r.classList.contains("swiped"), false);
  });
  await test("el click sintético justo después de un arrastre se suprime", () => {
    const { container, row, fire } = makeCart();
    const { thumb } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: thumb, clientX: 300, clientY: 100 });
    fire("pointermove", { target: thumb, clientX: 180, clientY: 100 });
    fire("pointerup", { target: thumb, clientX: 180, clientY: 100 });
    let stopped = false;
    fire("click", { target: thumb, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
  });
  await test("tocar la fila abierta fuera de la acción la cierra (sin eliminar)", async () => {
    const { container, row, fire } = makeCart();
    const { r, thumb } = row();
    bindCartSwipe(container);
    fire("pointerdown", { target: thumb, clientX: 300, clientY: 100 });
    fire("pointermove", { target: thumb, clientX: 180, clientY: 100 });
    fire("pointerup", { target: thumb, clientX: 180, clientY: 100 });
    await new Promise((res) => setTimeout(res, 5)); // termina la supresión del click sintético
    fire("click", { target: thumb });
    assert.equal(r.classList.contains("swiped"), false);
  });
  await test("el módulo no toca el carrito ni la red (no importa cart.js ni usa fetch)", () => {
    // Solo código: se quitan los comentarios (documentan el flujo y nombran removeFromCart).
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "cart-swipe.js"), "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /import\s/);
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|removeFromCart/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
