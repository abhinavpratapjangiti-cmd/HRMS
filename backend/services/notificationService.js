async function createNotification(db, userId, type, message) {
  const [result] = await db.query(
    `
    INSERT INTO notifications (user_id, type, message)
    VALUES (?, ?, ?)
    `,
    [userId, type, message]
  );

  return {
    id: result.insertId,
    user_id: userId,
    type,
    message,
    created_at: new Date(),
    is_read: 0
  };
}
