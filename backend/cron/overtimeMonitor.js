const cron = require('node-cron');
const db = require('../db');
const { sendNotification } = require('../services/notificationService');
const dayjs = require('dayjs');

/**
 * Runs every hour at minute 0 (IST)
 */
cron.schedule(
  '0 * * * *',
  async () => {
    console.log('⏰ CRON: Checking for extended shifts (>12 hours)...');

    try {
      // 12 hours ago
      const twelveHoursAgo = dayjs()
        .subtract(12, 'hour')
        .format('YYYY-MM-DD HH:mm:ss');

      // 1️⃣ Find open sessions beyond 12 hours
      const [sessions] = await db.query(
        `
        SELECT 
          a.id,
          a.employee_id,
          a.clock_in,
          e.name,
          e.manager_id
        FROM attendance_logs a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.clock_out IS NULL
          AND a.clock_in < ?
          AND (a.alert_level IS NULL OR a.alert_level = 0)
        `,
        [twelveHoursAgo]
      );

      if (!sessions.length) {
        console.log('✅ No overtime sessions found');
        return;
      }

      // 2️⃣ Fetch Admin & HR users
      const [admins] = await db.query(
        `SELECT id FROM users WHERE role IN ('admin', 'hr')`
      );
      const adminIds = admins.map(a => a.id);

      // 3️⃣ Send notifications
      for (const s of sessions) {
        const hours = Math.floor(
          dayjs().diff(dayjs(s.clock_in), 'hour', true)
        );

        const msg = `⚠️ URGENT: ${s.name} has been clocked in for ${hours}+ hours. Please verify immediately.`;

        // A. Employee
        await sendNotification(
          s.employee_id,
          'OVERTIME_ALERT',
          '⚠️ You have been clocked in for over 12 hours. Please clock out if your shift is complete.'
        );

        // B. Manager
        if (s.manager_id) {
          await sendNotification(s.manager_id, 'OVERTIME_ALERT', msg);
        }

        // C. HR / Admin
        for (const adminId of adminIds) {
          await sendNotification(adminId, 'OVERTIME_ALERT', msg);
        }

        // 4️⃣ Mark as alerted
        await db.query(
          `UPDATE attendance_logs SET alert_level = 1 WHERE id = ?`,
          [s.id]
        );
      }
    } catch (err) {
      console.error('❌ Overtime Cron Error:', err);
    }
  },
  {
    timezone: 'Asia/Kolkata'
  }
);

// Just importing this file starts the cron
module.exports = {};
