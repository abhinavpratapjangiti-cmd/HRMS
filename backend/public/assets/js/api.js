/* =====================================================
   api.js — GLOBAL API HELPERS (HARDENED & EXPOSED)
   ✅ Exposes 'window.api' object
   ✅ GET / POST / PATCH / FORM
   ✅ Auth safe
   ✅ Timeout safe
   ✅ HTML fallback protected
===================================================== */

(function () {
  if (window.__apiLoaded) return;
  window.__apiLoaded = true;

  const TIMEOUT = 7000;

  /* =========================
      INTERNAL HELPERS
  ========================= */
  function authHeaders(extra) {
    const token = localStorage.getItem("token");
    const h = extra || {};
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  async function safeJson(res, path) {
    const text = await res.text();

    // 🔥 Express SPA fallback guard
    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      throw new Error("API returned HTML instead of JSON → " + path);
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("Invalid JSON from API:", path, text);
      throw e;
    }
  }

  function withTimeout(promise, path) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API timeout: " + path)), TIMEOUT)
      )
    ]);
  }

  // 🔥 Ensures path always starts with /api/
  function apiUrl(path) {
    return "/api/" + String(path || "").replace(/^\/+/, "");
  }

  /* =========================
      THE API OBJECT
  ========================= */
  const api = {
    
    // GET
    get: function (path) {
      return withTimeout(
        fetch(apiUrl(path), {
          headers: authHeaders()
        }).then(res => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return safeJson(res, path);
        }),
        path
      );
    },

    // POST (JSON)
    post: function (path, body) {
      return fetch(apiUrl(path), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body || {})
      }).then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return safeJson(res, path);
      });
    },

    // POST (FORM DATA)
    postForm: function (path, fd) {
      return fetch(apiUrl(path), {
        method: "POST",
        headers: authHeaders(),
        body: fd
      }).then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return safeJson(res, path);
      });
    },

    // PATCH
    patch: function (path, body) {
      return fetch(apiUrl(path), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body || {})
      }).then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return safeJson(res, path);
      });
    }
  };

  /* =========================
      EXPOSE TO WINDOW
  ========================= */
  // This is the critical fix that connects it to dashboard.js
  window.api = api;
  
  // Optional: Keep old names if other files use them
  window.apiGet = api.get;
  window.apiPost = api.post;

  console.log("✅ api.js loaded & exposed as window.api");
})();
