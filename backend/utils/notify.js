const db = require("../db");

/**
 * Create notification
 */
async function notify(userId, type, message) {
  await db.query(
    `
    INSERT INTO notifications (user_id, type, message)
    VALUES (?, ?, ?)
    `,
    [userId, type, message]
  );
}

module.exports = { notify };
