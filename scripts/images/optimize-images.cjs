#!/usr/bin/env node
// Fase 57 — genera versiones optimizadas (WebP) de imágenes ORIGINALES sin
// tocarlas, y un inventario verificable. Solo trabaja en disco local: nunca
// sube nada ni modifica referencias (eso requiere autorización aparte, ver
// docs/fase57-optimizacion-imagenes.md).
//
// Uso:
//   node scripts/images/optimize-images.cjs --in <carpeta originales> --out <carpeta salida> --kind hero|product|logo [--ref-prefix <ruta en Storage>]
//
// Requiere `sharp` (no es dependencia del sitio): instálalo fuera del repo,
// p. ej. `npm i --no-save sharp` en una carpeta temporal, y ejecútalo con
// NODE_PATH apuntando a su node_modules.
//
// Reglas:
// - El original se lee en modo solo lectura; se registra su sha256 antes y
//   después para demostrar que no cambió.
// - Nunca se agranda una imagen; se generan solo anchos ≤ ancho original.
// - Fidelidad: cada WebP se decodifica y se compara contra el original
//   reducido al mismo tamaño (SSIM ≥ 0,985 y PSNR ≥ 36 dB en fotos; idéntico
//   píxel a píxel en logos sin pérdida). Si no alcanza el umbral subiendo la calidad hasta 95, se descarta y el
//   original queda como excepción documentada.
// - Fotografías (hero/product): WebP con pérdida de alta calidad y
//   sharp_yuv (mejor color en bordes saturados: labiales, empaques). Logos:
//   WebP sin pérdida (transparencia y bordes exactos).
// - Sin recortes, sin recolor, sin filtros: solo cambio de tamaño
//   (lanczos3) y codificación.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const KINDS = {
  // Ancho visible máximo (CSS) × 2 para pantallas de alta densidad.
  hero: { widths: [640, 1024, 1672], lossless: false, quality: 82, minSsim: 0.985, minPsnr: 36 },
  product: { widths: [480, 800, 1200], lossless: false, quality: 82, minSsim: 0.985, minPsnr: 36 },
  logo: { widths: [null], lossless: true, quality: 100, minSsim: 1, minPsnr: Infinity },
};

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Fidelidad sobre píxeles premultiplicados por su alfa (el color de un
// píxel totalmente transparente es invisible y no cuenta):
// - PSNR (error medio, dB) sobre RGB premultiplicado + alfa;
// - SSIM (similitud estructural, 0–1) sobre luminancia, ventanas 8×8 con
//   paso 4 — mide lo que el ojo nota (bordes, texturas) mejor que el PSNR,
//   que castiga el grano fino de una foto aunque no se perciba.
async function fidelity(aBuf, bBuf, width, height, channels) {
  const [a, b] = await Promise.all([
    sharp(aBuf).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
    sharp(bBuf).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
  ]);
  const px = width * height;
  const ya = new Float64Array(px);
  const yb = new Float64Array(px);
  let se = 0;
  let n = 0;
  for (let p = 0, i = 0; p < px; p++, i += 4) {
    const aa = a[i + 3] / 255;
    const ab = b[i + 3] / 255;
    const ra = [a[i] * aa, a[i + 1] * aa, a[i + 2] * aa, a[i + 3]];
    const rb = [b[i] * ab, b[i + 1] * ab, b[i + 2] * ab, b[i + 3]];
    for (let c = 0; c < (channels === 4 ? 4 : 3); c++) {
      const d = ra[c] - rb[c];
      se += d * d;
      n++;
    }
    ya[p] = 0.299 * ra[0] + 0.587 * ra[1] + 0.114 * ra[2];
    yb[p] = 0.299 * rb[0] + 0.587 * rb[1] + 0.114 * rb[2];
  }
  const mse = se / n;
  const psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let sum = 0;
  let windows = 0;
  for (let y = 0; y + 8 <= height; y += 4) {
    for (let x = 0; x + 8 <= width; x += 4) {
      let ma = 0, mb = 0;
      for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) { const q = (y + j) * width + x + k; ma += ya[q]; mb += yb[q]; }
      ma /= 64; mb /= 64;
      let va = 0, vb = 0, cov = 0;
      for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) { const q = (y + j) * width + x + k; const da = ya[q] - ma; const db = yb[q] - mb; va += da * da; vb += db * db; cov += da * db; }
      va /= 63; vb /= 63; cov /= 63;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      windows++;
    }
  }
  return { psnr, ssim: windows ? sum / windows : 1 };
}
const passes = (f, kind) => (kind.lossless ? f.psnr === Infinity : f.ssim >= kind.minSsim && f.psnr >= kind.minPsnr);

async function main() {
  const a = args(process.argv.slice(2));
  const kind = KINDS[a.kind];
  if (!a.in || !a.out || !kind) {
    console.error("Uso: --in <dir> --out <dir> --kind hero|product|logo [--ref-prefix <ruta>]");
    process.exit(2);
  }
  fs.mkdirSync(a.out, { recursive: true });
  const files = fs.readdirSync(a.in).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  const inventory = [];
  for (const f of files) {
    const src = path.join(a.in, f);
    const original = fs.readFileSync(src);
    const before = sha256(original);
    const meta = await sharp(original).metadata();
    const channels = meta.hasAlpha ? 4 : 3;
    const entry = {
      original: (a["ref-prefix"] ? a["ref-prefix"].replace(/\/$/, "") + "/" : "") + f,
      originalSha256: before,
      originalFormat: meta.format,
      originalSize: original.length,
      width: meta.width,
      height: meta.height,
      hasAlpha: Boolean(meta.hasAlpha),
      variants: [],
      exception: null,
    };
    const widths = [...new Set(kind.widths.map((w) => (w == null ? meta.width : Math.min(w, meta.width))))];
    for (const w of widths) {
      const h = Math.round((meta.height * w) / meta.width);
      const base = sharp(original).resize(w, h, { fit: "fill", kernel: "lanczos3" });
      const reference = await base.clone().png().toBuffer();
      let q = kind.quality;
      let out;
      let fid;
      for (;;) {
        out = await base.clone().webp(kind.lossless ? { lossless: true, exact: true, effort: 6 } : { quality: q, effort: 6, smartSubsample: true, alphaQuality: 100 }).toBuffer();
        fid = await fidelity(reference, out, w, h, channels);
        if (passes(fid, kind) || kind.lossless || q >= 95) break;
        q = Math.min(95, q + 4);
      }
      if (!passes(fid, kind)) {
        entry.exception = `SSIM ${fid.ssim.toFixed(4)} / PSNR ${fid.psnr.toFixed(1)} dB a ${w}px no alcanza el umbral (SSIM ≥ ${kind.minSsim}, PSNR ≥ ${kind.minPsnr}) ni con calidad 95: se conserva el original`;
        entry.variants = [];
        break;
      }
      const stem = f.replace(/\.[^.]+$/, "");
      const name = `${stem}.opt-${w}w.webp`;
      fs.writeFileSync(path.join(a.out, name), out);
      entry.variants.push({ file: name, format: "webp", width: w, height: h, size: out.length, quality: kind.lossless ? "lossless" : q, psnr: fid.psnr === Infinity ? "exacto" : Number(fid.psnr.toFixed(1)), ssim: Number(fid.ssim.toFixed(4)), sha256: sha256(out) });
    }
    const after = sha256(fs.readFileSync(src));
    if (after !== before) throw new Error(`El original cambió durante el proceso: ${f}`);
    entry.originalUnchanged = true;
    // Peso que se descargaría con la versión de mayor ancho (el peor caso:
    // escritorio de alta densidad) frente al original.
    const largest = entry.variants[entry.variants.length - 1];
    entry.reductionLargestPct = largest ? Number((100 * (1 - largest.size / entry.originalSize)).toFixed(1)) : 0;
    inventory.push(entry);
    console.log(`${f}: ${entry.originalSize} B → ${entry.variants.map((v) => `${v.width}w ${v.size} B (q${v.quality}, SSIM ${v.ssim}, ${v.psnr} dB)`).join(", ") || entry.exception}`);
  }
  const totals = {
    images: inventory.length,
    processed: inventory.filter((e) => e.variants.length).length,
    exceptions: inventory.filter((e) => e.exception).length,
    originalBytes: inventory.reduce((s, e) => s + e.originalSize, 0),
    optimizedLargestBytes: inventory.reduce((s, e) => s + (e.variants.length ? e.variants[e.variants.length - 1].size : e.originalSize), 0),
  };
  totals.savedBytes = totals.originalBytes - totals.optimizedLargestBytes;
  totals.reductionPct = totals.originalBytes ? Number((100 * totals.savedBytes / totals.originalBytes).toFixed(1)) : 0;
  fs.writeFileSync(path.join(a.out, "inventory.json"), JSON.stringify({ kind: a.kind, generatedAt: new Date().toISOString(), totals, images: inventory }, null, 2));
  console.log(JSON.stringify(totals));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
