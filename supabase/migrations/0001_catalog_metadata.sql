-- FASE 9 — Migración propuesta para catalog_metadata
--
-- ESTADO: NO EJECUTADA. Este repositorio no tenía credenciales de
-- Supabase disponibles cuando se escribió este archivo (ni
-- SUPABASE_URL ni SUPABASE_SERVICE_ROLE_KEY en ningún .env ni variable
-- de entorno), y las instrucciones de esta fase prohíben explícitamente
-- reutilizar las credenciales embebidas del POS (VibeBeauty) para
-- conectarse. Por eso este archivo existe como entregable de diseño,
-- listo para que alguien con acceso autorizado al proyecto de Supabase
-- lo revise y lo ejecute manualmente (SQL Editor de Supabase o `psql`).
--
-- Antes de ejecutar, quien tenga acceso debe:
--   1. Confirmar el tipo real de products.id:
--        select column_name, data_type
--        from information_schema.columns
--        where table_name = 'products' and column_name = 'id';
--      Si no es bigint/int8, ajustar el tipo de catalog_metadata.product_id
--      para que coincida exactamente antes de ejecutar este archivo.
--   2. Confirmar que esta tabla vivirá en el MISMO proyecto de Supabase
--      que products/sales/categories (decisión pendiente documentada en
--      docs/fase5-catalog-metadata-model.md) — si no es así, la FK de
--      abajo no es válida y hay que rediseñar antes de ejecutar.
--   3. Ejecutar esto en una transacción / con la posibilidad real de
--      revertir (DROP TABLE catalog_metadata; — la única operación de
--      rollback necesaria, ya que esta migración no toca ninguna tabla
--      existente).
--
-- Esta migración NUNCA:
--   - crea, modifica ni elimina products, categories o sales;
--   - cambia políticas RLS existentes de esas tablas;
--   - inserta datos (eso vive en supabase/seed/first_product_template.sql,
--     separado a propósito, y tampoco se ejecutó).
--
-- Tipos y campos: exactamente los definidos y justificados en
-- docs/fase5-catalog-metadata-model.md — no se inventó ningún tipo
-- alternativo aquí.

create table if not exists catalog_metadata (
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

  -- taxonomía del catálogo (subcategory únicamente — category sigue
  -- viniendo de products.category, nunca se duplica aquí)
  subcategory       text,

  -- comercial / editorial
  brand             text,
  badge             text,
  search_keywords   jsonb not null default '[]'::jsonb,
  featured          boolean not null default false,
  editorial_order   integer,

  -- visibilidad — default false a nivel de esquema: una fila nueva
  -- nunca queda pública por accidente, incluso si alguien la inserta
  -- sin especificar este campo explícitamente.
  published         boolean not null default false,

  -- auditoría
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table catalog_metadata is
  'Contenido de presentación/editorial del catálogo VIBE. NUNCA debe '
  'contener name, price, stock, category, cost_base, cost_pack ni '
  'min_stock — esos siguen viviendo exclusivamente en products (fuente '
  'operativa del POS). Ver docs/fase5-catalog-metadata-model.md.';

-- ── RLS ──────────────────────────────────────────────────────────────
--
-- No se tocan las políticas de products/categories/sales — esta fase no
-- las modifica bajo ninguna circunstancia.
--
-- Para catalog_metadata:
--
-- ESCRITURA (INSERT/UPDATE/DELETE, incluido cambiar `published` o
-- `featured`): sin política para ningún rol. Sin una política explícita
-- que la conceda, RLS deniega la operación por defecto. Hoy no existe
-- ningún panel de administración ni usuario autenticado — quien
-- necesite escribir esta tabla lo hace directamente en el Table Editor
-- de Supabase con su propio acceso de proyecto. La API pública
-- (api/catalog/*) nunca escribe: usa service_role solo para LEER, y
-- service_role de todas formas ignora RLS por completo — estas
-- políticas son para cualquier otro consumidor futuro (anon/authenticated),
-- no para la API actual.
--
-- LECTURA: se agrega una política de solo lectura para el rol `anon`,
-- limitada a filas publicadas. Esto es defensa en profundidad, no un
-- requisito funcional de la API actual (que usa service_role y ya
-- filtra published=true en el propio código de
-- api/catalog/products.js/categories.js, ignorando RLS). El valor de
-- esta política es que, si en el futuro alguien consulta esta tabla
-- directamente con la anon key (client-side, un error de arquitectura,
-- o un cambio futuro no revisado), seguiría sin poder ver contenido no
-- publicado — la tabla es segura por defecto incluso si otra capa falla.

alter table catalog_metadata enable row level security;

create policy "catalog_metadata_public_read_published"
  on catalog_metadata
  for select
  to anon
  using (published = true);

-- No se crea ninguna política para `authenticated` (no hay sistema de
-- login en este proyecto todavía) ni ninguna política de INSERT/UPDATE/
-- DELETE para ningún rol.
