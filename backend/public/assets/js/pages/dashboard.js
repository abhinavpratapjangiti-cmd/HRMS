/* =====================================================
   dashboard.js — FINAL FIX (Waiting for API & HTML)
===================================================== */

(function () {
  // Prevent double loading
  if (window.__dashboardLoaded) return;
  window.__dashboardLoaded = true;

  console.log("📊 dashboard.js loaded");

  /* -----------------------------------------------------
     CRITICAL FIX: Wait for 'api' to be defined
     This prevents "api is not defined" errors.
  ----------------------------------------------------- */
  const waitForApi = setInterval(() => {
    let foundApi = null;

    // Check all common places where 'api' might live
    if (typeof api !== 'undefined') foundApi = api;
    else if (window.api) foundApi = window.api;
    else if (window.app && window.app.api) foundApi = window.app.api;

    if (foundApi) {
      clearInterval(waitForApi);
      console.log("✅ API found. Starting Dashboard logic...");
      startDashboard(foundApi);
    } else {
      console.log("⏳ Waiting for API...");
    }
  }, 100); // Check every 100ms

  // --- MAIN STARTUP LOGIC ---
  function startDashboard(api) {
    let initialized = false;

    // 1. Try to init immediately
    tryInit();

    // 2. Try on navigation changes (for SPA)
    window.addEventListener("hashchange", () => {
      initialized = false;
      tryInit();
    });

    // 3. Watch for HTML to appear (if it loads slowly)
    const observer = new MutationObserver(() => {
      if (!initialized) tryInit();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function tryInit() {
      const home = document.getElementById("homePage");
      if (!home) return; // HTML not ready yet
      if (initialized) return; // Already running

      initialized = true;
      console.log("🚀 HTML detected. initializing widgets...");
      initWidgets(api);
    }
  }

  function initWidgets(api) {
    loadDashboardHome(api);
    loadLeaveBalance(api);
    loadTodayTime(api);

    if (isManager()) {
      document.getElementById("managerDashboard")?.classList.remove("d-none");
      loadManagerStats(api);
    }
  }

  /* ================= HELPERS ================= */
  const $ = (id) => document.getElementById(id);
  const setText = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val;
  };

  function getUser() {
    try { return JSON.parse(localStorage.getItem("user")); } 
    catch { return null; }
  }

  function isManager() {
    return ["manager", "admin", "hr"].includes((getUser()?.role || "").toLowerCase());
  }

  /* ================= 1. HOLIDAY & THOUGHT LOADER ================= */
  function loadDashboardHome(api) {
    console.log("➡️ Fetching /dashboard/home...");

    api.get("/dashboard/home")
      .then((d) => {
        if (!d) return;

        // --- A. Nearest Holiday (Red Card) ---
        if (d.holiday) {
          setText("holidayName", d.holiday.name);
          setText("holidayDate", d.holiday.date_readable);
        } else {
          setText("holidayName", "No Upcoming Holiday");
          setText("holidayDate", "");
        }

        // --- B. Upcoming Holidays List ---
        const ul = $("upcomingHolidays");
        if (ul) {
          if (d.upcoming_holidays && d.upcoming_holidays.length > 0) {
            ul.innerHTML = d.upcoming_holidays
              .map((h) => {
                const dateStr = new Date(h.holiday_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short"
                });
                return `
                  <li class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom border-light">
                    <span>${h.name}</span>
                    <span class="badge bg-light text-dark border">${dateStr}</span>
                  </li>`;
              })
              .join("");
          } else {
            ul.innerHTML = `<li class="text-muted small">No upcoming holidays.</li>`;
          }
        }

        // --- C. Thought of the Day ---
        setText("thoughtText", d.thought?.text || "Have a productive day.");
        if ($("thoughtText")) $("thoughtText").classList.remove("text-muted");
      })
      .catch((err) => {
        console.error("❌ /dashboard/home failed:", err);
        setText("holidayName", "Data Error");
      });
  }

  /* ================= 2. LEAVE BALANCE ================= */
  function loadLeaveBalance(api) {
    const box = $("leaveBalanceBox");
    if (!box) return;

    api.get("/leaves/balance")
      .then((rows) => {
        if (!rows?.length) {
          box.innerHTML = "<div class='text-muted'>No leave data</div>";
          return;
        }
        box.innerHTML = rows.map(l => `
            <div class="col text-center">
              <div class="fw-bold fs-4 text-primary">${l.balance ?? 0}</div>
              <small class="text-muted text-uppercase" style="font-size:0.7rem">${l.leave_type}</small>
            </div>
          `).join("");
      })
      .catch(err => console.error("leave balance failed", err));
  }

/* ================= 3. TIME TODAY ================= */
function loadTodayTime(api) {
  const user = getUser();
  if (!user?.employee_id) return;

  api.get(`/attendance/today`)
    .then((d) => {
      if (!d) {
        setText("workedTime", "00:00");
        setText("breakTime", "00:00");
        return;
      }

      // ✅ Case 1: backend sends seconds
      if (typeof d.worked_seconds === "number") {
        setText("workedTime", toHHMM(d.worked_seconds));
      } 
      // ✅ Case 2: backend sends clock_in / clock_out
      else if (d.clock_in) {
        const clockIn = new Date(d.clock_in);
        const clockOut = d.clock_out ? new Date(d.clock_out) : new Date();

        const workedSeconds = Math.floor(
          (clockOut - clockIn) / 1000
        );

        setText("workedTime", toHHMM(workedSeconds));
      } 
      // ✅ Fallback
      else {
        setText("workedTime", "00:00");
      }

      setText(
        "breakTime",
        toHHMM(d.break_seconds || 0)
      );
    })
    .catch(err => console.error("today time failed", err));
}
  /* ================= 4. MANAGER STATS ================= */
  function loadManagerStats(api) {
    api.get("/attendance/team/summary")
      .then((d) => {
        setText("teamAttendanceCount", `${d.present} / ${d.total}`);
        setText("teamAttendanceMeta", `Present ${d.present} · Leave ${d.on_leave} · Absent ${d.absent}`);
        setText("teamOnLeave", d.on_leave);
      })
      .catch(() => {});
  }

  function toHHMM(sec = 0) {
    const m = Math.floor(sec / 60);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
})();
