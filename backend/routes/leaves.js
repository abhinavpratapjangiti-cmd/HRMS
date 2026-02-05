const express = require("express");
const router = express.Router();
const db = require("../db"); 
const { verifyToken } = require("../middleware/auth");

console.log("✅ LOADED LEAVES API");

// Helper: Get Employee ID
async function getEmployeeId(userId) {
    const [rows] = await db.query("SELECT id FROM employees WHERE user_id = ?", [userId]);
    if (!rows.length) throw new Error("EMPLOYEE_NOT_FOUND");
    return rows[0];
}

// 1. APPLY
router.post("/apply", verifyToken, async (req, res) => {
    try {
        const { from_date, to_date, leave_type, reason } = req.body;
        if (!from_date || !to_date || !leave_type) return res.status(400).json({ message: "Missing fields" });

        const emp = await getEmployeeId(req.user.id);

        const [overlap] = await db.query(
            `SELECT id FROM leaves WHERE employee_id = ? AND status != 'REJECTED' 
             AND ((from_date BETWEEN ? AND ?) OR (to_date BETWEEN ? AND ?)) LIMIT 1`,
            [emp.id, from_date, to_date, from_date, to_date]
        );

        if (overlap.length) return res.status(400).json({ message: "Dates overlap with existing leave" });

        await db.query(
            "INSERT INTO leaves (employee_id, from_date, to_date, leave_type, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())",
            [emp.id, from_date, to_date, leave_type, reason || ""]
        );

        res.json({ message: "Success" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Server Error" });
    }
});

// 2. HISTORY
router.get("/history", verifyToken, async (req, res) => {
    try {
        const emp = await getEmployeeId(req.user.id);
        const [rows] = await db.query(`
            SELECT 
                l.id, 
                l.leave_type AS type_code,
                lt.name AS type,
                DATE_FORMAT(l.from_date, '%Y-%m-%d') as 'from', 
                DATE_FORMAT(l.to_date, '%Y-%m-%d') as 'to', 
                DATEDIFF(l.to_date, l.from_date) + 1 as days, 
                l.status, 
                l.reason 
            FROM leaves l
            LEFT JOIN leave_types lt ON l.leave_type = lt.code
            WHERE l.employee_id = ? 
            ORDER BY l.created_at DESC LIMIT 50`, 
            [emp.id]
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Server Error" });
    }
});

// 3. CANCEL
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const emp = await getEmployeeId(req.user.id);
        await db.query("DELETE FROM leaves WHERE id = ? AND employee_id = ? AND status = 'PENDING'", [req.params.id, emp.id]);
        res.json({ message: "Deleted" });
    } catch (e) {
        res.status(500).json({ message: "Error" });
    }
});

module.exports = router;

