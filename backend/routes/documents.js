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
    cb(null, `emp_${req.user.employee_id}_cv${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

/* ======================================================
   UPLOAD / REPLACE CV (EMPLOYEE)
====================================================== */
router.post(
  "/cv",
  verifyToken,
  upload.single("cv"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const sql = `
        INSERT INTO employee_documents
          (employee_id, doc_type, file_name, file_path, uploaded_by, uploaded_at)
        VALUES (?, 'CV', ?, ?, 'employee', NOW())
        ON DUPLICATE KEY UPDATE
          file_name = VALUES(file_name),
          file_path = VALUES(file_path),
          uploaded_at = NOW()
      `;

      await db.promise().query(sql, [
        req.user.employee_id,
        req.file.originalname,
        req.file.path
      ]);

      res.json({ status: "success" });
    } catch (err) {
      console.error("CV upload error:", err);
      res.status(500).json({ message: "DB error" });
    }
  }
);

/* ======================================================
   VIEW / DOWNLOAD OWN CV
====================================================== */
router.get("/cv/my", verifyToken, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `
      SELECT file_name, file_path
      FROM employee_documents
      WHERE employee_id = ? AND doc_type = 'CV'
      LIMIT 1
      `,
      [req.user.employee_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "CV not found" });
    }

    const { file_name, file_path } = rows[0];

    if (!file_path || !fs.existsSync(file_path)) {
      return res
        .status(404)
        .json({ message: "CV file not found on server" });
    }

    res.download(file_path, file_name);
  } catch (err) {
    console.error("CV fetch error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

/* ======================================================
   LIST ALL CVs (HR / ADMIN)
====================================================== */
router.get("/cv/list", verifyToken, async (req, res) => {
  const role = String(req.user.role || "").toLowerCase();
  if (!["admin", "hr"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const [rows] = await db.promise().query(`
      SELECT
        d.employee_id,
        e.name,
        e.skills,
        e.department,
        d.uploaded_at,
        d.file_name,
        CONCAT('/api/documents/cv/', d.employee_id) AS url
      FROM employee_documents d
      JOIN employees e ON e.id = d.employee_id
      WHERE d.doc_type = 'CV'
        AND e.active = 1
      ORDER BY d.uploaded_at DESC
    `);

    res.json(rows || []);
  } catch (err) {
    console.error("CV list error:", err);
    res.status(500).json([]);
  }
});

/* ======================================================
   DOWNLOAD CV BY EMPLOYEE (HR / ADMIN / SELF)
====================================================== */
router.get("/cv/:employeeId", verifyToken, async (req, res) => {
  const employeeId = Number(req.params.employeeId);

  if (
    req.user.role === "employee" &&
    req.user.employee_id !== employeeId
  ) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const [rows] = await db.promise().query(
      `
      SELECT file_name, file_path
      FROM employee_documents
      WHERE employee_id = ? AND doc_type = 'CV'
      LIMIT 1
      `,
      [employeeId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "CV not found" });
    }

    const { file_name, file_path } = rows[0];

    if (!file_path || !fs.existsSync(file_path)) {
      return res
        .status(404)
        .json({ message: "CV file not found on server" });
    }

    res.download(file_path, file_name);
  } catch (err) {
    console.error("CV download error:", err);
    res.status(500).json({ message: "DB error" });
  }
});

module.exports = router;
