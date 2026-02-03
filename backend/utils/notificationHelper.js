async function sendNotification(db, pushNotification, userId, message) {
  try {
    const [result] = await db.query(
      "INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, 0)",
      [userId, message]
    );

    pushNotification(userId, {
      type: "NOTIFICATION",
      id: result.insertId,
      message,
      is_read: 0,
      created_at: new Date()
    });
  } catch (err) {
    console.error("Notification insert failed", err);
  }
}

module.exports = { sendNotification };
