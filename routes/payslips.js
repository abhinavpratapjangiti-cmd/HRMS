const express = require("express");
const router = express.Router();
const db = require("../db");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");
const { verifyToken } = require("../middleware/auth");

const money = v => Number(v || 0).toFixed(2);

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
      Number(p.special_allowance || 0) +
Number(p.other_allowance || 0);

    res.json({
      month: p.month,
      basic: money(p.basic),
      hra: money(p.hra),
      deductions: money(deductions),
      net_pay: money(earnings - deductions)
    });
  } catch (error) {
    console.error("Error in /my/:month:", error);
    res.json({});
  }
});

/* =========================
   PDF PAYSLIP (PUPPETEER)
========================= */
router.get("/my/:month/pdf", verifyToken, async (req, res) => {
  const month = req.params.month;

  const [year, monthNum] = month.split("-");
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0);

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
        e.emp_code
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
// Worked days
const [workedRows] = await db.query(
  `SELECT COUNT(DISTINCT work_date) AS worked_days
   FROM timesheets
   WHERE employee_id = ?
   AND status = 'APPROVED'
   AND work_date BETWEEN ? AND ?`,
  [emp.id, startDate, endDate]
);

const workedDays = workedRows[0].worked_days || 0;


// Leave days (Approved only)
const [leaveRows] = await db.query(
  `SELECT SUM(
      DATEDIFF(
        LEAST(to_date, ?),
        GREATEST(from_date, ?)
      ) + 1
    ) AS leave_days
   FROM leaves
   WHERE employee_id = ?
   AND status = 'Approved'
   AND from_date <= ?
   AND to_date >= ?`,
  [endDate, startDate, emp.id, endDate, startDate]
);

const leaveDays = leaveRows[0].leave_days || 0;
    /* =========================
       SALARY CALCULATION
    ========================== */

    const earnings =
      Number(p.basic || 0) +
      Number(p.hra || 0) +
      Number(p.da || 0) +
      Number(p.lta || 0) +
      Number(p.special_allowance || 0) +
      Number(p.other_allowance || 0);

    const deductions =
      Number(p.pf || 0) +
      Number(p.pt || 0) +
      Number(p.other_deductions || 0);

    const netPay = earnings - deductions;

    /* ===== BULLETPROOF LOGO LOADER ===== */
    const absoluteLogoPath = path.join(__dirname, "..", "templates", "assets", "lovas-logo.png");

    let logoUrl = "";
    try {
      if (fs.existsSync(absoluteLogoPath)) {
        const base64Data = fs.readFileSync(absoluteLogoPath).toString("base64");
        logoUrl = `data:image/png;base64,${base64Data}`;
        console.log("✅ LOGO SUCCESS! Loaded from:", absoluteLogoPath);
      } else {
        console.error("❌ LOGO FAILED! Could not find file at:", absoluteLogoPath);
        // Fallback transparent pixel
        logoUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      }
    } catch (err) {
      console.error("❌ ERROR READING LOGO:", err.message);
    }

    /* ===== INLINE HTML TEMPLATE ===== */
    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; margin: 0; padding: 20px; }
            .payslip-container { max-width: 800px; margin: 0 auto; padding: 40px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
            .company-address { text-align: right; font-size: 11px; line-height: 1.5; }
            .payslip-title { text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; vertical-align: top; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .summary-section { width: 50%; margin-left: 10%; margin-top: 20px; font-size: 12px; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .summary-total { font-weight: bold; margin-top: 10px; padding-top: 5px; display: flex; justify-content: space-between; }
            .total-box { border: 1px solid #000; padding: 4px 15px; min-width: 100px; text-align: right; }
            .footer-note { margin-top: 40px; font-size: 13px; font-weight: bold; text-align: center; }
        </style>
    </head>
    <body>
    <div class="payslip-container">
        <div class="header">
            <img src="${logoUrl}" width="110" height="110" style="width: 110px !important; max-width: 110px !important; height: 110px !important; border-radius: 50%; object-fit: contain; display: block;" alt="" />
            <div class="company-address">
                85/A, Near Bhashyam School, Pithapuram,<br>
                Kakinada District, Andhra Pradesh, 533450.<br>
                Website: https://www.lovasit.com/
            </div>
        </div>
        <div class="payslip-title">Payslip for the Month of ${month}</div>
        <table>
            <tr>
                <td colspan="2" class="text-center font-bold" style="padding: 10px;">
                    ${p.emp_name || "-"}<br><span style="font-weight: normal;">${p.designation || "-"}</span>
                </td>
            </tr>
            <tr>
                <td style="width: 50%; line-height: 1.6;">
                    Emp ID: ${p.emp_code || "-"}<br>
                    Department: ${p.department || "-"}<br>
                    No. of Working Days: ${workedDays}<br>
                    Absent days: ${leaveDays}
                </td>
                <td style="width: 50%; line-height: 1.6;">
                    PAN: ${p.pan || "-"}<br>
                    Location: ${p.work_location || "-"}<br>
                    No. of Paid Days: ${p.paid_days || "0"}
                </td>
            </tr>
        </table>
        <table>
            <thead>
                <tr>
                    <th class="text-center font-bold" style="width: 35%;">COMPENSATION</th>
                    <th class="text-center font-bold" style="width: 15%;">Amount in Rupees</th>
                    <th class="text-center font-bold" style="width: 35%;">DEDUCTIONS</th>
                    <th class="text-center font-bold" style="width: 15%;">Amount in Rupees</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Basic Salary</td><td class="text-right">${money(p.basic)}</td>
                    <td>Provident fund</td><td class="text-right">${money(p.pf)}</td>
                </tr>
                <tr>
                    <td>House Rent Allowance</td><td class="text-right">${money(p.hra)}</td>
                    <td>Professional Tax</td><td class="text-right">${money(p.pt)}</td>
                </tr>
                <tr>
                    <td>Dearness Allowance</td><td class="text-right">${money(p.da)}</td>
                    <td>Other Deductions</td><td class="text-right">${money(p.other_deductions)}</td>
                </tr>
                <tr>
                    <td>Leave Travel Allowance</td><td class="text-right">${money(p.lta)}</td>
                    <td></td><td></td>
                </tr>
                <tr>
                    <td>Special Allowance</td><td class="text-right">${money(p.special_allowance)}</td>
                    <td></td><td></td>
                </tr>
                <tr>
                    <td>Other Allowances</td><td class="text-right">${money(p.other_allowance)}</td>
                    <td></td><td></td>
                </tr>
                <tr>
                    <td class="font-bold">Total Earnings</td><td class="text-right font-bold">${money(earnings)}</td>
                    <td class="font-bold">Total Deductions</td><td class="text-right font-bold">${money(deductions)}</td>
                </tr>
            </tbody>
        </table>
        <div class="summary-section">
            <div class="summary-row"><span>Total Amount</span><span>${money(earnings)}</span></div>
            <div class="summary-row"><span>Provident Fund</span><span>-${money(p.pf)}</span></div>
            <div class="summary-row"><span>Professional Tax</span><span>-${money(p.pt)}</span></div>
            <div class="summary-row"><span>Other Deductions</span><span>-${money(p.other_deductions)}</span></div>
            <div class="summary-total"><span style="margin-top: 5px;">After Deductions</span><span class="total-box font-bold">${money(netPay)}</span></div>
        </div>
        <div class="footer-note">Note: This is a system generated Pay Slip and does not require any signature.</div>
    </div>
    </body>
    </html>`;

    /* ===== CRASH-PROOF PDF GENERATION ===== */
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage"
        ]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Payslip-${month}.pdf"`);
      res.end(pdf);

    } catch (pdfError) {
      console.error("❌ Error during PDF generation:", pdfError);
      if (!res.headersSent) res.status(500).send("Failed to generate PDF");
    } finally {
      if (browser) {
        await browser.close();
      }
    }

  } catch (error) {
    console.error("❌ Outer Error:", error);
    if (!res.headersSent) res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
