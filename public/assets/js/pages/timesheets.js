/* =====================================================
   TIMESHEETS – MY + TEAM APPROVAL (FINAL, HARDENED)
   Compatible with OPTION A (Recursive Calendar)
===================================================== */

console.log("🚀 timesheets.js LOADED — FINAL");

/* =====================================================
   SPA LOAD GUARD (MUST BE IIFE)
===================================================== */
(function () {
  if (window.__timesheetsLoaded) {
    console.log("timesheets.js already initialized — skipping script execution");
    // We do NOT return here if the router needs to re-trigger window.initTimesheets,
    // but the functions are already in memory.
  }
  window.__timesheetsLoaded = true;

  /* =====================================================
     API HELPERS (ADDED – FIXES apiPut ERROR)
  ===================================================== */

  async function apiGet(url) {
    const token = localStorage.getItem("token");

    const res = await fetch(`/api${url}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "GET request failed");
    }

    return res.json();
  }

  async function apiPut(url, body) {
    const token = localStorage.getItem("token");

    const res = await fetch(`/api${url}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "PUT request failed");
    }

    return res.json();
  }

  /* =====================================================
     HELPERS
  ===================================================== */

  function getUserRole() {
    try {
      return (JSON.parse(localStorage.getItem("user"))?.role || "").toLowerCase();
    } catch {
      return "";
    }
  }

  function waitForElement(selector, cb) {
    const el = document.querySelector(selector);
    if (el) return cb(el);

    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        cb(el);
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
  }

  function formatDate(date) {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-IN");
  }

  function normalizeStatus(status) {
    if (!status) return "";
    return status.toUpperCase();
  }

  // ✅ Convert decimal hours (0.78) to HH:MM (00:47)
  function formatHoursToHHMM(decimalHours) {
    if (decimalHours == null || isNaN(decimalHours)) return "—";
    const totalMinutes = Math.round(Number(decimalHours) * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /* =====================================================
     MY TIMESHEETS
  ===================================================== */

  function initMyTimesheets() {
    const tab = document.getElementById("tab-my");
    const tbody = document.getElementById("timesheetBody");

    if (!tab || !tbody) {
      return;
    }

    // ✅ SPA FIX: Check if the picker is already in the DOM.
    // If yes, just grab the current month and load data. Do not duplicate the picker.
    const existingMonthInput = document.getElementById("myTimesheetMonth");
    if (existingMonthInput) {
      loadMyTimesheets(existingMonthInput.value);
      return;
    }

    // Otherwise, build the picker for the first time
    const picker = document.createElement("div");
    picker.className = "d-flex mb-3 align-items-center gap-2";
    picker.innerHTML = `
      <label class="fw-semibold">Month:</label>
      <input type="month" id="myTimesheetMonth"
        class="form-control" style="max-width:200px">
      <button class="btn btn-outline-secondary btn-sm" id="clearMyMonth">
        Clear
      </button>
    `;
    tab.prepend(picker);

    const monthInput = picker.querySelector("#myTimesheetMonth");
    const clearBtn = picker.querySelector("#clearMyMonth");

    monthInput.value = new Date().toISOString().slice(0, 7);

    monthInput.addEventListener("change", () => {
      loadMyTimesheets(monthInput.value);
    });

    clearBtn.addEventListener("click", () => {
      monthInput.value = "";
      renderEmptyTimesheet();
      toggleMyExcel(false);
    });

    loadMyTimesheets(monthInput.value);
  }

  async function loadMyTimesheets(month) {
    const tbody = document.getElementById("timesheetBody");
    if (!tbody) return;

    if (!month) {
      renderEmptyTimesheet();
      toggleMyExcel(false);
      return;
    }

    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted">Loading…</td>
      </tr>
    `;

    try {
      const rows = await apiGet(`/timesheets/my/calendar?month=${month}`);

      if (!Array.isArray(rows) || rows.length === 0) {
        renderEmptyTimesheet("No timesheets found");
        toggleMyExcel(false);
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const type = r.type || "";
        const status = normalizeStatus(r.status);

        const rowClass =
          type === "HOL" ? "table-warning" :
          type === "WO"  ? "table-secondary" :
          status === "APPROVED" ? "table-success" :
          status === "REJECTED" ? "table-danger" :
          "";

        const typeBadge =
          type === "L"   ? `<span class="badge bg-info">L</span>` :
          type === "P"   ? `<span class="badge bg-primary">P</span>` :
          type === "HOL" ? `<span class="badge bg-warning text-dark">HOL</span>` :
          type === "WO"  ? `<span class="badge bg-dark">WO</span>` :
          `<span class="text-muted">—</span>`;

        const statusBadge =
          status === "APPROVED"  ? `<span class="badge bg-success">Approved</span>` :
          status === "REJECTED"  ? `<span class="badge bg-danger">Rejected</span>` :
          status === "SUBMITTED" ? `<span class="badge bg-warning text-dark">Submitted</span>` :
          `<span class="text-muted">—</span>`;

        // ✅ Applied HH:MM formatter
        const hours =
          type === "WO" || type === "HOL"
            ? "—"
            : formatHoursToHHMM(r.hours);

        return `
          <tr class="${rowClass}">
            <td>${formatDate(r.work_date)}</td>
            <td>${r.day || "—"}</td>
            <td>${type === "P" ? (r.project || "—") : "—"}</td>
            <td>${type === "P" ? (r.task || "—") : "—"}</td>
            <td>${hours}</td>
            <td class="text-center">${typeBadge}</td>
            <td class="text-center">${statusBadge}</td>
          </tr>
        `;
      }).join("");

      toggleMyExcel(true);

    } catch (err) {
      console.error("MY TIMESHEETS LOAD FAILED:", err);
      renderEmptyTimesheet("Failed to load timesheets");
      toggleMyExcel(false);
    }
  }

  function renderEmptyTimesheet(msg = "Select a month to view timesheets") {
    const tbody = document.getElementById("timesheetBody");
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted">${msg}</td>
      </tr>
    `;
  }

  function toggleMyExcel(enable) {
    const btn = document.getElementById("btnDownloadMyExcel");
    if (btn) btn.disabled = !enable;
  }

  /* =====================================================
     TEAM APPROVAL
  ===================================================== */

  async function loadApprovalTimesheets() {
    const tbody = document.getElementById("approvalTable");
    const monthInput = document.getElementById("approvalMonth");
    if (!tbody || !monthInput) return;

    if (!monthInput.value) {
      monthInput.value = new Date().toISOString().slice(0, 7);
    }

    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted">Loading…</td>
      </tr>
    `;

    try {
      const rows = await apiGet(`/timesheets/approval?month=${monthInput.value}`);

      tbody.innerHTML = rows.length
        ? rows.map(r => {
            // ✅ Fix: Added type badge logic for the missing HTML column
            const type = r.type || "";
            const typeBadge =
              type === "P"   ? `<span class="badge bg-primary">P</span>` :
              type === "HOL" ? `<span class="badge bg-warning text-dark">HOL</span>` :
              type === "WO"  ? `<span class="badge bg-dark">WO</span>` :
              `<span class="text-muted">—</span>`;

            return `
            <tr>
              <td>${r.employee_name}</td>
              <td>${formatDate(r.work_date)}</td>
              <td>${r.project || "—"}</td>
              <td>${r.task || "—"}</td>
              <td>${formatHoursToHHMM(r.hours)}</td> <td>
                <span class="badge bg-warning text-dark">${r.status}</span>
              </td>
              <td class="text-center">${typeBadge}</td> <td class="text-end">
                <button class="btn btn-sm btn-success me-2"
                  onclick="updateTimesheetStatus(${r.id}, 'APPROVED', event)">
                  Approve
                </button>
                <button class="btn btn-sm btn-danger"
                  onclick="updateTimesheetStatus(${r.id}, 'REJECTED', event)">
                  Reject
                </button>
              </td>
            </tr>
          `}).join("")
        : `<tr><td colspan="8" class="text-center text-muted">No pending timesheets</td></tr>`;

    } catch (err) {
      console.error("APPROVAL LOAD FAILED:", err);
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load approvals.</td></tr>`;
    }
  }

  // ✅ Fix: Handled 'event' for button loading state UI
  window.updateTimesheetStatus = async function (id, status, event) {
    const btn = event?.target;
    const originalText = btn ? btn.innerText : (status === 'APPROVED' ? 'Approve' : 'Reject');

    if (!confirm(`Mark timesheet as ${status}?`)) return;

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Processing...`;
      }

      await apiPut(`/timesheets/${id}/status`, { status });
      await loadApprovalTimesheets();

    } catch (err) {
      console.error("STATUS UPDATE FAILED:", err);
      alert(`Error: ${err.message || "Failed to update status. Please try again."}`);

      if (btn) {
        btn.disabled = false;
        btn.innerText = originalText;
      }
    }
  };

async function loadRejectedTimesheets() {
  const tbody = document.getElementById("rejectedTable");
  const monthInput = document.getElementById("rejectedMonth");

  if (!tbody || !monthInput) return;

  if (!monthInput.value) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Loading…</td></tr>`;

  try {
    const rows = await apiGet(`/timesheets/rejected?month=${monthInput.value}`);

    tbody.innerHTML = rows.length
      ? rows.map(r => {
          // Escape strings so single quotes in tasks don't break the HTML button
          const safeProject = (r.project || "").replace(/'/g, "\\'");
          const safeTask = (r.task || "").replace(/'/g, "\\'");

          return `
          <tr class="table-danger">
            <td>${r.employee_name}</td>
            <td>${formatDate(r.work_date)}</td>
            <td>${r.project || "—"}</td>
            <td>${r.task || "—"}</td>
            <td>${formatHoursToHHMM(r.hours)}</td>
            <td><span class="badge bg-danger">Rejected</span></td>
            <td>${r.rejection_reason || "—"}</td>
            <td class="text-center">
              <button class="btn btn-sm btn-primary"
                onclick="openEditRejected(${r.id}, '${safeProject}', '${safeTask}', ${r.hours || 0}, '${r.status}')">
                Edit
              </button>
            </td>
          </tr>
        `}).join("")
      : `<tr><td colspan="8" class="text-center text-muted">No rejected timesheets</td></tr>`;

  } catch (err) {
    console.error("REJECTED LOAD FAILED:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load data</td></tr>`;
  }
}

window.openEditRejected = function(id, project, task, hours, status) {
  document.getElementById("editTimesheetId").value = id;
  document.getElementById("editProject").value = project || "";
  document.getElementById("editTask").value = task || "";
  document.getElementById("editHours").value = hours || 0;
  // Default to rejected so the manager actively has to switch it to Approve
  document.getElementById("editStatus").value = status || "REJECTED"; 

  new bootstrap.Modal(document.getElementById('editRejectedModal')).show();
};

window.saveRejectedEdit = async function() {
  const id = document.getElementById("editTimesheetId").value;
  
  const data = {
    project: document.getElementById("editProject").value,
    task: document.getElementById("editTask").value,
    hours: document.getElementById("editHours").value,
    status: document.getElementById("editStatus").value
  };

  try {
    await apiPut(`/timesheets/rejected/${id}`, data);
    
    // Hide modal
    const modalEl = document.getElementById('editRejectedModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    // Refresh tables
    loadRejectedTimesheets();
    if(typeof loadApprovalTimesheets === 'function') loadApprovalTimesheets();
    
  } catch (err) {
    console.error("Failed to save edited timesheet:", err);
    alert("Failed to update: " + (err.message || "Server error"));
  }
};

  /* =====================================================
     EXCEL DOWNLOADS
  ===================================================== */

  function downloadExcel(url, filename) {
    const token = localStorage.getItem("token");

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => {
        console.error("EXCEL DOWNLOAD FAILED:", err);
        alert("Failed to download Excel");
      });
  }

  window.downloadMyTimesheetExcel = () => {
    const m = document.getElementById("myTimesheetMonth")?.value;
    if (!m) return;

    downloadExcel(
      `/api/timesheets/my/calendar/excel?month=${m}`,
      `Timesheet-${m}.xlsx`
    );
  };

  window.downloadTeamTimesheetExcel = () => {
    const m = document.getElementById("approvalMonth")?.value;
    if (!m) return;

    downloadExcel(
      `/api/timesheets/export/team/excel?month=${m}`,
      `Team-Timesheets-${m}.xlsx`
    );
  };

  /* =====================================================
     PAGE INIT (CALLED BY ROUTER)
  ===================================================== */
  window.initTimesheets = function () {
    const role = getUserRole();

    waitForElement("#tab-my", initMyTimesheets);

    if (["employee", "manager", "hr", "admin"].includes(role)) {
      document.getElementById("btnDownloadMyExcel")?.classList.remove("d-none");
    }

    // ✅ TEAM APPROVAL
    if (["manager", "hr", "admin"].includes(role)) {
      document.getElementById("btnDownloadTeamExcel")?.classList.remove("d-none");
      document.getElementById("approvalTab")?.classList.remove("d-none");

      waitForElement("#approval-tab", tab => {
        tab.addEventListener("shown.bs.tab", loadApprovalTimesheets);
      });
    }

    // ✅ REJECTED TAB (ONLY MANAGER + ADMIN)
    if (["manager", "admin"].includes(role)) {
      document.getElementById("rejectedTab")?.classList.remove("d-none");

      waitForElement("#rejected-tab", tab => {
        tab.addEventListener("shown.bs.tab", loadRejectedTimesheets);
      });
    }
  };

})();
