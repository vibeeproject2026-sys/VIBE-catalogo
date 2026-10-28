// Fase 57 — versiones optimizadas de imágenes (WebP por ancho), sin tocar
// los originales ni las referencias guardadas en catalog_metadata/slides.
//
// Fuente: un manifiesto en el bucket ya existente ("config/image-variants.json",
// mismo patrón que config/taxonomy.json y hero/slides.json). Lo genera
// scripts/images/optimize-images.cjs y se sube solo con autorización (ver
// docs/fase57-optimizacion-imagenes.md). Forma:
//   { "version": 1, "images": { "<URL pública del original>": [ { "url": "<URL .webp>", "width": 640 }, … ] } }
//
// Mientras el manifiesto no exista (o sea ilegible, o Storage falle), no se
// agrega nada: el sitio usa exactamente los originales, como antes. Solo se
// aceptan URLs de nuestro propio bucket, .webp, anchos enteros razonables;
// nunca una URL que no esté en el manifiesto. El navegador vuelve al
// original si una versión optimizada falla al cargar (js/app.js).

const { downloadObject, isOwnedPath } = require("../admin/_lib/storage");

const MANIFEST_PATH = "config/image-variants.json";
const MAX_VARIANTS = 8;

// → Map(URL original → atributo srcset listo para usar)
function sanitizeManifest(raw, env) {
  const out = new Map();
  const images = raw && typeof raw === "object" && raw.images && typeof raw.images === "object" ? raw.images : {};
  for (const [original, list] of Object.entries(images)) {
    if (!isOwnedPath(env, original) || !Array.isArray(list)) continue;
    const seen = new Set();
    const variants = list
      .filter((v) => v && typeof v.url === "string" && isOwnedPath(env, v.url) && /\.webp$/i.test(v.url) && !/[\s,]/.test(v.url) && Number.isInteger(v.width) && v.width >= 16 && v.width <= 4000)
      .filter((v) => (seen.has(v.width) ? false : seen.add(v.width)))
      .sort((a, b) => a.width - b.width)
      .slice(0, MAX_VARIANTS);
    if (variants.length) out.set(original, variants.map((v) => `${v.url} ${v.width}w`).join(", "));
  }
  return out;
}

async function loadImageVariants(env) {
  try {
    const buffer = await downloadObject({ env, path: MANIFEST_PATH });
    if (!buffer) return new Map();
    return sanitizeManifest(JSON.parse(buffer.toString("utf8")), env);
  } catch (e) {
    console.error("[image-variants] manifiesto no disponible; se usan los originales.");
    return new Map();
  }
}

function srcsetFor(map, url) {
  return (url && map && map.get(url)) || null;
}

module.exports = { MANIFEST_PATH, sanitizeManifest, loadImageVariants, srcsetFor };
