const express = require("express");
const router = express.Router();
const db = require("../db");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");
const { verifyToken } = require("../middleware/auth");

const money = v => Number(v || 0).toFixed(2);

/* =========================
   IMAGE → BASE64 HELPER
========================= */
function imageToBase64(filePath) {
  const ext = path.extname(filePath).replace(".", "");
  const data = fs.readFileSync(filePath).toString("base64");
  return `data:image/${ext};base64,${data}`;
}

/* =========================
   GET EMPLOYEE BY USER ID
========================= */
function getEmployee(userId) {
  return new Promise((resolve, reject) => {
    db.query(
      "SELECT * FROM employees WHERE user_id = ?",
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows[0] || null);
      }
    );
  });
}

/* =========================
   LIST PAYSLIP MONTHS
   GET /api/payslips/my/months
========================= */
router.get("/my/months", verifyToken, async (req, res) => {
  try {
    const emp = await getEmployee(req.user.id);
    if (!emp) return res.json([]);

    db.query(
      "SELECT DISTINCT month FROM payroll WHERE employee_id=? ORDER BY month DESC",
      [emp.id],
      (err, rows) => {
        if (err) return res.json([]);
        res.json(rows.map(r => r.month));
      }
    );
  } catch {
    res.json([]);
  }
});

/* =========================
   GET PAYSLIP JSON (UI)
   GET /api/payslips/my/:month
========================= */
router.get("/my/:month", verifyToken, async (req, res) => {
  const month = req.params.month;

  try {
    const emp = await getEmployee(req.user.id);
    if (!emp) return res.json({});

    db.query(
      "SELECT * FROM payroll WHERE employee_id=? AND month=? LIMIT 1",
      [emp.id, month],
      (err, rows) => {
        if (err || !rows.length) return res.json({});

        const p = rows[0];

        const deductions =
          Number(p.pf || 0) +
          Number(p.pt || 0) +
          Number(p.other_deductions || 0);

        const earnings =
          Number(p.basic || 0) +
          Number(p.hra || 0) +
          Number(p.da || 0) +
          Number(p.lta || 0) +
          Number(p.special_allowance || 0);

        res.json({
          ...p,
          deductions,
          net_pay: earnings - deductions
        });
      }
    );
  } catch {
    res.json({});
  }
});

/* =========================
   PDF PAYSLIP
   GET /api/payslips/my/:month/pdf
========================= */
router.get("/my/:month/pdf", verifyToken, async (req, res) => {
  const month = req.params.month;

  const emp = await getEmployee(req.user.id);
  if (!emp) return res.status(404).send("Employee not found");

  db.query(
    `
    SELECT
      p.*,
      e.name AS emp_name,
      e.department,
      e.designation,
      e.work_location,
      e.pan,
      e.emp_code,
      e.uan,
      e.pf_number
    FROM payroll p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.employee_id = ?
      AND p.month = ?
    LIMIT 1
    `,
    [emp.id, month],
    async (err, rows) => {
      if (err || !rows.length) {
        return res.status(404).send("Payslip not found");
      }

      const p = rows[0];

      /* ===== CALCULATIONS ===== */
      const earnings =
        Number(p.basic || 0) +
        Number(p.hra || 0) +
        Number(p.da || 0) +
        Number(p.lta || 0) +
        Number(p.special_allowance || 0);

      const deductions =
        Number(p.pf || 0) +
        Number(p.pt || 0) +
        Number(p.other_deductions || 0);

      const netPay = earnings - deductions;

      /* ===== LOAD TEMPLATE ===== */
      const templatePath = path.join(__dirname, "..", "templates", "payslip.html");
      let html = fs.readFileSync(templatePath, "utf8");

      /* ===== LOAD BASE64 ASSETS ===== */
      const assetsDir = path.join(__dirname, "..", "templates", "assets");

      const logoBase64 = imageToBase64(path.join(assetsDir, "logo.png"));
      const signatureBase64 = imageToBase64(path.join(assetsDir, "signature.png"));
      const stampBase64 = imageToBase64(path.join(assetsDir, "stamp.png"));

      /* ===== REPLACE VARIABLES ===== */
      html = html
        .replace(/{{LOGO_BASE64}}/g, logoBase64)
        .replace(/{{SIGNATURE_BASE64}}/g, signatureBase64)
        .replace(/{{STAMP_BASE64}}/g, stampBase64)
        .replace(/{{MONTH}}/g, month)
        .replace(/{{EMP_NAME}}/g, p.emp_name)
        .replace(/{{EMP_ID}}/g, p.emp_code || "-")
        .replace(/{{DEPARTMENT}}/g, p.department || "-")
        .replace(/{{DESIGNATION}}/g, p.designation || "-")
        .replace(/{{LOCATION}}/g, p.work_location || "-")
        .replace(/{{PAN}}/g, p.pan || "-")
        .replace(/{{UAN_NO}}/g, p.uan || "-")
        .replace(/{{PF_NO}}/g, p.pf_number || "-")
        .replace(/{{WORKING_DAYS}}/g, p.working_days)
        .replace(/{{PAID_DAYS}}/g, p.paid_days)
        .replace(/{{BASIC}}/g, money(p.basic))
        .replace(/{{HRA}}/g, money(p.hra))
        .replace(/{{SPECIAL}}/g, money(p.special_allowance))
        .replace(/{{PF_AMOUNT}}/g, money(p.pf))
        .replace(/{{PT_AMOUNT}}/g, money(p.pt))
        .replace(/{{OTHER_DEDUCTIONS}}/g, money(p.other_deductions))
        .replace(/{{TOTAL_EARNINGS}}/g, money(earnings))
        .replace(/{{TOTAL_DEDUCTIONS}}/g, money(deductions))
        .replace(/{{NET_PAY}}/g, money(netPay));

      /* ===== PDF GENERATION ===== */
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true
      });

      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Payslip-${month}.pdf"`
      );
      res.end(pdf);
    }
  );
});

module.exports = router;
