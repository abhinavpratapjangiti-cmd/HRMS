/* ======================================================
   SIDEBAR COLLAPSE CONTROLLER
   SPA + DOM SAFE (FINAL)
====================================================== */

(function () {
  if (window.__sidebarInitialized) return;
  window.__sidebarInitialized = true;

  function initSidebar() {
    const sidebar = document.querySelector(".sidebar");
    const main = document.querySelector(".main");
    const toggleBtn = document.getElementById("sidebarToggle");

    if (!sidebar || !main || !toggleBtn) {
      console.warn("Sidebar not ready yet");
      return;
    }

    console.log("✅ Sidebar JS wired");

    const MOBILE_WIDTH = 768;

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

    function initState() {
      const saved = localStorage.getItem("sidebarCollapsed");
      if (isMobile() || saved === "true") collapse();
      else expand();
    }

    toggleBtn.addEventListener("click", toggle);

    sidebar.addEventListener("click", e => {
      if (e.target.closest("a") && isMobile()) {
        collapse();
      }
    });

    window.addEventListener("resize", initState);
    initState();
  }

  // 🔑 THIS IS THE FIX
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSidebar);
  } else {
    initSidebar();
  }
})();
/* ======================================================
   END SIDEBAR COLLAPSE CONTROLLER
====================================================== */