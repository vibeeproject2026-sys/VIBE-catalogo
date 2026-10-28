-- FASE 22B — Migración propuesta para catalog_metadata
--
-- ESTADO: NO EJECUTADA. Igual que 0001_catalog_metadata.sql (Fase 9),
-- este repositorio no tiene acceso de escritura DDL a Supabase (PostgREST
-- no ejecuta DDL, y la conexión directa a Postgres nunca funcionó desde
-- este entorno — ver docs/fase21-storage-imagenes.md y el historial de
-- Fase 10). Este archivo es un entregable de diseño, listo para que
-- alguien con acceso autorizado al proyecto de Supabase (Ana) lo revise
-- y lo ejecute manualmente en el SQL Editor.
--
-- Esta migración NUNCA:
--   - toca products, categories, sales ni transactions;
--   - cambia ninguna política RLS existente (agregar columnas nullable
--     no afecta row-level security, que opera por fila, no por columna);
--   - borra ni renombra ninguna columna existente de catalog_metadata.
--
-- Qué agrega y por qué:
--
--   1. category (text, nullable)
--      "Categoría VIBE" — la categoría editorial de la Fase 20
--      (docs/fase20-curaduria-editorial-propuesta.md /
--      -decisiones.md: Rostro, Ojos, Labios, Limpieza, Tratamiento,
--      Herramientas de aplicación, Complementos de belleza), asignada
--      manualmente por la administradora desde /admin.
--
--      NO es un duplicado de products.category (la categoría del POS,
--      que sigue siendo la única fuente de verdad operativa) ni de
--      categoryGroup (que ya existe como un mapeo estático derivado de
--      products.category en api/catalog/_lib/categoryGroups.js — sigue
--      existiendo sin cambios, como respaldo/fallback). La Fase 20
--      documentó 5 casos reales donde la categoría del POS es
--      editorialmente incorrecta (ej. "Mascarilla Facial" clasificada
--      como "Labios" en el POS) — category en catalog_metadata es
--      exactamente el mecanismo para corregir eso de forma editorial,
--      sin tocar products.category.
--
--   2. additional_info (text, nullable)
--      "Información adicional" — campo de texto libre para cualquier
--      información editorial que la administradora quiera registrar y
--      que no tenga un campo específico (notas internas, información
--      del proveedor, observaciones comerciales, etc.). No se procesa,
--      no se interpreta, no se usa para generar ni inferir ningún otro
--      campo.
--
-- Nullable, sin default más allá de NULL, exactamente igual que el
-- resto de los campos de texto libre de esta tabla (short_description,
-- description, ingredients, usage, presentation, brand) — misma
-- convención que 0001_catalog_metadata.sql.

alter table catalog_metadata
  add column if not exists category text;

alter table catalog_metadata
  add column if not exists additional_info text;

-- Sin cambios de RLS: la política ya existente
-- "catalog_metadata_public_read_published" (solo lectura para `anon`,
-- filtrada por published = true) sigue aplicando igual a estas dos
-- columnas nuevas — RLS no distingue columnas, solo filas.
