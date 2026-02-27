/* ======================================================
   notifications.js — PRODUCTION READY
   REALTIME (SOCKET.IO) + SAFE FALLBACK
   SPA SAFE | BOOTSTRAP SAFE | TOKEN SAFE
====================================================== */

console.log("notifications.js loaded");

(function () {
  if (window.__notificationsInitialized) return;
  window.__notificationsInitialized = true;

  var API_BASE = "http://16.16.18.115:5000";
  var pollTimer = null;
  var socket = null;
  var seenNotificationIds = {};

  /* ================= SOUND SYSTEM ================= */

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
      })
      .catch(function () {});
  }

  document.addEventListener("click", unlockNotificationAudio, { once: true });
  document.addEventListener("keydown", unlockNotificationAudio, { once: true });

  function playNotificationSound() {
    if (!audioUnlocked) return;

    var now = Date.now();
    if (now - lastSoundAt < 1500) return;
    lastSoundAt = now;

    notificationSound.currentTime = 0;
    notificationSound.play().catch(function () {});
  }

  /* ================= AUTH ================= */

  function authHeaders() {
    var token = localStorage.getItem("token");
    return token
      ? {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        }
      : {};
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch (e) {
      return {};
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return isNaN(d.getTime()) ? "--" : d.toLocaleString();
  }

  /* ================= LOAD NOTIFICATIONS ================= */

function loadNotifications() {
    // 1. SAFETY CHECK: If no token, don't even try to fetch.
    if (!localStorage.getItem("token")) {
       console.log("No token found. Pausing notification polling.");
       stopPolling();
       return;
    }

    fetch(API_BASE + "/api/notifications", {
      headers: authHeaders()
    })
      .then(function (r) {
        // 2. KILL SWITCH: If server says 401, stop the loop.
        if (r.status === 401) {
          console.warn("Session expired. Stopping polling.");
          stopPolling();
          return [];
        }
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

    seenNotificationIds = {};

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
      seenNotificationIds[n.id] = true;

      /* 🔥 NEW ADDITION: Extract Request ID and build Approve/Reject buttons safely */
      var actionButtons = "";
      if (n.type === 'password_request' || (n.message && n.message.includes('Password Reset Requested'))) {
        var match = n.message.match(/Request ID:\s*(\d+)/);
        if (match) {
          var reqId = match[1];
          actionButtons = "<div class='mt-2'>" +
            "<button class='btn btn-success btn-sm me-2 resolve-reset-btn' data-action='APPROVED' data-reqid='" + reqId + "'>Approve</button>" +
            "<button class='btn btn-danger btn-sm resolve-reset-btn' data-action='REJECTED' data-reqid='" + reqId + "'>Reject</button>" +
          "</div>";
        }
      }
      /* -------------------------------------------------------------------------- */

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
          actionButtons + /* 🔥 NEW ADDITION: Injected securely here */
        "</div>";
    }

    box.innerHTML = html;
  }

  /* ================= SOCKET INIT ================= */

  function initSocketConnection() {
    if (typeof io === "undefined") {
      console.warn("Socket.io client missing. Polling only.");
      return;
    }

    var user = getUser();
    if (!user.id) return;

    socket = io(API_BASE, {
      query: { userId: user.id },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5
    });

    socket.on("connect", function () {
      console.log("🔌 Socket connected");
    });

    socket.on("notification_pop", function (data) {
console.log("🔥 Notification event received:", data);
if (!data || !data.id) return;

      // Prevent duplicates
      if (seenNotificationIds[data.id]) return;
      seenNotificationIds[data.id] = true;

      injectLiveNotification(data);
    });

    socket.on("disconnect", function () {
      console.warn("Socket disconnected");
    });
  }

  /* ================= LIVE INJECTION ================= */

  function injectLiveNotification(n) {
    playNotificationSound();

    if (typeof showToast === "function") {
      showToast(n.message, "info");
    } else if ("Notification" in window && Notification.permission === "granted") {
      new Notification("HRMS Alert", { body: n.message });
    }

    var box = $("notificationList");
    var badge = $("notificationBadge");

    if (!box || !badge) return;

    if (
      box.children.length === 1 &&
      box.children[0].classList.contains("text-muted")
    ) {
      box.innerHTML = "";
    }

    /* 🔥 NEW ADDITION: Ensure real-time socket events also get the buttons */
    var actionButtons = "";
    if (n.type === 'password_request' || (n.message && n.message.includes('Password Reset Requested'))) {
      var match = n.message.match(/Request ID:\s*(\d+)/);
      if (match) {
        var reqId = match[1];
        actionButtons = "<div class='mt-2'>" +
          "<button class='btn btn-success btn-sm me-2 resolve-reset-btn' data-action='APPROVED' data-reqid='" + reqId + "'>Approve</button>" +
          "<button class='btn btn-danger btn-sm resolve-reset-btn' data-action='REJECTED' data-reqid='" + reqId + "'>Reject</button>" +
        "</div>";
      }
    }
    /* -------------------------------------------------------------------- */

    var div = document.createElement("div");
    div.className = "notification-item unread";
    div.setAttribute("data-id", n.id);

    div.innerHTML =
      "<div class='fw-semibold'>" +
        String(n.type || "notification").toUpperCase() +
      "</div>" +
      "<div>" + n.message + "</div>" +
      "<div class='d-flex justify-content-between align-items-center mt-1'>" +
        "<small class='text-muted'>" +
          formatDate(n.created_at || new Date()) +
        "</small>" +
        "<button class='btn btn-link p-0 small mark-read' data-id='" +
          n.id +
        "'>Mark as read</button>" +
      "</div>" +
      actionButtons; /* 🔥 NEW ADDITION: Injected securely here */

    box.prepend(div);

    var count = parseInt(badge.innerText || "0", 10) + 1;
    badge.innerText = count;
    badge.classList.remove("d-none");
  }

  /* ================= MARK AS READ ================= */

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".mark-read");
    if (!btn) return;

    e.preventDefault();

    var id = btn.getAttribute("data-id");
    var item = btn.closest(".notification-item");

    if (item) item.remove();

    fetch(API_BASE + "/api/notifications/" + id + "/read", {
      method: "PUT",
      headers: authHeaders()
    }).then(function () {
      delete seenNotificationIds[id];
      loadNotifications();
    });
  });

  /* ================= MARK ALL ================= */

function markAllNotificationsRead() {
  fetch(API_BASE + "/api/notifications/read-all", {
    method: "PUT",
    headers: authHeaders()
  }).then(function () {

    var box = document.getElementById("notificationList");
    var badge = document.getElementById("notificationBadge");

    if (box) {
      box.innerHTML =
        "<small class='text-muted'>No notifications</small>";
    }

    if (badge) {
      badge.innerText = "0";
      badge.classList.add("d-none");
    }

    seenNotificationIds = {};
  });
}
/* ================= MARK ALL EVENT LISTENER ================= */
document.addEventListener("click", function (e) {
  if (e.target.innerText && e.target.innerText.includes("Mark All")) {
    e.preventDefault();
    markAllNotificationsRead();
  }
});
/* ================= ADMIN RESOLVE PASSWORD RESET ================= */
  /* 🔥 NEW ADDITION: Event listener to handle the Approve/Reject clicks safely */
  
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".resolve-reset-btn");
    if (!btn) return;
    e.preventDefault();

    var action = btn.getAttribute("data-action");
    var reqId = btn.getAttribute("data-reqid");
    var user = getUser();

    if (!confirm("Are you sure you want to " + action.toLowerCase() + " this password request?")) return;

    var originalText = btn.innerHTML;
    btn.innerHTML = "Processing...";
    btn.disabled = true;

    // Make sure this matches your auth routes prefix. Assuming /api/auth.
    fetch(API_BASE + "/api/auth/admin/resolve-reset", { 
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
          request_id: reqId,
          action: action,
          admin_id: user.id || 0
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        alert(data.message || ("Request " + action));
        loadNotifications(); // Reload list to update UI and remove notification if marked read on backend
    })
    .catch(function(err) {
        console.error("Resolve error:", err);
        alert("Error processing request");
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
  });
  /* -------------------------------------------------------------------------- */

  /* ================= POLLING ================= */

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(loadNotifications, 5000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /* ================= INIT ================= */

  loadNotifications();
  initSocketConnection();
  startPolling();

  window.loadNotifications = loadNotifications;
  window.markAllNotificationsRead = markAllNotificationsRead;
  window.stopNotificationPolling = stopPolling;
  window.startNotificationPolling = startPolling;

})();
