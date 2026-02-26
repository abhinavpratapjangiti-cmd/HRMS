const express = require("express");
const router = express.Router();
const {verifyToken} = require("../middleware/auth");

/* ======================================================
   DECISION ENGINE – PROFILE (v1.1)
   GET /api/decisions/profile
====================================================== */
router.get("/profile", verifyToken, (req, res) => {
  const role = (req.user?.role || "").toLowerCase();

  const decisions = {
    canApplyLeave: true,
    canEditProfile: true,

    canApprove: role === "manager" || role === "admin",

    attritionRisk: "LOW",   // LOW | MEDIUM | HIGH
    leaveRisk: "NORMAL",    // NORMAL | EXCESSIVE

    managerLoad: null
  };

  if (role === "manager") {
    decisions.managerLoad = {
      teamSize: 12,
      risk: "HIGH"
    };
  }

  res.json(decisions);
});

module.exports = router;
