const express = require("express");
const router = express.Router();
const db = require("../db");
const {verifyToken} = require("../middleware/auth");

/* =========================
   ORG CHART
   GET /api/org
========================= */
router.get("/", verifyToken, (req, res) => {
  db.query(
    `
    SELECT 
      e.id,
      e.name,
      u.role,
      e.manager_id,
      m.name AS manager_name
    FROM employees e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN employees m ON e.manager_id = m.id
    ORDER BY manager_name, e.name
    `,
    (err, rows) => {
      if (err) {
        console.error("ORG CHART ERROR:", err);
        return res.status(500).json({ message: "DB error" });
      }
      res.json(rows);
    }
  );
});

module.exports = router;
