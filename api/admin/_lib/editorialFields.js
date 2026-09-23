// The only fields any admin write is ever allowed to touch. This is
// what actually prevents a request from smuggling name/price/stock/
// category/cost_base/cost_pack/min_stock (or anything else) into
// catalog_metadata — independent of what the client sends, only these
// keys are ever copied into the outgoing payload.
const EDITORIAL_FIELDS = [
  "image",
  "images",
  "short_description",
  "description",
  "benefits",
  "ingredients",
  "usage",
  "presentation",
  "subcategory",
  "brand",
  "badge",
  "search_keywords",
  "featured",
  "editorial_order",
  "published",
];

function pickEditorialFields(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  for (const key of EDITORIAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

module.exports = { EDITORIAL_FIELDS, pickEditorialFields };
