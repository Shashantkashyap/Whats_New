const test = require("node:test");
const assert = require("node:assert");
const { publicNews } = require("../utils/publicNews");

test("publicNews strips imageUrl and exposes image_document_id", () => {
  const out = publicNews({
    _id: "n1",
    title: "x",
    imageUrl: "https://secret.cdn/never-return-me.jpg",
    imageDocumentId: "507f1f77bcf86cd799439011",
  });
  assert.equal(out.imageUrl, undefined);
  assert.equal(out.imageDocumentId, undefined);
  assert.equal(out.image_document_id, "507f1f77bcf86cd799439011");
});

test("publicNews returns null document id when missing", () => {
  const out = publicNews({ title: "x" });
  assert.equal(out.image_document_id, null);
});

test("publicNews redacts MCQ answer keys", () => {
  const out = publicNews({
    title: "x",
    mcqs: [{ question: "Q?", options: ["A", "B"], answer: "B" }],
  });
  assert.equal(out.mcqs[0].answer, undefined);
  assert.equal(out.mcqs[0].question, "Q?");
  assert.deepEqual(out.mcqs[0].options, ["A", "B"]);
});
