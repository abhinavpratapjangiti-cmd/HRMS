const express = require("express");
const router = express.Router();
const db = require("../db"); // Ensure this is your promise-based DB pool
const { verifyToken } = require("../middleware/auth");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

// CONFIG: Force Server Logic to IST
const TIMEZONE = "Asia/Kolkata";

/* =====================================================
   HELPER FUNCTIONS
===================================================== */
function getNowIST() {
  return dayjs().tz(TIMEZONE);
}

function getBusinessDate() {
  // Shifts "day start" to 4 AM to handle late-night shifts
  return getNowIST().subtract(4, "hour").format("YYYY-MM-DD");
}

function getLocalTimestamp() {
  return getNowIST().format("YYYY-MM-DD HH:mm:ss");
}

/* =====================================================
   🔔 UNIVERSAL NOTIFICATION HELPER
   Target: Self + Manager + HR/Admins
===================================================== */
async function notifyAllParties(conn, employeeId, actionType, details = "") {
    try {
        // 1. Get Employee & Manager Info
        const [empRows] = await conn.query(`
            SELECT 
                e.user_id as empUserId, 
                e.name as empName, 
                m.user_id as mgrUserId 
            FROM employees e
            LEFT JOIN employees m ON e.manager_id = m.id
            WHERE e.id = ?
        `, [employeeId]);

        if (!empRows.length) return;
        const { empUserId, empName, mgrUserId } = empRows[0];

        // 2. Get All HRs & Admins
        const [hrRows] = await conn.query(`
            SELECT id FROM users WHERE role IN ('HR', 'ADMIN')
        `);

        // 3. Prepare Recipient List (Set handles duplicates)
        const recipients = new Set();
        if (empUserId) recipients.add(empUserId); // Self
        if (mgrUserId) recipients.add(mgrUserId); // Manager
        hrRows.forEach(hr => recipients.add(hr.id)); // HRs

        // 4. Construct Messages
        const timeStr = dayjs().tz(TIMEZONE).format("hh:mm A");
        let msgSelf = "";
        let msgOthers = ""; // For Manager & HR

        switch(actionType) {
            case "CLOCK_IN":
                msgSelf = `You clocked in at ${timeStr}.`;
                msgOthers = `🟢 ${empName} clocked in at ${timeStr}.`;
                break;
            case "CLOCK_OUT":
                msgSelf = `You clocked out at ${timeStr}. Duration: ${details}`;
                msgOthers = `🔴 ${empName} clocked out at ${timeStr}. Work: ${details}`;
                break;
            case "BREAK_START":
                msgSelf = `You started a break at ${timeStr}.`;
                msgOthers = `☕ ${empName} is on break (${timeStr}).`;
                break;
            case "BREAK_END":
                msgSelf = `You ended your break at ${timeStr}.`;
                msgOthers = `▶️ ${empName} resumed work (${timeStr}).`;
                break;
        }

        // 5. Batch Insert
        const values = [];
        recipients.forEach(uid => {
            const message = (uid === empUserId) ? msgSelf : msgOthers;
            values.push([uid, message, 0, new Date()]);
        });

        if (values.length > 0) {
            await conn.query(
                `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ?`,
                [values]
            );
        }

    } catch (err) {
        console.error("Notification Error:", err.message);
    }
}

/* =====================================================
   1. CLOCK IN
===================================================== */
router.post("/clock-in", verifyToken, async (req, res) => {
  const employee_id = req.user.employee_id || req.body.employee_id;
  // Restore: Capture optional GPS and Project from body (Zero Omitted Logic)
  const { latitude, longitude, project } = req.body; 

  if (!employee_id) return res.status(400).json({ error: "Invalid Employee ID" });

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const businessDate = getBusinessDate();
    const now = getLocalTimestamp();

    // 1. ZOMBIE CHECK: Auto-close sessions older than yesterday
    await conn.query(
        `UPDATE attendance_logs 
         SET clock_out = DATE_ADD(clock_in, INTERVAL 12 HOUR), status = 'COMPLETED', task = 'Auto-closed (System)' 
         WHERE employee_id = ? AND clock_out IS NULL AND log_date < ?`,
        [employee_id, businessDate]
    );

    // 2. Check Active Session
    const [active] = await conn.query(
      `SELECT id FROM attendance_logs 
       WHERE employee_id = ? AND log_date = ? AND clock_out IS NULL 
       FOR UPDATE`,
      [employee_id, businessDate]
    );

    if (active.length) {
      await conn.rollback();
      return res.status(400).json({ message: "Already clocked in today" });
    }

    // 3. Insert Log
    await conn.query(
      `INSERT INTO attendance_logs 
       (employee_id, log_date, clock_in, status, total_break_minutes, created_at, latitude, longitude, project) 
       VALUES (?, ?, ?, 'WORKING', 0, NOW(), ?, ?, ?)`,
      [employee_id, businessDate, now, latitude || null, longitude || null, project || null]
    );

    // 4. Notify
    await notifyAllParties(conn, employee_id, "CLOCK_IN");

    await conn.commit();
    res.json({ status: "WORKING", clock_in: now, message: "Clocked In Successfully" });

  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Clock In Error:", err);
    res.status(500).json({ error: "Server Error" });
  } finally {
    if (conn) conn.release();
  }
});

/* =====================================================
   2. TAKE BREAK
===================================================== */
router.post("/take-break", verifyToken, async (req, res) => {
  const employee_id = req.user.employee_id;
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const businessDate = getBusinessDate();
    const now = getLocalTimestamp();

    const [rows] = await conn.query(
      `SELECT id, status FROM attendance_logs 
       WHERE employee_id = ? AND log_date = ? AND clock_out IS NULL 
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [employee_id, businessDate]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(400).json({ message: "No active session found." });
    }

    const log = rows[0];

    if (log.status === "ON_BREAK") {
      await conn.rollback();
      return res.status(400).json({ message: "You are already on break." });
    }

    await conn.query(
      `UPDATE attendance_logs SET status = 'ON_BREAK', break_start = ? WHERE id = ?`,
      [now, log.id]
    );
    
    await notifyAllParties(conn, employee_id, "BREAK_START");

    await conn.commit();
    res.json({ status: "ON_BREAK", message: "Break Started" });

  } catch (err) {
    if (conn) await conn.rollback();
    res.status(500).json({ error: "Server Error" });
  } finally {
    if (conn) conn.release();
  }
});

/* =====================================================
   3. END BREAK
===================================================== */
router.post("/end-break", verifyToken, async (req, res) => {
  const employee_id = req.user.employee_id;
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const businessDate = getBusinessDate();
    const now = getLocalTimestamp();

    const [rows] = await conn.query(
      `SELECT id, status, break_start, total_break_minutes 
       FROM attendance_logs 
       WHERE employee_id = ? AND log_date = ? AND clock_out IS NULL 
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [employee_id, businessDate]
    );

    if (!rows.length || rows[0].status !== "ON_BREAK") {
      await conn.rollback();
      return res.status(400).json({ message: "You are not on break." });
    }

    const log = rows[0];

    // Calc Duration
    const start = dayjs(log.break_start);
    const end = dayjs(now);
    const durationMins = end.diff(start, "minute"); 
    const newTotal = (Number(log.total_break_minutes) || 0) + Math.max(0, durationMins);

    await conn.query(
      `UPDATE attendance_logs 
       SET status = 'WORKING', break_start = NULL, total_break_minutes = ? 
       WHERE id = ?`,
      [newTotal, log.id]
    );

    await notifyAllParties(conn, employee_id, "BREAK_END");

    await conn.commit();
    res.json({ status: "WORKING", message: "Welcome Back!" });

  } catch (err) {
    if (conn) await conn.rollback();
    res.status(500).json({ error: "Server Error" });
  } finally {
    if (conn) conn.release();
  }
});

/* =====================================================
   4. CLOCK OUT (With Timesheet Auto-Insert)
===================================================== */
router.post("/clock-out", verifyToken, async (req, res) => {
  const employee_id = req.user.employee_id || req.body.employee_id;
  // ACCEPT BOTH: Project & Task Summary
  const { project, task } = req.body; // Mapped from frontend

  // 1. Validation: Ensure BOTH are provided
  if (!project || !project.trim() || !task || !task.trim()) {
      return res.status(400).json({ message: "Mandatory: Please enter BOTH Project Name and Task Summary." });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const businessDate = getBusinessDate();
    const now = getLocalTimestamp();

    const [rows] = await conn.query(
      `SELECT * FROM attendance_logs 
       WHERE employee_id = ? AND log_date = ? AND clock_out IS NULL 
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [employee_id, businessDate]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(400).json({ message: "No active session." });
    }

    const log = rows[0];

    // 2. Handle Break Logic if Clocking Out directly from Break
    let totalBreakMins = Number(log.total_break_minutes) || 0;
    if (log.status === "ON_BREAK" && log.break_start) {
        const currentBreakMins = dayjs(now).diff(dayjs(log.break_start), "minute");
        totalBreakMins += Math.max(0, currentBreakMins);
    }

    // 3. Net Work Time
    const start = dayjs(log.clock_in);
    const end = dayjs(now);
    const totalSessionMins = end.diff(start, "minute"); 
    const netWorkMins = Math.max(0, totalSessionMins - totalBreakMins);
    
    // Calculate decimal hours for timesheet (e.g., 8.5)
    const workHrsDecimal = (netWorkMins / 60).toFixed(2);

    // 4. Update Attendance Log
    await conn.query(
      `UPDATE attendance_logs 
       SET clock_out = ?, 
           status = 'COMPLETED', 
           total_work_minutes = ?, 
           total_break_minutes = ?, 
           task = ?,
           project = ? 
       WHERE id = ?`,
      [now, netWorkMins, totalBreakMins, task, project, log.id]
    );

    // 5. AUTO-INSERT TO TIMESHEETS TABLE 🚀
    // FIX: Using 'work_date' and 'SUBMITTED' (uppercase) to match schema
    await conn.query(
      `INSERT INTO timesheets 
       (employee_id, work_date, project, task, hours, status, submitted_at, created_at) 
       VALUES (?, ?, ?, ?, ?, 'SUBMITTED', NOW(), NOW())`,
      [employee_id, businessDate, project, task, workHrsDecimal]
    );

    // 6. Notify All
    const workHrs = Math.floor(netWorkMins/60);
    const workMinsStr = netWorkMins%60;
    const durationStr = `${workHrs}h ${workMinsStr}m`;
    await notifyAllParties(conn, employee_id, "CLOCK_OUT", durationStr);

    await conn.commit();
    res.json({ status: "COMPLETED", message: "Clocked Out & Timesheet Submitted Successfully!" });

  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Clock Out Error:", err);
    res.status(500).json({ error: "Server Error" });
  } finally {
    if (conn) conn.release();
  }
});

/* =====================================================
   5. GET TODAY'S STATUS
===================================================== */
router.get("/today", verifyToken, async (req, res) => {
  const employee_id = req.user.employee_id;
  const businessDate = getBusinessDate();

  try {
    const [rows] = await db.query(
      `SELECT * FROM attendance_logs 
       WHERE employee_id = ? AND log_date = ? 
       ORDER BY id DESC LIMIT 1`,
      [employee_id, businessDate]
    );

    if (!rows.length) {
      return res.json({ status: "NOT_STARTED", clock_in: null, total_break_seconds: 0 });
    }

    const log = rows[0];
    const totalBreakSeconds = (Number(log.total_break_minutes) || 0) * 60;

    let finalWorkedSeconds = 0;
    if (log.status === "COMPLETED") {
        finalWorkedSeconds = (Number(log.total_work_minutes) || 0) * 60;
    }

    res.json({
      status: log.clock_out ? "COMPLETED" : log.status,
      clock_in: log.clock_in,
      break_start: log.break_start, 
      total_break_seconds: totalBreakSeconds,
      worked_seconds: finalWorkedSeconds, 
      break_seconds: totalBreakSeconds 
    });

  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

/* =====================================================
   6. GET HISTORY
===================================================== */
router.get("/history/me", verifyToken, async (req, res) => {
  const employee_id = req.user.employee_id;

  try {
const [rows] = await db.query(
      `SELECT log_date, clock_in, clock_out, total_work_minutes, total_break_minutes,
         CASE
            WHEN clock_out IS NULL THEN 'Working'
            WHEN total_work_minutes >= 480 THEN 'Full Day'
            WHEN total_work_minutes < 240 THEN 'Half Day'
            ELSE 'Present' 
         END as status
       FROM attendance_logs WHERE employee_id = ? ORDER BY log_date DESC LIMIT 10`,
      [employee_id]
    );    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
