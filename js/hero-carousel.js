// VIBE — Hero banner carousel (Fase Visual 2; administrable desde Fase 33).
//
// Deliberadamente aislado de app.js/data-source.js/taxonomy.js: no
// importa nada del catálogo y nada del catálogo lo importa a él. Su
// única fuente de contenido nueva es js/hero-source.js (GET público
// /api/hero/slides) — ningún producto, carrito ni checkout pasa por
// aquí.
//
// Fase 33 — fuente real vs. fallback: se intenta primero
// getHeroSlides() (los slides reales activos, administrados desde
// /admin). Si la llamada falla o devuelve cero slides activos, se usa
// FALLBACK_HERO_SLIDES — el mismo contenido estático de diseño que ya
// existía (no es "contenido inventado", son las piezas gráficas
// originales del sitio) — para que el Home nunca quede con un hueco
// vacío en su primera sección. Un solo slide real activo ya reemplaza
// por completo al fallback (no se mezclan).
import { getHeroSlides } from "./hero-source.js";

const FALLBACK_HERO_SLIDES = [
  { image: "assets/hero/slide-1.svg", alt: "Nueva colección VIBE", ctaHref: "#catalogo", order: 1, active: true },
  { image: "assets/hero/slide-2.svg", alt: "Ritual skincare VIBE", ctaHref: "#catalogo", order: 2, active: true },
  { image: "assets/hero/slide-3.svg", alt: "Kit Esencial VIBE, edición limitada", ctaHref: "#catalogo", order: 3, active: true },
  { image: "assets/hero/slide-4.svg", alt: "VIBE — Tu ritual, tu VIBE", ctaHref: "#catalogo", order: 4, active: true },
];

const AUTOPLAY_MS = 5000;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Sección 2 — el contenido textual es siempre opcional: un slide con
// solo imagen se ve exactamente igual que antes de esta fase (sin
// overlay). El overlay solo aparece si el admin cargó al menos uno de
// estos campos. mobileImage también es opcional: si no existe, se usa
// la misma imagen en todos los tamaños (comportamiento actual).
function heroSlideHtml(s, i) {
  const href = s.ctaHref || "#catalogo";
  const hasMobileVariant = s.mobileImage && s.mobileImage !== s.image;
  const hasCopy = s.eyebrow || s.title || s.subtitle || s.ctaText;
  return `<a class="hero-slide${i === 0 ? " active" : ""}" href="${esc(href)}" data-index="${i}">
    <picture>
      ${hasMobileVariant ? `<source media="(max-width: 640px)" srcset="${esc(s.mobileImage)}">` : ""}
      <img src="${esc(s.image)}" alt="${esc(s.alt || "")}" loading="${i === 0 ? "eager" : "lazy"}">
    </picture>
    ${
      hasCopy
        ? `<div class="hero-slide-copy">
      ${s.eyebrow ? `<p class="hero-slide-eyebrow">${esc(s.eyebrow)}</p>` : ""}
      ${s.title ? `<h2 class="hero-slide-title">${esc(s.title)}</h2>` : ""}
      ${s.subtitle ? `<p class="hero-slide-subtitle">${esc(s.subtitle)}</p>` : ""}
      ${s.ctaText ? `<span class="hero-slide-cta">${esc(s.ctaText)}</span>` : ""}
    </div>`
        : ""
    }
  </a>`;
}

async function resolveSlides() {
  try {
    const real = await getHeroSlides();
    if (real.length) return real;
  } catch (e) {
    console.error("[VIBE hero] No se pudieron cargar los slides reales, usando el contenido de respaldo.", e && e.message ? e.message : e);
  }
  return FALLBACK_HERO_SLIDES.filter((s) => s.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function initHeroCarousel() {
  const root = $("#heroCarousel");
  if (!root) return; // el bloque no está en esta página — nada que hacer

  const slidesEl = $("#heroSlides");
  const dotsEl = $("#heroDots");
  const prevBtn = $("#heroPrev");
  const nextBtn = $("#heroNext");

  const slides = await resolveSlides();
  if (!slides.length) {
    root.classList.add("hidden");
    return;
  }

  slidesEl.innerHTML = slides.map(heroSlideHtml).join("");

  // El contenedor mobile asumía aspect-ratio:4/5 fijo (ver css/styles.css),
  // como si la pieza real siempre fuera exactamente 1080x1350 — cualquier
  // asset con otra proporción quedaba con bandas dentro de ese marco. En
  // vez de asumirlo, se mide la proporción REAL de la primera pieza (su
  // imagen mobile si existe, si no la principal) y se expone como
  // --hero-mobile-ratio; el CSS mobile la usa con var(...,4/5) como
  // respaldo mientras esto carga o si la medición falla.
  const firstSlideImage = slides[0].mobileImage || slides[0].image;
  if (firstSlideImage) {
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        root.style.setProperty("--hero-mobile-ratio", `${probe.naturalWidth} / ${probe.naturalHeight}`);
      }
    };
    probe.src = firstSlideImage;
  }

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
