/* =====================================================
   websocket.js — HRMS FE REALTIME
   FINAL • SPA SAFE • HARD REFRESH SAFE
===================================================== */
(function () {
  if (window.__wsInitialized) return;
  window.__wsInitialized = true;

  let ws = null;
  let reconnectTimer = null;
  let connecting = false;

  function getToken() {
    return localStorage.getItem("token");
  }

  function connect() {
    if (connecting) return;

    const token = getToken();
    if (!token) return;

    connecting = true;

    const protocol = location.protocol === "https:" ? "wss://" : "ws://";
    const url =
      protocol +
      location.host +
      "/?token=" +
      encodeURIComponent(token);

    try {
      ws = new WebSocket(url);
    } catch (e) {
      connecting = false;
      return;
    }

    ws.onopen = function () {
      console.log("🔌 WebSocket connected");
      connecting = false;
      window.socket = ws;
    };

    ws.onmessage = function (evt) {
      window.dispatchEvent(
        new CustomEvent("ws:message", { detail: evt.data })
      );
    };

    ws.onclose = function () {
      console.warn("🔌 WebSocket closed");
      cleanup();

      if (!getToken()) return;

      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = function () {
      // onclose will handle cleanup + retry
    };
  }

  function cleanup() {
    connecting = false;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws = null;
    }
    window.socket = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Manual close (used on logout)
  window.closeWS = function () {
    if (!ws) return;
    ws.onclose = null;
    ws.close();
    cleanup();
    console.log("🔌 WebSocket manually closed");
  };

  // Wait for token ONCE
  function waitForToken() {
    if (!getToken()) {
      setTimeout(waitForToken, 500);
      return;
    }
    connect();
  }

  waitForToken();
})();
