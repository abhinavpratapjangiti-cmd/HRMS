/* =====================================================
   attendance.js — FINAL (NO CONTEXT, BE SOURCE OF TRUTH)
===================================================== */

var liveBaseSeconds = 0;
var liveTimerInterval = null;

(function () {
  if (window.__attendanceLoaded) return;
  window.__attendanceLoaded = true;

  var token = localStorage.getItem("token") || "";

  function authHeaders() {
    return { Authorization: "Bearer " + token };
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, txt) {
    var e = el(id);
    if (e) e.innerText = txt;
  }

  function fmtTime(t) {
    if (!t) return "--";
    return new Date(t).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function hhmm(sec) {
    var m = Math.floor(sec / 60);
    return String(Math.floor(m / 60)).padStart(2, "0") +
      ":" + String(m % 60).padStart(2, "0");
  }

  function startTimer() {
    stopTimer();
    liveTimerInterval = setInterval(function () {
      liveBaseSeconds++;
     setText("liveWorkTimer", hhmm(liveBaseSeconds));
    }, 1000);
  }

  function stopTimer() {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
  }

  function toggleButtons(status) {
    var inBtn = el("clockInBtn");
    var outBtn = el("clockOutBtn");
    if (!inBtn || !outBtn) return;

    if (status === "NOT_STARTED") {
      inBtn.style.display = "inline-block";
      outBtn.style.display = "none";
    } else if (status === "WORKING") {
      inBtn.style.display = "none";
      outBtn.style.display = "inline-block";
    } else {
      inBtn.style.display = "none";
      outBtn.style.display = "none";
    }
  }

  function loadToday() {
    fetch("/api/attendance/today", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        stopTimer();
        liveBaseSeconds = d.worked_seconds || 0;

        if (d.status === "HOLIDAY") {
          setText("attendanceStatusText", "Holiday");
          setText("workedTime", "00:00");
          setText("breakTime", "00:00");
          setText("clockInAtText", "--");
          toggleButtons("HOLIDAY");
          return;
        }

        setText(
          "attendanceStatusText",
          d.status === "WORKING" ? "Working" :
          d.status === "CLOCKED_OUT" ? "Completed" :
          "Not started"
        );

        setText("workedTime", hhmm(d.worked_seconds || 0));
        setText("breakTime", hhmm(d.break_seconds || 0));
        setText("clockInAtText", d.clock_in_at ? fmtTime(d.clock_in_at) : "--");

        toggleButtons(d.status);
        if (d.status === "WORKING") startTimer();
      });
  }

  function loadHistory() {
    fetch("/api/attendance", { headers: authHeaders() })
      .then(r => r.json())
      .then(rows => {
        var body = el("attendanceTableBody");
        if (!body) return;

        if (!rows.length) {
          body.innerHTML =
            "<tr><td colspan='4'>No attendance records</td></tr>";
          return;
        }

        body.innerHTML = rows.map(r =>
          `<tr>
            <td>${r.date}</td>
            <td>${r.clock_in ? fmtTime(r.clock_in) : "--"}</td>
            <td>${r.clock_out ? fmtTime(r.clock_out) : "--"}</td>
            <td>${r.hours || "0.00"}</td>
          </tr>`
        ).join("");
      });
  }

function wireButtons() {
  var inBtn = el("clockInBtn");
  var outBtn = el("clockOutBtn");

  if (inBtn) {
    inBtn.onclick = function () {
      if (el("attendanceStatusText")?.innerText === "Holiday") return;
      fetch("/api/attendance/clock-in", {
        method: "POST",
        headers: authHeaders()
      }).then(loadToday);
    };
  }

  if (outBtn) {
    outBtn.onclick = function () {
      if (el("attendanceStatusText")?.innerText === "Holiday") return;
      var p = prompt("Project");
      var t = prompt("Task");
      if (!p || !t) return;

      fetch("/api/attendance/clock-out", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ project: p, task: t })
      }).then(loadToday);
    };
  }
}



  window.onAttendanceRendered = function () {
    wireButtons();
    loadToday();
    loadHistory();
  };
})();

(function () {
  function routeEnter() {
    if (location.hash === "#/attendance") {
      setTimeout(() => window.onAttendanceRendered(), 50);
    }
  }
  routeEnter();
  window.addEventListener("hashchange", routeEnter);
})();
