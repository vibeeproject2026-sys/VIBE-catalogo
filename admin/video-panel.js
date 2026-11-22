// Video del producto (Admin › ficha › 3. Imágenes).
//
// Codificación REAL en el navegador, sin servicios externos: el video se
// reproduce (sin sonido hacia los parlantes) sobre un lienzo escalado y el
// codificador nativo del navegador (MediaRecorder) produce MP4 H.264 + AAC a
// 30 fps con la tasa de bits elegida. El archivo original solo se LEE: nunca
// se modifica ni se sube. Nada se publica sin «Aprobar y publicar».
//
// Estados: Pendiente → Procesando → Listo para revisar → Publicado (o Error).

const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  'video/mp4;codecs="avc1.4d0028,mp4a.40.2"',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs="avc1.640028"',
  'video/mp4;codecs=avc1',
];
// Tasa de bits de video para 1080p (se escala por píxeles; nunca se amplía
// un video más pequeño). Alta: prioriza pigmento, textura y acabado.
const BITRATE_1080 = { high: 6_500_000, balanced: 4_000_000 };
const AUDIO_BPS = 128_000;
const MAX_FILE = 50 * 1024 * 1024;
const TARGET_MAX = 25 * 1024 * 1024;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mb = (b) => `${(b / 1048576).toFixed(1).replace(".", ",")} MB`;
const secs = (s) => `${(Math.round(s * 10) / 10).toString().replace(".", ",")} s`;

export function pickMime() {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

// Dimensiones de salida: lado corto ≤ maxHeight, proporción y orientación
// originales, sin ampliar, dimensiones pares.
export function outputSize(w, h, maxHeight) {
  const scale = Math.min(1, maxHeight / Math.min(w, h));
  const even = (x) => Math.max(2, Math.round((x * scale) / 2) * 2);
  return { width: even(w), height: even(h) };
}
export function videoBitrate(width, height, quality) {
  const ratio = Math.max(0.3, Math.min(1, (width * height) / (1920 * 1080)));
  return Math.round(BITRATE_1080[quality === "balanced" ? "balanced" : "high"] * ratio);
}
export function estimateBytes(width, height, quality, seconds) {
  return Math.round(((videoBitrate(width, height, quality) + AUDIO_BPS) * seconds) / 8 * 1.04);
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error("formato"));
    v.src = url;
  });
}
const seek = (v, t) => new Promise((r) => { v.onseeked = () => r(); v.currentTime = t; });

// Codifica [start, end) del archivo. Devuelve { blob, poster, width, height, duration, mime }.
export async function encodeVideo(file, { start, end, maxHeight, quality, onProgress, signal }) {
  const mime = pickMime();
  if (!mime) throw new Error("Este navegador no puede codificar MP4 H.264. Usa Chrome, Edge o Safari actualizados en un computador.");
  const url = URL.createObjectURL(file);
  let actx = null, recorder = null, video = null;
  const cleanup = () => {
    try { if (video) { video.pause(); video.removeAttribute("src"); video.load(); } } catch {}
    try { if (actx) actx.close(); } catch {}
    URL.revokeObjectURL(url);
  };
  try {
    video = await loadVideo(url);
    const { width, height } = outputSize(video.videoWidth, video.videoHeight, maxHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    const stream = canvas.captureStream(30);
    try {
      actx = new AudioContext();
      const src = actx.createMediaElementSource(video);
      const dest = actx.createMediaStreamDestination();
      src.connect(dest); // solo hacia la grabación, no hacia los parlantes
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    } catch { actx = null; }
    await seek(video, start);
    ctx.drawImage(video, 0, 0, width, height);
    // Miniatura WebP (lado corto ≤ 720 px) del primer fotograma del tramo.
    const p = outputSize(width, height, 720);
    const pc = document.createElement("canvas");
    pc.width = p.width; pc.height = p.height;
    pc.getContext("2d").drawImage(canvas, 0, 0, p.width, p.height);
    const poster = await new Promise((r) => pc.toBlob(r, "image/webp", 0.85));
    if (!poster || poster.type !== "image/webp") throw new Error("No se pudo generar la miniatura WebP en este navegador.");

    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: videoBitrate(width, height, quality), audioBitsPerSecond: AUDIO_BPS });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { recorder.onstop = r; });
    const total = end - start;
    let done = false;
    const finish = () => { if (done) return; done = true; video.pause(); if (recorder.state !== "inactive") recorder.stop(); };
    const draw = () => {
      if (done) return;
      ctx.drawImage(video, 0, 0, width, height);
      onProgress && onProgress(Math.min(1, (video.currentTime - start) / total));
      if (video.currentTime >= end || video.ended) return finish();
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    // Si la pestaña se oculta, se pausa todo (evita saltos de fotogramas).
    const onVis = () => {
      if (done) return;
      if (document.hidden) { video.pause(); if (recorder.state === "recording") recorder.pause(); }
      else { if (recorder.state === "paused") recorder.resume(); video.play(); }
    };
    document.addEventListener("visibilitychange", onVis);
    const onAbort = () => { done = true; video.pause(); if (recorder.state !== "inactive") recorder.stop(); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    video.onended = finish;
    if (actx && actx.state === "suspended") await actx.resume();
    recorder.start(1000);
    await video.play();
    draw();
    await stopped;
    document.removeEventListener("visibilitychange", onVis);
    if (signal && signal.aborted) throw new Error("cancelado");
    const blob = new Blob(chunks, { type: "video/mp4" });
    if (!blob.size) throw new Error("La codificación no produjo un archivo válido.");
    return { blob, poster, width, height, duration: Math.min(total, video.currentTime - start || total), mime: recorder.mimeType || mime };
  } finally {
    cleanup();
  }
}

// ── Interfaz ────────────────────────────────────────────────────────────
export function mountVideoPanel(root, productId, { adminFetch, onUnauthorized }) {
  if (!root) return;
  const st = { status: "loading", video: null, settings: { maxDuration: 30, quality: "high", maxHeight: 1080 }, usage: null, file: null, meta: null, start: 0, result: null, error: null, progress: 0, abort: null, previewUrl: null };
  const api = async (method, query = "", body) => {
    const res = await adminFetch(`/api/admin/product-images?resource=video${query}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { onUnauthorized(); throw new Error("401"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Error del servidor.");
    return data;
  };
  const freePreview = () => { if (st.previewUrl) URL.revokeObjectURL(st.previewUrl); st.previewUrl = null; };
  const STATUS = { pending: "Pendiente", processing: "Procesando", review: "Listo para revisar", published: "Publicado", error: "Error", idle: "Sin video", loading: "Cargando…" };

  function render() {
    const s = st.settings;
    const mime = pickMime();
    const usage = st.usage ? `Almacenamiento: ${mb(st.usage.bytes)} de ${mb(st.usage.quota)} (${Math.round(st.usage.ratio * 100)} %).${st.usage.warning ? " ⚠ Cerca del límite del plan gratuito." : ""}` : "";
    let body = "";
    if (st.status === "published" || (st.status === "idle" && st.video)) {
      const v = st.video;
      body = `<video class="vp-preview" src="${esc(v.url)}" poster="${esc(v.poster)}" controls playsinline preload="none"></video>
        <p class="vp-info">${v.width}×${v.height} · ${secs(v.duration)} · ${mb(v.size)}</p>
        <div class="vp-actions"><label class="button">Reemplazar video<input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" data-vp-file hidden></label><button type="button" class="button remove-image-btn" data-vp-delete>Eliminar video</button></div>`;
    } else if (st.status === "idle" || st.status === "loading") {
      body = `<label class="button">Seleccionar video<input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" data-vp-file hidden></label>`;
    } else if (st.status === "pending") {
      const m = st.meta;
      const over = m.duration > s.maxDuration;
      const len = Math.min(m.duration - st.start, s.maxDuration);
      const out = { width: m.outW, height: m.outH };
      const est = estimateBytes(out.width, out.height, s.quality, len);
      body = `<p class="vp-info"><b>${esc(st.file.name)}</b> · ${mb(st.file.size)} · ${secs(m.duration)} · ${m.width}×${m.height}</p>
        ${over ? `<div class="vp-trim"><p>El video dura ${secs(m.duration)} y el máximo configurado es ${s.maxDuration} s. Elige desde qué segundo publicar (se usarán ${s.maxDuration} s). Nada se elimina sin tu aprobación: revisarás el resultado antes de publicar.</p>
          <label>Inicio (s) <input type="number" min="0" max="${Math.max(0, Math.floor((m.duration - s.maxDuration) * 10) / 10)}" step="0.1" value="${st.start}" data-vp-start></label>
          <video class="vp-preview" src="${esc(st.previewUrl)}" controls playsinline muted data-vp-src></video>
          <button type="button" class="button" data-vp-trimplay>Ver el tramo elegido</button></div>` : ""}
        <p class="vp-info">Resultado esperado: MP4 H.264, ${out.width}×${out.height}, 30 fps, ${secs(len)}, ≈ ${mb(est)}${est > TARGET_MAX ? " (por encima de 25 MB: considera Equilibrada o 720p)" : ""}.</p>
        ${est > MAX_FILE ? `<p class="vp-error">Con esta configuración el video superaría 50 MB, el límite por archivo. Cambia la calidad a Equilibrada, la resolución a 720p o reduce la duración máxima.</p>` : ""}
        ${!mime ? `<p class="vp-error">Este navegador no puede codificar MP4 H.264. Usa Chrome, Edge o Safari actualizados en un computador.</p>` : ""}
        <div class="vp-actions"><button type="button" class="button dark" data-vp-process${!mime || est > MAX_FILE ? " disabled" : ""}>Optimizar video</button><button type="button" class="button" data-vp-cancel>Cancelar</button></div>
        <p class="vp-hint">El procesamiento tarda aproximadamente lo que dura el tramo. Mantén esta pestaña visible; puedes seguir revisando la ficha.</p>`;
    } else if (st.status === "processing") {
      body = `<div class="vp-progress"><span style="width:${Math.round(st.progress * 100)}%"></span></div><p class="vp-info">Optimizando… ${Math.round(st.progress * 100)} %</p>
        <div class="vp-actions"><button type="button" class="button" data-vp-abort>Cancelar</button></div>`;
    } else if (st.status === "review") {
      const r = st.result;
      body = `<video class="vp-preview" src="${esc(st.previewUrl)}" poster="${esc(r.posterUrl)}" controls playsinline></video>
        <p class="vp-info">Optimizado: ${r.width}×${r.height} · ${secs(r.duration)} · ${mb(r.blob.size)} · ${esc(r.mime)}</p>
        ${r.blob.size > MAX_FILE ? `<p class="vp-error">El resultado supera 50 MB y no se puede publicar. Usa Equilibrada o 720p.</p>` : ""}
        <div class="vp-actions"><button type="button" class="button dark" data-vp-publish${r.blob.size > MAX_FILE ? " disabled" : ""}>Aprobar y publicar</button><button type="button" class="button" data-vp-discard>Descartar</button></div>`;
    } else if (st.status === "error") {
      body = `<p class="vp-error">${esc(st.error)}</p><div class="vp-actions">${st.file ? `<button type="button" class="button dark" data-vp-retry>Reintentar</button>` : ""}<button type="button" class="button" data-vp-discard>Volver</button></div>`;
    }
    root.innerHTML = `<p class="image-block-label">Video del producto <span class="vp-status vp-${st.status}">${STATUS[st.status === "idle" && st.video ? "published" : st.status]}</span></p>
      ${body}
      <details class="vp-settings"><summary>Configuración de video</summary>
        <div class="vp-settings-row">
          <label>Duración máxima (s)<input type="number" min="15" max="120" step="1" value="${s.maxDuration}" data-vp-set="maxDuration"></label>
          <label>Calidad<select data-vp-set="quality"><option value="high"${s.quality === "high" ? " selected" : ""}>Alta calidad</option><option value="balanced"${s.quality === "balanced" ? " selected" : ""}>Equilibrada</option></select></label>
          <label>Resolución máxima<select data-vp-set="maxHeight"><option value="1080"${s.maxHeight === 1080 ? " selected" : ""}>1080p</option><option value="720"${s.maxHeight === 720 ? " selected" : ""}>720p</option></select></label>
          <button type="button" class="button" data-vp-savesettings>Guardar configuración</button>
        </div><p class="vp-hint">Aplica a todos los productos. ${esc(usage)}</p></details>`;
  }

  async function chooseFile(file) {
    if (!file) return;
    freePreview();
    st.file = file; st.start = 0; st.result = null; st.error = null;
    st.previewUrl = URL.createObjectURL(file);
    try {
      const v = await loadVideo(st.previewUrl);
      if (!v.videoWidth || !Number.isFinite(v.duration)) throw new Error("formato");
      const out = outputSize(v.videoWidth, v.videoHeight, st.settings.maxHeight);
      st.meta = { duration: v.duration, width: v.videoWidth, height: v.videoHeight, outW: out.width, outH: out.height };
      v.removeAttribute("src"); v.load();
      st.status = "pending";
      if (navigator.deviceMemory && navigator.deviceMemory < 4) st.error = null;
    } catch {
      st.status = "error";
      st.error = "Este navegador no puede leer ese formato de video. Usa MP4 o MOV (H.264/HEVC) desde Chrome, Edge o Safari.";
    }
    render();
  }

  async function process() {
    const s = st.settings;
    const end = Math.min(st.meta.duration, st.start + s.maxDuration);
    st.status = "processing"; st.progress = 0; render();
    const ac = new AbortController();
    st.abort = ac;
    try {
      const r = await encodeVideo(st.file, { start: st.start, end, maxHeight: s.maxHeight, quality: s.quality, signal: ac.signal, onProgress: (p) => { st.progress = p; const bar = root.querySelector(".vp-progress span"); if (bar) { bar.style.width = `${Math.round(p * 100)}%`; root.querySelector(".vp-progress + .vp-info").textContent = `Optimizando… ${Math.round(p * 100)} %`; } } });
      freePreview();
      st.previewUrl = URL.createObjectURL(r.blob);
      st.result = { ...r, posterUrl: URL.createObjectURL(r.poster) };
      st.status = "review";
    } catch (e) {
      if (ac.signal.aborted) { st.status = "pending"; freePreview(); st.previewUrl = URL.createObjectURL(st.file); }
      else { st.status = "error"; st.error = `No se pudo optimizar el video: ${e.message}. El archivo original no se modificó; puedes reintentar.`; }
    }
    st.abort = null;
    render();
  }

  async function publish() {
    const r = st.result;
    const btn = root.querySelector("[data-vp-publish]");
    if (btn) { btn.disabled = true; btn.textContent = "Subiendo…"; }
    try {
      const signed = await api("POST", "", { action: "sign", product_id: productId, size: r.blob.size, posterSize: r.poster.size });
      const up = async (u, blob, type) => {
        const res = await fetch(u.url, { method: "PUT", headers: { "Content-Type": type, "x-upsert": "false" }, body: blob });
        if (!res.ok) throw new Error("La subida al almacenamiento falló (HTTP " + res.status + ").");
      };
      await up(signed.uploads.poster, r.poster, "image/webp");
      await up(signed.uploads.video, r.blob, "video/mp4");
      const pub = await api("POST", "", { action: "publish", product_id: productId, path: signed.uploads.video.path, posterPath: signed.uploads.poster.path, width: r.width, height: r.height, duration: r.duration });
      st.video = pub.video; st.status = "published"; st.result = null; st.file = null; freePreview();
      refresh(false);
    } catch (e) {
      if (e.message === "401") return;
      st.status = "error"; st.error = `No se publicó: ${e.message} El video optimizado sigue en esta pestaña; puedes reintentar.`;
      st.retryPublish = true;
      render();
      return;
    }
    render();
  }

  async function refresh(full = true) {
    try {
      const data = await api("GET", `&product_id=${encodeURIComponent(productId)}`);
      st.video = data.video; st.settings = data.settings || st.settings; st.usage = data.usage;
      if (full || st.status === "loading") st.status = st.video ? "published" : "idle";
    } catch (e) {
      if (e.message === "401") return;
      if (st.status === "loading") { st.status = "idle"; }
    }
    render();
  }

  root.addEventListener("change", (e) => {
    const f = e.target.closest("[data-vp-file]");
    if (f) return chooseFile(f.files[0]);
    const startEl = e.target.closest("[data-vp-start]");
    if (startEl) { st.start = Math.max(0, Math.min(Number(startEl.value) || 0, st.meta.duration - Math.min(st.meta.duration, st.settings.maxDuration))); render(); }
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.matches("[data-vp-process]")) return process();
    if (b.matches("[data-vp-abort]")) { if (st.abort) st.abort.abort(); return; }
    if (b.matches("[data-vp-cancel], [data-vp-discard]")) {
      if (st.status === "error" && st.retryPublish && st.result) { st.retryPublish = false; st.status = "review"; return render(); }
      freePreview(); st.file = null; st.result = null; st.error = null; st.status = st.video ? "published" : "idle"; return render();
    }
    if (b.matches("[data-vp-retry]")) {
      if (st.retryPublish && st.result) { st.retryPublish = false; st.status = "review"; render(); return publish(); }
      return chooseFile(st.file);
    }
    if (b.matches("[data-vp-publish]")) return publish();
    if (b.matches("[data-vp-trimplay]")) {
      const v = root.querySelector("[data-vp-src]");
      const end = st.start + st.settings.maxDuration;
      v.currentTime = st.start; v.play();
      const stop = () => { if (v.currentTime >= end) { v.pause(); v.removeEventListener("timeupdate", stop); } };
      v.addEventListener("timeupdate", stop);
      return;
    }
    if (b.matches("[data-vp-delete]")) {
      if (!confirm("¿Eliminar el video publicado de este producto? Las fotografías no se modifican.")) return;
      b.disabled = true;
      try { await api("DELETE", `&product_id=${encodeURIComponent(productId)}`); st.video = null; st.status = "idle"; refresh(false); }
      catch (err) { if (err.message !== "401") { st.status = "error"; st.error = "No se pudo eliminar: " + err.message; render(); } }
      return;
    }
    if (b.matches("[data-vp-savesettings]")) {
      const get = (k) => root.querySelector(`[data-vp-set="${k}"]`).value;
      const settings = { maxDuration: Math.round(Number(get("maxDuration"))), quality: get("quality"), maxHeight: Number(get("maxHeight")) };
      if (!(settings.maxDuration >= 15 && settings.maxDuration <= 120)) { alert("La duración máxima debe estar entre 15 y 120 segundos."); return; }
      b.disabled = true;
      try {
        const data = await api("POST", "", { action: "settings", settings });
        st.settings = data.settings;
        if (st.meta) { const o = outputSize(st.meta.width, st.meta.height, st.settings.maxHeight); st.meta.outW = o.width; st.meta.outH = o.height; st.start = 0; }
        render();
      } catch (err) { if (err.message !== "401") alert("No se guardó la configuración: " + err.message); b.disabled = false; }
    }
  });
  render();
  refresh();
}
