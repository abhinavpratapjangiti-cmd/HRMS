const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   CLOCK IN
===================================================== */
router.post("/clock-in", verifyToken, async (req, res) => {
  const { employee_id, project, task } = req.body;

  if (!employee_id) {
    return res.status(400).json({ error: "employee_id required" });
  }

  try {
    // Auto-close any open sessions from previous days
    await db.query(
      `
      UPDATE attendance_logs
      SET
        clock_out = DATE_ADD(clock_in, INTERVAL 1 MINUTE),
        total_work_minutes = 1,
        total_break_minutes = 0,
        status = 'COMPLETED'
      WHERE employee_id = ?
        AND clock_out IS NULL
        AND log_date < CURDATE()
      `,
      [employee_id]
    );

    const [active] = await db.query(
      `
      SELECT id
      FROM attendance_logs
      WHERE employee_id = ?
        AND log_date = CURDATE()
        AND clock_out IS NULL
      LIMIT 1
      `,
      [employee_id]
    );

    if (active.length) {
      return res.status(400).json({ error: "Already clocked in" });
    }

    await db.query(
      `
      INSERT INTO attendance_logs
        (employee_id, log_date, clock_in, project, task, status)
      VALUES (?, CURDATE(), NOW(), ?, ?, 'WORKING')
      `,
      [employee_id, project || null, task || null]
    );

    res.json({ status: "CLOCKED_IN" });
  } catch (err) {
    console.error("clock-in error:", err);
    res.status(500).json({ error: "Clock-in failed" });
  }
});

/* =====================================================
   CLOCK OUT (CORRECTED)
===================================================== */
router.post("/clock-out", verifyToken, async (req, res) => {
  // 1. EXTRACT project and task FROM REQUEST BODY
  const { employee_id, project, task } = req.body; 

  if (!employee_id) {
    return res.status(400).json({ error: "employee_id required" });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // Select existing attendance record
    const [rows] = await conn.query(
      `
      SELECT id, clock_in, break_start, break_end 
      FROM attendance_logs
      WHERE employee_id = ?
        AND log_date = CURDATE()
        AND clock_out IS NULL
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [employee_id]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(400).json({ error: "No active attendance" });
    }

    const a = rows[0];
    const now = new Date();

    // ... (Time calculation logic remains the same) ...
    let workedMinutes = Math.floor((now - new Date(a.clock_in)) / 60000);
    let breakMinutes = 0;
    if (a.break_start && a.break_end) {
      breakMinutes = Math.floor((new Date(a.break_end) - new Date(a.break_start)) / 60000);
    }
    workedMinutes = Math.max(workedMinutes - breakMinutes, 0);
    const workedHours = Number((workedMinutes / 60).toFixed(2));

    // 2. UPDATE ATTENDANCE LOGS WITH PROJECT & TASK
    // We add project = ? and task = ? here to save them to the attendance table too
    await conn.query(
      `
      UPDATE attendance_logs
      SET
        clock_out = ?,
        total_work_minutes = ?,
        total_break_minutes = ?,
        status = 'COMPLETED',
        project = ?, 
        task = ?
      WHERE id = ?
      `,
      [now, workedMinutes, breakMinutes, project, task, a.id]
    );

    // 3. INSERT INTO TIMESHEETS USING NEW VARIABLES
    // Use 'project' and 'task' from req.body, NOT 'a.project'
    await conn.query(
      `
      INSERT IGNORE INTO timesheets
        (employee_id, work_date, project, task, hours, status, day_type, submitted_at)
      VALUES (?, DATE(?), ?, ?, ?, 'SUBMITTED', 'P', NOW())
      `,
      [employee_id, a.clock_in, project, task, workedHours]
    );

    await conn.commit();
    res.json({ status: "CLOCKED_OUT", hours: workedHours });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("clock-out error:", err);
    res.status(500).json({ error: "Clock-out failed" });
  } finally {
    if (conn) conn.release();
  }
});
/* =====================================================
   TODAY STATUS (FIXED PRECISION)
===================================================== */
router.get("/today", verifyToken, async (req, res) => {
  const employee_id = req.user.employee_id;

  try {
    const [rows] = await db.query(
      `
      SELECT
        clock_in,
        clock_out,
        total_work_minutes,
        total_break_minutes
      FROM attendance_logs
      WHERE employee_id = ?
        AND log_date = CURDATE()
      ORDER BY id DESC
      LIMIT 1
      `,
      [employee_id]
    );

    if (!rows.length) {
      return res.json({
        status: "NOT_STARTED",
        clock_in: null,
        worked_seconds: 0,
        break_minutes: 0
      });
    }

    const a = rows[0];
    const now = new Date();

    // 🔥 FIX: Calculate SECONDS for accurate live timer
    let workedSeconds;
    
    if (a.clock_out) {
        // If completed, use stored minutes (converted to seconds)
        workedSeconds = (a.total_work_minutes || 0) * 60;
    } else {
        // If working, calculate real-time seconds difference
        workedSeconds = Math.floor((now - new Date(a.clock_in)) / 1000);
    }

    res.json({
      status: a.clock_out ? "COMPLETED" : "WORKING",
      clock_in: a.clock_in, // Matches FE expectation
      worked_seconds: Math.max(workedSeconds, 0), // Matches FE expectation
      break_minutes: a.total_break_minutes || 0
    });

  } catch (err) {
    console.error("today error:", err);
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

/* =====================================================
   HISTORY
===================================================== */
router.get("/history/:employee_id", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        log_date,
        clock_in,
        clock_out,
        CASE
          WHEN clock_out IS NULL
            THEN TIMESTAMPDIFF(MINUTE, clock_in, NOW())
          ELSE TIMESTAMPDIFF(MINUTE, clock_in, clock_out)
        END AS work_minutes
      FROM attendance_logs
      WHERE employee_id = ?
      ORDER BY log_date DESC
      LIMIT 30
      `,
      [req.params.employee_id]
    );

    res.json(rows);
  } catch (err) {
    console.error("history error:", err);
    res.status(500).json([]);
  }
});

/* =====================================================
   TEAM SUMMARY
===================================================== */
router.get("/team/summary", verifyToken, async (req, res) => {
  try {
    const managerId = req.user.employee_id || req.user.id;

    const [rows] = await db.query(
      `
      SELECT
        COUNT(DISTINCT e.id) AS total,
        COUNT(DISTINCT CASE WHEN al.id IS NOT NULL THEN e.id END) AS present,
        COUNT(DISTINCT CASE WHEN l.id IS NOT NULL THEN e.id END) AS on_leave
      FROM employees e
      LEFT JOIN attendance_logs al
        ON al.employee_id = e.id
        AND al.log_date = CURDATE()
      LEFT JOIN leaves l
        ON l.employee_id = e.id
        AND l.status = 'APPROVED'
        AND CURDATE() BETWEEN l.start_date AND l.end_date
      WHERE e.manager_id = ?
      `,
      [managerId]
    );

    const r = rows[0] || {};
    const total = Number(r.total || 0);
    const present = Number(r.present || 0);
    const onLeave = Number(r.on_leave || 0);

    res.json({
      total,
      present,
      on_leave: onLeave,
      absent: Math.max(total - present - onLeave, 0)
    });
  } catch (err) {
    console.error("team summary error:", err);
    res.status(500).json({ error: "Failed to fetch team summary" });
  }
});

module.exports = router;
