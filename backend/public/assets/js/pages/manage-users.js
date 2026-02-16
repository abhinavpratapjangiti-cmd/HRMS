/* =========================================
   CONFIGURATION & AUTH
   ========================================= */
const API_BASE = "http://16.16.18.115:5000"; // Ensure this matches your server IP

const getHeaders = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
});

/* =========================================
   1. INITIALIZATION
   ========================================= */
document.addEventListener("DOMContentLoaded", () => {
    console.log("HRMS Manager Initialized");
    // Trigger initial load
    if (typeof window.refreshAll === 'function') {
        window.refreshAll();
    }
});

window.refreshAll = function() {
    loadEmployees();
    loadStats();
    loadDepartmentDistribution();
};

/* =========================================
   2. LOAD DATA
   ========================================= */
async function loadEmployees() {
    const tableBody = document.getElementById("employeesList");
    tableBody.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Loading directory...</div></div>';

    try {
        const res = await fetch(`${API_BASE}/api/users`, { headers: getHeaders() });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        const employees = Array.isArray(data) ? data : (data.employees || data.users || []);

        if (employees.length === 0) {
            tableBody.innerHTML = '<div class="text-center text-muted py-5">No employees found.</div>';
            return;
        }

        renderTable(employees);
        updateManagerDropdown(employees);
        calculateStatsLocally(employees);

    } catch (error) {
        console.error("Error loading employees:", error);
        tableBody.innerHTML = '<div class="text-center text-danger py-5">Error loading data. Check console (F12).</div>';
    }
}

async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/api/users/stats`, { headers: getHeaders() });
        if (!res.ok) return;

        const data = await res.json();
        const statsBox = document.getElementById("orgStats");

        if (statsBox && data) {
            // Backend now handles the correct "Managers" and "Active" counts logic
            statsBox.innerHTML = `
                <div class="stat-row"><span>Total Employees</span><span class="fw-bold">${data.total || 0}</span></div>
                <div class="stat-row"><span>Managers</span><span class="fw-bold">${data.managers || 0}</span></div>
                <div class="stat-row text-success"><span>Active Users</span><span class="fw-bold">${data.active || 0}</span></div>
            `;
        }
    } catch (e) {
        console.warn("Stats API error", e);
    }
}

async function loadDepartmentDistribution() {
    let container = document.getElementById("deptDistribution");
    // Fallback search if ID is missing (robustness)
    if (!container) {
         const allDivs = document.querySelectorAll('.card-body');
         for (let div of allDivs) {
             if (div.innerText.includes("Loading charts")) {
                 container = div;
                 break;
             }
         }
    }
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/api/users/departments`, { headers: getHeaders() });
        const data = await res.json();

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-muted small text-center py-3">No department data</div>';
            return;
        }

        container.innerHTML = data.map(d => `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span>${d.department}</span>
                <span class="badge bg-primary rounded-pill">${d.count}</span>
            </div>
        `).join('');

    } catch (e) {
        console.error("Dept Load Error:", e);
        container.innerHTML = '<div class="text-danger small text-center">Failed to load</div>';
    }
}

/* =========================================
   3. RENDER UI
   ========================================= */
function renderTable(employees) {
    const container = document.getElementById("employeesList");
    container.innerHTML = "";

    employees.forEach(emp => {
        // Safe Data Extraction
        const name = emp.name || emp.username || "Unknown";
        const email = emp.email || "No Email";
        const role = emp.role || "employee";
        const userId = emp.user_id || emp.id;
        const employeeId = emp.employee_id || emp.id;
        const department = emp.department || "IT";
        const managerId = emp.manager_id || "";
        const designation = emp.designation || ""; 
        const managerName = emp.manager_name || "No Manager";

        const row = document.createElement("div");
        row.className = "employee-row border-bottom py-3";

        // Escape strings to prevent JS syntax errors in onclick
        const safeName = name.replace(/'/g, "\\'");
        const safeEmail = email.replace(/'/g, "\\'");
        const safeRole = role.replace(/'/g, "\\'");
        const safeDept = department.replace(/'/g, "\\'");
        const safeDesig = designation.replace(/'/g, "\\'");

        row.innerHTML = `
            <div class="row align-items-center">
                <div class="col-md-3">
                    <div class="fw-bold text-dark text-truncate" title="${name}">${name}</div>
                    <div class="small text-muted text-truncate" title="${email}">${email}</div>
                    ${designation ? `<div class="small text-primary fst-italic text-truncate">${designation}</div>` : ''}
                </div>

                <div class="col-md-2">
                    <span class="badge bg-light text-dark border text-uppercase mb-1">${role}</span>
                    <div class="small text-muted text-truncate">${department}</div>
                </div>

                <div class="col-md-2">
                     <small class="text-muted">
                        <i class="fa fa-circle ${emp.active ? 'text-success' : 'text-danger'} me-1" style="font-size: 8px;"></i>
                        ${emp.active ? 'Active' : 'Inactive'}
                     </small>
                </div>

                <div class="col-md-3">
                    <div class="small text-uppercase text-muted" style="font-size: 0.65rem; font-weight: 700;">Reporting To</div>
                    <div class="fw-medium text-dark text-truncate" title="${managerName}">
                        <i class="fa-solid fa-user-tie text-secondary me-1"></i> ${managerName}
                    </div>
                </div>

                <div class="col-md-2 text-end">
                    <button class="btn btn-sm btn-outline-primary me-1"
                            title="Edit User"
                            onclick="window.openEditModal('${userId}', '${employeeId}', '${safeName}', '${safeEmail}', '${safeRole}', '${managerId}', '${safeDept}', '${safeDesig}')">
                        <i class="fa fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger"
                            title="Delete User"
                            onclick="window.deleteEmployee('${employeeId}')">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>`;
        container.appendChild(row);
    });
}

function updateManagerDropdown(employees) {
    const createSelect = document.getElementById("createManager");
    const editSelect = document.getElementById("edit-manager");
    const defaultOption = '<option value="">No reporting manager</option>';

    // Allow Admin, HR, Manager, and technically 'intern' if they are set as a manager in DB
    const managers = employees.filter(e => ['manager', 'admin', 'hr'].includes((e.role || '').toLowerCase()));

    const managerOptions = managers.map(m => `<option value="${m.employee_id || m.id}">${m.name}</option>`).join('');

    if (createSelect) createSelect.innerHTML = defaultOption + managerOptions;
    if (editSelect) editSelect.innerHTML = defaultOption + managerOptions;
}

function calculateStatsLocally(employees) {
    // This is a visual fallback. The real source of truth is the loadStats() function 
    // which calls the backend, but this updates the UI instantly if the user just created someone.
    const statsBox = document.getElementById("orgStats");
    if (statsBox && statsBox.innerText.includes("Loading")) {
        const total = employees.length;
        const managers = employees.filter(e => (e.role || '').toLowerCase() === 'manager').length;
        const active = employees.filter(e => e.active).length;

        statsBox.innerHTML = `
            <div class="stat-row"><span>Total Employees</span><span class="fw-bold">${total}</span></div>
            <div class="stat-row"><span>Managers</span><span class="fw-bold">${managers}</span></div>
            <div class="stat-row text-success"><span>Active Users</span><span class="fw-bold">${active}</span></div>
        `;
    }
}

/* =========================================
   4. ACTIONS (Create, Edit, Delete)
   ========================================= */
window.createUser = async function() {
    const btn = document.getElementById("createBtn");
    
    // Gather values
    const payload = {
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value || "Welcome123",
        role: document.getElementById("role").value,
        department: document.getElementById("department").value,
        designation: document.getElementById("designation") ? document.getElementById("designation").value.trim() : "",
        client_name: document.getElementById("client").value || "Internal",
        manager_id: document.getElementById("createManager").value || null
    };

    if (!payload.name || !payload.email) {
        alert("Please fill in Name and Email.");
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/users`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok) {
            alert("User created successfully!");
            // Clear inputs
            document.getElementById("name").value = "";
            document.getElementById("email").value = "";
            document.getElementById("password").value = "";
            if(document.getElementById("designation")) document.getElementById("designation").value = "";
            refreshAll();
        } else {
            alert("Error: " + (result.message || "Failed to create user"));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error: Check console");
    } finally {
        btn.disabled = false;
    }
};

window.openEditModal = function(userId, employeeId, name, email, role, managerId, department, designation) {
    // Populate hidden IDs
    document.getElementById("edit-id").value = userId;
    document.getElementById("edit-emp-id").value = employeeId;
    
    // Populate Editable Fields
    document.getElementById("edit-name").value = name;
    document.getElementById("edit-email").value = email;
    document.getElementById("edit-role").value = (role || 'employee').toLowerCase();
    
    // Check existence before setting value to avoid null errors
    if(document.getElementById("edit-department")) document.getElementById("edit-department").value = department || "IT";
    if(document.getElementById("edit-designation")) document.getElementById("edit-designation").value = designation || "";
    if(document.getElementById("edit-manager")) document.getElementById("edit-manager").value = managerId || "";

    // Show Bootstrap Modal
    const modalEl = document.getElementById('editModal');
    if (modalEl) {
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) {
            modal = new bootstrap.Modal(modalEl);
        }
        modal.show();
    }
};

window.saveEdit = async function() {
    const userId = document.getElementById("edit-id").value;
    const employeeId = document.getElementById("edit-emp-id").value;
    
    // Get Editable Values
    const newName = document.getElementById("edit-name").value.trim();
    const newEmail = document.getElementById("edit-email").value.trim();
    const newRole = document.getElementById("edit-role").value;
    const newDept = document.getElementById("edit-department").value;
    const newDesignation = document.getElementById("edit-designation").value.trim();
    const newManager = document.getElementById("edit-manager").value || null;

    try {
        const promises = [];

        // 1. Update User Role (Access Level)
        if (newRole) {
            promises.push(
                fetch(`${API_BASE}/api/users/${userId}/role`, {
                    method: "PATCH",
                    headers: getHeaders(),
                    body: JSON.stringify({ role: newRole })
                })
            );
        }

        // 2. Update Employee Profile Details (Consolidated Request)
        // This includes Name, Email, Dept, Designation, and Manager
        const employeePayload = {
            name: newName,
            email: newEmail,
            department: newDept,
            designation: newDesignation,
            manager_id: newManager
        };

        promises.push(
            fetch(`${API_BASE}/api/users/${employeeId}`, { 
                method: "PATCH", 
                headers: getHeaders(),
                body: JSON.stringify(employeePayload)
            })
        );

        await Promise.all(promises);

        const modalEl = document.getElementById('editModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        alert("Updates saved successfully.");
        refreshAll();

    } catch (e) {
        console.error(e);
        alert("Network Error: Could not connect to server or update failed.");
    }
};

window.deleteEmployee = async function(employeeId) {
    if (!confirm("Are you sure you want to delete this employee? This action cannot be undone.")) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/users/${employeeId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        const result = await response.json();

        if (response.ok) {
            alert("Employee deleted successfully!");
            window.refreshAll();
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch (error) {
        console.error("Delete failed:", error);
        alert("Server error. Please check the console.");
    }
};
