// backend/routes/leaves.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

// small debug log so you can confirm the route loaded in pm2 logs
console.log("✅ LOADED BACKEND ROUTES/LEAVES:", __filename);

/* =========================
   Notification helper
   (fire-and-forget)
========================= */
function createNotification(userId, type, message) {
  return db
    .query(
      `
      INSERT INTO notifications (user_id, type, message, is_read)
      VALUES (?, ?, ?, 0)
      `,
      [userId, type, message]
    )
    .then(([result]) => {
      if (result && result.insertId) {
        try {
          pushNotification(userId, {
            id: result.insertId,
            type,
            message,
            created_at: new Date()
          });
        } catch (pushErr) {
          console.warn("pushNotification failed:", pushErr && pushErr.message);
        }
      }
    })
    .catch(() => {}); // never block caller
}

/* =========================
   Helper: get employee by user id
   returns single employee row
========================= */
function getEmployeeByUser(userId) {
  return db
    .query(
      `SELECT id, name, manager_id FROM employees WHERE user_id = ? LIMIT 1`,
      [userId]
    )
    .then(([rows]) => {
      if (!rows || !rows.length) {
        throw new Error("EMPLOYEE_NOT_FOUND");
      }
      return rows[0];
    });
}

/* =========================
   APPLY LEAVE
   POST /apply
========================= */
router.post("/apply", verifyToken, (req, res) => {
  const { from_date, to_date, leave_type, reason } = req.body;

  if (!from_date || !to_date || !leave_type) {
    return res.status(400).json({
      message: "from_date, to_date and leave_type are required"
    });
  }

  getEmployeeByUser(req.user.id)
    .then(emp => {
      return db
        .query(
          `
          SELECT 1 FROM leaves
          WHERE employee_id = ?
            AND status IN ('PENDING','APPROVED')
            AND from_date <= ?
            AND to_date >= ?
          LIMIT 1
          `,
          [emp.id, to_date, from_date]
        )
        .then(([overlap]) => {
          if (overlap && overlap.length) {
            throw new Error("OVERLAP");
          }
          return emp;
        });
    })
    .then(emp =>
      db
        .query(
          `
          INSERT INTO leaves
            (employee_id, from_date, to_date, leave_type, reason, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())
          `,
          [emp.id, from_date, to_date, leave_type, reason || null]
        )
        .then(([result]) => ({ emp, result }))
    )
    .then(({ emp, result }) => {
      if (emp.manager_id) {
        db.query(
          `SELECT user_id FROM employees WHERE id = ? LIMIT 1`,
          [emp.manager_id]
        )
          .then(([rows]) => {
            if (rows && rows.length) {
              createNotification(
                rows[0].user_id,
                "leave",
                `${emp.name} applied for leave (${from_date} → ${to_date})`
              );
            }
          })
          .catch(() => {});
      }

      res.json({
        status: "success",
        message: "Leave applied successfully",
        leave_id: result.insertId || null
      });
    })
    .catch(err => {
      if (err.message === "EMPLOYEE_NOT_FOUND") {
        return res.status(400).json({ message: "Employee not found" });
      }
      if (err.message === "OVERLAP") {
        return res.status(400).json({
          message: "Leave already applied for selected dates"
        });
      }

      console.error("Apply leave error:", err);
      res.status(500).json({ message: "Internal server error" });
    });
});

/* =========================
   LEAVE BALANCE
   GET /balance
========================= */
router.get("/balance", verifyToken, (req, res) => {
  getEmployeeByUser(req.user.id)
    .then(emp =>
      db.query(
        `
        SELECT
          lt.code AS leave_type,
          lt.name,
          lt.annual_quota,
          COALESCE(SUM(
            CASE
              WHEN l.status = 'APPROVED'
              THEN DATEDIFF(l.to_date, l.from_date) + 1
              ELSE 0
            END
          ), 0) AS used,
          GREATEST(
            lt.annual_quota -
            COALESCE(SUM(
              CASE
                WHEN l.status = 'APPROVED'
                THEN DATEDIFF(l.to_date, l.from_date) + 1
                ELSE 0
              END
            ), 0),
            0
          ) AS balance
        FROM leave_types lt
        LEFT JOIN leaves l
          ON l.leave_type = lt.code
          AND l.employee_id = ?
        GROUP BY lt.code, lt.name, lt.annual_quota
        ORDER BY lt.code
        `,
        [emp.id]
      )
    )
    .then(([rows]) => res.json(rows || []))
    .catch(err => {
      if (err.message === "EMPLOYEE_NOT_FOUND") {
        return res.status(400).json({ message: "Employee not found" });
      }

      console.error("Leave balance error:", err);
      res.status(500).json({ message: "DB error" });
    });
});

module.exports = router;
