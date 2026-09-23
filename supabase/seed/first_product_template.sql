-- FASE 9 — Plantilla para el primer producto real de catalog_metadata
--
-- ESTADO: NO EJECUTADA. NO contiene un producto real (no se tuvo acceso
-- a Supabase para leer uno — ver docs/fase9-supabase-preparation.md).
-- Todos los valores entre <> son placeholders que debe completar quien
-- tenga acceso real al proyecto, después de seguir los pasos de abajo.
-- No se inventó ningún id, nombre, precio ni categoría de producto.

-- PASO 1 — Elegir el producto real (solo lectura, no modifica nada):
--
--   select id, name, category, price, stock
--   from products
--   order by id
--   limit 20;
--
-- Elegir UNO solo. Anotar exactamente su id, name, category, price y
-- stock — se van a necesitar en el paso 3 para verificar, no para
-- copiarlos dentro de catalog_metadata (esa tabla nunca almacena esos
-- campos).

-- PASO 2 — Completar esta plantilla con datos reales:
--
--   <PRODUCT_ID>      -> el id real elegido en el paso 1 (ej. 7)
--   <SUBCATEGORY>     -> SOLO si se puede determinar con seguridad a
--                        partir de products.category del producto
--                        elegido (ej. category = 'Labios' ->
--                        subcategory podría ser 'Gloss' o 'Labiales',
--                        pero solo si el producto específico realmente
--                        corresponde a eso). Si no hay forma segura de
--                        saberlo, dejar NULL — no inventar.
--   <IMAGE_PATH>      -> ruta a una imagen conceptual ya existente en
--                        el propio repositorio del catálogo (ej.
--                        'assets/products/cleanser.svg'), NUNCA una
--                        fotografía real, NUNCA base64.
--   <SHORT_DESC>, <DESCRIPTION>, <USAGE>, <PRESENTATION> -> redactar
--                        acorde a la voz de marca VIBE (ver ADN de
--                        marca), coherente con el producto real elegido.
--   <BENEFITS_JSON>   -> array JSON de strings, ej. '["Punto 1","Punto 2"]'

insert into catalog_metadata (
  product_id,
  image,
  images,
  short_description,
  description,
  benefits,
  ingredients,
  usage,
  presentation,
  subcategory,
  brand,
  badge,
  featured,
  editorial_order,
  published
) values (
  <PRODUCT_ID>,
  '<IMAGE_PATH>',
  '[]'::jsonb,
  '<SHORT_DESC>',
  '<DESCRIPTION>',
  <BENEFITS_JSON>::jsonb,
  null,
  '<USAGE>',
  '<PRESENTATION>',
  <SUBCATEGORY_OR_NULL>,
  null,
  null,
  false,
  null,
  false   -- PASO 3 (obligatorio): dejar en false, validar todo primero.
);

-- PASO 3 — Validar ANTES de publicar (con published = false):
--
--   1. select * from catalog_metadata where product_id = <PRODUCT_ID>;
--      confirmar que la fila quedó como se esperaba.
--   2. curl "https://<deploy-del-catalogo>/api/catalog/products"
--      confirmar que este producto NO aparece todavía (published=false).
--   3. Solo si 1 y 2 son correctos, considerar:
--
--        update catalog_metadata set published = true
--        where product_id = <PRODUCT_ID>;
--
--      y repetir el paso 2 — ahora sí debería aparecer, con los campos
--      exactos descritos en docs/fase6-catalog-api.md y ninguno de los
--      campos prohibidos (stock, min_stock, cost_base, cost_pack).
--
-- No se ejecutó nada de este archivo. No se creó ningún pedido, no se
-- descontó stock, no se modificó products en ningún momento.
