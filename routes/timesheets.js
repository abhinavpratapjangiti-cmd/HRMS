const express = require("express");
const router = express.Router();
const db = require("../db"); // mysql2/promise pool
const ExcelJS = require("exceljs");
const { verifyToken } = require("../middleware/auth");

/* =====================================================
   1️⃣ MY TIMESHEETS – CALENDAR (JSON API)
===================================================== */
router.get("/my/calendar", verifyToken, (req, res) => {
  const { month } = req.query;
  const empId = req.user.employee_id;

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
      al.clock_in AS start_time,
      al.clock_out AS end_time,
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
      ON al.employee_id = ? AND al.log_date = c.work_date
    LEFT JOIN timesheets ts
      ON ts.employee_id = ? AND ts.work_date = c.work_date
    LEFT JOIN holidays h
      ON h.holiday_date = c.work_date
    ORDER BY c.work_date
    `,
    [month, month, empId, empId]
  )
    .then(([rows]) => res.json(rows))
    .catch((err) => {
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

  if (!month) return res.status(400).json({ message: "Month missing" });

  if (!["manager", "hr", "admin"].includes(role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  db.query(
    `
    SELECT
      t.id, e.name AS employee_name, t.work_date, t.project,
      t.task, t.hours, t.status, 'P' AS type
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.status = 'SUBMITTED'
      AND DATE_FORMAT(t.work_date, '%Y-%m') = ?
      AND (? IN ('hr','admin') OR e.manager_id = ?)
    ORDER BY t.work_date
    `,
    [month, role, managerId]
  )
    .then(([rows]) => res.json(rows))
    .catch((err) => {
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

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  db.query(
    `
    UPDATE timesheets
    SET status = ?, approved_by = ?, approved_at = NOW()
    WHERE id = ? AND status = 'SUBMITTED'
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
    .catch((err) => {
      console.error("UPDATE STATUS ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });
});

/* =====================================================
   4️⃣ MY TIMESHEET – OFFICIAL EXCEL (BIG DATA + DYNAMIC NAME)
===================================================== */
router.get("/my/calendar/excel", verifyToken, (req, res) => {
  const { month } = req.query;
  const empId = req.user.employee_id;

  if (!empId || !month) {
    return res.status(400).json({ message: "Employee or month missing" });
  }

  let emp;

  // 1. Get Employee Details
  db.query(
    `SELECT id, name, department, designation, work_location, client_name
     FROM employees WHERE id = ?`,
    [empId]
  )
    .then(([[row]]) => {
      emp = row || {};

      // 2. Get Calendar & Timesheet Data
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
          DATE_FORMAT(al.clock_in, '%h:%i %p') AS start_time,
          DATE_FORMAT(al.clock_out, '%h:%i %p') AS end_time,
          ts.hours,
          COALESCE(ts.status, '') AS status,
          CASE
            WHEN ts.id IS NOT NULL THEN 'P'
            WHEN h.holiday_date IS NOT NULL THEN 'HOL'
            WHEN DAYOFWEEK(c.work_date) IN (1,7) THEN 'WO'
            ELSE ''
          END AS type
        FROM calendar c
        LEFT JOIN attendance_logs al ON al.employee_id = ? AND al.log_date = c.work_date
        LEFT JOIN timesheets ts ON ts.employee_id = ? AND ts.work_date = c.work_date
        LEFT JOIN holidays h ON h.holiday_date = c.work_date
        ORDER BY c.work_date
        `,
        [month, month, empId, empId]
      );
    })
    .then(([rows]) => {
      const wb = new ExcelJS.Workbook();
      const sh = wb.addWorksheet("Timesheet", {
        views: [{ showGridLines: false }]
      });

      // --- STYLES ---
      const borderStyle = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      const brightBlueFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0070C0' } // Vibrant Blue
      };

      const lightOrangeFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE699' } // Light Orange for Weekends
      };

      const whiteFont = {
        bold: true,
        size: 11,
        color: { argb: 'FFFFFFFF' }
      };

      // --- A. Define Columns ---
      sh.columns = [
        { key: "date", width: 15 },       // A
        { key: "day", width: 15 },        // B
        { key: "start", width: 15 },      // C
        { key: "end", width: 15 },        // D
        { key: "total", width: 15 },      // E
        { key: "type", width: 10 },       // F
        { key: "remarks", width: 30 },    // G
      ];

      // --- B. Main Header (LOVAS IT) ---
      sh.mergeCells("A1:G1");
      const title = sh.getCell("A1");
      title.value = "LOVAS IT";
      title.fill = brightBlueFill;
      title.font = { ...whiteFont, size: 18, name: 'Calibri' }; // Slightly larger title
      title.alignment = { horizontal: "center", vertical: "middle" };
      title.border = borderStyle;

      // --- C. Metadata Rows (BIG DATA UPDATE) ---
      const addMeta = (rowNum, label, value) => {
        // Label (Col A)
        const labelCell = sh.getCell(`A${rowNum}`);
        labelCell.value = label;
        labelCell.font = { bold: true, size: 11 }; // Standard size for label
        labelCell.alignment = { vertical: "middle", horizontal: "left" };
        labelCell.border = borderStyle;

        // Value (Merged B-G)
        sh.mergeCells(`B${rowNum}:G${rowNum}`);
        const valCell = sh.getCell(`B${rowNum}`);
        valCell.value = value || "—";

        // ✅ UPDATE: FONT SIZE 16 for Data
        valCell.font = { bold: true, size: 16, name: 'Calibri' };

        valCell.alignment = { horizontal: "center", vertical: "middle" };
        valCell.border = borderStyle;

        // Increase row height to fit Size 16 font
        sh.getRow(rowNum).height = 25;
      };

      addMeta(2, "Employee ID:", emp.id);
      addMeta(3, "Employee Name:", emp.name);
      addMeta(4, "Department / Project:", emp.department);
      addMeta(5, "Client Name:", emp.client_name);
      addMeta(6, "Work Location:", emp.work_location);
      addMeta(7, "Designation:", emp.designation);
      addMeta(8, "Month & Year:", month);

      // --- D. Legend (Row 9) ---
      sh.mergeCells("A9:G9");
      const legend = sh.getCell("A9");
      legend.value = "TYPE: WO- Weekly OFF, P- Present, LE- Leave, COFF- Comp OFF, HOL - Holiday, RE - Release";
      legend.font = { size: 9, bold: true };
      legend.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      legend.border = borderStyle;

      // Row 10: Empty Spacer
      sh.mergeCells("A10:G10");
      sh.getCell("A10").border = borderStyle;

      // --- E. Table Headers (Row 11) ---
      const headerRowIndex = 11;
      const headers = ["Date", "Day", "Start Time", "End Time", "Total Time", "Type", "Remarks"];
      const headerRow = sh.getRow(headerRowIndex);
      headerRow.values = headers;
      headerRow.height = 25;

      headerRow.eachCell((cell) => {
        cell.fill = brightBlueFill;
        cell.font = whiteFont;
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = borderStyle;
      });

      // --- F. Data Loop ---
      let totalHours = 0;
      let workedDays = 0;
      let leaveCount = 0;
      let currentRowIndex = 12;

      rows.forEach((r) => {
        const isPresent = r.type === "P";
        const isWeekend = (r.day === 'Saturday' || r.day === 'Sunday');

        if (isPresent) {
            workedDays++;
            totalHours += parseFloat(r.hours || 0);
        }
        if (r.type === 'LE') {
            leaveCount++;
        }

        let formattedDate = "—";
        if (r.work_date) {
            const d = new Date(r.work_date);
            const day = String(d.getDate()).padStart(2, '0');
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const yr = d.getFullYear();
            formattedDate = `${day}-${mo}-${yr}`;
        }

        const rowValues = [
          formattedDate,
          r.day,
          isPresent ? (r.start_time || "—") : "",
          isPresent ? (r.end_time || "—") : "",
          isPresent ? (r.hours || "0") : "",
          r.type,
          r.status
        ];

        const currentRow = sh.getRow(currentRowIndex);
        currentRow.values = rowValues;

        const remarksLength = (r.status || "").length;
        currentRow.height = remarksLength > 30 ? 35 : 20;

        currentRow.eachCell((cell) => {
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.border = borderStyle;

          if (isWeekend) {
             cell.fill = lightOrangeFill; // ✅ Orange for weekends
          }
        });

        currentRowIndex++;
      });

      // --- G. Footer Totals ---
      const addTotal = (label, val) => {
        const row = sh.getRow(currentRowIndex);

        const lbl = row.getCell(2);
        lbl.value = label;
        lbl.font = { bold: true };
        lbl.alignment = { horizontal: "left" };

        const v = row.getCell(3);
        v.value = val;
        v.alignment = { horizontal: "center" };
        v.font = { bold: true };

        for(let i=1; i<=7; i++) {
           row.getCell(i).border = borderStyle;
        }
        currentRowIndex++;
      };

      addTotal("Total No of Hours", totalHours.toFixed(2));
      addTotal("Total No Of Days Worked", workedDays);
      addTotal("Total Number of Leave Taken", leaveCount);

      sh.mergeCells(`A${currentRowIndex}:G${currentRowIndex}`);
      sh.getCell(`A${currentRowIndex}`).border = borderStyle;
      currentRowIndex++;

      // --- H. Signatures (DYNAMIC NAME) ---
      const sigLabelRow = sh.getRow(currentRowIndex);

      // ✅ UPDATE: Auto-retrieve Employee Name
      sigLabelRow.getCell(1).value = `Employee Name : ${emp.name}`; // Cell A
      sigLabelRow.getCell(5).value = "Authorized Name"; // Cell E
      sigLabelRow.getCell(7).value = "Signature";       // Cell G

      sigLabelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
         if (colNum <= 7) {
             cell.font = { bold: true };
             cell.alignment = { horizontal: "left", vertical: "middle" };
             if(colNum === 5 || colNum === 7) cell.alignment = { horizontal: "center" };
             cell.border = borderStyle;
         }
      });
      currentRowIndex++;

      // Sign Space
      const signSpaceRow = sh.getRow(currentRowIndex);
      signSpaceRow.height = 60;
      for(let i=1; i<=7; i++) {
          signSpaceRow.getCell(i).border = borderStyle;
      }
      currentRowIndex++;

      // --- I. Disclaimer ---
      sh.mergeCells(`A${currentRowIndex}:G${currentRowIndex}`);
      const disclaimer = sh.getCell(`A${currentRowIndex}`);
      disclaimer.value = "This Is A System Generated Timesheet";
      disclaimer.alignment = { horizontal: "center", vertical: "middle" };
      disclaimer.font = { italic: true, size: 10, color: { argb: 'FF555555' } };
      disclaimer.border = borderStyle;

      // --- J. Auto-Width Adjustment ---
      for (let i = 1; i <= 7; i++) {
          let maxLength = 0;
          const col = sh.getColumn(i);

          sh.eachRow((row) => {
              const cell = row.getCell(i);
              if (cell.value && !cell.isMerged) {
                  const len = cell.value.toString().length;
                  if (len > maxLength) maxLength = len;
              }
          });

          col.width = Math.min(Math.max(maxLength + 4, 15), 50);
      }

      // --- Output ---
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=Timesheet_${month}.xlsx`);

      return wb.xlsx.write(res);
    })
    .then(() => res.end())
    .catch((err) => {
      console.error("MY EXCEL ERROR:", err);
      res.status(500).json({ message: "Excel error" });
    });
});

/* =====================================================
   5️⃣ TEAM TIMESHEET EXCEL
===================================================== */
router.get("/export/team/excel", verifyToken, (req, res) => {
  const { month } = req.query;

  db.query(
    `
    SELECT e.name AS employee, t.work_date, t.project, t.task, t.hours, t.status
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.status = 'APPROVED'
  AND DATE_FORMAT(t.work_date, '%Y-%m') = ?
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
        { header: "Status", key: "status", width: 15 },
      ];

      rows.forEach((r) => sh.addRow(r));
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
    .catch((err) => {
      console.error("TEAM EXCEL ERROR:", err);
      res.status(500).json({ message: "Excel error" });
    });
});

/* =====================================================
   6️⃣ PENDING TIMESHEETS COUNT
===================================================== */
router.get("/pending/my-team", verifyToken, (req, res) => {

  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const sql = `
    SELECT COUNT(*) AS count
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.status = 'SUBMITTED'
    ${req.user.role === "manager" ? "AND e.manager_id = ?" : ""}
  `;

  const params = req.user.role === "manager"
    ? [req.user.employee_id]   // ✅ THIS IS THE FIX
    : [];

  db.query(sql, params)
    .then(([[row]]) => res.json({ count: row.count }))
    .catch(err => {
      console.error("PENDING TIMESHEETS COUNT ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });

});


/* =====================================================
   7️⃣ PENDING TIMESHEETS LIST (FOR DASHBOARD MODAL)
===================================================== */
router.get("/pending/my-team/list", verifyToken, (req, res) => {
  if (!["manager", "hr", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

// 🔥 FIX: Aliased the columns so the frontend JS automatically understands them
  const sql = `
    SELECT
      t.id,
      e.name,
      t.work_date AS date,
      t.hours AS worked_hours,
      CONCAT('Project: ', t.project, ' | Task: ', t.task) AS reason,
      t.status
    FROM timesheets t
    JOIN employees e ON e.id = t.employee_id
    WHERE t.status = 'SUBMITTED'
    ${req.user.role === "manager"
      ? "AND e.manager_id = (SELECT id FROM employees WHERE user_id = ?)"
      : ""}
    ORDER BY t.work_date DESC
  `;

  const params = req.user.role === "manager" ? [req.user.id] : [];

  db.query(sql, params)
    .then(([rows]) => res.json(rows))
    .catch((err) => {
      console.error("PENDING TIMESHEET LIST ERROR:", err);
      res.status(500).json({ message: "DB error" });
    });
});


module.exports = router;
