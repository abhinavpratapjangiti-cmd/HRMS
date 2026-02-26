/* =====================================================
   websocket.js — HRMS FE REALTIME (SOCKET.IO VERSION)
===================================================== */
(function () {
  if (window.__wsInitialized) return;
  window.__wsInitialized = true;

  let socket = null;
  let reconnectTimer = null;

  function getToken() {
    return localStorage.getItem("token");
  }

  function connect() {
    const token = getToken();
    if (!token) return;

    if (socket) return;

    socket = io({
      query: {
        token: token
      },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000
    });

    socket.on("connect", () => {
      console.log("🔌 Socket.IO connected");
      window.socket = socket;
    });

    socket.on("disconnect", () => {
      console.warn("🔌 Socket.IO disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connect error:", err.message);
    });

    socket.on("message", (data) => {
      window.dispatchEvent(
        new CustomEvent("ws:message", { detail: data })
      );
    });
  }

  window.closeWS = function () {
    if (!socket) return;
    socket.disconnect();
    socket = null;
    window.socket = null;
    console.log("🔌 Socket manually closed");
  };

  function waitForToken() {
    if (!getToken()) {
      setTimeout(waitForToken, 500);
      return;
    }
    connect();
  }

  waitForToken();
})();

