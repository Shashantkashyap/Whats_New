// utils/response.js

function successResponse(
  res,
  data = {},
  message = "Success",
  statusCode = 200
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function errorResponse(res, error = "Something went wrong", statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    error,
  });
}

// Envelope required by the Executive Intelligence front-end suite: status is
// strictly "success" | "error" and errors always carry an explicit `code`.
function apiOk(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({ status: "success", data });
}

function apiErr(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({ status: "error", code, message });
}

module.exports = {
  successResponse,
  errorResponse,
  apiOk,
  apiErr,
};
