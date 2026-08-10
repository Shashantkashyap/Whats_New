// Home-page curriculum tags and the category -> icon mapping shared by every
// news presenter. Kept as data (not code) so the front-end contract lives in
// one obvious place.

// Icon names match the front-end's icon set (lucide-style slugs).
const CATEGORY_ICONS = {
  polity: "shield",
  economy: "trending-up",
  relations: "globe",
  technology: "cpu",
  ethics: "compass",
};

const DEFAULT_ICON = "layers";

// Fixed curriculum tags shown on the home page.
//
// IMPORTANT: the dashboard filter was broken because it matched on
// News.categories, but the pipeline stores the same generic categories
// (["UPSC","Current Affairs"]) on every article — the real subject signal lives
// in News.tags (Polity, Economy, IR, "Science & Tech", …). So each curriculum
// tag now carries `matchTags` (the News.tags values that count toward it) and
// filtering/counting is done against `tags`. `matchCategories` is retained for
// backward compatibility. `all` is special-cased (counts every dossier).
// `is_priority` marks exam-critical topics that should surface first on the
// dashboard (the high-yield GS subjects). Data-driven so the front-end contract
// stays in one place.
const CURRICULUM_TAGS = [
  { id: "tag-all", slug: "all", label: "All Curriculum", icon: "layers", matchCategories: null, matchTags: null, is_priority: false },
  { id: "tag-polity", slug: "polity", label: "Polity & Governance", icon: "shield", matchCategories: ["Polity", "Governance"], matchTags: ["Polity", "Governance", "Judiciary", "Legal Affairs", "Public Administration"], is_priority: true },
  { id: "tag-economy", slug: "economy", label: "Economy & Development", icon: "trending-up", matchCategories: ["Economy", "Development"], matchTags: ["Economy", "Trade", "Finance", "Agriculture", "Infrastructure", "Energy", "Transport"], is_priority: true },
  { id: "tag-relations", slug: "relations", label: "International Relations", icon: "globe", matchCategories: ["Relations", "International Relations"], matchTags: ["IR"], is_priority: true },
  { id: "tag-tech", slug: "technology", label: "Science & Technology", icon: "cpu", matchCategories: ["Technology", "Science", "Science & Technology"], matchTags: ["Science & Tech", "Technology", "Cybersecurity", "Innovation"], is_priority: false },
  { id: "tag-ethics", slug: "ethics", label: "Ethics & Integrity", icon: "compass", matchCategories: ["Ethics", "Integrity"], matchTags: ["Ethics"], is_priority: false },
];

// Resolve a free-form category string to an icon slug. Case-insensitive and
// substring-based so "International Relations" -> globe, "Sci & Tech" -> cpu.
function iconForCategory(category) {
  if (!category) return DEFAULT_ICON;
  const c = String(category).toLowerCase();
  if (c.includes("polit") || c.includes("governance")) return CATEGORY_ICONS.polity;
  if (c.includes("econom") || c.includes("develop")) return CATEGORY_ICONS.economy;
  if (c.includes("relation") || c.includes("dipl" ) || c.includes("foreign")) return CATEGORY_ICONS.relations;
  if (c.includes("tech") || c.includes("science")) return CATEGORY_ICONS.technology;
  if (c.includes("ethic") || c.includes("integrity")) return CATEGORY_ICONS.ethics;
  return DEFAULT_ICON;
}

// Category names (as stored in News.categories) that a tag slug maps to, for
// building a DB filter. Returns null for "all" (no category filter).
function categoriesForSlug(slug) {
  if (!slug || slug === "all") return null;
  const tag = CURRICULUM_TAGS.find((t) => t.slug === slug);
  return tag ? tag.matchCategories : [slug];
}

// News.tags values a tag slug maps to — this is what the dashboard filter now
// uses (see CURRICULUM_TAGS note). Returns null for "all" (no tag filter). An
// unknown slug falls back to treating the slug itself as a literal tag so an
// arbitrary tag can still be filtered directly.
function tagsForSlug(slug) {
  if (!slug || slug === "all") return null;
  const tag = CURRICULUM_TAGS.find((t) => t.slug === slug);
  return tag ? tag.matchTags : [slug];
}

module.exports = { CURRICULUM_TAGS, CATEGORY_ICONS, DEFAULT_ICON, iconForCategory, categoriesForSlug, tagsForSlug };
