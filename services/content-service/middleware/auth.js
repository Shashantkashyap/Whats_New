const jwt = require("jsonwebtoken");
const { apiErr } = require("../utils/apiResponse");

// Verifies the `Authorization: Bearer <token>` header against the shared
// JWT_SECRET (tokens are minted by user-service at login). On success attaches
// req.user = { id, email }. Errors use the spec envelope with explicit codes.
function bearerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return apiErr(res, "AUTH_TOKEN_MISSING", "Authorization bearer token is required.", 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email };
    return next();
  } catch (err) {
    return apiErr(res, "AUTH_TOKEN_INVALID", "The session token is invalid or has expired.", 401);
  }
}

module.exports = { bearerAuth };
