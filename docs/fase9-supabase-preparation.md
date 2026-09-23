# VIBE Catálogo — Preparación de Supabase y primer producto (Fase 9)

**Estado: NADA de esto se ejecutó contra Supabase.** Este documento y
los archivos SQL que acompaña (`supabase/migrations/0001_catalog_metadata.sql`,
`supabase/seed/first_product_template.sql`) son el entregable completo
de esta fase, listos para que alguien con acceso autorizado al proyecto
real los revise y ejecute.

## Por qué no se ejecutó nada

Se verificó explícitamente, antes de escribir cualquier SQL, si existían
credenciales de Supabase disponibles en este entorno:

- Variables de entorno del shell: ninguna `SUPABASE_*`.
- `.env.local` (el único archivo de entorno presente en el repo,
  gitignored): contiene únicamente `VERCEL_OIDC_TOKEN` (token propio de
  la CLI de Vercel, no relacionado con Supabase).
- Ningún otro archivo `.env*` en el proyecto.
- `.vercel/repo.json`: solo metadata de vinculación del proyecto a
  Vercel (nombre, id de proyecto/org) — sin secretos.

No existe acceso seguro y autorizado a Supabase en este entorno. Las
instrucciones de esta fase son explícitas: en ese caso, se detiene la
parte de ejecución y se entrega SQL + documentación en su lugar. Además,
se prohibió explícitamente reutilizar las credenciales embebidas del POS
(`VibeBeauty/api/db.js`) para esto — no se intentó.

## Qué se entrega en su lugar

| Archivo | Contenido | Ejecutado |
|---|---|---|
| `supabase/migrations/0001_catalog_metadata.sql` | `CREATE TABLE catalog_metadata` + `ENABLE ROW LEVEL SECURITY` + política de lectura pública para filas publicadas | **No** |
| `supabase/seed/first_product_template.sql` | Plantilla de `INSERT` con placeholders (`<PRODUCT_ID>`, etc.) + procedimiento paso a paso para elegir un producto real y validarlo antes de publicarlo | **No** — sin producto real, no se inventó ninguno |
| `scripts/test-migration-safety.mjs` | 17 verificaciones automáticas reales sobre el texto de esos dos archivos SQL | **Sí, ejecutado** (no contra Supabase — analiza el texto) |

## Tipos de datos

Se respetaron exactamente los tipos definidos en
`docs/fase5-catalog-metadata-model.md`, sin inventar alternativas:
`bigint` para `product_id`, `jsonb` para `images`/`benefits`/
`search_keywords` (consumible directamente como array/objeto en
JavaScript sin parseo manual), `text` para campos de texto libre,
`boolean` para `featured`/`published`, `timestamptz` para auditoría.

Única advertencia explícita dejada en el propio archivo SQL: el tipo
real de `products.id` no se pudo confirmar sin acceso a la base — se
asumió `bigint` (el default típico de Supabase) tal como ya se había
documentado en la Fase 5, pero se dejó como paso obligatorio de
verificación antes de ejecutar (`select data_type from
information_schema.columns where table_name='products' and
column_name='id'`).

## Relación con products

`catalog_metadata.product_id bigint primary key references products(id)
on delete cascade` — exactamente la relación y la política de
eliminación ya decididas en la Fase 5, reutilizadas sin reabrir la
decisión. Si el esquema real de `products` discrepara con esto (tipo de
`id` distinto, tabla en otro proyecto de Supabase), la migración no debe
forzarse — el propio archivo SQL deja esto como bloqueante en su
cabecera.

## RLS

**No se tocó ninguna política existente de `products`, `categories` ni
`sales`** — ni siquiera se pudo confirmar si RLS está habilitado hoy en
esas tablas (requeriría acceso que no existe); queda documentado como
pendiente de verificación por quien sí tenga acceso, sin que esto
bloquee la migración de `catalog_metadata` (que es una tabla nueva,
independiente).

Para `catalog_metadata`:

- **Lectura:** política para el rol `anon` limitada a `published = true`.
  Es defensa en profundidad, no un requisito funcional — la API actual
  (Fase 6) usa `service_role` (que ignora RLS) y ya filtra
  `published=true` en su propio código. El valor real de esta política
  es que, si algo en el futuro consulta esta tabla con la anon key,
  seguiría sin poder ver contenido no publicado.
- **Escritura (INSERT/UPDATE/DELETE, incluido cambiar `published` o
  `featured`):** sin política para ningún rol — sin una política
  explícita, RLS deniega por defecto. No existe ningún panel de
  administración ni sistema de autenticación en este proyecto todavía;
  quien necesite escribir esta tabla lo hace hoy directamente en el
  Table Editor de Supabase, con su propio acceso de proyecto.

## Datos públicos que seguiría exponiendo la API

Sin cambios respecto a la Fase 6 — no se tocó `api/catalog/*`: `id,
name, price, available, category, categoryGroup, subcategory, image,
images, shortDescription, description, benefits, ingredients, usage,
presentation, brand, badge, featured, editorialOrder`. Nunca `stock`,
`min_stock`, `cost_base`, `cost_pack`, `sales`, ni información personal.

## Primer producto real

**No se seleccionó ninguno** — hacerlo requiere leer `products` con
acceso real, que no existe en este entorno. `supabase/seed/first_product_template.sql`
documenta el procedimiento exacto: (1) `SELECT id, name, category, price,
stock FROM products ORDER BY id LIMIT 20;` para elegir uno, (2) completar
la plantilla con esos datos reales solamente donde corresponde (el
`product_id`, y una subcategoría **solo si se puede determinar con
seguridad** a partir de la categoría real del producto — si no, se deja
en `NULL`, sin inventar), (3) insertar con `published = false`, (4)
validar antes de considerar publicarlo.

## Imagen del primer producto (cuando se ejecute)

La plantilla especifica reutilizar una ruta ya existente en
`assets/products/*.svg` del propio catálogo (imagen conceptual, no una
fotografía real, no base64) — exactamente la misma infraestructura que
ya usan los productos demo, sin tocar el logo oficial ni subir nada
nuevo.

## Seguridad — verificación final

Se buscó explícitamente en todos los archivos generados en esta fase
(migración, plantilla, este documento, el script de pruebas) cualquier
patrón que pareciera un secreto (JWT, asignación de
`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`) — no se encontró
ninguno. No se creó ni modificó ningún archivo `.env`.

## Rollback (si algún día se ejecuta)

La migración es aditiva y no destructiva: solo crea una tabla nueva, no
modifica ninguna existente. Su rollback sería únicamente `DROP TABLE
catalog_metadata;` (documentado como comentario en el propio archivo) —
no hay ningún otro cambio que revertir porque no se tocó nada más.

## Tests

**91 pruebas ejecutadas de verdad con `node` en esta fase** (17 nuevas +
74 heredadas re-verificadas sin regresión): `test-migration-safety.mjs`
(17, nuevo — valida por texto que la migración nunca toca
products/categories/sales, nunca otorga escritura anónima, y que
`published` defaultea a `false`), más `test-catalog-lib.js` (18),
`test-catalog-handlers.js` (12), `test-data-source.mjs` (14),
`test-cart-integration.mjs` (5), `test-taxonomy.mjs` (19),
`test-url-state.mjs` (6). `node --check` sobre los 21 archivos JS del
proyecto.

**No ejecutado, por falta de credenciales:** cualquier prueba contra
Supabase real (crear la tabla, insertar el producto, `GET
/api/catalog/products` real, ver el producto en el frontend en modo
API). Las verificaciones que la Fase 6 ya cubre con datos mockeados
(solo aparecen productos `published=true`, campos internos nunca
aparecen en la respuesta) siguen pasando, pero eso valida el código, no
la base de datos real — son cosas distintas y se documentan como tales.

## Siguiente fase

Cuando exista acceso autorizado real a Supabase: (1) ejecutar
`0001_catalog_metadata.sql` después de confirmar el tipo de
`products.id`, (2) completar y ejecutar `first_product_template.sql`
con un producto real elegido a mano, (3) validar con `published=false`
primero, (4) solo entonces publicar ese único producto y probar el modo
API end-to-end (`?dataSource=api`) sin cambiar el default de
producción, tal como esta fase dejó preparado pero no ejecutado.
