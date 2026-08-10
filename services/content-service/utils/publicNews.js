// Strip private / answer-key fields from News documents before they leave the API.

function publicNews(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete o.imageUrl;
  if (o.imageDocumentId) {
    o.image_document_id = String(o.imageDocumentId);
  } else {
    o.image_document_id = null;
  }
  delete o.imageDocumentId;

  // Never leak MCQ answer keys on read APIs — client gets options only.
  // Server grades via POST /news/:id/challenge/submit-mcq.
  if (Array.isArray(o.mcqs)) {
    o.mcqs = o.mcqs.map((m, i) => ({
      index: i,
      question: m.question,
      options: Array.isArray(m.options) ? m.options : [],
    }));
  }

  return o;
}

function publicNewsList(docs) {
  return (docs || []).map(publicNews);
}

module.exports = { publicNews, publicNewsList };
