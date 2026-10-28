# VIBE Catálogo — Ficha editorial manual y flexible (Fase 22B)

Amplía el panel `/admin` (Fase 17) para que cada producto tenga una ficha
editorial completa, organizada por secciones, 100% manual. El sistema no
infiere, no genera ni completa automáticamente ningún campo — si Ana no tiene
un dato, el campo queda vacío.

## Objetivo

Darle a Ana un formulario donde cada información editorial tiene su propio
campo independiente, agrupado de forma clara (Producto / Imágenes /
Información del producto / Clasificación VIBE / Editorial / Información
adicional / Publicación), sin ningún mecanismo de completitud automática,
scoring, o publicación condicionada a qué tan lleno esté un producto.

## Qué viene del POS vs. qué pertenece al catálogo

| | Origen | Editable desde `/admin` |
|---|---|---|
| `id`, `name`, `price`, `stock`/disponibilidad, categoría POS | POS (`products`) | **No** — solo lectura, sección "Producto" |
| Imágenes, descripciones, taxonomía VIBE, badges, `featured`, `editorial_order`, `published`, información adicional | Catálogo (`catalog_metadata`) | Sí |

Sin cambios en este principio respecto a Fase 17 — esta fase solo amplía qué
campos editoriales existen y cómo se presentan.

## Campos disponibles (formulario completo)

**Información del producto** — `short_description`, `description`,
`benefits` (uno por línea), `ingredients`, `usage`, `presentation`, `brand`.

**Clasificación VIBE** — `category` ("Categoría VIBE", nuevo — selector con
las 7 categorías aprobadas en
[Fase 20.2](fase20-curaduria-editorial-decisiones.md): Rostro, Ojos, Labios,
Limpieza, Tratamiento, Herramientas de aplicación, Complementos de belleza,
más "Sin categoría"), `subcategory` (texto libre con sugerencias de las ~24
subcategorías de la Fase 20 vía `<datalist>` — nunca fuerza un valor),
`search_keywords` (una por línea).

**Editorial** — `badge` (texto libre), `featured` (checkbox), `editorial_order`
(número).

**Información adicional** — `additional_info` (nuevo, textarea libre).

**Publicación** — `published` (checkbox).

**Imágenes** — sin cambios de Fase 21/22A: imagen principal (subir/reemplazar)
e imágenes secundarias (agregar/eliminar), ver
[`fase21-storage-imagenes.md`](fase21-storage-imagenes.md).

Ningún campo es obligatorio. Ninguno bloquea el guardado si está vacío.
`published` nunca se activa automáticamente por tener imagen, descripción o
cualquier otro campo lleno — lo decide Ana manualmente, exactamente igual que
antes.

## Qué puede editar la administradora / qué no

Puede editar: todos los campos listados arriba, cada uno de forma
independiente (guardar uno no requiere llenar los demás).

No puede editar desde este panel, bajo ninguna circunstancia: `id`, `name`,
`price`, `stock`, `category` del POS. No existe ningún `<input>` para estos
campos en el formulario — la sección "Producto" los muestra como texto plano,
sin ningún control editable. A nivel de API, `api/admin/_lib/editorialFields.js`
sigue siendo la barrera real: `pickEditorialFields()` reconstruye el payload
campo por campo desde una lista fija (ahora 17 nombres), así que aunque
alguien enviara `name`/`price`/`stock` en el body de la petición, se
descartarían igual — probado explícitamente en
`scripts/test-admin-editorial-fields.js`.

## Información adicional — decisión de diseño

`additional_info` es deliberadamente **exclusivo del panel administrativo**:
se puede leer y escribir vía `/api/admin/catalog-metadata`, pero **no se
agregó** a la lista de columnas que selecciona `api/catalog/products.js` (la
API pública). Los ejemplos de uso mencionados (notas internas, información del
proveedor, observaciones comerciales) son por naturaleza contenido interno, no
pensado para mostrarse a una clienta — se prefirió el default más seguro.
Si en el futuro se decide mostrar parte de esta información públicamente, es
un cambio aditivo simple (agregar la columna a `METADATA_COLUMNS` y al
`shapeProduct()` de `merge.js`), documentado aquí como pendiente, no
implementado.

## Categoría VIBE vs. categoría POS vs. `categoryGroup`

Tres conceptos distintos, sin duplicarse entre sí:

- `products.category` — dato operativo del POS, nunca se toca.
- `categoryGroup` — mapeo estático ya existente desde Fase 6
  (`api/catalog/_lib/categoryGroups.js`), derivado automáticamente de
  `products.category`. Sigue funcionando exactamente igual, sin cambios — es
  el *fallback* cuando no hay una categoría editorial asignada.
- `catalog_metadata.category` (**nuevo**, expuesto públicamente como
  `editorialCategory`) — la categoría VIBE real, asignada a mano por Ana,
  pensada exactamente para los casos que la Fase 20 documentó donde la
  categoría del POS es editorialmente incorrecta (ej. "Mascarilla Facial"
  categorizada como "Labios" en el POS).

No se modificó `taxonomy.js` del frontend público ni la lógica de agrupación
de `api/catalog/categories.js` en esta fase — wire real de `editorialCategory`
en la navegación pública queda para una fase posterior, una vez que existan
productos reales con esta categoría asignada.

## Modelo de datos — columnas nuevas

| Columna | Tipo | Nullable | Default | Propósito |
|---|---|---|---|---|
| `category` | `text` | sí | `NULL` | Categoría VIBE editorial (ver arriba) |
| `additional_info` | `text` | sí | `NULL` | Texto libre, exclusivamente administrativo |

Migración: [`supabase/manual/0002_catalog_metadata_editorial_category_and_notes.sql`](../supabase/manual/0002_catalog_metadata_editorial_category_and_notes.sql)
— **no ejecutada**, mismo patrón que `0001_catalog_metadata.sql` (Fase 9):
este entorno no tiene acceso de escritura DDL a Supabase, así que el archivo
queda listo para que Ana lo ejecute manualmente en el SQL Editor. No toca
`products`, `categories`, `sales` ni ninguna política RLS existente.

Se revisó el schema real de `catalog_metadata` antes de escribir la migración
(vía la especificación OpenAPI de PostgREST, solo lectura) para confirmar que
ninguna de las dos columnas ya existía y evitar así cualquier duplicación.

### ⚠️ Acción manual bloqueante antes de desplegar este código

**La migración debe ejecutarse antes de que este código llegue a
producción.** Se comprobó contra Supabase real (ver "Validación realizada
contra Supabase real" más abajo) que, mientras las columnas no existan:

- `GET /api/admin/catalog-metadata` deja de funcionar por completo (502) para
  **cualquier** producto, no solo para los que usan los campos nuevos — el
  `SELECT` incluye `category`/`additional_info` en la lista fija de columnas.
- `GET /api/catalog/products` (la API pública del catálogo) **también deja de
  funcionar por completo** (502), por el mismo motivo.
- `PATCH /api/admin/catalog-metadata` sigue funcionando con normalidad para
  todos los campos ya existentes; solo falla (502, sin corromper nada) si el
  payload incluye específicamente `category` o `additional_info`.
- `GET /api/catalog/categories` y `GET /api/admin/products` **no se ven
  afectados** — no se tocaron sus columnas.

Este es exactamente el mismo orden de dependencia ya usado en Fases 9→10→11
(esquema primero, confirmado por Ana, código activado después) — no se hizo
nada distinto aquí, solo se documenta con el mismo cuidado.

## Imágenes

Sin cambios de arquitectura. `api/admin/product-images.js`,
`_lib/storage.js` y `_lib/imageValidation.js` no se modificaron — se
reutilizan tal cual de Fase 21/22A. El bucket sigue siendo `product-images`,
sin bucket nuevo. Compatibilidad con imágenes legacy (`assets/products/brush.svg`)
intacta, sin cambios.

## Seguridad

Sin cambios en el mecanismo: `ADMIN_API_TOKEN` server-side, fail-closed,
`crypto.timingSafeEqual` (Fase 17). `SUPABASE_SERVICE_ROLE_KEY` nunca sale del
servidor. Los dos campos nuevos pasan por el mismo endpoint protegido
(`PATCH /api/admin/catalog-metadata`) y por la misma whitelist —
`api/admin/_lib/adminWrite.js` sigue escribiendo únicamente en
`catalog_metadata`, nunca en `products`.

## Tests

**33 tests nuevos** (`scripts/test-admin-editorial-fields.js`): cada uno de
los 15 campos editoriales guardado de forma independiente (15 tests), cada uno
dejado vacío/null sin error (15 tests), `additional_info` guardado y releído
tal cual (1 test), campos del POS (`id`/`name`/`price`/`stock`) rechazados
incluso mezclados con `category`/`badge`/`published` legítimos (1 test), y
`additional_info` confirmado ausente de la salida de `shapeProduct` — la API
pública (1 test).

Se actualizaron 2 tests existentes que quedaron desactualizados por el cambio
de whitelist: `scripts/test-admin-lib.js` (el conteo de campos editoriales
pasó de 15 a 17, y el test de "payload malicioso" se reescribió para reflejar
que `category` ahora es un campo editorial legítimo — la garantía real
("nunca escribe en `products`") no cambió, solo el ejemplo usado para
probarla) y `scripts/test-admin-handlers.js` (mismo ajuste). También se
actualizó `scripts/test-catalog-lib.js` para incluir `editorialCategory` en
el listado de claves esperadas de `shapeProduct()`.

**Total: 198/198** (165 heredadas + 33 nuevas), sin ninguna regresión.

## Validación realizada contra Supabase real

Con las credenciales reales (`.env.local`), invocando los handlers reales
(mismo método de Fase 15/18/21/22A):

- Confirmado que, **antes de la migración**, tanto `GET /api/admin/catalog-metadata`
  como `GET /api/catalog/products` fallan con `502` / error Postgres `42703`
  ("column does not exist") — documentado arriba como bloqueante.
- Confirmado que un intento real de `PATCH category=Rostro` para el producto
  56 falla limpiamente (`502`, error Postgres `PGRST204`, sin escribir nada
  parcial — PostgREST rechaza la petición completa antes de tocar la fila).
- Confirmado, con una consulta directa que solo usa columnas ya existentes,
  que el producto 56 **no sufrió ningún cambio** por estos intentos: sigue con
  `image` apuntando a la imagen real subida en Fase 22A, `images: []`,
  `published: true`, intacto.

No se ejecutó ninguna prueba de integración de Storage (Fase 21/22A) de
nuevo, tal como pedían las instrucciones — no hubo cambios en esa
infraestructura.

## Cómo usar el panel

Al editar un producto, el formulario ahora aparece dividido en secciones con
encabezados claros (Producto → Imágenes → Información del producto →
Clasificación VIBE → Editorial → Información adicional → Publicación), cada
campo con su propio `<label>` y, donde aplica, un placeholder que indica
"déjalo vacío si no lo sabes" en vez de exigir un valor. Se agregó un botón
"Cancelar" junto a "Guardar cambios".

## Acciones manuales pendientes para Ana

1. **Bloqueante**: ejecutar
   `supabase/manual/0002_catalog_metadata_editorial_category_and_notes.sql`
   en el SQL Editor de Supabase **antes** de que este código se despliegue.
2. Ninguna otra — no se requieren nuevas variables de entorno, no se creó
   ningún bucket nuevo, no se tocó ninguna política RLS.
