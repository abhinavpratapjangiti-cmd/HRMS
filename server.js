/*************************************************
 * HRMS SERVER — FINAL, HARDENED & PM2 SAFE
 *************************************************/

/* ----------------------------------------------------
 * CRITICAL FIX: FORCE NODE TO IST (MATCHES DB)
 * This prevents the "Time Travel" / Negative Timer bug
 * ---------------------------------------------------- */
process.env.TZ = "Asia/Kolkata";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const compression = require("compression");
const { Server } = require("socket.io"); // 🔥 ADDED: Socket.io Server
const socket = require("./socket");

/* =========================
   APP INIT
========================= */
const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

/* =========================
   DB INIT (FAIL FAST)
========================= */
const db = require("./db");

/* =========================
   ENSURE DB TIMEZONE (IST)
========================= */
(async () => {
  try {
    // This aligns the Database session time with the Node process time
    await db.query("SET time_zone = '+05:30'");
    console.log("🕒 DB timezone locked to IST (+05:30)");
  } catch (err) {
    console.error("❌ Failed to set DB timezone:", err);
    process.exit(1);
  }
})();

/* =========================
   CRON JOBS
========================= */
try {
  require("./cron/timesheetLockCron");
  require("./cron/overtimeMonitor"); // ✅ Loads your new overtime logic
} catch (err) {
  console.warn("⚠️ Cron job failed to load:", err.message);
}

/* =========================
   NOTIFICATION SERVICE INIT
========================= */
// 🔥 ADDED: Import the initSocket function we created in notificationService
const { initSocket } = require("./services/notificationService");

/* =========================
   MIDDLEWARE
========================= */
app.use(compression());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// Increased limit to 10mb to prevent payload errors on file uploads
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =========================
   STATIC ASSETS
========================= */
app.use("/assets", express.static(path.join(__dirname, "public/assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   SAFE ROUTE LOADER
========================= */
function loadRoute(routePath) {
  try {
    const route = require(routePath);
    // Handle both CommonJS (module.exports) and ES Module (export default)
    if (!route || (typeof route !== "function" && !route.stack)) {
       throw new Error(`Route file ${routePath} does not export a router`);
    }
    return route;
  } catch (err) {
    console.error(`❌ Failed to load route: ${routePath}`);
    console.error(err.stack);
    process.exit(1);
  }
}

/* =========================
   ROUTE IMPORTS
========================= */
const authRoutes             = loadRoute("./routes/auth");
const usersRoutes            = loadRoute("./routes/users");
const employeeRoutes         = loadRoute("./routes/employee");
const dashboardRoutes        = loadRoute("./routes/dashboard");
const holidayRoutes          = loadRoute("./routes/holiday");
const teamRoutes             = loadRoute("./routes/team");
const attendanceRoutes       = loadRoute("./routes/attendance");
const leaveRoutes            = loadRoute("./routes/leaves");
const payrollRoutes          = loadRoute("./routes/payroll");
const payrollUploadRoutes    = loadRoute("./routes/payroll-upload");
const payslipRoutes          = loadRoute("./routes/payslips");
const notificationRoutes     = loadRoute("./routes/notifications");
const timesheetRoutes        = loadRoute("./routes/timesheets");
const thoughtRoutes          = loadRoute("./routes/thought");
const festivalRoutes         = loadRoute("./routes/festival");
const managerRoutes          = loadRoute("./routes/manager");
const documentRoutes         = loadRoute("./routes/documents");
const decisionRoutes         = loadRoute("./routes/decisions");
const executiveRoutes        = loadRoute("./routes/executive");
const analyticsProfileRoutes = loadRoute("./routes/analytics-profile");
const analyticsBenchRoutes   = loadRoute("./routes/analytics-bench");
const analyticsRoutes        = loadRoute("./routes/analytics");
const serviceRequestRoutes = loadRoute("./routes/service-requests");

/* =========================
   API ROUTES (ORDER MATTERS)
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/holiday", holidayRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/payroll/upload", payrollUploadRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/payslips", payslipRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/timesheets", timesheetRoutes);
app.use("/api/thought", thoughtRoutes);
app.use("/api/festival", festivalRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/decisions", decisionRoutes);
app.use("/api/executive", executiveRoutes);
app.use("/api/analytics/profile", analyticsProfileRoutes);
app.use("/api/analytics/bench", analyticsBenchRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/service-requests", serviceRequestRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    environment: NODE_ENV,
    server_time: new Date().toString(),
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

/* =========================
   API FALLBACK (404 for API only)
========================= */
app.all("/api/*", (req, res) => {
  res.status(404).json({
    message: "API route not found",
    path: req.originalUrl,
    hint: "Check if the route is registered in server.js and the path in the route file does not repeat '/api'"
  });
});

/* =========================
   FRONTEND (SPA)
========================= */
const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));

// Only serve index.html for non-API routes to support SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Error:", err);
  res.status(err.status || 500).json({
    message: "Internal server error",
    ...(NODE_ENV !== "production" && { error: err.message, stack: err.stack })
  });
});

/* =========================
   SAFETY NETS
========================= */
process.on("unhandledRejection", err => {
  console.error("🔥 Unhandled Promise Rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("🔥 Uncaught Exception:", err);
  process.exit(1);
});

/* =========================
   START SERVER (HTTP + SOCKET.IO)
========================= */
const server = http.createServer(app);

// 🔥 PATCHED: Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});
socket.init(io);

// 🔥 PATCHED: Pass IO instance to Notification Service
initSocket(io);

// Optional: Global connection log
io.on("connection", (socket) => {
  // Allow client to join a personal room based on their User ID
  const userId = socket.handshake.query.userId;
  if (userId) {
    socket.join(String(userId));
    console.log(`🔌 User ${userId} connected to Socket`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 HRMS running on port ${PORT}`);
  console.log(`🌱 Environment: ${NODE_ENV}`);
  console.log(`🕒 Server Time: ${new Date().toString()}`);
});
