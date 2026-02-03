console.log("manage-users.js loaded");

/* =========================
   GLOBAL STATE
========================= */
let MANAGERS_CACHE = [];

/* =========================
   PAGE INIT (SPA SAFE)
========================= */
async function initManageUsers() {
  console.log("initManageUsers called");

  try {
    await Promise.all([
      loadManagers(),
      loadAllEmployees(),
      loadOrgSnapshot(),
      loadRecentUsers()
    ]);
  } catch (err) {
    console.error("Init failed", err);
  }
}

/* =========================
   CREATE EMPLOYEE
========================= */
window.createUser = async function () {
  try {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const managerId = document.getElementById("createManager").value;

    if (!name || !email || !password) {
      alert("Name, email and password are required");
      return;
    }

    const res = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ name, email, password, role })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to create employee");
    }

    const data = await res.json();
    const userId =
  res.id ||
  res.user?.id ||
  res.user_id ||
  res.insertId;

if (!userId) {
  console.error("Create user response:", res);
  throw new Error("User ID missing in response");
}

    // Assign manager only if selected
    if (managerId) {
      await fetch(`/api/users/${userId}/manager`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ manager_id: managerId })
      });
    }

    alert("Employee created successfully");

    // Reset form
    document.getElementById("name").value = "";
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    document.getElementById("role").value = "employee";
    document.getElementById("createManager").value = "";

    // Refresh UI
    loadAllEmployees();
    loadOrgStats();
    loadRecentUsers();

  } catch (err) {
    console.error("Create employee failed:", err);
    alert(err.message || "Create employee failed");
  }
};
/* =========================
   RESET FORM
========================= */
function resetCreateForm() {
  ["name", "email", "password"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  document.getElementById("role").value = "employee";
  document.getElementById("createManager").value = "";
}

/* =========================
   LOAD MANAGERS (CACHE)
========================= */
async function loadManagers() {
  try {
    MANAGERS_CACHE = await apiGet("/users/managers");

    const select = document.getElementById("createManager");
    if (select) {
      select.innerHTML = `<option value="">No reporting manager</option>`;
      MANAGERS_CACHE.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.employee_id;
        opt.textContent = m.name;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.warn("Managers list failed", err);
    MANAGERS_CACHE = [];
  }
}

/* =========================
   LOAD ALL EMPLOYEES
========================= */
async function loadAllEmployees() {
  const el = document.getElementById("employeesList");
  if (!el) return;

  try {
    const employees = await apiGet("/users");

    el.innerHTML = employees.length
      ? employees.map(emp => `
        <div class="employee-row employee-grid">

          <!-- NAME -->
          <div>
            <div class="employee-name">${emp.name}</div>
            <div class="employee-email">${emp.email}</div>
          </div>

          <!-- ROLE -->
          <select class="form-select form-select-sm"
                  onchange="updateUserRole(${emp.user_id}, this.value)">
            ${renderRoleOptions(emp.role)}
          </select>

          <!-- REPORTING MANAGER -->
          <select class="form-select form-select-sm manager-select"
                  onchange="updateReportingManager(${emp.employee_id}, this.value)">
            <option value="">No manager</option>
            ${renderManagerOptions(emp.manager_id)}
          </select>

        </div>
      `).join("")
      : `<div class="text-muted text-center">No employees found</div>`;

  } catch (err) {
    console.error("Load employees failed", err);
    el.innerHTML = `<div class="text-muted text-center">Unable to load employees</div>`;
  }
}

/* =========================
   ROLE OPTIONS
========================= */
function renderRoleOptions(current) {
  return ["employee", "manager", "hr", "admin"]
    .map(r =>
      `<option value="${r}" ${r === current ? "selected" : ""}>${r}</option>`
    )
    .join("");
}

/* =========================
   MANAGER OPTIONS
========================= */
function renderManagerOptions(currentManagerId) {
  return MANAGERS_CACHE
    .map(m =>
      `<option value="${m.employee_id}"
        ${m.employee_id === currentManagerId ? "selected" : ""}>
        ${m.name}
      </option>`
    )
    .join("");
}

/* =========================
   UPDATE ROLE
========================= */
window.updateUserRole = async function (userId, role) {
  try {
    await apiPatch(`/users/${userId}/role`, { role });
    showSuccessToast("Role Updated", "Employee role updated");
    loadOrgSnapshot();
  } catch (err) {
    showErrorToast("Update Failed", err?.message || "Unable to update role");
  }
};

/* =========================
   UPDATE MANAGER
========================= */
window.updateReportingManager = async function (employeeId, managerId) {
  try {
    await apiPatch(`/users/${employeeId}/manager`, {
      manager_id: managerId || null
    });
    showSuccessToast("Updated", "Reporting manager updated");
  } catch (err) {
    showErrorToast("Update Failed", err?.message || "Unable to update manager");
  }
};

/* =========================
   ORGANISATION SNAPSHOT
========================= */
async function loadOrgSnapshot() {
  const el = document.getElementById("orgStats");
  if (!el) return;

  try {
    const stats = await apiGet("/users/stats");

    el.innerHTML = `
      <div class="stat-row"><span>Total Employees</span><span>${stats.total}</span></div>
      <div class="stat-row"><span>Managers</span><span>${stats.managers}</span></div>
      <div class="stat-row text-success"><span>Active</span><span>${stats.active}</span></div>
      <div class="stat-row text-danger"><span>Inactive</span><span>${stats.inactive}</span></div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="text-muted text-center">Unable to load stats</div>`;
  }
}

/* =========================
   RECENT USERS
========================= */
async function loadRecentUsers() {
  const el = document.getElementById("recentUsers");
  if (!el) return;

  try {
    const users = await apiGet("/users/recent");

    el.innerHTML = users.length
      ? users.map(u => `
          <div class="recent-user">
            <span>${u.name}</span>
            <span class="badge-role">${u.role}</span>
          </div>
        `).join("")
      : `<div class="text-muted text-center">No recent users</div>`;

  } catch (err) {
    el.innerHTML = `<div class="text-muted text-center">Unable to load recent users</div>`;
  }
}

/* =========================
   FORCE INIT (SPA)
========================= */
if (window.location.hash === "#/manage-users") {
  initManageUsers();
}
