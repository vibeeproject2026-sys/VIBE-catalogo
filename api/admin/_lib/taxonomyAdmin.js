// Fase 56 — administración de categorías y subcategorías VIBE.
// GET  /api/admin/products?resource=taxonomy → taxonomía + uso por producto
// POST /api/admin/products?resource=taxonomy → una acción explícita:
//   addCategory        { group, name }
//   renameCategory     { name, newName }            (actualiza las fichas que la usan)
//   setCategoryGroup   { name, group }
//   deleteCategory     { name, reassign? }           (si está en uso, exige destino)
//   addSubcategory     { category, name }
//   renameSubcategory  { category, name, newName }  (actualiza las fichas que la usan)
//   moveSubcategory    { category, name, toCategory } (las fichas se mueven con ella)
//   deleteSubcategory  { category, name, reassignTo? } (si está en uso, exige destino)
// Toda acción lleva `revision` (la que el Admin tenía a la vista).
//
// Reglas: nunca se reasigna nada por similitud ni de forma implícita; las
// fichas solo cambian en category/subcategory (nunca published, textos,
// imágenes ni datos del POS); valores históricos fuera de la taxonomía no se
// tocan. Primero se actualizan las fichas y después el documento: si algo
// falla a mitad, ningún dato se pierde (a lo sumo, un valor queda marcado
// como histórico en revisión).

const { pgrestSelect } = require("../../catalog/_lib/supabaseRead");
const { sendJson, sendError } = require("../../catalog/_lib/http");
const T = require("../../_lib/taxonomyStore");

async function loadUsage(env) {
  const [rows, products] = await Promise.all([
    pgrestSelect({ table: "catalog_metadata", columns: "product_id,category,subcategory,published", env }),
    pgrestSelect({ table: "products", columns: "id,name", env }),
  ]);
  const names = new Map(products.map((p) => [String(p.id), p.name]));
  return rows
    .filter((r) => r.category || r.subcategory)
    .map((r) => ({ id: r.product_id, name: names.get(String(r.product_id)) || `#${r.product_id}`, category: r.category || null, subcategory: r.subcategory || null, published: r.published === true }));
}

// Única escritura sobre fichas: category/subcategory de los ids indicados.
async function patchClassification(env, ids, fields, fetchImpl = fetch) {
  if (!ids.length) return;
  const body = {};
  if ("category" in fields) body.category = fields.category;
  if ("subcategory" in fields) body.subcategory = fields.subcategory;
  const res = await fetchImpl(`${env.url}/rest/v1/catalog_metadata?product_id=in.(${ids.map(Number).filter(Number.isInteger).join(",")})`, {
    method: "PATCH",
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`catalog_metadata PATCH failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
}

const fail = (status, error, extra = {}) => ({ fail: { status, error, ...extra } });

function findCategory(tax, name) {
  for (const g of tax.groups) {
    const c = g.categories.find((x) => x.name === name);
    if (c) return { group: g, category: c };
  }
  return null;
}
function categoryKeyTaken(tax, name, except) {
  const key = T.nameKey(name);
  return tax.groups.some((g) => g.categories.some((c) => c !== except && T.nameKey(c.name) === key));
}
function subKeyTaken(cat, name, exceptName) {
  const key = T.nameKey(name);
  return cat.subcategories.some((s) => s !== exceptName && T.nameKey(s) === key);
}

// Aplica la acción sobre una copia de la taxonomía y calcula qué fichas
// cambian. Devuelve { tax, changes: [{ ids, fields }], affected } o { fail }.
function planAction(current, body, usage) {
  const tax = JSON.parse(JSON.stringify(current));
  const a = body.action;
  const inCat = (name) => usage.filter((p) => p.category === name);
  const inSub = (cat, sub) => usage.filter((p) => p.category === cat && p.subcategory === sub);

  if (a === "addCategory") {
    const g = tax.groups.find((x) => x.group === body.group);
    if (!g) return fail(400, "Grupo inválido.");
    const v = T.validateName(body.name, "categoría");
    if (v.error) return fail(400, v.error);
    if (categoryKeyTaken(tax, v.name)) return fail(409, `Ya existe una categoría «${v.name}».`);
    g.categories.push({ name: v.name, subcategories: [] });
    return { tax, changes: [], affected: [] };
  }
  if (a === "renameCategory" || a === "setCategoryGroup" || a === "deleteCategory") {
    const found = findCategory(tax, body.name);
    if (!found) return fail(404, "Esa categoría no existe.");
    const used = inCat(found.category.name);
    if (a === "renameCategory") {
      const v = T.validateName(body.newName, "categoría");
      if (v.error) return fail(400, v.error);
      if (categoryKeyTaken(tax, v.name, found.category)) return fail(409, `Ya existe una categoría «${v.name}».`);
      const old = found.category.name;
      found.category.name = v.name;
      return { tax, changes: old === v.name ? [] : [{ ids: used.map((p) => p.id), fields: { category: v.name } }], affected: used };
    }
    if (a === "setCategoryGroup") {
      const target = tax.groups.find((x) => x.group === body.group);
      if (!target) return fail(400, "Grupo inválido.");
      if (target !== found.group) {
        found.group.categories = found.group.categories.filter((c) => c !== found.category);
        target.categories.push(found.category);
      }
      return { tax, changes: [], affected: used };
    }
    // deleteCategory
    if (used.length) {
      const r = body.reassign;
      if (!r || typeof r !== "object") return fail(409, "La categoría está en uso: elige a qué categoría pasan sus productos, o cancela.", { affected: used });
      const dest = findCategory(tax, r.category);
      if (!dest || dest.category === found.category) return fail(400, "Elige una categoría de destino distinta y existente.");
      const sub = r.subcategory ? String(r.subcategory) : null;
      if (sub && !dest.category.subcategories.includes(sub)) return fail(400, "Esa subcategoría no pertenece a la categoría de destino.");
      found.group.categories = found.group.categories.filter((c) => c !== found.category);
      return { tax, changes: [{ ids: used.map((p) => p.id), fields: { category: dest.category.name, subcategory: sub } }], affected: used };
    }
    found.group.categories = found.group.categories.filter((c) => c !== found.category);
    return { tax, changes: [], affected: [] };
  }
  if (["addSubcategory", "renameSubcategory", "moveSubcategory", "deleteSubcategory"].includes(a)) {
    const found = findCategory(tax, body.category);
    if (!found) return fail(404, "Esa categoría no existe.");
    const cat = found.category;
    if (a === "addSubcategory") {
      const v = T.validateName(body.name, "subcategoría");
      if (v.error) return fail(400, v.error);
      if (subKeyTaken(cat, v.name)) return fail(409, `«${v.name}» ya existe en ${cat.name}.`);
      cat.subcategories.push(v.name);
      return { tax, changes: [], affected: [] };
    }
    const idx = cat.subcategories.indexOf(body.name);
    if (idx === -1) return fail(404, "Esa subcategoría no existe en la categoría indicada.");
    const used = inSub(cat.name, body.name);
    if (a === "renameSubcategory") {
      const v = T.validateName(body.newName, "subcategoría");
      if (v.error) return fail(400, v.error);
      if (subKeyTaken(cat, v.name, body.name)) return fail(409, `«${v.name}» ya existe en ${cat.name}.`);
      cat.subcategories[idx] = v.name;
      return { tax, changes: body.name === v.name ? [] : [{ ids: used.map((p) => p.id), fields: { subcategory: v.name } }], affected: used };
    }
    if (a === "moveSubcategory") {
      const dest = findCategory(tax, body.toCategory);
      if (!dest || dest.category === cat) return fail(400, "Elige una categoría de destino distinta y existente.");
      if (subKeyTaken(dest.category, body.name)) return fail(409, `«${body.name}» ya existe en ${dest.category.name}.`);
      cat.subcategories.splice(idx, 1);
      dest.category.subcategories.push(body.name);
      return { tax, changes: [{ ids: used.map((p) => p.id), fields: { category: dest.category.name } }], affected: used };
    }
    // deleteSubcategory
    if (used.length) {
      if (!("reassignTo" in body)) return fail(409, "La subcategoría está en uso: elige a qué subcategoría pasan sus productos (o «sin subcategoría»), o cancela.", { affected: used });
      const to = body.reassignTo === "" || body.reassignTo === null ? null : String(body.reassignTo);
      if (to !== null && (to === body.name || !cat.subcategories.includes(to))) return fail(400, "Elige una subcategoría de destino de la misma categoría.");
      cat.subcategories.splice(idx, 1);
      return { tax, changes: [{ ids: used.map((p) => p.id), fields: { subcategory: to } }], affected: used };
    }
    cat.subcategories.splice(idx, 1);
    return { tax, changes: [], affected: [] };
  }
  // Fase 57 — orden: sube o baja una posición una categoría (dentro de su
  // grupo) o una subcategoría (dentro de su categoría). Es el orden de la
  // navegación pública y del Admin; ningún producto cambia.
  if (a === "reorderCategory" || a === "reorderSubcategory") {
    if (body.direction !== -1 && body.direction !== 1) return fail(400, "Dirección inválida.");
    const found = findCategory(tax, a === "reorderCategory" ? body.name : body.category);
    if (!found) return fail(404, "Esa categoría no existe.");
    const list = a === "reorderCategory" ? found.group.categories : found.category.subcategories;
    const i = a === "reorderCategory" ? list.indexOf(found.category) : list.indexOf(body.name);
    if (i === -1) return fail(404, "Esa subcategoría no existe en la categoría indicada.");
    const j = i + body.direction;
    if (j < 0 || j >= list.length) return fail(400, "Ya está en el extremo; no se cambió nada.");
    [list[i], list[j]] = [list[j], list[i]];
    return { tax, changes: [], affected: [] };
  }
  return fail(400, "Acción inválida.");
}

async function handleTaxonomy(req, res, env) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    try {
      const [taxonomy, usage] = await Promise.all([T.loadTaxonomy(env), loadUsage(env)]);
      return sendJson(res, 200, { taxonomy, usage });
    } catch (e) {
      console.error("[admin/taxonomy] lectura fallida (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
      return sendError(res, 502, "No se pudo cargar la clasificación.");
    }
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!Number.isInteger(body.revision) || body.revision < 0) return sendError(res, 400, "Falta la revisión de la clasificación (recarga la página).");

  let current;
  let usage;
  try {
    [current, usage] = await Promise.all([T.loadTaxonomyAtLeast(env, body.revision), loadUsage(env)]);
  } catch (e) {
    console.error("[admin/taxonomy] lectura fallida (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
    return sendError(res, 502, "No se pudo cargar la clasificación. No se cambió nada.");
  }
  if (current.revision > body.revision) return sendError(res, 409, "La clasificación cambió mientras la editabas. Recarga y vuelve a intentarlo. No se cambió nada.");
  if (current.revision < body.revision) return sendError(res, 503, "El último cambio aún se está propagando. Intenta de nuevo en unos segundos. No se cambió nada.");

  const plan = planAction(current, body, usage);
  if (plan.fail) return sendJson(res, plan.fail.status, plan.fail);

  try {
    for (const c of plan.changes) await patchClassification(env, c.ids, c.fields);
  } catch (e) {
    console.error("[admin/taxonomy] no se pudieron actualizar las fichas (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
    return sendError(res, 502, "No se pudieron actualizar los productos afectados. La lista no se modificó; revisa y reintenta.");
  }

  const next = { ...plan.tax, revision: current.revision + 1, updatedAt: new Date().toISOString() };
  try {
    await T.saveTaxonomy(env, next);
  } catch (e) {
    console.error("[admin/taxonomy] no se pudo guardar el documento (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
    return sendJson(res, 502, {
      error: plan.changes.length ? "Los productos se actualizaron, pero la lista no se pudo guardar: reintenta la misma acción." : "No se pudo guardar la clasificación. Reintenta.",
      productsUpdated: plan.changes.length > 0,
    });
  }
  console.log(`[admin/taxonomy] ${String(body.action).slice(0, 30)} aplicada (revisión ${next.revision}, ${plan.affected.length} producto(s) afectados).`);
  let freshUsage = usage;
  try { freshUsage = await loadUsage(env); } catch { /* el Admin recargará */ }
  return sendJson(res, 200, { taxonomy: next, usage: freshUsage, affected: plan.affected.map((p) => p.id) });
}

module.exports = { handleTaxonomy, planAction, patchClassification, loadUsage };
