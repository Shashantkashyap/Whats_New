const test = require("node:test");
const assert = require("node:assert");
const { CURRICULUM_TAGS, iconForCategory, categoriesForSlug } = require("../config/curriculum");

test("curriculum exposes the six home-page tags with the 'all' tag first", () => {
  assert.equal(CURRICULUM_TAGS.length, 6);
  assert.equal(CURRICULUM_TAGS[0].slug, "all");
  for (const t of CURRICULUM_TAGS) {
    assert.ok(t.id && t.slug && t.label && t.icon);
  }
});

test("iconForCategory resolves known categories and defaults to layers", () => {
  assert.equal(iconForCategory("Polity"), "shield");
  assert.equal(iconForCategory("Economy & Development"), "trending-up");
  assert.equal(iconForCategory("International Relations"), "globe");
  assert.equal(iconForCategory("Science & Technology"), "cpu");
  assert.equal(iconForCategory("Ethics"), "compass");
  assert.equal(iconForCategory("Miscellaneous"), "layers");
  assert.equal(iconForCategory(null), "layers");
});

test("categoriesForSlug returns null for all and mapped names otherwise", () => {
  assert.equal(categoriesForSlug("all"), null);
  assert.equal(categoriesForSlug(undefined), null);
  assert.deepEqual(categoriesForSlug("polity"), ["Polity", "Governance"]);
  assert.deepEqual(categoriesForSlug("unknown-slug"), ["unknown-slug"]);
});
