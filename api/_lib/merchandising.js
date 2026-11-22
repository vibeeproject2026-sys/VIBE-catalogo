// Organización comercial del catálogo (independiente del POS).
//
// Fuente de verdad: un documento JSON («config/merchandising.json») en el
// bucket de Storage ya existente — mismo patrón que config/taxonomy.json y
// hero/slides.json: no requiere migración SQL. Si no existe, rige
// DEFAULT_MERCHANDISING (sin colecciones, sin etiquetas, Novedades sin
// fecha de lanzamiento oficial): nada se publica hasta que la propietaria
// lo configure.
//
// Forma:
// {
//   revision, updatedAt,
//   collections: [{ id, name, description, active, startsAt, endsAt }],   // orden = posición
//   tags: [{ id, name, active }],
//   assignments: { "<productId>": { collections: [id], tags: [id] } },
//   showcases: {
//     order: ["hero","novedades","masElegidos","catalogo","colecciones","ofertas","descubre"],
//     novedades:   { active, title, limit, launchDate|null, windowDays, pinned: [productId], excluded: [productId] },
//     masElegidos: { active, title, limit, periodDays, pinned: [{ productId, position }], excluded: [productId] },
//     ofertas:     { active, title },
//     colecciones: { active, title },
//     descubre:    { active, title, picks: [{ type: "category"|"collection"|"tag", value, title }] },
//   }
// }
//
// Consistencia: igual que la taxonomía, cada guardado sube `revision` y solo
// se aplica sobre la revisión que el Admin tenía a la vista.

const { downloadObject, uploadObject } = require("../admin/_lib/storage");

const MERCH_PATH = "config/merchandising.json";
const SECTIONS = ["hero", "novedades", "masElegidos", "catalogo", "colecciones", "ofertas", "descubre"];
// Siempre visibles (solo se pueden reordenar): el banner y el catálogo.
const ALWAYS_ON = ["hero", "catalogo"];
const LIMITS = { min: 1, max: 40 };
const WINDOW = { min: 1, max: 365 };
const MAX_ITEMS = 200; // colecciones / etiquetas
const MAX_NAME = 60;
const MAX_TEXT = 240;
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_MERCHANDISING = {
  revision: 0,
  updatedAt: null,
  collections: [],
  tags: [],
  assignments: {},
  showcases: {
    order: [...SECTIONS],
    novedades: { active: true, title: "Novedades", limit: 10, launchDate: null, windowDays: 30, pinned: [], excluded: [] },
    masElegidos: { active: true, title: "Más elegidos", limit: 10, periodDays: 30, pinned: [], excluded: [] },
    ofertas: { active: true, title: "Ofertas" },
    colecciones: { active: true, title: "Colecciones VIBE" },
    descubre: { active: true, title: "Descubre tu VIBE", picks: [] },
  },
};

const clean = (v, max = MAX_NAME) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "");
const safeText = (v, max) => { const s = clean(v, max); return /[<>]/.test(s) ? s.replace(/[<>]/g, "") : s; };
const key = (v) => clean(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const intIn = (v, { min, max }, fallback) => (Number.isInteger(v) && v >= min && v <= max ? v : fallback);
const productId = (v) => { const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v; return Number.isInteger(n) && n > 0 ? n : null; };
const idList = (list, max = 100) => [...new Set((Array.isArray(list) ? list : []).map(productId).filter(Boolean))].slice(0, max);
const dateOrNull = (v) => (typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) ? v : null);
function slugify(name) {
  return key(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
}

// Colecciones / etiquetas: nombre obligatorio y único; id estable.
function sanitizeList(list, withExtras) {
  const out = [];
  const ids = new Set();
  const names = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object" || out.length >= MAX_ITEMS) continue;
    const name = safeText(raw.name, MAX_NAME);
    if (!name || names.has(key(name))) continue;
    let id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : slugify(name);
    while (ids.has(id)) id = `${id.slice(0, 44)}-${ids.size}`;
    ids.add(id);
    names.add(key(name));
    const item = { id, name, active: raw.active !== false };
    if (withExtras) {
      item.description = safeText(raw.description, MAX_TEXT);
      item.startsAt = dateOrNull(raw.startsAt);
      item.endsAt = dateOrNull(raw.endsAt);
    }
    out.push(item);
  }
  return out;
}

function sanitizeMerchandising(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const collections = sanitizeList(src.collections, true);
  const tags = sanitizeList(src.tags, false);
  const colIds = new Set(collections.map((c) => c.id));
  const tagIds = new Set(tags.map((t) => t.id));
  const assignments = {};
  for (const [pid, a] of Object.entries(src.assignments && typeof src.assignments === "object" ? src.assignments : {})) {
    const id = productId(pid);
    if (!id || !a || typeof a !== "object") continue;
    const cols = [...new Set((Array.isArray(a.collections) ? a.collections : []).filter((c) => colIds.has(c)))];
    const tgs = [...new Set((Array.isArray(a.tags) ? a.tags : []).filter((t) => tagIds.has(t)))];
    if (cols.length || tgs.length) assignments[id] = { collections: cols, tags: tgs };
  }
  const s = src.showcases && typeof src.showcases === "object" ? src.showcases : {};
  const d = DEFAULT_MERCHANDISING.showcases;
  const order = [...new Set((Array.isArray(s.order) ? s.order : []).filter((x) => SECTIONS.includes(x)))];
  for (const x of SECTIONS) if (!order.includes(x)) order.push(x);
  const title = (v, fallback) => safeText(v, MAX_NAME) || fallback;
  const nov = s.novedades || {};
  const mas = s.masElegidos || {};
  const pinnedPositions = [];
  const seenPin = new Set();
  for (const p of Array.isArray(mas.pinned) ? mas.pinned : []) {
    const pid = productId(p && p.productId);
    if (!pid || seenPin.has(pid) || pinnedPositions.length >= 40) continue;
    seenPin.add(pid);
    pinnedPositions.push({ productId: pid, position: intIn(p.position, { min: 1, max: 40 }, pinnedPositions.length + 1) });
  }
  const masExcluded = idList(mas.excluded).filter((id) => !seenPin.has(id));
  const novPinned = idList(nov.pinned, 40);
  const novExcluded = idList(nov.excluded).filter((id) => !novPinned.includes(id));
  const picks = [];
  for (const p of Array.isArray((s.descubre || {}).picks) ? s.descubre.picks : []) {
    if (!p || !["category", "collection", "tag"].includes(p.type) || picks.length >= 24) continue;
    const value = safeText(p.value, MAX_NAME);
    if (!value) continue;
    if (p.type === "collection" && !colIds.has(value)) continue;
    if (p.type === "tag" && !tagIds.has(value)) continue;
    picks.push({ type: p.type, value, title: safeText(p.title, MAX_NAME) });
  }
  return {
    revision: Number.isInteger(src.revision) && src.revision > 0 ? src.revision : 0,
    updatedAt: typeof src.updatedAt === "string" ? src.updatedAt : null,
    collections,
    tags,
    assignments,
    showcases: {
      order,
      novedades: { active: nov.active !== false, title: title(nov.title, d.novedades.title), limit: intIn(nov.limit, LIMITS, 10), launchDate: dateOrNull(nov.launchDate), windowDays: intIn(nov.windowDays, WINDOW, 30), pinned: novPinned, excluded: novExcluded },
      masElegidos: { active: mas.active !== false, title: title(mas.title, d.masElegidos.title), limit: intIn(mas.limit, LIMITS, 10), periodDays: intIn(mas.periodDays, WINDOW, 30), pinned: pinnedPositions, excluded: masExcluded },
      ofertas: { active: (s.ofertas || {}).active !== false, title: title((s.ofertas || {}).title, d.ofertas.title) },
      colecciones: { active: (s.colecciones || {}).active !== false, title: title((s.colecciones || {}).title, d.colecciones.title) },
      descubre: { active: (s.descubre || {}).active !== false, title: title((s.descubre || {}).title, d.descubre.title), picks },
    },
  };
}

// Una colección está vigente si está activa y hoy cae dentro de sus fechas
// (si las tiene; ambas opcionales, inclusivas, en hora de Colombia).
function isCollectionLive(c, now = new Date()) {
  if (!c.active) return false;
  const today = new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  if (c.startsAt && today < c.startsAt) return false;
  if (c.endsAt && today > c.endsAt) return false;
  return true;
}

// Lo que ve la tienda: solo colecciones vigentes y etiquetas activas (y sus
// asignaciones); la configuración de vitrinas tal cual.
function publicMerchandising(doc, now = new Date()) {
  const collections = doc.collections.filter((c) => isCollectionLive(c, now)).map(({ id, name, description }) => ({ id, name, description }));
  const tags = doc.tags.filter((t) => t.active).map(({ id, name }) => ({ id, name }));
  const colIds = new Set(collections.map((c) => c.id));
  const tagIds = new Set(tags.map((t) => t.id));
  const assignments = {};
  for (const [pid, a] of Object.entries(doc.assignments)) {
    const cols = a.collections.filter((c) => colIds.has(c));
    const tgs = a.tags.filter((t) => tagIds.has(t));
    if (cols.length || tgs.length) assignments[pid] = { collections: cols, tags: tgs };
  }
  const picks = doc.showcases.descubre.picks.filter((p) => (p.type === "collection" ? colIds.has(p.value) : p.type === "tag" ? tagIds.has(p.value) : true));
  return { revision: doc.revision, collections, tags, assignments, showcases: { ...doc.showcases, descubre: { ...doc.showcases.descubre, picks } } };
}

// Novedades automáticas: SOLO si la propietaria fijó la fecha de
// lanzamiento oficial. Entran los productos publicados que llegaron al
// catálogo (catalog_metadata.created_at) en o después de esa fecha y dentro
// de los últimos `windowDays` días; los más recientes primero. Sin fecha
// de lanzamiento → ninguno (la carga inicial no cuenta como novedad).
function computeNewArrivals(metadataRows, cfg, now = new Date()) {
  if (!cfg || !cfg.launchDate) return [];
  const launch = Date.parse(cfg.launchDate + "T05:00:00Z"); // 00:00 en Colombia
  const since = Math.max(launch, now.getTime() - cfg.windowDays * 24 * 3600 * 1000);
  return (Array.isArray(metadataRows) ? metadataRows : [])
    .filter((m) => m && m.published === true && m.created_at)
    .map((m) => ({ id: Number(m.product_id), t: Date.parse(m.created_at) }))
    .filter((x) => Number.isInteger(x.id) && !Number.isNaN(x.t) && x.t >= since && x.t <= now.getTime())
    .sort((a, b) => b.t - a.t || b.id - a.id)
    .map((x) => x.id);
}

function defaultMerchandising() {
  return sanitizeMerchandising(JSON.parse(JSON.stringify(DEFAULT_MERCHANDISING)));
}

async function loadMerchandising(env) {
  const buffer = await downloadObject({ env, path: MERCH_PATH });
  if (!buffer) return defaultMerchandising();
  try {
    return sanitizeMerchandising(JSON.parse(buffer.toString("utf8")));
  } catch {
    console.error("[merchandising] config/merchandising.json ilegible; se usa la configuración por defecto (el archivo no se toca).");
    return defaultMerchandising();
  }
}
async function loadMerchandisingAtLeast(env, minRevision, { attempts = 8, delayMs = 700 } = {}) {
  let doc = await loadMerchandising(env);
  for (let i = 1; i < attempts && doc.revision < minRevision; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    doc = await loadMerchandising(env);
  }
  return doc;
}
async function saveMerchandising(env, doc) {
  await uploadObject({ env, path: MERCH_PATH, buffer: Buffer.from(JSON.stringify(doc, null, 2), "utf8"), contentType: "application/json" });
}

module.exports = {
  MERCH_PATH,
  SECTIONS,
  ALWAYS_ON,
  DEFAULT_MERCHANDISING,
  sanitizeMerchandising,
  publicMerchandising,
  isCollectionLive,
  computeNewArrivals,
  defaultMerchandising,
  loadMerchandising,
  loadMerchandisingAtLeast,
  saveMerchandising,
  slugify,
};
