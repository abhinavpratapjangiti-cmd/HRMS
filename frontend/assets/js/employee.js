// backend/routes/employee.js
'use strict';

const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   GET ALL USERS (ADMIN)
   GET /api/users
========================= */
router.get("/", verifyToken, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }

  db.query(
    "SELECT id, name, email, role, manager_id FROM employees ORDER BY name",
    (err, rows) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "DB error" });
      }
      res.json(rows);
    }
  );
});

/* =========================
   GET TEAM BY MANAGER
   GET /api/users/team/:id
========================= */
router.get("/team/:id", verifyToken, (req, res) => {
  const managerId = req.params.id;

  db.query(
    "SELECT id, name, email, role FROM employees WHERE manager_id = ?",
    [managerId],
    (err, rows) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "DB error" });
      }
      res.json(rows);
    }
  );
});

module.exports = router;
