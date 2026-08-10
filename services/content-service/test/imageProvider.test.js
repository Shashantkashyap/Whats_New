const test = require("node:test");
const assert = require("node:assert");
const { getContentImageUrl, PLACEHOLDER } = require("../utils/imageProvider");

// With no provider keys configured, both providers short-circuit without any
// network call and the resolver must degrade to the placeholder. This is the
// smallest check that the fallback chain is wired correctly.
test("getContentImageUrl returns placeholder when no keys are set", async () => {
  const prevPixabay = process.env.PIXABAY_API_KEY;
  const prevUnsplash = process.env.UNSPLASH_ACCESS_KEY;
  delete process.env.PIXABAY_API_KEY;
  delete process.env.UNSPLASH_ACCESS_KEY;
  try {
    assert.equal(await getContentImageUrl("electoral bonds india"), PLACEHOLDER);
    assert.equal(await getContentImageUrl(""), PLACEHOLDER); // empty query is safe
  } finally {
    if (prevPixabay !== undefined) process.env.PIXABAY_API_KEY = prevPixabay;
    if (prevUnsplash !== undefined) process.env.UNSPLASH_ACCESS_KEY = prevUnsplash;
  }
});
