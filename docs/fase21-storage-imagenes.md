# VIBE Catálogo — Supabase Storage y gestión de imágenes (Fase 21)

Infraestructura para subir, reemplazar y eliminar imágenes de producto desde el
panel administrativo (`/admin`), usando Supabase Storage como repositorio único
de imágenes editoriales del catálogo. No depende de Instagram, Facebook ni de
archivos locales.

## Arquitectura

```
Admin (navegador)                    Vercel (server-side)                 Supabase
─────────────────                    ─────────────────────                ────────
admin/admin.js                       api/admin/product-images.js
  · selecciona archivo                 · requireAdmin (ADMIN_API_TOKEN)
  · FileReader -> data:...;base64,     · valida producto en products (GET)   products (solo lectura)
  · POST/DELETE /api/admin/            · valida tipo/tamaño/dimensiones
    product-images                       (_lib/imageValidation.js)
                                        · sube/borra el objeto
                                          (_lib/storage.js)                 Storage: bucket
                                        · actualiza catalog_metadata          "product-images"
                                          (_lib/adminWrite.js, ya existía)
                                                                             catalog_metadata
                                                                               .image / .images
```

El navegador **nunca** habla con Supabase directamente — ni con la API de
Storage ni con PostgREST. Todo pasa por `/api/admin/product-images`, protegido
por el mismo `ADMIN_API_TOKEN` fail-closed de la Fase 17
([`docs/fase17-admin.md`](fase17-admin.md)). `SUPABASE_SERVICE_ROLE_KEY` nunca
sale del servidor — confirmado por revisión de código: no existe ninguna
referencia a Supabase ni a la service role key en `admin/admin.js`.

## Bucket de Storage

**Se reutiliza el bucket existente `product-images`**, no se creó uno nuevo.

Antes de escribir código se verificó (lectura, vía Storage Management API con
la service role key, sin modificar nada) si ya existía un bucket relacionado:

```
GET /storage/v1/bucket → 1 bucket encontrado:
  { id: "product-images", name: "product-images", public: true,
    file_size_limit: null, allowed_mime_types: null }
```

Estaba **vacío** (`GET /storage/v1/object/list/product-images` → `[]`), así que
no hay ningún conflicto de nombres, ninguna estructura previa que romper, y
ninguna evidencia de que el POS (VibeBeauty) lo esté usando — se decidió
reutilizarlo en vez de crear `catalog-images` (el nombre sugerido en el encargo)
para no duplicar infraestructura, tal como pedían las instrucciones ("si existe
una estructura apropiada, reutilízala").

`file_size_limit` y `allowed_mime_types` del bucket están sin configurar
(`null` = sin restricción a nivel de Supabase). **No se modificó la
configuración del bucket** — la validación de tipo/tamaño/dimensiones se hace
enteramente en nuestro propio código server-side
(`api/admin/_lib/imageValidation.js`), que es la barrera real (igual que el
principio ya establecido en Fase 6 de que el whitelisting de columnas, no las
políticas de Supabase, es lo que realmente protege la API pública). Configurar
también el límite a nivel de bucket es una capa de defensa adicional opcional
— ver "Pendiente para Fase 22" / instrucciones manuales para Ana, más abajo.

## Estructura de paths

```
products/{product_id}/main.{ext}       — imagen principal
products/{product_id}/{NN}.{ext}       — imágenes secundarias (01, 02, 03...)
```

`product_id` (el id real de `products`, la fuente de verdad del POS) es la
única identidad usada en el path — nunca el nombre comercial del producto.
`{ext}` es `webp`, `jpg` o `png` según el tipo real del archivo subido (nunca se
renombra un archivo a `.webp` sin que sus bytes realmente sean WebP — ver
"Optimización automática" más abajo).

Implementado en `api/admin/_lib/storage.js`:
`buildMainPath(productId, ext)`, `buildSecondaryPath(productId, ext, seq)`.

`nextSecondarySeq()` calcula el siguiente número escaneando los paths ya usados
(el máximo + 1), no la longitud del arreglo `images[]` — evita colisionar con
un archivo existente si se eliminó una imagen intermedia antes de agregar una
nueva (ej. si quedan `01` y `03` tras borrar `02`, la siguiente es `04`, no
`03`).

## Seguridad

- El frontend nunca recibe `SUPABASE_SERVICE_ROLE_KEY` — todas las llamadas a
  Storage (`_lib/storage.js`) y a PostgREST (`_lib/supabaseRead.js`,
  `_lib/adminWrite.js`) ocurren en `api/admin/product-images.js`, que corre
  server-side en Vercel.
- Toda operación pasa por `requireAdmin()` (mismo mecanismo de la Fase 17:
  token compartido, `crypto.timingSafeEqual`, fail-closed con `503` si
  `ADMIN_API_TOKEN` no está configurado).
- No existe una API genérica de Storage: `api/admin/product-images.js` solo
  sabe construir paths bajo `products/{id}/` en el bucket fijo
  `product-images` — no hay ningún parámetro de request que permita elegir
  otro bucket u otra ruta arbitraria.
- El endpoint verifica que `product_id` exista en `products` (lectura, nunca
  escritura) **antes** de subir cualquier archivo — nunca se sube una imagen
  "huérfana" para un producto inexistente.
- Cualquier campo operativo del POS enviado en el body (`name`, `price`,
  `stock`, `category`, `cost_base`, etc.) se ignora por completo — el endpoint
  solo construye el payload hacia `catalog_metadata` con `{ product_id, image }`
  o `{ product_id, images }`, nunca con el body crudo. Probado explícitamente
  en `scripts/test-admin-images-handlers.js`.
- El endpoint nunca escribe en `products`, `categories`, `sales` ni
  `transactions` — la única tabla que toca para escritura es
  `catalog_metadata` (reutilizando `_lib/adminWrite.js`, ya auditado en Fase
  17), y el único bucket que toca es `product-images`.
- Sin CORS: como el resto de `/api/admin/*`, solo responde a peticiones del
  mismo origen.

## Público vs. privado — decisión

**Bucket público para lectura, escritura exclusivamente server-side.**

Justificación: el catálogo es público por diseño — las imágenes de producto no
son información sensible (a diferencia de `cost_base`, stock exacto o datos de
ventas, que nunca se exponen). Usar URLs firmadas agregaría complejidad
operativa real (expiración, regeneración, romper el cacheo del navegador/CDN)
sin ningún beneficio de seguridad, porque no hay nada que proteger en una foto
de un labial. La seguridad real está en la **escritura**: nadie puede subir,
reemplazar ni borrar una imagen sin pasar por `requireAdmin()` — el bucket
público solo afecta la **lectura**, que de todas formas ya era pública (es un
catálogo público).

Las URLs generadas tienen la forma:
```
{SUPABASE_URL}/storage/v1/object/public/product-images/products/{id}/main.webp
```
y se guardan tal cual en `catalog_metadata.image` / `catalog_metadata.images` —
el mismo contrato que ya existía (`image`/`images` como texto plano, ver
Fase 5).

## Modelo de datos (sin cambios de esquema)

No se agregó ninguna columna nueva. Se mantiene y se precisa el contrato ya
definido en Fase 5/17:

- `catalog_metadata.image` (texto): URL/path de la imagen principal. Puede ser
  una URL de Storage (`.../storage/v1/object/public/product-images/...`) o,
  por compatibilidad, un path legacy como `assets/products/brush.svg` (ver
  "Compatibilidad con producto 56" más abajo).
- `catalog_metadata.images` (arreglo de texto): URLs de imágenes secundarias,
  en el mismo formato.

No se guarda base64 ni binarios en la tabla — el archivo vive únicamente en
Storage; la tabla solo guarda la URL pública.

## Flujo de subida

**Imagen principal (`slot: "main"`):**
1. El admin selecciona un archivo en `/admin` → edición de producto → sección
   "Imágenes".
2. El navegador lo codifica a `data:` URL (`FileReader.readAsDataURL`) y hace
   `POST /api/admin/product-images` con
   `{ product_id, slot: "main", contentType, dataBase64 }`.
3. El servidor: confirma que el producto existe → decodifica el base64 →
   valida tipo/tamaño/dimensiones (`_lib/imageValidation.js`) → si es válido,
   sube el archivo a `products/{id}/main.{ext}` (upsert) → actualiza
   **primero** `catalog_metadata.image` con la nueva URL → si había una imagen
   principal anterior **propia** (subida por este mismo sistema) y su path
   cambió (p. ej. de `.jpg` a `.webp`), intenta borrarla de Storage de forma
   best-effort (no bloquea ni falla la respuesta si ese borrado falla).
4. La respuesta trae la URL nueva; el panel actualiza la vista previa y el
   campo de texto "Imagen (ruta o URL)" del formulario general, para que
   ambos flujos (subida y edición manual) queden sincronizados.

**Imagen secundaria (`slot: "secondary"`):** igual, pero el path usa el
siguiente número libre y la URL se agrega al final de `images[]` sin tocar las
demás.

**Eliminar una secundaria:** el admin hace clic en "Eliminar" sobre una
miniatura → `DELETE /api/admin/product-images` con `{ product_id, path }`
(la URL exacta guardada en `images[]`). El servidor **primero** quita esa URL
de `catalog_metadata.images` y confirma que la escritura fue exitosa; **solo
después** intenta borrar el archivo físico de Storage, también best-effort. Si
el borrado del archivo falla, el peor caso es un archivo huérfano en Storage
(inofensivo, limpiable después) — nunca una referencia rota en el catálogo.

## Validaciones aplicadas (servidor, siempre autoritativo)

| Regla | Valor | Bloquea o avisa |
|---|---|---|
| Tipo de archivo | `image/webp`, `image/jpeg`, `image/png` únicamente | Bloquea |
| Tamaño máximo | 3 MB | Bloquea |
| Dimensión mínima (principal) | 800×1000 px | Bloquea |
| Dimensión mínima (secundaria) | 400×400 px (más flexible: detalles, texturas) | Bloquea |
| Proporción recomendada (principal) | 4:5 vertical (±5% de tolerancia) | Solo aviso |
| Peso objetivo | ≤ 300 KB | Solo aviso |

Las dimensiones se leen directamente de la cabecera binaria del archivo (PNG:
chunk `IHDR`; JPEG: marcador `SOF0`/`SOF2`; WebP: `VP8X`/`VP8 `/`VP8L`) —
implementado en `api/admin/_lib/imageValidation.js` sin ninguna librería de
imágenes. Si el archivo está corrupto o no se pueden leer sus dimensiones, se
rechaza con un mensaje claro en vez de asumir que es válido.

El cliente (`admin/admin.js`) hace una verificación rápida de tipo/tamaño antes
de subir (mejor UX, feedback inmediato), pero el servidor siempre vuelve a
validar todo — el cliente nunca es la fuente de verdad.

## Optimización automática (WebP, resize, compresión) — deferida, documentada

Se investigó qué es viable en el runtime de Vercel sin agregar una dependencia
pesada. Conclusión: convertir a WebP, redimensionar y comprimir de forma
confiable requiere una librería de procesamiento de imágenes (p. ej. `sharp`),
que es un binario nativo — agregarla implicaría introducir `package.json` y
`node_modules` a un proyecto que hoy es deliberadamente cero-dependencias
(ninguna otra parte de VIBE-catalogo tiene build step ni dependencias).

Instrucción explícita del encargo: si la optimización automática requiere una
decisión arquitectónica adicional, documentarla y dejar la infraestructura
preparada sin introducir complejidad innecesaria — eso es lo que se hizo:

- **Lo que sí se implementó sin dependencias:** validación de tipo, tamaño y
  dimensiones leyendo la cabecera binaria (arriba).
- **Lo que se difiere a una decisión explícita futura:** conversión automática
  a WebP y redimensionado/compresión en el servidor.
- **Recomendación operativa mientras tanto:** el panel indica el estándar
  visual (WebP, 4:5, 1200×1500, ≤300KB) y pide al admin subir el archivo ya en
  ese formato — la mayoría de herramientas de edición/export modernas permiten
  exportar directamente a WebP.
- **Si en el futuro se decide implementar conversión automática**, la
  arquitectura ya está preparada para eso sin romper el contrato: el paso
  "sube el archivo a Storage" en `_lib/storage.js` es el único punto que
  tendría que cambiar (recibir el buffer ya optimizado antes de
  `uploadObject()`), sin tocar el endpoint, el modelo de datos ni el frontend.

## Compatibilidad con imágenes legacy (producto 56)

`product_id 56` (`Makeup Brush Set`, `published: true`) sigue teniendo
`catalog_metadata.image = "assets/products/brush.svg"` — **no se tocó**, y
sigue funcionando exactamente igual que antes: el campo `image` siempre fue,
y sigue siendo, un texto libre (URL o path relativo); el catálogo público
(`api/catalog/products.js` → `merge.js`) no distingue entre "es de Storage" o
"es un asset local", solo lo pasa tal cual al frontend.

Regla de seguridad explícita, probada en `scripts/test-admin-images-handlers.js`
("producto 56 legacy"): antes de intentar borrar una imagen principal anterior
al reemplazarla, el código verifica con `isOwnedPath()` que la URL empiece con
el prefijo real de nuestro propio bucket
(`{SUPABASE_URL}/storage/v1/object/public/product-images/`). Una imagen legacy
como `assets/products/brush.svg` nunca cumple esa condición, así que **nunca**
se intenta borrar — si alguien sube una nueva imagen principal para el producto
56 desde el panel, la nueva queda en Storage y la referencia vieja
(`assets/products/brush.svg`) simplemente se reemplaza en `catalog_metadata`,
sin ningún intento de borrar el asset local (que ni siquiera vive en Supabase).

## Compatibilidad general del catálogo público

Sin cambios en `api/catalog/products.js` ni en `merge.js` — ya manejaban
`image: metadata.image ?? null` y `images: Array.isArray(...) ? ... : []`
desde antes de esta fase. Un producto sin imagen, con solo principal, con
secundarias, o con una imagen legacy, sigue funcionando exactamente igual: el
fallback visual ya existente en el frontend público (no modificado en esta
fase) se sigue aplicando cuando `image` es `null`.

## Cómo usar el panel administrativo

1. Entrar a `/admin`, editar un producto.
2. Nueva sección **Imágenes**, antes de los campos editoriales de texto:
   - **Imagen principal**: vista previa actual (o "Sin imagen"), selector de
     archivo, botón "Subir / reemplazar principal". Al subir, se guarda de
     inmediato (no espera al botón general "Guardar").
   - **Imágenes secundarias**: miniaturas de las existentes, cada una con su
     botón "Eliminar" (con confirmación); selector de archivo + botón
     "Agregar secundaria".
   - Mensajes de error/aviso claros bajo cada control (tipo no permitido,
     archivo muy grande, dimensiones insuficientes, o avisos de proporción/peso
     que no bloquean la subida).
3. El campo de texto "Imagen (ruta o URL)" del formulario general sigue
   existiendo — se sincroniza automáticamente tras una subida, y también se
   puede seguir editando a mano (por ejemplo, para pegar una URL externa ya
   existente, igual que antes de esta fase).

## Límites

- 3 MB por archivo, tipos `webp`/`jpeg`/`png` únicamente.
- Sin reordenamiento de imágenes secundarias por arrastrar-y-soltar en esta
  fase (el modelo `images[]` ya lo permitiría — es simplemente un arreglo —
  pero se dejó fuera para no introducir complejidad de UI no pedida
  explícitamente; ver Fase 22).
- Sin conversión/optimización automática (ver arriba).
- Sin carga masiva: cada imagen se sube una por una desde el panel, para un
  catálogo de 68 productos esto es apropiado (ver también
  [`fase20-curaduria-editorial-decisiones.md`](fase20-curaduria-editorial-decisiones.md),
  que ya recomendaba cargar producto por producto, no por script masivo).

## Qué queda pendiente para la siguiente fase

- Carga real de imágenes a los 50 productos ya "listos para curaduría" (Fase
  20.2) — explícitamente fuera de alcance de esta fase.
- Decidir si se implementa conversión/optimización automática a WebP
  (requeriría agregar una dependencia — decisión arquitectónica explícita
  pendiente).
- Reordenamiento de imágenes secundarias (drag-and-drop) si se considera
  necesario una vez que haya productos con varias imágenes reales.
- Endurecer la configuración del bucket en Supabase (`file_size_limit`,
  `allowed_mime_types`) como capa adicional de defensa — ver instrucciones
  manuales para Ana, abajo (opcional, la validación real ya ocurre en
  nuestro código).
