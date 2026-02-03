/* =========================
   ROUTE CONFIG (FINAL)
========================= */
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
  link.href = "/assets/css/pages/" + routeKey + ".css";
  link.onerror = () =>
    console.warn("No page CSS for", routeKey);

  document.head.appendChild(link);
}

/* =========================
   SCRIPT LOADER (FIXED)
========================= */
function loadPageScript(src) {
  return new Promise(resolve => {
    const s = document.createElement("script");
    s.src = src;
    s.dataset.pageScript = "true";
    s.onload = resolve;
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
  requestAnimationFrame(() => runRoute(pageContent));
}

async function runRoute(pageContent) {
  try {
    if (!hasValidToken()) {
      window.location.replace("/login.html");
      return;
    }

    const rawHash = location.hash || "#/home";
    const routeKey = rawHash.startsWith("#/")
      ? rawHash.slice(2).split("?")[0]
      : rawHash.replace("#", "").split("?")[0];

    let route = ROUTES[routeKey];
    let params = [];

    if (!route) {
      for (const key in ROUTES) {
        const r = ROUTES[key];
        if (r.path && r.path.test(routeKey)) {
          route = r;
          params = routeKey.match(r.path).slice(1);
          break;
        }
      }
    }

    if (!route) {
      pageContent.innerHTML =
        "<h4 class='text-center mt-5'>Page not found</h4>";
      return;
    }

    const role = getUserRole();
    if (!route.roles.includes(role)) {
      pageContent.innerHTML =
        "<h4 class='text-center mt-5'>Access denied</h4>";
      return;
    }

    /* 🧹 CLEAN OLD PAGE SCRIPTS */
    document
      .querySelectorAll("script[data-page-script]")
      .forEach(s => s.remove());

    const baseKey = routeKey.split("/")[0];

    loadPageCSS(baseKey);

    const res = await fetch("/pages/" + route.file);
    if (!res.ok) {
      pageContent.innerHTML =
        "<h4 class='text-center mt-5'>Failed to load page</h4>";
      return;
    }

    // 🔒 IMPORTANT: read HTML ONCE, no size gating
    const html = await res.text();

    pageContent.innerHTML = html;

    setActiveNav(baseKey);

    const scripts =
      route.scripts ||
      PAGE_SCRIPTS[baseKey] ||
      ["/assets/js/pages/" + baseKey + ".js"];

    for (const src of scripts) {
      await loadPageScript(src);
    }

    /* HOME HOOK */
    if (baseKey === "home" && typeof window.onHomeRendered === "function") {
      setTimeout(window.onHomeRendered, 0);
    }

    /* LEGACY initX */
    const fnName =
      "init" +
      baseKey
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        .replace(/^\w/, c => c.toUpperCase());

    if (typeof window[fnName] === "function") {
      window[fnName].apply(null, params);
    }
  } finally {
    navigating = false;
  }
}

/* =========================
   SIDEBAR ROLE CONTROL
========================= */
function hideSidebarItemsByRole() {
  const role = getUserRole();

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
    if (!SIDEBAR_RULES[r] || !SIDEBAR_RULES[r].includes(role)) {
      link.remove();
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

