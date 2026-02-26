const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

const wss = new WebSocket.Server({ noServer: true });
const clients = new Map(); // userId -> ws

function initWebSocket(server) {
  server.on("upgrade", (req, socket, head) => {
    try {
      console.log("🔁 WS upgrade request:", req.url);

      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");

      if (!token) {
        console.warn("❌ WS rejected: no token");
        socket.destroy();
        return;
      }

      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        console.error("❌ WS JWT verification failed:", err.message);
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, ws => {
        // 🔁 prevent duplicate connections for same user
        if (clients.has(payload.id)) {
          clients.get(payload.id).close(4000, "Duplicate connection");
        }

        ws.userId = payload.id;
        ws.role = payload.role;
        ws.isAlive = true;

        clients.set(payload.id, ws);
        console.log(`🔌 WS connected: user ${payload.id}`);

        ws.on("pong", () => {
          ws.isAlive = true;
        });

        ws.on("close", () => {
          clients.delete(payload.id);
          console.log(`❌ WS closed: user ${payload.id}`);
        });

        ws.on("error", err => {
          console.error("WS error:", err.message);
        });

        // 🔥 THIS LINE FIXES EVERYTHING
        wss.emit("connection", ws, req);
      });
    } catch (err) {
      console.error("❌ WS upgrade failed:", err.message);
      socket.destroy();
    }
  });

  // ❤️ heartbeat to prevent idle disconnects
  setInterval(() => {
    for (const ws of clients.values()) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }

      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
}

/* 🔔 PUSH NOTIFICATION */
function pushNotification(userId, notification) {
  const ws = clients.get(userId);

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn(`⚠️ WS not available for user ${userId}`);
    return;
  }

  ws.send(
    JSON.stringify({
      event: "notification",
      data: {
        id: notification.id,
        type: notification.type,
        message: notification.message,
        created_at: notification.created_at,
        is_read: 0
      }
    })
  );

  console.log(`📤 WS notification sent → user ${userId}`);
}

module.exports = {
  initWebSocket,
  pushNotification
};
