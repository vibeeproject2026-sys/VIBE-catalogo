# VIBE Catálogo — Capa data-source (Fase 7)

Documenta cómo quedó conectado (arquitectónicamente, no todavía en
producción) el frontend con la API construida en la Fase 6. Complementa
`docs/fase6-catalog-api.md`.

## Arquitectura

```
js/products.js  ─┐
                  ├──▶  js/data-source.js  ──▶  js/app.js  ──▶  UI
/api/catalog/*   ─┘
```

`app.js` ya no importa `products.js` en absoluto, y nunca hace `fetch`
directamente. Su único punto de contacto con datos es
`import { getProducts, getCategories } from "./data-source.js"`.
`data-source.js` es el único módulo que conoce tanto a `products.js`
(modo demo) como a `/api/catalog/products` y `/api/catalog/categories`
(modo API) — es la pieza que puede cambiarse o crecer sin que `app.js`
se entere.

## Contrato

Dos funciones públicas, ambas `async`, ambas sin argumentos:

- `getProducts()` → array de productos ya normalizados al shape que
  `app.js` espera (el mismo que usaba antes con `products.js`, más
  `available` y `subcategory` presentes siempre).
- `getCategories()` → array plano de nombres de categoría con `"Todos"`
  al inicio, igual que el `categories` que exportaba `products.js`.

Deliberadamente **no** se creó `getProductById()` ni `getCategoryData()`:
`app.js` ya carga la lista completa una sola vez al iniciar y filtra en
memoria (categoría, búsqueda) — igual que antes de esta fase — así que
un método de detalle por id no resuelve ningún problema real hoy. Si el
catálogo crece mucho, vale la pena reconsiderarlo entonces, no ahora.

## Modo demo vs. modo API

Una constante explícita en el módulo (`CONFIGURED_MODE = "demo"`), no
`window.location.hostname`. Puede sobreescribirse manualmente en
cualquier momento agregando `?dataSource=api` a la URL — útil para
probar el modo API en desarrollo sin tocar código, sin afectar el
default de producción. **El default sigue siendo `"demo"`** — no se
activó producción automáticamente en esta fase, tal como se pidió.

## Normalización

- **Demo → shape esperado:** los productos de `products.js` ya casi
  encajan tal cual; solo se les agrega `available: true` (no existe
  concepto de stock real en demo) y `subcategory: null` si no la
  tuvieran.
- **API → shape esperado:** se mapean los campos que ya definió la Fase
  6 (`id, name, price, available, category, subcategory, image, images,
  shortDescription, description, benefits, ingredients, usage,
  presentation, badge, featured`). El campo `variants[]` **no existe**
  en la respuesta de la API (no hay variantes operativas todavía) — se
  sintetiza una única variante por defecto a partir de `price`/
  `presentation` del propio producto, para que el código existente de
  `app.js` (que asume `p.variants[0]` sin excepciones) siga funcionando
  sin ningún cambio en esa parte.

## Fallback

`getProducts()`/`getCategories()` intentan la API solo si el modo activo
es `"api"`. Si la llamada falla (red caída, `503` porque
`catalog_metadata` todavía no existe, cualquier error), se captura, se
emite un `console.warn("[VIBE data-source] ...")` claramente
identificable, y se devuelven los datos demo — **nunca** se le muestra al
usuario un error técnico. El modo demo en sí no tiene ninguna forma de
fallar (es un array local, sin E/S), así que en la práctica el catálogo
jamás se queda sin datos, salvo un bug real en el propio código de
normalización — ese caso sí se deja propagar hasta `app.js`, que lo
atrapa y muestra un estado de error amigable (ver abajo).

## Carga inicial / loading / error

`app.js` ya no asume que los productos están disponibles de forma
síncrona. El bloque final del archivo pasó de llamadas directas a un
`async function loadCatalog()`:

1. Muestra un mensaje de carga (`"Cargando catálogo..."`, etc.) en las
   tres zonas que dependen de datos (`#productGrid`, `#featuredGrid`,
   `#categoryShowcase`) — reutilizando la clase `.empty` que ya existía
   en el sistema visual (texto centrado y discreto), sin agregar CSS
   nueva para este estado.
2. `await Promise.all([getProducts(), getCategories()])`.
3. Si todo resuelve: renderiza igual que antes.
4. Si algo lanza una excepción real (caso extremo, ver arriba): reemplaza
   esas mismas zonas con un mensaje de error genérico y amable ("No
   pudimos cargar el catálogo en este momento..."), sin stack trace, sin
   mención de Supabase/HTTP/variables de entorno.

El carrito (`renderCart()`) se sigue renderizando de inmediato, sin
esperar esta carga — no depende del catálogo, solo de `localStorage`.

## `available` en la UI

Único cambio funcional visible en esta fase: cuando `p.available ===
false`, la card y el detalle de producto muestran una etiqueta
"Agotado" (una clase CSS nueva y mínima, `.availability-badge`,
reutilizando los tokens de color ya existentes) y el botón "Agregar al
carrito" del detalle queda deshabilitado (`disabled`, más un chequeo
adicional en el handler de clic como defensa extra). El botón "Ver
producto" de la card sigue siempre activo — un producto agotado se
puede seguir consultando. El frontend nunca recibe ni calcula un número
de stock; solo conoce el booleano.

## Testing

No se pudo ejecutar `app.js` en un navegador real ni con un DOM headless
(no hay `chromium-cli`/Playwright/Puppeteer/jsdom disponibles en este
entorno, y agregar cualquiera de ellos habría violado la regla de "no
agregar dependencias"). En su lugar:

- `scripts/test-data-source.mjs` (14 pruebas) ejecuta el código real y
  sin modificar de `data-source.js` bajo Node puro (técnica: copia
  temporal fuera del repo con un `package.json` desechable que solo
  existe en esa carpeta temporal, para que Node interprete `import`/
  `export` correctamente — no se agregó ningún `package.json` al
  repositorio real). Cubre: contrato público, modo demo, transformación
  del shape de API, ausencia de `variants`, `available=false`, y
  fallback real ante error de API con `fetch` mockeado.
- `scripts/test-cart-integration.mjs` (5 pruebas) ejecuta el `cart.js`
  real (con un `localStorage` en memoria) contra productos con ambos
  shapes (demo y API-normalizado), confirmando agregar/quitar/cambiar
  cantidad/subtotal/total siguen funcionando igual.
- `js/app.js` en sí se validó con `node --check` (sintaxis) y revisión
  manual de código — no con ejecución real, por la limitación de
  entorno anterior. Es la única prueba de esta fase que quedó a nivel de
  revisión de código en vez de ejecución real; se documenta
  explícitamente para no aparentar una cobertura que no existe.

Las 30 pruebas de la Fase 6 se volvieron a correr como parte de esta
fase y siguen en verde (nada de la API se tocó).
