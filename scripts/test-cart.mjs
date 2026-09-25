// Runs with plain Node, no test framework, no DOM:
//   node scripts/test-cart.mjs
//
// js/cart.js depends on localStorage (top-level, at import time), so a
// minimal in-memory shim is installed before it's loaded — same
// data:-URL-import trick used by the other zero-dependency test scripts
// in this project (see scripts/test-url-state.mjs).

import assert from "node:assert/strict";
import fs from "node:fs";

function freshLocalStorage() {
  let store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

async function freshCart() {
  global.localStorage = freshLocalStorage();
  const src = fs.readFileSync(new URL("../js/cart.js", import.meta.url), "utf8");
  // Cache-bust: cada import de una data: URL distinta es un módulo nuevo,
  // con su propio estado interno `items` — necesario porque cart.js
  // guarda el carrito en una variable de módulo, no en una clase.
  return import("data:text/javascript," + encodeURIComponent(src) + `\n//${Math.random()}`);
}

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

console.log("addToCart / id numérico real del POS (Fase 28 — bug encontrado en la auditoría)");
await test("agregar dos veces el mismo producto real (id numérico) suma cantidad, no duplica la fila", async () => {
  const { addToCart, getCart } = await freshCart();
  const product = { id: 56, name: "Producto real", image: null };
  const variant = { id: "default", name: "Único", price: 18000, sku: null };
  addToCart(product, variant, 1);
  addToCart(product, variant, 2);
  const items = getCart();
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 3);
});

console.log("changeQuantity / removeFromCart con id proveniente de un dataset del DOM (siempre string)");
await test("changeQuantity encuentra la fila aunque pid llegue como string y productId se haya guardado numérico", async () => {
  const { addToCart, changeQuantity, getCart } = await freshCart();
  const product = { id: 56, name: "Producto real", image: null };
  const variant = { id: "default", name: "Único", price: 18000, sku: null };
  addToCart(product, variant, 1);
  // Simula exactamente lo que pasa en app.js: b.dataset.p es siempre string,
  // incluso cuando el productId real es un número (56).
  changeQuantity("56", "default", 1);
  assert.equal(getCart()[0].quantity, 2);
});
await test("una cantidad que llega a 0 elimina la fila (mismo comportamiento de siempre)", async () => {
  const { addToCart, changeQuantity, getCart } = await freshCart();
  const product = { id: 56, name: "Producto real", image: null };
  const variant = { id: "default", name: "Único", price: 18000, sku: null };
  addToCart(product, variant, 1);
  changeQuantity("56", "default", -1);
  assert.deepEqual(getCart(), []);
});
await test("removeFromCart encuentra la fila aunque pid llegue como string", async () => {
  const { addToCart, removeFromCart, getCart } = await freshCart();
  const product = { id: 56, name: "Producto real", image: null };
  const variant = { id: "default", name: "Único", price: 18000, sku: null };
  addToCart(product, variant, 1);
  removeFromCart("56", "default");
  assert.deepEqual(getCart(), []);
});

console.log("addToCart / precio efectivo (Fase 28 — TEST 13: respeta promoción al agregar)");
await test("agregar con un precio de variante ya sobreescrito (promoPrice) guarda ese precio, no el original", async () => {
  const { addToCart, getCart, getCartTotal } = await freshCart();
  const product = { id: 56, name: "Producto real", image: null };
  const variant = { id: "default", name: "Único", price: 18000, sku: null };
  // Así lo llama app.js cuando hay promoción activa: { ...variant, price: currentEffectivePrice() }
  addToCart(product, { ...variant, price: 15000 }, 1);
  assert.equal(getCart()[0].price, 15000);
  assert.equal(getCartTotal(), 15000);
});

console.log("compatibilidad hacia atrás — productos demo (ids string, sin cambios de comportamiento)");
await test("un producto demo (id ya string) sigue funcionando exactamente igual", async () => {
  const { addToCart, changeQuantity, getCart } = await freshCart();
  const product = { id: "cleanser", name: "Daily Glow Cleanser", image: null };
  const variant = { id: "150ml", name: "150 ml", price: 58900, sku: "DEMO-CL-150" };
  addToCart(product, variant, 1);
  changeQuantity("cleanser", "150ml", 1);
  assert.equal(getCart()[0].quantity, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
