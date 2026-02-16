/* =====================================================
   api.js — FIXED & HARDENED
===================================================== */

(function () {
  if (window.__apiLoaded) return;
  window.__apiLoaded = true;

  const TIMEOUT = 7000;
  
  // 1. SET YOUR BASE URL HERE
  // If your frontend and backend are on the same port, leave as empty string ""
  // Given your screenshot, this ensures we hit the right server.
  const BASE_URL = "http://16.16.18.115:5000"; 

  /* =========================
      INTERNAL HELPERS
  ========================= */
  function authHeaders(extra) {
    const token = localStorage.getItem("token");
    const h = extra || {};
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  }

  async function safeJson(res, path) {
    const text = await res.text();

    // Catching the "SPA Fallback" (where server sends index.html instead of error)
    if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
      console.error("❌ API Error: Received HTML instead of JSON from:", path);
      throw new Error("Backend route not found (404) or returned HTML.");
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("❌ Invalid JSON from API:", path, "Response:", text);
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

  // FIXED URL BUILDER
  function apiUrl(path) {
    // Remove leading slashes from path
    const cleanPath = String(path || "").replace(/^\/+/, "");
    // Ensure we don't double up on /api/
    const finalPath = cleanPath.startsWith("api/") ? cleanPath : "api/" + cleanPath;
    return BASE_URL + "/" + finalPath;
  }

  /* =========================
      THE API OBJECT
  ========================= */
const api = {
  get: function (path) {
    return withTimeout(
      fetch(apiUrl(path), {
        method: "GET",
        headers: authHeaders()
      }).then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status + " at " + path);
        return safeJson(res, path);
      }),
      path
    );
  },

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

  postForm: function (path, formData) {
    return fetch(apiUrl(path), {
      method: "POST",
      headers: authHeaders(), // ⚠️ DO NOT set Content-Type manually
      body: formData
    }).then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }
};


  window.api = api;
  window.apiGet = api.get;
  window.apiPost = api.post;
window.apiPostForm = api.postForm; 

  console.log("✅ api.js initialized at " + BASE_URL);
})();
