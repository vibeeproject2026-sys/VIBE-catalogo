-- FASE 10 — Registro editorial real para product_id = 56 (Makeup Brush Set)
--
-- ESTADO: NO EJECUTADO. Preparado para que la usuaria lo ejecute en el
-- SQL Editor de Supabase — este entorno de trabajo no tiene
-- SUPABASE_URL ni SUPABASE_SERVICE_ROLE_KEY configurados (verificado
-- explícitamente antes de escribir este archivo, de nuevo, al inicio de
-- esta fase).
--
-- Producto real confirmado por la usuaria vía consulta directa a
-- products (sin modificar products en ningún momento):
--   id = 56, name = 'Makeup Brush Set', category = 'Otro',
--   price = 18000, stock = 3
--
-- Este INSERT nunca toca products — solo agrega la fila editorial
-- correspondiente en catalog_metadata. name/category/price/stock NO se
-- duplican aquí; la API (api/catalog/products.js) siempre los toma de
-- products vía product_id, tal como exige el modelo de la Fase 5.
--
-- Campos dejados en NULL/vacío deliberadamente, porque no existe
-- información confiable para sustentarlos sin inventar:
--   - subcategory: 'Otro' es la categoría catch-all del POS; no hay
--     forma honesta de derivar una subcategoría editorial de ahí.
--   - ingredients, usage, presentation, brand, badge: sin datos reales
--     del producto más allá de su nombre y categoría.
--   - benefits: se deja como array vacío (la columna es NOT NULL
--     jsonb con default '[]'), no como una lista de beneficios
--     inventados.
-- short_description/description y search_keywords sí se completan,
-- porque son copy editorial genérico derivable honestamente del propio
-- nombre/categoría del producto (no afirman ningún hecho específico no
-- verificable, como materiales, cantidad de piezas, etc.).
--
-- Imagen: se reutiliza assets/products/brush.svg, el SVG conceptual ya
-- existente en el catálogo para el producto demo "Essential Brush" —
-- temáticamente coherente con un set de brochas real, sin fotografía
-- real ni base64.

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
  search_keywords,
  featured,
  editorial_order,
  published
) values (
  56,
  'assets/products/brush.svg',
  '[]'::jsonb,
  'Set de brochas para tu ritual de maquillaje.',
  'Un set de brochas para acompañar tu rutina de maquillaje, parte de la curaduría VIBE.',
  '[]'::jsonb,
  null,
  null,
  null,
  null,
  null,
  null,
  '["brochas","set de brochas","maquillaje"]'::jsonb,
  false,
  null,
  false   -- Validar primero -- ver bloque de abajo -- publicar después con el UPDATE separado.
);

-- ── Validación ANTES de publicar (ejecutar y confirmar) ────────────────
--
--   select * from catalog_metadata where product_id = 56;
--   -- confirmar que la fila existe tal como se esperaba, published = false.
--
--   curl "https://<deploy-del-catalogo>/api/catalog/products"
--   -- confirmar que el producto 56 NO aparece todavía (published=false).

-- ── Publicación controlada (ejecutar SOLO después de validar arriba) ──
-- No publicar ningún otro producto además de este.
--
--   update catalog_metadata
--   set published = true, updated_at = now()
--   where product_id = 56;
--
-- Después repetir la validación con curl — ahora sí debería aparecer,
-- con exactamente los campos públicos descritos en
-- docs/fase6-catalog-api.md (id, name, price, available, category,
-- categoryGroup, subcategory, image, images, shortDescription,
-- description, benefits, ingredients, usage, presentation, brand,
-- badge, featured, editorialOrder) y ninguno de: stock, min_stock,
-- cost_base, cost_pack, sales.
