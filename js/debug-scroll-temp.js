// VIBE — instrumentación TEMPORAL de diagnóstico de scroll (Fase Mobile).
// DEBUG VERSION: MOBILE-SCROLL-03
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
// Los listeners touchstart/touchmove/touchend de este archivo son
// EXCLUSIVAMENTE de diagnóstico (solo leen/registran valores) — no
// llaman preventDefault en ningún momento, no son passive:false, no
// alteran el gesto de ninguna forma. GESTURE STATE es puramente
// informativo, calculado solo a partir de señales que el navegador
// realmente expone (scrollY, visualViewport) — nunca se inventa una
// señal si el navegador no la da (si visualViewport.offsetTop se
// mantiene en 0, se muestra 0 tal cual).

(function () {
  const DEBUG_VERSION = "MOBILE-SCROLL-03";
  const params = new URLSearchParams(window.location.search);
  if (params.get("debugScroll") !== "1") return;

  const t0 = performance.now();
  const MAX_EVENTS_SHOWN = 3;
  const eventLog = []; // historial completo, también accesible desde consola
  window.__vibeScrollDebugLog = eventLog;

  let lastClientY = null;
  let lastVvOffsetTop = null;
  let gestureState = "NORMAL";

  const el = document.createElement("div");
  el.id = "scrollDebugOverlay";
  el.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:2147483647",
    "background:#ffee00",
    "color:#000000",
    "font:700 13px/1.45 -apple-system,system-ui,monospace",
    "padding:10px 12px 16px",
    "pointer-events:none",
    "white-space:pre",
    "border-top:4px solid #000",
    "box-shadow:0 -4px 20px #0008",
    "max-height:52vh",
    "overflow:hidden",
  ].join(";");
  document.documentElement.appendChild(el);

  function classifyGesture(scrollY, vvOffsetTop) {
    if (scrollY === 0) {
      gestureState = "TOP";
    } else if (vvOffsetTop !== null && lastVvOffsetTop !== null && vvOffsetTop !== lastVvOffsetTop) {
      // Única señal objetiva que usamos: el visualViewport se desplazó
      // (offsetTop cambió) mientras el documento todavía reportaba
      // scrollY > 0 — es decir, algo está moviendo el viewport visible
      // independientemente del scroll normal del documento.
      gestureState = "PULL-TO-REFRESH SUSPECTED";
    } else {
      gestureState = "NORMAL";
    }
    lastVvOffsetTop = vvOffsetTop;
  }

  function renderEventLine(e) {
    return (
      "[" + e.t + "ms] " + e.type.padEnd(10) +
      " clientY=" + e.clientY +
      " dY=" + (e.deltaY === null ? "—" : e.deltaY) +
      " scrollY=" + e.scrollY +
      " vvTop=" + (e.vvOffsetTop === null ? "n/a" : e.vvOffsetTop)
    );
  }

  function update() {
    const html = document.documentElement;
    const body = document.body;
    const headerEl = document.querySelector("header");
    const vv = window.visualViewport;
    const vvOffsetTop = vv ? vv.offsetTop : null;
    const vvHeight = vv ? vv.height : null;

    classifyGesture(window.scrollY, vvOffsetTop);

    const recent = eventLog.slice(-MAX_EVENTS_SHOWN).map(renderEventLine).join("\n");

    el.textContent =
      "■■■ DEBUG SCROLL ACTIVO ■■■\n" +
      "DEBUG VERSION: " + DEBUG_VERSION + "\n" +
      "scrollY: " + window.scrollY + "  docScrollTop: " + html.scrollTop + "\n" +
      "vv.offsetTop: " + (vvOffsetTop === null ? "no soportado" : vvOffsetTop) +
      "  vv.height: " + (vvHeight === null ? "n/a" : Math.round(vvHeight)) + "\n" +
      "innerHeight: " + window.innerHeight + "  clientHeight: " + html.clientHeight + "\n" +
      "header.scrolled: " + (headerEl && headerEl.classList.contains("scrolled") ? "sí" : "no") + "\n" +
      "GESTURE STATE: " + gestureState + "\n" +
      "--- últimos eventos táctiles ---\n" +
      (recent || "(sin eventos táctiles todavía)");
  }

  window.addEventListener("scroll", update, { passive: true });

  // Bucle de lectura continua: durante el rebote nativo el navegador
  // puede no disparar más eventos `scroll` aunque el gesto siga activo.
  function loop() {
    update();
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);

  function recordTouch(type, touchEvent) {
    const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
    const clientY = touch ? Math.round(touch.clientY) : null;
    const deltaY = lastClientY !== null && clientY !== null ? clientY - lastClientY : null;
    if (clientY !== null) lastClientY = clientY;
    if (type === "touchstart") lastClientY = clientY; // nueva base para este gesto

    const vv = window.visualViewport;
    const entry = {
      type,
      clientY,
      deltaY,
      scrollY: window.scrollY,
      vvOffsetTop: vv ? vv.offsetTop : null,
      t: Math.round(performance.now() - t0),
    };
    eventLog.push(entry);
    console.log("[VIBE DEBUG]", entry);
    update();
  }

  // Diagnóstico puro: passive:true en los tres, sin preventDefault, sin
  // tocar el comportamiento del gesto de ninguna forma.
  window.addEventListener("touchstart", (e) => recordTouch("touchstart", e), { passive: true });
  window.addEventListener("touchmove", (e) => recordTouch("touchmove", e), { passive: true });
  window.addEventListener("touchend", (e) => recordTouch("touchend", e), { passive: true });

  update();
  console.log("[VIBE DEBUG] scroll instrumentation ACTIVE — " + DEBUG_VERSION);
})();
