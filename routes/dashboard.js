const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

// --- HELPER: Get Employee ID ---
async function getEmployeeId(userId) {
  // Using db.query directly (assuming db exports a promise-based pool)
  const [rows] = await db.query("SELECT id FROM employees WHERE user_id = ?", [userId]);
  return rows.length ? rows[0].id : null;
}

/* =====================================================
   1. HOME DATA (Holiday + Thought)
   Fixes: Issue 3 (Invalid Date)
===================================================== */
router.get("/home", verifyToken, async (req, res) => {
  try {
    const [holidayRows] = await db.query(`
      SELECT name, holiday_date
      FROM holidays
      WHERE is_public = 1 AND holiday_date >= CURDATE()
      ORDER BY holiday_date ASC LIMIT 1
    `);

    let holiday = null;
    if (holidayRows.length) {
      holiday = {
        name: holidayRows[0].name,
        date: holidayRows[0].holiday_date, 
      };
    }

    const [upcomingRows] = await db.query(`
      SELECT name, holiday_date as date
      FROM holidays
      WHERE is_public = 1 AND holiday_date > CURDATE()
      ORDER BY holiday_date ASC LIMIT 3
    `);

    const [thoughtRows] = await db.query(`
      SELECT thought, author
      FROM thought_of_the_day
      WHERE active_date <= CURDATE()
      ORDER BY active_date DESC, id DESC LIMIT 1
    `);

    const thought = thoughtRows.length
      ? { text: thoughtRows[0].thought, author: thoughtRows[0].author }
      : { text: "Consistency earns long-term success.", author: "System" };

    res.json({ holiday, upcoming_holidays: upcomingRows, thought });
  } catch (err) {
    console.error("❌ /home error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   2. TIME TODAY (User's Clock)
   Fixes: Issue 4 (00:00 Time) - Corrected Column Names
===================================================== */
router.get("/attendance-today", verifyToken, async (req, res) => {
  try {
    const empId = await getEmployeeId(req.user.id);
    if (!empId) return res.json({ worked_seconds: 0, break_seconds: 0 });

    const [rows] = await db.query(`
      SELECT clock_in, clock_out, total_work_minutes, total_break_minutes, status
      FROM attendance_logs
      WHERE employee_id = ? AND log_date = CURDATE()
      ORDER BY created_at DESC LIMIT 1
    `, [empId]);

    let worked_seconds = 0;
    let break_seconds = 0;

    if (rows.length > 0) {
      const entry = rows[0];

      // Worked Time Logic
      if (entry.status === 'WORKING' && entry.clock_in) {
        const diff = new Date() - new Date(entry.clock_in);
        worked_seconds = diff > 0 ? Math.floor(diff / 1000) : 0;
      } else {
        worked_seconds = (entry.total_work_minutes || 0) * 60;
      }

      // FIX: Real Break Time Logic
      break_seconds = (entry.total_break_minutes || 0) * 60;
    }

    res.json({ worked_seconds, break_seconds });
  } catch (err) {
    console.error("❌ /attendance-today error:", err.message);
    res.json({ worked_seconds: 0, break_seconds: 0 });
  }
});

/* =====================================================
   3. DASHBOARD COUNTERS
   Fixes: Issue 1 & 2 (Count Mismatch / Exclude Self)
===================================================== */
router.get("/team-attendance", verifyToken, async (req, res) => {
  try {
    const isAdmin = ["ADMIN", "HR"].includes(req.user.role.toUpperCase());
    const empId = await getEmployeeId(req.user.id);

    const query = isAdmin
      ? `SELECT COUNT(DISTINCT employee_id) AS count FROM attendance_logs WHERE log_date = CURDATE() AND employee_id != ?`
      : `SELECT COUNT(DISTINCT al.employee_id) AS count
         FROM attendance_logs al
         JOIN employees e ON al.employee_id = e.id
         WHERE al.log_date = CURDATE() AND e.manager_id = ? AND al.employee_id != ?`;

    const [rows] = isAdmin
        ? await db.query(query, [empId])
        : await db.query(query, [empId, empId]);

    res.json({ count: rows[0].count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/pending-leaves", verifyToken, async (req, res) => {
  try {
    const isAdmin = ["ADMIN", "HR"].includes(req.user.role.toUpperCase());
    const empId = await getEmployeeId(req.user.id);
    const query = isAdmin
      ? `SELECT COUNT(*) AS count FROM leaves WHERE status = 'PENDING' AND employee_id != ?`
      : `SELECT COUNT(*) AS count FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'PENDING' AND e.manager_id = ? AND l.employee_id != ?`;
    const [rows] = isAdmin ? await db.query(query, [empId]) : await db.query(query, [empId, empId]);
    res.json({ count: rows[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/pending-timesheets", verifyToken, async (req, res) => {
  try {
    const isAdmin = ["ADMIN", "HR"].includes(req.user.role.toUpperCase());
    const empId = await getEmployeeId(req.user.id);
    const query = isAdmin
      ? `SELECT COUNT(*) AS count FROM timesheets WHERE status = 'PENDING' AND employee_id != ?`
      : `SELECT COUNT(*) AS count FROM timesheets t JOIN employees e ON t.employee_id = e.id WHERE t.status = 'PENDING' AND e.manager_id = ? AND t.employee_id != ?`;
    const [rows] = isAdmin ? await db.query(query, [empId]) : await db.query(query, [empId, empId]);
    res.json({ count: rows[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/team-on-leave", verifyToken, async (req, res) => {
  try {
    const isAdmin = ["ADMIN", "HR"].includes(req.user.role.toUpperCase());
    const empId = await getEmployeeId(req.user.id);
    const query = isAdmin
      ? `SELECT COUNT(*) AS count FROM leaves WHERE status = 'APPROVED' AND CURDATE() BETWEEN from_date AND to_date AND employee_id != ?`
      : `SELECT COUNT(*) AS count FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'APPROVED' AND CURDATE() BETWEEN l.from_date AND l.to_date AND e.manager_id = ? AND l.employee_id != ?`;
    const [rows] = isAdmin ? await db.query(query, [empId]) : await db.query(query, [empId, empId]);
    res.json({ count: rows[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* =====================================================
   4. MODAL LISTS (Details)
===================================================== */
router.get("/pending-leaves-list", verifyToken, async (req, res) => {
    try {
        const isAdmin = ["ADMIN", "HR"].includes(req.user.role.toUpperCase());
        const empId = await getEmployeeId(req.user.id);
        
        // 🔥 FIX: Added leave_type, start_date, end_date, and total_days to the SELECT
        const query = isAdmin
          ? `SELECT l.id, e.name, l.reason, l.status, l.leave_type, 
                    l.from_date AS start_date, l.to_date AS end_date, 
                    DATEDIFF(l.to_date, l.from_date) + 1 AS total_days 
             FROM leaves l JOIN employees e ON l.employee_id = e.id 
             WHERE l.status = 'PENDING' ORDER BY l.id DESC LIMIT 10`
          : `SELECT l.id, e.name, l.reason, l.status, l.leave_type, 
                    l.from_date AS start_date, l.to_date AS end_date, 
                    DATEDIFF(l.to_date, l.from_date) + 1 AS total_days 
             FROM leaves l JOIN employees e ON l.employee_id = e.id 
             WHERE l.status = 'PENDING' AND e.manager_id = ? ORDER BY l.id DESC LIMIT 10`;
             
        const [rows] = isAdmin ? await db.query(query) : await db.query(query, [empId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/team-on-leave-list", verifyToken, async (req, res) => {
    try {
        const isAdmin = ["ADMIN", "HR"].includes(req.user.role.toUpperCase());
        const empId = await getEmployeeId(req.user.id);
        
        // 🔥 FIX: Added leave_type, start_date, end_date, and total_days to the SELECT
        const query = isAdmin
          ? `SELECT l.id, e.name, l.reason, 'Approved' as status, l.leave_type, 
                    l.from_date AS start_date, l.to_date AS end_date, 
                    DATEDIFF(l.to_date, l.from_date) + 1 AS total_days 
             FROM leaves l JOIN employees e ON l.employee_id = e.id 
             WHERE l.status = 'APPROVED' AND CURDATE() BETWEEN l.from_date AND l.to_date`
          : `SELECT l.id, e.name, l.reason, 'Approved' as status, l.leave_type, 
                    l.from_date AS start_date, l.to_date AS end_date, 
                    DATEDIFF(l.to_date, l.from_date) + 1 AS total_days 
             FROM leaves l JOIN employees e ON l.employee_id = e.id 
             WHERE l.status = 'APPROVED' AND CURDATE() BETWEEN l.from_date AND l.to_date AND e.manager_id = ?`;
             
        const [rows] = isAdmin ? await db.query(query) : await db.query(query, [empId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// --- LIST: Team Attendance List (For Modal) ---
router.get("/team-attendance-list", verifyToken, async (req, res) => {
  try {
    const isAdmin = ["ADMIN", "HR"].includes(req.user.role.toUpperCase());
    const empId = await getEmployeeId(req.user.id);

    // 🔥 FIX: Replaced hardcoded 'Present' with the actual al.status from the database
    const query = isAdmin
      ? `SELECT e.id, e.name, al.status, DATE_FORMAT(al.clock_in, '%H:%i') as in_time, e.designation
         FROM attendance_logs al
         JOIN employees e ON al.employee_id = e.id
         WHERE al.log_date = CURDATE() AND al.employee_id != ?`
      : `SELECT e.id, e.name, al.status, DATE_FORMAT(al.clock_in, '%H:%i') as in_time, e.designation
         FROM attendance_logs al
         JOIN employees e ON al.employee_id = e.id
         WHERE al.log_date = CURDATE() AND e.manager_id = ? AND al.employee_id != ?`;

    const [rows] = isAdmin
        ? await db.query(query, [empId])
        : await db.query(query, [empId, empId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
