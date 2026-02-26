const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const notificationService = require("../services/notificationService");

console.log("✅ LOADED LEAVES API - FULLY FIXED");

/* ==================================================
   HELPER: GET EMPLOYEE + MANAGER
================================================== */
async function getEmployeeDetails(userId) {
  const [rows] = await db.query(
    `
    SELECT id AS employee_id,
           manager_id
    FROM employees
    WHERE user_id = ?
    `,
    [userId]
  );

  if (!rows.length) {
    throw new Error("EMPLOYEE_NOT_FOUND");
  }

  return rows[0];
}

/* ==================================================
   GET LEAVE BALANCE
================================================== */
router.get("/balance", verifyToken, async (req, res) => {
  try {
    const { employee_id } = await getEmployeeDetails(req.user.id);
    const currentYear = new Date().getFullYear();

    const [types] = await db.query(
      "SELECT code, name, annual_quota FROM leave_types"
    );

    const [usage] = await db.query(
      `
      SELECT leave_type,
             SUM(DATEDIFF(to_date, from_date) + 1) AS days_used
      FROM leaves
      WHERE employee_id = ?
        AND LOWER(status) = 'approved'
        AND YEAR(from_date) = ?
      GROUP BY leave_type
      `,
      [employee_id, currentYear]
    );

    const result = types.map(type => {
      const usedRow = usage.find(u => u.leave_type === type.code);
      const used = usedRow ? Number(usedRow.days_used) : 0;
      const total = Number(type.annual_quota) || 0;

      return {
        code: type.code,
        name: type.name,
        total,
        used,
        balance: Math.max(total - used, 0)
      };
    });

    res.json(result);

  } catch (err) {
    console.error("Balance Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

/* ==================================================
   APPLY LEAVE
================================================== */
router.post("/apply", verifyToken, async (req, res) => {
  try {
    const { from_date, to_date, leave_type, reason } = req.body;

    if (!from_date || !to_date || !leave_type) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (new Date(to_date) < new Date(from_date)) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const { employee_id, manager_id } =
      await getEmployeeDetails(req.user.id);

    const [overlap] = await db.query(
      `
      SELECT id FROM leaves
      WHERE employee_id = ?
        AND LOWER(status) != 'rejected'
        AND (from_date <= ? AND to_date >= ?)
      LIMIT 1
      `,
      [employee_id, to_date, from_date]
    );

    if (overlap.length) {
      return res.status(400).json({ message: "Leave dates overlap" });
    }

    await db.query(
      `
      INSERT INTO leaves
      (employee_id, from_date, to_date, leave_type, reason, status)
      VALUES (?, ?, ?, ?, ?, 'Pending')
      `,
      [employee_id, from_date, to_date, leave_type, reason || ""]
    );

    /* 🔥 NOTIFICATIONS */

    const [empUser] = await db.query(
      `SELECT user_id, name FROM employees WHERE id = ?`,
      [employee_id]
    );

    const employeeUserId = empUser[0]?.user_id;
    const employeeName = empUser[0]?.name || "Employee";

    // Self
    if (employeeUserId) {
      await notificationService.sendNotification(
        employeeUserId,
        "LEAVE_APPLIED",
        `Your leave request from ${from_date} to ${to_date} has been submitted.`
      );
    }

    // Manager (manager_id is employees.id, need users.id)
    if (manager_id) {
      const [managerUser] = await db.query(
        `SELECT user_id FROM employees WHERE id = ?`,
        [manager_id]
      );

      if (managerUser.length) {
        await notificationService.sendNotification(
          managerUser[0].user_id,
          "LEAVE_REQUEST",
          `${employeeName} applied for leave from ${from_date} to ${to_date}.`
        );
      }
    }

    // HR + Admin
    const [hrAdmins] = await db.query(
      `SELECT id FROM users WHERE role IN ('admin','hr')`
    );

    for (const user of hrAdmins) {
      await notificationService.sendNotification(
        user.id,
        "LEAVE_REQUEST",
        `${employeeName} applied for leave from ${from_date} to ${to_date}.`
      );
    }

    res.json({ message: "Leave applied successfully" });

  } catch (err) {
    console.error("Apply Leave Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

/* ==================================================
   GET LEAVE HISTORY (FRONTEND COMPATIBLE)
================================================== */
router.get("/history", verifyToken, async (req, res) => {
  try {
    const { employee_id } = await getEmployeeDetails(req.user.id);

    const [rows] = await db.query(
      `
      SELECT 
        l.id,
        l.leave_type AS type_code,
        COALESCE(lt.name, l.leave_type) AS type,
        DATE_FORMAT(l.from_date, '%Y-%m-%d') AS 'from',
        DATE_FORMAT(l.to_date, '%Y-%m-%d') AS 'to',
        DATEDIFF(l.to_date, l.from_date) + 1 AS days,
        l.status,
        l.reason
      FROM leaves l
      LEFT JOIN leave_types lt ON l.leave_type = lt.code
      WHERE l.employee_id = ?
      ORDER BY l.created_at DESC
      `,
      [employee_id]
    );

    res.json(rows);

  } catch (err) {
    console.error("History Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});


/* ==================================================
   CANCEL LEAVE
================================================== */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { employee_id } = await getEmployeeDetails(req.user.id);

    await db.query(
      `
      DELETE FROM leaves
      WHERE id = ?
        AND employee_id = ?
        AND LOWER(status) = 'pending'
      `,
      [req.params.id, employee_id]
    );

    res.json({ message: "Leave cancelled" });

  } catch (err) {
    console.error("Delete Leave Error:", err);
    res.status(500).json({ message: "Error" });
  }
});

/* ==================================================
   APPROVE / REJECT
================================================== */
router.put("/:id/action", verifyToken, async (req, res) => {

  const connection = await db.getConnection();

  try {
    const leaveId = req.params.id;
    const normalizedAction = req.body.action?.toLowerCase();

    if (!["approved", "rejected"].includes(normalizedAction)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const finalStatus =
      normalizedAction === "approved" ? "Approved" : "Rejected";

    const role = req.user.role?.toLowerCase();

    if (!["admin", "hr", "manager"].includes(role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await connection.beginTransaction();

    const [leaveRows] = await connection.query(
      `
      SELECT l.employee_id, e.manager_id
      FROM leaves l
      JOIN employees e ON l.employee_id = e.id
      WHERE l.id = ?
        AND LOWER(l.status) = 'pending'
      `,
      [leaveId]
    );

    if (!leaveRows.length) {
      await connection.rollback();
      return res.status(400).json({
        message: "Leave not found or already processed"
      });
    }

    const leave = leaveRows[0];

    // 🔥 FIXED MANAGER VALIDATION
    if (role === "manager") {
      if (!leave.manager_id ||
          Number(leave.manager_id) !== Number(req.user.employee_id)) {
        await connection.rollback();
        return res.status(403).json({ message: "Not your employee" });
      }
    }

    await connection.query(
      `
      UPDATE leaves
      SET status = ?,
          approved_by = ?,
          approved_role = ?,
          approved_at = NOW()
      WHERE id = ?
      `,
      [finalStatus, req.user.id, role, leaveId]
    );

    // Notify employee
    const [empUser] = await connection.query(
      `SELECT user_id FROM employees WHERE id = ?`,
      [leave.employee_id]
    );

    if (empUser.length) {
      await notificationService.sendNotification(
        empUser[0].user_id,
        "LEAVE_UPDATE",
        `Your leave request has been ${finalStatus}.`
      );
    }

    await connection.commit();

    res.json({
      message: `Leave ${normalizedAction} successfully`
    });

  } catch (err) {
    await connection.rollback();
    console.error("Leave Action Error:", err);
    res.status(500).json({ message: "Server Error" });
  } finally {
    connection.release();
  }
});

module.exports = router;
