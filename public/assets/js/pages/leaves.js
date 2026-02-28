/* =========================================
   LEAVES.JS - FULL CLEAN PRODUCTION VERSION
========================================= */

if (window.__leavesLoaded) {
    console.warn("Leaves.js already loaded");
} else {

window.__leavesLoaded = true;

/* ================= CONFIG ================= */

window.API_BASE = window.location.origin;

window.getHeaders = function () {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
    };
};

/* ========================================
   1️⃣ INITIALIZATION
======================================== */
window.initLeaves = function () {
const role = JSON.parse(localStorage.getItem("user"))?.role;

if (role === "manager") {
    document.getElementById("teamTab").classList.remove("d-none");
}

if (role === "admin" || role === "hr") {
    document.getElementById("allTab").classList.remove("d-none");
}

    console.log("🌿 Leaves Page Initialized");
    setupDateListeners();
    setMyLeavesHeader();
    window.loadLeaveHistory();
};

function setMyLeavesHeader() {

    const thead = document.querySelector("thead tr");

    thead.innerHTML = `
        <th class="ps-4 py-3 text-secondary text-uppercase small fw-bold">
            Leave Type
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            From
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            To
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            Days
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            Status
        </th>
        <th class="pe-4 py-3 text-end text-secondary text-uppercase small fw-bold">
            Action
        </th>
    `;
}

/* ========================================
   2️⃣ LOAD LEAVE HISTORY
======================================== */
window.loadLeaveHistory = async function () {

    const tbody = document.getElementById("leaveHistoryBody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
                <p class="mb-0">Loading...</p>
            </td>
        </tr>`;

    try {

        const res = await fetch(`${API_BASE}/api/leaves/history`, {
            headers: getHeaders()
        });

        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-muted">
                        No records found.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = data.map(leave => `
            <tr>
                <td class="ps-4 fw-bold text-dark">
                    ${leave.type || leave.type_code || '-'}
                </td>

                <td>${formatDate(leave.from)}</td>
                <td>${formatDate(leave.to)}</td>

                <td>
                    <span class="badge bg-light text-dark border">
                        ${leave.days || 0} Day(s)
                    </span>
                </td>

                <td>${getStatusBadge(leave.status)}</td>

                <td class="pe-4 text-end">
                    ${(leave.status || '').toLowerCase() === 'pending'
                        ? `
                        <button class="btn btn-sm btn-outline-primary me-2"
                            onclick="window.openEditModal(
                                ${leave.id},
                                '${leave.from}',
                                '${leave.to}',
                                '${leave.type_code}'
                            )">
                            Edit
                        </button>

                        <button class="btn btn-sm btn-outline-danger"
                            onclick="window.cancelLeave(${leave.id})">
                            Cancel
                        </button>
                        `
                        : '<span class="text-muted small">-</span>'}
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("History Load Error:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-danger">
                    Error loading leave history.
                </td>
            </tr>`;
    }
};


/* ========================================
   3️⃣ OPEN EDIT MODAL
======================================== */
window.openEditModal = function(id, from, to, type) {

    const idInput = document.getElementById("editLeaveId");
    const fromInput = document.getElementById("editFromDate");
    const toInput = document.getElementById("editToDate");
    const typeInput = document.getElementById("editLeaveType");

    if (!idInput || !fromInput || !toInput || !typeInput) {
        alert("Edit modal not found in HTML.");
        return;
    }

    idInput.value = id;
    fromInput.value = from;
    toInput.value = to;
    typeInput.value = type;

    new bootstrap.Modal(
        document.getElementById("editLeaveModal")
    ).show();
};


/* ========================================
   4️⃣ UPDATE LEAVE (EDIT SAVE)
======================================== */
window.updateLeave = async function() {

    const id = document.getElementById("editLeaveId").value;
    const fromDate = document.getElementById("editFromDate").value;
    const toDate = document.getElementById("editToDate").value;
    const leaveType = document.getElementById("editLeaveType").value;

    if (!fromDate || !toDate || !leaveType) {
        alert("All fields are required.");
        return;
    }

    try {

        const res = await fetch(`${API_BASE}/api/leaves/${id}`, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify({
                from_date: fromDate,
                to_date: toDate,
                leave_type: leaveType
            })
        });

        const result = await res.json();

        if (res.ok) {

            alert("Leave updated successfully.");

            const modalInstance =
                bootstrap.Modal.getInstance(
                    document.getElementById("editLeaveModal")
                );

            if (modalInstance) modalInstance.hide();

            window.loadLeaveHistory();

        } else {
            alert(result.message || "Error updating leave.");
        }

    } catch (err) {
        console.error("Update Error:", err);
        alert("Network error.");
    }
};


/* ========================================
   5️⃣ SUBMIT LEAVE
======================================== */
window.submitLeave = async function () {

    const btn = document.querySelector("#leaveForm button[type='submit']");
    const msgDiv = document.getElementById("msg");

    const fromDate = document.getElementById("fromDate").value;
    const toDate = document.getElementById("toDate").value;
    const leaveType = document.getElementById("leaveType").value;
    const reason = document.getElementById("reason").value.trim();

    if (!fromDate || !toDate || !leaveType) {
        return showError("Please select dates and leave type.");
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (start < today) {
        return showError("Cannot apply leave for past dates.");
    }

    if (end < start) {
        return showError("End date cannot be before start date.");
    }

    const payload = {
        from_date: fromDate,
        to_date: toDate,
        leave_type: leaveType,
        reason: reason
    };

    btn.disabled = true;
    btn.innerHTML = "Applying...";
    if (msgDiv) msgDiv.innerHTML = "";

    try {

        const res = await fetch(`${API_BASE}/api/leaves/apply`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok) {
            alert("✅ Leave applied successfully.");
            document.getElementById("leaveForm").reset();
            document.getElementById("leaveDuration").innerText = "";
            window.loadLeaveHistory();
        } else {
            showError(result.message || "Failed to apply leave.");
        }

    } catch (error) {
        console.error("Submit Error:", error);
        showError("Network error. Please try again.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Apply Leave";
    }
};


/* ========================================
   6️⃣ CANCEL LEAVE
======================================== */
window.cancelLeave = async function (id) {

    if (!confirm("Are you sure you want to cancel this leave request?"))
        return;

    try {

        const res = await fetch(`${API_BASE}/api/leaves/${id}`, {
            method: "DELETE",
            headers: getHeaders()
        });

        const result = await res.json();

        if (res.ok) {
            alert("Leave cancelled successfully.");
            window.loadLeaveHistory();
        } else {
            alert(result.message || "Error cancelling leave.");
        }

    } catch (error) {
        console.error("Cancel Error:", error);
        alert("Network error.");
    }
};


/* ========================================
   7️⃣ STATUS BADGE
======================================== */
function getStatusBadge(status) {

    const s = (status || '').toLowerCase();

    if (s === 'approved')
        return '<span class="badge bg-success bg-opacity-10 text-success">Approved</span>';

    if (s === 'pending')
        return '<span class="badge bg-warning bg-opacity-10 text-warning">Pending</span>';

    if (s === 'rejected')
        return '<span class="badge bg-danger bg-opacity-10 text-danger">Rejected</span>';

    return `<span class="badge bg-secondary">${status || '-'}</span>`;
}


/* ========================================
   8️⃣ DATE LISTENER
======================================== */
function setupDateListeners() {

    const fromInput = document.getElementById("fromDate");
    const toInput = document.getElementById("toDate");
    const text = document.getElementById("leaveDuration");

    function update() {

        if (!fromInput.value || !toInput.value) {
            text.innerText = "";
            return;
        }

        const start = new Date(fromInput.value);
        const end = new Date(toInput.value);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (days > 0) {
            text.innerText = `${days} Day(s) Selected`;
            text.className = "text-primary fw-bold mt-1 d-block";
        } else {
            text.innerText = "Invalid Dates";
            text.className = "text-danger fw-bold mt-1 d-block";
        }
    }

    if (fromInput && toInput) {
        fromInput.addEventListener("change", update);
        toInput.addEventListener("change", update);
    }
}


/* ========================================
   9️⃣ UTIL FUNCTIONS
======================================== */
function showError(message) {

    const msgDiv = document.getElementById("msg");

    if (msgDiv) {
        msgDiv.innerHTML = `
            <div class="alert alert-danger small p-2 mb-0">
                ${message}
            </div>`;
    } else {
        alert(message);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
}

function setAllEmployeesHeader() {

    const thead = document.querySelector("thead tr");

    thead.innerHTML = `
        <th class="ps-4 py-3 text-secondary text-uppercase small fw-bold">
            Name
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            Leave Type
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            From
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            To
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            Days
        </th>
        <th class="py-3 text-secondary text-uppercase small fw-bold">
            Status
        </th>
        <th class="pe-4 py-3 text-end text-secondary text-uppercase small fw-bold">
            Action
        </th>
    `;
}

window.loadTeamLeaves = async function() {

    const tbody = document.getElementById("leaveHistoryBody");
    tbody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;

    const res = await fetch(`${API_BASE}/api/leaves/team-history`, {
        headers: getHeaders()
    });

    const data = await res.json();

    tbody.innerHTML = data.map(l => `
        <tr>
            <td>${l.employee_name}</td>
            <td>${l.leave_type}</td>
            <td>${l.from_date}</td>
            <td>${l.to_date}</td>
            <td>${l.days}</td>
            <td>${l.status}</td>
            <td>-</td>
        </tr>
    `).join('');
};
window.loadAllLeaves = async function() {

    setAllEmployeesHeader(); // 👈 change header

    const tbody = document.getElementById("leaveHistoryBody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">Loading...</td></tr>`;

    const res = await fetch(`${API_BASE}/api/leaves/all-history`, {
        headers: getHeaders()
    });

    const data = await res.json();

    tbody.innerHTML = data.map(l => `
        <tr>
            <td class="ps-4 fw-bold">${l.employee_name}</td>
            <td>${l.leave_type}</td>
            <td>${formatDate(l.from_date)}</td>
            <td>${formatDate(l.to_date)}</td>
            <td>${l.days}</td>
            <td>${getStatusBadge(l.status)}</td>
            <td class="text-end pe-4">
                <button class="btn btn-sm btn-outline-primary"
                    onclick="window.openEditModal(
                        ${l.id},
                        '${l.from_date}',
                        '${l.to_date}',
                        '${l.leave_type}'
                    )">
                    Edit
                </button>
            </td>
        </tr>
    `).join('');
};
}
