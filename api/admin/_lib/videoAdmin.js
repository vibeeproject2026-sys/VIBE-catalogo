// Videos de producto — Admin. Vive en /api/admin/product-images?resource=video
// (sin sumar funciones serverless). El archivo NUNCA pasa por Vercel: el
// servidor entrega URLs firmadas de subida de un solo uso (Supabase Storage)
// y el navegador sube directo. Las credenciales nunca llegan al navegador.
//
// GET    ?resource=video&product_id=N  → { video, settings, usage }
// POST   ?resource=video  { action: "sign", product_id, size, posterSize } → { uploads: { video, poster } }
// POST   ?resource=video  { action: "publish", product_id, path, posterPath, width, height, duration } → { video }
// POST   ?resource=video  { action: "settings", settings } → { settings }
// DELETE ?resource=video&product_id=N  → elimina el video publicado (archivos + manifiesto)

const { pgrestSelect } = require("../../catalog/_lib/supabaseRead");
const { sendJson, sendError } = require("../../catalog/_lib/http");
const { publicUrl, deleteObject } = require("./storage");
const V = require("../../_lib/productVideos");

const BUCKET = "product-images";
const MAX_FILE = 50 * 1024 * 1024; // límite por archivo del plan gratuito de Supabase
const QUOTA = 1024 * 1024 * 1024; // 1 GB del plan gratuito
const QUOTA_BLOCK = 0.95; // no se inicia una subida que deje el almacenamiento por encima del 95 %
const MAX_POSTER = 2 * 1024 * 1024;

const headers = (env) => ({ apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` });

// Uso total del bucket (suma de tamaños, recorriendo carpetas). Caché de 10 min.
let usageCache = null;
async function storageUsage(env, { force = false } = {}) {
  if (!force && usageCache && Date.now() - usageCache.at < 10 * 60 * 1000) return usageCache.bytes;
  let bytes = 0;
  const queue = [""];
  let guard = 0;
  while (queue.length && guard++ < 2000) {
    const batch = queue.splice(0, 8);
    await Promise.all(batch.map(async (prefix) => {
      for (let offset = 0; ; offset += 1000) {
        const r = await fetch(`${env.url}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers: { ...headers(env), "Content-Type": "application/json" }, body: JSON.stringify({ prefix, limit: 1000, offset }) });
        if (!r.ok) throw new Error("list " + r.status);
        const items = await r.json();
        for (const it of items) {
          if (it.id === null) queue.push(prefix ? `${prefix}/${it.name}` : it.name);
          else bytes += Number(it.metadata && it.metadata.size) || 0;
        }
        if (items.length < 1000) break;
      }
    }));
  }
  usageCache = { at: Date.now(), bytes };
  return bytes;
}

async function productExists(env, id) {
  const rows = await pgrestSelect({ table: "products", columns: "id", filters: [["id", `eq.${id}`]], env });
  return rows.length === 1;
}

async function signUpload(env, path) {
  const r = await fetch(`${env.url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: { ...headers(env), "Content-Type": "application/json" }, body: "{}" });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body || !body.url) throw new Error("sign " + r.status);
  return `${env.url}/storage/v1${body.url}`;
}

async function headSize(url) {
  const r = await fetch(url + "?v=" + Date.now(), { method: "HEAD" });
  return r.ok ? Number(r.headers.get("content-length")) || 0 : 0;
}

function usageInfo(bytes) {
  return { bytes, quota: QUOTA, ratio: bytes / QUOTA, warning: bytes / QUOTA >= 0.8, maxFile: MAX_FILE };
}

async function handleVideo(req, res, env) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  try {
    if (req.method === "GET") {
      const id = Number(q.product_id);
      const manifest = await V.loadVideos(env);
      let usage = null;
      try { usage = usageInfo(await storageUsage(env)); } catch { usage = null; }
      return sendJson(res, 200, { video: Number.isInteger(id) ? manifest.videos[id] || null : null, settings: manifest.settings, usage });
    }
    if (req.method === "DELETE") {
      const id = Number(q.product_id);
      if (!Number.isInteger(id)) return sendError(res, 400, "product_id inválido.");
      const manifest = await V.loadVideos(env);
      const old = manifest.videos[id];
      if (!old) return sendJson(res, 200, { video: null });
      delete manifest.videos[id];
      manifest.revision++;
      await V.saveVideos(env, manifest);
      await Promise.all([deleteObject({ env, path: old.path }), deleteObject({ env, path: old.posterPath })]);
      usageCache = null;
      return sendJson(res, 200, { video: null });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.action === "settings") {
      const manifest = await V.loadVideos(env);
      manifest.settings = V.sanitizeSettings(body.settings);
      manifest.revision++;
      await V.saveVideos(env, manifest);
      return sendJson(res, 200, { settings: manifest.settings });
    }
    const id = Number(body.product_id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, 400, "product_id inválido.");
    if (!(await productExists(env, id))) return sendError(res, 404, "El producto no existe.");

    if (body.action === "sign") {
      const size = Number(body.size), posterSize = Number(body.posterSize);
      if (!Number.isFinite(size) || size <= 0) return sendError(res, 400, "Tamaño de video inválido.");
      if (size > MAX_FILE) return sendError(res, 413, "El video optimizado supera 50 MB, el límite por archivo del almacenamiento. Usa calidad Equilibrada, 720p o un tramo más corto.");
      if (!Number.isFinite(posterSize) || posterSize <= 0 || posterSize > MAX_POSTER) return sendError(res, 400, "Miniatura inválida.");
      let used = null;
      try { used = await storageUsage(env, { force: true }); } catch { used = null; }
      if (used === null) return sendError(res, 503, "No se pudo comprobar el espacio disponible. Intenta de nuevo.");
      if (used + size + posterSize > QUOTA * QUOTA_BLOCK) return sendError(res, 507, `No hay espacio suficiente: el almacenamiento está en ${(used / 1048576).toFixed(0)} MB de 1024 MB.`);
      const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `videos/${id}/${stamp}.mp4`, posterPath = `videos/${id}/${stamp}.webp`;
      const [videoUrl, posterUrl] = await Promise.all([signUpload(env, path), signUpload(env, posterPath)]);
      return sendJson(res, 200, { uploads: { video: { path, url: videoUrl }, poster: { path: posterPath, url: posterUrl } }, usage: usageInfo(used) });
    }

    if (body.action === "publish") {
      const path = String(body.path || ""), posterPath = String(body.posterPath || "");
      if (!V.VIDEO_PATH_RE.test(path) || !V.VIDEO_PATH_RE.test(posterPath) || !path.startsWith(`videos/${id}/`) || !posterPath.startsWith(`videos/${id}/`) || !path.endsWith(".mp4") || !posterPath.endsWith(".webp")) return sendError(res, 400, "Rutas inválidas.");
      const url = publicUrl(env, path), poster = publicUrl(env, posterPath);
      const [size, posterBytes] = await Promise.all([headSize(url), headSize(poster)]);
      if (!size || !posterBytes) return sendError(res, 409, "El archivo no terminó de subir. Intenta de nuevo.");
      if (size > MAX_FILE) { await deleteObject({ env, path }); return sendError(res, 413, "El video supera 50 MB."); }
      const manifest = await V.loadVideos(env);
      const old = manifest.videos[id];
      const video = V.publicVideo({ url, poster, width: body.width, height: body.height, duration: body.duration });
      const clean = V.sanitizeManifest({ videos: { [id]: { ...video, path, posterPath, size, publishedAt: new Date().toISOString() } } }, env).videos[id];
      if (!clean) return sendError(res, 400, "Datos del video inválidos.");
      manifest.videos[id] = clean;
      manifest.revision++;
      await V.saveVideos(env, manifest);
      // Reemplazo: el video anterior se elimina solo después de publicar el nuevo.
      if (old && old.path !== path) await Promise.all([deleteObject({ env, path: old.path }), deleteObject({ env, path: old.posterPath })]);
      usageCache = null;
      return sendJson(res, 200, { video: clean });
    }
    return sendError(res, 400, "Acción no válida.");
  } catch (e) {
    console.error("[admin/video] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo completar la operación de video.");
  }
}

module.exports = { handleVideo, storageUsage, usageInfo, MAX_FILE, QUOTA };
