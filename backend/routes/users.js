const express = require("express");
const router = express.Router();
const db = require("../db"); // mysql2/promise pool
const bcrypt = require("bcryptjs");
const { verifyToken } = require("../middleware/auth");
const { pushNotification } = require("./wsServer");

/* =========================
   CONSTANTS
========================= */
// FIX: Added "intern" so the server accepts the new dropdown option
const ALLOWED_ROLES = ["employee", "manager", "hr", "admin", "intern"];
const USER_CREATORS = ["admin", "hr"];

/* =========================
   ADD EMPLOYEE
   (CREATES USER + EMPLOYEE)
========================= */
router.post("/", verifyToken, async (req, res) => {
  try {
    // 1. Permission Check
    if (!USER_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    // 2. Destructure with defaults
    const {
      name,
      email,
      password,
      role = "employee", 
      department = "IT", 
      work_location = "Remote",
      designation = "Trainee",
      manager_id = null
    } = req.body;

    // Handle different variable names for client (frontend compatibility)
    const client_name = req.body.client_name || req.body.client || "Internal";

    // 3. Basic Validation
    if (!name || !email) {
      return res.status(400).json({
        message: "Name and Email are required"
      });
    }

    // FIX: Check against the updated list (now includes 'intern')
    if (!ALLOWED_ROLES.includes(role.toLowerCase())) {
      return res.status(400).json({ message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` });
    }

    /* CHECK DUPLICATE USER */
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existing.length) {
      return res.status(409).json({ message: "User already exists" });
    }

    /* PASSWORD GENERATION */
    const finalPassword =
      password && password.trim()
        ? password.trim()
        : Math.random().toString(36).slice(-10);

    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    /* INSERT USER */
    const [userResult] = await db.query(
      `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
      [name, email, hashedPassword, role.toLowerCase()]
    );

    const userId = userResult.insertId;

    /* INSERT EMPLOYEE */
    // Note: ensure manager_id is treated as NULL if empty string
    const finalManagerId = manager_id && manager_id !== "" ? manager_id : null;

    await db.query(
      `
      INSERT INTO employees
      (user_id, name, email, department, client_name, work_location, designation, manager_id, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        userId,
        name,
        email,
        department,
        client_name,
        work_location,
        designation,
        finalManagerId
      ]
    );

    /* NOTIFICATIONS (SAFE) */
    try {
      const [hrs] = await db.query(
        "SELECT id FROM users WHERE LOWER(role) = 'hr'"
      );

      for (const hr of hrs) {
        const [n] = await db.query(
          `INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, 'user', ?, 0)`,
          [hr.id, `New employee ${name} was added`]
        );

        pushNotification(hr.id, {
          id: n.insertId,
          type: "user",
          message: `New employee ${name} was added`,
          created_at: new Date()
        });
      }
    } catch (e) {
      console.warn("Notification skipped", e.message);
    }

    res.status(201).json({
      message: "Employee created successfully",
      user_id: userId
    });

  } catch (err) {
    console.error("CREATE EMPLOYEE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   UPDATE USER ROLE
   (ADMIN / HR ONLY)
========================= */
router.patch("/:userId/role", verifyToken, async (req, res) => {
  try {
    if (!USER_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    const { userId } = req.params;
    const { role } = req.body;

    if (!ALLOWED_ROLES.includes(role.toLowerCase())) {
      return res.status(400).json({ message: "Invalid role" });
    }

    /* Prevent self role change */
    if (Number(userId) === req.user.id) {
      return res.status(400).json({
        message: "You cannot change your own role"
      });
    }

    const [rows] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    await db.query("UPDATE users SET role = ? WHERE id = ?", [role.toLowerCase(), userId]);

    res.json({ message: "Role updated successfully" });

  } catch (err) {
    console.error("UPDATE ROLE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   LIST EMPLOYEES (ADMIN + HR)
========================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    if (!USER_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    // FIX: Includes 'm.name AS manager_name' for the frontend column
    const [rows] = await db.query(
      `
      SELECT
        e.id AS employee_id,
        u.id AS user_id,
        e.name,
        e.email,
        u.role,
        e.department,
        e.manager_id,
        m.name AS manager_name,
        e.active
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON m.id = e.manager_id
      ORDER BY e.name
      `
    );

    res.json(rows);

  } catch (err) {
    console.error("LIST USERS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});


/* =========================
   LIST ALL MANAGERS (ADMIN + HR)
========================= */
router.get("/managers", verifyToken, async (req, res) => {
  try {
    if (!USER_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    const [rows] = await db.query(
      `
      SELECT
        e.id AS employee_id,
        u.id AS user_id,
        e.name,
        e.email
      FROM employees e
      JOIN users u ON u.id = e.user_id
      WHERE LOWER(u.role) IN ('manager', 'admin', 'hr')
      AND e.active = 1
      ORDER BY e.name
      `
    );

    res.json(rows);

  } catch (err) {
    console.error("FETCH MANAGERS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});


/* =========================
   UPDATE REPORTING MANAGER
   (ADMIN / HR ONLY)
========================= */
router.patch("/:employeeId/manager", verifyToken, async (req, res) => {
  try {
    if (!["admin", "hr"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    const { employeeId } = req.params;
    let { manager_id } = req.body;

    // Convert empty string to null
    if (manager_id === "") manager_id = null;

    // Prevent self-manager
    if (manager_id && Number(employeeId) === Number(manager_id)) {
      return res.status(400).json({
        message: "Employee cannot be their own manager"
      });
    }

    // Employee exists?
    const [emp] = await db.query("SELECT id FROM employees WHERE id = ?", [employeeId]);
    if (!emp.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Manager validation (only if provided)
    if (manager_id) {
      const [mgr] = await db.query("SELECT id FROM employees WHERE id = ?", [manager_id]);
      if (!mgr.length) {
        return res.status(400).json({ message: "Invalid manager selected" });
      }
    }

    await db.query(
      "UPDATE employees SET manager_id = ? WHERE id = ?",
      [manager_id || null, employeeId]
    );

    res.json({ message: "Reporting manager updated" });

  } catch (err) {
    console.error("UPDATE MANAGER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   ORG SNAPSHOT
========================= */
router.get("/stats", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(LOWER(u.role) = 'manager') AS managers,
        SUM(e.active = 1) AS active,
        SUM(e.active = 0) AS inactive
      FROM employees e
      JOIN users u ON u.id = e.user_id
      `
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("STATS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   DEPARTMENT DISTRIBUTION
========================= */
router.get("/departments", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT department, COUNT(*) AS count
      FROM employees
      WHERE department IS NOT NULL AND department != ''
      GROUP BY department
      ORDER BY count DESC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("DEPARTMENT ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   RECENT EMPLOYEES
========================= */
router.get("/recent", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT e.name, u.role
      FROM employees e
      JOIN users u ON u.id = e.user_id
      ORDER BY e.id DESC
      LIMIT 5
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("RECENT USERS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* =========================
   DELETE EMPLOYEE
   (ADMIN / HR ONLY)
========================= */
router.delete("/:employeeId", verifyToken, async (req, res) => {
  const connection = await db.getConnection(); // Use a transaction for safety
  try {
    // 1. Permission Check
    if (!USER_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: "Admin / HR only" });
    }

    const { employeeId } = req.params;

    // 2. Find the Linked User ID
    const [emp] = await connection.query(
      "SELECT user_id, name FROM employees WHERE id = ?",
      [employeeId]
    );

    if (emp.length === 0) {
      connection.release();
      return res.status(404).json({ message: "Employee not found" });
    }

    const targetUserId = emp[0].user_id;
    const targetName = emp[0].name;

    // Prevent deleting yourself
    if (targetUserId === req.user.id) {
      connection.release();
      return res.status(400).json({ message: "You cannot delete yourself." });
    }

    await connection.beginTransaction();

    // 3. Delete from tables
    await connection.query("DELETE FROM employees WHERE id = ?", [employeeId]);
    await connection.query("DELETE FROM users WHERE id = ?", [targetUserId]);

    await connection.commit();

    console.log(`Deleted employee ${targetName} (ID: ${employeeId})`);
    res.json({ message: "Employee deleted successfully" });

  } catch (err) {
    await connection.rollback();
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: "Server error during deletion" });
  } finally {
    connection.release();
  }
});

module.exports = router;
