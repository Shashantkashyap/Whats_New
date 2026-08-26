const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

function authenticateToken(req, res, next) {
  try {
    // Check Authorization header first (Bearer token), then fallback to cookies
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.toLowerCase().startsWith('bearer ') 
      ? authHeader.substring(7).trim() 
      : req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ 
        error: "Not authenticated", 
        debug_headers: req.headers,
        debug_cookies: req.cookies
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };

    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authenticateToken };
