/* =====================================================
   AUTH HELPER — HARDENED & SPA SAFE
   (Single Source of Truth)
===================================================== */

/* =========================
   STORAGE HELPERS
========================= */
function getUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Invalid user in storage");
    return null;
  }
}

function getToken() {
  return localStorage.getItem("token");
}

function getRole() {
  return getUser()?.role || null;
}

/* =========================
   AUTH GUARD (SPA SAFE)
========================= */
function requireAuth() {
  const token = getToken();
  const user = getUser();

  const isLoginRoute = location.hash === "#/login";

  // ✅ Allow login page without auth
  if (isLoginRoute) {
    return true;
  }

  if (!token || !user) {
    // Clean broken auth state
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();

    // SPA redirect ONLY (no reload, no API hit)
    location.hash = "#/login";
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

  // Ensure DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", populateUserName, {
      once: true
    });
    return;
  }

  const displayName = user.name || user.email || "User";
  const roleText = user.role ? user.role.toUpperCase() : "";

  // Top bar
  document.getElementById("userName")?.textContent = displayName;

  // Profile dropdown
  document.getElementById("profileName")?.textContent = displayName;
  document.getElementById("profileRole")?.textContent = roleText;

  // Optional role badge
  const roleEl = document.getElementById("userRole");
  if (roleEl && roleText) {
    roleEl.textContent = roleText;
    roleEl.classList.remove("d-none");
    roleEl.classList.add(
      user.role === "admin" ? "bg-danger" : "bg-primary"
    );
  }
}

/* =========================
   LOGOUT (PERMANENT FIX)
========================= */
function confirmLogout() {
  if (!confirm("Are you sure you want to logout?")) return;

  // Close WebSocket safely
  if (typeof window.closeWS === "function") {
    try {
      window.closeWS();
    } catch (e) {
      console.warn("WebSocket close error", e);
    }
  }

  // Clear auth state
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.clear();

  // Reset router + history
  history.replaceState(null, "", "/");
  location.hash = "#/login";
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
