// Purpose-built Supabase Storage client for catalog product images.
// Mirrors the discipline of _lib/adminWrite.js and
// catalog/_lib/supabaseRead.js: the bucket is a hardcoded literal, never
// taken from the request, and every path this module writes to is under
// the fixed "products/{id}/" prefix built by buildMainPath /
// buildSecondaryPath — there is no way to reach an arbitrary bucket or
// path from caller input. This is not a generic Storage proxy.
//
// Bucket: reuses the existing "product-images" bucket (confirmed empty,
// public, already present in the project's Supabase instance) instead of
// creating a new one — see docs/fase21-storage-imagenes.md.

const BUCKET = "product-images";

function buildMainPath(productId, ext) {
  return `products/${productId}/main.${ext}`;
}

function buildSecondaryPath(productId, ext, seq) {
  return `products/${productId}/${String(seq).padStart(2, "0")}.${ext}`;
}

function publicUrl(env, path) {
  return `${env.url}/storage/v1/object/public/${BUCKET}/${path}`;
}

function publicUrlPrefix(env) {
  return `${env.url}/storage/v1/object/public/${BUCKET}/`;
}

// True only for a URL we ourselves generated (our bucket, our project).
// Used before ever attempting to delete a Storage object, so a legacy or
// external image (e.g. assets/products/brush.svg, or a manually pasted
// URL) is never touched.
function isOwnedPath(env, url) {
  return typeof url === "string" && url.startsWith(publicUrlPrefix(env));
}

function pathFromUrl(env, url) {
  const prefix = publicUrlPrefix(env);
  return typeof url === "string" && url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

// Next unused secondary sequence number, scanning existing images for the
// highest one already in use (not just array length) — avoids colliding
// with an existing file after a secondary image was deleted out of order.
function nextSecondarySeq(env, currentImages) {
  let max = 0;
  for (const url of currentImages) {
    const path = pathFromUrl(env, url);
    if (!path) continue;
    const m = path.match(/\/(\d+)\.[a-z0-9]+$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

async function uploadObject({ env, path, buffer, contentType, fetchImpl = fetch }) {
  const res = await fetchImpl(`${env.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error("Supabase Storage upload failed (HTTP " + res.status + ")" + (text ? ": " + text.slice(0, 200) : ""));
    err.status = res.status;
    err.code = "STORAGE_UPLOAD_FAILED";
    throw err;
  }
  return publicUrl(env, path);
}

// Best-effort delete — callers treat failure as non-fatal cleanup, never
// as a reason to fail a request whose metadata update already succeeded.
async function deleteObject({ env, path, fetchImpl = fetch }) {
  const res = await fetchImpl(`${env.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
    },
  });
  return res.ok;
}

// Fase 33 — lectura autenticada directa (no la URL pública/CDN, que
// puede quedar en caché justo después de un write): usada por
// _lib/heroSlides.js para leer el manifiesto JSON de slides antes de
// modificarlo. Devuelve null si el objeto no existe todavía — nunca
// lanza para ese caso, que es el estado esperado antes del primer slide
// creado.
//
// Confirmado contra Storage real (no solo documentación): un objeto
// inexistente responde HTTP 400, NO 404 — el "404" real viaja como
// string dentro del cuerpo JSON (statusCode/code: "NoSuchKey"). Se
// inspecciona el cuerpo además del status HTTP para no tratar un
// "no existe todavía" como un error real.
async function downloadObject({ env, path, fetchImpl = fetch }) {
  const res = await fetchImpl(`${env.url}/storage/v1/object/${BUCKET}/${path}`, {
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (body && (body.code === "NoSuchKey" || String(body.statusCode) === "404" || body.error === "not_found")) {
      return null;
    }
    const err = new Error("Supabase Storage download failed (HTTP " + res.status + ")" + (text ? ": " + text.slice(0, 200) : ""));
    err.status = res.status;
    err.code = "STORAGE_DOWNLOAD_FAILED";
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

module.exports = {
  BUCKET,
  buildMainPath,
  buildSecondaryPath,
  publicUrl,
  isOwnedPath,
  pathFromUrl,
  nextSecondarySeq,
  uploadObject,
  deleteObject,
  downloadObject,
};
