// Minimal multipart/form-data parser using the platform Fetch FormData API.
// Avoids adding multer for a single-file upload surface.

async function parseMultipart(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const contentType = req.headers["content-type"];
  if (!contentType || !String(contentType).toLowerCase().includes("multipart/form-data")) {
    const err = new Error("Content-Type must be multipart/form-data");
    err.code = "INVALID_CONTENT_TYPE";
    throw err;
  }

  const headers = new Headers();
  headers.set("content-type", contentType);
  // Node undici requires duplex when a Request carries a body.
  const request = new Request("http://local.invalid/upload", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  });
  return request.formData();
}

async function fileFromForm(form, field = "image") {
  const entry = form.get(field);
  if (!entry || typeof entry === "string") return null;
  const ab = await entry.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    filename: entry.name || "upload.jpg",
    contentType: entry.type || "application/octet-stream",
  };
}

module.exports = { parseMultipart, fileFromForm };
