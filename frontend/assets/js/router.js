/* =========================
   ROUTE CONFIG (FINAL – SPA)
========================= */
const ROUTES = {
  login: {
    file: "login.html",
    roles: ["guest"]
  },

  home: {
    file: "home.html",
    roles: ["admin", "hr", "manager", "employee"],
    scripts: ["/assets/js/pages/home.js", "/assets/js/pages/dashboard.js"]
  },

  me: { file: "me.html", roles: ["admin", "hr", "manager", "employee"] },
  team: { file: "team.html", roles: ["admin", "hr", "manager"] },
  attendance: { file: "attendance.html", roles: ["admin", "hr", "manager", "employee"] },
  leaves: { file: "leaves.html", roles: ["admin", "hr", "manager", "employee"] },
  timesheets: { file: "timesheets.html", roles: ["employee", "manager", "hr", "admin"] },
  payroll: { file: "payroll.html", roles: ["admin", "hr", "manager", "employee"] },
  analytics: { file: "analytics.html", roles: ["admin", "hr"] },
  "manage-users": { file: "manage-users.html", roles: ["admin", "hr"] }
};

/* =========================
   HELPERS
========================= */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

function getRole() {
  return getUser()?.role || "guest";
}

function hasToken() {
  return !!localStorage.getItem("token");
}

/* =========================
   SCRIPT LOADER (CACHE SAFE)
========================= */
function loadPageScript(src) {
  return new Promise(resolve => {
    const s = document.createElement("script");
    s.src = src; // ✅ allow browser cache
    s.dataset.pageScript = "true";
    s.onload = resolve;
    document.body.appendChild(s);
  });
}

/* =========================
   ROUTER CORE
========================= */
async function loadRoute() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) return;

  const hash = location.hash || "#/home";
  const routeKey = hash.replace("#/", "").split("?")[0];

  // 🔐 AUTH GUARD
  if (!hasToken() && routeKey !== "login") {
    location.hash = "#/login";
    return;
  }

  const route = ROUTES[routeKey] || ROUTES.home;
  const role = getRole();

  if (!route.roles.includes(role) && routeKey !== "login") {
    pageContent.innerHTML =
      "<h4 class='text-center mt-5'>Access denied</h4>";
    return;
  }

  // 🧹 Cleanup old scripts
  document.querySelectorAll("script[data-page-script]").forEach(s => s.remove());

  const res = await fetch("/pages/" + route.file);
  if (!res.ok) {
    pageContent.innerHTML =
      "<h4 class='text-center mt-5'>Failed to load page</h4>";
    return;
  }

  pageContent.innerHTML = await res.text();

  if (route.scripts) {
    for (const s of route.scripts) {
      await loadPageScript(s);
    }
  }

  // Lifecycle hook
  if (routeKey === "home" && typeof window.onHomeRendered === "function") {
    window.onHomeRendered();
  }
}

/* =========================
   EVENTS
========================= */
window.addEventListener("hashchange", loadRoute);

window.addEventListener("DOMContentLoaded", () => {
  loadRoute();
  window.populateUserName?.();
});
