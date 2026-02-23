const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/*
 GET /api/posts/me
*/
router.get("/me", verifyToken, (req, res) => {
  const sql = `
    SELECT content, created_at
    FROM posts
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [req.user.id])
    .then(([rows]) => {
      res.json(rows);
    })
    .catch(err => {
      console.error("Posts error:", err);
      res.status(500).json({ message: "DB error" });
    });
});

module.exports = router;
