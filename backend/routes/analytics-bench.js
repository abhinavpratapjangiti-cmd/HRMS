const express = require("express");
const router = express.Router();
const  { verifyToken }= require("../middleware/auth");

const BenchAnalyticsService =
  require("../services/benchAnalytics.service");

/* =====================================================
   AUTH HELPER
===================================================== */
function allowHRAdmin(req, res) {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

/* =====================================================
   BENCH BURN + TREND
   GET /api/analytics/bench/burn-trend
===================================================== */
router.get("/burn-trend", verifyToken, async (req, res) => {
  try {
    if (!allowHRAdmin(req, res)) return;

    const trend = await BenchAnalyticsService.getBenchBurnTrend(6);

    const current = trend.length
      ? trend[trend.length - 1]
      : { month: null, bench_cost: 0 };

    res.json({ current, trend });
  } catch (err) {
    console.error("Bench burn trend failed:", err);
    res.status(500).json({ message: "Bench burn trend failed" });
  }
});

/* =====================================================
   BENCH SUMMARY
   GET /api/analytics/bench/summary
===================================================== */
router.get("/summary", verifyToken, async (req, res) => {
  try {
    if (!allowHRAdmin(req, res)) return;

    const data = await BenchAnalyticsService.getBenchSummary();
    res.json(data);
  } catch (err) {
    console.error("Bench summary failed:", err);
    res.status(500).json({ message: "Bench summary failed" });
  }
});

/* =====================================================
   BENCH AGING BUCKETS
   GET /api/analytics/bench/aging
===================================================== */
router.get("/aging", verifyToken, async (req, res) => {
  try {
    if (!allowHRAdmin(req, res)) return;

    const data = await BenchAnalyticsService.getBenchAgingBuckets();
    res.json(data);
  } catch (err) {
    console.error("Bench aging failed:", err);
    res.status(500).json({ message: "Bench aging failed" });
  }
});

/* =====================================================
   BENCH EMPLOYEE LIST (DRILL DOWN)
   GET /api/analytics/bench/list
===================================================== */
router.get("/list", verifyToken, async (req, res) => {
  try {
    if (!allowHRAdmin(req, res)) return;

    const list = await BenchAnalyticsService.getBenchEmployeesList();
    res.json(list);
  } catch (err) {
    console.error("Bench list failed:", err);
    res.status(500).json({ message: "Bench list failed" });
  }
});

module.exports = router;
