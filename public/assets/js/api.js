/* =====================================================
   api.js — FIXED & HARDENED + GLOBAL EVENT BUS
===================================================== */

(function () {
  if (window.__apiLoaded) return;
  window.__apiLoaded = true;

  const TIMEOUT = 7000;
  const BASE_URL = "http://16.16.18.115:5000";

  /* =========================
      THE GLOBAL EVENT BUS 
  ========================= */
  // 🚀 FIX 1: The Global Broadcaster & Safe DOM Mutator
  window.HRMS = {
    notifyDataChanged: function(detail = {}) {
      const event = new CustomEvent("hrms:data-changed", { detail });
      document.dispatchEvent(event);
      console.log("📢 Global State Changed:", detail);
    },

    safeUpdate: function(elementId, content, isHTML = false) {
      const el = document.getElementById(elementId);
      if (!el) return false; // Fail silently! No more "Cannot read properties of null"
      if (isHTML) el.innerHTML = content;
      else el.textContent = content;
      return true;
    }
  };

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

  function apiUrl(path) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
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
      }).then(async res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await safeJson(res, path);
        // 🚀 FIX 2: Auto-trigger global refresh on successful POST!
        window.HRMS.notifyDataChanged({ method: 'POST', path: path });
        return data;
      });
    },

    // 🚀 FIX 3: Added a PUT method so your Approvals/Rejections auto-refresh!
    put: function (path, body) {
      return fetch(apiUrl(path), {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body || {})
      }).then(async res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await safeJson(res, path);
        // Auto-trigger global refresh on successful PUT!
        window.HRMS.notifyDataChanged({ method: 'PUT', path: path });
        return data;
      });
    },

    postForm: function (path, formData) {
      return fetch(apiUrl(path), {
        method: "POST",
        headers: authHeaders(), 
        body: formData
      }).then(async res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        // Auto-trigger global refresh on successful form submission!
        window.HRMS.notifyDataChanged({ method: 'POST_FORM', path: path });
        return data;
      });
    }
  };

  window.api = api;
  window.apiGet = api.get;
  window.apiPost = api.post;
  window.apiPut = api.put;
  window.apiPostForm = api.postForm;

  console.log("✅ api.js initialized at " + BASE_URL);
})();
