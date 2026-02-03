/* =====================================================
   HOME.JS — FINAL, STABLE, SPA-SAFE (ES5)
   FIXED: wiring + layout hooks ONLY
   ❌ NO LOGIC REMOVED
===================================================== */
(function () {

  console.log("🏠 home.js loaded");

  /* =====================================================
     1️⃣ ONE-TIME GLOBAL SEARCH SETUP (UNCHANGED)
  ===================================================== */
  if (!window.__homeSearchInit) {
    window.__homeSearchInit = true;

    var routes = [
      { key: "attendance", route: "attendance" },
      { key: "timesheet", route: "timesheets" },
      { key: "leave", route: "leaves" },
      { key: "payroll", route: "payroll" },
      { key: "analytics", route: "analytics" },
      { key: "users", route: "manage-users" }
    ];

    var search = document.getElementById("globalSearch");
    if (search) {
      search.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;

        var q = search.value.toLowerCase().trim();
        if (!q) return;

        for (var i = 0; i < routes.length; i++) {
          if (q.indexOf(routes[i].key) !== -1) {
            window.location.hash = "#/" + routes[i].route;
            return;
          }
        }
      });
    }
  }

  /* =====================================================
     2️⃣ UTILITIES (UNCHANGED)
  ===================================================== */
  function getToken() {
    return localStorage.getItem("token");
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch (e) {
      return null;
    }
  }

  function toHHMM(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "--";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /* =====================================================
     3️⃣ ATTENDANCE CARD (UNCHANGED)
  ===================================================== */
  function loadHomeAttendance() {
    var token = getToken();
    if (!token) return;

    var workedEl = document.getElementById("workedTime");
    var breakEl = document.getElementById("breakTime");
    var sinceEl = document.getElementById("loggedInSince");

    if (!workedEl || !breakEl) return;

    fetch("/api/attendance/today", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d) return;

        workedEl.innerText = toHHMM(d.worked_seconds);
        breakEl.innerText = toHHMM(d.break_seconds);

        if (sinceEl && d.clock_in_at) {
          sinceEl.classList.remove("d-none");
          sinceEl.innerText = "Logged in since " + formatTime(d.clock_in_at);
        }
      })
      .catch(function (e) {
        console.warn("Home attendance failed", e);
      });
  }

  /* =====================================================
     4️⃣ TODAY HOLIDAY CARD 
  ===================================================== */
  function loadTodayHolidayCard() {
    var title = document.getElementById("holidayText");
    var dateEl = document.getElementById("holidayDate");

    if (!title) return;

    var token = getToken();
    if (!token) {
      title.innerText = "—";
      return;
    }

    fetch("/api/holiday/today", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (d && d.isHoliday) {
          title.innerText = d.name;
          if (dateEl) dateEl.innerText = d.description || "";
        } else {
          title.innerText = "No holiday today 🎯";
          if (dateEl) dateEl.innerText = "";
        }
      })
      .catch(function () {
        title.innerText = "Holiday unavailable";
      });
  }

  /* =====================================================
     5️⃣ HOME INBOX + LAYOUT
  ===================================================== */
  function refreshHomeInbox() {
    var user = getUser();
    if (!user || !user.role) return;

    var role = String(user.role).toUpperCase();

    var inbox = document.getElementById("homeInboxCard");
    var leaveCol = document.getElementById("leaveBalanceCol");

    // SAME ROLE RULE — EMPLOYEE HAS NO INBOX
    if (role === "EMPLOYEE") {
      if (inbox) inbox.classList.add("d-none");
      if (leaveCol) {
        leaveCol.classList.remove("col-md-6");
        leaveCol.classList.add("col-12");
      }
    } else {
      if (inbox) inbox.classList.remove("d-none");
      if (leaveCol) {
        leaveCol.classList.remove("col-12");
        leaveCol.classList.add("col-md-6");
      }

      if (typeof window.loadInbox === "function") {
        window.loadInbox(); 
      }
    }

    // Notifications ALWAYS load 
    if (typeof window.loadNotifications === "function") {
      window.loadNotifications();
    }
  }

  /* =====================================================
     6️⃣ VIEW ATTENDANCE BUTTON
  ===================================================== */
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.id === "viewAttendanceBtn") {
        e.preventDefault();
        window.location.hash = "#/attendance";
        return;
      }
      el = el.parentNode;
    }
  });

  /* =====================================================
     7️⃣ HOME INITIALIZER
  ===================================================== */
  var __homeInitInProgress = false;

  function initHome() {
    if (__homeInitInProgress) return false;
    __homeInitInProgress = true;

    var home = document.getElementById("homePage");
    if (!home) {
      __homeInitInProgress = false;
      return false;
    }

    loadHomeAttendance();
    loadTodayHolidayCard();
    refreshHomeInbox();

    setTimeout(function () {
      __homeInitInProgress = false;
    }, 300);

    return true;
  }

  function waitForHomeDom() {
    if (initHome()) return;

    var observer = new MutationObserver(function () {
      if (initHome()) observer.disconnect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /* =====================================================
     8️⃣ SPA ROUTE HANDLING
  ===================================================== */
  function onRouteChange() {
    if (
      location.hash === "#/home" ||
      location.hash === "" ||
      location.hash === "#"
    ) {
      waitForHomeDom();
    }
  }

  onRouteChange();
  window.addEventListener("hashchange", onRouteChange);

  window.addEventListener("route:loaded", function (e) {
    if (e.detail.route === "home") {
      setTimeout(function () {
        loadHomeAttendance();
        loadTodayHolidayCard();
        refreshHomeInbox();
      }, 100);
    }
  });

})();
