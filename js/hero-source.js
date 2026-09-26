// Fase 33 — seam entre js/hero-carousel.js y de dónde vienen los slides
// reales (GET /api/hero/slides, público, solo activos). Mismo patrón que
// js/data-source.js: un único punto de entrada, nunca importado por
// nada del catálogo (hero-carousel.js sigue sin tocar app.js/
// data-source.js/taxonomy.js).

const HERO_API = "/api/hero/slides";

export async function getHeroSlides(fetchImpl = fetch) {
  const res = await fetchImpl(HERO_API);
  if (!res.ok) throw new Error(`GET /api/hero/slides respondió ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.slides) ? data.slides : [];
}
