// Static editorial grouping, as decided in Fase 5
// (docs/fase5-catalog-metadata-model.md, section 3): the top-level
// "catalog group" (Maquillaje / Skincare / ...) is presentation logic
// owned by the catalog, not a table in Supabase. It mirrors the POS's
// own default category list (INIT_CATEGORIES in VibeBeauty/src/App.jsx)
// found during the Fase 4 audit.
//
// This mapping is configuration, not business law — revisit once real
// production categories are confirmed. Any POS category not listed here
// falls back to DEFAULT_GROUP rather than disappearing from the catalog.

const CATEGORY_GROUPS = {
  "Labios": "Maquillaje",
  "Rostro": "Maquillaje",
  "Ojos": "Maquillaje",
  "Uñas": "Maquillaje",
  "Skincare": "Skincare",
  "Otro": "Otros",
};

const DEFAULT_GROUP = "Otros";

function resolveCategoryGroup(posCategory) {
  return CATEGORY_GROUPS[posCategory] || DEFAULT_GROUP;
}

module.exports = { resolveCategoryGroup, CATEGORY_GROUPS, DEFAULT_GROUP };
