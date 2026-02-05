/* =========================================
   LEAVES.JS - FRONTEND LOGIC
   ========================================= */
const API_BASE = "http://16.16.18.115:5000"; 

const getHeaders = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
});

// 1. INITIALIZATION
window.initLeaves = function() {
    console.log("🌿 Leaves Page Logic Initialized");
    setupDateListeners();
    window.loadLeaveHistory(); 
};

// 2. LOAD HISTORY
window.loadLeaveHistory = async function() {
    const tbody = document.getElementById("leaveHistoryBody");
    if(!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-2"></div><p class="mb-0">Loading...</p></td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/api/leaves/history`, { headers: getHeaders() });
        const data = await res.json();

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(leave => `
            <tr>
                <td class="ps-4 fw-bold text-dark">${leave.type || leave.type_code}</td>
                <td>${leave.from}</td>
                <td>${leave.to}</td>
                <td><span class="badge bg-light text-dark border">${leave.days} Day(s)</span></td>
                <td>${getStatusBadge(leave.status)}</td>
                <td class="pe-4 text-end">
                    ${(leave.status || '').toLowerCase() === 'pending' ? 
                      /* --- UPDATED BUTTON STYLE HERE --- */
                      `<button class="btn btn-sm btn-outline-danger px-3" 
                               style="border-radius: 8px; font-weight: 500;" 
                               onclick="window.cancelLeave(${leave.id})">
                        Cancel
                       </button>` : 
                      '<span class="text-muted small">-</span>'}
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("History Error:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error loading data.</td></tr>`;
    }
};

// 3. SUBMIT LEAVE
window.submitLeave = async function() {
    const btn = document.querySelector("#leaveForm button[type='submit']");
    const msgDiv = document.getElementById("msg");

    const payload = {
        from_date: document.getElementById("fromDate").value,
        to_date: document.getElementById("toDate").value,
        leave_type: document.getElementById("leaveType").value,
        reason: document.getElementById("reason").value
    };

    if (!payload.from_date || !payload.to_date || !payload.leave_type) {
        alert("Please select Dates and Leave Type.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = 'Applying...';
    if(msgDiv) msgDiv.innerHTML = '';

    try {
        const res = await fetch(`${API_BASE}/api/leaves/apply`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (res.ok) {
            alert("Success! Leave applied.");
            document.getElementById("leaveForm").reset();
            document.getElementById("leaveDuration").innerText = ""; 
            window.loadLeaveHistory(); 
        } else {
            if(msgDiv) msgDiv.innerHTML = `<div class="alert alert-danger small p-2 mb-0">${result.message || 'Failed'}</div>`;
            else alert(result.message);
        }
    } catch (e) {
        alert("Network Error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Apply Leave';
    }
};

// 4. CANCEL LEAVE
window.cancelLeave = async function(id) {
    if(!confirm("Are you sure you want to cancel this leave request?")) return;
    try {
        const res = await fetch(`${API_BASE}/api/leaves/${id}`, { method: "DELETE", headers: getHeaders() });
        if(res.ok) {
            alert("Cancelled.");
            window.loadLeaveHistory();
        } else {
            alert("Error cancelling.");
        }
    } catch(e) { alert("Network Error"); }
};

// Utils
function getStatusBadge(status) {
    const s = (status || '').toLowerCase();
    if(s === 'approved') return '<span class="badge bg-success bg-opacity-10 text-success">Approved</span>';
    if(s === 'pending') return '<span class="badge bg-warning bg-opacity-10 text-warning">Pending</span>';
    if(s === 'rejected') return '<span class="badge bg-danger bg-opacity-10 text-danger">Rejected</span>';
    return `<span class="badge bg-secondary">${status}</span>`;
}

function setupDateListeners() {
    const fromInput = document.getElementById("fromDate");
    const toInput = document.getElementById("toDate");
    const text = document.getElementById("leaveDuration");

    function update() {
        if(fromInput.value && toInput.value) {
            const start = new Date(fromInput.value);
            const end = new Date(toInput.value);
            const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            
            if(days > 0) {
                text.innerText = `${days} Day(s) Selected`;
                text.className = "text-primary fw-bold mt-1 d-block";
            } else {
                text.innerText = "Invalid Dates";
                text.className = "text-danger fw-bold mt-1 d-block";
            }
        }
    }
    if(fromInput && toInput) {
        fromInput.addEventListener("change", update);
        toInput.addEventListener("change", update);
    }
}
