const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");

const BenchAnalyticsService = require("../services/benchAnalytics.service");

/* =====================================================
   BENCH BURN + TREND
   GET /api/analytics/bench/burn-trend
   HR / ADMIN ONLY
===================================================== */
router.get("/burn-trend", verifyToken, async (req, res) => {
  try {
    // Safety check: ensure req.user exists before accessing role
    const role = req.user?.role?.toLowerCase();

    if (!["admin", "hr"].includes(role)) {
      return res.status(403).json({ message: "Forbidden: HR or Admin access required" });
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

/* =====================================================
   BENCH SUMMARY
   GET /api/analytics/bench/summary
   HR / ADMIN ONLY
===================================================== */
router.get("/summary", verifyToken, async (req, res) => {
  try {
    // Safety check: ensure req.user exists before accessing role
    const role = req.user?.role?.toLowerCase();

    if (!["admin", "hr"].includes(role)) {
      return res.status(403).json({ message: "Forbidden: HR or Admin access required" });
    }

    // Call the service to get the summary data
    const summary = await BenchAnalyticsService.getBenchSummary();

    // Return the data as JSON
    res.json(summary);

  } catch (err) {
    console.error("Bench summary failed:", err); // Check terminal for this specific error!
    res.status(500).json({ message: "Bench summary failed" });
  }
});

module.exports = router;
