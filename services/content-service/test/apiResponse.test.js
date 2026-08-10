const test = require("node:test");
const assert = require("node:assert");
const { apiOk, apiErr } = require("../utils/apiResponse");

// Minimal res stub capturing status + json payload.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("apiOk emits status success with data and optional metadata", () => {
  const res = mockRes();
  apiOk(res, { feed: [] }, { metadata: { total_records: 0, page: 1, limit: 15, has_next: false } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "success");
  assert.deepEqual(res.body.data, { feed: [] });
  assert.equal(res.body.metadata.total_records, 0);
});

test("apiOk omits metadata when not provided", () => {
  const res = mockRes();
  apiOk(res, { tags: [] });
  assert.ok(!("metadata" in res.body));
});

test("apiErr emits status error with explicit code and status", () => {
  const res = mockRes();
  apiErr(res, "BRIEF_NOT_FOUND", "nope", 404);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { status: "error", code: "BRIEF_NOT_FOUND", message: "nope" });
});
