# VIBE Catálogo — Carga editorial manual progresiva (Fase 23)

Habilita y valida, contra Supabase real, el proceso por el cual Ana construye
la ficha editorial de cada producto **progresivamente** — hoy un campo,
mañana otro — sin perder nunca lo ya guardado y sin publicar nada de forma
automática. No es una carga masiva: no se cargó, clasificó ni publicó ningún
producto real en esta fase.

## Objetivo

Confirmar que la arquitectura ya construida en Fases 17/21/22A/22B soporta el
flujo real que Ana usará: **producto → ficha editorial → información
disponible → guardar → enriquecer después → publicar manualmente**, con
guardado parcial genuino (no un "todo o nada").

No se construyó ningún sistema nuevo — esta fase es de **validación y, donde
hiciera falta, ajuste puntual**, no de rediseño.

## Qué viene del POS vs. qué se administra en VIBE

Sin cambios respecto a Fase 22B — se reafirma explícitamente porque esta fase
lo pone a prueba con datos reales:

- **POS** (`products`, fuente operativa mínima, nunca se amplía ni se
  sincroniza hacia él): `id`, `name`, `price`, `stock`/disponibilidad,
  categoría POS.
- **VIBE Catalog** (`catalog_metadata`, fuente editorial): imágenes,
  descripciones, beneficios, ingredientes, uso, presentación, marca,
  categoría VIBE, subcategoría, keywords, badge, `featured`,
  `editorial_order`, `published`, información adicional.

`products.category` nunca se convierte automáticamente en
`catalog_metadata.category` — se confirmó explícitamente en la prueba real
(ver más abajo): el producto de control tenía `products.category = "Ojos"` y
se le asignó manualmente `catalog_metadata.category = "Ojos"` porque Ana (en
esta prueba, en mi rol de validación) decidió que coincidía — no porque el
sistema lo haya copiado.

## Flujo de trabajo (confirmado funcional)

1. Listado administrativo (`/admin`) → identificar producto → "Editar".
2. Ficha dividida en secciones (Fase 22B): Producto (solo lectura) → Imágenes
   → Información del producto → Clasificación VIBE → Editorial →
   Información adicional → Publicación.
3. Ana completa **solo** los campos que tiene disponibles.
4. Guardar.
5. Volver al listado (el diálogo se cierra solo tras guardar, o con
   "Cancelar"/"×" sin guardar nada).
6. Abrir el mismo producto más tarde, agregar más campos, guardar de nuevo —
   lo ya guardado se conserva.

Auditoría UX explícita de este flujo (`admin/admin.js`): abrir un producto
siempre recarga su estado actual desde `GET /api/admin/catalog-metadata`
antes de mostrar el formulario, así que reabrir y reeditar nunca parte de
datos obsoletos; guardar recarga el listado y cierra el diálogo; "Cancelar"
cierra sin enviar nada. **No se encontró ningún problema real que requiriera
corrección** — no se hizo ningún rediseño.

## Guardado parcial y edición posterior — cómo funciona realmente

El endpoint `PATCH /api/admin/catalog-metadata` (sin cambios de código en
esta fase) ya hace un *upsert* con `Prefer: resolution=merge-duplicates`:
**solo escribe las columnas presentes en el cuerpo de la petición** — el
resto de la fila en Supabase se conserva tal cual estaba. Esto significa que:

- Guardar solo `category` hoy no toca ninguna otra columna.
- Guardar solo `short_description` mañana no borra la `category` de ayer.
- Cada campo de la ficha (imagen, categoría, descripción, beneficios,
  keywords, badge, `featured`, `editorial_order`, información adicional,
  `published`) puede llegar en momentos distintos, en cualquier orden, sin
  pisar lo anterior.

Esta garantía **no era nueva de esta fase** — ya existía desde que
`_lib/adminWrite.js` se escribió en Fase 17 — pero nunca se había probado
explícitamente con una *secuencia* de guardados parciales encadenados. Esta
fase la valida por primera vez, tanto con Supabase real como con tests
mockeados (ver abajo).

## Publicación

`published` sigue siendo el único control manual — sin cambios de Fase 22B.
Se confirmó explícitamente, contra Supabase real, que:

- `published = false` → el producto **no** aparece en `GET /api/catalog/products`.
- `published = true` → el producto **sí** aparece, con la ficha acumulada
  hasta ese momento (ni más ni menos que lo que Ana guardó).

Ningún campo (imagen, descripción, categoría) activa `published`
automáticamente — se sigue exigiendo la decisión manual explícita.

## Imágenes

Sin cambios de infraestructura (Fase 21/22A intactas: bucket `product-images`,
`api/admin/product-images.js`, `_lib/storage.js`, `_lib/imageValidation.js`).
Las validaciones de tipo/tamaño/dimensión mínima se mantienen exactamente
igual — no se relajaron ni se endurecieron. El estándar visual (WebP, 4:5,
1200×1500 recomendado, 800×1000 mínimo, ≤300KB objetivo) sigue siendo
orientativo para el peso/proporción (avisos, no bloqueo) y estricto solo para
tipo de archivo y dimensión mínima, tal como se documentó en Fase 21.

## Reglas de no inferencia (reafirmadas, sin excepciones)

Nada en esta fase infiere, genera o completa contenido automáticamente. No se
usó IA generativa para redactar fichas, no se hizo scraping, no se buscó
información en internet, no se asignó categoría/subcategoría/keywords/badge a
ningún producto real basándose en su nombre o en `products.category`. El
único producto al que se le asignaron valores editoriales durante esta fase
fue el producto de control (#57), explícitamente como parte de la prueba
técnica, revertido por completo al finalizar (ver abajo) — no quedó como
carga real.

## Seguridad

Sin cambios: `ADMIN_API_TOKEN` y `SUPABASE_SERVICE_ROLE_KEY` server-side,
fail-closed, sin secretos en el frontend, sin endpoints públicos de
escritura, API pública sin `stock` numérico ni costos. Reconfirmado con
pruebas reales (401 sin token, 401 con token incorrecto) y con la lista
completa de campos públicos de un producto real publicado durante la prueba
(sin `stock`, sin `additional_info`, sin ningún dato administrativo).

## Producto 56 — sin tocar

No se repitió el piloto de Fase 22A. Se confirmó, antes y después de toda la
prueba de esta fase, que el producto 56 permanece exactamente igual:
`published: true`, `image` apuntando a la imagen real en Storage,
`images: []`, sin ninguna escritura nueva.

## Tests

**7 tests nuevos** (`scripts/test-editorial-progressive-loading.js`), con un
mock de Supabase que simula upsert real (merge-duplicates) para probar la
acumulación de verdad, no solo asumirla:

1. Ficha parcialmente completa (solo categoría) — el resto de la fila
   simplemente no existe todavía, sin valores inventados.
2. Guardar una descripción después no borra la categoría guardada antes.
3. Tres `PATCH` independientes (categoría, luego beneficios, luego badge) se
   acumulan en la misma fila.
4. `published = false` → no aparece en la API pública.
5. `published = true` → aparece, con la ficha acumulada completa, sin
   `stock` ni `additional_info`.
6-7. Reconfirmación de auth (401 sin token, 401 con token incorrecto) en este
   flujo específico.

El resto de los 20 escenarios pedidos ya estaban cubiertos por las suites de
Fase 21/22A/22B (`test-admin-images-*.js`, `test-admin-editorial-fields.js`,
`test-admin-handlers.js`, `test-admin-lib.js`, `test-catalog-lib.js`) — no se
duplicaron, se reutilizan tal cual.

**Total: 205/205** (198 heredados + 7 nuevos), sin regresiones.

## Validación real ejecutada contra Supabase (producto de control #57, revertido al final)

Se usó el producto **57 (Eyeliner Fine)**, elegido por ser el único criterio
seguro disponible: no tenía ninguna fila en `catalog_metadata` antes de la
prueba (confirmado por lectura previa), lo que permite un revert 100% limpio
al final (borrar la fila entera, no solo poner campos en `null`).

Secuencia real ejecutada (misma técnica de invocación directa de los handlers
reales usada en todas las validaciones anteriores de este proyecto):

1. `PATCH {category: "Ojos"}` → el resto de la ficha queda vacía.
2. `PATCH {short_description: "..."}` (sin reenviar `category`) → **la
   categoría se conservó**, la descripción se agregó.
3. `PATCH {published: true}` → producto apareció en `GET /api/catalog/products`
   con la ficha completa acumulada (`editorialCategory: "Ojos"`,
   `shortDescription` presente, sin `stock` ni datos administrativos).
4. `PATCH {published: false}` → el producto desapareció de la API pública de
   inmediato.
5. **Limpieza**: `DELETE` de la fila completa de `catalog_metadata` para el
   producto 57 — confirmado que quedó exactamente como antes de la prueba
   (sin fila), y que `catalog_metadata` global solo conserva la fila del
   producto 56, igual que al inicio de esta fase.
6. Confirmado en todo momento que `products.category` del producto 57 (POS)
   nunca se tocó, y que el producto 56 permaneció intacto durante toda la
   secuencia.

No se dejó ningún cambio de prueba. No se tocó VibeBeauty/POS en ningún
momento.

## Procedimiento recomendado para cargar productos (a partir de aquí)

1. Abrir `/admin`, elegir un producto de los 50 "listos para curaduría"
   (Fase 20.2), priorizando los 5 casos de inconsistencia POS→VIBE ya
   resueltos.
2. Completar solo lo que Ana tenga disponible en ese momento — no es
   necesario llenar toda la ficha de una sola vez.
3. Guardar. El producto queda con `published = false` por defecto hasta que
   Ana decida explícitamente publicarlo.
4. Volver más adelante a enriquecerlo (imagen, descripción, beneficios, etc.)
   sin riesgo de perder lo ya guardado.
5. Publicar manualmente cuando Ana considere que la ficha está lista — no
   hay ningún umbral de completitud que lo exija ni lo impida.

## Qué queda pendiente

- La carga editorial real de los 50 productos "listos" — no se inició en
  esta fase, es trabajo manual de Ana a partir de ahora.
- Los 18 productos pendientes de validación de Fase 20 siguen sin
  clasificación — se mantienen así hasta que exista información real para
  decidirlos, tal como se decidió en su momento.
- Ninguna acción manual nueva requerida en Supabase o Vercel — la migración
  de Fase 22B ya cubre todo lo necesario para esta fase.
