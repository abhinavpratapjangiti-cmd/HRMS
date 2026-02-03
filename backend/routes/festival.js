const express = require("express");
const router = express.Router();
const db = require("../db");
const {verifyToken} = require("../middleware/auth");

/* =========================
   SHOULD SHOW FESTIVAL
========================= */
router.get("/should-show", verifyToken, (req, res) => {
  const { festival } = req.query;
  const year = new Date().getFullYear();

  db.query(
    `
    SELECT 1
    FROM festival_views
    WHERE user_id = ? AND festival = ? AND year = ?
    `,
    [req.user.id, festival, year],
    (err, rows) => {
      if (err) {
        console.error("Festival should-show error:", err);
        return res.status(500).json({ show: false });
      }
      res.json({ show: rows.length === 0 });
    }
  );
});

/* =========================
   MARK FESTIVAL VIEWED
========================= */
router.post("/mark-viewed", verifyToken, (req, res) => {
  const { festival } = req.body;
  const year = new Date().getFullYear();

  db.query(
    `
    INSERT IGNORE INTO festival_views (user_id, festival, year)
    VALUES (?, ?, ?)
    `,
    [req.user.id, festival, year],
    () => res.json({ success: true })
  );
});

module.exports = router;
