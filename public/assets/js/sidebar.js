/* ======================================================
   sidebar.js — FINAL, SPA SAFE, ROUTER AWARE
   ✅ No double init
   ✅ Handles mobile + desktop
   ✅ Forces reload on same-route click
   ✅ No interference with router logic
====================================================== */

(function () {
  // 🔒 Prevent double initialization
  if (window.__sidebarInitialized) return;
  window.__sidebarInitialized = true;

  var MOBILE_WIDTH = 768;
  var lastIsMobile = null;

  /* ======================================================
     INIT
  ====================================================== */
  function initSidebar() {
    var sidebar = document.querySelector(".sidebar");
    var main = document.querySelector(".main");
    var toggleBtn = document.getElementById("sidebarToggle");

    if (!sidebar || !main || !toggleBtn) {
      console.warn("Sidebar not ready yet");
      return;
    }

    console.log("✅ Sidebar JS wired");

    /* ======================================================
       HELPERS
    ====================================================== */
    function isMobile() {
      return window.innerWidth <= MOBILE_WIDTH;
    }

    function collapse() {
      sidebar.classList.add("is-collapsed");
      main.classList.add("sidebar-collapsed");
      localStorage.setItem("sidebarCollapsed", "true");
    }

    function expand() {
      sidebar.classList.remove("is-collapsed");
      main.classList.remove("sidebar-collapsed");
      localStorage.setItem("sidebarCollapsed", "false");
    }

    function toggle() {
      sidebar.classList.contains("is-collapsed")
        ? expand()
        : collapse();
    }

    function syncState(force) {
      var mobile = isMobile();
      if (!force && mobile === lastIsMobile) return;
      lastIsMobile = mobile;

      var saved = localStorage.getItem("sidebarCollapsed") === "true";

      if (mobile || saved) collapse();
      else expand();
    }

    /* ======================================================
       EVENTS
    ====================================================== */

    // Sidebar toggle button
    toggleBtn.addEventListener("click", function (e) {
      e.preventDefault();
      toggle();
    });

    // Collapse sidebar on mobile after navigation
    sidebar.addEventListener("click", function (e) {
      var link = e.target.closest("a[href^='#/']");
      if (!link) return;

      if (isMobile()) {
        collapse();
      }
    });

    // 🔥 CRITICAL FIX
    // Clicking the SAME route (Home → Home) must re-trigger router
    sidebar.addEventListener("click", function (e) {
      var link = e.target.closest("a[href^='#/']");
      if (!link) return;

      var targetHash = link.getAttribute("href");

      if (location.hash === targetHash) {
        // Manually notify router
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    });

    // Window resize handling
    window.addEventListener("resize", function () {
      syncState(false);
    });

    // Initial sync
    syncState(true);
  }

  /* ======================================================
     SAFE DOM INIT
  ====================================================== */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSidebar);
  } else {
    initSidebar();
  }
})();
