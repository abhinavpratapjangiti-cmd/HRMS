/* =====================================================
   attendance.js — SPA BULLETPROOFED (FINAL FIX)
===================================================== */

(function () {
  console.log("⏱️ Attendance Module Loaded");

  // --- STATE ---
  let serverClockInTime = null;   // Date Object
  let serverBreakStartTime = null;// Date Object
  let totalHistoricalBreakSeconds = 0;
  window.isClockingOut = false;

  const OFFICE_TIMEZONE = "Asia/Kolkata";
  const $ = (id) => document.getElementById(id);

  // 🔔 Attendance Action Sound
  const attendanceSound = new Audio('/assets/sounds/notification.mp3');

  function playAttendanceSound() {
    attendanceSound.currentTime = 0;
    attendanceSound.play().catch(err => console.log("Sound blocked:", err));
  }

  // --- HELPER: Get GPS (Optional) ---
  function getUserLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve({ lat: null, lng: null }); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
            console.warn("GPS Error:", err.message);
            resolve({ lat: null, lng: null });
        },
        { timeout: 5000 }
      );
    });
  }

  // --- HELPER: Format Seconds -> HH:MM:SS (Live Timer) ---
  function formatDuration(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  // --- HELPER: Format Minutes -> "2h 4m" (History Table) ---
  function formatHoursMins(totalMinutes) {
    if (!totalMinutes || isNaN(totalMinutes)) return "0m";
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // --- HELPER: Format 12-hour Time (09:30 AM) ---
  function formatClockTime(isoString) {
    if (!isoString) return "--:--";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "--:--";
    return date.toLocaleTimeString("en-IN", {
        timeZone: OFFICE_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true
    });
  }

  // --- HELPER: Format Date (12/02/2026) ---
  function formatDate(isoString) {
      if (!isoString) return "--";
      return new Date(isoString).toLocaleDateString('en-IN', {
          timeZone: OFFICE_TIMEZONE, day: 'numeric', month: 'numeric', year: 'numeric'
      });
  }

  /* ================= INIT (ANTI-FLASH & BULLETPROOF) ================= */
  window.initAttendance = function() {
    // 🚀 FIX: The "Anti-Flash" Lock!
    // If multiple listeners try to load the page at once, this ignores the duplicates.
    if (window.__isAttendanceInitializing) return;
    window.__isAttendanceInitializing = true;

    setTimeout(() => {
        window.__isAttendanceInitializing = false;

        if (!$("attendancePage")) {
            setTimeout(window.initAttendance, 50);
            return;
        }

        console.log("🚀 Starting Attendance System...");

        if($("currentDateDisplay")) {
            $("currentDateDisplay").innerText = new Date().toLocaleDateString('en-IN', {
                timeZone: OFFICE_TIMEZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        setupButtons();
        fetchStatus();
        fetchHistory();
    }, 50); // 50ms wait ensures DOM is perfectly injected before running
  };

  /* ================= LIVE TIMER ENGINE ================= */
  function startLiveTimer(status) {
    stopLiveTimer();
    updateTimerDisplay(status);

    window.attendanceTimerInterval = setInterval(() => {
      updateTimerDisplay(status);
    }, 1000);
  }

  function updateTimerDisplay(status) {
      const now = new Date();

      let currentBreakSessionSeconds = 0;
      if (status === "ON_BREAK" && serverBreakStartTime) {
        currentBreakSessionSeconds = Math.floor((now - serverBreakStartTime) / 1000);
      }
      const totalBreakNow = totalHistoricalBreakSeconds + currentBreakSessionSeconds;
      if ($("breakTime")) $("breakTime").innerText = formatDuration(totalBreakNow);

      if (serverClockInTime) {
        const totalElapsedSeconds = Math.floor((now - serverClockInTime) / 1000);
        const netWorkSeconds = Math.max(0, totalElapsedSeconds - totalBreakNow);

        if ($("workedTime")) $("workedTime").innerText = formatDuration(netWorkSeconds);
        if ($("liveTimerDisplay")) $("liveTimerDisplay").innerText = formatDuration(netWorkSeconds);
      }
  }

  function stopLiveTimer() {
      if (window.attendanceTimerInterval) {
          clearInterval(window.attendanceTimerInterval);
          window.attendanceTimerInterval = null;
      }
  }

  /* ================= API ACTIONS ================= */
  async function fetchStatus() {
    if (window.isClockingOut) return;

    if ($("attendanceStatusText") && !window.attendanceTimerInterval) {
        $("attendanceStatusText").innerText = "Loading status...";
    }

    try {
      const res = await window.apiGet("/attendance/today");
      if(!res) return;
      const data = res;

      serverClockInTime = data.clock_in ? new Date(data.clock_in) : null;
      serverBreakStartTime = data.break_start ? new Date(data.break_start) : null;
      totalHistoricalBreakSeconds = Number(data.total_break_seconds) || 0;

      if ($("clockInAtText")) $("clockInAtText").innerText = formatClockTime(data.clock_in);
      updateUIState(data.status);

      if (data.status === "WORKING" || data.status === "ON_BREAK") {
        startLiveTimer(data.status);
      } else {
        stopLiveTimer();
        if(data.status === "COMPLETED") {
             if ($("workedTime")) $("workedTime").innerText = formatDuration(data.worked_seconds);
             if ($("breakTime")) $("breakTime").innerText = formatDuration(data.break_seconds);
             if ($("liveTimerDisplay")) $("liveTimerDisplay").innerText = formatDuration(data.worked_seconds);
        }
      }
    } catch (err) { console.error(err); }
  }

  async function doAction(endpoint, body = {}) {
    const btn = document.querySelector("button:not(.d-none):not(#confirmClockOutBtn)");
    if(btn) btn.disabled = true;

    const confirmBtn = $("confirmClockOutBtn");
    if(endpoint.includes("clock-out") && confirmBtn) {
        confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';
        confirmBtn.disabled = true;
    }

    try {
      const data = await window.apiPost(endpoint.replace("/api/", "/"), body);

      window.isClockingOut = false;
      playAttendanceSound();
      fetchStatus();
      fetchHistory();
      if($("taskInput")) $("taskInput").value = "";
      if($("projectInput")) $("projectInput").value = "";

    } catch(e) {
        alert(e.message || "Network Error");
    } finally {
        if(btn) btn.disabled = false;
        if(endpoint.includes("clock-out") && confirmBtn) {
            confirmBtn.innerHTML = "Confirm & Submit Timesheet";
            confirmBtn.disabled = false;
        }
    }
  }

  /* ================= UI STATE ================= */
  function updateUIState(status) {
    if (window.isClockingOut) return;

    ["clockInBtn", "clockOutBtn", "takeBreakBtn", "resumeWorkBtn", "clockOutForm"].forEach(id => {
       if($(id)) $(id).classList.add("d-none");
    });

    const statusTxt = $("attendanceStatusText");
    const indicator = $("statusIndicator");
    const timerLabel = $("timerLabel");

    if (status === "NOT_STARTED") {
      if($("clockInBtn")) $("clockInBtn").classList.remove("d-none");
      if(statusTxt) statusTxt.innerText = "Not Started";
      if(indicator) indicator.className = "badge bg-secondary rounded-pill me-2";
      if(timerLabel) timerLabel.innerText = "Ready to start?";
    } else if (status === "WORKING") {
      if($("clockOutBtn")) $("clockOutBtn").classList.remove("d-none");
      if($("takeBreakBtn")) $("takeBreakBtn").classList.remove("d-none");
      if(statusTxt) statusTxt.innerText = "Working";
      if(indicator) indicator.className = "badge bg-success rounded-pill me-2";
      if(timerLabel) timerLabel.innerText = "You are currently working";
    } else if (status === "ON_BREAK") {
      if($("resumeWorkBtn")) $("resumeWorkBtn").classList.remove("d-none");
      if(statusTxt) statusTxt.innerText = "On Break";
      if(indicator) indicator.className = "badge bg-warning rounded-pill me-2";
      if(timerLabel) timerLabel.innerText = "Enjoy your break! ☕";
    } else if (status === "COMPLETED") {
       if(statusTxt) statusTxt.innerText = "Day Completed";
       if(indicator) indicator.className = "badge bg-primary rounded-pill me-2";
       if(timerLabel) timerLabel.innerText = "Good job today!";
    }
  }

  /* ================= BUTTONS ================= */
  function setupButtons() {
    if($("clockInBtn")) $("clockInBtn").onclick = async () => {
        const btn = $("clockInBtn");
        btn.innerHTML = "Locating...";
        const loc = await getUserLocation();
        btn.innerHTML = '<i class="bi bi-play-fill me-2"></i> Clock In';
        doAction("/api/attendance/clock-in", { latitude: loc.lat, longitude: loc.lng });
    };

    if($("takeBreakBtn")) $("takeBreakBtn").onclick = () => doAction("/api/attendance/take-break");
    if($("resumeWorkBtn")) $("resumeWorkBtn").onclick = () => doAction("/api/attendance/end-break");

    if($("clockOutBtn")) $("clockOutBtn").onclick = () => {
       window.isClockingOut = true;
       ["clockInBtn", "takeBreakBtn", "resumeWorkBtn", "clockOutBtn"].forEach(id => {
           if($(id)) $(id).classList.add("d-none");
       });

       const form = $("clockOutForm");
       if(form) {
           form.classList.remove("d-none");
           form.classList.add("animate__animated", "animate__fadeIn");
       }
       if($("projectInput")) $("projectInput").focus();
    };

    if($("confirmClockOutBtn")) $("confirmClockOutBtn").onclick = () => {
       const project = $("projectInput") ? $("projectInput").value.trim() : "";
       const task = $("taskInput") ? $("taskInput").value.trim() : "";

       if(!project || !task) {
          alert("Mandatory: Please enter BOTH Project Name and Task Summary.");
          return;
       }
       doAction("/api/attendance/clock-out", { project: project, task: task });
    };

    if($("cancelClockOutBtn")) $("cancelClockOutBtn").onclick = () => {
        window.isClockingOut = false;
        fetchStatus();
    };
  }

  /* ================= HISTORY ================= */
  async function fetchHistory() {
    const tbody = $("attendanceTableBody");
    if(!tbody) return;

    tbody.innerHTML = `<tr><td colspan='6' class='text-center py-4 text-muted'>
        <span class='spinner-border spinner-border-sm me-2'></span> Fetching history...
    </td></tr>`;

    try {
      const rows = await window.apiGet("/attendance/history/me");
      if(!rows || !rows.length) {
          tbody.innerHTML = "<tr><td colspan='6' class='text-center py-4 text-muted'>No history found</td></tr>";
          return;
      }

      tbody.innerHTML = rows.map(r => {
        const wM = Number(r.total_work_minutes) || 0;
        const bM = Number(r.total_break_minutes) || 0;
        const workStr = formatHoursMins(wM);
        const breakStr = formatHoursMins(bM);

        let badge = '<span class="badge bg-secondary">Absent</span>';
        if(r.status === 'COMPLETED' || r.status === 'Present') badge = '<span class="badge bg-success">Present</span>';
        else if (r.status === 'Half Day') badge = '<span class="badge bg-warning text-dark">Half Day</span>';
        else if (r.status === 'Working') badge = '<span class="badge bg-info text-dark">Live</span>';

        return `<tr>
            <td class="ps-4 fw-bold text-dark">${formatDate(r.log_date)}</td>
            <td>${formatClockTime(r.clock_in)}</td>
            <td>${formatClockTime(r.clock_out)}</td>
            <td>${breakStr}</td> <td class="text-primary fw-bold">${workStr}</td> <td>${badge}</td>
          </tr>`;
      }).join("");
    } catch(e) {
        tbody.innerHTML = "<tr><td colspan='6' class='text-center py-4 text-danger'>Failed to load history</td></tr>";
    }
  }

  /* ================= SPA LISTENERS ================= */
  
  // 🚀 FIX: We MUST manually trigger init here because router.js legacy hooks are unreliable
  window.initAttendance(); 

  if (!window.__attendanceListenerAttached) {
      window.__attendanceListenerAttached = true;

      window.addEventListener("hashchange", () => {
          if (window.location.hash === "#/attendance") {
              window.initAttendance();
          } else {
              stopLiveTimer();
          }
      });

      document.addEventListener("hrms:data-changed", () => {
          if (window.location.hash === "#/attendance") {
              fetchStatus();
              fetchHistory();
          }
      });
  }

})();
