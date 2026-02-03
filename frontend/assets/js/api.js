/* =====================================================
   api.js — GLOBAL API HELPERS (ES5 SAFE)
===================================================== */

function apiGet(url) {
  var token = localStorage.getItem("token");
  return fetch("/api" + url, {
    headers: {
      Authorization: "Bearer " + token
    }
  }).then(function (r) {
    if (!r.ok) throw new Error("API GET failed: " + url);
    return r.json();
  });
}

function apiPost(url, body) {
  var token = localStorage.getItem("token");
  return fetch("/api" + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  }).then(function (r) {
    if (!r.ok) throw new Error("API POST failed: " + url);
    return r.json();
  });
}
