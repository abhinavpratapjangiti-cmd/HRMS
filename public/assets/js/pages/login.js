const API = "/api"; // or "http://16.16.18.115:5000/api" if needed

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

      // ---------------------------------------------------------
      // 🔥 RESTART NOTIFICATIONS IMMEDIATELY
      // This wakes up notifications.js now that we have a valid token
      // ---------------------------------------------------------
      if (window.startNotificationPolling) {
          console.log("Restarting notification polling...");
          window.startNotificationPolling();
      }

      // redirect to home
      window.location.href = "/#home";

    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  });
});

/* =====================================================
   🔥 NEW ADDITION: FORGOT PASSWORD FLOW
   Appended below to keep your original code 100% untouched
===================================================== */
document.addEventListener("DOMContentLoaded", function () {
  // Grab the elements for the forgot password UI
  // Note: Ensure these IDs match your HTML!
  var forgotForm = document.getElementById("forgotPasswordForm");
  var forgotEmailInput = document.getElementById("forgotEmail");
  var forgotStatusDiv = document.getElementById("forgotStatusMessage");
  var newPasswordSection = document.getElementById("newPasswordSection");
  var newPasswordInput = document.getElementById("newPasswordInput");
  var submitNewPasswordBtn = document.getElementById("submitNewPasswordBtn");
  var requestResetBtn = document.getElementById("requestResetBtn");

  var pollingInterval = null;

  // If there's no forgot password form on this page, exit gracefully
  if (!forgotForm) return;

  // 1️⃣ Listen for the user requesting a reset
  forgotForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = forgotEmailInput.value.trim();
    
    if (!email) {
      alert("Please enter your email to reset your password.");
      return;
    }

    // Start the process and polling
    checkResetStatus(email);
  });

  // 2️⃣ Function to check status and poll
  async function checkResetStatus(email) {
    try {
      var res = await fetch(API + "/auth/check-reset-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      });
      
      var data = await res.json();

      if (data.status === "REQUEST_SENT" || data.status === "PENDING") {
        forgotStatusDiv.innerHTML = "⏳ Request sent to Admin. Waiting for approval...";
        forgotStatusDiv.style.color = "orange";
        
        // Start polling every 5 seconds if not already polling
        if (!pollingInterval) {
          pollingInterval = setInterval(function() {
            checkResetStatus(email);
          }, 5000);
        }
      } 
      else if (data.status === "APPROVED") {
        // Stop polling!
        if (pollingInterval) clearInterval(pollingInterval);
        
        forgotStatusDiv.innerHTML = "✅ Request Approved! Please enter your new password.";
        forgotStatusDiv.style.color = "green";
        
        // Hide the request button and show the new password fields
        requestResetBtn.style.display = "none";
        forgotEmailInput.disabled = true; 
        newPasswordSection.style.display = "block";
      } 
      else if (data.status === "REJECTED") {
        if (pollingInterval) clearInterval(pollingInterval);
        forgotStatusDiv.innerHTML = "❌ Your request was rejected by the Admin.";
        forgotStatusDiv.style.color = "red";
      } 
      else {
        forgotStatusDiv.innerHTML = data.message || "An error occurred.";
        forgotStatusDiv.style.color = "red";
      }

    } catch (err) {
      console.error("Error checking reset status:", err);
      forgotStatusDiv.innerHTML = "Server error while checking status.";
    }
  }

  // 3️⃣ Listen for the final password submission
  if (submitNewPasswordBtn) {
    submitNewPasswordBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      var email = forgotEmailInput.value.trim();
      var newPassword = newPasswordInput.value.trim();

      if (!newPassword) {
        alert("Please enter a new password.");
        return;
      }

      try {
        var res = await fetch(API + "/auth/reset-password-approved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, newPassword: newPassword })
        });

        var data = await res.json();

        if (res.ok) {
          alert("Success! Password updated. You can now log in.");
          window.location.reload(); // Reload the page to reset the UI back to normal login
        } else {
          alert(data.message || "Failed to update password.");
        }
      } catch (err) {
        console.error("Error updating password:", err);
        alert("Server error while updating password.");
      }
    });
  }
});
