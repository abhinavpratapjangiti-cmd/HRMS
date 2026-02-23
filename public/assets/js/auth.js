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

  // If we are on the login page, do nothing (prevent infinite loop)
  if (window.location.pathname.endsWith("login.html")) return true;

  if (!token) {
    // Redirect to full login page, not just a hash route
    window.location.href = "/login.html";
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
   LOGOUT LOGIC
========================= */
function handleLogout(e) {
  if (e) e.preventDefault();
  
  if (!confirm("Are you sure you want to logout?")) return;

  // 1. Try to tell server to logout
  // Note: apiPost is available globally from api.js
  if (typeof apiPost === 'function') {
      apiPost("/auth/logout", {})
        .then(() => {
            console.log("Server logout successful");
            finalizeLogout();
        })
        .catch((err) => {
            console.warn("Server logout failed, forcing local logout", err);
            finalizeLogout();
        });
  } else {
      // Fallback if api.js isn't loaded
      finalizeLogout();
  }
}

function finalizeLogout() {
  // 1. Close Websocket if exists
  try {
    if (typeof window.closeWS === "function") {
      window.closeWS();
    }
  } catch (err) { 
    console.warn("WS close error:", err); 
  }

  // 2. Clear Storage
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.clear();

  // 3. Hard Redirect to Login Page
  // Using replace to prevent "Back" button from returning to app
  window.location.replace("/login.html");
}

/* =========================
   EVENT LISTENERS (The Missing Piece)
========================= */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Populate UI
    populateUserName();

    // 2. Listen for Logout Clicks anywhere in the document
    // This catches the data-action="logout" button
    document.body.addEventListener("click", function (e) {
        const logoutBtn = e.target.closest('[data-action="logout"]');
        if (logoutBtn) {
            handleLogout(e);
        }
    });

    // 3. Trigger initial router if needed
    if (location.hash && typeof window.dispatchEvent === "function") {
       // Only dispatch if Router is loaded
       // window.dispatchEvent(new HashChangeEvent("hashchange")); 
    }
});

/* =========================
   GLOBAL EXPORTS
========================= */
window.getToken = getToken;
window.getUser = getUser;
window.getRole = getRole;
window.requireAuth = requireAuth;
window.populateUserName = populateUserName;
window.confirmLogout = handleLogout; // Expose as confirmLogout for backward compatibility

/* =========================
   AUTH BOOTSTRAP (CRITICAL)
========================= */
window.__authReady = false;

(function bootstrapAuth() {
  const token = getToken();
  const user = getUser();

  // Either:
  // 1. logged in correctly
  // 2. logged out cleanly (no token)
  if ((token && user) || !token) {
    window.__authReady = true;
    return;
  }

  // Token exists but user not yet restored → wait
  setTimeout(bootstrapAuth, 30);
})();
