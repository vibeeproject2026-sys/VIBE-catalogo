# Imágenes editoriales — sección "Descubre tu VIBE"

Fase 44 — imágenes editoriales definitivas de VIBE para las cinco
tarjetas de categoría, entregadas por VIBE como assets propios de la
marca. Son fijas: cada una está asignada explícitamente a su categoría
en `js/app.js` (`DISCOVER_VIBE_TILES`) y no depende de productos,
fotos de producto, publicación ni inventario.

| Archivo | Categoría | Destino de la tarjeta |
|---|---|---|
| `vibe-category-rostro.webp` | Rostro | Maquillaje → Rostro |
| `vibe-category-labios.webp` | Labios | Maquillaje → Labios |
| `vibe-category-ojos.webp` | Ojos | Maquillaje → Ojos |
| `vibe-category-skincare.webp` | Skincare | Skincare |
| `vibe-category-accesorios.webp` | Accesorios | Accesorios (categoría POS "Otro") |

Formato: WebP (calidad 82) generado desde los PNG originales de
1122×1402 (4:5), en dos anchos servidos vía `srcset`:

- `vibe-category-<categoría>.webp` — 1122×1402, ancho original sin
  ampliar (pantallas 2×/3×).
- `vibe-category-<categoría>-640.webp` — 640×800 (pantallas 1×).

El encuadre dentro de la tarjeta se ajusta por categoría con
`object-position` en `css/styles.css` (`.discover-tile-<categoría>`).

Reemplazan a las tres fotografías genéricas de Unsplash usadas en
Fase 42.8 (`ojos.jpg`, `skincare.jpg`, `accesorios.jpg`), que se
retiraron del proyecto.
