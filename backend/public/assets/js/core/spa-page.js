/* =====================================================
   SPA PAGE BOOTSTRAP — CLIENT CORE
===================================================== */

(function () {
  const pageState = {};

  /**
   * Register a SPA page and auto-init on route match
   * @param {string} hash - "#/attendance"
   * @param {Function} initFn
   */
  window.registerPage = function (hash, initFn) {
    if (!hash || typeof initFn !== "function") {
      console.error("registerPage(hash, fn) invalid");
      return;
    }

    function enter() {
      if (location.hash !== hash) return;

      if (pageState[hash]) return; // 🔒 prevent double init
      pageState[hash] = true;

      setTimeout(initFn, 50);
    }

    // Initial load
    enter();

    // SPA navigation
    window.addEventListener("hashchange", enter);
  };
})();
