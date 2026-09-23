# VIBE Catálogo — Panel editorial (Fase 17)

Documenta la capa administrativa: `admin/` (frontend) y `api/admin/*`
(backend). Complementa `docs/fase6-catalog-api.md` — la API pública
(`/api/catalog/*`) no se tocó en esta fase.

## Arquitectura

```
POS/Supabase products  ──┐
                          ├──▶ api/admin/products.js (GET, admin-only)
catalog_metadata        ──┤    api/admin/catalog-metadata.js (GET/PATCH, admin-only)
                          │           │
                          │           ▼
                          │    admin/admin.js (frontend separado)
                          │
                          └──▶ /api/catalog/* (público, sin cambios) ──▶ js/data-source.js ──▶ catálogo público
```

`admin/` es un sitio estático independiente (`admin/index.html`,
`admin/admin.css`, `admin/admin.js`) — no importa ni modifica
`js/app.js`, `js/data-source.js`, `js/products.js` ni `css/styles.css`.
El catálogo público sigue exactamente igual que antes de esta fase.

## Autenticación — decisión y estado real

**No existía ningún mecanismo de autenticación en este proyecto**
(verificado explícitamente antes de construir nada: sin login, sin
sesiones, sin Supabase Auth en uso, nada). Construir un endpoint de
escritura sin protección habría sido inaceptable; inventar un login
falso (solo del lado del cliente, o con una contraseña visible en el
código) habría sido peor — exactamente lo que se pidió evitar.

Se implementó un **token compartido, server-side, fail-closed**
(`api/admin/_lib/auth.js`):

- Un único secreto (`ADMIN_API_TOKEN`), comparado con
  `crypto.timingSafeEqual` (protección contra timing attacks), exigido
  en el header `Authorization: Bearer <token>` de **cada** petición a
  `/api/admin/*`.
- **Si `ADMIN_API_TOKEN` no está configurado en el servidor, todo
  request se rechaza con `503`** — nunca hay un estado "abierto por
  defecto". Mismo principio que `api/catalog/_lib/env.js` (Fase 6).
- El frontend (`admin/admin.js`) pide el token una sola vez y lo guarda
  en `sessionStorage` (se borra al cerrar la pestaña, nunca en
  `localStorage`, nunca hardcodeado).

**Esto es honesto sobre sus límites:** es un único secreto compartido,
no un sistema de usuarios/roles — apropiado para el alcance explícito
de esta fase ("no construir usuarios/roles avanzados"), pensado para
un administrador (o un grupo pequeño y de confianza) que comparte el
mismo token, no para distinguir identidades individuales ni revocar
acceso a una persona sin rotar el token para todos.

### Qué falta para producción

1. **Configurar `ADMIN_API_TOKEN`** — no existe todavía, ni en
   `.env.local` ni en Vercel. Debe generarse un valor aleatorio largo
   (ej. `openssl rand -hex 32`) y agregarse como variable de entorno
   server-side en Vercel (Production/Preview), igual que
   `SUPABASE_SERVICE_ROLE_KEY`.
2. Si en el futuro se necesitan **varios administradores con identidad
   propia** (auditoría de quién publicó qué, revocar acceso
   individualmente), la vía natural es Supabase Auth (ya disponible en
   el mismo proyecto) — no está implementado, es una evolución futura,
   no un requisito de esta fase.
3. Recordar que **Vercel Deployment Protection** (SSO) sigue bloqueando
   todo el deployment actual, panel administrativo incluido — es una
   capa adicional, independiente de `ADMIN_API_TOKEN`, ya documentada en
   fases anteriores.

## Datos del POS — solo lectura, reforzado en 3 capas

1. `PRODUCT_COLUMNS = "id,name,price,stock,category"` — nunca se
   selecciona `cost_base`/`cost_pack`/`min_stock`, ni siquiera para
   mostrarlos: no se piden a Supabase en absoluto.
2. `admin/admin.js` nunca renderiza un campo de formulario editable
   para `name`/`price`/`stock`/`category` — solo aparecen en la sección
   "Información del POS (solo lectura)" del panel de edición, sin
   ningún `<input>`.
3. `api/admin/_lib/editorialFields.js` — el endpoint de escritura
   (`PATCH`) reconstruye el payload campo por campo desde una lista
   fija de 15 nombres; cualquier otra clave en el `body` (incluidos
   `name`/`price`/`stock`/`category`/`cost_base`/`cost_pack`/
   `min_stock`, o un intento de sobreescribir `product_id`) se descarta
   silenciosamente antes de construir la petición a Supabase — probado
   explícitamente con un payload malicioso en
   `scripts/test-admin-lib.js`.

A nivel de base de datos, la FK `catalog_metadata.product_id →
products(id)` además impide crear metadata para un `product_id` que no
exista — el intento se traduce a un `400` claro, no a un error crudo.

## Imágenes

**No se implementó carga de archivos.** El campo `image` del formulario
es un input de texto para pegar una ruta/URL ya existente — exactamente
el mismo formato que ya usa `catalog_metadata.image` desde la Fase 5
(ej. `assets/products/brush.svg`). Antes de construir una subida real
habría que decidir la infraestructura (Supabase Storage es la opción
más natural, dado que ya se usa el mismo proyecto, pero no se investigó
a fondo en esta fase porque no se pidió) — se dejó explícitamente
aislado, tal como pedía el encargo. Nunca se usa base64 ni se generan
rutas inventadas.

## Endpoints

- `GET /api/admin/products` — admin-only. Lista los 68 productos reales
  (POS: id/name/price/stock/category + `available` derivado) cada uno
  cruzado con su fila de `catalog_metadata` si existe. A diferencia de
  la API pública, **sí incluye el stock numérico** — decisión
  deliberada: es una herramienta interna autenticada, y el stock exacto
  es información operativa legítima para decidir si publicar un
  producto agotado, no un dato sensible como el costo.
- `GET /api/admin/catalog-metadata?product_id=NN` — admin-only. Detalle
  de un producto para el panel de edición.
- `PATCH /api/admin/catalog-metadata` — admin-only. `body: {product_id,
  ...campos editoriales}`. Hace upsert (`Prefer:
  resolution=merge-duplicates`) — crea la fila si el producto todavía
  no tiene metadata, o actualiza la existente. Nunca toca ninguna otra
  fila.

Ninguno de los dos endpoints admite CORS de otros orígenes
(deliberado: solo se llaman desde `admin/admin.js`, mismo origen).

## Testing

**19 pruebas nuevas, todas ejecutadas de verdad:**
- `scripts/test-admin-lib.js` (9) — lógica pura de `requireAdmin`
  (fail-closed sin token configurado, rechazo sin header, rechazo con
  token incorrecto, aceptación con el correcto) y `pickEditorialFields`
  (whitelist, incluyendo un payload malicioso con
  `name`/`price`/`stock`/`category`/`cost_base`/`cost_pack`/
  `min_stock`/`sales`/`transactions`, confirmando que solo sobreviven
  los campos editoriales).
- `scripts/test-admin-handlers.js` (10) — handlers reales con
  `fetch`/Supabase mockeados: 401/503/405 correctos, el payload que
  realmente saldría hacia Supabase en un `PATCH` con campos prohibidos
  (confirmando que nunca los contiene), traducción de violación de FK a
  `400` claro.
- Además: una prueba real (no mockeada) de `GET /api/admin/products`
  contra Supabase real, con un token temporal usado solo para esa
  verificación — confirmó los 68 productos reales, exactamente 1 con
  metadata y publicado (producto 56), sin ningún campo prohibido en la
  respuesta. No se ejecutó ningún `PATCH` real contra producción en
  esta fase.

Las 109 pruebas heredadas de fases anteriores se re-confirmaron sin
regresión. Total: **128/128**.
