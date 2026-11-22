// Organización comercial — selección de productos de las vitrinas.
// Lógica pura (sin DOM): recibe los productos publicados que ya tiene la
// tienda y la configuración pública (api/_lib/merchandising.js). Nunca
// inventa productos: todo id que no esté en el catálogo publicado se ignora.

const byId = (products) => new Map(products.map((p) => [Number(p.id), p]));

// Novedades: fijados (en su orden) + automáticos del servidor (solo existen
// con fecha de lanzamiento oficial), sin excluidos ni duplicados.
export function selectNovedades(products, cfg, autoIds = []) {
  if (!cfg || cfg.active === false) return [];
  const map = byId(products);
  const excluded = new Set((cfg.excluded || []).map(Number));
  const out = [];
  const seen = new Set();
  for (const id of [...(cfg.pinned || []), ...(autoIds || [])].map(Number)) {
    if (seen.has(id) || excluded.has(id) || !map.has(id)) continue;
    seen.add(id);
    out.push(map.get(id));
    if (out.length >= cfg.limit) break;
  }
  return out;
}

// Más elegidos: los fijados ocupan su posición (1 = primero); el resto, por
// unidades vendidas (orden del servidor). Excluidos nunca aparecen.
export function selectBestSellers(products, cfg, rankingIds = []) {
  if (!cfg || cfg.active === false) return [];
  const map = byId(products);
  const excluded = new Set((cfg.excluded || []).map(Number));
  const pins = (cfg.pinned || [])
    .map((p) => ({ id: Number(p.productId), position: Number(p.position) }))
    .filter((p) => map.has(p.id) && !excluded.has(p.id))
    .sort((a, b) => a.position - b.position);
  const pinnedIds = new Set(pins.map((p) => p.id));
  const ranked = [];
  const seen = new Set();
  for (const id of (rankingIds || []).map(Number)) {
    if (seen.has(id) || excluded.has(id) || pinnedIds.has(id) || !map.has(id)) continue;
    seen.add(id);
    ranked.push(id);
  }
  const ordered = [...ranked];
  for (const p of pins) ordered.splice(Math.min(Math.max(p.position, 1) - 1, ordered.length), 0, p.id);
  return [...new Set(ordered)].slice(0, cfg.limit).map((id) => map.get(id));
}

// Colecciones con al menos un producto publicado (las vacías no se
// muestran), con su cantidad y la imagen de su primer producto con foto.
export function collectionsWithProducts(products, merch) {
  if (!merch || !Array.isArray(merch.collections)) return [];
  return merch.collections
    .map((c) => {
      const items = products.filter((p) => Array.isArray(p.collections) && p.collections.includes(c.id));
      const cover = items.find((p) => p.image);
      return { ...c, count: items.length, image: cover ? cover.image : null, coverProduct: cover || null };
    })
    .filter((c) => c.count > 0);
}

// Descubre tu VIBE: selecciones configuradas (categoría, colección o
// etiqueta) que tengan productos. Sin selecciones → null (la sección usa
// sus tarjetas de categoría de siempre).
export function descubrePicks(products, merch, { groupOfCategory = () => null, categoryOf = (p) => p.editorialCategory || p.category } = {}) {
  const picks = merch && merch.showcases && merch.showcases.descubre && Array.isArray(merch.showcases.descubre.picks) ? merch.showcases.descubre.picks : [];
  if (!picks.length) return null;
  const names = {
    collection: new Map((merch.collections || []).map((c) => [c.id, c.name])),
    tag: new Map((merch.tags || []).map((t) => [t.id, t.name])),
  };
  const out = [];
  for (const pick of picks) {
    let items = [];
    if (pick.type === "category") items = products.filter((p) => categoryOf(p) === pick.value);
    else if (pick.type === "collection") items = products.filter((p) => Array.isArray(p.collections) && p.collections.includes(pick.value));
    else if (pick.type === "tag") items = products.filter((p) => Array.isArray(p.tags) && p.tags.includes(pick.value));
    if (!items.length) continue;
    const label = pick.title || (pick.type === "category" ? pick.value : names[pick.type].get(pick.value)) || "";
    if (!label) continue;
    const cover = items.find((p) => p.image);
    out.push({ ...pick, label, group: pick.type === "category" ? groupOfCategory(pick.value) : null, image: cover ? cover.image : null, coverProduct: cover || null });
  }
  return out;
}

// Asigna a cada producto sus colecciones y etiquetas públicas.
export function attachMerchandising(products, merch) {
  const assignments = (merch && merch.assignments) || {};
  for (const p of products) {
    const a = assignments[p.id] || assignments[String(p.id)];
    p.collections = a ? [...a.collections] : [];
    p.tags = a ? [...a.tags] : [];
  }
  return products;
}
