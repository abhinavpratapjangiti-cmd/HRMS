const express = require("express");
const router = express.Router();
const db = require("../db");
const {verifyToken} = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

/* =========================
   🔔 HELPER: NOTIFICATION
========================= */
function notifyUser(userId, message) {
  db.query(
    `
    INSERT INTO notifications (user_id, type, message, is_read)
    VALUES (?, 'timesheet', ?, 0)
    `,
    [userId, message],
    (err, result) => {
      if (!err) {
        // 🔔 REALTIME PUSH
        pushNotification(userId, {
          id: result.insertId,
          type: "timesheet",
          message,
          created_at: new Date()
        });
      }
    }
  );
}


/* =========================
   MANAGER SUMMARY
   GET /api/manager/summary
========================= */
router.get("/summary", verifyToken, (req, res) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const managerEmpId = req.user.employee_id;

  if (!managerEmpId) {
    return res.status(400).json({ message: "Employee mapping missing" });
  }

  const sql = `
    SELECT
      /* Present today = anyone who has an attendance record today */
      COALESCE((
        SELECT COUNT(DISTINCT a.employee_id)
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE DATE(a.created_at) = CURDATE()
          AND e.manager_id = ?
      ), 0) AS present,

      /* Total reportees */
      COALESCE((
        SELECT COUNT(*)
        FROM employees
        WHERE manager_id = ?
      ), 0) AS total,

      /* On approved leave today */
      COALESCE((
        SELECT COUNT(DISTINCT l.employee_id)
        FROM leaves l
        JOIN employees e ON e.id = l.employee_id
        WHERE l.status = 'Approved'
          AND CURDATE() BETWEEN l.from_date AND l.to_date
          AND e.manager_id = ?
      ), 0) AS on_leave,

      /* Pending timesheets */
      COALESCE((
        SELECT COUNT(*)
        FROM timesheets t
        JOIN employees e ON e.id = t.employee_id
        WHERE t.status = 'Submitted'
          AND e.manager_id = ?
      ), 0) AS pending_timesheets
  `;

  db.query(
    sql,
    [managerEmpId, managerEmpId, managerEmpId, managerEmpId],
    (err, rows) => {
      if (err) {
        console.error("Manager summary error:", err);
        return res.status(500).json({ message: "Summary failed" });
      }

      res.json(rows[0]);
    }
  );
});


/* =========================
   PENDING TIMESHEETS
   GET /api/manager/timesheets/pending
========================= */
router.get("/timesheets/pending", verifyToken, (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // HR / Admin → see all
  if (req.user.role !== "manager") {
    return db.query(
      `
      SELECT
        t.id,
        t.work_date,
        t.hours,
        e.name AS employee
      FROM timesheets t
      JOIN employees e ON e.id = t.employee_id
      WHERE t.status = 'Submitted'
      ORDER BY t.work_date DESC
      `,
      (err, rows) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json(rows);
      }
    );
  }

  // Manager → only reportees
  const managerEmpId = req.user.employee_id;

  if (!managerEmpId) {
    return res.status(400).json({ message: "Employee mapping missing" });
  }

  db.query(
    `
    SELECT
      t.id,
      t.work_date,
      t.hours,
      e.name AS employee
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE e.manager_id = ?
      AND t.status = 'Submitted'
    ORDER BY t.work_date DESC
    `,
    [managerEmpId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows);
    }
  );
});

/* =========================
   APPROVE / REJECT TIMESHEET
   POST /api/manager/timesheets/:id/:action
========================= */
router.post("/timesheets/:id/:action", verifyToken, (req, res) => {
  const { id, action } = req.params;
  const status = action === "approve" ? "Approved" : "Rejected";

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: "Invalid action" });
  }

  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const approverEmpId = req.user.employee_id;

  db.query(
    `
    SELECT
      t.employee_id,
      t.work_date,
      e.manager_id,
      u.id AS user_id
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    JOIN users u ON u.id = e.user_id
    WHERE t.id = ?
    `,
    [id],
    (err, rows) => {
      if (err || !rows.length) {
        return res.status(404).json({ message: "Timesheet not found" });
      }

      const ts = rows[0];

      // ❌ No self approval
      if (
        req.user.role === "manager" &&
        ts.employee_id === approverEmpId
      ) {
        return res.status(403).json({ message: "Self approval not allowed" });
      }

      // ❌ Manager ownership check
      if (
        req.user.role === "manager" &&
        ts.manager_id !== approverEmpId
      ) {
        return res.status(403).json({ message: "Not your reportee" });
      }

      db.query(
        `
        UPDATE timesheets
        SET status = ?, approved_by = ?, approved_at = NOW()
        WHERE id = ?
        `,
        [status, req.user.id, id],
        err2 => {
          if (err2) return res.status(500).json({ message: "DB error" });

          notifyUser(
            ts.user_id,
            `Your timesheet for ${ts.work_date} was ${status}`
          );

          res.json({ success: true });
        }
      );
    }
  );
});

module.exports = router;
