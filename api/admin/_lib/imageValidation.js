// Pure, dependency-free image validation: allowed type, size ceiling,
// and dimensions read directly from the file's own binary header (no
// image-processing library — see docs/fase21-storage-imagenes.md for why
// automatic WebP conversion/resizing was deliberately deferred instead of
// adding a native dependency like sharp to a project that has none).

const ALLOWED_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

// Hard ceiling on upload size. Well under Vercel's ~4.5MB request body
// limit once base64-encoded (~+33%): 3MB raw -> ~4MB as base64 JSON body.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

// Soft target from the VIBE visual standard (informational only, never
// blocks an upload — "no bloquear innecesariamente archivos válidos que
// puedan optimizarse en backend").
const TARGET_MAX_BYTES = 300 * 1024;

// Hard floor for the main image ("mínimo aceptable: 800x1000").
const MAIN_MIN_WIDTH = 800;
const MAIN_MIN_HEIGHT = 1000;

// Secondary images (detail/texture/angle shots) aren't held to the same
// vertical-product-shot floor — just enough to reject accidental
// thumbnails/icons.
const SECONDARY_MIN_WIDTH = 400;
const SECONDARY_MIN_HEIGHT = 400;

const RECOMMENDED_RATIO = 4 / 5; // width/height, vertical
const RATIO_TOLERANCE = 0.05;

function extensionForType(contentType) {
  return ALLOWED_TYPES[contentType] || null;
}

// Accepts either a raw base64 string or a data: URL (data:image/webp;base64,....)
function decodeBase64Image(dataBase64) {
  if (typeof dataBase64 !== "string" || !dataBase64) {
    throw new Error("dataBase64 vacío o inválido.");
  }
  const commaIdx = dataBase64.indexOf(",");
  const raw = dataBase64.startsWith("data:") && commaIdx !== -1 ? dataBase64.slice(commaIdx + 1) : dataBase64;
  return Buffer.from(raw, "base64");
}

function readPngDimensions(buf) {
  if (buf.length < 24) return null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPng) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readJpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) break; // EOI
    const segLen = buf.readUInt16BE(offset + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (offset + 9 > buf.length) return null;
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + segLen;
  }
  return null;
}

function readWebpDimensions(buf) {
  if (buf.length < 30) return null;
  const isRiff = buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  if (!isRiff) return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  if (chunk === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunk === "VP8L") {
    if (buf.length < 25) return null;
    const value = buf.readUInt32LE(21);
    const width = (value & 0x3fff) + 1;
    const height = ((value >>> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}

function readImageDimensions(buffer, contentType) {
  if (contentType === "image/png") return readPngDimensions(buffer);
  if (contentType === "image/jpeg") return readJpegDimensions(buffer);
  if (contentType === "image/webp") return readWebpDimensions(buffer);
  return null;
}

// slot: "main" | "secondary" — the two callers this project has; the
// minimums and the aspect-ratio recommendation differ between them.
function validateUpload({ contentType, buffer, slot }) {
  const errors = [];
  const warnings = [];

  const ext = extensionForType(contentType);
  if (!ext) {
    errors.push("Tipo de archivo no permitido. Usa WebP, JPEG o PNG.");
    return { ok: false, errors, warnings, ext: null };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    errors.push("Archivo vacío o inválido.");
    return { ok: false, errors, warnings, ext };
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    errors.push(
      `El archivo pesa ${(buffer.length / 1024 / 1024).toFixed(1)}MB; el máximo permitido es ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB.`
    );
  }

  const dimensions = readImageDimensions(buffer, contentType);
  if (!dimensions) {
    errors.push("No se pudieron leer las dimensiones de la imagen; el archivo puede estar corrupto.");
  } else {
    const minWidth = slot === "main" ? MAIN_MIN_WIDTH : SECONDARY_MIN_WIDTH;
    const minHeight = slot === "main" ? MAIN_MIN_HEIGHT : SECONDARY_MIN_HEIGHT;
    if (dimensions.width < minWidth || dimensions.height < minHeight) {
      errors.push(
        `La imagen es de ${dimensions.width}x${dimensions.height}px; el mínimo para ${
          slot === "main" ? "la imagen principal" : "una imagen secundaria"
        } es ${minWidth}x${minHeight}px.`
      );
    }
    if (slot === "main" && dimensions.height > 0) {
      const ratio = dimensions.width / dimensions.height;
      if (Math.abs(ratio - RECOMMENDED_RATIO) > RATIO_TOLERANCE) {
        warnings.push(`Proporción recomendada 4:5 vertical; esta imagen es ${dimensions.width}x${dimensions.height}px.`);
      }
    }
  }

  if (buffer.length <= MAX_UPLOAD_BYTES && buffer.length > TARGET_MAX_BYTES) {
    warnings.push(`El archivo pesa más del peso objetivo (${Math.round(TARGET_MAX_BYTES / 1024)}KB); considera optimizarlo.`);
  }

  return { ok: errors.length === 0, errors, warnings, dimensions, ext, bytes: buffer.length };
}

module.exports = {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  TARGET_MAX_BYTES,
  MAIN_MIN_WIDTH,
  MAIN_MIN_HEIGHT,
  SECONDARY_MIN_WIDTH,
  SECONDARY_MIN_HEIGHT,
  extensionForType,
  decodeBase64Image,
  readImageDimensions,
  validateUpload,
};
