// Videos de producto — manifiesto en Storage (config/product-videos.json),
// mismo patrón que config/image-variants.json: sin tablas ni migraciones.
//
// { revision, updatedAt,
//   settings: { maxDuration: 15–120 s (30), quality: "high"|"balanced", maxHeight: 720|1080 },
//   videos: { "<productId>": { url, poster, path, posterPath, width, height, duration, size, publishedAt } } }
//
// Solo se publican versiones OPTIMIZADAS (MP4 H.264 codificado en el
// navegador del Admin); el original nunca sale del computador de la
// propietaria. Los archivos viven en `videos/<productId>/` del bucket.

const { downloadObject, uploadObject, isOwnedPath } = require("../admin/_lib/storage");

const MANIFEST_PATH = "config/product-videos.json";
const DEFAULT_SETTINGS = { maxDuration: 30, quality: "high", maxHeight: 1080 };
const VIDEO_PATH_RE = /^videos\/\d{1,9}\/[a-z0-9-]{6,40}\.(mp4|webp)$/;

function sanitizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const d = Number(s.maxDuration);
  return {
    maxDuration: Number.isInteger(d) && d >= 15 && d <= 120 ? d : DEFAULT_SETTINGS.maxDuration,
    quality: s.quality === "balanced" ? "balanced" : "high",
    maxHeight: Number(s.maxHeight) === 720 ? 720 : 1080,
  };
}

function sanitizeVideo(v, env) {
  if (!v || typeof v !== "object") return null;
  if (!VIDEO_PATH_RE.test(String(v.path || "")) || !VIDEO_PATH_RE.test(String(v.posterPath || ""))) return null;
  if (!isOwnedPath(env, v.url) || !isOwnedPath(env, v.poster)) return null;
  const n = (x, lo, hi) => (Number.isFinite(Number(x)) && Number(x) >= lo && Number(x) <= hi ? Number(x) : null);
  const width = n(v.width, 16, 4096), height = n(v.height, 16, 4096), duration = n(v.duration, 0.5, 130), size = n(v.size, 1, 50 * 1024 * 1024);
  if (!width || !height || !duration || !size) return null;
  return { url: v.url, poster: v.poster, path: v.path, posterPath: v.posterPath, width: Math.round(width), height: Math.round(height), duration: Math.round(duration * 10) / 10, size: Math.round(size), publishedAt: typeof v.publishedAt === "string" ? v.publishedAt : null };
}

function sanitizeManifest(raw, env) {
  const r = raw && typeof raw === "object" ? raw : {};
  const videos = {};
  for (const [id, v] of Object.entries(r.videos && typeof r.videos === "object" ? r.videos : {})) {
    if (!/^\d{1,9}$/.test(id)) continue;
    const clean = sanitizeVideo(v, env);
    if (clean) videos[id] = clean;
  }
  return { revision: Number.isInteger(r.revision) && r.revision >= 0 ? r.revision : 0, updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null, settings: sanitizeSettings(r.settings), videos };
}

async function loadVideos(env) {
  try {
    const buffer = await downloadObject({ env, path: MANIFEST_PATH });
    return sanitizeManifest(buffer ? JSON.parse(buffer.toString("utf8")) : {}, env);
  } catch {
    console.error("[product-videos] manifiesto no disponible; las fichas se muestran sin video.");
    return sanitizeManifest({}, env);
  }
}

async function saveVideos(env, manifest) {
  const doc = { revision: manifest.revision, updatedAt: new Date().toISOString(), settings: manifest.settings, videos: manifest.videos };
  await uploadObject({ env, path: MANIFEST_PATH, buffer: Buffer.from(JSON.stringify(doc, null, 2), "utf8"), contentType: "application/json" });
  return doc;
}

// Lo que ve la tienda (solo datos de reproducción).
function publicVideo(v) {
  return v ? { url: v.url, poster: v.poster, width: v.width, height: v.height, duration: v.duration } : null;
}

module.exports = { MANIFEST_PATH, DEFAULT_SETTINGS, VIDEO_PATH_RE, sanitizeSettings, sanitizeManifest, loadVideos, saveVideos, publicVideo };
