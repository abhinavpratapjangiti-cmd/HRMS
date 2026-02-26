/* =====================================================
   ROLE & PERMISSIONS — CLIENT CORE
===================================================== */

(function () {
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }

  function getRole() {
    return getUser().role || "guest";
  }

  window.hasRole = function (...roles) {
    return roles.includes(getRole());
  };

  window.requireRole = function (roles, onFail) {
    if (!Array.isArray(roles)) roles = [roles];

    if (roles.includes(getRole())) return true;

    if (typeof onFail === "function") onFail();
    return false;
  };

  /**
   * Auto-hide elements by role
   * Usage: data-role="admin,hr"
   */
  window.applyRolePermissions = function () {
    document.querySelectorAll("[data-role]").forEach(el => {
      const allowed = el.dataset.role
        .split(",")
        .map(r => r.trim());

      if (!allowed.includes(getRole())) {
        el.classList.add("d-none");
      }
    });
  };
})();

