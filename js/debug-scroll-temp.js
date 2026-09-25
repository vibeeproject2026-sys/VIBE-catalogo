// VIBE — instrumentación TEMPORAL de diagnóstico de scroll (Fase Mobile).
// DEBUG VERSION: MOBILE-SCROLL-02
//
// SOLO PARA DIAGNÓSTICO LOCAL/DESARROLLO. Eliminar este archivo y su
// <script> en index.html una vez recogida la evidencia — no debe llegar
// a producción de forma permanente.
//
// Se activa ÚNICAMENTE con ?debugScroll=1 en la URL. Si el parámetro no
// está presente, este script no hace absolutamente nada (no crea
// elementos, no agrega listeners) — cero impacto en el comportamiento
// normal del sitio.
//
// No usa touchstart/touchmove/touchend, no usa preventDefault, no
// bloquea ni modifica el pull-to-refresh nativo, no modifica el layout
// del catálogo (el banner es position:fixed, fuera de flujo). Es
// puramente de lectura: muestra en pantalla los valores reales de
// scroll en tiempo real, incluso en el instante en que el gesto de
// pull-to-refresh mantiene el documento "atascado" en scrollTop=0 sin
// disparar el evento `scroll` (por eso se usa un bucle de
// requestAnimationFrame además del listener de scroll).

(function () {
  const DEBUG_VERSION = "MOBILE-SCROLL-02";
  const params = new URLSearchParams(window.location.search);
  if (params.get("debugScroll") !== "1") return;

  const el = document.createElement("div");
  el.id = "scrollDebugOverlay";
  el.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:2147483647", // máximo posible: por encima de cualquier otra cosa (drawer, dialogs, header)
    "background:#ffee00",
    "color:#000000",
    "font:700 16px/1.5 -apple-system,system-ui,monospace",
    "padding:14px 16px 20px",
    "pointer-events:none",
    "white-space:pre",
    "border-top:4px solid #000",
    "box-shadow:0 -4px 20px #0008",
  ].join(";");
  document.documentElement.appendChild(el);

  function update() {
    const html = document.documentElement;
    const body = document.body;
    const headerEl = document.querySelector("header");
    el.textContent =
      "■■■ DEBUG SCROLL ACTIVO ■■■\n" +
      "DEBUG VERSION: " + DEBUG_VERSION + "\n" +
      "scrollY: " + window.scrollY + "\n" +
      "docScrollTop: " + html.scrollTop + "\n" +
      "bodyScrollTop: " + body.scrollTop + "\n" +
      "scrollHeight: " + html.scrollHeight + "\n" +
      "clientHeight: " + html.clientHeight + "\n" +
      "header.scrolled: " + (headerEl && headerEl.classList.contains("scrolled") ? "sí" : "no");
  }

  window.addEventListener("scroll", update, { passive: true });

  // Bucle de lectura continua: durante el rebote nativo (dedo aún en
  // pantalla, ya en el límite superior) el navegador puede no disparar
  // más eventos `scroll` porque scrollTop ya no cambia — este loop
  // asegura que el valor mostrado siga siendo el real en todo momento,
  // sin necesidad de ningún listener táctil.
  function loop() {
    update();
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);

  update();

  // Confirmación en consola también, por si el banner visual llegara a
  // quedar oculto detrás de algún elemento inesperado en el dispositivo.
  console.log("[VIBE DEBUG] scroll instrumentation ACTIVE — " + DEBUG_VERSION);
})();
