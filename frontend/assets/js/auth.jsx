/* =====================================================
   AUTH HELPER — HARDENED & SPA SAFE (NON-MODULE)
===================================================== */

/* =========================
   USER HELPERS
========================= */
function getUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getRole() {
  return getUser()?.role || null;
}

function getToken() {
  return localStorage.getItem("token");
}

/* =========================
   REQUIRE AUTH
========================= */
function requireAuth() {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    // Clean broken state
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    // Safe redirect
    window.location.replace(`${location.origin}/login.html`);
    return false;
  }

  return true;
}

/* =========================
   POPULATE USER INFO
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

  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const profileName = document.getElementById("profileName");
  const profileRole = document.getElementById("profileRole");

  const displayName = user.name || user.email || "User";

  if (nameEl) nameEl.textContent = displayName;
  if (profileName) profileName.textContent = displayName;

  if (user.role) {
    const roleText = user.role.toUpperCase();

    if (roleEl) {
      roleEl.textContent = roleText;
      roleEl.classList.remove("d-none");
      roleEl.classList.add(
        user.role === "admin" ? "bg-danger" : "bg-primary"
      );
    }

    if (profileRole) {
      profileRole.textContent = roleText;
    }
  }
}

/* =========================
   LOGOUT
========================= */
function confirmLogout() {
  if (!confirm("Are you sure you want to logout?")) return;

  // Close WebSocket cleanly
  if (typeof window.closeWS === "function") {
    window.closeWS();
  }

  // Clear auth
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  // Hard redirect
  window.location.href = `${location.origin}/login.html`;
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
