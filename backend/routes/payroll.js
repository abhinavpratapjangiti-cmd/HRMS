const express = require("express");
const router = express.Router();
const db = require("../db");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");

/* ======================================================
   HELPER: FORMAT CURRENCY (INR)
====================================================== */
const formatINR = value =>
  `₹ ${Number(value || 0).toLocaleString("en-IN")}`;

/* ======================================================
   LIST PAYSLIP MONTHS
   GET /api/payslips/my/months
====================================================== */
router.get("/my/months", verifyToken, (req, res) => {
  const empId = req.user.employee_id;
  if (!empId) return res.json([]);

  db.query(
    `
    SELECT DISTINCT month
    FROM payroll
    WHERE employee_id = ?
    ORDER BY month DESC
    `,
    [empId],
    (err, rows) => {
      if (err) {
        console.error("Payslip months error:", err);
        return res.json([]);
      }
      res.json(rows.map(r => r.month));
    }
  );
});

/* ======================================================
   PAYSLIP PDF (DOWNLOAD)
   GET /api/payslips/my/:month/pdf
====================================================== */
router.get("/my/:month/pdf", verifyToken, (req, res) => {
  const empId = req.user.employee_id;
  const { month } = req.params;

  if (!empId) {
    return res.status(401).send("Unauthorized");
  }

  db.query(
    `
    SELECT p.*, e.name
    FROM payroll p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.employee_id = ?
      AND p.month = ?
    LIMIT 1
    `,
    [empId, month],
    (err, rows) => {
      if (err) {
        console.error("Payslip PDF DB error:", err);
        return res.status(500).send("Server error");
      }

      if (!rows.length) {
        return res.status(404).send("Payslip not found");
      }

      const p = rows[0];

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=Payslip-${month}.pdf`
      );
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, private"
      );
      res.setHeader("Pragma", "no-cache");

      const doc = new PDFDocument({ margin: 40 });

      doc.on("error", err => {
        console.error("PDF generation error:", err);
        if (!res.headersSent) {
          res.status(500).send("PDF generation failed");
        }
      });

      doc.pipe(res);

      /* ===== LOGO ===== */
      const logoPath = path.join(
        __dirname,
        "../public/assets/logo.png"
      );
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 30, { width: 80 });
      }

      doc
        .fontSize(10)
        .text(
          "Lovas IT Solutions\nKakinada, Andhra Pradesh\nwww.lovasit.com",
          350,
          30,
          { align: "right" }
        );

      doc.moveDown(4);
      doc.fontSize(18).text("Salary Payslip", { align: "center" });
      doc.moveDown(2);

      doc.fontSize(11);
      doc.text(`Employee Name : ${p.name}`);
      doc.text(`Payslip Month : ${month}`);
      doc.moveDown(2);

      /* ===== EARNINGS ===== */
      doc.font("Helvetica-Bold").text("Earnings");
      doc.font("Helvetica");
      doc.text(`Basic : ${formatINR(p.basic)}`);
      doc.text(`HRA   : ${formatINR(p.hra)}`);
      doc.text(`DA    : ${formatINR(p.da)}`);
      doc.text(`LTA   : ${formatINR(p.lta)}`);
      doc.text(
        `Special Allowance : ${formatINR(p.special_allowance)}`
      );

      doc.moveDown(1);

      /* ===== DEDUCTIONS ===== */
      doc.font("Helvetica-Bold").text("Deductions");
      doc.font("Helvetica");
      doc.text(`PF  : ${formatINR(p.pf)}`);
      doc.text(`ESI : ${formatINR(p.esi)}`);
      doc.text(`TDS : ${formatINR(p.tds)}`);
      doc.text(
        `Other : ${formatINR(p.other_deductions)}`
      );

      doc.moveDown(2);

      /* ===== NET PAY ===== */
      doc.font("Helvetica-Bold");
      doc.text(`Net Pay : ${formatINR(p.net_pay)}`, {
        align: "right"
      });

      doc.moveDown(2);
      doc.fontSize(9).text(
        "This is a system generated payslip and does not require a signature.",
        { align: "center" }
      );

      doc.end();
    }
  );
});

/* ======================================================
   PAYSLIP DATA (UI JSON)
   GET /api/payslips/my/:month
====================================================== */
router.get("/my/:month", verifyToken, (req, res) => {
  const empId = req.user.employee_id;
  const { month } = req.params;

  if (!empId) return res.json({});

  db.query(
    `
    SELECT *
    FROM payroll
    WHERE employee_id = ?
      AND month = ?
    LIMIT 1
    `,
    [empId, month],
    (err, rows) => {
      if (err) {
        console.error("Payslip fetch error:", err);
        return res.status(500).json({ message: "DB error" });
      }
      res.json(rows[0] || {});
    }
  );
});

module.exports = router;
