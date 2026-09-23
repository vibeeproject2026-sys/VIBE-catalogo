-- =====================================================================
-- FASE 10 — PAQUETE DE EJECUCIÓN MANUAL (SQL Editor de Supabase)
-- =====================================================================
--
-- ESTADO: NO EJECUTADO por Claude Code. Este archivo es autocontenido
-- para que la usuaria lo ejecute manualmente, bloque por bloque, en el
-- SQL Editor de Supabase. Ver instrucciones paso a paso en
-- docs/fase10-manual-supabase.md.
--
-- Reutiliza el contenido ya revisado de:
--   - supabase/migrations/0001_catalog_metadata.sql (estructura + RLS)
--   - supabase/seed/product_56_makeup_brush_set.sql (registro editorial)
-- sin modificar ninguno de esos dos archivos — este es un tercer
-- archivo, autocontenido, pensado específicamente para copiar/pegar
-- bloque por bloque en el SQL Editor.
--
-- Producto real confirmado por la usuaria vía consulta directa a
-- products (sin modificar products en ningún momento):
--   id = 56, name = 'Makeup Brush Set', category = 'Otro',
--   price = 18000, stock = 3
--   products.id es bigint (confirmado por la usuaria).
--
-- Este archivo NUNCA:
--   - modifica products, categories ni sales;
--   - cambia precios, stock ni costos;
--   - publica el producto (published queda en false — la activación
--     con published = true es un paso futuro, deliberadamente NO
--     incluido aquí);
--   - crea más de un registro editorial.
--
-- Recomendación: ejecutar UN BLOQUE A LA VEZ, leyendo el resultado
-- antes de continuar con el siguiente. No ejecutar todo el archivo de
-- una sola vez la primera vez que se usa.


-- =====================================================
-- PASO 1 — CREAR ESTRUCTURA
-- =====================================================
-- Crea la tabla catalog_metadata si todavía no existe (seguro de
-- ejecutar más de una vez: usa IF NOT EXISTS y, para la política,
-- DROP POLICY IF EXISTS antes de recrearla — no falla si ya se había
-- ejecutado antes).

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

  -- visibilidad — default false a nivel de esquema
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

alter table catalog_metadata enable row level security;

drop policy if exists "catalog_metadata_public_read_published" on catalog_metadata;
create policy "catalog_metadata_public_read_published"
  on catalog_metadata
  for select
  to anon
  using (published = true);

-- No se crea ninguna política para `authenticated` ni ninguna política
-- de INSERT/UPDATE/DELETE para ningún rol. No se toca RLS de
-- products/categories/sales en ningún punto de este archivo.


-- =====================================================
-- PASO 2 — VERIFICAR ESTRUCTURA
-- =====================================================
-- Resultado esperado: 18 filas (una por columna), con `product_id` de
-- tipo bigint, `published`/`featured` boolean con default false,
-- `images`/`benefits`/`search_keywords` jsonb con default '[]'.

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'catalog_metadata'
order by ordinal_position;


-- =====================================================
-- PASO 3 — VERIFICAR RELACIONES
-- =====================================================
-- Resultado esperado: dos filas — una PRIMARY KEY sobre product_id, y
-- una FOREIGN KEY de product_id hacia products(id) con
-- delete_rule = 'CASCADE'.

select
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name as fk_column,
  ccu.table_name as references_table,
  ccu.column_name as references_column,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
left join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name and tc.table_schema = rc.constraint_schema
where tc.table_schema = 'public'
  and tc.table_name = 'catalog_metadata'
  and tc.constraint_type in ('FOREIGN KEY', 'PRIMARY KEY');


-- =====================================================
-- PASO 4 — VERIFICAR RLS
-- =====================================================
-- Resultado esperado (primera consulta): relrowsecurity = true.
-- Resultado esperado (segunda consulta): UNA sola política,
-- "catalog_metadata_public_read_published", cmd = SELECT, roles
-- incluye {anon}, qual = "(published = true)". Ninguna política de
-- INSERT/UPDATE/DELETE.
--
-- Esto NO toca ni consulta cambios sobre products/categories/sales —
-- solo confirma el estado de catalog_metadata.

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname = 'catalog_metadata';

select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'catalog_metadata';


-- =====================================================
-- PASO 5 — INSERTAR PRODUCTO 56
-- =====================================================
-- 5a. Verificar primero si el registro ya existe (ejecutar esta
--     consulta y LEER el resultado antes de continuar):
--       - Si devuelve 0 filas: es seguro continuar con 5b.
--       - Si devuelve 1 fila: el registro YA EXISTE. No hace falta
--         (ni conviene) volver a insertarlo — pasar directo al PASO 6
--         para verificarlo con lo que ya hay.

select product_id, published
from catalog_metadata
where product_id = 56;

-- 5b. Insertar el registro editorial, SOLO si 5a devolvió 0 filas.
--     Este INSERT es además idempotente por sí mismo (WHERE NOT
--     EXISTS): si por alguna razón ya existiera, no duplica la fila ni
--     falla, simplemente no inserta nada — no es un UPDATE, así que
--     nunca sobreescribe silenciosamente un registro existente.
--
--     Contiene ÚNICAMENTE product_id + campos editoriales. NO incluye
--     name, price, stock ni category — esos siguen viviendo solo en
--     products. published queda en false a propósito.

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
)
select
  56,
  'assets/products/brush.svg',
  '[]'::jsonb,
  'Set de brochas para tu ritual de maquillaje.',
  'Una selección de brochas que forma parte de la curaduría VIBE.',
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
  false
where not exists (
  select 1 from catalog_metadata where product_id = 56
);


-- =====================================================
-- PASO 6 — VERIFICAR PRODUCTO 56 (catalog_metadata)
-- =====================================================
-- Resultado esperado: exactamente 1 fila, product_id = 56,
-- published = false, image = 'assets/products/brush.svg',
-- short_description y description con el texto de arriba,
-- search_keywords = ["brochas","set de brochas","maquillaje"],
-- benefits = [], y el resto de campos editoriales en NULL.

select *
from catalog_metadata
where product_id = 56;


-- =====================================================
-- PASO 7 — VERIFICAR PRODUCTS (solo lectura, sin modificar nada)
-- =====================================================
-- Resultado esperado, sin ningún cambio respecto a antes de este
-- archivo:
--   56 | Makeup Brush Set | Otro | 18000 | 3
--
-- Si algo de esto es distinto, DETENERSE y avisar antes de continuar —
-- no debería haber cambiado nada aquí.

select id, name, category, price, stock
from products
where id = 56;

-- =====================================================
-- FIN DEL PASO 7 — DETENERSE AQUÍ.
-- =====================================================
-- NO ejecutar todavía ningún UPDATE de publicación. Ese paso (cambiar
-- published a true para product_id = 56, y solo para ese producto) es
-- deliberadamente un paso posterior y separado, que se hará después de
-- revisar estos resultados. No está incluido en este archivo.
