/* =====================================================
   AUTH HELPER — FINAL, HARDENED, SPA SAFE
===================================================== */

/* =========================
   STORAGE HELPERS
========================= */
function getUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("⚠️ Corrupt user in localStorage");
    localStorage.removeItem("user");
    return null;
  }
}

function getToken() {
  return localStorage.getItem("token");
}

function getRole() {
  const user = getUser();
  return user?.role ? String(user.role).toLowerCase() : null;
}

/* =========================
   AUTH GUARD (SPA SAFE)
========================= */
function requireAuth() {
  const token = getToken();

  // Allow login page without token
  if (location.hash === "#/login") return true;

  if (!token) {
    location.replace("#/login");
    return false;
  }

  return true;
}

/* =========================
   USER UI POPULATION
========================= */
function populateUserName() {
  const user = getUser();
  if (!user) return;

  const apply = () => {
    const displayName =
      user.name ||
      user.first_name ||
      user.username ||
      user.email ||
      "User";

    const roleText = user.role ? user.role.toUpperCase() : "";

    const userNameEl = document.getElementById("userName");
    if (userNameEl) userNameEl.textContent = displayName;

    const profileNameEl = document.getElementById("profileName");
    if (profileNameEl) profileNameEl.textContent = displayName;

    const profileRoleEl = document.getElementById("profileRole");
    if (profileRoleEl) profileRoleEl.textContent = roleText;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
}

/* =========================
   LOGOUT
========================= */
function confirmLogout() {
  if (!confirm("Are you sure you want to logout?")) return;

  try {
    if (typeof window.closeWS === "function") {
      window.closeWS();
    }
  } catch {}

  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.clear();

  history.replaceState(null, "", "/");
  location.replace("#/login");
}

/* =========================
   GLOBAL EXPORTS
========================= */
window.getToken = getToken;
window.getUser = getUser;
window.getRole = getRole;
window.requireAuth = requireAuth;
window.populateUserName = populateUserName;
window.confirmLogout = confirmLogout;

/* =========================
   AUTH BOOTSTRAP (CRITICAL)
========================= */
window.__authReady = false;

(function bootstrapAuth() {
  const token = getToken();
  const user = getUser();

  // Either:
  // 1. logged in correctly
  // 2. logged out cleanly
  if ((token && user) || !token) {
    window.__authReady = true;
    return;
  }

  // Token exists but user not yet restored → wait
  setTimeout(bootstrapAuth, 30);
})();

/* =========================
   ROUTER TRIGGER AFTER AUTH
========================= */
document.addEventListener("DOMContentLoaded", () => {
  populateUserName();

  if (location.hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
});
