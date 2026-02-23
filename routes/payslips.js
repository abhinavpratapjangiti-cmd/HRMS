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
  if (!fs.existsSync(filePath)) return "";
  const ext = path.extname(filePath).replace(".", "");
  const data = fs.readFileSync(filePath).toString("base64");
  return `data:image/${ext};base64,${data}`;
}

/* =========================
   GET EMPLOYEE BY USER ID
========================= */
async function getEmployee(userId) {
  const [rows] = await db.query(
    "SELECT * FROM employees WHERE user_id = ?",
    [userId]
  );
  return rows[0] || null;
}

/* =========================
   LIST PAYSLIP MONTHS
========================= */
router.get("/my/months", verifyToken, async (req, res) => {
  try {
    const emp = await getEmployee(req.user.id);
    if (!emp) return res.json([]);

    const [rows] = await db.query(
      "SELECT DISTINCT month FROM payroll WHERE employee_id=? ORDER BY month DESC",
      [emp.id]
    );

    res.json(rows.map(r => r.month));
  } catch (error) {
    console.error("Error in /my/months:", error);
    res.json([]);
  }
});

/* =========================
   GET PAYSLIP JSON (UI)
========================= */
router.get("/my/:month", verifyToken, async (req, res) => {
  const month = req.params.month;

  try {
    const emp = await getEmployee(req.user.id);
    if (!emp) return res.json({});

    const [rows] = await db.query(
      "SELECT * FROM payroll WHERE employee_id=? AND month=? LIMIT 1",
      [emp.id, month]
    );

    if (!rows.length) return res.json({});

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
  } catch (error) {
    console.error("Error in /my/:month:", error);
    res.json({});
  }
});

/* =========================
   PDF PAYSLIP
========================= */
router.get("/my/:month/pdf", verifyToken, async (req, res) => {
  const month = req.params.month;

  try {
    const emp = await getEmployee(req.user.id);
    if (!emp) return res.status(404).send("Employee not found");

    const [rows] = await db.query(
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
      [emp.id, month]
    );

    if (!rows.length) {
      return res.status(404).send("Payslip not found");
    }

    const p = rows[0];

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
    const templatePath = path.join(
      __dirname,
      "..",
      "templates",
      "payslip.html"
    );

    if (!fs.existsSync(templatePath)) {
      return res.status(500).send("Payslip template not found");
    }

    let html = fs.readFileSync(templatePath, "utf8");

    /* ===== LOAD BASE64 ASSETS ===== */
    const assetsDir = path.join(__dirname, "..", "templates", "assets");

    const logoBase64 = imageToBase64(path.join(assetsDir, "logo.png"));
    const signatureBase64 = imageToBase64(path.join(assetsDir, "signature.png"));
    const stampBase64 = imageToBase64(path.join(assetsDir, "stamp.png"));

    html = html
      .replace(/{{LOGO_BASE64}}/g, logoBase64)
      .replace(/{{SIGNATURE_BASE64}}/g, signatureBase64)
      .replace(/{{STAMP_BASE64}}/g, stampBase64)
      .replace(/{{MONTH}}/g, month)
      .replace(/{{EMP_NAME}}/g, p.emp_name || "-")
      .replace(/{{EMP_ID}}/g, p.emp_code || "-")
      .replace(/{{DEPARTMENT}}/g, p.department || "-")
      .replace(/{{DESIGNATION}}/g, p.designation || "-")
      .replace(/{{LOCATION}}/g, p.work_location || "-")
      .replace(/{{PAN}}/g, p.pan || "-")
      .replace(/{{UAN_NO}}/g, p.uan || "-")
      .replace(/{{PF_NO}}/g, p.pf_number || "-")
      .replace(/{{WORKING_DAYS}}/g, p.working_days || 0)
      .replace(/{{PAID_DAYS}}/g, p.paid_days || 0)
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
executablePath: '/usr/bin/google-chrome',
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
  } catch (error) {
    console.error("Error in PDF generation:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
