const express = require("express");
const router = express.Router();
const db = require("../db"); // mysql2/promise pool
const bcrypt = require("bcryptjs"); // Required for creating users
const { verifyToken } = require("../middleware/auth");

/* ==========================================================================
   HELPER: Get Employee ID from User ID
   ========================================================================== */
async function getEmployeeIdByUser(userId) {
  const [rows] = await db.query("SELECT id FROM employees WHERE user_id = ? LIMIT 1", [userId]);
  if (!rows.length) throw new Error("Employee not found");
  return rows[0].id;
}

/* ==========================================================================
   1. DASHBOARD SNAPSHOT (Matches GET /api/users/stats)
   ========================================================================== */
router.get("/stats", verifyToken, async (req, res) => {
  try {
    // 1. Total Employees (Count names in employees table)
    const [empCount] = await db.query("SELECT COUNT(name) AS count FROM employees");

    // 2. Managers (Count users with role 'manager')
    const [mgrCount] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'manager'");

    // 3. Active Users (Count users currently logged in)
    const [activeCount] = await db.query("SELECT COUNT(*) AS count FROM users WHERE is_logged_in = 1");

    res.json({
      total: empCount[0].count,
      managers: mgrCount[0].count,
      active: activeCount[0].count
    });
  } catch (err) {
    console.error("STATS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* ==========================================================================
   2. DEPARTMENT DISTRIBUTION (Matches GET /api/users/departments)
   ========================================================================== */
router.get("/departments", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT department, COUNT(*) as count
      FROM employees
      WHERE department IS NOT NULL AND department != ''
      GROUP BY department
    `);
    res.json(rows);
  } catch (err) {
    console.error("DEPT STATS ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});


/* ==========================================================================
   NEW: UPCOMING HOLIDAYS WIDGET 
   Must be placed BEFORE any /:id routes!
   ========================================================================== */
router.get('/upcoming-holidays', verifyToken, async (req, res) => { // Added verifyToken for security!
    try {
        const query = `
            SELECT name, holiday_date, description 
            FROM holidays 
            WHERE holiday_date >= CURDATE() AND is_public = 1
            ORDER BY holiday_date ASC 
            LIMIT 5;
        `;
        const [rows] = await db.query(query); // Changed db.execute to db.query to match your other routes
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching holidays:', error);
        res.status(500).json({ error: 'Failed to retrieve upcoming holidays' });
    }
});

/* ==========================================================================
   3. EMPLOYEE SEARCH (Matches GET /api/users/search)
   ========================================================================== */
router.get("/search", verifyToken, async (req, res) => {
  const q = (req.query.q || "").trim();
  const role = req.user.role?.toLowerCase();

  if (q.length < 2) return res.json([]);
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json([]);
  }

  try {
    let sql = `
      SELECT e.id, e.name, e.emp_code, e.designation, e.department
      FROM employees e
      WHERE (e.name LIKE ? OR e.emp_code LIKE ?)
    `;
    const params = [`%${q}%`, `%${q}%`];

    if (role === "manager") {
      const managerEmpId = await getEmployeeIdByUser(req.user.id);
      sql += " AND e.manager_id = ?";
      params.push(managerEmpId);
    }

    sql += " ORDER BY e.name LIMIT 10";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("EMP SEARCH ERROR:", err);
    res.json([]);
  }
});

/* ==========================================================================
   4. GET MY PROFILE (Matches GET /api/users/me)
   ========================================================================== */
router.get("/me", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
        e.id,
        e.name,
        e.email,
        e.employment_type,
        u.role,
        e.phoneno,
        u.profile_photo,
        e.department,
        e.client_name,
        e.work_location,
        e.designation,
        DATE_FORMAT(e.date_of_joining,'%Y-%m-%d') AS date_of_joining,
        e.manager_id,
        m.name AS manager_name,
        e.active,
        CASE WHEN e.active = 1 THEN 'Active' ELSE 'Inactive' END AS status
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.user_id = ?
      LIMIT 1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* ==========================================================================
   5. TIMELINE ROUTES
   ========================================================================== */
async function getTimeline(employeeId, res) {
  const timeline = [];
  try {
    const [[emp]] = await db.query(
      "SELECT DATE_FORMAT(date_of_joining,'%Y-%m-%d') AS join_date FROM employees WHERE id = ?",
      [employeeId]
    );

    if(emp && emp.join_date) {
      timeline.push({ label: "Joined LovasIT", date: emp.join_date });
    }

    const [history] = await db.query(
      `SELECT old_designation, new_designation,
              DATE_FORMAT(changed_at,'%Y-%m-%d') AS date
       FROM employee_role_history
       WHERE employee_id = ?
       ORDER BY changed_at`,
      [employeeId]
    );

    history.forEach(h => {
      timeline.push({
        label: `Designation changed from ${h.old_designation} to ${h.new_designation}`,
        date: h.date
      });
    });
    res.json(timeline);
  } catch (err) {
    console.error("TIMELINE FETCH ERROR:", err);
    res.json([]);
  }
}

router.get("/me/timeline", verifyToken, async (req, res) => {
  try {
    const employeeId = await getEmployeeIdByUser(req.user.id);
    await getTimeline(employeeId, res);
  } catch (e) {
    res.json([]);
  }
});

router.get("/:id/timeline", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const employeeId = req.params.id;

  try {
      if (role === "manager") {
          const managerEmpId = await getEmployeeIdByUser(req.user.id);
          const [rows] = await db.query(
              "SELECT id FROM employees WHERE id = ? AND (manager_id = ? OR id = ?)",
              [employeeId, managerEmpId, managerEmpId]
          );
          if (!rows.length) return res.status(403).json({ message: "Access denied" });
      }
      await getTimeline(employeeId, res);
  } catch (err) {
      console.error("TIMELINE ERROR:", err);
      res.status(500).json({ message: "Server error" });
  }
});

/* ==========================================================================
   6. GET ALL EMPLOYEES (Matches GET /api/users)
   ========================================================================== */
router.get("/", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();

  if (!["admin", "hr", "manager"].includes(role)) {
     return res.status(403).json({ message: "Access denied" });
  }

  try {
    const [rows] = await db.query(`
      SELECT
        e.id,
        e.user_id,
        e.name,
        e.email,
        u.role,
        e.phoneno AS phone,
        e.emp_code,
        e.department,
        e.designation,
        e.manager_id,
        m.name AS manager_name,
        e.active,
        u.active,
        u.profile_photo
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON m.id = e.manager_id
      ORDER BY e.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("EMP LIST ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* ==========================================================================
   7. CREATE EMPLOYEE (Matches POST /api/users)
   ========================================================================== */
router.post("/", verifyToken, async (req, res) => {
    if (!["admin", "hr"].includes(req.user.role?.toLowerCase())) {
        return res.status(403).json({ message: "Access denied" });
    }

    // Notice we grab 'phone' from req.body here
    const { name, email, password, role, department, designation, client_name, manager_id, phone,emp_code } = req.body;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [existing] = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
        if (existing.length > 0) {
            throw new Error("Email already exists");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [userResult] = await connection.query(
            "INSERT INTO users (name, email, password, role, active, is_logged_in) VALUES (?, ?, ?, ?, 1, 0)",
            [name, email, hashedPassword, role || 'employee']
        );
        const newUserId = userResult.insertId;

        // The query is now safely inside the try block
        await connection.query(
            `INSERT INTO employees
            (user_id, name, email, department, designation, client_name, manager_id, active, phoneno,emp_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?,?)`,
            [newUserId, name, email, department, designation, client_name, manager_id || null, phone || null,emp_code || null]
        );

        await connection.commit();
        res.status(201).json({ success: true, message: "User created" });

    } catch (err) {
        await connection.rollback();
        console.error("CREATE ERROR:", err);
        res.status(400).json({ message: err.message || "Create failed" });
    } finally {
        connection.release();
    }
});
/* ==========================================================================
   8. GET EMPLOYEE BY ID (Matches GET /api/users/:id)
   ========================================================================== */
router.get("/:id", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  const targetId = req.params.id;

  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const [rows] = await db.query(`
      SELECT
        e.*,
        u.role,
        u.profile_photo,
        u.active,
        m.name AS manager_name
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.id = ? OR e.user_id = ?
      LIMIT 1
    `, [targetId, targetId]);

    if (!rows.length) return res.status(404).json({ message: "Employee not found" });
    res.json(rows[0]);

  } catch (err) {
    console.error("GET EMP ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* ==========================================================================
   9. UPDATE DETAILS (Matches PATCH /api/users/:id - EMPLOYEE ID)
   ========================================================================== */
router.patch("/:id", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.params;
  const { name, email, department, designation, manager_id, active, phone,emp_code } = req.body;

  try {
    // 1. Update Employees Table
    let sql = "UPDATE employees SET ";
    const params = [];
    const updates = [];

    if (name) { updates.push("name = ?"); params.push(name); }
    if (email) { updates.push("email = ?"); params.push(email); }
    if (department) { updates.push("department = ?"); params.push(department); }
    if (designation) { updates.push("designation = ?"); params.push(designation); }
    if (phone !== undefined) { updates.push("phoneno = ?"); params.push(phone); }
    if (emp_code !== undefined) { updates.push("emp_code = ?"); params.push(emp_code); }
    if (manager_id !== undefined) {
        updates.push("manager_id = ?");
        params.push(manager_id && parseInt(manager_id) > 0 ? parseInt(manager_id) : null);
    }
    if (active !== undefined) { updates.push("active = ?"); params.push(active); }

    if (updates.length > 0) {
        sql += updates.join(", ") + " WHERE id = ?";
        params.push(id);
        await db.query(sql, params);
    }

    // 2. Sync Name/Email to Users Table (if changed)
    if (name || email) {
        const [emp] = await db.query("SELECT user_id FROM employees WHERE id = ?", [id]);
        if (emp.length > 0) {
            let userSql = "UPDATE users SET ";
            const userParams = [];
            const userUpdates = [];

            if (name) { userUpdates.push("name = ?"); userParams.push(name); }
            if (email) { userUpdates.push("email = ?"); userParams.push(email); }

            userSql += userUpdates.join(", ") + " WHERE id = ?";
            userParams.push(emp[0].user_id);
            await db.query(userSql, userParams);
        }
    }

    res.json({ success: true, message: "Employee updated" });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});
/* ==========================================================================
   10. UPDATE ROLE (Matches PATCH /api/users/:id/role - USER ID)
   ========================================================================== */
router.patch("/:id/role", verifyToken, async (req, res) => {
    if (!["admin"].includes(req.user.role?.toLowerCase())) {
        return res.status(403).json({ message: "Only Admins can change roles" });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ message: "Role is required" });

    try {
        let [result] = await db.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);

        // Safety: If no rows affected, assume frontend sent Employee ID by mistake and try to find User ID
        if (result.affectedRows === 0) {
             const [emp] = await db.query("SELECT user_id FROM employees WHERE id = ?", [id]);
             if (emp.length > 0) {
                 await db.query("UPDATE users SET role = ? WHERE id = ?", [role, emp[0].user_id]);
             } else {
                 return res.status(404).json({ message: "User not found" });
             }
        }
        res.json({ success: true });
    } catch (err) {
        console.error("ROLE UPDATE ERROR:", err);
        res.status(500).json({ message: "DB Error" });
    }
});

/* ==========================================================================
   11. DELETE EMPLOYEE (Matches DELETE /api/users/:id - EMPLOYEE ID)
   ========================================================================== */
router.delete("/:id", verifyToken, async (req, res) => {
    if (!["admin", "hr"].includes(req.user.role?.toLowerCase())) {
        return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [emp] = await connection.query("SELECT user_id FROM employees WHERE id = ?", [id]);

        if (!emp.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Employee not found" });
        }
        const userId = emp[0].user_id;

        await connection.query("DELETE FROM employees WHERE id = ?", [id]);

        if (userId) {
            await connection.query("DELETE FROM users WHERE id = ?", [userId]);
        }

        await connection.commit();
        res.json({ success: true, message: "Employee and Account deleted" });

    } catch (err) {
        await connection.rollback();
        console.error("DELETE ERROR:", err);
        res.status(500).json({ message: "Delete failed" });
    } finally {
        connection.release();
    }
});

/* ==========================================================================
   12. NEW: TEAM CONTEXT (Manager and Peers)
   ========================================================================== */
async function getTeamContext(employeeId, res) {
    try {
        // 1. Get the employee's manager_id
        const [empRows] = await db.query("SELECT manager_id FROM employees WHERE id = ? LIMIT 1", [employeeId]);
        if (!empRows.length) return res.status(404).json({ message: "Employee not found" });

        const managerId = empRows[0].manager_id;
        let manager = null;
        let peers = [];

        if (managerId) {
            // 2. Fetch manager details
            const [mgrRows] = await db.query(
                "SELECT id, name, designation FROM employees WHERE id = ?",
                [managerId]
            );
            if (mgrRows.length) manager = mgrRows[0];

            // 3. Fetch peers (same manager, excluding self, active only)
            const [peerRows] = await db.query(
                "SELECT id, name, designation FROM employees WHERE manager_id = ? AND id != ? AND active = 1",
                [managerId, employeeId]
            );
            peers = peerRows;
        }

        res.json({ manager, peers });
    } catch (err) {
        console.error("TEAM CONTEXT ERROR:", err);
        res.status(500).json({ message: "DB Error" });
    }
}

router.get("/me/team-context", verifyToken, async (req, res) => {
    try {
        const employeeId = await getEmployeeIdByUser(req.user.id);
        await getTeamContext(employeeId, res);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/:id/team-context", verifyToken, async (req, res) => {
    try {
        await getTeamContext(req.params.id, res);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});


module.exports = router;
