console.log("manage-users.js loaded");

/* =========================
   PAGE INIT (SPA SAFE)
========================= */
async function initManageUsers() {
  console.log("initManageUsers called");

  try {
    await Promise.all([
      loadOrgSnapshot(),
      loadRecentUsers(),
      loadDepartmentStats(),
      loadManagers()
    ]);
  } catch (err) {
    console.error("Init failed", err);
  }
}

/* REQUIRED BY ROUTER */
window.initManageUsers = initManageUsers;

/* =========================
   CREATE USER
========================= */
window.createUser = async function () {
  const btn = document.querySelector("button[onclick='createUser()']");
  if (btn?.disabled) return;

  const name = document.getElementById("name")?.value.trim();
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  const department = document.getElementById("department")?.value.trim();
  const client_name = document.getElementById("clientName")?.value.trim();
  const work_location = document.getElementById("workLocation")?.value.trim();
  const role = document.getElementById("role")?.value;
  const manager_id = document.getElementById("createManager")?.value || null;

  if (!name || !email || !role) {
    showErrorToast("Validation Error", "Name, Email and Role are required");
    return;
  }

  let loadingToast = null;

  try {
    btn.disabled = true;
    btn.innerText = "Creating...";

    // ✅ optional loading toast (only if available)
    if (typeof showLoadingToast === "function") {
      loadingToast = showLoadingToast("Creating employee...");
    }

    await apiPost("/users", {
      name,
      email,
      password,
      department,
      client_name,
      work_location,
      role,
      manager_id
    });

    loadingToast?.close();

    showSuccessToast(
      "Employee Created",
      "User account has been successfully created"
    );

    resetCreateForm();
    initManageUsers();

  } catch (err) {
    loadingToast?.close();
    console.error("Create user failed", err);

    showErrorToast(
      "Creation Failed",
      err?.message || "Unable to create employee"
    );
  } finally {
    btn.disabled = false;
    btn.innerText = "Create Employee";
  }
};

/* =========================
   RESET FORM
========================= */
function resetCreateForm() {
  [
    "name",
    "email",
    "password",
    "department",
    "clientName",
    "workLocation"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  document.getElementById("role").value = "employee";
  document.getElementById("createManager").value = "";
}

/* =========================
   ORG SNAPSHOT
========================= */
async function loadOrgSnapshot() {
  try {
    const d = await apiGet("/users/stats");
    document.getElementById("statTotal").innerText = d?.total ?? "-";
    document.getElementById("statManagers").innerText = d?.managers ?? "-";
    document.getElementById("statActive").innerText = d?.active ?? "-";
    document.getElementById("statInactive").innerText = d?.inactive ?? "-";
  } catch {
    console.warn("Org snapshot failed");
  }
}

/* =========================
   RECENT USERS
========================= */
async function loadRecentUsers() {
  const el = document.getElementById("recentUsers");

  try {
    const users = await apiGet("/users/recent");

    el.innerHTML = users.length
      ? users.map(u => `
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span>${u.name}</span>
            <span class="badge bg-secondary">${u.role}</span>
          </div>
        `).join("")
      : `<div class="text-muted">No recent users</div>`;
  } catch {
    el.innerHTML = `<div class="text-muted">Unable to load users</div>`;
  }
}

/* =========================
   DEPARTMENTS
========================= */
async function loadDepartmentStats() {
  const el = document.getElementById("deptStats");

  try {
    const rows = await apiGet("/users/departments");

    el.innerHTML = rows.length
      ? rows.map(d => `
          <div class="d-flex justify-content-between mb-2">
            <span>${d.department || "Unassigned"}</span>
            <strong>${d.count}</strong>
          </div>
        `).join("")
      : `<div class="text-muted">No department data</div>`;
  } catch {
    el.innerHTML = `<div class="text-muted">Unable to load data</div>`;
  }
}

/* =========================
   MANAGERS
========================= */
async function loadManagers() {
  const select = document.getElementById("createManager");
  if (!select) return;

  select.innerHTML = `<option value="">No reporting manager</option>`;

  try {
    const managers = await apiGet("/users?role=manager");

    managers.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
  } catch {
    console.warn("Managers list failed");
  }
}
