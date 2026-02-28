const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const XLSX = require("xlsx");
const db = require("../db"); // This is a Promise-based pool
const { verifyToken } = require("../middleware/auth");

const upload = multer({ dest: "uploads/" });

/* =========================
   PAYROLL UPLOAD
========================= */
router.post(
  "/",
  verifyToken,
  upload.single("payrollFile"),
  async (req, res) => {
    console.log("🔥 HIT: Payroll Upload Route reached!");

    try {
      // 1. Checks
      if (!["admin", "hr"].includes(req.user.role)) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Payroll file missing" });
      }

      const filePath = req.file.path;
      const ext = req.file.originalname.split(".").pop().toLowerCase();
      let rows = [];

      // 2. Parse File
      try {
        if (ext === "csv") {
          rows = await parseCSV(filePath);
        } else if (ext === "xlsx") {
          const wb = XLSX.readFile(filePath);
          const sheet = wb.SheetNames[0];
          rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
        }
      } catch (err) {
        console.error("❌ Parse Error:", err);
        return res.status(400).json({ message: "File parse error" });
      }

      const errors = [];
      let uploaded = 0;

      console.log(`📊 Processing ${rows.length} rows...`);

      // 3. Process Rows
// 3. Process Rows
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];

  const cleanRow = {};
  Object.keys(r).forEach(key => cleanRow[key.trim()] = r[key]);

  try {
    if (!cleanRow.emp_code || !cleanRow.month) {
      errors.push(`Row ${i + 1}: Missing emp_code or month`);
      continue;
    }

    const empCode = String(cleanRow.emp_code).trim();
    const month = String(cleanRow.month).trim();

    const [empRows] = await db.query(
      "SELECT id FROM employees WHERE emp_code = ? AND active = 1",
      [empCode]
    );

    if (!empRows.length) {
      errors.push(`Row ${i + 1}: Employee ${empCode} not found or inactive`);
      continue;
    }

    const empId = empRows[0].id;

    const [existRows] = await db.query(
      "SELECT id FROM payroll WHERE employee_id = ? AND month = ?",
      [empId, month]
    );

    if (existRows.length > 0) {
      errors.push(`Row ${i + 1}: Payroll already exists`);
      continue;
    }

    await db.query(
      `INSERT INTO payroll (
          employee_id,
          month,
          working_days,
          paid_days,
          basic,
          hra,
          da,
          lta,
          special_allowance,
          other_allowance,
          pf,
          pt,
          other_deductions,
          net_pay,
          locked
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        empId,
        month,
        Number(cleanRow.working_days) || 0,
        Number(cleanRow.paid_days) || 0,
        Number(cleanRow.basic) || 0,
        Number(cleanRow.hra) || 0,
        Number(cleanRow.da) || 0,
        Number(cleanRow.lta) || 0,
        Number(cleanRow.special_allowance) || 0,
        Number(cleanRow.other_allowance) || 0,
        Number(cleanRow.pf) || 0,
        Number(cleanRow.pt) || 0,
        Number(cleanRow.other_deductions) || 0,
        Number(cleanRow.net_pay) || 0
      ]
    );

    uploaded++;

  } catch (e) {
    console.error(`❌ Row ${i + 1} Error:`, e);
    errors.push(`Row ${i + 1}: ${e.message}`);
  }
}
      // Cleanup
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      console.log(`✅ Finished: ${uploaded} uploaded`);
      res.json({ uploaded, errors });

 } catch (err) {
      console.error("💥 Critical Upload Error:", err);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ message: "Server error during upload" });
    }
  }
);
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

module.exports = router;

