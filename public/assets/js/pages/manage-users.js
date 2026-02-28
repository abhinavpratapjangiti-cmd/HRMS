/* =========================================
   CONFIGURATION & AUTH
   ========================================= */
// FIX 1: Use window property to prevent "Identifier already declared" crashes
window.API_BASE = "http://16.16.18.115:5000"; 

window.getHeaders = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
});

/* =========================================
   1. INITIALIZATION (Prevents Double Loading)
   ========================================= */
// FIX 2: Check if already initialized to stop duplicate event listeners
if (!window.manageUsersInitialized) {
    window.manageUsersInitialized = true;

    document.addEventListener("DOMContentLoaded", () => {
        console.log("HRMS Manager Initialized");
        if (typeof window.refreshAll === 'function') {
            window.refreshAll();
        }
    });
}

// Make refreshAll global and safe
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
    if (!tableBody) return; // Safety check if page changed

    tableBody.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Loading directory...</div></div>';

    try {
        const res = await fetch(`${window.API_BASE}/api/employees`, { headers: window.getHeaders() });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        const employees = Array.isArray(data) ? data : (data.employees || data.users || []);

        if (employees.length === 0) {
            tableBody.innerHTML = '<div class="text-center text-muted py-5">No employees found.</div>';
            return;
        }

        renderTable(employees);
        updateManagerDropdown(employees);

    } catch (error) {
        console.error("Error loading employees:", error);
        tableBody.innerHTML = '<div class="text-center text-danger py-5">Error loading data. Check console (F12).</div>';
    }
}

async function loadStats() {
    try {
        const res = await fetch(`${window.API_BASE}/api/users/stats`, { headers: window.getHeaders() });
        if (!res.ok) return;

        const data = await res.json();
        const statsBox = document.getElementById("orgStats");

        if (statsBox && data) {
            statsBox.innerHTML = `
                <div class="stat-row"><span>Total Employees</span> <span>:</span> <span class="fw-bold">${data.total || 0}</span></div>
                <div class="stat-row"><span>Managers</span> <span>:</span> <span class="fw-bold">${data.managers || 0}</span></div>
                <div class="stat-row text-success"><span>Active Users</span> <span>:</span> <span class="fw-bold">${data.active || 0}</span></div>
            `;
        }
    } catch (e) {
        console.warn("Stats API error", e);
    }
}

async function loadDepartmentDistribution() {
    let container = document.getElementById("deptDistribution");
    
    // Robust fallback to find container
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
        const res = await fetch(`${window.API_BASE}/api/users/departments`, { headers: window.getHeaders() });
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
        const name = emp.name || emp.username || "Unknown";
        const email = emp.email || "No Email";
        const role = emp.role || "employee";
        const phone = emp.phone || "";
        const empCode = emp.emp_code || "";

        // FIX: Handle both possible ID keys from backend
        let userId = emp.user_id; 
        if (!userId) userId = emp.id; 

        let employeeId = emp.employee_id; // Check specific key first
        if (!employeeId) employeeId = emp.id; // Fallback
        
        const department = emp.department || "IT";
        const managerId = emp.manager_id || ""; 
        const designation = emp.designation || "";
        const managerName = emp.manager_name || (managerId ? "ID: " + managerId : "No Manager"); 

        const row = document.createElement("div");
        row.className = "employee-row border-bottom py-3";

        // Escape strings
        const safeName = (name || '').replace(/'/g, "\\'");
        const safeEmail = (email || '').replace(/'/g, "\\'");
        const safeRole = (role || '').replace(/'/g, "\\'");
        const safeDept = (department || '').replace(/'/g, "\\'");
        const safeDesig = (designation || '').replace(/'/g, "\\'");
        const safePhone = String(phone || '').replace(/'/g, "\\'");

        const isActive = emp.active === 1 || emp.active === 1;
        const statusColor = isActive ? 'text-success' : 'text-danger';
        const statusText = isActive ? 'Active' : 'Inactive';

        const hasValidIds = (employeeId && userId);

        const editBtn = hasValidIds
    ? `<button class="btn btn-sm btn-outline-primary me-1"
            title="Edit User"
            onclick="window.openEditModal('${userId}', '${employeeId}', '${safeName}', '${safeEmail}', '${safeRole}', '${managerId}', '${safeDept}', '${safeDesig}','${safePhone}','${empCode}')">
        <i class="fa-solid fa-pen-to-square"></i>
       </button>`
    : `<button class="btn btn-sm btn-outline-secondary me-1" disabled>
        <i class="fa-solid fa-exclamation-triangle"></i>
       </button>`;

        const deleteBtn = employeeId
            ? `<button class="btn btn-sm btn-outline-danger" 
                    title="Delete User"
                    onclick="window.deleteEmployee('${employeeId}')"> 
                <i class="fa-solid fa-trash"></i>
               </button>`
            : `<button class="btn btn-sm btn-outline-secondary" disabled><i class="fa fa-trash"></i></button>`;

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
                        <i class="fa fa-circle ${statusColor} me-1" style="font-size: 8px;"></i>
                        ${statusText}
                     </small>
                </div>
                <div class="col-md-3">
                    <div class="small text-uppercase text-muted" style="font-size: 0.65rem; font-weight: 700;">Reporting To</div>
                    <div class="fw-medium text-dark text-truncate" title="${managerName}">
                        <i class="fa-solid fa-user-tie text-secondary me-1"></i> ${managerName}
                    </div>
                </div>
                <div class="col-md-2 text-end">
                    ${editBtn}
                    ${deleteBtn}
                </div>
            </div>`;
        container.appendChild(row);
    });
}

function updateManagerDropdown(employees) {
    const createSelect = document.getElementById("createManager");
    const editSelect = document.getElementById("edit-manager");
    const defaultOption = '<option value="">No reporting manager</option>';

    const managers = employees.filter(e => {
        const r = (e.role || '').toLowerCase();
        return r === 'manager' || r === 'admin'; 
    });

    const managerOptions = managers.map(m => {
        const id = m.employee_id || m.id;
        return `<option value="${id}">${m.name}</option>`;
    }).join('');

    if (createSelect) createSelect.innerHTML = defaultOption + managerOptions;
    if (editSelect) editSelect.innerHTML = defaultOption + managerOptions;
}

/* =========================================
   4. ACTIONS (Create, Edit, Delete)
   ========================================= */
window.createUser = async function() {
    const btn = document.getElementById("createBtn");

    const payload = {
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        emp_code: document.querySelector('input[name="emp_code"]').value.trim(),
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
        // FIXED: Pointing back to /api/users to create the login credentials
        const res = await fetch(`${window.API_BASE}/api/users`, {
            method: "POST",
            headers: window.getHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok) {
            alert("User created successfully!");
            document.getElementById("createUserForm").reset();
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
window.openEditModal = function(userId, employeeId, name, email, role, managerId, department, designation, phone, empCode) {
    document.getElementById("edit-id").value = userId;
    document.getElementById("edit-emp-id").value = employeeId;

    document.getElementById("edit-name").value = name;
    document.getElementById("edit-email").value = email;
    if(document.getElementById("edit-phone")) document.getElementById("edit-phone").value = phone || "";
    if(document.getElementById("edit-emp-code")) document.getElementById("edit-emp-code").value = empCode || "";
    document.getElementById("edit-role").value = (role || 'employee').toLowerCase();

    // Department Selection
    const deptSelect = document.getElementById("edit-department");
    if(deptSelect) {
        deptSelect.value = department;
        if (deptSelect.value === "") { 
             for (let i = 0; i < deptSelect.options.length; i++) {
                 if (deptSelect.options[i].value.toLowerCase() === department.toLowerCase()) {
                     deptSelect.selectedIndex = i;
                     break;
                 }
             }
        }
    }

    if(document.getElementById("edit-designation")) document.getElementById("edit-designation").value = designation || "";
    
    // FIX 3: Manager Selection - Ensure value matches exactly (handle nulls)
    if(document.getElementById("edit-manager")) {
        let safeManagerId = "";
        if (managerId && managerId !== "null" && managerId !== 0) {
            safeManagerId = managerId;
        }
        document.getElementById("edit-manager").value = safeManagerId;
    }

    const modalEl = document.getElementById('editModal');
    if (modalEl) {
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.saveEdit = async function() {
    const userId = document.getElementById("edit-id").value;
    const employeeId = document.getElementById("edit-emp-id").value;
    const saveBtn = document.querySelector("#editModal .btn-primary");

    // VALIDATION
    if (!userId || userId === 'undefined' || !employeeId || employeeId === 'undefined') {
        alert("Critical Error: Employee ID missing. Please refresh and try again.");
        return;
    }

    saveBtn.disabled = true;

    const newName = document.getElementById("edit-name").value.trim();
    const newEmail = document.getElementById("edit-email").value.trim();
    const newRole = document.getElementById("edit-role").value;
    const newDept = document.getElementById("edit-department").value;
    const newDesignation = document.getElementById("edit-designation").value.trim();
    const newPhone = document.getElementById("edit-phone").value.trim();
    const newEmpCode = document.getElementById("edit-emp-code").value.trim();

    // Convert empty dropdown to NULL
    let newManager = document.getElementById("edit-manager").value;
    if (newManager === "" || newManager === "null") {
        newManager = null;
    }

    try {
        const promises = [];

        // 1. Update User Role
        promises.push(
            // FIXED: Pointing back to /api/users/${userId}/role
            fetch(`${window.API_BASE}/api/users/${userId}/role`, {
                method: "PATCH",
                headers: window.getHeaders(),
                body: JSON.stringify({ role: newRole })
            })
        );

        // 2. Update Employee Details
        const employeePayload = {
            name: newName,
            email: newEmail,
            phone: newPhone,
            emp_code: newEmpCode,
            department: newDept,
            designation: newDesignation,
            manager_id: newManager
            
};

        promises.push(
            // FIXED: Pointing to /api/employees to fix the 404 error!
            fetch(`${window.API_BASE}/api/employees/${employeeId}`, {
                method: "PATCH",
                headers: window.getHeaders(),
                body: JSON.stringify(employeePayload)
            })
        );

        const [roleRes, detailsRes] = await Promise.all(promises);

        if (roleRes.ok && detailsRes.ok) {
            const modalEl = document.getElementById('editModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            alert("Updates saved successfully.");
            refreshAll();
        } else {
            console.error("Update Errors:", roleRes.status, detailsRes.status);
            if(detailsRes.status === 400) {
                alert("Failed to update details. Check if Manager ID is valid.");
            } else {
                alert("Update failed. Check console.");
            }
        }

    } catch (e) {
        console.error(e);
        alert("Network Error: Could not connect to server.");
    } finally {
        saveBtn.disabled = false;
    }
};
window.deleteEmployee = async function(employeeId) {
    if (!confirm("Are you sure you want to delete this employee?")) {
        return;
    }

    if (!employeeId || employeeId === 'undefined') {
        alert("Error: Cannot delete, missing Employee ID.");
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE}/api/users/${employeeId}`, {
            method: 'DELETE',
            headers: window.getHeaders()
        });

        const result = await response.json();

        if (response.ok) {
            alert("Employee deleted successfully!");
            window.refreshAll();
        } else {
            alert(`Error: ${result.message || "Failed to delete"}`);
        }
    } catch (error) {
        console.error("Delete failed:", error);
        alert("Server error. Please check the console.");
    }
};
