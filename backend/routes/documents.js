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
   DOWNLOAD BY EMPLOYEE ID
====================================================== */
router.get("/cv/:employeeId", verifyToken, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);

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

