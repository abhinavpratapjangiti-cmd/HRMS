const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   GET /api/dashboard/home
===================================================== */
router.get("/home", verifyToken, async (req, res) => {
  try {
    /* ---------- 1. Nearest Holiday ---------- */
    // Fetches the very next holiday (including today if today is a holiday)
    const [holidayRows] = await db.query(`
      SELECT name, holiday_date
      FROM holidays
      WHERE is_public = 1
        AND holiday_date >= CURDATE()
      ORDER BY holiday_date ASC
      LIMIT 1
    `);

    let holiday = null;
    if (holidayRows.length) {
      const h = holidayRows[0];
      holiday = {
        name: h.name,
        date_readable: new Date(h.holiday_date).toLocaleDateString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        })
      };
    }

    /* ---------- 2. Upcoming Holidays (Next 5) ---------- */
    // Fetches the next 5 holidays strictly AFTER today
    const [upcomingRows] = await db.query(`
      SELECT name, holiday_date
      FROM holidays
      WHERE is_public = 1
        AND holiday_date > CURDATE()
      ORDER BY holiday_date ASC
      LIMIT 5
    `);

    /* ---------- 3. Thought of the Day ---------- */
    // Fetches today's thought. If missing, gets the most recent past thought
    const [thoughtRows] = await db.query(`
      SELECT thought, author
      FROM thought_of_the_day
      WHERE active_date <= CURDATE()
      ORDER BY active_date DESC, id DESC
      LIMIT 1
    `);

    const thought = thoughtRows.length
      ? { text: thoughtRows[0].thought, author: thoughtRows[0].author }
      : { text: "Quality is not an act, it is a habit.", author: "Aristotle" };

    res.json({
      holiday,
      upcoming_holidays: upcomingRows,
      thought
    });

  } catch (err) {
    console.error("❌ Dashboard API error:", err);
    res.status(500).json({ message: "Dashboard error" });
  }
});

module.exports = router;
