/* =====================================================
   toast.js — FINAL, SPA-SAFE, BACKWARD COMPATIBLE
===================================================== */

(function () {
  // 🔒 Prevent double init (SPA / hot reload safe)
  if (window.__toastInitialized) return;
  window.__toastInitialized = true;

  console.log("toast.js loaded");

  /* =========================
     GET CONTAINER (SAFE)
  ========================= */
  function getContainer() {
    let container = document.getElementById("toastContainer");

    // Auto-create container if missing
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.style.position = "fixed";
      container.style.top = "20px";
      container.style.right = "20px";
      container.style.zIndex = "9999";
      document.body.appendChild(container);
    }

    return container;
  }

  /* =========================
     CORE TOAST RENDERER
  ========================= */
  function renderToast({ icon, title, message, bg, duration }) {
    const container = getContainer();
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "app-toast";
    toast.style.background = bg;

    toast.innerHTML = `
      <div class="app-toast-icon">${icon}</div>
      <div class="app-toast-content">
        <div class="app-toast-title">${title}</div>
        <div class="app-toast-msg">${message}</div>
      </div>
    `;

    container.appendChild(toast);

    // animate in
    requestAnimationFrame(() => toast.classList.add("show"));

    // auto-dismiss
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  /* =========================
     PUBLIC API (ORIGINAL)
  ========================= */
  window.showSuccessToast = function (title, message) {
    renderToast({
      icon: "✅",
      title,
      message,
      bg: "linear-gradient(135deg,#16a34a,#22c55e)",
      duration: 3000
    });
  };

  window.showErrorToast = function (title, message) {
    renderToast({
      icon: "❌",
      title,
      message,
      bg: "linear-gradient(135deg,#dc2626,#ef4444)",
      duration: 3500
    });
  };

  window.showInfoToast = function (title, message) {
    renderToast({
      icon: "ℹ️",
      title,
      message,
      bg: "linear-gradient(135deg,#2563eb,#3b82f6)",
      duration: 2800
    });
  };

  window.showWarningToast = function (title, message) {
    renderToast({
      icon: "⚠️",
      title,
      message,
      bg: "linear-gradient(135deg,#f59e0b,#fbbf24)",
      duration: 3200
    });
  };

  /* =========================
     COMPAT LAYER (toast.*)
     🔥 This fixes "toast is not defined"
  ========================= */
  window.toast = {
    success(title, message) {
      window.showSuccessToast(title, message);
    },
    error(title, message) {
      window.showErrorToast(title, message);
    },
    info(title, message) {
      window.showInfoToast(title, message);
    },
    warning(title, message) {
      window.showWarningToast(title, message);
    }
  };
})();
