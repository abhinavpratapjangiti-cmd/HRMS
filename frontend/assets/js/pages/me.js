console.log("me.js loaded");

/* =========================
   CONTEXT DETECTION (FIX)
========================= */
function getProfileContext() {
  const hash = location.hash;

  if (hash === "#/me") {
    return { type: "self" };
  }

  const match = hash.match(/^#\/employee\/(\d+)/);
  if (match) {
    return { type: "employee", id: match[1] };
  }

  return { type: "self" };
}

/* =========================
   PROFILE ACTIONS
========================= */
window.openEditProfile = () => alert("Edit Profile coming soon");

window.openChangePassword = () => {
  window.location.hash = "#/change-password";
};

/* =========================
   PAGE INIT (SPA SAFE)
========================= */
async function initMe() {
  if (initMe.__ran) return;
  initMe.__ran = true;

  const header = document.getElementById("profileNameHeader");
  if (!header) return;

  initProfileTabs();
  bindCVUpload();
  bindCVView();
  checkCVStatus();

  await loadEmployeeProfile();
  await loadProfileDecisions();
  await loadProfileTimeline();
  await loadProfileAnalytics();

  const imgInput = document.getElementById("profileImageInput");
  if (imgInput && !imgInput.dataset.bound) {
    imgInput.addEventListener("change", previewImage);
    imgInput.dataset.bound = "true";
  }
}

/* =========================
   PROFILE (SSOT)
========================= */
async function loadEmployeeProfile() {
  const ctx = getProfileContext();

  const emp =
    ctx.type === "employee"
      ? await apiGet(`/employees/${ctx.id}`)
      : await apiGet("/employees/me");

  setText("profileNameHeader", emp.name);
  setText("profileEmail", emp.email);
  setText("profileDesignationHeader", emp.designation);

  setText("profileRole", emp.role?.toUpperCase());

  setText("jobDepartment", emp.department);
  setText("jobDesignation", emp.designation);
  setText("jobType", emp.employment_type);

  setText("lastLogin", "Today");

  const statusEl = document.querySelector(".status-badge");
  if (statusEl) statusEl.innerText = emp.status || "Active";

  const initials = emp.name
    ?.split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  setText("profileInitials", initials);
}

/* =========================
   STEP 1: DECISIONS
========================= */
async function loadProfileDecisions() {
  try {
    const d = await apiGet("/decisions/profile");

    toggleBtn("editProfileBtn", d.canEditProfile);
    toggleBtn("applyLeaveBtn", d.canApplyLeave);

    setRisk("attritionRisk", d.attritionRisk);
    setRisk("leaveRisk", d.leaveRisk);

    if (d.managerLoad) {
      setText("managerTeamSize", d.managerLoad.teamSize);
      setRisk("managerLoadRisk", d.managerLoad.risk);
    }
  } catch {
    console.warn("Decision engine unavailable");
  }
}

function toggleBtn(id, enabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = !enabled;
}

function setRisk(id, value) {
  const el = document.getElementById(id);
  if (!el || !value) return;
  el.innerText = value;
  el.className = `risk-badge ${value.toLowerCase()}`;
}

/* =========================
   STEP 2: TIMELINE (FIXED)
========================= */
async function loadProfileTimeline() {
  const el = document.getElementById("profileTimeline");
  if (!el) return;

  const ctx = getProfileContext();

  try {
    const events =
      ctx.type === "employee"
        ? await apiGet(`/employees/${ctx.id}/timeline`)
        : await apiGet("/employees/me/timeline");

    el.innerHTML = events.length
      ? events
          .map(
            e => `
        <div class="timeline-item">
          <span class="timeline-dot"></span>
          <div>
            <strong>${e.label}</strong>
            <small>${formatDate(e.date)}</small>
          </div>
        </div>`
          )
          .join("")
      : `<span class="muted">No timeline data</span>`;
  } catch {
    el.innerHTML = `<span class="muted">Timeline unavailable</span>`;
  }
}

/* =========================
   STEP 3: PROFILE ANALYTICS
========================= */
async function loadProfileAnalytics() {
  try {
    const m = await apiGet("/analytics/profile");

    setText("metricBillability", m.billability + "%");
    setText("metricBenchRisk", m.benchRisk);
    setText("metricLeaveTrend", m.leaveTrend);
  } catch {
    setText("metricBillability", "—");
    setText("metricBenchRisk", "—");
    setText("metricLeaveTrend", "—");
  }
}

/* =========================
   CV HANDLING
========================= */
function bindCVUpload() {
  const uploadBtn = document.getElementById("uploadCvBtn");
  const fileInput = document.getElementById("cvFile");
  const statusEl = document.getElementById("cvStatus");

  if (!uploadBtn || !fileInput) return;

  uploadBtn.onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    if (!fileInput.files[0]) return;

    const fd = new FormData();
    fd.append("cv", fileInput.files[0]);
    statusEl.innerText = "Uploading…";

    try {
      const res = await fetch("/api/documents/cv", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        },
        body: fd
      });

      if (!res.ok) throw new Error();
      statusEl.innerText = "Uploaded";
    } catch {
      statusEl.innerText = "Upload failed";
    } finally {
      fileInput.value = "";
    }
  };
}

function bindCVView() {
  const btn = document.getElementById("viewCvBtn");
  if (!btn) return;

  btn.onclick = async () => {
    const res = await fetch("/api/documents/cv/my", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });
    if (!res.ok) return;
    window.open(URL.createObjectURL(await res.blob()), "_blank");
  };
}

async function checkCVStatus() {
  const el = document.getElementById("cvStatus");
  if (!el) return;

  const res = await fetch("/api/documents/cv/my", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  el.innerText = res.ok ? "Uploaded" : "Not uploaded";
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
   IMAGE PREVIEW
========================= */
function previewImage(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const avatar = document.getElementById("profileAvatar");
    if (avatar) avatar.style.backgroundImage = `url(${reader.result})`;
    const i = document.getElementById("profileInitials");
    if (i) i.style.display = "none";
  };
  reader.readAsDataURL(file);
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

window.initMe = initMe;
