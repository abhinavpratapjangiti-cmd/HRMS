const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

/* ======================================================
   PENDING TIMESHEETS
   GET /api/manager/timesheets/pending
====================================================== */
router.get("/timesheets/pending", verifyToken, (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (!req.user.employee_id) {
    return res.status(400).json({ message: "Employee ID missing in token" });
  }

  const sql = `
    SELECT
      t.id,
      t.work_date,
      t.project,
      t.task,
      t.hours,
      e.name AS employee
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.status IN ('Submitted', 'SUBMITTED')
      AND e.manager_id = ?
    ORDER BY t.work_date DESC
  `;

  db.query(sql, [req.user.employee_id])
    .then(([rows]) => res.json(rows))
    .catch(err => {
      console.error("❌ Pending timesheets error:", err);
      res.status(500).json({ message: "DB error" });
    });
});

/* ======================================================
   APPROVE / REJECT TIMESHEET
   POST /api/manager/timesheets/:id/:action
====================================================== */
router.post("/timesheets/:id/:action", verifyToken, (req, res) => {
  const { id, action } = req.params;

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: "Invalid action" });
  }

  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const status = action === "approve" ? "Approved" : "Rejected";

  db.query(
    `
    SELECT t.employee_id, u.id AS user_id
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    JOIN users u ON u.id = e.user_id
    WHERE t.id = ?
    `,
    [id]
  )
    .then(([rows]) => {
      if (!rows.length) {
        throw new Error("NOT_FOUND");
      }

      return db
        .query(
          `
          UPDATE timesheets
          SET status = ?, approved_by = ?, approved_at = NOW()
          WHERE id = ?
          `,
          [status, req.user.id, id]
        )
        .then(() => rows[0]);
    })
    .then(row => {
      return db
        .query(
          `
          INSERT INTO notifications (user_id, type, message, is_read)
          VALUES (?, 'timesheet', ?, 0)
          `,
          [row.user_id, `Your timesheet was ${status}`]
        )
        .then(([result]) => {
          // 🔔 REALTIME BELL PUSH
          pushNotification(row.user_id, {
            id: result.insertId,
            type: "timesheet",
            message: `Your timesheet was ${status}`,
            created_at: new Date()
          });
        })
        .catch(() => {}); // notification failure must not block approval
    })
    .then(() => res.json({ success: true }))
    .catch(err => {
      if (err.message === "NOT_FOUND") {
        return res.status(404).json({ message: "Timesheet not found" });
      }

      console.error("❌ Timesheet approval error:", err);
      res.status(500).json({ message: "DB error" });
    });
});

/* ======================================================
   PENDING LEAVES (MANAGER)
   GET /api/manager/leaves/pending
====================================================== */
router.get("/leaves/pending", verifyToken, (req, res) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ message: "Manager only" });
  }

  if (!req.user.employee_id) {
    return res.status(400).json({ message: "Employee ID missing in token" });
  }

  const sql = `
    SELECT
      l.id,
      e.name AS employee,
      l.from_date,
      l.to_date,
      l.leave_type,
      DATEDIFF(l.to_date, l.from_date) + 1 AS days
    FROM leaves l
    JOIN employees e ON e.id = l.employee_id
    WHERE l.status = 'PENDING'
      AND e.manager_id = ?
    ORDER BY l.from_date ASC
  `;

  db.query(sql, [req.user.employee_id])
    .then(([rows]) => res.json(rows))
    .catch(err => {
      console.error("❌ Pending leaves error:", err);
      res.status(500).json({ message: "DB error" });
    });
});

/* ======================================================
   MANAGER DASHBOARD SUMMARY
   GET /api/manager/summary
====================================================== */
router.get("/summary", verifyToken, (req, res) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ message: "Manager only" });
  }

  if (!req.user.employee_id) {
    return res.status(400).json({ message: "Employee ID missing in token" });
  }

  const managerId = req.user.employee_id;

  const sql = `
    SELECT
      (
        SELECT COUNT(DISTINCT a.employee_id)
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.date = CURDATE()
          AND e.manager_id = ?
      ) AS present,

      (
        SELECT COUNT(*)
        FROM employees
        WHERE manager_id = ?
      ) AS total,

      (
        SELECT COUNT(DISTINCT l.employee_id)
        FROM leaves l
        JOIN employees e ON e.id = l.employee_id
        WHERE l.status = 'APPROVED'
          AND CURDATE() BETWEEN l.from_date AND l.to_date
          AND e.manager_id = ?
      ) AS on_leave,

      (
        SELECT COUNT(*)
        FROM leaves l
        JOIN employees e ON e.id = l.employee_id
        WHERE l.status = 'PENDING'
          AND e.manager_id = ?
      ) AS pending_leaves,

      (
        SELECT COUNT(*)
        FROM timesheets t
        JOIN employees e ON e.id = t.employee_id
        WHERE t.status IN ('Submitted', 'SUBMITTED')
          AND e.manager_id = ?
      ) AS pending_timesheets
  `;

  const params = [
    managerId,
    managerId,
    managerId,
    managerId,
    managerId
  ];

  db.query(sql, params)
    .then(([rows]) => res.json(rows[0]))
    .catch(err => {
      console.error("❌ Manager summary DB error:", err);
      res.status(500).json({ message: "DB error" });
    });
});

module.exports = router;
