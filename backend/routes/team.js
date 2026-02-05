const express = require("express");
const router = express.Router();
const db = require("../db"); 
const { verifyToken } = require("../middleware/auth");

router.get("/my", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const role = String(req.user.role || "").toLowerCase();
  const HR_ROLES = new Set(["hr", "hr_admin", "people_ops", "admin"]);

  try {
    const [empRows] = await db.query(
      `SELECT id, manager_id FROM employees WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!empRows.length) return res.status(404).json({ message: "Profile not found." });

    const empId = empRows[0].id;
    const managerId = empRows[0].manager_id;

    const SELECT_COLS = `
      e.id, e.name, e.designation, e.manager_id, u.role,
      CASE WHEN u.is_logged_in = 1 AND u.last_seen >= NOW() - INTERVAL 5 MINUTE THEN 1 ELSE 0 END AS online
    `;
    const BASE_JOINS = `FROM employees e JOIN users u ON u.id = e.user_id`;

    let rows = [];
    if (HR_ROLES.has(role)) {
      [rows] = await db.query(`SELECT ${SELECT_COLS} ${BASE_JOINS} WHERE e.active = 1`);
    } else if (role === "manager") {
      [rows] = await db.query(`
        WITH RECURSIVE team_tree AS (
          SELECT id FROM employees WHERE id = ? AND active = 1
          UNION ALL
          SELECT e.id FROM employees e INNER JOIN team_tree t ON e.manager_id = t.id WHERE e.active = 1
        )
        SELECT ${SELECT_COLS} ${BASE_JOINS} JOIN team_tree tt ON tt.id = e.id
      `, [empId]);
    } else {
      [rows] = await db.query(`SELECT ${SELECT_COLS} ${BASE_JOINS} WHERE e.active = 1 AND (e.id = ? OR e.id = ?)`, [empId, managerId]);
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error loading team data." });
  }
});

module.exports = router;
