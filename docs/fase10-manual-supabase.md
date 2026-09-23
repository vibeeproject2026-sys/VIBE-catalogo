# Fase 10 — Ejecución manual en Supabase (paso a paso)

Este documento es para ti, no para Claude Code. Explica exactamente qué
hacer en el panel de Supabase, sin dar por sentado que conoces SQL a
fondo. El archivo que vas a ejecutar es:

```
supabase/manual/fase10_step1_activate_catalog.sql
```

Léelo también — cada bloque tiene un comentario arriba explicando qué
hace y qué resultado deberías ver.

---

## 1. Dónde entrar

Entra al panel de Supabase (`supabase.com` → tu cuenta) y abre el
**mismo proyecto que ya usa VibeBeauty/el POS** — es el mismo proyecto
donde viven `products`, `categories` y `sales` hoy. No es un proyecto
nuevo, no hay que crear nada ahí.

## 2. Dónde abrir el SQL Editor

En el menú lateral izquierdo del proyecto, busca **"SQL Editor"** (ícono
de `</>`). Haz clic en **"New query"** para abrir una pestaña en blanco.

## 3. Qué archivo ejecutar

`supabase/manual/fase10_step1_activate_catalog.sql`, dentro de este
repositorio (`VIBE-catalogo`). Ábrelo con cualquier editor de texto para
copiar el contenido.

## 4. Cómo ejecutarlo (bloque por bloque, no todo de una vez)

El archivo está dividido en 7 bloques, cada uno marcado así:

```
-- =====================================================
-- PASO N — TÍTULO
-- =====================================================
```

**Copia y pega un bloque a la vez** en el SQL Editor, ejecútalo (botón
"Run" o `Ctrl+Enter`), y **lee el resultado antes de pasar al
siguiente**. No pegues el archivo completo de una sola vez la primera
vez — así puedes detenerte de inmediato si algo no se ve como se
espera.

---

## 5. Qué resultado esperar en cada paso

**PASO 1 — Crear estructura.** No debería mostrar ningún resultado de
tabla (son sentencias de creación), solo un mensaje de éxito. Si dice
"already exists" para la tabla, está bien — significa que ya se había
creado antes; el script está preparado para eso.

**PASO 2 — Verificar estructura.** Debe devolver una tabla con **18
filas** (una por columna de `catalog_metadata`). Revisa que `product_id`
diga `bigint`.

**PASO 3 — Verificar relaciones.** Debe devolver **2 filas**: una
`PRIMARY KEY` y una `FOREIGN KEY` con `references_table = products`,
`references_column = id`, y `delete_rule = CASCADE`.

**PASO 4 — Verificar RLS.** Dos resultados:
- El primero debe decir `relrowsecurity = true`.
- El segundo debe mostrar **una sola política**, llamada
  `catalog_metadata_public_read_published`, con `cmd = SELECT` y
  `roles` incluyendo `anon`. **No debe haber ninguna política de
  INSERT, UPDATE ni DELETE.**

**PASO 5 — Insertar producto 56.**
- La primera consulta (5a) te dice si el registro ya existe. Si
  devuelve una fila, no hace falta ejecutar el INSERT (5b) — puedes
  saltar directo al Paso 6.
- Si (5a) no devolvió nada, ejecuta el INSERT (5b). Supabase debería
  mostrar algo como "Success. 1 rows affected" (o similar).

**PASO 6 — Verificar producto 56 (catalog_metadata).** Debe devolver
**exactamente 1 fila**, con `product_id = 56` y **`published = false`**.

**PASO 7 — Verificar products.** Debe devolver **exactamente esto, sin
ningún cambio**:

```
56 | Makeup Brush Set | Otro | 18000 | 3
```

Si algo de esta fila es distinto a lo que ya sabíamos, **detente y
avísame** — no debería haber cambiado nada ahí, ya que este archivo
nunca escribe sobre `products`.

---

## 6. Qué NO debes ejecutar todavía

- **No** existe en este archivo ningún `UPDATE ... SET published = true`
  — es intencional. La publicación del producto 56 es un paso posterior
  y separado, que haremos después de que confirmes estos resultados.
- No cambies nada en el frontend del catálogo.
- No cambies `CONFIGURED_MODE` en `js/data-source.js`.
- No pruebes todavía la API pública (`/api/catalog/products`).
- No generes ninguna venta ni toques `stock` en ningún momento.
- No ejecutes ningún `DROP` a menos que quieras deshacer algo a
  propósito (ver "Rollback" abajo) — y en ese caso, avísame primero.

## 7. Qué debes copiarme y enviarme al terminar

Por favor pega el resultado completo de:

1. **PASO 2** (las 18 filas de columnas).
2. **PASO 3** (las 2 filas de PK/FK).
3. **PASO 4** (los dos resultados: RLS habilitado + la política).
4. **PASO 6** (la fila completa de `catalog_metadata` para product_id=56).
5. **PASO 7** (la fila de `products` para id=56).

Con eso puedo confirmar que todo quedó exactamente como se esperaba
antes de seguir con la publicación y las pruebas de la API.

---

## Orden de ejecución recomendado

1. **PRIMERO:** ejecutar PASO 1 (creación de estructura).
2. **SEGUNDO:** ejecutar PASO 2 (verificar estructura).
3. **TERCERO:** ejecutar PASO 3 (verificar FK).
4. **CUARTO:** ejecutar PASO 4 (verificar RLS/policies).
5. **QUINTO:** ejecutar PASO 5 (insertar metadata del producto 56).
6. **SEXTO:** ejecutar PASO 6 (verificar metadata).
7. **SÉPTIMO:** ejecutar PASO 7 (verificar products 56, sin cambios).
8. **OCTAVO:** **DETENERSE.** Enviarme los resultados. Todavía no:
   publicar, probar la API, cambiar el frontend a modo API, cambiar
   `CONFIGURED_MODE`, generar una venta, ni tocar stock.

---

## Rollback (solo si algo sale mal y decides deshacerlo)

No ejecutes nada de esto "por si acaso" — solo si identificas un
problema real y decides deshacerlo. Avísame antes si tienes dudas.

- **Deshacer solo el registro del producto 56** (reversible, no afecta
  nada más):
  ```sql
  delete from catalog_metadata where product_id = 56;
  ```
- **Deshacer la tabla completa** (reversible también — es una tabla
  nueva, vacía de cualquier otro dato, nada más la referencia):
  ```sql
  drop table catalog_metadata;
  ```
  Esto **nunca** toca `products`, `categories` ni `sales` — la relación
  va en un solo sentido (`catalog_metadata` depende de `products`, no
  al revés), así que borrar `catalog_metadata` es seguro para el resto
  de la base.

No existe ningún escenario en este paquete que requiera tocar
`products`, `categories` o `sales` para deshacer algo — si alguna vez
parece que sí, deténte y pregúntame primero.
