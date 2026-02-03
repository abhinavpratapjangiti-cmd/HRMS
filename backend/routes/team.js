const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/**
 * GET /api/team/my
 *
 * ROLE BEHAVIOR:
 * - Admin / HR  → Full organization
 * - Manager     → Self + all direct & indirect reports
 * - Employee    → Self + direct manager (if exists)
 *
 * REAL-TIME PRESENCE:
 * - online     → last_seen within last 5 minutes AND is_logged_in = 1
 * - last_seen  → users.last_seen
 */

router.get("/my", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const role = String(req.user.role || "").toLowerCase();

  const HR_ROLES = new Set(["hr", "hr_admin", "people_ops"]);

  try {
    /* =========================
       EMPLOYEE CONTEXT
    ========================= */
    const [empRows] = await db.promise().query(
      `SELECT id, manager_id FROM employees WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!empRows.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const empId = empRows[0].id;
    const managerId = empRows[0].manager_id;

    /* =========================
       BASE SELECT (REAL-TIME)
    ========================= */
    const BASE_SELECT = `
      SELECT
        e.id,
        e.name,
        e.email,
        u.role,
        e.department,
        e.client_name,
        e.work_location,
        e.active,
        e.manager_id,
        m.name AS manager_name,

        -- REAL-TIME PRESENCE (SCHEMA ALIGNED)
        u.last_seen AS last_seen,
        CASE
          WHEN u.is_logged_in = 1
           AND u.last_seen IS NOT NULL
           AND u.last_seen >= NOW() - INTERVAL 5 MINUTE
          THEN 1 ELSE 0
        END AS online

      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN employees m ON m.id = e.manager_id
    `;

    /* =========================
       ADMIN / HR → FULL ORG
    ========================= */
    if (role === "admin" || HR_ROLES.has(role)) {
      const [rows] = await db.promise().query(`
        ${BASE_SELECT}
        WHERE e.active = 1
        ORDER BY
          CASE u.role
            WHEN 'hr' THEN 1
            WHEN 'manager' THEN 2
            WHEN 'employee' THEN 3
            ELSE 4
          END,
          e.name
      `);

      return res.json(rows);
    }

    /* =========================
       MANAGER → FULL SUBTREE
    ========================= */
    if (role === "manager") {
      const [rows] = await db.promise().query(
        `
        WITH RECURSIVE team_tree AS (
          SELECT id, manager_id
          FROM employees
          WHERE id = ? AND active = 1

          UNION ALL

          SELECT e.id, e.manager_id
          FROM employees e
          JOIN team_tree t ON e.manager_id = t.id
          WHERE e.active = 1
        )
        ${BASE_SELECT}
        JOIN team_tree tt ON tt.id = e.id
        ORDER BY
          CASE u.role
            WHEN 'manager' THEN 1
            WHEN 'employee' THEN 2
            ELSE 3
          END,
          e.name
        `,
        [empId]
      );

      return res.json(rows);
    }

    /* =========================
       EMPLOYEE → SELF + MANAGER
    ========================= */
    const [rows] = await db.promise().query(
      `
      ${BASE_SELECT}
      WHERE e.active = 1
        AND (
          e.id = ?
          OR ( ? IS NOT NULL AND e.id = ? )
        )
      ORDER BY
        CASE u.role
          WHEN 'manager' THEN 1
          ELSE 2
        END,
        e.name
      `,
      [empId, managerId, managerId]
    );

    return res.json(rows);

  } catch (err) {
    console.error("My Team API error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
