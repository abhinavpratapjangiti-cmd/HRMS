const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   HELPER: Get All Valid User Identifiers
===================================================== */
function getUserIds(user) {
  const ids = [];
  if (user?.id) ids.push(Number(user.id));
  // Inclusion of employee_id if your system uses it for notifications
  if (user?.employee_id) ids.push(Number(user.employee_id));
  return [...new Set(ids)].filter(Boolean);
}

function buildInClause(ids) {
  return ids.map(() => "?").join(",");
}

/* =====================================================
   1. GET NOTIFICATIONS (Inbox)
   Matches frontend: fetch(`${API_BASE}/api/notifications`)
===================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const ids = getUserIds(req.user);
    if (!ids.length) return res.json([]);

    const placeholders = buildInClause(ids);

    const [rows] = await db.query(
      `
      SELECT id, type, message, created_at, is_read
      FROM notifications
   WHERE user_id IN (${placeholders}) AND is_read = 0
      ORDER BY created_at DESC
      LIMIT 50
      `,
      ids
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Notifications Fetch Error:", err);
    res.status(500).json([]);
  }
});

/* =====================================================
   2. MARK ALL AS READ
   Matches frontend: fetch(`${API_BASE}/api/notifications/mark-all-read`)
===================================================== */
router.put("/mark-all-read", verifyToken, async (req, res) => {
  try {
    const ids = getUserIds(req.user);
    if (!ids.length) return res.json({ success: true });

    const placeholders = buildInClause(ids);

    await db.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id IN (${placeholders}) AND is_read = 0
      `,
      ids
    );

    res.json({ success: true, message: "All marked as read" });
  } catch (err) {
    console.error("❌ Mark All Read Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   3. GET UNREAD COUNT
   Useful for the Bell Icon badge
===================================================== */
router.get("/count", verifyToken, async (req, res) => {
  try {
    const ids = getUserIds(req.user);
    if (!ids.length) return res.json({ count: 0 });

    const placeholders = buildInClause(ids);

    const [rows] = await db.query(
      `
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id IN (${placeholders}) AND is_read = 0
      `,
      ids
    );

    res.json({ count: rows[0]?.count || 0 });
  } catch (err) {
    console.error("❌ Inbox Count Error:", err);
    res.json({ count: 0 });
  }
});

/* =====================================================
   4. MARK SINGLE AS READ
===================================================== */
router.put("/:id/read", verifyToken, async (req, res) => {
  try {
    const ids = getUserIds(req.user);
    const notificationId = Number(req.params.id);

    if (!ids.length || !notificationId)
      return res.json({ success: false });

    const placeholders = buildInClause(ids);

    await db.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND user_id IN (${placeholders})
      `,
      [notificationId, ...ids]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Mark Single Read Error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;

