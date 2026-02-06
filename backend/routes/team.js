const express = require("express");
const router = express.Router();
const db = require("../db"); // Your database connection
const { verifyToken } = require("../middleware/auth");

router.get("/my", verifyToken, async (req, res) => {
  const userId = req.user.id;
  // Normalize role to lowercase to avoid case issues
  const role = String(req.user.role || "").toLowerCase();
  
  // Roles that can see the ENTIRE organization
  const SUPER_ROLES = new Set(["admin", "hr", "hr_admin", "director", "ceo"]);

  try {
    // 1. Get the employee ID for the currently logged-in user
    const [me] = await db.query(
      `SELECT id, manager_id FROM employees WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!me.length) {
        return res.status(404).json({ message: "Employee profile not found." });
    }

    const myEmpId = me[0].id;

    // 2. Define the columns we want for the chart
    // Note: We join users table to get online status
    const SELECT_COLS = `
        e.id, 
        e.name, 
        e.designation, 
        e.manager_id, 
        u.role,
        CASE 
            WHEN u.is_logged_in = 1 AND u.last_seen >= NOW() - INTERVAL 10 MINUTE THEN 1 
            ELSE 0 
        END AS online
    `;

    let rows = [];

    // 3. Fetch Data Logic
    if (SUPER_ROLES.has(role)) {
        // SCENARIO A: HR/Admin sees everyone
        [rows] = await db.query(`
            SELECT ${SELECT_COLS} 
            FROM employees e
            LEFT JOIN users u ON u.id = e.user_id 
            WHERE e.active = 1
            ORDER BY e.manager_id ASC
        `);
    } else {
        // SCENARIO B: Managers see themselves + subordinates (Recursive CTE)
        // This query walks down the tree starting from the current user
        const query = `
            WITH RECURSIVE team_tree AS (
                -- Anchor member: The current user
                SELECT id FROM employees WHERE id = ? AND active = 1
                
                UNION ALL
                
                -- Recursive member: People who report to the people in the tree
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

module.exports = router;
