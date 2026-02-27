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
/* =========================
   EDIT PROFILE MODAL LOGIC
========================= */
window.openEditProfile = () => {
  // 1. Grab current values from the page and populate the inputs
  document.getElementById("editEmail").value = document.getElementById("profileEmail").innerText;
  document.getElementById("editPhoneno").value = document.getElementById("profilephoneno").innerText;
  document.getElementById("editDept").value = document.getElementById("profiledepartment").innerText;
  document.getElementById("editDesig").value = document.getElementById("profiledesignation").innerText;

  // 2. Show the modal
  document.getElementById("editProfileModal").style.display = "flex";
};

window.closeEditProfileModal = () => {
  document.getElementById("editProfileModal").style.display = "none";
};

window.saveProfileChanges = async () => {
  const btn = document.getElementById("saveProfileBtn");
  btn.innerText = "Saving...";
  btn.disabled = true;

  // Gather data from inputs
  const payload = {
    email: document.getElementById("editEmail").value,
    phoneno: document.getElementById("editPhoneno").value,
    department: document.getElementById("editDept").value,
    designation: document.getElementById("editDesig").value,
  };

  try {
    // Determine if user is editing themselves or an admin is editing someone else
    const ctx = getProfileContext();
    const endpoint = ctx.type === "employee" 
      ? `/api/users/${ctx.id}` 
      : `/api/users/me`; 

    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + localStorage.getItem("token") 
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Failed to update profile");

    // Close modal and dynamically reload the UI with new data
    closeEditProfileModal();
    loadEmployeeProfile(); 

    // Optional: If you have a toast notification system
    // showToast("Profile updated successfully", "success");

  } catch (error) {
    console.error("Save Error:", error);
    alert("Could not save changes. Please try again.");
  } finally {
    btn.innerText = "Save Changes";
    btn.disabled = false;
  }
};
window.openChangePassword = () => (location.hash = "#/change-password");

/* =========================
   PAGE INIT - BULLETPROOFED
========================= */
async function initMe() {
  // 🚀 FIX: Don't fail silently. If the router hasn't injected the HTML yet, wait 50ms and try again!
  if (!document.getElementById("profileNameHeader")) {
      setTimeout(initMe, 50);
      return;
  }

  initProfileTabs();
  bindCVUpload();
  bindCVView();

  checkCVStatus();
  loadEmployeeProfile();
  loadProfileDecisions();
  
  // 🚀 NEW: Load Manager and Peers instead of old timeline/analytics
  loadTeamContext();
}

/* =========================
   PROFILE DATA LOADERS
========================= */
async function loadEmployeeProfile() {
  try {
    const ctx = getProfileContext();
    const emp = ctx.type === "employee"
      ? await window.apiGet(`/employees/${ctx.id}`)
      : await window.apiGet("/employees/me");

console.log("Data from Server:", emp);

    if (!emp) return;
    
    // Core Info
    setText("profileNameHeader", emp.name);
    setText("profileEmail", emp.email);
    setText("profileDesignationHeader", emp.designation);
    setText("profileRole", emp.role?.toUpperCase());
    setText("profiledepartment", emp.department);
    setText("profiledesignation", emp.designation);
    setText("profilephoneno", emp.phoneno);
    setText("lastLogin", "Today");

    // Initials & Avatar Logic
    const initials = emp.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    setText("profileInitials", initials);
    
    // Update Risk Badges if data exists
    if (emp.attritionRisk) {
        const riskEl = document.getElementById("attritionRisk");
        riskEl.innerText = emp.attritionRisk.toUpperCase();
        riskEl.className = `risk-badge ${emp.attritionRisk.toLowerCase()}`;
    }

  } catch (err) { 
    console.warn("Profile API unavailable", err); 
  }
}

/* =========================
   DECISIONS
========================= */
async function loadProfileDecisions() {
  try {
    const d = await window.apiGet("/decisions/profile");
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
   NEW: TEAM CONTEXT (Manager & Peers)
========================= */
async function loadTeamContext() {
  const container = document.getElementById("teamContextContainer");
  if (!container) return;

  try {
    const ctx = getProfileContext();
    const endpoint = ctx.type === "employee" 
      ? `/employees/${ctx.id}/team-context` 
      : `/employees/me/team-context`;

    const res = await window.apiGet(endpoint);
    if (!res) return;

    let html = `<div class="d-flex flex-column" style="gap: 1.5rem;">`;

    // 1. Manager Card
    if (res.manager) {
      html += `
        <div class="manager-section border p-3 rounded bg-light">
          <h6 class="text-muted text-uppercase mb-3" style="font-size: 0.75rem; letter-spacing: 1px;">Reporting Manager</h6>
          <div class="d-flex align-items-center cursor-pointer" onclick="location.hash='#/employee/${res.manager.id}'">
            <div class="rounded-circle bg-primary text-white d-flex justify-content-center align-items-center me-3 shadow-sm" style="width: 45px; height: 45px; font-weight: bold;">
              ${res.manager.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h6 class="mb-0 fw-bold">${res.manager.name}</h6>
              <small class="text-muted">${res.manager.designation || 'Manager'}</small>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `<div class="alert alert-light border text-muted small mb-0">No reporting manager assigned.</div>`;
    }

    // 2. Parallel Peers Grid
    html += `<div class="peers-section">
              <h6 class="text-muted text-uppercase mb-3" style="font-size: 0.75rem; letter-spacing: 1px;">Parallel Team Members</h6>
              <div class="row g-3">`;

    if (res.peers && res.peers.length > 0) {
      res.peers.forEach(p => {
        html += `
          <div class="col-md-6">
            <div class="d-flex align-items-center p-2 border rounded bg-white shadow-sm cursor-pointer hover-shadow" onclick="location.hash='#/employee/${p.id}'">
              <div class="rounded-circle bg-secondary text-white d-flex justify-content-center align-items-center me-3" style="width: 38px; height: 38px; font-size: 0.9rem;">
                ${p.name.charAt(0).toUpperCase()}
              </div>
              <div class="text-truncate">
                <h6 class="mb-0 text-dark" style="font-size: 0.9rem;">${p.name}</h6>
                <small class="text-muted" style="font-size: 0.8rem;">${p.designation || 'Employee'}</small>
              </div>
            </div>
          </div>
        `;
      });
    } else {
      html += `<div class="col-12"><div class="p-2 border rounded bg-light text-muted small">No parallel team members found.</div></div>`;
    }

    html += `</div></div></div>`;
    container.innerHTML = html;

  } catch (e) {
    console.error("Team Context Error:", e);
    container.innerHTML = `<span class="text-danger small">Failed to load team context.</span>`;
  }
}

/* =========================
   CV HANDLING
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
      await window.apiPostForm("/documents/cv", fd);
      statusEl.innerText = "Uploaded";
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

      const buffer = await blob.arrayBuffer();
      const arr = new Uint8Array(buffer).subarray(0, 4);
      let header = "";
      for(let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16);
      }

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

/* =========================
   MODAL LOGIC
========================= */
function openCvModal(fileUrl, type) {
  const modal = document.getElementById("cvModal");
  const iframe = document.getElementById("cvPreviewFrame");
  const downloadBtn = document.getElementById("cvDownloadBtn");

  if (!modal) return;

  downloadBtn.href = fileUrl;

  if (type === "pdf") {
    iframe.style.display = "block";
    iframe.src = fileUrl;
    downloadBtn.setAttribute("download", "My_CV.pdf");

    const msg = document.getElementById("cvNoPreviewMsg");
    if(msg) msg.style.display = "none";

  } else {
    iframe.style.display = "none";
    downloadBtn.setAttribute("download", "My_CV.docx");

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
  try { await window.apiPost("/auth/logout-all"); } catch {}
  localStorage.clear();
  location.href = "/index.html";
};

/* =========================
   EXPORTS & LISTENERS
========================= */
window.initMe = initMe;

// 🚀 FIX: Auto-trigger on initial load (protects against hard refreshes)
initMe();

// 🚀 FIX: SPA Routing and Global Data Listeners
if (!window.__meListenerAttached) {
    window.__meListenerAttached = true;

    window.addEventListener("hashchange", () => {
        if (window.location.hash === "#/me" || window.location.hash.startsWith("#/employee/")) {
            initMe();
        }
    });

    document.addEventListener("hrms:data-changed", () => {
        if (window.location.hash === "#/me" || window.location.hash.startsWith("#/employee/")) {
            loadEmployeeProfile();
            checkCVStatus();
        }
    });
}

/* ==========================================================================
   GLOBAL SESSION HEARTBEAT & 401 REDIRECT
   Checks every 5 seconds if the session was killed from another device
========================================================================== */
(function startSessionHeartbeat() {
    setInterval(async () => {
        const token = localStorage.getItem("token");
        // If there's no token, they are already logged out
        if (!token) return; 

        try {
            // Ping a very lightweight endpoint just to check if the token is still alive
            const res = await fetch("/api/users/stats", { 
                method: "GET",
                headers: { "Authorization": "Bearer " + token }
            });
            
            // If the server blocks it with 401 (because token_version changed)
            if (res.status === 401) {
                console.warn("Session expired remotely. Redirecting to login...");
                localStorage.clear();
                window.location.replace("/index.html"); // Force exit to login page
            }
        } catch (e) {
            // Ignore network errors so it doesn't log out if the wifi drops for a second
        }
    }, 5000); // 5000 ms = runs every 5 seconds
})();

