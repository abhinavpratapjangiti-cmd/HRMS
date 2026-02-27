const express = require('express');
const router = express.Router();
const db = require('../db');
const socket = require("../socket");

/* =====================================================
   POST /api/service-requests
===================================================== */
router.post('/', async (req, res) => {
  try {
    const { to, from, subject, message } = req.body;

    if (!to || !from || !subject || !message) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields"
      });
    }

    const [result] = await db.execute(`
      INSERT INTO service_requests
      (request_to, request_from, subject, message, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [to, from, subject, message]);

    const requestId = result.insertId;

    const [rows] = await db.execute(
      "SELECT * FROM service_requests WHERE id = ?",
      [requestId]
    );

    const newRequest = rows[0];

    let targetRole;
    switch (to.toLowerCase()) {
      case "admin": targetRole = "admin"; break;
      case "hr": targetRole = "hr-manager"; break;
      case "manager": targetRole = "manager"; break;
      default: targetRole = "admin";
    }

    const [userRows] = await db.execute(
      "SELECT id FROM users WHERE role = ?",
      [targetRole]
    );

    const io = socket.getIO();

    if (io && userRows.length > 0) {
      for (const user of userRows) {

        const [notifResult] = await db.execute(`
          INSERT INTO notifications (user_id, type, message, is_read)
          VALUES (?, ?, ?, 0)
        `, [
          user.id,
          "service_request",
          `${from} sent a service request: ${subject}`
        ]);

        io.to(String(user.id)).emit("notification_pop", {
          id: notifResult.insertId,
          type: "service_request",
          message: `${from} sent a service request`,
          created_at: new Date()
        });

        io.to(String(user.id)).emit("service_request_created", newRequest);
      }
    }

    res.status(201).json({
      status: "success",
      message: "Request logged successfully",
      data: newRequest
    });

  } catch (err) {
    console.error("Error saving request:", err);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
});
/* ================= GET TEAM ================= */
router.get("/team", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT * FROM service_requests
      WHERE request_to = 'Manager' OR request_to = 'HR'
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch team requests" });
  }
});

/* ================= GET ALL ================= */
router.get("/all", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM service_requests ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

/* ================= RESOLVE ================= */
router.put("/:id/resolve", async (req, res) => {
  try {
    await db.execute(`
      UPDATE service_requests
      SET status='resolved', resolved_at=NOW()
      WHERE id=?
    `, [req.params.id]);

    const [rows] = await db.execute(
      "SELECT * FROM service_requests WHERE id = ?",
      [req.params.id]
    );

    const updatedRequest = rows[0];
    const io = socket.getIO();

    if (io) {
      io.emit("service_request_updated", updatedRequest);
    }

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: "Failed to resolve" });
  }
});

module.exports = router;

