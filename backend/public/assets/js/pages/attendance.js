/* =====================================================
   attendance.js — FINAL, SPA-SAFE, HOME-SAFE
   - Runs ONLY when attendance page exists
   - No crashes on Home / Dashboard
   - Backend contract aligned
   - FIXED: History table now shows HH:MM format
===================================================== */

(function () {
  if (window.__attendanceLoaded) return;
  window.__attendanceLoaded = true;

  let timer = null;
  let baseSeconds = 0;
  let bound = false;

  /* ================= DOM HELPER ================= */
  const $ = id => document.getElementById(id);

  /* ================= AUTH HEADERS ================= */
  function authHeaders() {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  }

  /* ================= SPA SAFE INIT ================= */
  const observer = new MutationObserver(checkAndInit);
  observer.observe(document.body, { childList: true, subtree: true });
  checkAndInit();

  window.addEventListener("hashchange", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    bound = false;
  });

  function checkAndInit() {
    const page = $("attendancePage");
    if (!page || bound) return;
    bound = true;
    initAttendance();
  }

  function initAttendance() {
    bindButtons();
    loadTodayAttendance();
    loadAttendanceHistory();
  }

  /* ================= EMPLOYEE ID ================= */
  function getEmployeeId() {
    const user =
      JSON.parse(localStorage.getItem("user")) ||
      JSON.parse(localStorage.getItem("authUser"));

    if (user?.employee_id) return user.employee_id;
    if (user?.id) return user.id;

    const token = localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return payload.employee_id || payload.id;
      } catch {}
    }
    return null;
  }

  /* ================= LOAD TODAY ================= */
  async function loadTodayAttendance() {
    if (!$("attendancePage")) return;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    const res = await fetch(`/api/attendance/today`, {
      headers: authHeaders()
    });

    if (!res.ok) return;

    const data = await res.json();

    if (data.status === "NOT_STARTED") {
      setStatus("NOT STARTED");
      resetUI();
      showClockIn();
      hideLiveTimer();
      return;
    }

    // Accepts seconds directly from backend for precision
    baseSeconds = Number(data.worked_seconds || 0);

    updateWorked(baseSeconds);
    updateClockIn(data.clock_in);
    setStatus(data.status);

    if (data.status === "WORKING") {
      showClockOut();
      showLiveTimer();
      startTimer();
    } else {
      hideActions();
      hideLiveTimer();
    }
  }

  /* ================= ATTENDANCE HISTORY ================= */
  async function loadAttendanceHistory() {
    const tbody = $("attendanceTableBody");
    if (!tbody) return;

    const empId = getEmployeeId();
    if (!empId) return;

    const res = await fetch(`/api/attendance/history/${empId}`, {
      headers: authHeaders()
    });

    if (!res.ok) {
      tbody.innerHTML =
        `<tr><td colspan="4" class="text-center">Failed to load</td></tr>`;
      return;
    }

    const rows = await res.json();
    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML =
        `<tr><td colspan="4" class="text-center">No records</td></tr>`;
      return;
    }

    rows.forEach(r => {
      // 🔥 FIX: Convert work_minutes to seconds and use hhmm() formatter
      // This changes "0.95" decimal hours into "00:57" format
      const workSeconds = (Number(r.work_minutes) || 0) * 60;
      const hoursFormatted = hhmm(workSeconds);

      tbody.innerHTML += `
      <tr>
        <td>${formatDate(r.log_date)}</td>
        <td>${formatTime(r.clock_in)}</td>
        <td>${formatTime(r.clock_out)}</td>
        <td>${hoursFormatted}</td>
      </tr>
    `;
    });
  }


  /* ================= UI (DEFENSIVE) ================= */
  function setStatus(text) {
    const el = $("attendanceStatusText");
    if (el) el.innerText = text;
  }

  function updateWorked(sec) {
    const wt = $("workedTime");
    const live = $("liveWorkTimer");

    if (wt) wt.innerText = hhmm(sec);
    if (live) live.innerText = hhmmss(sec);
  }

  function updateClockIn(dt) {
    const el = $("clockInAtText");
    if (el) el.innerText = formatTime(dt);
  }

  function resetUI() {
    updateWorked(0);
    const bt = $("breakTime");
    if (bt) bt.innerText = "00:00";
    const ci = $("clockInAtText");
    if (ci) ci.innerText = "--";
  }

  function showClockIn() {
    const inBtn = $("clockInBtn");
    const outBtn = $("clockOutBtn");
    const form = $("clockOutForm");
    if (inBtn) inBtn.style.display = "inline-block";
    if (outBtn) outBtn.style.display = "none";
    if (form) form.classList.add("d-none");
  }

  function showClockOut() {
    const inBtn = $("clockInBtn");
    const outBtn = $("clockOutBtn");
    if (inBtn) inBtn.style.display = "none";
    if (outBtn) outBtn.style.display = "inline-block";
  }

  function hideActions() {
    const inBtn = $("clockInBtn");
    const outBtn = $("clockOutBtn");
    const form = $("clockOutForm");
    if (inBtn) inBtn.style.display = "none";
    if (outBtn) outBtn.style.display = "none";
    if (form) form.classList.add("d-none");
  }

  function showLiveTimer() {
    const el = $("liveWorkTimer");
    if (el) el.style.display = "block";
  }

  function hideLiveTimer() {
    const el = $("liveWorkTimer");
    if (el) el.style.display = "none";
  }

  /* ================= TIMER ================= */
  function startTimer() {
    if (timer) clearInterval(timer);

    timer = setInterval(() => {
      baseSeconds++;
      updateWorked(baseSeconds);
    }, 1000);
  }

  /* ================= FORMATTERS ================= */
  function hhmm(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function hhmmss(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  }

  function formatTime(ts) {
    if (!ts) return "--";
    const d = new Date(ts);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDate(d) {
    if (!d) return "--";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  /* ================= BUTTONS ================= */
  function bindButtons() {
    const inBtn = $("clockInBtn");
    const outBtn = $("clockOutBtn");
    const confirmBtn = $("confirmClockOutBtn");

    if (inBtn) inBtn.onclick = clockIn;
    if (outBtn)
      outBtn.onclick = () =>
      $("clockOutForm")?.classList.remove("d-none");
    if (confirmBtn) confirmBtn.onclick = confirmClockOut;
  }

  async function clockIn() {
    const empId = getEmployeeId();
    if (!empId) return;

    const res = await fetch("/api/attendance/clock-in", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        employee_id: empId
      })
    });

    if (res.ok) {
      loadTodayAttendance();
      loadAttendanceHistory();
    }
  }

  async function confirmClockOut() {
    const empId = getEmployeeId();
    const pInput = $("projectInput");
    const tInput = $("taskInput");

    if (!empId) return;

    const res = await fetch("/api/attendance/clock-out", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        employee_id: empId,
        project: pInput ? pInput.value : "",
        task: tInput ? tInput.value : ""
      })
    });

    if (res.ok) {
      loadTodayAttendance();
      loadAttendanceHistory();
    }
  }
})();
