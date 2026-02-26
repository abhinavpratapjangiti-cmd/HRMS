const express = require("express");
const router = express.Router();
const db = require("../db"); // Your database connection
const { verifyToken } = require("../middleware/auth");

// EXISTING: Get full team or subtree based on role
router.get("/my", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const role = String(req.user.role || "").toLowerCase();
  const SUPER_ROLES = new Set(["admin", "hr", "hr_admin", "director", "ceo"]);

  try {
    const [me] = await db.query(
      `SELECT id, manager_id FROM employees WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!me.length) {
        return res.status(404).json({ message: "Employee profile not found." });
    }

    const myEmpId = me[0].id;

    // Common columns
    const SELECT_COLS = `
        e.id, e.name, e.designation, e.manager_id, u.role,
        CASE
            WHEN u.is_logged_in = 1 AND u.last_seen >= NOW() - INTERVAL 10 MINUTE THEN 1
            ELSE 0
        END AS online
    `;

    let rows = [];

    if (SUPER_ROLES.has(role)) {
        // HR/Admin sees everyone
        [rows] = await db.query(`
            SELECT ${SELECT_COLS}
            FROM employees e
            LEFT JOIN users u ON u.id = e.user_id
            WHERE e.active = 1
            ORDER BY e.manager_id ASC
        `);
    } else {
        // Managers see themselves + subordinates
        const query = `
            WITH RECURSIVE team_tree AS (
                SELECT id FROM employees WHERE id = ? AND active = 1
                UNION ALL
                SELECT e.id
                FROM employees e
                INNER JOIN team_tree t ON e.manager_id = t.id
                WHERE e.active = 1
            )
            SELECT ${SELECT_COLS}
            FROM employees e
            JOIN team_tree tt ON tt.id = e.id
            LEFT JOIN users u ON u.id = e.user_id
        `;
        [rows] = await db.query(query, [myEmpId]);
    }

    res.json(rows);

  } catch (err) {
    console.error("Team Route Error:", err);
    res.status(500).json({ message: "Server error loading team structure." });
  }
});

/* =====================================================
   NEW: GET HIERARCHY PATH (Bottom -> Up)
   Used when clicking "View Hierarchy" on a user
===================================================== */
router.get("/path/:id", verifyToken, async (req, res) => {
    try {
        const targetId = req.params.id;
        
        // Recursive query to go UP the chain (Child -> Manager -> CEO)
        const query = `
            WITH RECURSIVE ReportingChain AS (
                -- 1. Start with selected user
                SELECT e.id, e.name, e.designation, e.manager_id, u.role, 0 as level
                FROM employees e
                LEFT JOIN users u ON u.id = e.user_id
                WHERE e.id = ?
                
                UNION ALL
                
                -- 2. Find the manager
                SELECT e.id, e.name, e.designation, e.manager_id, u.role, rc.level + 1
                FROM employees e
                LEFT JOIN users u ON u.id = e.user_id
                INNER JOIN ReportingChain rc ON e.id = rc.manager_id
            )
            SELECT * FROM ReportingChain ORDER BY level ASC;
        `;

        const [rows] = await db.query(query, [targetId]);
        res.json(rows);

    } catch (err) {
        console.error("Hierarchy Path Error:", err);
        res.status(500).json({ message: "Failed to load hierarchy path." });
    }
});

router.get("/attendance/today", verifyToken, async (req, res) => {
  try {

    const userId = req.user.id;

    // Get logged-in employee id
    const [empRow] = await db.query(
      `SELECT id FROM employees WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!empRow.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const myEmpId = empRow[0].id;

    // Get team (manager + subordinates)
    const [rows] = await db.query(`
      WITH RECURSIVE team_tree AS (
        SELECT id FROM employees WHERE id = ?
        UNION ALL
        SELECT e.id
        FROM employees e
        INNER JOIN team_tree t ON e.manager_id = t.id
      )
      SELECT 
        e.id,
        e.name,
        al.clock_in,
        al.clock_out
      FROM employees e
      JOIN team_tree tt ON tt.id = e.id
      LEFT JOIN attendance_logs al 
        ON al.employee_id = e.id
        AND al.log_date = CURDATE()
    `, [myEmpId]);

    const result = rows.map(r => {
      let status = "Absent";

      if (r.clock_in && !r.clock_out) {
        status = "Working";
      } else if (r.clock_in && r.clock_out) {
        status = "Clocked Out";
      }

      return {
        name: r.name,
        status
      };
    });

    res.json(result);

  } catch (err) {
    console.error("Team Attendance Error:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
