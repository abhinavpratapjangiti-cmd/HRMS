/* =====================================================
   dashboard.js — FINAL, SPA-SAFE, BACKEND-ALIGNED (REFACTORED)
===================================================== */

(function () {
  if (window.__dashboardLoaded) return;
  window.__dashboardLoaded = true;

  console.log("dashboard.js loaded");
  setTimeout(initDashboard, 0);
})();

/* ================= INIT ================= */
function initDashboard() {
  resetHolidayCard();
  loadHoliday();
  loadUpcomingHolidays();
  loadThoughtOfTheDay();
  loadLeaveBalance();
  loadTodayTime();
  applyRoleBasedDashboards();

  if (window.refreshAttendanceToday) {
    window.refreshAttendanceToday();
  }
}

/* ================= AUTH / API ================= */
function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: "Bearer " + token } : {};
}

function apiGet(url) {
  return fetch(url, { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : null));
}

/* ================= ROLE ================= */
function getUserRole() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  return (user.role || "").toLowerCase();
}

function isManager() {
  return ["manager", "admin", "hr"].includes(getUserRole());
}

/* ================= DOM HELPERS ================= */
function qs(id) {
  return document.getElementById(id);
}

function setText(id, val) {
  const el = qs(id);
  if (el) el.innerText = val;
}

/* ================= HOLIDAY ================= */
function resetHolidayCard() {
  const card = qs("holidayCard");
  if (card) card.classList.add("d-none");
  setText("holidayText", "");
  setText("holidayDate", "");
}

function loadHoliday() {
  const card = qs("holidayCard");
  if (!card) return;

  apiGet("/api/holiday/nearest")
    .then(res => {
      if (!res || !res.name) {
        card.classList.add("d-none");
        return;
      }

      card.classList.remove("d-none");
      setText("holidayText", res.name);
      setText(
        "holidayDate",
        res.date_readable || formatDate(res.holiday_date)
      );
    })
    .catch(() => card.classList.add("d-none"));
}

function loadUpcomingHolidays() {
  const list = qs("upcomingHolidays");
  if (!list) return;

  list.innerHTML = "<li class='text-muted'>Loading...</li>";

  apiGet("/api/holiday")
    .then(data => {
      if (!data || !data.length) {
        list.innerHTML = "<li class='text-muted'>No upcoming holidays</li>";
        return;
      }

      list.innerHTML = data
        .map(h => `<li>${formatDate(h.holiday_date)} - ${h.name}</li>`)
        .join("");
    })
    .catch(() => {
      list.innerHTML = "<li class='text-danger'>Failed to load holidays</li>";
    });
}

/* ================= THOUGHT ================= */
function loadThoughtOfTheDay() {
  const el = qs("thoughtText");
  if (!el) return;

  apiGet("/api/thought/today")
    .then(d => {
      el.innerText =
        (d && (d.text || d.thought)) ||
        "Have a focused and productive day.";
    })
    .catch(() => {
      el.innerText = "Have a focused and productive day.";
    });
}

/* ================= LEAVE BALANCE ================= */
function loadLeaveBalance() {
  const box = qs("leaveBalanceBox");
  if (!box) return;

  const LABELS = {
    CL: "Casual Leave",
    SL: "Sick Leave",
    CO: "Comp Off",
    PL: "Paid Leave",
    LOP: "Loss of Pay"
  };

  apiGet("/api/leaves/balance")
    .then(data => {
      if (!data || !data.length) {
        box.innerHTML =
          "<div class='text-muted text-center'>No leave data</div>";
        return;
      }

      box.innerHTML = data.map(lt => {
        const code = (lt.leave_type || "").toUpperCase();
        const label = LABELS[code] || "Leave";
        const total = Number(lt.annual_quota || 0);
        const used = Number(lt.used || 0);
        const balance =
          lt.balance != null ? Number(lt.balance) : Math.max(total - used, 0);

        return `
          <div class="col text-center">
            <div class="fw-bold fs-4">${balance}</div>
            <small class="text-muted d-block">${label}</small>
            <small class="text-muted">Used: ${used} / ${total}</small>
          </div>`;
      }).join("");
    });
}

/* ================= TODAY TIME ================= */
function loadTodayTime() {
  apiGet("/api/attendance/today")
    .then(d => {
      if (!d) return;
      setText("workedTime", secondsToHHMM(d.worked_seconds || 0));
      setText("breakTime", secondsToHHMM(d.break_seconds || 0));
    });
}

/* ================= TEAM (MANAGER) ================= */
function loadTeamAttendanceSummary() {
  if (!isManager()) return;

  apiGet("/api/attendance/team/summary")
    .then(d => {
      if (!d) return;

      setText("teamAttendanceCount", `${d.present} / ${d.total}`);
      setText(
        "teamAttendanceMeta",
        `Present: ${d.present} · On Leave: ${d.on_leave} · Absent: ${d.absent}`
      );
      setText("teamOnLeave", d.on_leave);
    });
}

function bindTeamAttendanceClick() {
  const card = qs("teamAttendanceCard");
  if (!card || card.dataset.bound || !isManager()) return;

  card.dataset.bound = "true";
  card.addEventListener("click", () => openTeamAttendanceModal());
}

function openTeamAttendanceModal(filter) {
  const modal = qs("teamAttendanceModal");
  const tbody = qs("teamAttendanceTable");
  if (!modal || !tbody || !isManager()) return;

  tbody.innerHTML =
    "<tr><td colspan='4' class='text-center text-muted'>Loading…</td></tr>";

  apiGet("/api/attendance/team/today/details")
    .then(rows => {
      if (!rows || !rows.length) {
        tbody.innerHTML =
          "<tr><td colspan='4' class='text-center text-muted'>No data</td></tr>";
        return;
      }

      if (filter) rows = rows.filter(r => r.status === filter);

      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.employee_name}</td>
          <td>${r.status}</td>
          <td>${r.clock_in ? formatTime(r.clock_in) : "—"}</td>
          <td>${r.clock_out ? formatTime(r.clock_out) : "—"}</td>
        </tr>
      `).join("");
    });

  new bootstrap.Modal(modal).show();
}

/* ================= MANAGER HOME ================= */
function loadManagerHomeStats() {
  if (!isManager()) return;

  loadTeamAttendanceSummary();

  apiGet("/api/leaves/pending/my-team")
    .then(r => setText("pendingLeavesCount", r?.count || 0));

  apiGet("/api/timesheets/pending/my-team")
    .then(r => setText("pendingTimesheetsCount", r?.count || 0));

  apiGet("/api/leaves/team/on-leave")
    .then(r => setText("teamOnLeave", r?.count || 0));
}

function applyRoleBasedDashboards() {
  if (!isManager()) return;

  const dash = qs("managerDashboard");
  if (dash) {
    dash.classList.remove("d-none");
    loadManagerHomeStats();
    bindTeamAttendanceClick();
  }

  const inbox = qs("homeInboxCard");
  if (inbox) inbox.classList.remove("d-none");
}

/* ================= UTIL ================= */
function formatDate(d) {
  const dt = new Date(d);
  return isNaN(dt)
    ? ""
    : dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function secondsToHHMM(sec) {
  const m = Math.floor((sec || 0) / 60);
  return (
    String(Math.floor(m / 60)).padStart(2, "0") +
    ":" +
    String(m % 60).padStart(2, "0")
  );
}

/* ================= SPA LIFECYCLE ================= */
window.onHomeRendered = initDashboard;

/* =====================================================
   END dashboard.js
===================================================== */
