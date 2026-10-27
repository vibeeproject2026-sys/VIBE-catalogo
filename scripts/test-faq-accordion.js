// Runs with plain Node, no test framework, no network:
//   node scripts/test-faq-accordion.js
//
// Fase 45 — lógica del acordeón de Preguntas frecuentes (js/faq.js):
// toggle de aria-expanded/hidden, navegación por teclado, y el binding
// delegado (click y teclas) sobre un DOM mínimo simulado.

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

// DOM mínimo: lo justo que usa js/faq.js.
function makeButton(id, controls) {
  const attrs = { id, "aria-expanded": "false", "aria-controls": controls };
  const btn = {
    id,
    focused: false,
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = String(v); },
    closest: (sel) => (sel === ".faq-q" ? btn : null),
    focus: () => { btn.focused = true; },
  };
  return btn;
}
function makeRoot(count) {
  const buttons = [];
  const panels = {};
  for (let i = 1; i <= count; i++) {
    buttons.push(makeButton(`q${i}`, `a${i}`));
    panels[`#a${i}`] = { id: `a${i}`, hidden: true };
  }
  const listeners = {};
  return {
    buttons,
    panels,
    querySelectorAll: (sel) => (sel === ".faq-q" ? buttons : []),
    querySelector: (sel) => panels[sel] || null,
    contains: (el) => buttons.includes(el),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    fire: (type, event) => listeners[type](event),
  };
}

async function main() {
  const { setExpanded, toggle, nextFocusIndex, bindAccordion } = await import("../js/faq.js");

  console.log("js/faq.js — toggle / setExpanded");
  await test("toggle abre: aria-expanded=true y el panel deja de estar hidden", () => {
    const b = makeButton("q", "a");
    const p = { hidden: true };
    assert.equal(toggle(b, p), true);
    assert.equal(b.getAttribute("aria-expanded"), "true");
    assert.equal(p.hidden, false);
  });
  await test("toggle dos veces vuelve a cerrar (aria-expanded=false, hidden)", () => {
    const b = makeButton("q", "a");
    const p = { hidden: true };
    toggle(b, p);
    assert.equal(toggle(b, p), false);
    assert.equal(b.getAttribute("aria-expanded"), "false");
    assert.equal(p.hidden, true);
  });
  await test("setExpanded mantiene aria-expanded y hidden siempre sincronizados", () => {
    const b = makeButton("q", "a");
    const p = { hidden: false };
    setExpanded(b, p, false);
    assert.deepEqual([b.getAttribute("aria-expanded"), p.hidden], ["false", true]);
    setExpanded(b, p, true);
    assert.deepEqual([b.getAttribute("aria-expanded"), p.hidden], ["true", false]);
  });

  console.log("js/faq.js — navegación por teclado");
  await test("↓ / ↑ avanzan y retroceden con vuelta circular", () => {
    assert.equal(nextFocusIndex("ArrowDown", 0, 3), 1);
    assert.equal(nextFocusIndex("ArrowDown", 2, 3), 0);
    assert.equal(nextFocusIndex("ArrowUp", 0, 3), 2);
  });
  await test("Inicio / Fin van a la primera y la última pregunta", () => {
    assert.equal(nextFocusIndex("Home", 2, 5), 0);
    assert.equal(nextFocusIndex("End", 0, 5), 4);
  });
  await test("cualquier otra tecla (Enter, Espacio, Tab) no se intercepta", () => {
    for (const k of ["Enter", " ", "Tab", "a"]) assert.equal(nextFocusIndex(k, 0, 3), -1);
  });

  console.log("js/faq.js — bindAccordion (eventos delegados)");
  await test("click en una pregunta abre solo su propio panel; las demás siguen cerradas", () => {
    const root = makeRoot(3);
    bindAccordion(root);
    root.fire("click", { target: root.buttons[1] });
    assert.equal(root.buttons[1].getAttribute("aria-expanded"), "true");
    assert.equal(root.panels["#a2"].hidden, false);
    assert.equal(root.panels["#a1"].hidden, true);
    assert.equal(root.panels["#a3"].hidden, true);
  });
  await test("varias preguntas pueden quedar abiertas a la vez", () => {
    const root = makeRoot(3);
    bindAccordion(root);
    root.fire("click", { target: root.buttons[0] });
    root.fire("click", { target: root.buttons[2] });
    assert.equal(root.panels["#a1"].hidden, false);
    assert.equal(root.panels["#a3"].hidden, false);
  });
  await test("↓ mueve el foco a la siguiente pregunta y previene el scroll", () => {
    const root = makeRoot(3);
    bindAccordion(root);
    let prevented = false;
    root.fire("keydown", { key: "ArrowDown", target: root.buttons[0], preventDefault: () => { prevented = true; } });
    assert.equal(root.buttons[1].focused, true);
    assert.equal(prevented, true);
  });
  await test("una tecla no de navegación no previene el comportamiento nativo", () => {
    const root = makeRoot(2);
    bindAccordion(root);
    let prevented = false;
    root.fire("keydown", { key: "Enter", target: root.buttons[0], preventDefault: () => { prevented = true; } });
    assert.equal(prevented, false);
  });
  await test("bindAccordion(null) no lanza (sección ausente)", () => {
    assert.doesNotThrow(() => bindAccordion(null));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
