// Upload a binary buffer to the Nextwave asset API and return the private
// storage URL. That URL is for server-side persistence only — never put it in
// an API response (clients use MediaAsset document ids + /api/v1/media/:id).

const axios = require("axios");
const FormData = require("form-data");

const DEFAULT_UPLOAD_URL =
  "https://api.event.nextwavesaas.tech/api/forms/schemas/upload-asset";

async function uploadAssetBuffer(buffer, { filename = "asset.jpg", contentType = "image/jpeg" } = {}) {
  const token = process.env.ASSET_UPLOAD_TOKEN;
  if (!token) {
    throw new Error("ASSET_UPLOAD_TOKEN is not configured");
  }

  const form = new FormData();
  form.append("assetType", process.env.ASSET_UPLOAD_TYPE || "form_logo");
  form.append("file", buffer, { filename, contentType });

  const resp = await axios.post(process.env.ASSET_UPLOAD_URL || DEFAULT_UPLOAD_URL, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${token}`,
    },
    timeout: 30000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    // API returns a bare URL string (text/plain or JSON string).
    transformResponse: [(data) => data],
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const url = String(resp.data || "").trim().replace(/^"|"$/g, "");
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Unexpected upload-asset response: ${String(resp.data).slice(0, 120)}`);
  }
  return url;
}

module.exports = { uploadAssetBuffer, DEFAULT_UPLOAD_URL };
