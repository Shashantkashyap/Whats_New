const test = require("node:test");
const assert = require("node:assert");
const { spec, mountDocs, postmanCollection } = require("../docs/openapi");

test("openapi spec is well-formed and covers the new surfaces", () => {
  assert.equal(spec.openapi, "3.0.3");
  assert.ok(spec.paths["/api/v1/tests"], "tests path present");
  assert.ok(spec.paths["/api/v1/tests/{id}/evaluate"], "mains evaluate path present");
  assert.ok(spec.paths["/api/v1/news/saved"], "saved news path present");
  assert.ok(spec.paths["/api/v1/news/{id}/save"].post, "save path present");
  assert.ok(spec.paths["/api/v1/news/feed"], "public feed path present");
  // Feed must NOT require auth (public daily news).
  assert.equal(spec.paths["/api/v1/news/feed"].get.security, undefined);
  assert.ok(spec.paths["/api/v1/media/{id}"], "media proxy path present");
  assert.ok(spec.paths["/api/v1/media/upload/{testId}/{questionId}"], "async OCR upload path present");
  assert.ok(spec.paths["/api/v1/media/upload/{testId}/{questionId}"].post.security, "OCR upload requires auth");
  assert.ok(spec.paths["/api/v1/media/ocr-status"], "OCR status poll path present");
  assert.match(spec.paths["/api/v1/tests/{id}/answers"].post.description, /ocr-status/i);
  assert.match(spec.paths["/api/v1/news/swipe-decks"].get.description, /excludes cards already recorded/i);
  assert.ok(spec.paths["/api/v1/news/{id}/challenge/status"], "challenge status path present");
  assert.ok(spec.paths["/api/v1/news/{id}/challenge/answer-mcq"], "challenge answer-mcq path present");
  assert.ok(spec.paths["/api/v1/news/{id}/challenge/submit-mcq"], "challenge mcq path present");
  assert.ok(spec.paths["/api/v1/news/{id}/mains/submit"], "mains submit path present");
  assert.ok(spec.paths["/api/v1/content/schedulers"], "schedulers status path present");
  assert.ok(spec.paths["/api/v1/news/{id}/challenge/status"].get.security);
  assert.ok(spec.paths["/api/v1/news/{id}/challenge/answer-mcq"].post.security);
  assert.ok(spec.paths["/postman/WhatsNew.postman_collection.json"], "postman download path present");
  // Feed / challenge descriptions should be detailed (flow + implementation).
  assert.match(spec.paths["/api/v1/news/feed"].get.description, /Implementation/i);
  assert.ok(spec.paths["/api/v1/auth/login"].post.requestBody.content["application/json"].example);
  assert.ok(spec.paths["/api/v1/auth/login"].post.responses["200"].content["application/json"].example);
  // Tests must require auth.
  assert.ok(spec.paths["/api/v1/tests"].post.security);
  assert.equal(typeof mountDocs, "function");
});

test("postman collection is loadable (bundled into binary via require)", () => {
  assert.equal(typeof postmanCollection, "object");
  assert.ok(postmanCollection.info && postmanCollection.info.name);
  assert.ok(Array.isArray(postmanCollection.item));
  assert.ok(postmanCollection.item.length > 5);
});

test("mountDocs registers /docs, /openapi.json, and postman download", () => {
  const routes = [];
  const fakeApp = { get: (p) => routes.push(p) };
  mountDocs(fakeApp);
  assert.ok(routes.includes("/openapi.json"));
  assert.ok(routes.includes("/docs"));
  assert.ok(routes.includes("/postman/WhatsNew.postman_collection.json"));
});
