const API = "/api";

document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value.trim();

    if (!email || !password) {
      alert("Email and password are required");
      return;
    }

    try {
      var res = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password })
      });

      var data = await res.json();

      if (!res.ok) {
        alert(data.message || "Login failed");
        return;
      }

      // ✅ SINGLE SOURCE OF TRUTH
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

console.log("Login successful, token stored");

      // redirect to home
      window.location.href = "/#home";

    } catch (err) {
      alert("Server error");
    }
  });
});
