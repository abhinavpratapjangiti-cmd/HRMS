const express = require("express");
const router = express.Router();
const db = require("../db"); // mysql2/promise pool
const ExcelJS = require("exceljs");
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   1️⃣ MY TIMESHEETS – CALENDAR (CORRECTED)
===================================================== */
router.get("/my/calendar", verifyToken, (req, res) => {
  const { month } = req.query;
  const empId = req.user.employee_id; // Ensure this matches your token structure

  if (!empId || !month) {
    return res.status(400).json({ message: "Employee or month missing" });
  }

  db.query(
    `
    WITH RECURSIVE calendar AS (
      SELECT DATE(CONCAT(?, '-01')) AS work_date
      UNION ALL
      SELECT DATE_ADD(work_date, INTERVAL 1 DAY)
      FROM calendar
      WHERE work_date < LAST_DAY(CONCAT(?, '-01'))
    )
    SELECT 
      c.work_date,
      DAYNAME(c.work_date) AS day,
      
      -- 1. SHOW DATA REGARDLESS OF STATUS
      -- We want the user to see what they submitted immediately
      al.clock_in AS start_time,
      al.clock_out AS end_time,
      ts.project, 
      ts.task,
      ts.hours,
      
      -- 2. STATUS IS KEY
      -- If no timesheet exists, it's empty. If it exists, show the status.
      COALESCE(ts.status, '') AS status,

      -- 3. DETERMINE ROW TYPE
      CASE 
        -- If there is a timesheet entry (Submitted OR Approved), treat it as Present ('P')
        WHEN ts.id IS NOT NULL THEN 'P' 
        WHEN h.holiday_date IS NOT NULL THEN 'HOL'
        WHEN DAYOFWEEK(c.work_date) IN (1,7) THEN 'WO'
        ELSE '' 
      END AS type

    FROM calendar c
    LEFT JOIN attendance_logs al 
      ON al.employee_id = ? 
      AND al.log_date = c.work_date
    LEFT JOIN timesheets ts 
      ON ts.employee_id = ? 
      AND ts.work_date = c.work_date
    LEFT JOIN holidays h 
      ON h.holiday_date = c.work_date
    ORDER BY c.work_date
    `,
    [month, month, empId, empId]
  )
    .then(([rows]) => res.json(rows))
    .catch(err => {
      console.error("MY CALENDAR ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });
});
/* =====================================================
   2️⃣ TEAM APPROVAL – API
===================================================== */
router.get("/approval", verifyToken, (req, res) => {
  const { month } = req.query;
  const { role, employee_id: managerId } = req.user;

  if (!month) {
    return res.status(400).json({ message: "Month missing" });
  }

  if (!["manager", "hr", "admin"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  db.query(
    `
    SELECT
      t.id,
      e.name AS employee_name,
      t.work_date,
      t.project,
      t.task,
      t.hours,
      t.status,
      'P' AS type
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.status = 'Submitted'
      AND DATE_FORMAT(t.work_date, '%Y-%m') = ?
      AND (
        ? IN ('hr','admin')
        OR e.manager_id = ?
      )
    ORDER BY t.work_date
    `,
    [month, role, managerId]
  )
    .then(([rows]) => res.json(rows))
    .catch(err => {
      console.error("APPROVAL ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });
});

/* =====================================================
   3️⃣ UPDATE TIMESHEET STATUS
===================================================== */
router.put("/:id/status", verifyToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  db.query(
    `
    UPDATE timesheets
    SET status = ?, approved_by = ?, approved_at = NOW()
    WHERE id = ? AND status = 'Submitted'
    `,
    [status, req.user.employee_id, id]
  )
    .then(([result]) => {
      if (!result.affectedRows) {
        return res.status(404).json({
          message: "Timesheet not found or already processed"
        });
      }
      res.json({ success: true });
    })
    .catch(err => {
      console.error("UPDATE STATUS ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });
});

/* =====================================================
   4️⃣ MY TIMESHEET – OFFICIAL EXCEL (FIXED TIME FORMAT)
===================================================== */
router.get("/my/calendar/excel", verifyToken, (req, res) => {
  const { month } = req.query;
  const empId = req.user.employee_id;

  if (!empId || !month) {
    return res.status(400).json({ message: "Employee or month missing" });
  }

  let emp;

  db.query(
    `SELECT id, name, department, designation, work_location, client_name 
     FROM employees WHERE id = ?`,
    [empId]
  )
    .then(([[row]]) => {
      emp = row;
      return db.query(
        `
        WITH RECURSIVE calendar AS (
          SELECT DATE(CONCAT(?, '-01')) AS work_date
          UNION ALL
          SELECT DATE_ADD(work_date, INTERVAL 1 DAY)
          FROM calendar
          WHERE work_date < LAST_DAY(CONCAT(?, '-01'))
        )
        SELECT 
          c.work_date,
          DAYNAME(c.work_date) AS day,
          
          -- ✅ FIX: Format as String (e.g., "09:30 AM")
          DATE_FORMAT(al.clock_in, '%h:%i %p') AS start_time,
          DATE_FORMAT(al.clock_out, '%h:%i %p') AS end_time,
          
          ts.project,
          ts.task,
          ts.hours,
          COALESCE(ts.status, '') AS status,
          
          CASE 
            WHEN ts.id IS NOT NULL THEN 'P'
            WHEN h.holiday_date IS NOT NULL THEN 'HOL'
            WHEN DAYOFWEEK(c.work_date) IN (1,7) THEN 'WO'
            ELSE '' 
          END AS type

        FROM calendar c
        LEFT JOIN attendance_logs al 
          ON al.employee_id = ? 
          AND al.log_date = c.work_date
        LEFT JOIN timesheets ts 
          ON ts.employee_id = ? 
          AND ts.work_date = c.work_date
        LEFT JOIN holidays h 
          ON h.holiday_date = c.work_date
        ORDER BY c.work_date
        `,
        [month, month, empId, empId]
      );
    })
    .then(([rows]) => {
      const wb = new ExcelJS.Workbook();
      const sh = wb.addWorksheet("Timesheet");

      sh.columns = [
        { width: 14 }, { width: 12 }, { width: 14 }, { width: 14 },
        { width: 22 }, { width: 30 }, { width: 14 }, { width: 10 }, { width: 18 }
      ];

      // ... (Header Styles remain the same) ...
      sh.mergeCells("A1:I1");
      sh.getCell("A1").value = "LOVAS IT";
      sh.getCell("A1").font = { bold: true, size: 14 };
      sh.getCell("A1").alignment = { horizontal: "center" };

      sh.addRow(["Employee Name:", emp.name]);
      sh.addRow(["Department:", emp.department]);
      sh.addRow(["Designation:", emp.designation]);
      sh.addRow(["Client:", emp.client_name || "—"]);
      sh.addRow(["Work Location:", emp.work_location]);
      sh.addRow(["Month & Year:", month]);
      sh.addRow([]);

      const header = sh.addRow([
        "Date", "Day", "Start Time", "End Time", "Project",
        "Task", "Total Time", "Type", "Remarks"
      ]);
      header.font = { bold: true };

      rows.forEach(r => {
        sh.addRow([
          r.work_date.toLocaleDateString("en-GB"),
          r.day,
          r.type === "P" ? r.start_time : "—", // Now renders "11:33 AM"
          r.type === "P" ? r.end_time : "—",   // Now renders "11:35 AM"
          r.type === "P" ? (r.project || "—") : "—",
          r.type === "P" ? (r.task || "—") : "—",
          r.type === "P" ? (r.hours || "0") : "—",
          r.type || "—",
          r.status 
        ]);
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=Timesheet-${month}.xlsx`
      );

      return wb.xlsx.write(res);
    })
    .then(() => res.end())
    .catch(err => {
      console.error("MY EXCEL ERROR:", err);
      res.status(500).json({ message: "Excel error" });
    });
});
/* =====================================================
   5️⃣ TEAM TIMESHEET EXCEL (FIXED)
===================================================== */
router.get("/export/team/excel", verifyToken, (req, res) => {
  const { month } = req.query;

  db.query(
    `
    SELECT 
      e.name AS employee,
      t.work_date,
      t.project,
      t.task,
      t.hours,
      t.status -- Helpful to see the status in the export
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE DATE_FORMAT(t.work_date, '%Y-%m') = ?
    -- ❌ REMOVED: AND t.status = 'Approved' 
    ORDER BY e.name, t.work_date
    `,
    [month]
  )
    .then(([rows]) => {
      const wb = new ExcelJS.Workbook();
      const sh = wb.addWorksheet("Team Timesheets");

      sh.columns = [
        { header: "Employee", key: "employee", width: 25 },
        { header: "Date", key: "work_date", width: 15 },
        { header: "Project", key: "project", width: 25 },
        { header: "Task", key: "task", width: 30 },
        { header: "Hours", key: "hours", width: 10 },
        { header: "Status", key: "status", width: 15 } // Added status column
      ];

      rows.forEach(r => sh.addRow(r));
      sh.getRow(1).font = { bold: true };

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=Team_Timesheet_${month}.xlsx`
      );

      return wb.xlsx.write(res);
    })
    .then(() => res.end())
    .catch(err => {
      console.error("TEAM EXCEL ERROR:", err);
      res.status(500).json({ message: "Excel error" });
    });
});
/* =====================================================
   6️⃣ PENDING TIMESHEETS (MY TEAM)
===================================================== */
router.get("/pending/my-team", verifyToken, (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const sql = `
    SELECT COUNT(*) AS count
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.status = 'PENDING'
    ${
      req.user.role === "manager"
        ? "AND e.manager_id = (SELECT id FROM employees WHERE user_id = ?)"
        : ""
    }
  `;

  const params =
    req.user.role === "manager" ? [req.user.id] : [];

  db.query(sql, params)
    .then(([[row]]) => res.json({ count: row.count }))
    .catch(err => {
      console.error("PENDING TIMESHEETS ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });
});

module.exports = router;
