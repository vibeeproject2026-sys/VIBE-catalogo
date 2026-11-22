// «Más elegidos»: ranking por UNIDADES VENDIDAS, calculado en solo lectura
// desde las ventas reales del POS (tabla `sales`). Nunca escribe nada.
//
// Cómo guarda el POS una venta (auditado con los datos reales):
// - el detalle por producto está en `items` (JSON, como texto o arreglo):
//   [{ productId, qty, ... }]; `sale_items` está vacía;
// - `product_id`/`qty` de la venta NO son por producto (en una venta de dos
//   productos, qty es el total y product_id solo el primero), así que nunca
//   se usan para el ranking: solo las líneas de `items`;
// - confirmada = `paid === true`, `status === "active"` y sin `voided_at`
//   (anulada). Cualquier otro estado (o uno desconocido) no cuenta;
// - fecha efectiva: `sold_at` si existe; si no, `date`; si no, `created_at`.
// Las ventas borradas desde el POS ya no están en `sales` (van a
// sales_deleted_archive) y por tanto no cuentan. El POS no registra
// devoluciones parciales: no hay información confiable para descontarlas.
// Cada venta se cuenta una sola vez (por id). Los pedidos web (`orders`)
// no son ventas confirmadas y no se usan.

const { pgrestSelect } = require("../catalog/_lib/supabaseRead");

const SALES_COLUMNS = "id,items,status,paid,voided_at,sold_at,date,created_at";

function saleDate(s) {
  const raw = s.sold_at || s.date || s.created_at;
  const t = raw ? Date.parse(String(raw).length === 10 ? raw + "T12:00:00Z" : raw) : NaN;
  return Number.isNaN(t) ? null : t;
}
function isConfirmed(s) {
  return s && s.paid === true && s.status === "active" && !s.voided_at;
}
function saleLines(s) {
  let items = s.items;
  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch { return null; }
  }
  if (!Array.isArray(items) || !items.length) return null;
  const lines = [];
  for (const l of items) {
    const pid = Number(l && (l.productId ?? l.product_id));
    const qty = Number(l && l.qty);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(qty) || qty <= 0) return null; // venta ilegible: no se adivina
    lines.push({ productId: pid, qty });
  }
  return lines;
}

// Pura: ventas → [{ productId, units }] (mayor a menor; empate por id).
function rankUnits(sales, { now = Date.now(), periodDays = 30 } = {}) {
  const since = now - periodDays * 24 * 3600 * 1000;
  const seen = new Set();
  const units = new Map();
  let counted = 0, skipped = 0;
  for (const s of Array.isArray(sales) ? sales : []) {
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    const t = saleDate(s);
    if (t === null || t < since || t > now) continue;
    if (!isConfirmed(s)) { skipped++; continue; }
    const lines = saleLines(s);
    if (!lines) { skipped++; continue; }
    counted++;
    for (const l of lines) units.set(l.productId, (units.get(l.productId) || 0) + l.qty);
  }
  const ranking = [...units].map(([productId, u]) => ({ productId, units: u })).sort((a, b) => b.units - a.units || a.productId - b.productId);
  return { ranking, salesCounted: counted, salesSkipped: skipped };
}

async function loadBestSellers(env, { periodDays = 30, now = Date.now() } = {}) {
  const since = new Date(now - (periodDays + 1) * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const sales = await pgrestSelect({ table: "sales", columns: SALES_COLUMNS, filters: [["or", `(date.gte.${since},sold_at.gte.${since},created_at.gte.${since})`]], env });
  return { ...rankUnits(sales, { now, periodDays }), periodDays, computedAt: new Date(now).toISOString() };
}

module.exports = { rankUnits, loadBestSellers, isConfirmed, saleLines, saleDate };
