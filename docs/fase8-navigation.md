# VIBE Catálogo — Taxonomía y navegación (Fase 8)

Documenta la jerarquía Grupo → Categoría → Subcategoría implementada en
el frontend. Complementa `docs/fase5-catalog-metadata-model.md` (modelo
de datos), `docs/fase6-catalog-api.md` (API) y `docs/fase7-data-source.md`
(capa de datos).

## Arquitectura

```
js/products.js (+ subcategory)  ─┐
                                   ├──▶ data-source.js ──▶ app.js ──▶ UI
/api/catalog/products            ─┘         │
                                              ▼
                                        js/taxonomy.js   (grupo/categoría/subcategoría, puro)
                                        js/url-state.js  (URL ↔ filtros, puro)
```

`taxonomy.js` y `url-state.js` son nuevos, sin dependencias entre sí ni
con el DOM — toda la lógica de derivar la estructura navegable y de
sincronizar filtros con la URL vive ahí, no en `app.js`. Esto es lo que
permitió probarla de verdad con Node plano (ver sección de testing).

## Nivel 1 vs. Nivel 2 en modo demo

Hallazgo importante de esta fase: `products.js` siempre usó `category`
como si fuera el nivel superior editorial (`Skincare`/`Maquillaje`/
`Accesorios`), no como una categoría operativa estilo POS (`Labios`/
`Rostro`/`Ojos`/...). En cambio, la API de la Fase 6 sí distingue
`category` (POS) de `categoryGroup` (grupo editorial estático).

Para que la navegación funcione igual en ambos modos sin inventar datos
falsos, `data-source.js` ahora normaliza:

- **Demo:** `categoryGroup = category` (mismo valor — honesto, no se
  inventa una categoría operativa que no existe en los datos demo).
- **API:** `categoryGroup` viene tal cual de la respuesta (Fase 6 ya lo
  calculaba con el mapeo estático de `api/catalog/_lib/categoryGroups.js`,
  sin cambios).

Consecuencia observable: con los datos demo actuales, el nivel
"categoría" (nivel 2) siempre coincide con el "grupo" (nivel 1), así que
la fila de tabs de categoría se **oculta automáticamente** (no hay nada
real que elegir ahí) y solo se ven Grupo → Subcategoría. Con datos reales
de API (donde un grupo como "Maquillaje" sí agrupa varias categorías
POS como Labios/Rostro/Ojos), la fila de categoría aparecerá con
opciones reales. Esto está probado explícitamente con un fixture
"tipo API" en `scripts/test-taxonomy.mjs`, no solo inferido.

## Subcategorías asignadas a los productos demo

Únicamente a los 6 productos que ya existían, sin agregar ninguno nuevo,
usando solo vocabulario ya sugerido en el encargo:

| Producto | Categoría | Subcategoría |
|---|---|---|
| Daily Glow Cleanser | Skincare | Limpieza |
| Radiance Serum | Skincare | Tratamientos |
| Reset Face Mask | Skincare | Tratamientos |
| Hydra Mist | Skincare | Hidratación |
| Soft Vibe Lip | Maquillaje | Labiales |
| Essential Brush | Accesorios | Brochas |

Skincare (4 productos) es el único grupo con más de una subcategoría
real, así que es el único que hoy muestra la fila de subcategoría en el
catálogo — Maquillaje y Accesorios tienen un solo producto cada uno, y
mostrar "Todos / Labiales" (dos opciones que llevan al mismo resultado)
sería ruido, no información. Ver "Empty states / filas condicionales"
abajo.

## Filas condicionales, no una jerarquía siempre-visible-de-3-niveles

`renderNav()` en `app.js` oculta cada fila (`#categoryTabs`,
`#subcategoryTabs`) cuando no aporta una elección real:

- Fila de categoría: oculta si el grupo activo tiene 0 o 1 categoría
  distinta.
- Fila de subcategoría: oculta si la categoría efectiva tiene 0 o 1
  subcategoría distinta.

Esto evita una interfaz que finja tener 3 niveles de profundidad cuando
los datos actuales no lo justifican — coherente con "no inventar una
taxonomía gigantesca".

## Navegación

- Fila principal (`#groupTabs`, estilo pill rosa activo): Todos +
  grupos reales, siempre visible.
- Filas secundarias (`#categoryTabs`/`#subcategoryTabs`, clase
  `.tabs-sub`, más pequeñas, activo en negro en vez de rosa): aparecen
  solo cuando aportan información, reforzando jerarquía visual sin
  introducir un color nuevo.
- Cascada de reset: cambiar de grupo reinicia categoría y subcategoría a
  "Todos"; cambiar de categoría reinicia solo subcategoría. Evita quedar
  "atrapado" en una combinación que ya no aplica.
- En mobile (`≤640px`), las tres filas pasan a scroll horizontal
  (`overflow-x:auto`, sin wrap, sin scrollbar visible) en vez de
  envolver en varias líneas — evita una pila alta de pills.
- Los `.tab` ahora tienen `min-height:44px` (antes ~33px), alineado con
  la guía de área táctil mínima de 44–48px.

## Home: "Explora tu VIBE"

No se eliminó, se **re-escaló al nivel de grupo**: antes listaba
exactamente las mismas categorías que las tabs del catálogo (redundante
con la nueva navegación de 3 niveles); ahora `renderCategoryShowcase()`
usa `getGroups()`, el nivel más alto y editorial. Con los datos demo
actuales esto no cambia visualmente el resultado (grupo === categoría
para los productos demo, ver arriba), pero arquitectónicamente ya opera
en el nivel correcto y divergirá del catálogo (que sí baja a categoría/
subcategoría) en cuanto existan categorías operativas reales vía API. Se
documenta esto explícitamente para no aparentar un cambio visual que
hoy no ocurre.

## Product detail

El `eyebrow` sobre el nombre del producto pasó de mostrar solo
`category` a `breadcrumbLabel(p)` (`js/taxonomy.js`): "Skincare /
Limpieza" hoy, "Maquillaje / Labios / Gloss" el día que existan
categorías operativas reales — reutiliza el estilo `.eyebrow` ya
existente (texto pequeño, versalitas) en vez de un breadcrumb técnico
con flechas/links.

## Product cards

Sin cambios de estructura — siguen mostrando categoría, nombre, precio,
disponibilidad y CTA. Se decidió **no** agregar la subcategoría a cada
card (instrucción explícita: no es obligatoria si perjudica la
estética); con nombres de producto ya descriptivos, sumar otra etiqueta
pequeña no aportaba suficiente valor frente al costo visual.

## URL / estado

Se implementó reflejo de filtros en la URL (`?group=...&category=...&subcategory=...&q=...#catalogo`)
vía `history.replaceState` — deliberadamente **no** `pushState`. Con
`pushState`, cada clic en un tab agrega una entrada al historial, y el
botón "atrás" del navegador tendría que deshacer los filtros paso a
paso antes de salir de la página — una fricción conocida en interfaces
de filtros facetados que el encargo pedía evitar ("no implementar
routing complejo"). `replaceState` da lo importante (link compartible,
sobrevive un refresh) sin ese costo.

**Consecuencia honesta:** no hay soporte de atrás/adelante por cada paso
de filtro (ítem 17 de la lista de pruebas, marcado como no aplicable
porque esta fase no implementó `pushState`). Si en el futuro se
considera importante, es un cambio acotado en `syncUrl()`.

## Búsqueda

Ahora también busca por `subcategory`, además de nombre/descripción/
categoría (antes no la incluía). Las filas de categoría/subcategoría no
se re-filtran por el texto de búsqueda — se calculan solo a partir de
grupo/categoría seleccionados, para mantener el comportamiento simple y
predecible.

## Empty states

Copy actualizado de "No encontramos productos." a "Estamos preparando
algo especial para ti." — cubre tanto "esta combinación no tiene
productos" como "la búsqueda no encontró nada" con el mismo tono de
marca, sin inventar copy adicional por caso.

## Compatibilidad con la API (Fase 6)

**No se tocó `api/catalog/*` ni su contrato.** Cambio de consumo del
lado del frontend: `app.js` dejó de llamar a `getCategories()` (que
sigue existiendo, exportada y probada en `data-source.js`, sin
modificar su lógica) porque toda la navegación ahora se deriva
directamente de la lista de productos ya cargada (`state.products`) vía
`taxonomy.js` — siempre en sync por construcción, y evita una segunda
llamada de red en modo API. `getProducts()`/`getCategories()` siguen
siendo el contrato público completo de `data-source.js`; simplemente
`app.js` ya no necesita el segundo.

## Testing

**44 pruebas nuevas o re-verificadas específicas de esta fase, todas
ejecutadas de verdad con `node`:**

- `scripts/test-taxonomy.mjs` (19 pruebas, nuevo) — `getGroups`,
  `getCategoriesInGroup`, `getSubcategories`, `filterProducts` (Todos,
  grupo, categoría, subcategoría, búsqueda, combinaciones, sin
  resultados) y `breadcrumbLabel`, con fixtures demo-like y API-like.
- `scripts/test-url-state.mjs` (6 pruebas, nuevo) — lectura de
  querystring (refresh/link compartido), construcción de URL, y
  round-trip completo.
- `scripts/test-data-source.mjs` (14, re-verificado) — sigue en verde
  tras agregar `categoryGroup` a `normalizeDemoProduct`.
- `scripts/test-cart-integration.mjs` (5, re-verificado) — el carrito no
  se tocó y sigue funcionando con productos normalizados.
- `scripts/test-catalog-lib.js` + `scripts/test-catalog-handlers.js`
  (18+12, re-verificados) — la API de la Fase 6 no se tocó.

**No cubierto por ejecución real** (mismas limitaciones que la Fase 7,
sin navegador/headless disponible sin agregar una dependencia nueva):
navegación mobile real (scroll horizontal, touch), checkout end-to-end,
refresh real en un navegador, atrás/adelante del navegador (además, no
implementado — ver "URL / estado"). Validado en su lugar con `node
--check`, un validador de estructura HTML, balance de llaves de CSS, y
revisión manual de código.
