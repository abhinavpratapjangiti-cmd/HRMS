const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

/* =========================
   UPLOAD DIRECTORY
========================= */
const CV_DIR = path.join(__dirname, "../uploads/cv");
if (!fs.existsSync(CV_DIR)) {
  fs.mkdirSync(CV_DIR, { recursive: true });
}

/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, CV_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const empId = req.user?.employee_id || Date.now();
    cb(null, `emp_${empId}_cv${ext}`);
  }
});

const upload = multer({ storage });

/* ======================================================
   UPLOAD / REPLACE CV
====================================================== */
router.post("/cv", verifyToken, upload.single("cv"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    await db.query(
      "DELETE FROM employee_documents WHERE employee_id = ? AND doc_type = 'CV'",
      [req.user.employee_id]
    );

    await db.query(
      `INSERT INTO employee_documents 
      (employee_id, doc_type, file_name, file_path, uploaded_by, uploaded_at) 
      VALUES (?, 'CV', ?, ?, 'employee', NOW())`,
      [
        req.user.employee_id,
        req.file.originalname,
        req.file.path
      ]
    );

    res.json({ status: "success" });
  } catch (err) {
    console.error("CV upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

/* ======================================================
   VIEW OWN CV
====================================================== */
router.get("/cv/my", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT file_name, file_path 
       FROM employee_documents 
       WHERE employee_id = ? AND doc_type = 'CV' 
       LIMIT 1`,
      [req.user.employee_id]
    );

    if (!rows.length) {
      return res.json(null);
    }

    const { file_name, file_path } = rows[0];

    if (!file_path || !fs.existsSync(file_path)) {
      return res.json(null);
    }

    res.download(file_path, file_name);
  } catch (err) {
    console.error("CV fetch error:", err);
    res.status(500).json({ message: "Fetch failed" });
  }
});

/* ======================================================
   LIST ALL EMPLOYEES (With or Without CV)
   ⚠️ MUST BE ABOVE /:employeeId route!
====================================================== */
router.get("/cv/list", verifyToken, async (req, res) => {
  try {
    // UPDATED QUERY: Using 'active' column name
    const sql = `
      SELECT 
        d.id as doc_id,
        e.id as employee_id,
        d.file_name,
        d.uploaded_at,
        e.name,
        e.skills,
        e.designation
      FROM employees e
      LEFT JOIN employee_documents d 
        ON e.id = d.employee_id AND d.doc_type = 'CV'
      WHERE e.active = 1     
      ORDER BY e.name ASC
    `;

    const [rows] = await db.query(sql);
    res.json(rows);

  } catch (err) {
    console.error("CV List error:", err);
    res.status(500).json({ message: "Failed to load CV list" });
  }
});

/* ======================================================
   DOWNLOAD BY EMPLOYEE ID
   ⚠️ Catches all other /cv/:id requests
====================================================== */
router.get("/cv/:employeeId", verifyToken, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: "Invalid Employee ID" });
    }

    const [rows] = await db.query(
      `SELECT file_name, file_path 
       FROM employee_documents 
       WHERE employee_id = ? AND doc_type = 'CV' 
       LIMIT 1`,
      [employeeId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "CV not found" });
    }

    const { file_name, file_path } = rows[0];

    if (!file_path || !fs.existsSync(file_path)) {
      return res.status(404).json({ message: "File missing" });
    }

    res.download(file_path, file_name);
  } catch (err) {
    console.error("CV download error:", err);
    res.status(500).json({ message: "Download failed" });
  }
});

module.exports = router;

