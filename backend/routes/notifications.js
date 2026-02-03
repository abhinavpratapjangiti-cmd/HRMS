console.log("🔥 LOADING NOTIFICATIONS ROUTE FROM:", __filename);
const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   🔔 GET UNREAD NOTIFICATIONS
========================= */
router.get("/", verifyToken, (req, res) => {
  db.query(
  `
  SELECT id, type, message, created_at
  FROM notifications
  WHERE user_id = ?
    AND (is_read = 0 OR is_read IS NULL)
  ORDER BY created_at DESC
  LIMIT 20
  `,
  [req.user.id]
)
  .then(([rows]) => {
      res.json({ notifications: rows });
    })
    .catch(err => {
      console.error("❌ Notifications error:", err);
      res.status(500).json({ notifications: [] });
    });
});

/* =========================
   📥 UNREAD COUNT
========================= */
router.get("/inbox/count", verifyToken, (req, res) => {
  db.query(
    `
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE user_id = ?
      AND (is_read = 0 OR is_read IS NULL)
    `,
    [req.user.id]
  )
    .then(([[row]]) => {
      res.json({ count: row.count });
    })
    .catch(err => {
      console.error("❌ Inbox count error:", err);
      res.json({ count: 0 });
    });
});

/* =========================
   ✅ MARK ALL AS READ
========================= */
router.put("/read-all", verifyToken, (req, res) => {
  db.query(
    `
    UPDATE notifications
    SET is_read = 1,
        read_at = NOW()
    WHERE user_id = ?
      AND (is_read = 0 OR is_read IS NULL)
    `,
    [req.user.id]
  )
    .then(() => {
      res.json({ success: true });
    })
    .catch(err => {
      console.error("❌ Read-all error:", err);
      res.status(500).json({ success: false });
    });
});

/* =========================
   ✅ MARK SINGLE AS READ
========================= */
router.put("/:id/read", verifyToken, (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id))) {
    return res.status(400).json({ success: false });
  }

  db.query(
    `
    UPDATE notifications
    SET is_read = 1,
        read_at = NOW()
    WHERE id = ?
      AND user_id = ?
    `,
    [id, req.user.id]
  )
    .then(() => {
      res.json({ success: true });
    })
    .catch(err => {
      console.error("❌ Mark-read error:", err);
      res.status(500).json({ success: false });
    });
});

module.exports = router;
