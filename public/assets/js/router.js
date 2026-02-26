/* =========================
   ROUTE CONFIG (FINAL & CACHE BUSTED)
========================= */

// 🔥 CRITICAL: Change this number whenever you update code to force all users to get new files
const CACHE_VERSION = "100"; 

const ROUTES = {
  home: {
    file: "home.html",
    roles: ["admin", "hr", "manager", "employee"],
    scripts: [
      "/assets/js/pages/home.js",
      "/assets/js/pages/dashboard.js"
    ]
  },

  me: { file: "me.html", roles: ["admin", "hr", "manager", "employee"] },

  team: { file: "team.html", roles: ["admin", "hr", "manager"] },

  attendance: {
    file: "attendance.html",
    roles: ["admin", "hr", "manager", "employee"]
  },

  leaves: {
    file: "leaves.html",
    roles: ["admin", "hr", "manager", "employee"]
  },

  timesheets: {
    file: "timesheets.html",
    roles: ["employee", "manager", "hr", "admin"]
  },

  payroll: {
    file: "payroll.html",
    roles: ["admin", "hr", "manager", "employee"]
  },

  analytics: {
    file: "analytics.html",
    roles: ["admin", "hr"]
  },

  employee: {
    path: /^employee\/(\d+)$/,
    file: "employee-profile.html",
    roles: ["admin", "hr", "manager"],
    scripts: ["/assets/js/pages/employee-profile.js"]
  },

  "manage-users": {
    file: "manage-users.html",
    roles: ["admin", "hr"]
  },

  "manager-leaves": {
    file: "manager-leaves.html",
    roles: ["manager", "hr", "admin"]
  },

  "change-password": {
    file: "change-password.html",
    roles: ["admin", "hr", "manager", "employee"],
    scripts: ["/assets/js/pages/change-password.js"]
  }
};

/* =========================
   PAGE SCRIPTS
========================= */
const PAGE_SCRIPTS = {
  payroll: ["/assets/js/pages/payroll.js"],
  analytics: ["/assets/js/pages/analytics.js"],
  leaves: ["/assets/js/pages/leaves.js"]
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

function getUserRole() {
  const u = getUser();
  return u ? u.role : null;
}

function hasValidToken() {
  return !!localStorage.getItem("token");
}

function setActiveNav(routeKey) {
  // Handle nested routes (e.g. employee/123 -> employee)
  const base = routeKey.split("/")[0]; 
  
  document
    .querySelectorAll(".sidebar a")
    .forEach(l => l.classList.remove("active"));

  const active = document.querySelector(
    `.sidebar a[data-route="${base}"]`
  );
  if (active) active.classList.add("active");
}

/* =========================
   PAGE CSS LOADER
========================= */
function loadPageCSS(routeKey) {
  const CSS_ID = "page-css";
  const old = document.getElementById(CSS_ID);
  if (old) old.remove();

  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  // Add cache buster to CSS too
  link.href = "/assets/css/pages/" + routeKey + ".css?v=" + CACHE_VERSION;
  link.onerror = () => console.warn("No page CSS for", routeKey);

  document.head.appendChild(link);
}

/* =========================
   SCRIPT LOADER (FIXED & CACHE BUSTED)
========================= */
function loadPageScript(src) {
  return new Promise(resolve => {
    const s = document.createElement("script");
    
    // 🔥 CRITICAL FIX: Append version to force fresh load
    const sep = src.includes("?") ? "&" : "?";
    s.src = `${src}${sep}v=${CACHE_VERSION}`;
    
    s.dataset.pageScript = "true";
    s.onload = resolve;
    s.onerror = () => {
        console.error("Failed to load script:", src);
        resolve(); // Resolve anyway to not block the page
    };
    document.body.appendChild(s);
  });
}

/* =========================
   ROUTER CORE
========================= */
let navigating = false;

function loadRoute() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent || navigating) return;

  navigating = true;
  // Use requestAnimationFrame for smoother UI transition
  requestAnimationFrame(() => runRoute(pageContent).finally(() => {
    navigating = false;
  }));
}

async function runRoute(pageContent) {
  try {
    if (!hasValidToken()) {
      window.location.replace("/login.html");
      return;
    }

    // 1. Resolve Route Key
    const rawHash = location.hash || "#/home";
    // Clean hash: remove #, remove leading /, remove query params
    let routeKey = rawHash.replace(/^#\/?/, "").split("?")[0];
    if (!routeKey) routeKey = "home";

    let route = ROUTES[routeKey];
    let params = [];

    // 2. Handle Regex Routes (like employee/123)
    if (!route) {
      for (const key in ROUTES) {
        const r = ROUTES[key];
        // Ensure r.path is a RegExp object before calling test()
        if (r.path instanceof RegExp && r.path.test(routeKey)) {
          route = r;
          const match = routeKey.match(r.path);
          if (match) params = match.slice(1);
          break;
        }
      }
    }

    // 3. 404 Handling
    if (!route) {
      pageContent.innerHTML = "<h4 class='text-center mt-5'>Page not found</h4>";
      return;
    }

    // 4. Role Check
    const role = getUserRole();
    // Default to empty array if roles not defined, for safety
    const allowedRoles = route.roles || [];
    if (!allowedRoles.includes(role)) {
      pageContent.innerHTML = "<h4 class='text-center mt-5 text-danger'>Access denied</h4>";
      return;
    }

    // 5. Cleanup Old Scripts
    document
      .querySelectorAll("script[data-page-script]")
      .forEach(s => s.remove());

    const baseKey = routeKey.split("/")[0];

    // 6. Load CSS
    loadPageCSS(baseKey);

    // 7. Load HTML (With Cache Buster)
    // We are requesting the HTML file here. Make sure it exists.
    const res = await fetch(`/pages/${route.file}?v=${CACHE_VERSION}`);
    if (!res.ok) {
      pageContent.innerHTML = "<h4 class='text-center mt-5'>Failed to load page content</h4>";
      return;
    }

    const html = await res.text();
    pageContent.innerHTML = html;

    // 8. Set Active Nav
    setActiveNav(baseKey);

    // 9. Load Scripts
    const scripts =
      route.scripts ||
      PAGE_SCRIPTS[baseKey] ||
      [`/assets/js/pages/${baseKey}.js`];

    for (const src of scripts) {
      await loadPageScript(src);
    }

    // 10. Trigger Events
    // Event: route:loaded (For home.js SPA logic)
    window.dispatchEvent(new Event("route:loaded"));

    /* LEGACY: Home Hook */
    if (baseKey === "home" && typeof window.onHomeRendered === "function") {
      setTimeout(window.onHomeRendered, 0);
    }

    /* LEGACY: initFunction */
    const fnName =
      "init" +
      baseKey
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        .replace(/^\w/, c => c.toUpperCase());

    if (typeof window[fnName] === "function") {
      window[fnName].apply(null, params);
    }

  } catch (err) {
    console.error("Router Error:", err);
    pageContent.innerHTML = "<h4 class='text-center mt-5 text-danger'>System Error</h4>";
  }
}

/* =========================
   SIDEBAR ROLE CONTROL
========================= */
function hideSidebarItemsByRole() {
  const role = getUserRole();
  if (!role) return;

  const SIDEBAR_RULES = {
    home: ["admin", "hr", "manager", "employee"],
    me: ["admin", "hr", "manager", "employee"],
    attendance: ["admin", "hr", "manager", "employee"],
    leaves: ["admin", "hr", "manager", "employee"],
    timesheets: ["employee", "manager", "hr", "admin"],
    payroll: ["admin", "hr", "manager", "employee"],
    team: ["admin", "hr", "manager"],
    analytics: ["admin", "hr"],
    "manage-users": ["admin", "hr"],
    "manager-leaves": ["admin", "hr", "manager"]
  };

  document.querySelectorAll(".sidebar a[data-route]").forEach(link => {
    const r = link.dataset.route;
    // Hide if rule exists AND role is not in list
    if (SIDEBAR_RULES[r] && !SIDEBAR_RULES[r].includes(role)) {
      link.remove(); // Or link.classList.add('d-none');
    }
  });
}

/* =========================
   EVENTS
========================= */
window.addEventListener("hashchange", loadRoute);

window.addEventListener("DOMContentLoaded", () => {
  hideSidebarItemsByRole();
  loadRoute();

  if (typeof window.populateUserName === "function") {
    window.populateUserName();
  }
});
