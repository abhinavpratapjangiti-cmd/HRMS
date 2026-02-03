const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");

/*
  Mounted at:
  app.use("/api/analytics/profile", analyticsProfileRoutes)

  Therefore:
  GET /api/analytics/profile  ✅
*/
router.get("/", verifyToken, async (req, res) => {
  try {
    const employeeId = req.user.employee_id; // kept for future use

    // v0 static → later computed
    res.json({
      billability: 92,
      benchRisk: "LOW",
      leaveTrend: "NORMAL"
    });
  } catch (err) {
    console.error("Profile analytics failed:", err);
    res.status(500).json({ message: "Profile analytics failed" });
  }
});

module.exports = router;
