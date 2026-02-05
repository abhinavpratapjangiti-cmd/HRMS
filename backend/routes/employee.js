const express = require("express");
const router = express.Router();
const db = require("../db"); // mysql2/promise pool
const { verifyToken } = require("../middleware/auth");

/* =========================
   HELPER: USER → EMPLOYEE ID
========================= */
function getEmployeeIdByUser(userId) {
  return db
    .query(
      "SELECT id FROM employees WHERE user_id = ? LIMIT 1",
      [userId]
    )
    .then(([rows]) => {
      if (!rows.length) throw new Error("Employee not found");
      return rows[0].id;
    });
}

/* =========================
   1. EMPLOYEE SEARCH (ADMIN / HR / MANAGER)
========================= */
router.get("/search", verifyToken, (req, res) => {
  const q = (req.query.q || "").trim();
  const role = req.user.role?.toLowerCase();

  if (q.length < 2) return res.json([]);
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json([]);
  }

  let sql = `
    SELECT
      e.id,
      e.name,
      e.employee_code,
      e.designation,
      e.department
    FROM employees e
    WHERE (
      e.name LIKE ?
      OR e.employee_code LIKE ?
    )
  `;
  const params = [`%${q}%`, `%${q}%`];

  const queryPromise =
    role === "manager"
      ? getEmployeeIdByUser(req.user.id).then(managerEmpId => {
          sql += " AND e.manager_id = ?";
          params.push(managerEmpId);
          sql += " ORDER BY e.name LIMIT 10";
          return db.query(sql, params);
        })
      : (sql += " ORDER BY e.name LIMIT 10", db.query(sql, params));

  queryPromise
    .then(([rows]) => res.json(rows))
    .catch(err => {
      console.error("EMP SEARCH ERROR:", err);
      res.json([]);
    });
});

/* =========================
   2. GET ALL EMPLOYEES (ADMIN / HR)
========================= */
router.get("/", verifyToken, (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  db.query(`
    SELECT
      e.id,
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
  `)
    .then(([rows]) => res.json(rows))
    .catch(err => {
      console.error("EMP LIST ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });
});

/* =========================
   3. GET MY PROFILE
========================= */
router.get("/me", verifyToken, (req, res) => {
  db.query(
    `
    SELECT
      e.id,
      e.name,
      e.email,
      e.employment_type,
      u.role,
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
    LIMIT 1
    `,
    [req.user.id]
  )
    .then(([rows]) => {
      if (!rows.length) {
        return res.status(404).json({ message: "Employee not found" });
      }
      res.json(rows[0]);
    })
    .catch(() => {
      res.status(500).json({ message: "DB error" });
    });
});

/* =========================
   4. GET EMPLOYEE BY ID
========================= */
router.get("/:id", verifyToken, (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  let sql = `
    SELECT
      e.id,
      e.name,
      u.email,
      e.employment_type,
      u.role,
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
    WHERE e.id = ?
  `;
  const params = [req.params.id];

  const queryPromise =
    role === "manager"
      ? getEmployeeIdByUser(req.user.id).then(managerEmpId => {
          sql += " AND (e.manager_id = ? OR e.id = ?)";
          params.push(managerEmpId, managerEmpId);
          sql += " LIMIT 1";
          return db.query(sql, params);
        })
      : (sql += " LIMIT 1", db.query(sql, params));

  queryPromise
    .then(([rows]) => {
      if (!rows.length) {
        return res.status(404).json({ message: "Employee not found" });
      }
      res.json(rows[0]);
    })
    .catch(() => {
      res.status(500).json({ message: "DB error" });
    });
});

/* =========================
   5. UPDATE EMPLOYEE (FULL PATCH)
   This fixes the 404 error on PUT /api/employees/:id
========================= */
router.put("/:id", verifyToken, async (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.params;
  const { name, email, role: newRole, department, manager_id } = req.body;

  try {
    // 1. Update the 'employees' table
    await db.query(
      `UPDATE employees 
       SET name = ?, email = ?, department = ?, manager_id = ? 
       WHERE id = ?`,
      [name, email, department, manager_id || null, id]
    );

    // 2. Update the associated 'users' table role
    await db.query(
      `UPDATE users u
       JOIN employees e ON e.user_id = u.id
       SET u.role = ?
       WHERE e.id = ?`,
      [newRole || 'employee', id]
    );

    res.json({ success: true, message: "Employee updated successfully" });
  } catch (err) {
    console.error("UPDATE EMPLOYEE ERROR:", err);
    res.status(500).json({ message: "Failed to update employee" });
  }
});

/* =========================
   6. DELETE EMPLOYEE
========================= */
router.delete("/:id", verifyToken, async (req, res) => {
    if (!["admin", "hr"].includes(req.user.role?.toLowerCase())) {
        return res.status(403).json({ message: "Access denied" });
    }
    const { id } = req.params;
    try {
        await db.query("DELETE FROM employees WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: "DB error" });
    }
});

/* =========================
   7. TIMELINE LOGIC
========================= */
router.get("/me/timeline", verifyToken, (req, res) => {
  getEmployeeIdByUser(req.user.id)
    .then(employeeId => getTimeline(employeeId, res))
    .catch(() => res.json([]));
});

router.get("/:id/timeline", verifyToken, (req, res) => {
  const role = req.user.role?.toLowerCase();
  if (!["admin", "hr", "manager"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const employeeId = req.params.id;

  const accessCheck =
    role === "manager"
      ? getEmployeeIdByUser(req.user.id).then(managerEmpId =>
          db
            .query(
              "SELECT id FROM employees WHERE id = ? AND (manager_id = ? OR id = ?)",
              [employeeId, managerEmpId, managerEmpId]
            )
            .then(([rows]) => {
              if (!rows.length) throw new Error("Access denied");
            })
        )
      : Promise.resolve();

  accessCheck
    .then(() => getTimeline(employeeId, res))
    .catch(() => res.status(403).json({ message: "Access denied" }));
});

function getTimeline(employeeId, res) {
  const timeline = [];

  return db
    .query(
      "SELECT DATE_FORMAT(date_of_joining,'%Y-%m-%d') AS join_date FROM employees WHERE id = ?",
      [employeeId]
    )
    .then(([[emp]]) => {
      if(emp) {
        timeline.push({ label: "Joined LovasIT", date: emp.join_date });
      }

      return db.query(
        `SELECT old_designation, new_designation,
                DATE_FORMAT(changed_at,'%Y-%m-%d') AS date
         FROM employee_role_history
         WHERE employee_id = ?
         ORDER BY changed_at`,
        [employeeId]
      );
    })
    .then(([history]) => {
      history.forEach(h => {
        timeline.push({
          label: `Designation changed from ${h.old_designation} to ${h.new_designation}`,
          date: h.date
        });
      });
      res.json(timeline);
    })
    .catch(() => res.json([]));
}

module.exports = router;
