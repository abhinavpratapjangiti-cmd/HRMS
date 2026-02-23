const db = require('../db');
let io; // Holds the Socket.io instance

/* =====================================================
   1. INITIALIZE SOCKET (Called from server.js)
===================================================== */
function initSocket(socketInstance) {
  io = socketInstance;
  console.log("✅ Notification Service: Socket Initialized");
}

/* =====================================================
   2. INTERNAL HELPER: DB INSERT + SOCKET EMIT
===================================================== */
async function processNotification(userId, type, message) {
  try {
    // A. Save to Database
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, message, is_read, created_at)
       VALUES (?, ?, ?, 0, NOW())`,
      [userId, type, message]
    );

    // Prepare payload for frontend
    const notificationPayload = {
      id: result.insertId,
      user_id: userId,
      type,
      message,
      created_at: new Date(),
      is_read: 0
    };

    // B. Send Real-Time Alert (The "Pop")
    if (io) {
      // Emit to the specific user room
      io.to(String(userId)).emit('notification_pop', notificationPayload);
      // Debug log (optional, remove in production if noisy)
      // console.log(`📡 Emitted to User ${userId}: ${message}`);
    } else {
      console.warn("⚠️ Socket not initialized. Notification saved to DB but not popped.");
    }

    return result;

  } catch (error) {
    console.error(`❌ Notification Failed for User ${userId}:`, error.message);
    // We do NOT throw here, to prevent crashing the main request flow
    return null; 
  }
}

/* =====================================================
   3. EXPORTED FUNCTIONS (API)
===================================================== */

/**
 * Sends a single notification.
 * - In API Routes: Call without await for non-blocking speed.
 * - In Cron Jobs: Call with await to ensure completion.
 */
function sendNotification(userId, type, message) {
  return processNotification(userId, type, message);
}

/**
 * Sends notifications to both Employee and Manager.
 * Uses Promise.all to run them in parallel.
 */
function sendDualNotification(employeeId, managerId, empMsg, mgrMsg) {
  const promises = [];

  // 1. Notify Manager (if exists)
  if (managerId) {
    promises.push(processNotification(managerId, 'ATTENDANCE_ALERT', mgrMsg));
  }

  // 2. Notify Employee
  promises.push(processNotification(employeeId, 'ATTENDANCE_ALERT', empMsg));

  return Promise.all(promises);
}

module.exports = {
  initSocket,
  sendNotification,
  sendDualNotification
};
