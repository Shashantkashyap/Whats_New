// // Download hotlinked images, re-host via the asset upload API, and persist a
// // MediaAsset whose document id is what APIs expose. Subject-category fallbacks
// // are stable placehold.co URLs wrapped the same way so clients never see a
// // broken Pixabay link.

// const axios = require("axios");
// const path = require("path");
// const MediaAsset = require("../models/MediaAsset");
// const { uploadAssetBuffer } = require("./assetUpload");

// const DOWNLOAD_TIMEOUT_MS = 12000;

// function extForContentType(ct = "") {
//   if (ct.includes("png")) return ".png";
//   if (ct.includes("webp")) return ".webp";
//   if (ct.includes("gif")) return ".gif";
//   return ".jpg";
// }

// async function downloadImage(url) {
//   const resp = await axios.get(url, {
//     responseType: "arraybuffer",
//     timeout: DOWNLOAD_TIMEOUT_MS,
//     maxContentLength: 12 * 1024 * 1024,
//     validateStatus: (s) => s >= 200 && s < 300,
//   });
//   const contentType = (resp.headers["content-type"] || "image/jpeg").split(";")[0].trim();
//   return { buffer: Buffer.from(resp.data), contentType };
// }

// async function createAsset({ storageUrl, contentType, kind, meta = {} }) {
//   const asset = await MediaAsset.create({ storageUrl, contentType, kind, meta });
//   return asset;
// }

// // Re-host `sourceUrl` when ASSET_UPLOAD_TOKEN is set; otherwise keep the
// // source URL behind a document id (still never returned to clients).
// async function persistRemoteImage(sourceUrl, { kind = "news_image", meta = {}, filename } = {}) {
//   const { buffer, contentType } = await downloadImage(sourceUrl);
//   const name = filename || `img-${Date.now()}${extForContentType(contentType)}`;

//   let storageUrl = sourceUrl;
//   if (process.env.ASSET_UPLOAD_TOKEN) {
//     try {
//       storageUrl = await uploadAssetBuffer(buffer, { filename: name, contentType });
//     } catch (err) {
//       console.warn("asset upload failed; keeping source URL behind document id:", err.message);
//     }
//   }

//   const asset = await createAsset({ storageUrl, contentType, kind, meta: { ...meta, sourceUrl } });
//   return { documentId: asset._id, asset };
// }

// async function persistBuffer(buffer, { contentType = "image/jpeg", kind, meta = {}, filename } = {}) {
//   const name = filename || `upload-${Date.now()}${extForContentType(contentType)}`;
//   let storageUrl;
//   if (process.env.ASSET_UPLOAD_TOKEN) {
//     storageUrl = await uploadAssetBuffer(buffer, { filename: name, contentType });
//   } else {
//     // ponytail: no upload token in local/dev — store a data URL so the media
//     // proxy can still serve bytes. Ceiling: ~few MB per doc; upgrade = require token.
//     storageUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
//   }
//   const asset = await createAsset({ storageUrl, contentType, kind, meta });
//   return { documentId: asset._id, asset };
// }

// async function subjectFallbackDocumentId(category) {
//   const cat = String(category || "General").trim() || "General";
//   let asset = await MediaAsset.findOne({ kind: "subject_fallback", "meta.category": cat });
//   if (!asset) {
//     const label = encodeURIComponent(cat);
//     const storageUrl = `https://placehold.co/800x400/1e293b/e2e8f0?text=${label}`;
//     asset = await createAsset({
//       storageUrl,
//       contentType: "image/png",
//       kind: "subject_fallback",
//       meta: { category: cat },
//     });
//   }
//   return asset._id;
// }

// // Hotlink → persistent MediaAsset, falling back to a subject-category default.
// async function persistNewsImage(sourceUrl, { category } = {}) {
//   if (sourceUrl) {
//     try {
//       return await persistRemoteImage(sourceUrl, {
//         kind: "news_image",
//         meta: { category: category || "General" },
//         filename: `news-${Date.now()}${path.extname(new URL(sourceUrl).pathname) || ".jpg"}`,
//       });
//     } catch (err) {
//       console.warn("persistNewsImage download/upload failed:", err.message);
//     }
//   }
//   const documentId = await subjectFallbackDocumentId(category);
//   return { documentId };
// }

// // Load raw bytes for a MediaAsset (by id or lean/doc). Used by OCR and
// // proxies that already have the asset record.
// async function loadAssetBuffer(idOrAsset) {
//   const asset =
//     idOrAsset && idOrAsset.storageUrl
//       ? idOrAsset
//       : await MediaAsset.findById(idOrAsset).lean();
//   if (!asset) {
//     const err = new Error("MEDIA_NOT_FOUND");
//     err.code = "MEDIA_NOT_FOUND";
//     throw err;
//   }

//   const url = asset.storageUrl;
//   if (url.startsWith("data:")) {
//     const match = /^data:([^;]+);base64,(.+)$/s.exec(url);
//     if (!match) {
//       const err = new Error("MEDIA_CORRUPT");
//       err.code = "MEDIA_CORRUPT";
//       throw err;
//     }
//     return {
//       buffer: Buffer.from(match[2], "base64"),
//       contentType: match[1] || asset.contentType || "application/octet-stream",
//       asset,
//     };
//   }

//   const resp = await axios.get(url, {
//     responseType: "arraybuffer",
//     timeout: DOWNLOAD_TIMEOUT_MS,
//     maxContentLength: 12 * 1024 * 1024,
//     validateStatus: (s) => s >= 200 && s < 300,
//   });
//   return {
//     buffer: Buffer.from(resp.data),
//     contentType: (resp.headers["content-type"] || asset.contentType || "image/jpeg").split(";")[0].trim(),
//     asset,
//   };
// }

// module.exports = {
//   downloadImage,
//   persistRemoteImage,
//   persistBuffer,
//   persistNewsImage,
//   subjectFallbackDocumentId,
//   loadAssetBuffer,
// };





// Download hotlinked images, re-host via the asset upload API, and persist a
// MediaAsset whose document id is what APIs expose. Subject-category fallbacks
// are stable placehold.co URLs wrapped the same way so clients never see a
// broken Pixabay link.

const axios = require("axios");
const path = require("path");
const MediaAsset = require("../models/MediaAsset");
const { uploadAssetBuffer } = require("./assetUpload");

const DOWNLOAD_TIMEOUT_MS = 12000;

function extForContentType(ct = "") {
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  return ".jpg";
}

async function downloadImage(url) {
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: 12 * 1024 * 1024,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const contentType = (resp.headers["content-type"] || "image/jpeg").split(";")[0].trim();
  return { buffer: Buffer.from(resp.data), contentType };
}

async function createAsset({ storageUrl, contentType, kind, meta = {} }) {
  const asset = await MediaAsset.create({ storageUrl, contentType, kind, meta });
  return asset;
}

// Re-host `sourceUrl` when ASSET_UPLOAD_TOKEN is set; otherwise keep the
// source URL behind a document id (still never returned to clients).
async function persistRemoteImage(sourceUrl, { kind = "news_image", meta = {}, filename } = {}) {
  const { buffer, contentType } = await downloadImage(sourceUrl);
  const name = filename || `img-${Date.now()}${extForContentType(contentType)}`;

  let storageUrl = sourceUrl;
  if (process.env.ASSET_UPLOAD_TOKEN) {
    try {
      storageUrl = await uploadAssetBuffer(buffer, { filename: name, contentType });
    } catch (err) {
      console.warn("asset upload failed; keeping source URL behind document id:", err.message);
    }
  }

  const asset = await createAsset({ storageUrl, contentType, kind, meta: { ...meta, sourceUrl } });
  return { documentId: asset._id, asset };
}

async function persistBuffer(buffer, { contentType = "image/jpeg", kind, meta = {}, filename } = {}) {
  const name = filename || `upload-${Date.now()}${extForContentType(contentType)}`;
  let storageUrl;
  if (process.env.ASSET_UPLOAD_TOKEN) {
    storageUrl = await uploadAssetBuffer(buffer, { filename: name, contentType });
  } else {
    // ponytail: no upload token in local/dev — store a data URL so the media
    // proxy can still serve bytes. Ceiling: ~few MB per doc; upgrade = require token.
    storageUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  }
  const asset = await createAsset({ storageUrl, contentType, kind, meta });
  return { documentId: asset._id, asset };
}

async function subjectFallbackDocumentId(category) {
  const cat = String(category || "General").trim() || "General";
  let asset = await MediaAsset.findOne({ kind: "subject_fallback", "meta.category": cat });
  if (!asset) {
    const label = encodeURIComponent(cat);
    const storageUrl = `https://placehold.co/800x400/1e293b/e2e8f0?text=${label}`;
    asset = await createAsset({
      storageUrl,
      contentType: "image/png",
      kind: "subject_fallback",
      meta: { category: cat },
    });
  }
  return asset._id;
}

// Hotlink → persistent MediaAsset, falling back to a subject-category default.
async function persistNewsImage(sourceUrl, { category } = {}) {
  if (sourceUrl) {
    try {
      return await persistRemoteImage(sourceUrl, {
        kind: "news_image",
        meta: { category: category || "General" },
        filename: `news-${Date.now()}${path.extname(new URL(sourceUrl).pathname) || ".jpg"}`,
      });
    } catch (err) {
      console.warn("persistNewsImage download/upload failed:", err.message);
    }
  }
  const documentId = await subjectFallbackDocumentId(category);
  return { documentId };
}

// Load raw bytes for a MediaAsset (by id or lean/doc). Used by OCR and
// proxies that already have the asset record.
async function loadAssetBuffer(idOrAsset) {
  const asset =
    idOrAsset && idOrAsset.storageUrl
      ? idOrAsset
      : await MediaAsset.findById(idOrAsset).lean();
  if (!asset) {
    const err = new Error("MEDIA_NOT_FOUND");
    err.code = "MEDIA_NOT_FOUND";
    throw err;
  }

  const url = asset.storageUrl;
  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(url);
    if (!match) {
      const err = new Error("MEDIA_CORRUPT");
      err.code = "MEDIA_CORRUPT";
      throw err;
    }
    return {
      buffer: Buffer.from(match[2], "base64"),
      contentType: match[1] || asset.contentType || "application/octet-stream",
      asset,
    };
  }

  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: 12 * 1024 * 1024,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return {
    buffer: Buffer.from(resp.data),
    contentType: (resp.headers["content-type"] || asset.contentType || "image/jpeg").split(";")[0].trim(),
    asset,
  };
}

// NEW: returns a Set of image sourceUrls used in the last `limit` news images,
// so the resolver can avoid repeating a recently-used photo.
async function getRecentlyUsedImageUrls(limit = 300) {
  const recent = await MediaAsset.find({ kind: "news_image" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("meta.sourceUrl")
    .lean();
  return new Set(recent.map((a) => a.meta && a.meta.sourceUrl).filter(Boolean));
}

module.exports = {
  downloadImage,
  persistRemoteImage,
  persistBuffer,
  persistNewsImage,
  subjectFallbackDocumentId,
  loadAssetBuffer,
  getRecentlyUsedImageUrls,   // ← new export
};