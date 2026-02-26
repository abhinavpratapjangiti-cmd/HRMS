const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================
   STATIC FALLBACK THOUGHTS
========================= */
const FALLBACK_THOUGHTS = [
  "Make today count.",
  "Small progress is still progress.",
  "Consistency beats motivation.",
  "Focus on what you can control.",
  "Your effort today builds your future."
];

function getFallbackThought() {
  return FALLBACK_THOUGHTS[
    Math.floor(Math.random() * FALLBACK_THOUGHTS.length)
  ];
}

/* ======================================================
   GET THOUGHT OF THE DAY
   GET /api/thought/today
   ✅ PROMISE ONLY
   ✅ SAFE FALLBACK
   ✅ NO CRASH
====================================================== */
router.get("/today", (req, res) => {
  console.log("🧠 Thought of the day requested");

  db.query(
    `
    SELECT thought, author
    FROM thought_of_the_day
    WHERE active_date = DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
    LIMIT 1
    `
  )
    .then(([rows]) => {
      if (rows && rows.length) {
        return res.json({
          thought: rows[0].thought,
          author: rows[0].author || "SYSTEM",
          source: "DB"
        });
      }

      // No row → fallback
      return res.json({
        thought: getFallbackThought(),
        author: "LovasIT Team", // Add this!
        source: "FALLBACK"
      });
    })
    .catch(err => {
      console.error("❌ Thought DB error:", err);
      return res.json({
        thought: getFallbackThought(),
        source: "FALLBACK"
      });
    });
});

module.exports = router;
