const express = require("express");
const router = express.Router();

/* =====================================================
   EXECUTIVE ACTIONS API
   Base path: /api/executive
===================================================== */

/**
 * GET /api/executive/actions
 * Purpose: Executive insights & recommendations
 */
router.get("/actions", async (req, res) => {
  try {
    // Phase 1: Static / placeholder response
    // (Frontend already computes insights from analytics SSOT)
    res.json({
      status: "OK",
      message: "Executive actions endpoint active"
    });
  } catch (err) {
    console.error("Executive actions API failed:", err);
    res.status(500).json({
      message: "Failed to load executive actions"
    });
  }
});

module.exports = router;
