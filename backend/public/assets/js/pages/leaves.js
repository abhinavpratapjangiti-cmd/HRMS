// public/assets/js/pages/leaves.js
console.log("leaves.js loaded");

/* SAFE TOAST WRAPPERS */
function notifySuccess(title, message) {
  if (typeof window.showSuccessToast === "function") {
    window.showSuccessToast(title, message);
  } else {
    console.log("SUCCESS:", title, message);
  }
}
function notifyError(title, message) {
  if (typeof window.showErrorToast === "function") {
    window.showErrorToast(title, message);
  } else {
    console.error("ERROR:", title, message);
  }
}

/* small helper to call API, uses global apiGet/apiPost if provided */
async function apiGetOrFetch(path) {
  if (typeof apiGet === "function") return apiGet(path);
  const token = localStorage.getItem("token");
  const res = await fetch("/api" + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error((await res.json()).message || "Request failed");
  return res.json();
}
async function apiPostOrFetch(path, body) {
  if (typeof apiPost === "function") return apiPost(path, body);
  const token = localStorage.getItem("token");
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let errMsg = "Request failed";
    try { errMsg = (await res.json()).message || errMsg; } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}

/* PAGE INIT (SPA SAFE) */
function initLeaves() {
  console.log("initLeaves called");

  const form = document.getElementById("leaveForm");
  if (!form) return;
  if (form.dataset.bound) return;
  form.dataset.bound = "true";

  const fromEl = document.getElementById("fromDate");
  const toEl = document.getElementById("toDate");
  const leaveTypeEl = document.getElementById("leaveType");
  const reasonEl = document.getElementById("reason");
  const msgEl = document.getElementById("msg");
  const durationEl = document.getElementById("leaveDuration");
  const submitBtn = form.querySelector("button[type='submit']");

  function setMsg(text, type = "info") {
    if (!msgEl) return;
    msgEl.innerHTML = `<div class="leave-msg ${type}">${text}</div>`;
  }

  function updateDuration() {
    if (!durationEl) return;
    if (!fromEl.value || !toEl.value) {
      durationEl.innerText = "Select start and end date";
      return;
    }
    const from = new Date(fromEl.value);
    const to = new Date(toEl.value);
    if (to < from) {
      durationEl.innerText = "Invalid range";
      return;
    }
    const days = Math.floor((to - from) / 86400000) + 1;
    durationEl.innerText = `${days} day${days > 1 ? "s" : ""} selected`;
  }

  fromEl && fromEl.addEventListener("change", updateDuration);
  toEl && toEl.addEventListener("change", updateDuration);
async function loadLeaveBalance() {
  const token = localStorage.getItem("token");
  if (!token) {
    console.warn("No token yet, skipping leave balance load");
    return;
  }

  try {
    const balances = await apiGetOrFetch("/leaves/balance");

    leaveTypeEl.innerHTML = `<option value="">Select leave type</option>`;
    (balances || []).forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.leave_type;
      opt.textContent = `${b.name} (${b.balance} left)`;
      leaveTypeEl.appendChild(opt);
    });
  } catch (err) {
    console.error("Leave balance load failed:", err);
    notifyError("Leave Balance", "Unable to load leave balance");
    setMsg("Unable to load leave balance", "error");
  }
}


  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const from_date = fromEl.value;
    const to_date = toEl.value;
    const leave_type = leaveTypeEl.value;
    const reason = (reasonEl.value || "").trim();

    if (!from_date || !to_date || !leave_type) {
      notifyError("Validation", "Please fill all required fields");
      setMsg("Please fill all required fields", "warning");
      return;
    }

    if (new Date(from_date) > new Date(to_date)) {
      notifyError("Validation", "From date cannot be after To date");
      setMsg("From date cannot be after To date", "error");
      return;
    }

    submitBtn.disabled = true;
    const prevText = submitBtn.innerText;
    submitBtn.innerText = "Applying…";

    try {
      // IMPORTANT: call the backend route that we defined: POST /api/leaves/apply
      const payload = { from_date, to_date, leave_type, reason };
      console.log("Applying leave:", payload);

      const res = await apiPostOrFetch("/leaves/apply", payload);

      notifySuccess("Leave Applied", res.message || "Leave applied successfully");
      setMsg(res.message || "Leave applied successfully", "success");

      form.reset();
      updateDuration();
      await loadLeaveBalance();
    } catch (err) {
      console.error("Leave apply failed:", err);
      notifyError("Leave Apply Failed", err.message || "Server error");
      setMsg(err.message || "Server error. Try again later.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = prevText || "Apply Leave";
    }
  });

  // initial load
  loadLeaveBalance();
}

/* Required by SPA router */
window.initLeaves = initLeaves;
