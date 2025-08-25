const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

function authenticateToken(req, res, next) {
  try {
    // Cookie se token lena
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ab req.user me direct `id` store karenge (jo JWT me dala tha)
    req.user = { id: decoded.id };

    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authenticateToken };
