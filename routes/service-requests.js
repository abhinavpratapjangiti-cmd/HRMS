const express = require('express');
const router = express.Router();
const db = require('../db');
const socket = require("../socket");
const { pushNotification } = require("./wsServer");

// POST /api/service-requests
router.post('/', async (req, res) => {
  try {
    const { to, from, subject, message } = req.body;

    if (!to || !from || !subject || !message) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields"
      });
    }

    // Insert service request
    const [result] = await db.execute(`
      INSERT INTO service_requests
      (request_to, request_from, subject, message)
      VALUES (?, ?, ?, ?)
    `, [to, from, subject, message]);

    const requestId = result.insertId;

    // Get full inserted row
    const [rows] = await db.execute(
      "SELECT * FROM service_requests WHERE id = ?",
      [requestId]
    );

    const newRequest = rows[0];

    // 🔥 Find target user dynamically
let targetRole;

switch (to.toLowerCase()) {
  case "admin":
    targetRole = "admin";
    break;
  case "hr":
    targetRole = "hr";
    break;
  case "manager":
    targetRole = "manager";
    break;
  default:
    targetRole = "admin"; // fallback
}

const [userRows] = await db.execute(
  "SELECT id FROM users WHERE role = ? LIMIT 1",
  [targetRole]
);


const targetUser = userRows[0];
const io = socket.getIO();

if (targetUser && io) {
  io.to(String(targetUser.id))
    .emit("service_request_created", newRequest);
}
    res.status(201).json({
      status: "success",
      message: "Request logged successfully"
    });

  } catch (err) {
    console.error("Error saving request:", err);
    res.status(500).json({
      status: "error",
      message: "Failed to save request"
    });
  }
});

// GET - Pending requests for Admin Inbox
router.get("/pending", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT * FROM service_requests
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `);

    res.json({
      status: "success",
      data: rows
    });

  } catch (err) {
    console.error("Error fetching requests:", err);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch requests"
    });
  }
});

/* =====================================================
   GET TEAM SERVICE REQUESTS (Manager)
===================================================== */
router.get("/team", async (req, res) => {
  try {
    const managerName = "Manager";

    const [rows] = await db.execute(`
      SELECT * FROM service_requests
      WHERE request_to = ?
      ORDER BY created_at DESC
    `, [managerName]);

    res.json(rows);

  } catch (err) {
    console.error("❌ Team Requests Error:", err);
    res.status(500).json({ error: "Failed to fetch team requests" });
  }
});

/* =====================================================
   GET ALL SERVICE REQUESTS (Admin)
===================================================== */
router.get("/all", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT * FROM service_requests
      ORDER BY created_at DESC
    `);

    res.json(rows);

  } catch (err) {
    console.error("❌ All Requests Error:", err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});


router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM service_requests WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: "Not found" });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});
router.put("/:id/resolve", async (req, res) => {
  try {
    const user = "Admin";

    await db.execute(`
      UPDATE service_requests
      SET status='resolved',
          resolved_by=?,
          resolved_at=NOW()
      WHERE id=?
    `, [user, req.params.id]);

    const [rows] = await db.execute(
      "SELECT * FROM service_requests WHERE id = ?",
      [req.params.id]
    );

    const updatedRequest = rows[0];

    const [creatorRows] = await db.execute(
      "SELECT id FROM users WHERE name = ? LIMIT 1",
      [updatedRequest.request_from]
    );

    const creator = creatorRows[0];
    const io = socket.getIO();

    if (creator && io) {
      io.to(String(creator.id))
        .emit("service_request_updated", updatedRequest);
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Resolve Error:", err);
    res.status(500).json({ error: "Failed to resolve" });
  }
});
/* =====================================================
   MARK ALL SERVICE REQUESTS AS RESOLVED
===================================================== */
router.put("/mark-all-read", async (req, res) => {
  try {

    await db.execute(`
      UPDATE service_requests
      SET status = 'resolved',
          resolved_by = 'Admin',
          resolved_at = NOW()
      WHERE status = 'pending'
    `);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Mark All Service Requests Error:", err);
    res.status(500).json({ success: false });
  }
});


module.exports = router;
	
