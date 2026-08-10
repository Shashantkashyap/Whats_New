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

// Like bearerAuth but never blocks: used by publicly-readable endpoints (e.g.
// the Daily News Feed) that stay open to anonymous readers yet personalize the
// response when a valid token happens to be present. A missing/invalid token
// simply leaves req.user undefined.
function optionalBearerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme === "Bearer" && token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: decoded.id, email: decoded.email };
    } catch (err) {
      // Ignore — treat as anonymous.
    }
  }
  return next();
}

module.exports = { bearerAuth, optionalBearerAuth };
