// Response envelope required by the Executive Intelligence front-end suite.
// Every payload uses status "success" | "error"; errors always carry an
// explicit `code` so the client can branch without string-matching messages.

function apiOk(res, data = {}, { metadata, statusCode = 200 } = {}) {
  const body = { status: "success" };
  if (metadata !== undefined) body.metadata = metadata;
  body.data = data;
  return res.status(statusCode).json(body);
}

function apiErr(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({ status: "error", code, message });
}

module.exports = { apiOk, apiErr };
