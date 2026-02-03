/* ======================================================
   notifications.js — FINAL, REALTIME + POLLING (FIXED)
   BOOTSTRAP-SAFE, SPA-SAFE (ES5)
====================================================== */

console.log("notifications.js loaded");

(function () {
  if (window.__notificationsInitialized) return;
  window.__notificationsInitialized = true;

  var pollTimer = null;

  /* ================= NOTIFICATION SOUND ================= */
  var notificationSound = new Audio("/assets/sounds/notification.mp3");
  notificationSound.volume = 0.6;

  var audioUnlocked = false;
  var lastSoundAt = 0;

  function unlockNotificationAudio() {
    if (audioUnlocked) return;

    notificationSound.play()
      .then(function () {
        notificationSound.pause();
        notificationSound.currentTime = 0;
        audioUnlocked = true;
        console.log("🔊 Notification sound unlocked");
      })
      .catch(function () {});
  }

  // Browser autoplay requirement
  document.addEventListener("click", unlockNotificationAudio, { once: true });
  document.addEventListener("keydown", unlockNotificationAudio, { once: true });

  function playNotificationSound() {
    if (!audioUnlocked) return;

    var now = Date.now();
    if (now - lastSoundAt < 1500) return; // anti-spam
    lastSoundAt = now;

    notificationSound.currentTime = 0;
    notificationSound.play().catch(function () {});
  }

  /* ================= AUTH HEADERS ================= */
  function authHeaders() {
    var token = localStorage.getItem("token");
    return token ? { Authorization: "Bearer " + token } : {};
  }

  /* ================= HELPERS ================= */
  function $(id) {
    return document.getElementById(id);
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return isNaN(d.getTime()) ? "--" : d.toLocaleString();
  }

  /* ================= BOOTSTRAP DROPDOWN CONTROL ================= */
  function closeNotificationDropdown() {
    if (!window.bootstrap) return;

    var toggle = document.querySelector(
      ".dropdown > [data-bs-toggle='dropdown']"
    );
    if (!toggle) return;

    var instance = bootstrap.Dropdown.getInstance(toggle);
    if (instance && toggle.getAttribute("aria-expanded") === "true") {
      instance.hide();
    }
  }

  /* ======================================================
     LOAD NOTIFICATIONS (UNREAD ONLY) — API (RECOVERY)
  ====================================================== */
  function loadNotifications() {
    fetch("/api/notifications", { headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error("Notification API failed");
        return r.json();
      })
      .then(renderNotifications)
      .catch(function (err) {
        console.error("Notifications load failed:", err);
      });
  }

  function renderNotifications(list) {
    var box = $("notificationList");
    var badge = $("notificationBadge");

    if (!box || !badge) return;

    if (!Array.isArray(list) || list.length === 0) {
      box.innerHTML =
        "<small class='text-muted'>No notifications</small>";
      badge.innerText = "0";
      badge.classList.add("d-none");
      return;
    }

    badge.innerText = list.length;
    badge.classList.remove("d-none");

    var html = "";
    for (var i = 0; i < list.length; i++) {
      var n = list[i];

      html +=
        "<div class='notification-item unread' data-id='" + n.id + "'>" +
          "<div class='fw-semibold'>" +
            String(n.type || "notification").toUpperCase() +
          "</div>" +
          "<div>" + n.message + "</div>" +
          "<div class='d-flex justify-content-between align-items-center mt-1'>" +
            "<small class='text-muted'>" +
              formatDate(n.created_at) +
            "</small>" +
            "<button class='btn btn-link p-0 small mark-read' data-id='" +
              n.id +
            "'>Mark as read</button>" +
          "</div>" +
        "</div>";
    }

    box.innerHTML = html;
  }

  /* ======================================================
     🔔 REALTIME EVENTS (CORRECT FIX)
  ====================================================== */
  function initNotificationEvents() {
    if (window.__notificationEventAttached) return;
    window.__notificationEventAttached = true;

    console.log("🔔 Notification event listener attached");

    window.addEventListener("ws:message", function (e) {
      try {
        var payload = JSON.parse(e.detail);

        // New backend format
        if (payload.event === "notification" && payload.data) {
          injectLiveNotification(payload.data);
          return;
        }

        // Legacy format
        if (payload.type === "NOTIFICATION") {
          injectLiveNotification(payload);
        }
      } catch (err) {
        console.error("Notification event parse failed:", err);
      }
    });
  }

  function injectLiveNotification(n) {
    playNotificationSound(); // 🔔 SOUND (only addition)

    var box = $("notificationList");
    var badge = $("notificationBadge");

    if (!box || !badge) return;

    // Remove empty state
    if (
      box.children.length === 1 &&
      box.children[0].classList.contains("text-muted")
    ) {
      box.innerHTML = "";
    }

    var div = document.createElement("div");
    div.className = "notification-item unread";
    div.setAttribute("data-id", n.id || "");

    div.innerHTML =
      "<div class='fw-semibold'>" +
        String(n.type || "notification").toUpperCase() +
      "</div>" +
      "<div>" + n.message + "</div>" +
      "<div class='d-flex justify-content-between align-items-center mt-1'>" +
        "<small class='text-muted'>" +
          formatDate(n.created_at) +
        "</small>" +
        "<button class='btn btn-link p-0 small mark-read' data-id='" +
          (n.id || "") +
        "'>Mark as read</button>" +
      "</div>";

    box.prepend(div);

    var count = parseInt(badge.innerText || "0", 10) + 1;
    badge.innerText = count;
    badge.classList.remove("d-none");
  }

  /* ======================================================
     MARK AS READ (OPTIMISTIC)
  ====================================================== */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".mark-read");
    if (!btn) return;

    e.preventDefault();

    var id = btn.getAttribute("data-id");
    var item = btn.closest(".notification-item");

    if (item) item.remove();

    fetch("/api/notifications/" + id + "/read", {
      method: "PUT",
      headers: authHeaders()
    }).then(function () {
      loadNotifications();
      autoCloseIfEmpty();
    });
  });

  function autoCloseIfEmpty() {
    var box = $("notificationList");
    if (!box || box.children.length !== 0) return;
    closeNotificationDropdown();
  }

  /* ======================================================
     MARK ALL AS READ
  ====================================================== */
  function markAllNotificationsRead() {
    fetch("/api/notifications/read-all", {
      method: "PUT",
      headers: authHeaders()
    }).then(function () {
      loadNotifications();
      closeNotificationDropdown();
    });
  }

  /* ======================================================
     POLLING (FALLBACK ONLY)
  ====================================================== */
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(loadNotifications, 30000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /* ======================================================
     INIT
  ====================================================== */
  loadNotifications();       // recovery
  startPolling();            // fallback
  initNotificationEvents();  // realtime

  /* ======================================================
     GLOBAL EXPORTS
  ====================================================== */
  window.loadNotifications = loadNotifications;
  window.markAllNotificationsRead = markAllNotificationsRead;
  window.stopNotificationPolling = stopPolling;

})();
