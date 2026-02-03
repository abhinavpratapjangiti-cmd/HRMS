console.log("leaves.js loaded");

/* =========================
   PAGE INIT (SPA SAFE)
========================= */
function initLeaves() {
  console.log("initLeaves called");

  const form = document.getElementById("leaveForm");
  if (!form || form.dataset.bound) return; // 🔒 prevent double binding
  form.dataset.bound = "true";

  const fromEl = document.getElementById("fromDate");
  const toEl = document.getElementById("toDate");
  const leaveTypeEl = document.getElementById("leaveType");
  const reasonEl = document.getElementById("reason");
  const msgEl = document.getElementById("msg");
  const durationEl = document.getElementById("leaveDuration");
  const submitBtn = form.querySelector("button[type='submit']");

  /* =========================
     INLINE MESSAGE (MODERN)
  ========================= */
  function setMsg(text, type = "info") {
    msgEl.innerHTML = `
      <div class="leave-msg ${type}">
        ${text}
      </div>
    `;
  }

  /* =========================
     LEAVE DURATION
  ========================= */
  function updateDuration() {
    if (!durationEl) return;

    const from = new Date(fromEl.value);
    const to = new Date(toEl.value);

    if (!fromEl.value || !toEl.value || to < from) {
      durationEl.innerText = "Select start and end date";
      return;
    }

    const days = Math.floor((to - from) / 86400000) + 1;
    durationEl.innerText =
      `${days} day${days > 1 ? "s" : ""} selected`;
  }

  fromEl.addEventListener("change", updateDuration);
  toEl.addEventListener("change", updateDuration);

  /* =========================
     FORM SUBMIT
  ========================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const from_date = fromEl.value;
    const to_date = toEl.value;
    const leave_type = leaveTypeEl.value;
    const reason = reasonEl.value.trim();

    if (!from_date || !to_date || !leave_type) {
      setMsg("Please fill all required fields", "warning");
      return;
    }

    if (new Date(from_date) > new Date(to_date)) {
      setMsg("From date cannot be after To date", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Applying…";

    try {
      const res = await apiPost("/leaves/apply", {
        from_date,
        to_date,
        leave_type,
        reason
      });

      setMsg(res.message || "Leave applied successfully", "success");
      form.reset();
      updateDuration();

    } catch (err) {
      console.error("Leave apply failed:", err);
      setMsg(
        err.message || "Server error. Try again later.",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Apply Leave";
    }
  });
}

/* =========================
   REQUIRED FOR SPA ROUTER
========================= */
window.initLeaves = initLeaves;
