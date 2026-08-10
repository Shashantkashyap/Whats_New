const mongoose = require("mongoose");
const axios = require("axios");
const MediaAsset = require("../models/MediaAsset");
const { apiOk, apiErr } = require("../utils/apiResponse");
const { parseMultipart, fileFromForm } = require("../utils/multipart");
const {
  assertMainsQuestion,
  upsertQueuedJob,
  startOcrJob,
  getJobsStatus,
} = require("../utils/ocrJobs");

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

function httpForOcrErr(code) {
  if (code === "TEST_NOT_FOUND") return 404;
  if (code === "TEST_FORBIDDEN") return 403;
  if (code === "TEST_WRONG_MODE" || code === "QUESTION_INVALID" || code === "QUESTION_NOT_IN_TEST" || code === "OCR_STATUS_INVALID") {
    return 400;
  }
  return 400;
}

// POST /api/v1/media/upload/:testId/:questionId
// multipart: image|file — no S3. Starts async OCR; poll via /media/ocr-status.
async function uploadMedia(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return apiErr(res, "AUTH_TOKEN_MISSING", "Authentication is required to upload media.", 401);

    const { testId, questionId } = req.params;
    try {
      await assertMainsQuestion(userId, testId, questionId);
    } catch (err) {
      return apiErr(res, err.code || "UPLOAD_INVALID", err.message, httpForOcrErr(err.code));
    }

    let file;
    try {
      const form = await parseMultipart(req);
      file = (await fileFromForm(form, "image")) || (await fileFromForm(form, "file"));
    } catch (err) {
      if (err.code === "INVALID_CONTENT_TYPE") {
        return apiErr(res, "INVALID_CONTENT_TYPE", err.message, 400);
      }
      return apiErr(res, "MULTIPART_PARSE_FAILED", err.message, 400);
    }

    if (!file || !file.buffer?.length) {
      return apiErr(res, "IMAGE_REQUIRED", "multipart field `image` (or `file`) with a binary file is required.", 400);
    }
    if (!String(file.contentType || "").startsWith("image/")) {
      return apiErr(res, "INVALID_IMAGE_TYPE", "Uploaded file must be an image.", 400);
    }
    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      return apiErr(res, "IMAGE_TOO_LARGE", `Image must be ≤ ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`, 413);
    }

    const job = await upsertQueuedJob(userId, testId, questionId);
    startOcrJob({
      userId,
      testId,
      questionId,
      buffer: file.buffer,
      contentType: file.contentType,
    });

    return apiOk(
      res,
      {
        test_id: String(testId),
        question_id: String(questionId),
        status: job.status || "in_progress",
      },
      { statusCode: 202 }
    );
  } catch (err) {
    return apiErr(res, "MEDIA_UPLOAD_FAILED", err.message, 500);
  }
}

// POST /api/v1/media/ocr-status
// body: { testId, questionIds: string[] }
// Client polls until status is done; then results[].answer_text is ready.
async function ocrStatus(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return apiErr(res, "AUTH_TOKEN_MISSING", "Authentication is required.", 401);

    const testId = req.body?.testId || req.body?.test_id;
    const questionIds = req.body?.questionIds || req.body?.question_ids;
    if (!Array.isArray(questionIds)) {
      return apiErr(res, "OCR_STATUS_INVALID", "questionIds must be an array of question ids.", 400);
    }

    let data;
    try {
      data = await getJobsStatus(userId, testId, questionIds);
    } catch (err) {
      return apiErr(res, err.code || "OCR_STATUS_FAILED", err.message, httpForOcrErr(err.code));
    }

    return apiOk(res, data);
  } catch (err) {
    return apiErr(res, "OCR_STATUS_FAILED", err.message, 500);
  }
}

// GET /api/v1/media/:id — stream image bytes. Never exposes storageUrl.
async function getMedia(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return apiErr(res, "MEDIA_NOT_FOUND", "No media asset exists for the supplied identifier.", 404);
    }

    const asset = await MediaAsset.findById(id).lean();
    if (!asset) {
      return apiErr(res, "MEDIA_NOT_FOUND", "No media asset exists for the supplied identifier.", 404);
    }

    const url = asset.storageUrl;
    // Dev/offline path: data URLs stored when ASSET_UPLOAD_TOKEN is unset.
    if (url.startsWith("data:")) {
      const match = /^data:([^;]+);base64,(.+)$/s.exec(url);
      if (!match) return apiErr(res, "MEDIA_CORRUPT", "Stored media payload is corrupt.", 500);
      const buf = Buffer.from(match[2], "base64");
      res.set("Content-Type", match[1] || asset.contentType || "application/octet-stream");
      res.set("Cache-Control", "public, max-age=86400");
      return res.status(200).send(buf);
    }

    const upstream = await axios.get(url, {
      responseType: "stream",
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    res.set("Content-Type", asset.contentType || upstream.headers["content-type"] || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=86400");
    if (upstream.headers["content-length"]) {
      res.set("Content-Length", upstream.headers["content-length"]);
    }
    upstream.data.on("error", () => {
      if (!res.headersSent) apiErr(res, "MEDIA_FETCH_FAILED", "Failed to fetch media bytes.", 502);
      else res.destroy();
    });
    return upstream.data.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      return apiErr(res, "MEDIA_FETCH_FAILED", err.message || "Failed to fetch media bytes.", 502);
    }
  }
}

module.exports = { uploadMedia, ocrStatus, getMedia };
