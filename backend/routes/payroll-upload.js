const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const XLSX = require("xlsx");
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

const upload = multer({ dest: "uploads/" });

/* =========================
   PAYROLL UPLOAD
   POST /api/payroll/upload
========================= */
router.post(
  "/upload",
  verifyToken,
  upload.single("payrollFile"),
  async (req, res) => {
    try {
      // 🔒 Role check FIRST
      if (!["admin", "hr"].includes(req.user.role)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // 🔴 File guard (CRITICAL)
      if (!req.file) {
        return res.status(400).json({ message: "Payroll file missing" });
      }

      const filePath = req.file.path;
      const ext = req.file.originalname.split(".").pop().toLowerCase();

      let rows = [];

      /* =========================
         PARSE FILE
      ========================= */
      if (ext === "csv") {
        rows = await parseCSV(filePath);
      } else if (ext === "xlsx") {
        const wb = XLSX.readFile(filePath);
        const sheet = wb.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
      } else {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: "Unsupported file type" });
      }

      const errors = [];
      let uploaded = 0;

      /* =========================
         PROCESS ROWS
      ========================= */
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];

        try {
          if (!r.emp_code || !r.month) {
            errors.push(`Row ${i + 1}: emp_code or month missing`);
            continue;
          }

          const emp = await getEmployeeByCode(r.emp_code);
          if (!emp) {
            errors.push(`Row ${i + 1}: Invalid emp_code`);
            continue;
          }

          const exists = await payrollExists(emp.id, r.month);
          if (exists) {
            errors.push(`Row ${i + 1}: Payroll already exists`);
            continue;
          }

          await insertPayroll(emp.id, r);
          uploaded++;
        } catch (e) {
          errors.push(`Row ${i + 1}: ${e.message}`);
        }
      }

      fs.unlinkSync(filePath);

      res.json({ uploaded, errors });

    } catch (err) {
      console.error("Payroll upload failed:", err);
      res.status(500).json({ message: "Payroll upload failed" });
    }
  }
);

/* =========================
   CSV PARSER
========================= */
function parseCSV(path) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path)
      .pipe(csv())
      .on("data", row => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

/* =========================
   HELPERS
========================= */
function getEmployeeByCode(code) {
  return new Promise((resolve, reject) => {
    db.query(
      "SELECT id FROM employees WHERE emp_code = ?",
      [code],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows[0] || null);
      }
    );
  });
}

function payrollExists(empId, month) {
  return new Promise((resolve, reject) => {
    db.query(
      "SELECT id FROM payroll WHERE employee_id = ? AND month = ?",
      [empId, month],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows.length > 0);
      }
    );
  });
}

function insertPayroll(empId, r) {
  return new Promise((resolve, reject) => {
    db.query(
      `
      INSERT INTO payroll
      (employee_id, month, working_days, paid_days,
       basic, hra, special_allowance, deductions, net_pay, locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        empId,
        r.month,
        Number(r.working_days) || 0,
        Number(r.paid_days) || 0,
        Number(r.basic) || 0,
        Number(r.hra) || 0,
        Number(r.special_allowance) || 0,
        Number(r.deductions) || 0,
        Number(r.net_pay) || 0
      ],
      err => (err ? reject(err) : resolve())
    );
  });
}

module.exports = router;
