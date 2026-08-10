const test = require("node:test");
const assert = require("node:assert");
const { CURRICULUM_TAGS, iconForCategory, categoriesForSlug, tagsForSlug } = require("../config/curriculum");

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

// The dashboard filter now matches News.tags (the real subject signal), which
// fixes the "tags filter not working" bug where every doc shared the same
// generic categories.
test("tagsForSlug maps a slug to the News.tags it should match", () => {
  assert.equal(tagsForSlug("all"), null);
  assert.equal(tagsForSlug(undefined), null);
  assert.ok(tagsForSlug("polity").includes("Polity"));
  assert.ok(tagsForSlug("economy").includes("Economy"));
  assert.ok(tagsForSlug("relations").includes("IR"));
  assert.ok(tagsForSlug("technology").includes("Science & Tech"));
  // Unknown slug falls back to the literal tag so any tag can be filtered.
  assert.deepEqual(tagsForSlug("Environment"), ["Environment"]);
});
