console.log("employee-profile.js loaded");

/* =====================================================
   GLOBAL LOAD GUARD (SPA SAFE)
===================================================== */
if (window.__employeeProfileLoaded) {
  console.log("employee-profile.js already initialized — skipping");
} else {
  window.__employeeProfileLoaded = true;

  /* =====================================================
     GLOBAL STATE
  ===================================================== */
  let selectedEmployeeId = null;

  /* =====================================================
     PAGE INIT (called by router)
     Supports initEmployee("5") OR initEmployee(["5"])
  ===================================================== */
  async function initEmployee(param) {
    const employeeId = Array.isArray(param) ? param[0] : param;
    if (!employeeId) return;

    selectedEmployeeId = employeeId;

    applyHRVisibility();

    await loadEmployeeProfile(employeeId);
    await loadEmployeeTimeline(employeeId);

    bindRoleChange();
  }

  /* =====================================================
     HR VISIBILITY (NO FLASH, SAFE)
  ===================================================== */
  function applyHRVisibility() {
    let user = null;

    try {
      user = JSON.parse(localStorage.getItem("user"));
    } catch {
      console.warn("Invalid user in localStorage");
    }

    const role = user?.role?.toLowerCase();

    if (!["hr", "admin"].includes(role)) {
      document.querySelectorAll(".hr-only").forEach(el => {
        el.style.display = "none";
      });
    }
  }

  /* =====================================================
     LOAD EMPLOYEE PROFILE
  ===================================================== */
  async function loadEmployeeProfile(employeeId) {
    try {
      const emp = await apiGet(`/employees/${employeeId}`);

      setText("empName", emp.name);
      setText("empEmail", emp.email);
      setText("empDepartment", emp.department);
      setText("empDesignation", emp.designation);
      setText("empStatus", emp.status);

      const currentDesignation = document.getElementById("currentDesignation");
      if (currentDesignation) {
        currentDesignation.value = emp.designation || "—";
      }

    } catch (err) {
      console.error("EMPLOYEE PROFILE LOAD FAILED:", err);
      alert("Unable to load employee profile");
    }
  }

  /* =====================================================
     LOAD EMPLOYEE TIMELINE (FAIL SAFE)
  ===================================================== */
  async function loadEmployeeTimeline(employeeId) {
    const container = document.getElementById("employeeTimeline");
    if (!container) return;

    container.innerHTML = `<span class="muted">Loading timeline…</span>`;

    try {
      const timeline = await apiGet(`/employees/${employeeId}/timeline`);

      if (!Array.isArray(timeline) || timeline.length === 0) {
        container.innerHTML = `<span class="muted">Timeline unavailable</span>`;
        return;
      }

      container.innerHTML = timeline.map(t => `
        <div class="timeline-item">
          <span class="timeline-dot"></span>
          <div>
            <strong>${escapeHtml(t.label)}</strong><br/>
            <small class="muted">${formatDate(t.date)}</small>
          </div>
        </div>
      `).join("");

    } catch (err) {
      console.error("TIMELINE LOAD FAILED:", err);
      container.innerHTML = `<span class="muted">Timeline unavailable</span>`;
    }
  }

  /* =====================================================
     ROLE CHANGE (HR / ADMIN ONLY)
  ===================================================== */
  function bindRoleChange() {
    const btn = document.getElementById("saveRoleBtn");
    const select = document.getElementById("newDesignation");

    if (!btn || !select) return;

    btn.disabled = true;

    select.addEventListener("change", () => {
      btn.disabled = !select.value;
    });

    btn.addEventListener("click", async () => {
      const newDesignation = select.value;
      if (!newDesignation || !selectedEmployeeId) return;

      if (!confirm(`Change designation to "${newDesignation}"?`)) return;

      try {
        await apiPut(
          `/employees/${selectedEmployeeId}/role`,
          { newDesignation }
        );

        alert("Designation updated successfully");

        select.value = "";
        btn.disabled = true;

        await loadEmployeeProfile(selectedEmployeeId);
        await loadEmployeeTimeline(selectedEmployeeId);

      } catch (err) {
        console.error("ROLE UPDATE FAILED:", err);
        alert("Failed to update designation");
      }
    });
  }

  /* =====================================================
     HELPERS
  ===================================================== */
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value ?? "—";
  }

  function formatDate(date) {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function escapeHtml(str = "") {
    return str.replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]);
  }

  /* =====================================================
     EXPOSE INIT FOR ROUTER (SAFE)
  ===================================================== */
  window.initEmployee = initEmployee;
}
