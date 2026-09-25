// VIBE — Hero banner carousel (Fase Visual 2).
//
// Deliberadamente aislado de app.js/data-source.js: no importa nada del
// catálogo y nada del catálogo lo importa a él. El Hero exhibe piezas
// gráficas ya diseñadas externamente — este archivo solo sabe mostrar
// una imagen a la vez, avanzar automáticamente y responder a la
// navegación manual. No compone tarjetas, precios, badges ni texto
// sobre la imagen.
//
// HERO_SLIDES usa el mismo shape { image, alt, href, order, active }
// pensado para que, en una fase futura, esta lista pueda venir de
// Supabase/admin sin cambiar la lógica de abajo — hoy son datos
// estáticos de prueba, ninguna imagen real de campaña.

const HERO_SLIDES = [
  { image: "assets/hero/slide-1.svg", alt: "Nueva colección VIBE", href: "#catalogo", order: 1, active: true },
  { image: "assets/hero/slide-2.svg", alt: "Ritual skincare VIBE", href: "#catalogo", order: 2, active: true },
  { image: "assets/hero/slide-3.svg", alt: "Kit Esencial VIBE, edición limitada", href: "#catalogo", order: 3, active: true },
  { image: "assets/hero/slide-4.svg", alt: "VIBE — Tu ritual, tu VIBE", href: "#catalogo", order: 4, active: true },
];

const AUTOPLAY_MS = 5000;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function initHeroCarousel() {
  const root = $("#heroCarousel");
  if (!root) return; // el bloque no está en esta página — nada que hacer

  const slidesEl = $("#heroSlides");
  const dotsEl = $("#heroDots");
  const prevBtn = $("#heroPrev");
  const nextBtn = $("#heroNext");

  const slides = HERO_SLIDES.filter((s) => s.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!slides.length) {
    root.classList.add("hidden");
    return;
  }

  slidesEl.innerHTML = slides
    .map(
      (s, i) => `<a class="hero-slide${i === 0 ? " active" : ""}" href="${esc(s.href || "#catalogo")}" data-index="${i}">
        <img src="${esc(s.image)}" alt="${esc(s.alt || "")}" loading="${i === 0 ? "eager" : "lazy"}">
      </a>`
    )
    .join("");

  dotsEl.innerHTML = slides
    .map((_, i) => `<button type="button" class="hero-dot${i === 0 ? " active" : ""}" data-index="${i}" aria-label="Ir a la pieza ${i + 1}"></button>`)
    .join("");

  if (slides.length < 2) {
    // Una sola pieza: nada que navegar ni reproducir automáticamente.
    prevBtn.classList.add("hidden");
    nextBtn.classList.add("hidden");
    dotsEl.classList.add("hidden");
    return;
  }

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let current = 0;
  let timer = null;

  function render() {
    slidesEl.querySelectorAll(".hero-slide").forEach((el, i) => el.classList.toggle("active", i === current));
    dotsEl.querySelectorAll(".hero-dot").forEach((el, i) => el.classList.toggle("active", i === current));
  }

  function goTo(index) {
    current = (index + slides.length) % slides.length; // vuelve al primero tras el último
    render();
  }
  function next() {
    goTo(current + 1);
  }
  function prev() {
    goTo(current - 1);
  }

  function stopAutoplay() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }
  function startAutoplay() {
    if (reduceMotion) return; // prefers-reduced-motion: sin avance automático
    stopAutoplay();
    timer = window.setInterval(next, AUTOPLAY_MS);
  }
  function restartAutoplay() {
    // Toda interacción manual reinicia el temporizador del autoplay.
    startAutoplay();
  }

  prevBtn.addEventListener("click", (e) => {
    e.preventDefault();
    prev();
    restartAutoplay();
  });
  nextBtn.addEventListener("click", (e) => {
    e.preventDefault();
    next();
    restartAutoplay();
  });
  dotsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-index]");
    if (!b) return;
    e.preventDefault();
    goTo(Number(b.dataset.index));
    restartAutoplay();
  });

  // Swipe táctil (mobile) — puramente pasivo: nunca llama
  // preventDefault, nunca bloquea ni interfiere con el scroll vertical
  // de la página. Solo mide la distancia entre el inicio y el final del
  // toque (no sigue al dedo en vivo, es un gesto de "flick" al soltar);
  // si el desplazamiento es predominantemente horizontal y supera un
  // umbral mínimo, cambia de slide. Los listeners están acotados a
  // #heroCarousel — no hay ningún listener global de touch en la
  // página.
  const SWIPE_THRESHOLD = 40;
  let touchStartX = null;
  let touchStartY = null;

  root.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    },
    { passive: true }
  );

  root.addEventListener(
    "touchend",
    (e) => {
      if (touchStartX === null) return;
      const t = e.changedTouches[0];
      const deltaX = t.clientX - touchStartX;
      const deltaY = t.clientY - touchStartY;
      touchStartX = null;
      touchStartY = null;
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
        if (deltaX < 0) next();
        else prev();
        restartAutoplay();
      }
    },
    { passive: true }
  );

  render();
  startAutoplay();
}

initHeroCarousel();
