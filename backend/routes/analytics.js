const express = require("express");
const router = express.Router();
const { verifyToken} = require("../middleware/auth");

const BenchAnalyticsService =
  require("../services/benchAnalytics.service");

/* =====================================================
   BENCH BURN + TREND
   GET /api/analytics/bench/burn-trend
   HR / ADMIN ONLY
===================================================== */
router.get("/burn-trend", verifyToken, async (req, res) => {
  try {
    const role = req.user.role?.toLowerCase();
    if (!["admin", "hr"].includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ✅ SINGLE SOURCE OF TRUTH
    const trend = await BenchAnalyticsService.getBenchBurnTrend(6);

    const current = trend.length
      ? trend[trend.length - 1]
      : { month: null, bench_cost: 0 };

    res.json({
      current,
      trend
    });

  } catch (err) {
    console.error("Bench burn trend failed:", err);
    res.status(500).json({ message: "Bench burn trend failed" });
  }
});

module.exports = router;
