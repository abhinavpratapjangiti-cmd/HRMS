const nodemailer = require("nodemailer");

/*
  Zoho SMTP configuration
  IMPORTANT:
  - Use Zoho APP PASSWORD (not mailbox password)
  - Enable SMTP in Zoho Admin
*/

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.ZOHO_EMAIL,        // hr@yourcompany.com
    pass: process.env.ZOHO_APP_PASSWORD  // Zoho App Password
  }
});

/**
 * Send email (Forgot Password, Notifications, etc.)
 */
function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"LovasIT HRMS" <${process.env.ZOHO_EMAIL}>`,
    to,
    subject,
    html
  });
}

module.exports = { sendMail };
