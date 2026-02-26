const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ message: "Authorization header missing" });
    }

    const token = header.startsWith("Bearer ")
      ? header.split(" ")[1]
      : header;

    const decoded = jwt.verify(token, JWT_SECRET);

    /* =========================
       SESSION VERSION CHECK
    ========================= */
    const [rows] = await db.query(
      "SELECT token_version FROM users WHERE id = ?",
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid session" });
    }

    const currentVersion = rows[0].token_version || 0;

    if ((decoded.token_version || 0) !== currentVersion) {
      return res.status(401).json({
        message: "Session expired. Please login again."
      });
    }

    /* =========================
       ATTACH USER TO REQUEST
    ========================= */
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      employee_id: decoded.employee_id || null
    };

    /* =========================
       NON-BLOCKING PRESENCE UPDATE
    ========================= */
    (async () => {
      try {
        await db.query(
          `
          UPDATE users
          SET last_seen = NOW(), is_logged_in = 1
          WHERE id = ?
          `,
          [decoded.id]
        );
      } catch {
        // intentionally ignored
      }
    })();

    next();
  } catch (err) {
    console.error("verifyToken error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { verifyToken };
