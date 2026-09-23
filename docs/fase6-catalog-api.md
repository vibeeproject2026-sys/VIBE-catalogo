# VIBE Catálogo — API propia (Fase 6)

Documenta la API construida en esta fase. El frontend (`js/app.js`,
`js/products.js`, `index.html`, `css/styles.css`) **no fue conectado
todavía** — eso es explícitamente trabajo de la Fase 7. Esta API existe
hoy de forma aislada, sin tráfico real, y sin datos de producción
verificados (ver "Estado de `catalog_metadata`" más abajo).

Complementa a `docs/fase5-catalog-metadata-model.md`, que define el
modelo de datos que esta API consume.

---

## Endpoints

### `GET /api/catalog/products`

Lectura pública, sin autenticación. Devuelve únicamente productos con
`catalog_metadata.published = true`.

**Query params opcionales** (todos combinables):

| Param | Efecto |
|---|---|
| `category` | Filtra por `products.category` exacto (también se usa como filtro en la consulta a Supabase, no solo en memoria). |
| `subcategory` | Filtra por `catalog_metadata.subcategory` exacto. |
| `featured` | `featured=true` → solo productos con `featured = true`. |
| `search` | Coincidencia de subcadena (case-insensitive) sobre nombre, descripción corta, categoría y subcategoría. |

**Respuesta `200`:**

```json
{
  "products": [
    {
      "id": 1,
      "name": "Daily Glow Cleanser",
      "price": 58900,
      "available": true,
      "category": "Skincare",
      "categoryGroup": "Skincare",
      "subcategory": "Limpieza",
      "image": "https://...",
      "images": [],
      "shortDescription": "Limpieza suave para comenzar tu ritual.",
      "description": "...",
      "benefits": ["Limpieza diaria", "Sensación fresca"],
      "ingredients": null,
      "usage": "...",
      "presentation": "150 ml",
      "brand": null,
      "badge": null,
      "featured": true,
      "editorialOrder": 1
    }
  ]
}
```

Orden de la lista: `featured` primero, luego `editorialOrder` ascendente
(los `null` al final), y como último criterio de desempate, nombre
alfabético. Nunca se usa un `slice(0, N)` arbitrario — la curaduría sale
siempre de los datos (`featured`/`editorial_order`).

### `GET /api/catalog/categories`

Lectura pública, sin autenticación. Devuelve la estructura de navegación
(grupo editorial → categoría POS → subcategorías), calculada únicamente
a partir de productos publicados.

```json
{
  "categories": [
    {
      "group": "Skincare",
      "count": 3,
      "categories": [
        { "category": "Skincare", "subcategories": ["Hidratación", "Limpieza"] }
      ]
    }
  ]
}
```

Un grupo/categoría con cero productos publicados **no aparece** en la
respuesta — decisión deliberada (ver comentario en
`api/catalog/categories.js`): mostrar una categoría vacía llevaría al
cliente a un callejón sin salida, contrario al principio de
"descubrimiento curado" definido en la Fase 2.

### Métodos y escritura

Ambos endpoints solo aceptan `GET` y `OPTIONS` (preflight). Cualquier
otro método responde `405 Method Not Allowed` con encabezado `Allow`.
**No existe ningún mecanismo de escritura** (`POST`/`PATCH`/`DELETE`) en
esta fase — ni sobre `products`, ni sobre `catalog_metadata`, ni sobre
ninguna otra tabla. Eso queda para una fase futura, explícitamente fuera
de alcance aquí.

---

## Campos expuestos vs. deliberadamente ocultos

**Expuestos** (whitelist explícita en `api/catalog/_lib/merge.js`,
función `shapeProduct`): `id`, `name`, `price`, `available`, `category`,
`categoryGroup`, `subcategory`, `image`, `images`, `shortDescription`,
`description`, `benefits`, `ingredients`, `usage`, `presentation`,
`brand`, `badge`, `featured`, `editorialOrder`.

**Nunca expuestos**, por diseño:
- `cost_base`, `cost_pack` (y cualquier margen derivado).
- `min_stock` (umbral interno de reabastecimiento).
- El **número exacto de stock** — solo se expone el booleano `available`
  (`stock > 0`). Exponer el conteo real regalaría inteligencia de
  inventario a cualquiera que consulte la API pública.
- `published` (es un control interno de visibilidad, no información que
  el cliente necesite ver).
- La tabla `sales` completa — nunca se consulta desde esta API.
- Cualquier dato personal de clientes.
- Credenciales de cualquier tipo.

La protección no depende únicamente de qué columnas se piden a Supabase
(`PRODUCT_COLUMNS`/`METADATA_COLUMNS` en cada endpoint, nunca
`select=*`): hay una segunda barrera independiente en `shapeProduct`,
que solo copia campos de una lista fija al objeto de salida. Aunque la
consulta a Supabase trajera columnas de más por error, nunca llegarían
al cliente.

---

## Seguridad

- **No es un proxy genérico.** A diferencia de `VibeBeauty/api/db.js`
  (auditado en Fase 4: acepta cualquier `table` desde el query string del
  cliente y reenvía cualquier método HTTP), esta API tiene exactamente
  dos endpoints de propósito específico. El nombre de tabla nunca viene
  del cliente — siempre es un literal (`"products"` o
  `"catalog_metadata"`) escrito en el código del propio endpoint.
  `ALLOWED_TABLES` en `_lib/supabaseRead.js` es una segunda barrera
  (defensa en profundidad), no el mecanismo real de control.
- **Sin `select=*`.** Cada consulta pide explícitamente solo las
  columnas necesarias.
- **Errores controlados.** Nunca se devuelve un stack trace ni el
  mensaje crudo de Supabase al cliente — el detalle se registra
  únicamente en `console.error` (logs del servidor), y el cliente recibe
  un mensaje genérico con el código HTTP apropiado (`500` variables de
  entorno ausentes, `502` fallo de Supabase, `503` tabla
  `catalog_metadata` inexistente, `405` método no permitido).
- **Parámetros de consulta.** `category`/`subcategory`/`search` se
  truncan a 100 caracteres y se pasan como valor de operando en la
  sintaxis de PostgREST (`eq.`/comparación), nunca como nombre de
  columna o tabla — no hay forma de que un valor de query string altere
  qué tabla o qué columnas se consultan.
- **Sin datos de producción tocados.** No se hizo ninguna llamada real a
  Supabase durante esta fase (ver sección de testing).

---

## CORS

Política explícita, configurable, sin `Access-Control-Allow-Origin: *`
(ese patrón fue el hallazgo de seguridad de la Fase 4 sobre
`api/db.js`).

- Variable de entorno opcional `CATALOG_ALLOWED_ORIGINS`: lista de
  orígenes separados por coma (ej.
  `https://catalogo.vibe.com,https://www.vibestore.com`). Cuando el
  dominio definitivo del catálogo esté decidido, se configura ahí — sin
  tocar código.
- Si no está definida, se usa una lista de orígenes de desarrollo local
  razonable (`localhost`/`127.0.0.1` en puertos comunes).
- Cualquier origen `https://*.vercel.app` se permite automáticamente
  (necesario para probar Vercel Preview Deployments, cuya URL es
  dinámica). Es una concesión pragmática, acotada a ese dominio, no un
  wildcard universal.
- Un origen fuera de esas listas simplemente no recibe el encabezado
  `Access-Control-Allow-Origin` — el navegador bloquea la lectura de la
  respuesta desde ese origen.

---

## Cache / revalidación

Siguiendo la estrategia decidida en la Fase 5 (consulta al cargar +
revalidación periódica ligera, sin Realtime todavía):

- `GET /api/catalog/products`:
  `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`
  — el navegador puede reusar la respuesta hasta 60s; la red de borde de
  Vercel puede servirla desde cache hasta 5 minutos, revalidando en
  segundo plano hasta 10 minutos adicionales.
- `GET /api/catalog/categories`: cache algo más largo
  (`max-age=120, s-maxage=600, stale-while-revalidate=1200`), porque la
  estructura de navegación cambia con menos frecuencia que precio/stock
  de un producto puntual.
- No se implementó Realtime ni polling desde el frontend — explícitamente
  fuera de alcance de esta fase.

---

## Variables de entorno

| Variable | Dónde se usa | Notas |
|---|---|---|
| `SUPABASE_URL` | `api/catalog/_lib/env.js` | Server-side únicamente. Sin prefijo `VITE_`/`NEXT_PUBLIC_` — este proyecto no tiene bundler de cliente, así que no hay riesgo de que se filtre al navegador por ese mecanismo, pero tampoco se usa ningún prefijo "público" por costumbre. |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/catalog/_lib/env.js` | Server-side únicamente. **Nunca** debe configurarse en el cliente ni aparecer en ningún archivo commiteado. Se lee exclusivamente de `process.env` dentro de una función serverless. |
| `CATALOG_ALLOWED_ORIGINS` | `api/catalog/_lib/cors.js` | Opcional. Lista de orígenes permitidos, separados por coma. |

**Ninguna de estas variables está configurada todavía** en este entorno
de desarrollo (se verificó explícitamente — ver sección de testing). No
se creó ningún archivo `.env` con valores, reales ni de ejemplo, en esta
fase.

### Por qué `service_role` y no `anon`

Decisión explícita pedida en el encargo ("confirma cuál mecanismo es
apropiado"): se eligió la **service role key**, mantenida
exclusivamente en el servidor, en lugar de la `anon key` + RLS. Motivo:
la Fase 4 dejó constancia de que el estado real de las políticas RLS
sobre el rol `anon` en este proyecto de Supabase **no está verificado**
(y hay indicios, por cómo está construido `api/db.js` del POS, de que el
rol `anon` podría tener permisos más amplios de lo deseable). Confiar en
RLS + `anon` sin haber confirmado esas políticas sería construir la
seguridad de una función pública sobre una base desconocida. Usando
`service_role` server-side, **el código de esta API es el único punto de
control real** (whitelist de tablas, whitelist de columnas, filtro
`published = true` siempre aplicado, sin excepciones) — no depende de
que la configuración de Supabase esté correcta. Es una decisión más
conservadora y más fácil de auditar.

---

## Estado de `catalog_metadata`

Sigue siendo una **decisión pendiente de la Fase 5**: no se verificó
(ni se intentó verificar) si la tabla existe en el proyecto de Supabase
real, porque no hay credenciales configuradas en este entorno y no se
debía intentar conectarse a producción en esta fase.

La API está escrita para comportarse correctamente en ambos escenarios:

- Si `catalog_metadata` **no existe todavía**: Supabase/PostgREST
  responde con el código `42P01` ("relation does not exist"), que el
  código traduce a un `503` con mensaje genérico ("Catálogo no
  disponible todavía"), y deja un registro claro en los logs del
  servidor (`catalog_metadata table not found — Fase 5 pending
  activation...`) para que quien revise los logs sepa exactamente qué
  falta activar.
- Si la tabla **existe y tiene filas** `published = true`: la API
  devuelve el catálogo normalmente.

### Qué falta para activar esto en producción

1. Confirmar (Fase 5, decisión pendiente) que `catalog_metadata` vive en
   el mismo proyecto Supabase que `products`.
2. Crear la tabla `catalog_metadata` según el esquema propuesto en
   `docs/fase5-catalog-metadata-model.md` (migración no ejecutada
   todavía).
3. Configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` como
   variables de entorno del proyecto en Vercel (Settings → Environment
   Variables), nunca en un archivo commiteado.
4. Opcional: configurar `CATALOG_ALLOWED_ORIGINS` cuando el dominio
   definitivo del catálogo esté decidido.
5. Publicar (`published = true`) al menos un `catalog_metadata` real
   para validar la respuesta con datos reales.

---

## Limitaciones conocidas (declaradas explícitamente, no descubiertas por accidente)

- El join entre `products` y `catalog_metadata` se hace **en memoria**
  dentro de la función serverless (dos consultas separadas), no con un
  `select=*,catalog_metadata(*)` embebido de PostgREST. Se documenta en
  `api/catalog/_lib/merge.js` por qué: no se puede verificar hoy que
  PostgREST reconozca la relación (la tabla no existe), y un join en
  memoria es más simple de razonar y de testear sin esa verificación. A
  este volumen de catálogo el costo es insignificante; se puede
  optimizar más adelante.
- `subcategory` es un campo de texto libre (Opción A de la Fase 5) — sin
  validación de vocabulario controlado a nivel de API.
- No hay paginación — deliberado, el volumen actual no la justifica
  (ver Fase 5/6, "no sobre-ingeniería").
- El filtro `category` se empuja a la consulta de Supabase;
  `subcategory`/`featured`/`search` se filtran en memoria después del
  join. Documentado como intencional dado el volumen actual; se puede
  empujar todo a la base de datos si el catálogo crece mucho.

---

## Cómo se conectará el frontend (Fase 7, no ejecutado aquí)

No se tocó `js/app.js`, `js/products.js`, `index.html` ni
`css/styles.css` en esta fase. Camino ya diseñado en Fase 5, sección 12
(`docs/fase5-catalog-metadata-model.md`): un futuro módulo adapter (ej.
`js/data-source.js`) exportará el mismo shape (`products`, `categories`)
que hoy exporta `products.js`, alimentado por `fetch("/api/catalog/products")`
y `fetch("/api/catalog/categories")` en vez de (o además de) los datos
demo estáticos, traduciendo la respuesta de esta API al shape exacto que
`js/app.js` ya espera. Esto es explícitamente trabajo de la Fase 7.
