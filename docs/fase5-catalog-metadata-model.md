# VIBE Catálogo — Modelo de datos `catalog_metadata` (Fase 5)

Documento de diseño. No representa una migración ejecutada — ninguna de las
estructuras aquí descritas existe todavía en Supabase. Sirve como referencia
técnica para la implementación de la Fase C (API del catálogo) y siguientes,
de modo que no haya que volver a investigar el problema desde cero.

Contexto previo: `Fase 4 — Auditoría de integración POS ↔ Catálogo` (ver
histórico de conversación / reporte de esa fase). Principio rector heredado:
**una sola fuente de verdad para los datos operativos** (POS/Supabase:
`products`, `sales`, `categories`); el catálogo administra únicamente datos
de presentación/experiencia.

---

## 1. Relación con `products`

```
catalog_metadata.product_id  →  products.id     (1:1, opcional)
```

- `catalog_metadata` es una tabla **satélite**, no una copia. Cada fila
  amplía exactamente un producto del POS con información de presentación.
- La relación es 1:1 y **opcional en ambos sentidos**:
  - Un producto puede existir en `products` sin tener todavía fila en
    `catalog_metadata` (producto recién creado en el POS, aún sin foto ni
    descripción).
  - Ningún producto debe aparecer en el catálogo público sin una fila en
    `catalog_metadata` con `published = true` (ver sección 8).
- Se asume que `catalog_metadata` vive en el **mismo proyecto/base de
  Supabase** que `products` (necesario para que la FK real funcione y para
  que la futura API del catálogo pueda hacer un único `JOIN` al leer). Si en
  el futuro se decide separarlo en otro proyecto, la FK se pierde y habría
  que revisar consistencia a nivel de aplicación en vez de a nivel de base
  de datos — **decisión pendiente**, ver sección 16 del reporte.

---

## 2. Propuesta de esquema (conceptual, no ejecutada)

```sql
-- PROPUESTA — NO EJECUTAR EN ESTA FASE
create table catalog_metadata (
  product_id        bigint primary key references products(id) on delete cascade,

  -- presentación
  image             text,
  images            jsonb not null default '[]'::jsonb,
  short_description text,
  description       text,
  benefits          jsonb not null default '[]'::jsonb,
  ingredients       text,
  usage             text,
  presentation      text,

  -- taxonomía catálogo (ver sección 3)
  subcategory       text,

  -- comercial / editorial
  brand             text,
  badge             text,
  search_keywords   jsonb not null default '[]'::jsonb,
  featured          boolean not null default false,
  editorial_order   integer,

  -- visibilidad
  published         boolean not null default false,

  -- auditoría
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

### Justificación campo por campo

| Campo | Tipo | Justificación | Incluido |
|---|---|---|---|
| `product_id` | `bigint` PK/FK | Vínculo 1:1 con el producto operativo. Es la clave de todo el modelo. | Sí |
| `image` | `text` | Imagen principal. Texto/URL, no base64 (ver sección 4). | Sí |
| `images` | `jsonb[]` | Galería. Array vacío por defecto = comportamiento idéntico al actual (una sola foto). | Sí |
| `short_description` | `text` | Usado hoy en la card de producto (`shortDescription`). | Sí |
| `description` | `text` | Usado hoy en el detalle de producto (`description`). | Sí |
| `benefits` | `jsonb[]` | Ya consumido por la UI actual (`benefits.map(...)`). | Sí |
| `ingredients` | `text` (nullable) | Ya consumido por la UI; hoy puede ser `null` (ej. producto "brush"). | Sí |
| `usage` | `text` | Ya consumido por la UI (`usage`). | Sí |
| `presentation` | `text` | Ya consumido por la UI (ej. "150 ml"). Es descriptivo, no operativo — no confundir con `stock`. | Sí |
| `subcategory` | `text` (nullable) | Navegación fina del catálogo (ver sección 3). | Sí |
| `brand` | `text` (nullable) | El ADN de marca define a VIBE como "experiencia multimarca" — dato de negocio real y potencialmente necesario. El POS no lo rastrea hoy. Se incluye vacío/opcional; **su uso real es una decisión de negocio pendiente**, no se asume que ya existe información para llenarlo. | Sí (opcional) |
| `badge` | `text` (nullable) | El sistema visual ya definido en Fase 2/3 contempla badges condicionales ("Nuevo", "Oferta") reemplazando el badge fijo "VIBE DEMO" ya removido en Fase 3. Este campo le da soporte de datos a una función de diseño ya aprobada. Texto libre (no enum) para no requerir migración cada vez que cambie el copy. | Sí |
| `search_keywords` | `jsonb[]` (nullable) | La búsqueda actual (`js/app.js`) concatena `name + category + shortDescription`. Términos adicionales no visibles (sinónimos, jerga de Instagram) mejoran el descubrimiento sin ensuciar la descripción pública — alineado con el pilar "descubrimiento" del ADN. Prioridad baja, puede quedar vacío indefinidamente. | Sí (opcional, baja prioridad) |
| `featured` | `boolean` | Reemplaza el `products.slice(0,4)` arbitrario de la sección "Destacados" (Fase 3) por un flag curable explícitamente. | Sí |
| `editorial_order` | `integer` (nullable) | Orden manual dentro de listas curadas. `null` = sin orden explícito (fallback a un criterio determinista, p. ej. orden de inserción). | Sí |
| `published` | `boolean`, default `false` | Controla si el producto existe operativamente en el POS pero **no** debe aparecer todavía en el catálogo público (sin foto/descripción lista). Ver sección 8. | Sí |
| `created_at` / `updated_at` | `timestamptz` | No pedidos explícitamente, pero estándar de buenas prácticas: trazabilidad de cuándo se publicó/editó contenido, costo casi nulo. Se documentan como adición justificada, no como "campo porque sí". | Sí (recomendado) |

### Campos evaluados y **descartados** en esta fase

| Campo propuesto | Decisión | Motivo |
|---|---|---|
| `active` (además de `published`) | **No incluir** | Sería redundante con `published` tal como está definido el problema hoy. Si en el futuro se necesita distinguir "oculto temporalmente por campaña" de "nunca completado", se agrega entonces (evitar over-engineering). |
| `SEO title` / `SEO description` | **No incluir todavía** | El catálogo hoy es una SPA de una sola página sin rutas individuales por producto (el detalle vive en un `<dialog>`, no en una URL propia). Sin página indexable por producto, estos campos no tendrían ningún efecto real. Revisitar si el catálogo gana rutas individuales por producto. |
| `collection` | **No como columna simple** | Un producto puede pertenecer a varias colecciones a la vez (ej. "Edición verano" + "Regalos"); un campo plano no modela bien esa relación. Se documenta como extensión futura: tabla `catalog_collections` + tabla puente `catalog_collection_products` (N:M). No se crea en esta fase por falta de UI que la consuma. |
| Copia de `category` (POS) dentro de `catalog_metadata` | **No incluir** | Duplicaría exactamente el dato operativo que el principio de "fuente única" prohíbe. La categoría operativa se lee siempre de `products.category` vía `JOIN`, nunca se copia. |
| Copia de `price`/`stock` | **No incluir** | Mismo motivo — son datos operativos, viven exclusivamente en `products`. |

---

## 3. Categorías y subcategorías — decisión

### Problema real encontrado

El ejemplo conceptual del prompt (`MAQUILLAJE → Labios → Gloss/Labiales`)
implica en realidad **tres niveles**, no dos:

1. **Grupo editorial de catálogo** (`Maquillaje`, `Skincare`, `Accesorios`…)
   — no existe en el POS, es puramente una agrupación de presentación.
2. **Categoría operativa del POS** (`Labios`, `Rostro`, `Ojos`, `Uñas`,
   `Skincare`, `Otro`) — dato real, ya existe, **no debe duplicarse**.
3. **Subcategoría fina** (`Gloss`, `Labiales`, `Bases`, `Rubores`…) — no
   existe en el POS, es específica del catálogo y varía por producto.

### Opción A vs Opción B (evaluadas según lo pedido)

**A) `subcategory` como columna plana en `catalog_metadata`**
- Ventajas: cero tablas nuevas, coherente con el modelo ya usado por el
  catálogo hoy (`categories = [...new Set(products.map(p => p.category))]`,
  Fase 2/3 — una lista plana derivada, sin jerarquía propia), rápido de
  consultar, fácil de migrar después a una estructura normalizada si hace
  falta (un string no se pierde al normalizar).
- Desventajas: sin vocabulario controlado (riesgo de typos: "Gloss" vs
  "gloss"), sin metadata propia por subcategoría (orden, ícono, imagen de
  portada para la card de "Explora tu VIBE").

**B) Entidades propias `catalog_categories` / `catalog_subcategories`**
- Ventajas: permite curaduría real por categoría (orden, imagen de
  portada, descripción), vocabulario controlado, más alineado a largo
  plazo con la sección "Explora tu VIBE" (Fase 3) si esa sección necesita
  contenido propio por categoría más allá de un conteo derivado.
- Desventajas: más tablas, más CRUD, más complejidad para un catálogo que
  hoy tiene 6 productos demo y una taxonomía todavía sin validar con datos
  reales — sobre-ingeniería para el volumen actual.

### Recomendación

**Opción A ahora, con el grupo editorial (nivel 1) resuelto como
configuración estática — no como tabla — y ruta de migración a Opción B
documentada para más adelante:**

- `catalog_metadata.subcategory` (texto plano) cubre el nivel 3.
- `products.category` (POS, sin duplicar) cubre el nivel 2, vía `JOIN`.
- El nivel 1 (agrupación editorial: qué categorías del POS caen bajo
  "Maquillaje" vs "Skincare" vs "Accesorios") se resuelve con un **mapeo
  estático dentro de la capa de API/adapter del catálogo** (un objeto de
  configuración, no una tabla), porque:
  - Son ~6 categorías del POS, cambian con muy poca frecuencia.
  - Es lógica puramente editorial/de presentación — pertenece al catálogo
    por principio (Fase 4), no a Supabase.
  - Evita crear una tabla nueva para gestionar un puñado de filas fijas.
  - Si más adelante hace falta que alguien no técnico lo edite sin
    depender de un deploy, se promueve a tabla (Opción B) sin romper nada
    — el dato de origen (`products.category`, `subcategory`) no cambia.
- **Regla de fallback obligatoria:** cualquier categoría del POS que no
  esté en el mapeo estático debe caer en un grupo por defecto (ej.
  "Otros"), nunca desaparecer silenciosamente del catálogo. Esto protege
  contra el riesgo de que alguien renombre/agregue una categoría en el POS
  sin avisar a quien mantiene el catálogo (ver sección de riesgos).

---

## 4. Imágenes — decisión

- **Texto/URL, nunca base64**, salvo excepción técnica concreta que no se
  identificó en esta auditoría. Motivos:
  1. Mantiene el payload de la futura API liviano y cacheable por el
     navegador (una URL se cachea por HTTP; un base64 no).
  2. Es directamente compatible con Supabase Storage: cuando exista
     fotografía real, subir el archivo a un bucket (ej. `catalog-images`)
     devuelve una URL pública — se guarda esa URL tal cual en `image`/
     `images`, **sin ningún cambio de esquema**.
  3. Coincide exactamente con cómo el catálogo ya renderiza imágenes hoy
     (`<img src="...">` con rutas locales) — el día de la integración,
     solo cambia el *valor* del `src`, no el mecanismo.
- `image` (`text`, nullable): imagen principal/portada.
- `images` (`jsonb`, array, default `[]`): galería adicional. Vacío =
  comportamiento idéntico al actual (una sola foto en el detalle).
- **Durante el desarrollo de esta fase**, si se llegaran a crear filas de
  prueba, `image`/`images` apuntarían a los mismos SVG locales que ya usa
  el catálogo (`assets/products/*.svg`) — mismo mecanismo, cero
  dependencia externa nueva. (No se crearon filas reales en esta fase —
  ver restricciones.)

---

## 5. Datos editoriales (`featured`, `editorial_order`, `badge`)

- `featured` + `editorial_order` reemplazan, cuando se conecte la API real,
  el `products.slice(0, 4)` arbitrario introducido en la Fase 3 para la
  sección "Descubre" de Home: la consulta futura sería
  `WHERE published = true AND featured = true ORDER BY editorial_order NULLS LAST`.
- `badge` da soporte de datos al sistema de badges condicionales ya
  definido visualmente en Fase 2/3 (reemplazo del badge fijo "VIBE DEMO").
- **No se construye un CMS en esta fase**, pero el esquema es
  deliberadamente "CMS-ready": son columnas simples que cualquier futura
  interfaz de administración — o, en el corto plazo, el propio **Table
  Editor de Supabase** usado directamente por alguien del equipo VIBE con
  acceso — puede editar sin tocar código. Vale la pena mencionarlo porque
  es, en la práctica, un panel de administración de costo cero disponible
  desde el día en que la tabla exista.
- `collections`: documentado como extensión futura (tabla N:M), no
  incluido ahora — ver tabla de campos descartados (sección 2).

---

## 6. Variantes — propuesta futura (no operativa todavía)

Refinamiento respecto a la Fase 4 (que dejó esto como "pendiente de
decisión de negocio"): con el modelo ya definido, el criterio de
propiedad es claro —

> **Si una variante necesita stock/SKU independiente, es un dato
> operativo y por lo tanto debe vivir del lado del POS/Supabase, no en
> `catalog_metadata`.**

Propuesta conceptual (no crear ahora):

```sql
-- FUTURO — NO EJECUTAR
create table product_variants (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references products(id) on delete cascade,
  sku         text not null unique,
  name        text not null,          -- "Rose", "50 ml"
  price       numeric,                -- null = hereda price del producto padre
  stock       integer not null default 0,
  created_at  timestamptz not null default now()
);
```

- Esto implica que, si el negocio decide seguir adelante, el POS
  (`VibeBeauty`) necesitaría una pantalla nueva de gestión de variantes —
  no es un trabajo que el catálogo pueda resolver por su cuenta.
- Mientras tanto, el catálogo sigue usando el `variants[]` puramente
  demo/estático que ya existe hoy en `products.js`, sin pretender que
  tenga respaldo operativo real.
- No se toma ninguna decisión operativa sobre variantes en esta fase, tal
  como se pidió explícitamente.

---

## 7. Precio, `oldPrice` y promociones

- `price` siempre proviene de `products.price` (POS). **No se duplica en
  `catalog_metadata` bajo ninguna forma.**
- Se descarta explícitamente guardar un `old_price` estático en
  `catalog_metadata`: es exactamente el mecanismo que puede quedar
  desactualizado respecto al precio real, que es el riesgo que el
  encargo pide evitar.
- **Propuesta correcta:** modelar promociones como reglas con vigencia,
  no como un número fijo — futura tabla (no creada ahora):

```sql
-- FUTURO — NO EJECUTAR
create table catalog_promotions (
  id             bigint generated always as identity primary key,
  product_id     bigint not null references products(id) on delete cascade,
  discount_type  text not null check (discount_type in ('percent','fixed')),
  discount_value numeric not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null
);
```

  El precio "anterior" mostrado sería siempre `products.price` leído en
  el momento, y el precio "con descuento" se calcularía en el momento a
  partir de la regla activa — nunca se almacena un número que pueda
  quedar viejo. Esto hace la desactualización **estructuralmente
  imposible**, en vez de depender de que alguien recuerde actualizar un
  campo. No se implementa en esta fase.

---

## 8. Estado publicado (`published`)

- `published boolean not null default false`.
- **Default `false` a nivel de esquema**, no solo de aplicación — así,
  aunque alguien inserte una fila sin especificar el campo, el producto
  no queda expuesto por accidente.
- Escenario cubierto explícitamente:
  `producto existe en products (POS) → sin fila en catalog_metadata, o
  con published=false → nunca aparece en GET /catalog/products`.
- Un producto **no necesita** una fila de `catalog_metadata` para existir
  en el POS — la ausencia de fila se trata igual que `published = false`
  (`LEFT JOIN` + `COALESCE(published, false)` en la futura consulta). Así
  nadie tiene que pre-crear filas vacías para cada producto nuevo del POS;
  una fila solo se crea cuando alguien empieza a curar ese producto para
  el catálogo.

---

## 9. Relación con stock / disponibilidad

- `catalog_metadata` **no tiene columna de stock**, por diseño — no
  "se evita duplicarlo", directamente no existe la posibilidad.
- La disponibilidad se calcula siempre en el momento de la consulta:
  `available = products.stock > 0`.
- Estados a futuro (documentados, no implementados):
  - `stock > 0` → disponible (comportamiento por defecto).
  - `stock = 0` → agotado (necesita un estado visual nuevo en la UI —
    trabajo de Fase D/E, no de esta fase).
  - Preventa futura: se podría agregar más adelante un campo opcional
    como `allow_preorder boolean` en `catalog_metadata` sin fricción,
    precisamente porque el stock nunca se movió de `products` — el mismo
    número sigue siendo la única fuente, solo cambiaría cómo se interpreta
    cuando es `0`. No se diseña en detalle todavía.

---

## 10. Seguridad — campos públicos vs protegidos

**Nunca exponer** (heredado de Fase 4, reconfirmado aquí):
`cost_base`, `cost_pack`, cualquier margen derivado, la tabla `sales`
completa, datos personales de clientes, credenciales/claves.

**Adicional identificado en esta fase:**
- `min_stock`: es un umbral interno de reabastecimiento, sin valor para
  el público — no debe exponerse.
- El **stock exacto** tampoco debería exponerse como número crudo en la
  API pública — recomendable exponer solo el booleano `available` (y,
  como mucho, un indicador difuso tipo "últimas unidades" con un umbral
  interno) en vez del conteo real, para no regalar inteligencia de
  inventario a cualquiera que consulte la API pública.
- Cualquier **escritura** sobre `catalog_metadata` (marcar `published`,
  `featured`, editar descripciones) **debe requerir autenticación de
  staff**, aunque sea "solo" contenido de presentación — un endpoint de
  escritura anónimo permitiría que cualquiera desfigure el catálogo
  público. No es dato operativo, pero sigue siendo escritura sensible.

**Endpoints futuros y su naturaleza:**
| Endpoint | Método | Acceso |
|---|---|---|
| `/catalog/products` | GET | Público, sin auth |
| `/catalog/categories` | GET | Público, sin auth |
| Edición de `catalog_metadata` (futuro panel) | POST/PATCH | Protegido — solo staff VIBE |
| `/catalog/orders` | POST | Protegido/validado — nunca vía el proxy genérico actual del POS (ver Fase 4, hallazgo de seguridad de `api/db.js`) |

---

## 11. Forma de la futura API (`GET /catalog/products`)

Confirmando y afinando la forma propuesta en el encargo, con origen de
cada campo explícito:

```json
{
  "id": "products.id (POS)",
  "name": "products.name (POS)",
  "price": "products.price (POS)",
  "available": "derivado de products.stock > 0 (nunca stock crudo)",
  "category": "products.category (POS, vía JOIN)",
  "categoryGroup": "derivado del mapeo estático (catálogo, ver sección 3)",
  "subcategory": "catalog_metadata.subcategory",
  "image": "catalog_metadata.image",
  "images": "catalog_metadata.images",
  "shortDescription": "catalog_metadata.short_description",
  "description": "catalog_metadata.description",
  "benefits": "catalog_metadata.benefits",
  "ingredients": "catalog_metadata.ingredients",
  "usage": "catalog_metadata.usage",
  "presentation": "catalog_metadata.presentation",
  "featured": "catalog_metadata.featured",
  "editorialOrder": "catalog_metadata.editorial_order",
  "badge": "catalog_metadata.badge",
  "brand": "catalog_metadata.brand"
}
```

Filtro obligatorio del lado del servidor (no del cliente):
`WHERE COALESCE(catalog_metadata.published, false) = true`.

`GET /catalog/categories` (conceptual): devolvería los grupos editoriales
estáticos (sección 3, nivel 1) con conteo de productos publicados por
grupo — reemplazando el conteo puramente derivado que hoy calcula
`js/app.js` sobre el array estático.

`POST /catalog/orders`: solo mencionado como arquitectura futura (Fase F),
sin diseño de payload todavía — depende de las decisiones de negocio
pendientes sobre reserva de stock (ver reporte, sección "Futuras ventas",
ya cubierto en Fase 4).

**Nada de esto se implementa en esta fase.**

---

## 12. Transición de `js/products.js`

```
products.js (demo, estático)  ─┐
                                 ├──▶  adapter/mapper  ──▶  UI (app.js)
API /catalog/products (futuro) ─┘
```

- Se propone (para construir en Fase C/D, **no ahora**) un nuevo módulo,
  ej. `js/data-source.js`, que exporte exactamente las mismas dos cosas
  que hoy exporta `products.js`: `products` y `categories`.
- Ese módulo decide, según un flag simple (ej. `DATA_SOURCE = "demo" | "api"`,
  no implementado todavía), si:
  - re-exporta tal cual el contenido actual de `products.js` (modo demo,
    comportamiento idéntico a hoy), o
  - hace `fetch` a `GET /catalog/products` / `GET /catalog/categories` y
    **traduce** la respuesta al mismo shape de objeto que `js/app.js` ya
    consume hoy (`id, name, category, price, oldPrice, shortDescription,
    description, benefits, ingredients, usage, presentation, variants,
    image, imageLabel`).
- **Punto clave:** `js/app.js` no necesita cambiar en absoluto para
  soportar esta transición, siempre que el adapter preserve el shape
  exacto — ese es precisamente el propósito de la capa intermedia: aislar
  a la UI de cualquier detalle de Supabase/API.
- `products.js` **no se elimina** ahora ni en la Fase C — sigue existiendo
  como fuente demo/desarrollo indefinidamente, tal como se pidió.

---

## 13. Estrategia demo vs producción

- **Demo:** `js/products.js`, datos ficticios, committeados al repo,
  seguros de compartir porque no son reales. Se mantiene como está.
- **Producción:** exclusivamente en Supabase (`products` + futura
  `catalog_metadata`), nunca mezclada en el mismo archivo/tabla que la
  demo.
- El "switch" del adapter (sección 12) es la única costura entre ambos
  mundos — permite seguir iterando visualmente sobre el catálogo (como en
  las Fases 2 y 3) completamente offline, sin credenciales de producción,
  incluso después de que la integración real exista.
- **No se insertaron datos de prueba en Supabase productivo en esta
  fase**, tal como exigen las restricciones. Si en el futuro se necesitan
  filas de prueba para validar la API, deberían crearse en un entorno no
  productivo (proyecto/rama de Supabase separada) — **decisión de
  infraestructura pendiente**, no resuelta aquí.

---

## Resumen de decisiones tomadas en esta fase

1. `catalog_metadata` 1:1 con `products`, FK real (mismo proyecto Supabase asumido).
2. Imágenes como texto/URL, nunca base64.
3. Subcategoría como columna plana (Opción A) + agrupación editorial de nivel superior como config estática en el adapter, no como tabla.
4. `oldPrice` descartado como campo estático; promociones a futuro se calculan en el momento a partir de reglas con vigencia, nunca se guarda un precio "viejo".
5. `published` con default `false` a nivel de esquema, ausencia de fila = no publicado.
6. Sin columna de stock en `catalog_metadata` — disponibilidad siempre derivada de `products.stock` en el momento de la consulta.
7. Variantes con stock propio, si se necesitan, son responsabilidad futura del POS, no del catálogo.
8. `js/products.js` se conserva; la transición futura pasa por una capa adapter que no obliga a tocar `js/app.js`.
