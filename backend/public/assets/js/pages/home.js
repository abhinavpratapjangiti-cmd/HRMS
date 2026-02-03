/* =====================================================
   home.js — FINAL, SPA SAFE, LAYOUT ONLY (PATCHED)
   ✅ No API calls
   ✅ No dashboard logic
   ✅ Role-based UI only
===================================================== */

(function () {
  if (window.__homeLoaded) return;
  window.__homeLoaded = true;

  console.log("🏠 home.js loaded");

  /* =====================================================
     ONE-TIME GLOBAL SEARCH
  ===================================================== */
  if (!window.__homeSearchInit) {
    window.__homeSearchInit = true;

    const routes = [
      { key: "attendance", route: "attendance" },
      { key: "timesheet", route: "timesheets" },
      { key: "leave", route: "leaves" },
      { key: "payroll", route: "payroll" },
      { key: "analytics", route: "analytics" },
      { key: "users", route: "manage-users" }
    ];

    const search = document.getElementById("globalSearch");
    if (search) {
      search.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;

        const q = search.value.toLowerCase().trim();
        if (!q) return;

        for (const r of routes) {
          if (q.includes(r.key)) {
            location.hash = "#/" + r.route;
            return;
          }
        }
      });
    }
  }

  /* =====================================================
     ROUTER LIFECYCLE
  ===================================================== */
  document.addEventListener("DOMContentLoaded", tryInit);
  window.addEventListener("route:loaded", tryInit);

  function tryInit() {
    const home = document.getElementById("homePage");
    if (!home) return;
    applyRoleLayout();
  }

  /* =====================================================
     ROLE HELPERS
  ===================================================== */
  function getRole() {
    try {
      return (
        JSON.parse(localStorage.getItem("user"))?.role || ""
      ).toLowerCase();
    } catch {
      return "";
    }
  }

  function isManagerRole(role) {
    return role === "manager" || role === "hr" || role === "admin";
  }

  /* =====================================================
     ROLE → UI MAPPING
  ===================================================== */
  function applyRoleLayout() {
    const role = getRole();
    if (!role) return;

    const managerDashboard = document.getElementById("managerDashboard");
    const inboxCard = document.getElementById("homeInboxCard");
    const leaveCol = document.getElementById("leaveBalanceCol");

    // 🔒 RESET (employee-safe default)
    managerDashboard?.classList.add("d-none");
    inboxCard?.classList.add("d-none");

    if (leaveCol) {
      leaveCol.className = "col-12";
    }

    // 👤 EMPLOYEE
    if (role === "employee") {
      return;
    }

    // 👥 MANAGER / HR / ADMIN
    if (isManagerRole(role)) {
      managerDashboard?.classList.remove("d-none");
      inboxCard?.classList.remove("d-none");

      if (leaveCol) {
        leaveCol.className = "col-md-6";
      }
    }
  }

  /* =====================================================
     VIEW ATTENDANCE BUTTON
  ===================================================== */
  document.addEventListener("click", e => {
    const btn = e.target.closest("#viewAttendanceBtn");
    if (!btn) return;

    e.preventDefault();
    location.hash = "#/attendance";
  });
})();
