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
   PAGE INIT
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
   PROFILE DATA LOADERS
========================= */
async function loadEmployeeProfile() {
  try {
    const ctx = getProfileContext();
    const emp = ctx.type === "employee" 
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
    const initials = emp.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    setText("profileInitials", initials);
  } catch { console.warn("Profile API unavailable"); }
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
    if (!events || !events.length) { el.innerHTML = `<span class="muted">No timeline data</span>`; return; }
    el.innerHTML = events.map(e => `
        <div class="timeline-item">
          <strong>${e.label}</strong>
          <small>${formatDate(e.date)}</small>
        </div>`).join("");
  } catch { el.innerHTML = `<span class="muted">Timeline unavailable</span>`; }
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
   CV HANDLING (SMART PREVIEW & DOWNLOAD)
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
    try {
      const fd = new FormData();
      fd.append("cv", fileInput.files[0]);
      await apiPostForm("/documents/cv", fd);
      statusEl.innerText = "Uploaded";
      // Auto-refresh the view logic
      checkCVStatus(); 
    } catch (error) {
      console.error("CV Upload Error:", error);
      statusEl.innerText = "Upload failed";
    }
    fileInput.value = "";
  };
}

function bindCVView() {
  const btn = document.getElementById("viewCvBtn");
  if (!btn) return;

  btn.onclick = async () => {
    const originalText = btn.innerText;
    btn.innerText = "Opening...";

    try {
      const res = await fetch("/api/documents/cv/my", {
        headers: { Authorization: "Bearer " + localStorage.getItem("token") }
      });

      if (!res.ok) throw new Error("Failed to fetch CV");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // --- FILE TYPE DETECTION ---
      // We read the first few bytes to guess the file type reliably
      const buffer = await blob.arrayBuffer();
      const arr = new Uint8Array(buffer).subarray(0, 4);
      let header = "";
      for(let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16);
      }

      // Check for PDF signature (%PDF = 25 50 44 46)
      const isPdf = header.startsWith("25504446");
      
      openCvModal(url, isPdf ? "pdf" : "docx");

    } catch (err) {
      console.error("CV View Error:", err);
      alert("Could not load CV. Please upload one first.");
    } finally {
      btn.innerText = originalText;
    }
  };
}

async function checkCVStatus() {
  const el = document.getElementById("cvStatus");
  if (!el) return;
  try {
    const res = await fetch("/api/documents/cv/my", {
        method: "GET",
        headers: { Authorization: "Bearer " + localStorage.getItem("token") }
    });
    if (res.ok) el.innerText = "Uploaded";
    else el.innerText = "Not uploaded";
  } catch { el.innerText = "Not uploaded"; }
}

/* =========================
   TABS & HELPERS
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

function setText(id, value) { const el = document.getElementById(id); if (el) el.innerText = value ?? "—"; }
function formatDate(d) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }

window.logoutAllDevices = async () => {
  if (!confirm("Logout from all devices?")) return;
  try { await apiPost("/auth/logout-all"); } catch {}
  localStorage.clear();
  location.href = "/index.html";
};

/* =========================
   MODAL LOGIC (AUTO-DETECT)
========================= */
function openCvModal(fileUrl, type) {
  const modal = document.getElementById("cvModal");
  const iframe = document.getElementById("cvPreviewFrame");
  const downloadBtn = document.getElementById("cvDownloadBtn");

  if (!modal) return;

  downloadBtn.href = fileUrl;

  if (type === "pdf") {
    // PDF: Show Preview and set download as .pdf
    iframe.style.display = "block";
    iframe.src = fileUrl;
    downloadBtn.setAttribute("download", "My_CV.pdf");
    
    // Hide error message if present
    const msg = document.getElementById("cvNoPreviewMsg");
    if(msg) msg.style.display = "none";

  } else {
    // Word/Other: Hide Preview, Show Message, Fix Download Link
    iframe.style.display = "none";
    downloadBtn.setAttribute("download", "My_CV.docx"); // Saves as Docx so Word can open it

    // Check if message already exists, if not create it
    let msg = document.getElementById("cvNoPreviewMsg");
    if (!msg) {
      msg = document.createElement("div");
      msg.id = "cvNoPreviewMsg";
      msg.style.padding = "50px";
      msg.style.textAlign = "center";
      msg.innerHTML = `
        <h3 style="color: #444;">Preview Available for PDF Only</h3>
        <p style="color: #666; margin-top: 10px;">
          You uploaded a Word Document or another format.<br>
          Browsers cannot preview this file type directly.
        </p>
        <p style="margin-top: 20px; font-weight: bold;">
          Please click "Download" to view it in Word.
        </p>`;
      
      const content = document.querySelector(".modal-content");
      const footer = document.querySelector(".modal-footer");
      content.insertBefore(msg, footer);
    }
    msg.style.display = "block";
  }

  modal.style.display = "flex";
}

window.closeCvModal = () => {
  const modal = document.getElementById("cvModal");
  if (modal) modal.style.display = "none";
  const iframe = document.getElementById("cvPreviewFrame");
  if (iframe) iframe.src = "";
};

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
