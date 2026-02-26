/* =========================================
   LEAVES.JS - SPA SAFE PRODUCTION VERSION
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


// ========================================
// 1️⃣ INITIALIZATION
// ========================================
window.initLeaves = function () {
    console.log("🌿 Leaves Page Initialized");
    setupDateListeners();
    window.loadLeaveHistory();
};

// ========================================
// 2️⃣ LOAD LEAVE HISTORY
// ========================================
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
                <td class="ps-4 fw-bold text-dark">${leave.type || leave.type_code || '-'}</td>
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
                        ? `<button class="btn btn-sm btn-outline-danger px-3"
                                  style="border-radius:8px;font-weight:500;"
                                  onclick="window.cancelLeave(${leave.id})">
                             Cancel
                           </button>`
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

// ========================================
// 3️⃣ SUBMIT LEAVE
// ========================================
window.submitLeave = async function () {

    const btn = document.querySelector("#leaveForm button[type='submit']");
    const msgDiv = document.getElementById("msg");

    const fromDate = document.getElementById("fromDate").value;
    const toDate = document.getElementById("toDate").value;
    const leaveType = document.getElementById("leaveType").value;
    const reason = document.getElementById("reason").value.trim();

    // ===== VALIDATION =====
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

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    if (days <= 0) {
        return showError("Invalid leave duration.");
    }

    const payload = {
        from_date: fromDate,
        to_date: toDate,
        leave_type: leaveType,
        reason: reason
    };

    // ===== LOADING STATE =====
    btn.disabled = true;
    btn.innerHTML = 'Applying...';
    if (msgDiv) msgDiv.innerHTML = '';

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
        btn.innerHTML = 'Apply Leave';
    }
};

// ========================================
// 4️⃣ CANCEL LEAVE
// ========================================
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

// ========================================
// 5️⃣ STATUS BADGE
// ========================================
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

// ========================================
// 6️⃣ DATE LISTENER (Live Duration)
// ========================================
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

// ========================================
// 7️⃣ UTIL FUNCTIONS
// ========================================
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
}
