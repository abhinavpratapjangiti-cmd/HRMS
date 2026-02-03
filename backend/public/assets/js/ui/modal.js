/* =====================================================
   GLOBAL MODAL HELPER (BOOTSTRAP 5)
===================================================== */

(function () {
  window.showModal = function (title, bodyHtml) {
    const modalEl = document.getElementById("globalModal");
    const titleEl = document.getElementById("globalModalTitle");
    const bodyEl = document.getElementById("globalModalBody");

    if (!modalEl || !titleEl || !bodyEl) {
      console.error("❌ Global modal DOM not found");
      return;
    }

    // Safer text assignment
    titleEl.textContent = title || "";

    // Controlled HTML injection (OK for internal use)
    bodyEl.innerHTML = bodyHtml || "";

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  };

  // Optional helper (useful in SPA flows)
  window.closeModal = function () {
    const modalEl = document.getElementById("globalModal");
    if (!modalEl) return;

    const instance = bootstrap.Modal.getInstance(modalEl);
    if (instance) instance.hide();
  };
})();
