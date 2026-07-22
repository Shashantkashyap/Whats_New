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

// Fixed curriculum tags shown on the home page. `matchCategories` lists the
// News.categories values that count toward this tag's active_dossiers_count.
// `all` is special-cased (counts every dossier).
const CURRICULUM_TAGS = [
  { id: "tag-all", slug: "all", label: "All Curriculum", icon: "layers", matchCategories: null },
  { id: "tag-polity", slug: "polity", label: "Polity & Governance", icon: "shield", matchCategories: ["Polity", "Governance"] },
  { id: "tag-economy", slug: "economy", label: "Economy & Development", icon: "trending-up", matchCategories: ["Economy", "Development"] },
  { id: "tag-relations", slug: "relations", label: "International Relations", icon: "globe", matchCategories: ["Relations", "International Relations"] },
  { id: "tag-tech", slug: "technology", label: "Science & Technology", icon: "cpu", matchCategories: ["Technology", "Science", "Science & Technology"] },
  { id: "tag-ethics", slug: "ethics", label: "Ethics & Integrity", icon: "compass", matchCategories: ["Ethics", "Integrity"] },
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

module.exports = { CURRICULUM_TAGS, CATEGORY_ICONS, DEFAULT_ICON, iconForCategory, categoriesForSlug };
