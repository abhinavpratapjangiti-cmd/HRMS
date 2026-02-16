console.log("me.js loaded");

/* =========================
   CONTEXT DETECTION
========================= */
function getProfileContext() {
  const hash = location.hash;
  if (hash === "#/me") return { type: "self" };

  const match = hash.match(/^#\/employee\/(\d+)/);
  if (match) return { type: "employee", id: match[1] };

  return { type: "self" };
}

/* =========================
   PROFILE ACTIONS
========================= */
window.openEditProfile = () => alert("Edit Profile coming soon");
window.openChangePassword = () => (location.hash = "#/change-password");

/* =========================
   PAGE INIT (SPA SAFE)
========================= */
async function initMe() {
  if (initMe.__ran) return;
  initMe.__ran = true;

  if (!document.getElementById("profileNameHeader")) return;

  initProfileTabs();
  bindCVUpload();
  bindCVView();

  checkCVStatus();
  loadEmployeeProfile();
  loadProfileDecisions();
  loadProfileTimeline();
  loadProfileAnalytics();
}

/* =========================
   PROFILE
========================= */
async function loadEmployeeProfile() {
  try {
    const ctx = getProfileContext();
    const emp =
      ctx.type === "employee"
        ? await apiGet(`/employees/${ctx.id}`)
        : await apiGet("/employees/me");

    if (!emp) return;

    setText("profileNameHeader", emp.name);
    setText("profileEmail", emp.email);
    setText("profileDesignationHeader", emp.designation);
    setText("profileRole", emp.role?.toUpperCase());
    setText("jobDepartment", emp.department);
    setText("jobDesignation", emp.designation);
    setText("jobType", emp.employment_type);
    setText("lastLogin", "Today");

    const initials = emp.name
      ?.split(" ")
      .map(w => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    setText("profileInitials", initials);
  } catch {
    console.warn("Profile API unavailable");
  }
}

/* =========================
   DECISIONS
========================= */
async function loadProfileDecisions() {
  try {
    const d = await apiGet("/decisions/profile");
    if (!d) return;
    toggleBtn("editProfileBtn", d.canEditProfile);
    toggleBtn("applyLeaveBtn", d.canApplyLeave);
  } catch {}
}

function toggleBtn(id, enabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = !enabled;
}

/* =========================
   TIMELINE
========================= */
async function loadProfileTimeline() {
  const el = document.getElementById("profileTimeline");
  if (!el) return;

  try {
    const events = await apiGet("/employees/me/timeline");
    if (!events || !events.length) {
      el.innerHTML = `<span class="muted">No timeline data</span>`;
      return;
    }

    el.innerHTML = events
      .map(
        e => `
        <div class="timeline-item">
          <strong>${e.label}</strong>
          <small>${formatDate(e.date)}</small>
        </div>`
      )
      .join("");
  } catch {
    el.innerHTML = `<span class="muted">Timeline unavailable</span>`;
  }
}

/* =========================
   ANALYTICS
========================= */
async function loadProfileAnalytics() {
  try {
    const m = await apiGet("/analytics/profile");
    if (!m) return;
    setText("metricBillability", m.billability + "%");
    setText("metricBenchRisk", m.benchRisk);
    setText("metricLeaveTrend", m.leaveTrend);
  } catch {}
}

/* =========================
   CV HANDLING (FIXED)
========================= */
function bindCVUpload() {
  const uploadBtn = document.getElementById("uploadCvBtn");
  const fileInput = document.getElementById("cvFile");
  const statusEl = document.getElementById("cvStatus");

  if (!uploadBtn || !fileInput || !statusEl) return;

  uploadBtn.onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    if (!fileInput.files[0]) return;

    statusEl.innerText = "Uploading…";

// ... inside bindCVUpload ...
    try {
      const fd = new FormData();
      fd.append("cv", fileInput.files[0]); 

      await apiPostForm("/documents/cv", fd);
      statusEl.innerText = "Uploaded";
    } catch (error) { // Capture the error object
      console.error("CV Upload Error:", error); // Log it to console
      statusEl.innerText = "Upload failed";
    }
// ...

    fileInput.value = "";
  };
}

function bindCVView() {
  const btn = document.getElementById("viewCvBtn");
  if (!btn) return;

  btn.onclick = async () => {
    try {
      const res = await fetch("/api/documents/cv/my", {
        headers: { Authorization: "Bearer " + localStorage.getItem("token") }
      });
      if (!res.ok) return;
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch {}
  };
}

async function checkCVStatus() {
  const el = document.getElementById("cvStatus");
  if (!el) return;

  try {
    await apiGet("/documents/cv/my");
    el.innerText = "Uploaded";
  } catch {
    el.innerText = "Not uploaded";
  }
}

/* =========================
   TABS
========================= */
function initProfileTabs() {
  const tabs = document.querySelectorAll(".top-tabs .tab");
  const contents = document.querySelectorAll(".tab-content");
  if (!tabs.length) return;

  activate("profile");
  tabs.forEach(t => (t.onclick = () => activate(t.dataset.tab)));

  function activate(name) {
    tabs.forEach(t => t.classList.remove("active"));
    contents.forEach(c => c.classList.remove("active"));
    document.querySelector(`[data-tab="${name}"]`)?.classList.add("active");
    document.getElementById(`tab-${name}`)?.classList.add("active");
  }
}

/* =========================
   HELPERS
========================= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value ?? "—";
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/* =========================
   SECURITY
========================= */
window.logoutAllDevices = async () => {
  if (!confirm("Logout from all devices?")) return;
  try {
    await apiPost("/auth/logout-all");
  } catch {}
  localStorage.clear();
  location.href = "/index.html";
};

window.initMe = initMe;
