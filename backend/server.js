/*************************************************
 * HRMS SERVER — FINAL, HARDENED & PM2 SAFE
 *************************************************/

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const compression = require("compression");

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
    await db.query("SET time_zone = '+05:30'");
    console.log("🕒 DB timezone locked to IST");
  } catch (err) {
    console.error("❌ Failed to set DB timezone:", err);
    process.exit(1);
  }
})();

/* =========================
   CRON JOBS
========================= */
require("./cron/timesheetLockCron");

/* =========================
   WEBSOCKET INIT
========================= */
const { initWebSocket } = require("./routes/wsServer");

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

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC ASSETS
========================= */
app.use("/assets", express.static(path.join(__dirname, "public/assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   SAFE ROUTE LOADER (FAIL FAST)
========================= */
function loadRoute(routePath) {
  try {
    const route = require(routePath);
    if (!route) {
      throw new Error("Route exported nothing");
    }
    return route;
  } catch (err) {
    console.error(`❌ Failed to load route: ${routePath}`);
    console.error(err.stack);
    process.exit(1); // hard fail → no PM2 restart loop
  }
}

/* =========================
   ROUTE IMPORTS
========================= */
const authRoutes          = loadRoute("./routes/auth");
const usersRoutes         = loadRoute("./routes/users");
const employeeRoutes      = loadRoute("./routes/employee");
// FIXED: Used loadRoute for consistency
const dashboardRoutes     = loadRoute("./routes/dashboard"); 
const holidayRoutes       = loadRoute("./routes/holiday");
const teamRoutes          = loadRoute("./routes/team");
const attendanceRoutes    = loadRoute("./routes/attendance");
const leaveRoutes         = loadRoute("./routes/leaves");

const payrollRoutes       = loadRoute("./routes/payroll");
const payrollUploadRoutes = loadRoute("./routes/payroll-upload");
const payslipRoutes       = loadRoute("./routes/payslips");

const notificationRoutes  = loadRoute("./routes/notifications");
const timesheetRoutes     = loadRoute("./routes/timesheets");
const thoughtRoutes       = loadRoute("./routes/thought");
const festivalRoutes      = loadRoute("./routes/festival");
const managerRoutes       = loadRoute("./routes/manager");

const documentRoutes      = loadRoute("./routes/documents");
const decisionRoutes      = loadRoute("./routes/decisions");
const executiveRoutes     = loadRoute("./routes/executive");

const analyticsProfileRoutes = loadRoute("./routes/analytics-profile");
const analyticsBenchRoutes   = loadRoute("./routes/analytics-bench");
const analyticsRoutes        = loadRoute("./routes/analytics");

/* =========================
   API ROUTES (ORDER MATTERS)
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/employees", employeeRoutes);

app.use("/api/dashboard", dashboardRoutes); // FIXED: Removed double semicolon

app.use("/api/holiday", holidayRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves", leaveRoutes);

app.use("/api/payroll", payrollRoutes);
app.use("/api/payroll/upload", payrollUploadRoutes);
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

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    environment: NODE_ENV,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

/* =========================
   API FALLBACK
========================= */
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API route not found",
    path: req.originalUrl
  });
});

/* =========================
   FRONTEND (SPA)
========================= */
const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Error:", err);
  res.status(500).json({
    message: "Internal server error",
    ...(NODE_ENV !== "production" && { error: err.message })
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
   START SERVER (HTTP + WS)
========================= */
const server = http.createServer(app);

/* 🔔 ATTACH WEBSOCKET */
initWebSocket(server);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 HRMS running on port ${PORT}`);
  console.log(`🌱 Environment: ${NODE_ENV}`);
});
