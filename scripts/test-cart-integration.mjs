// Runs with plain Node, no test framework, no network:
//   node scripts/test-cart-integration.mjs
//
// Exercises the real, unmodified js/cart.js against products shaped by
// the NEW data-source.js normalizers (both a demo-sourced product with
// real variants, and an API-sourced product with a synthesized default
// variant) — confirming the cart still works end to end regardless of
// where the product came from. Same temp-copy technique as
// test-data-source.mjs so the real ES module source can run under plain
// Node without adding a package.json to the actual repo.
//
// cart.js reads/writes `localStorage` at module load time, so a minimal
// in-memory localStorage stand-in is installed on globalThis before the
// dynamic import — nothing about cart.js itself changes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function installFakeLocalStorage() {
  let store = {};
  globalThis.localStorage = {
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

async function main() {
  installFakeLocalStorage();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-cart-test-"));
  fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ type: "module" }));
  fs.copyFileSync(path.join(repoRoot, "js", "cart.js"), path.join(tmpDir, "cart.js"));
  fs.copyFileSync(path.join(repoRoot, "js", "products.js"), path.join(tmpDir, "products.js"));
  fs.copyFileSync(path.join(repoRoot, "js", "data-source.js"), path.join(tmpDir, "data-source.js"));

  const cart = await import(pathToFileURL(path.join(tmpDir, "cart.js")).href);
  const dataSource = await import(pathToFileURL(path.join(tmpDir, "data-source.js")).href);

  const { addToCart, getCart, changeQuantity, removeFromCart, clearCart, getCartCount, getCartTotal } = cart;
  const { __internal } = dataSource;

  console.log("carrito con un producto demo (variantes reales)");
  await test("agregar un producto demo con variante real funciona igual que antes", () => {
    clearCart();
    const demoProducts = __internal.getDemoProducts();
    const lip = demoProducts.find((p) => p.id === "lip");
    const berryVariant = lip.variants.find((v) => v.id === "berry");
    addToCart(lip, berryVariant, 2);
    const items = getCart();
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 2);
    assert.equal(items[0].price, berryVariant.price);
    assert.equal(items[0].image, lip.image);
  });

  console.log("carrito con un producto API (variante sintetizada, sin stock local)");
  await test("agregar un producto con shape de API (variante sintetizada) funciona igual", () => {
    clearCart();
    const apiProduct = __internal.normalizeApiProduct({
      id: 501,
      name: "Producto Real",
      price: 75000,
      available: true,
      presentation: "50 ml",
      image: "https://example.com/real.jpg",
    });
    const variant = apiProduct.variants[0];
    addToCart(apiProduct, variant, 1);
    const items = getCart();
    assert.equal(items.length, 1);
    assert.equal(items[0].productId, 501);
    assert.equal(items[0].variantId, "default");
    assert.equal(items[0].price, 75000);
    assert.equal(items[0].image, "https://example.com/real.jpg");
  });

  console.log("cantidad, eliminación, subtotal y total siguen funcionando");
  await test("changeQuantity incrementa/decrementa y remove elimina el ítem por completo en 0", () => {
    clearCart();
    const apiProduct = __internal.normalizeApiProduct({ id: 7, name: "X", price: 1000 });
    const variant = apiProduct.variants[0];
    addToCart(apiProduct, variant, 1);
    changeQuantity(7, "default", 2);
    assert.equal(getCart()[0].quantity, 3);
    changeQuantity(7, "default", -3);
    assert.equal(getCart().length, 0); // baja de 1 y se elimina automáticamente
  });
  await test("removeFromCart elimina un ítem específico sin afectar a los demás", () => {
    clearCart();
    const a = __internal.normalizeApiProduct({ id: 10, name: "A", price: 1000 });
    const b = __internal.normalizeApiProduct({ id: 11, name: "B", price: 2000 });
    addToCart(a, a.variants[0], 1);
    addToCart(b, b.variants[0], 1);
    removeFromCart(10, "default");
    const items = getCart();
    assert.equal(items.length, 1);
    assert.equal(items[0].productId, 11);
  });
  await test("getCartCount y getCartTotal calculan correctamente con productos mixtos (demo + API)", () => {
    clearCart();
    const demoProducts = __internal.getDemoProducts();
    const cleanser = demoProducts.find((p) => p.id === "cleanser");
    addToCart(cleanser, cleanser.variants[0], 2); // 58900 x2
    const apiProduct = __internal.normalizeApiProduct({ id: 20, name: "Real", price: 10000 });
    addToCart(apiProduct, apiProduct.variants[0], 3); // 10000 x3
    assert.equal(getCartCount(), 5);
    assert.equal(getCartTotal(), 58900 * 2 + 10000 * 3);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal error running tests:", e);
  process.exit(1);
});
