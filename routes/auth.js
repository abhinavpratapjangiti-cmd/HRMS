const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const transporter = require("../utils/mailer");


/* =========================
   ENV GUARDS
========================= */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET is not defined");
}

const PASSWORD_HISTORY_LIMIT = 5;

/* =========================
   HELPERS
========================= */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const STRONG_PASSWORD =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

/* =====================================================
   SHARED PASSWORD UPDATE LOGIC (PROMISE-ONLY)
===================================================== */
function updatePasswordForUser(userId, newPassword, res) {
  if (!STRONG_PASSWORD.test(newPassword)) {
    return res.status(400).json({
      message:
        "Password must be 8+ chars with uppercase, lowercase, number & special character"
    });
  }

  db.query(
    `
    SELECT password_hash
    FROM user_password_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [userId, PASSWORD_HISTORY_LIMIT]
  )
    .then(([history]) => {
      let chain = Promise.resolve(false);

      history.forEach(h => {
        chain = chain.then(reused =>
          reused
            ? true
            : bcrypt.compare(newPassword, h.password_hash)
        );
      });

      return chain;
    })
    .then(reused => {
      if (reused) {
        throw new Error("PASSWORD_REUSED");
      }
      return bcrypt.hash(newPassword, 10);
    })
    .then(newHash =>
      db
        .query(
          `
          UPDATE users
          SET password = ?, token_version = IFNULL(token_version,0) + 1
          WHERE id = ?
          `,
          [newHash, userId]
        )
        .then(() =>
          db.query(
            `
            INSERT INTO user_password_history (user_id, password_hash)
            VALUES (?, ?)
            `,
            [userId, newHash]
          )
        )
        .then(() =>
          db.query(
            `
            DELETE FROM user_password_history
            WHERE user_id = ?
              AND id NOT IN (
                SELECT id FROM (
                  SELECT id
                  FROM user_password_history
                  WHERE user_id = ?
                  ORDER BY created_at DESC
                  LIMIT ?
                ) t
              )
            `,
            [userId, userId, PASSWORD_HISTORY_LIMIT]
          )
        )
    )
    .then(() =>
      res.json({
        message: "Password updated successfully. Please login again.",
        forceLogout: true
      })
    )
    .catch(err => {
      if (err.message === "PASSWORD_REUSED") {
        return res.status(400).json({
          message: `You cannot reuse your last ${PASSWORD_HISTORY_LIMIT} passwords`
        });
      }

      console.error("PASSWORD UPDATE ERROR:", err);
      res.status(500).json({ message: "Password update failed" });
    });
}

/* =========================
   LOGIN
========================= */
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.password,
      u.token_version,
      u.active,
      e.id AS employee_id
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE u.email = ?
    LIMIT 1
    `,
    [email]
  )
    .then(([rows]) => {
      if (!rows.length) throw new Error("INVALID");

      const user = rows[0];

      if (!user.active) {
        return res.status(403).json({ message: "Account inactive" });
      }

      if (!user.employee_id) {
        return res.status(500).json({
          message: "Employee record missing. Contact admin."
        });
      }

      return bcrypt.compare(password, user.password).then(ok => {
        if (!ok) throw new Error("INVALID");

        const token = jwt.sign(
          {
            id: user.id,
            email: user.email,
            role: user.role.toLowerCase(),
            employee_id: user.employee_id,
            token_version: user.token_version || 0
          },
          JWT_SECRET,
          { expiresIn: "1d" }
        );

        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.toLowerCase(),
            employee_id: user.employee_id
          }
        });
      });
    })
    .catch(err => {
      if (err.message === "INVALID") {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.error("LOGIN ERROR:", err);
      res.status(500).json({ message: "Login failed" });
    });
});

/* =========================
   CHANGE PASSWORD
========================= */
router.post("/change-password", verifyToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Missing fields" });
  }

  db.query("SELECT password FROM users WHERE id = ?", [userId])
    .then(([rows]) => {
      if (!rows.length) throw new Error("NOT_FOUND");

      return bcrypt
        .compare(currentPassword, rows[0].password)
        .then(match => {
          if (!match) throw new Error("INVALID");
          updatePasswordForUser(userId, newPassword, res);
        });
    })
    .catch(err => {
      if (err.message === "INVALID") {
        return res
          .status(401)
          .json({ message: "Current password is incorrect" });
      }

      res.status(400).json({ message: "User not found" });
    });
});

/* =========================
   FORGOT PASSWORD
========================= 
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  res.json({
    message: "If the email exists, a reset link has been sent."
  });

  if (!email) return;

  db.query(
    "SELECT id FROM users WHERE email = ? AND active = 1 LIMIT 1",
    [email]
  )
    .then(([rows]) => {
      if (!rows.length) return;

      const userId = rows[0].id;

      return db
        .query("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId])
        .then(() => {
          const rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = hashToken(rawToken);

          return db
            .query(
              `
              INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
              VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
              `,
              [userId, tokenHash]
            )
            .then(() => {
              const resetLink =
                `${process.env.APP_URL}/pages/reset-password.html?token=${rawToken}`;

              return transporter.sendMail({
                from: `"LovasIT HRMS" <${process.env.ZOHO_EMAIL}>`,
                to: email,
                subject: "Reset your HRMS password",
                html: `
                  <p>Hello,</p>
                  <p>Click the link below to reset your password:</p>
                  <p><a href="${resetLink}">${resetLink}</a></p>
                  <p>This link expires in 15 minutes.</p>
                `
              });
            });
        });
    })
    .catch(err => {
      console.error("FORGOT PASSWORD ERROR:", err);
    });
});

 =========================
   RESET PASSWORD
=============================

router.post("/reset-password", (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const tokenHash = hashToken(token);

  db.query(
    `
    SELECT t.user_id
    FROM password_reset_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
      AND t.expires_at > NOW()
      AND u.active = 1
    LIMIT 1
    `,
    [tokenHash]
  )
    .then(([rows]) => {
      if (!rows.length) {
        return res
          .status(400)
          .json({ message: "Invalid or expired reset token" });
      }

      updatePasswordForUser(rows[0].user_id, newPassword, res);
    })
    .catch(err => {
      console.error("RESET PASSWORD ERROR:", err);
      res.status(500).json({ message: "Password reset failed" });
    });
});
=============================================================================== //

/* =====================================================
   1️⃣ CHECK STATUS / CREATE REQUEST
   (User Polling & Request Initiation)
===================================================== */
router.post("/check-reset-status", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "EMAIL REQUIRED" });
    }

    // 1️⃣ Verify user exists and is active
    const [users] = await db.query(
      "SELECT id FROM users WHERE email = ? AND active = 1 LIMIT 1",
      [email]
    );

    if (!users.length) {
      return res.status(404).json({ message: "EMAIL NOT FOUND" });
    }

    const userId = users[0].id;

    // 2️⃣ Get latest request (any status)
    const [latest] = await db.query(
      `SELECT id, status
       FROM password_reset_requests
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [userId]
    );

    if (latest.length) {
      const status = latest[0].status;

      // If already approved → allow frontend to move to step 2
      if (status === "APPROVED") {
        return res.json({ status: "APPROVED" });
      }

      // If waiting
      if (status === "PENDING") {
        return res.json({ status: "PENDING" });
      }

      // If rejected
      if (status === "REJECTED") {
        return res.json({ status: "REJECTED" });
      }
    }

    // 3️⃣ No active request → create new PENDING
    const [insertResult] = await db.query(
      "INSERT INTO password_reset_requests (user_id, status) VALUES (?, 'PENDING')",
      [userId]
    );

    const requestId = insertResult.insertId;
    console.log(`✅ Reset Request Created! ID: ${requestId} for ${email}`);

    // 4️⃣ Notify ALL Admin + HR
    try {
      // Find admins and HR users
      const [admins] = await db.query(
        "SELECT id, email FROM users WHERE LOWER(role) IN ('admin', 'hr')"
      );

      console.log(`📣 Found ${admins.length} admins to notify.`);

      if (admins.length === 0) {
        console.warn("⚠️ WARNING: No users with 'admin' or 'hr' roles found in DB!");
      }

      for (let admin of admins) {
        try {
          await db.query(
            `INSERT INTO notifications (user_id, type, message, is_read, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
              admin.id,
              'password_request',
              `🔔 Password Reset Requested by: ${email} (Request ID: ${requestId})`,
              0
            ]
          );
          console.log(`✅ Notification stored for Admin ID: ${admin.id}`);
        } catch (notifErr) {
          console.error(`❌ FAILED to insert notification for Admin ${admin.id}:`, notifErr.message);
        }
      }
    } catch (adminQueryErr) {
      console.error("❌ FAILED to query admins:", adminQueryErr.message);
    }

    return res.json({ status: "REQUEST_SENT" });

  } catch (err) {
    console.error("CHECK STATUS ERROR:", err);
    return res.status(500).json({ message: "SERVER ERROR" });
  }
});

/* =====================================================
   2️⃣ ADMIN APPROVE / REJECT REQUEST
   (Admin action from Notification Bell)
===================================================== */
router.post("/admin/resolve-reset", async (req, res) => {
  try {
    const { request_id, action, admin_id } = req.body;

    // Action must strictly match your ENUM
    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ message: "INVALID ACTION" });
    }

    // Update the request status and log the admin who responded
    const [updateResult] = await db.query(
      `UPDATE password_reset_requests
       SET status = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'PENDING'`,
      [action, admin_id, request_id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(400).json({ message: "REQUEST ALREADY PROCESSED OR NOT FOUND" });
    }

    // Mark the specific notification as read so it clears from the bell icon
    await db.query(
      "UPDATE notifications SET is_read = 1 WHERE message LIKE ?",
      [`%Request ID: ${request_id}%`]
    );

    return res.json({ message: `REQUEST ${action} SUCCESSFULLY` });

  } catch (err) {
    console.error("ADMIN RESOLVE ERROR:", err);
    return res.status(500).json({ message: "SERVER ERROR" });
  }
});

/* =====================================================
   3️⃣ FINAL PASSWORD RESET (ONLY IF APPROVED)
   - Atomic approval consumption
   - Marks COMPLETED safely
===================================================== */
router.post("/reset-password-approved", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ message: "MISSING FIELDS" });
    }

    // 1️⃣ Find latest APPROVED request
    const [rows] = await db.query(
      `SELECT r.id AS request_id, u.id AS user_id
       FROM password_reset_requests r
       JOIN users u ON r.user_id = u.id
       WHERE u.email = ?
       AND r.status = 'APPROVED'
       ORDER BY r.id DESC
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(403).json({
        message: "PERMISSION DENIED OR NOT APPROVED YET"
      });
    }

    const { request_id, user_id } = rows[0];

    // 2️⃣ Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 3️⃣ Use transaction for safety
    await db.query("START TRANSACTION");

    // Update user password
    await db.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, user_id]
    );

    // Mark request as COMPLETED (atomic lock)
    const [updateResult] = await db.query(
      `UPDATE password_reset_requests
       SET status = 'COMPLETED'
       WHERE id = ? AND status = 'APPROVED'`,
      [request_id]
    );

    if (updateResult.affectedRows === 0) {
      await db.query("ROLLBACK");
      return res.status(400).json({ message: "REQUEST ALREADY USED" });
    }

    await db.query("COMMIT");

    return res.json({ message: "PASSWORD UPDATED SUCCESSFULLY" });

  } catch (err) {
    await db.query("ROLLBACK");
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ message: "SERVER ERROR" });
  }
});

/* =========================
   LOGOUT ALL DEVICES
========================= */
router.post("/logout-all", verifyToken, (req, res) => {
  db.query(
    `
    UPDATE users
    SET token_version = IFNULL(token_version,0) + 1
    WHERE id = ?
    `,
    [req.user.id]
  )
    .then(() =>
      res.json({
        message: "Logged out from all devices successfully"
      })
    )
    .catch(() =>
      res
        .status(500)
        .json({ message: "Unable to logout from all devices" })
    );
});

/* =========================
   LOGOUT
========================= */
router.post("/logout", (req, res) => {
  // Since we use JWT, we just tell the frontend it's successful
  res.json({ success: true, message: "Logged out successfully" });
});

module.exports = router;
