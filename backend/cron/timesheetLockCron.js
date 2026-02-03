const cron = require("node-cron");
const db = require("../db"); // correct path

/* =====================================================
   ENV GUARD (TOP MEANS HERE 👇)
===================================================== */
if (process.env.NODE_ENV !== "production") {
  console.log("⏸️ Timesheet lock cron disabled (non-production)");
  return;
}

/* =====================================================
   AUTO-LOCK ON LAST WORKING DAY
===================================================== */

cron.schedule("59 23 * * *", async () => {
  try {
    const today = new Date();
    const month = today.toISOString().slice(0, 7);

    const [[{ shouldLock }]] = await db.query(
      `
      SELECT
        CURDATE() = (
          SELECT MAX(d)
          FROM (
            SELECT DATE(CONCAT(?, '-01')) + INTERVAL seq DAY AS d
            FROM (
              SELECT 0 seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION
              SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION
              SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION
              SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION SELECT 15 UNION
              SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19 UNION
              SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION
              SELECT 24 UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION
              SELECT 28 UNION SELECT 29 UNION SELECT 30
            ) seqs
            WHERE DAYOFWEEK(
              DATE(CONCAT(?, '-01')) + INTERVAL seq DAY
            ) NOT IN (1,7)
          ) working_days
        ) AS shouldLock
      `,
      [month, month]
    );

    if (!shouldLock) return;

    await db.query(
      `
      INSERT INTO timesheet_locks (month, is_locked, locked_at, locked_by)
      VALUES (?, 1, NOW(), 'SYSTEM')
      ON DUPLICATE KEY UPDATE
        is_locked = 1,
        locked_at = NOW(),
        locked_by = 'SYSTEM'
      `,
      [month]
    );

    console.log(`🔒 Timesheet locked for ${month}`);
  } catch (err) {
    console.error("❌ Timesheet lock cron failed:", err.message);
  }
});

