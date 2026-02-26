const express = require("express");
const router = express.Router();
const db = require("../db");
const {verifyToken} = require("../middleware/auth");

router.get("/active", verifyToken, (req, res) => {
  db.query(
    "SELECT * FROM office_locations WHERE active = 1 LIMIT 1",
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows[0]);
    }
  );
});

module.exports = router;
