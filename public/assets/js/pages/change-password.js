console.log("change-password.js loaded");

function initChangePassword() {
  const form = document.getElementById("changePasswordForm");
  if (!form) return;

  const msg = document.getElementById("changePasswordMsg");

  // 🔑 Inputs
  const currentPassword = document.getElementById("currentPassword");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");

  // 🔐 Strength UI
  const meterBar = document.getElementById("passwordMeterBar");
  const strengthText = document.getElementById("passwordStrengthText");

  /* =========================
     SHOW / HIDE PASSWORD TOGGLE
  ========================= */
  document.querySelectorAll(".password-toggle").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const input = document.getElementById(toggle.dataset.target);
      if (!input) return;

      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      toggle.textContent = hidden ? "🙈" : "👁";
    });
  });

  /* =========================
     PASSWORD STRENGTH METER
  ========================= */
  if (newPassword && meterBar && strengthText) {
    newPassword.addEventListener("input", () => {
      const s = calculateStrength(newPassword.value);

      meterBar.style.width = s.score + "%";
      meterBar.style.backgroundColor = s.color;

      strengthText.textContent = s.label;
      strengthText.style.color = s.color;
    });
  }

  /* =========================
     FORM SUBMIT
  ========================= */
  form.onsubmit = async e => {
    e.preventDefault();

    const current = currentPassword.value;
    const next = newPassword.value;
    const confirm = confirmPassword.value;

    if (next !== confirm) {
      msg.innerHTML = `
        <div class="alert alert-warning">
          Passwords do not match
        </div>`;
      return;
    }

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      msg.innerHTML = `
        <div class="alert alert-success">
          Password updated successfully
        </div>`;

      form.reset();
      meterBar.style.width = "0%";
      strengthText.textContent = "";

    } catch (err) {
      msg.innerHTML = `
        <div class="alert alert-danger">
          ${err.message || "Failed to update password"}
        </div>`;
    }
  };
}

/* =========================
   PASSWORD STRENGTH LOGIC
========================= */
function calculateStrength(password) {
  let score = 0;

  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[a-z]/.test(password)) score += 20;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 15;

  if (score >= 80)
    return { score, label: "Strong", color: "#16a34a" };
  if (score >= 50)
    return { score, label: "Medium", color: "#f59e0b" };
  return { score, label: "Weak", color: "#dc2626" };
}

// 🔥 SPA hook
window.initChangePassword = initChangePassword;
