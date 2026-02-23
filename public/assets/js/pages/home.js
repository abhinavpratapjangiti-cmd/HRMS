/* =====================================================
   home.js — MASTER DASHBOARD CONTROLLER
   - Handles: Leave Balance, Holidays, Time, Manager Stats
   - Features: Robust Notifications, Modal Handling, Approvals
   - Fixes: "404 on Mark Read", "Double Loading", "Event Delegation"
===================================================== */

(function () {
    // 1. SINGLETON CHECK: Prevent script from running twice in the same session
    if (window.__HOME_CONTROLLER_ACTIVE) {
        console.log("♻️ home.js: Controller already active. Re-initializing view...");
        // If script is already loaded, just trigger the data load, don't re-bind listeners
        if (typeof window.__triggerHomeInit === 'function') window.__triggerHomeInit();
        return;
    }
    window.__HOME_CONTROLLER_ACTIVE = true;

    console.log("🏠 home.js: Initializing...");

    // --- CONFIGURATION & STATE ---
    const API_BASE = "http://16.16.18.115:5000";
    let initTimeout;
    let currentModalEndpoint = null; // Tracks open modal for refreshing data

    /* =========================================
       1. SECURITY & HELPER FUNCTIONS
       ========================================= */

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return "";
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getHeaders() {
        const token = localStorage.getItem("token") || localStorage.getItem("access_token");
        return {
            "Content-Type": "application/json",
            "Accept": "application/json", // Added Accept header for strict APIs
            "Authorization": token ? `Bearer ${token}` : ""
        };
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem("user")) || {}; } catch { return {}; }
    }

    function isManager() {
        const role = (getUser()?.role || "").toLowerCase();
        const allowed = ["manager", "hr", "admin", "director", "ceo"];
        return allowed.includes(role);
    }

    function toHHMM(sec = 0) {
        const m = Math.floor(sec / 60);
        return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    }

    function safeDate(dateInput) {
        if (!dateInput) return null;
        const d = new Date(dateInput);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const d = safeDate(dateString);
        return d ? d.toLocaleString() : '';
    }


async function refreshNotificationCount() {
    try {
        const res = await fetch(`${API_BASE}/api/notifications/count`, {
            headers: getHeaders()
        });

        if (!res.ok) return;

        const data = await res.json();
        const bellBadge = document.querySelector(".notification-badge");

        if (bellBadge) {
            if (data.count > 0) {
                bellBadge.textContent = data.count;
                bellBadge.style.display = "inline-block";
            } else {
                bellBadge.style.display = "none";
            }
        }
    } catch (e) {
        console.warn("Failed to refresh notification count");
    }
}


    /* =========================================
       2. CORE DASHBOARD LOADERS
       ========================================= */

    // Exposed trigger for re-initialization
    window.__triggerHomeInit = function() {

    // ✅ Only run on Home route
   // If no hash, auto redirect to home
if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "/home";
    return;
}

// Only run on Home route
if (!window.location.hash.includes("#/home")) return;


    clearTimeout(initTimeout);

    initTimeout = setTimeout(() => {
        const home = document.getElementById("homePage");
        if (!home) return;

        console.log("🚀 Home Page Detected. Loading All Data...");
        applyRoleLayout();
        loadLeaveBalance();
        loadDashboardHome();
        loadTodayTime();
        loadManagerStats();
        loadThoughtOfTheDay();
        loadGreeting();
    }, 100);
};


    function applyRoleLayout() {
        const managerDashboard = document.getElementById("managerDashboard");
        const leaveCol = document.getElementById("leaveBalanceCol");
        const inboxCard = document.getElementById("homeInboxCard");

        if (leaveCol) leaveCol.className = "col-md-8 mb-3 mb-md-0";

        // Make Inbox Clickable
        if (inboxCard) {
            inboxCard.className = "col-md-4 cursor-pointer";
            inboxCard.style.cursor = "pointer";
        }

        if (managerDashboard) {
            managerDashboard.classList.toggle("d-none", !isManager());
        }
    }

    async function loadLeaveBalance() {
        const box = document.getElementById("leaveBalanceBox");
        if (!box) return;

        box.innerHTML = `<div class="text-center py-3"><span class="spinner-border text-primary"></span></div>`;

        try {
            const res = await fetch(`${API_BASE}/api/leaves/balance`, { headers: getHeaders() });
            const data = await res.json();

            if (!document.getElementById("leaveBalanceBox")) return; // Guard clause if user navigated away
            if (!res.ok || !Array.isArray(data) || !data.length) {
                box.innerHTML = `<div class="text-center text-muted py-3">No leave data available</div>`;
                return;
            }

            box.innerHTML = data.map(l => `
                <div class="col-4">
                  <div class="border rounded-3 p-3 h-100 bg-light">
                    <div class="small text-muted text-truncate text-uppercase fw-bold" style="font-size: 0.7rem; letter-spacing: 0.5px;">
                      ${escapeHtml(l.name)}
                    </div>
                    <div class="fs-2 fw-bold text-dark my-2">${escapeHtml(l.balance)}</div>
                    <div class="small text-muted" style="font-size: 0.75rem;">Used ${escapeHtml(l.used)} / ${escapeHtml(l.total)}</div>
                  </div>
                </div>
            `).join("");

        } catch (err) {
            if (box) box.innerHTML = `<div class="text-danger text-center">Failed to load</div>`;
        }
    }

    async function loadDashboardHome() {
        try {
            const res = await fetch(`${API_BASE}/api/dashboard/home`, { headers: getHeaders() });
            if (!res.ok) return;
            const d = await res.json();

            // Holiday Logic
            const hName = document.getElementById("holidayName");
            const hDate = document.getElementById("holidayDate");
            if (hName && d.holiday) {
                hName.textContent = d.holiday.name;
                const validDate = safeDate(d.holiday.date);
                hDate.textContent = validDate
                    ? validDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    : "Date TBD";
            } else if (hName) {
                hName.textContent = "No Upcoming Holiday";
                if (hDate) hDate.textContent = "";
            }

            // Upcoming Holidays List
            const ul = document.getElementById("upcomingHolidays");
            if (ul && d.upcoming_holidays?.length) {
                ul.innerHTML = d.upcoming_holidays.map(h => {
                    const vDate = safeDate(h.date);
                    const dateStr = vDate ? vDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "N/A";
                    return `
                    <li class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom border-light">
                        <span>${escapeHtml(h.name)}</span>
                        <span class="badge bg-light text-dark border">${dateStr}</span>
                    </li>`;
                }).join("");
            }

            // Thought of the day
            const thought = document.getElementById("thoughtText");
            if (thought && d.thought) {
                thought.textContent = d.thought.text;
                thought.classList.remove("text-muted");
            }
        } catch (e) { console.warn("Home data failed", e); }
    }

    async function loadTodayTime() {
        try {
            const res = await fetch(`${API_BASE}/api/dashboard/attendance-today`, { headers: getHeaders() });
            const d = await res.json();
            const workedEl = document.getElementById("workedTime");
            const breakEl = document.getElementById("breakTime");
            if (workedEl) workedEl.textContent = toHHMM(d.worked_seconds || 0);
            if (breakEl) breakEl.textContent = toHHMM(d.break_seconds || 0);
        } catch (e) { console.warn("Time data failed", e); }
    }

    async function loadManagerStats() {
        if (!isManager()) return;
        const stats = {
            teamAttendanceCount: "/api/dashboard/team-attendance",
            pendingLeavesCount: "/api/dashboard/pending-leaves",
            pendingTimesheetsCount: "/api/timesheets/pending/my-team",
            teamOnLeave: "/api/dashboard/team-on-leave"
        };

        Object.keys(stats).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
        });

        for (const [id, url] of Object.entries(stats)) {
            try {
                const res = await fetch(`${API_BASE}${url}`, { headers: getHeaders() });
                const data = await res.json();
                const el = document.getElementById(id);
                if (el) el.textContent = data.count ?? "0";
            } catch {
                const el = document.getElementById(id);
                if (el) el.textContent = "—";
            }
        }
    }

async function loadThoughtOfTheDay() {
        const thoughtTextEl = document.getElementById("dailyThoughtText");

        // Only check for the text element now
        if (!thoughtTextEl) return;

        try {
            const token = localStorage.getItem("token") || localStorage.getItem("access_token");
            const res = await fetch(`${API_BASE}/api/thought/today`, { 
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                } 
            });
            
            if (!res.ok) throw new Error("Failed to load thought");
            
            const data = await res.json();

            // Inject just the thought
            thoughtTextEl.innerText = `"${data.thought}"`;

        } catch (err) {
            console.error("Thought fetch error:", err);
            // Fallback quote without author
            thoughtTextEl.innerText = '"The secret of getting ahead is getting started."';
        }
    }

/* =========================
       👋 GREETING
    ========================= */
    function loadGreeting() {
      const greetingEl = document.getElementById("greetingText");
      const subEl = document.getElementById("greetingSub");
      if (!greetingEl || !subEl) return;

      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const name = user?.name ? user.name.split(" ")[0] : "";

      const hour = new Date().getHours();
      let greeting = "Hello";
      let sub = "Have a productive day!";

      if (hour >= 5 && hour < 12) {
        greeting = "🌅 Good Morning";
        sub = "Let’s start the day strong!";
      } else if (hour >= 12 && hour < 17) {
        greeting = "☀️ Good Afternoon";
        sub = "Hope your day is going great!";
      } else if (hour >= 17 && hour < 21) {
        greeting = "🌇 Good Evening";
        sub = "Time to wrap things up!";
      } else {
        greeting = "🌙 Good Night";
        sub = "Don’t forget to rest well!";
      }

      greetingEl.innerText = `${greeting}${name ? ", " + name : ""}`;
      subEl.innerText = sub;
    }

    /* =========================================
       3. MODAL & RENDERING LOGIC
       ========================================= */

    function openDashboardModal(title, endpoint) {
        currentModalEndpoint = endpoint;
        const modal = document.getElementById('dashboardModal');
        const modalTitle = document.getElementById('dashboardModalTitle') || document.querySelector('.modal-title');
        const modalBody = document.getElementById('dashboardModalBody') || document.querySelector('.modal-body');

        if (modalTitle) modalTitle.innerText = title;
        if (modalBody) modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Loading...</p></div>';

        // Show Modal
        if (typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getOrCreateInstance(modal).show();
        } else if (typeof $ !== 'undefined' && $(modal).modal) {
            $(modal).modal('show');
        }

        fetch(`${API_BASE}${endpoint}`, {
            method: 'GET',
            headers: getHeaders()
        })
        .then(response => {
            if (response.status === 401) throw new Error("Unauthorized");
            if (!response.ok) throw new Error("Network error");
            return response.text();
        })
        .then(text => {
            try {
                const json = JSON.parse(text);

                // Route to specific renderers
                if (endpoint.includes('notifications')) {
                    renderNotifications(json, modalBody);
                } else if (endpoint.includes('attendance/today')) {
                    renderAttendanceTable(json, modalBody);
                } else {
                    renderGenericList(json, modalBody, endpoint);
                }
            } catch (e) {
                modalBody.innerHTML = text;
            }
        })
        .catch(error => {
            if (modalBody) modalBody.innerHTML = `<div class="text-danger p-3 text-center">Failed to load: ${error.message}</div>`;
        });
    }

    function renderNotifications(data, container) {
        let list = [];
        try {
            if (Array.isArray(data)) list = data;
            else if (typeof data === 'string') list = JSON.parse(data);
            else if (data && typeof data === 'object') list = data.notifications || data.data || [];
        } catch (e) { list = []; }

        if (!Array.isArray(list)) list = [];

        if (list.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-muted">No notifications found.</div>';
            return;
        }

        const hasUnread = list.some(item => !item.is_read);
        // Only show button if there are unread items
        const btnDisplay = hasUnread ? 'inline-block' : 'none';
        const caughtUpDisplay = hasUnread ? 'none' : 'block';

      let html = `
    <div class="d-flex justify-content-end p-2 border-bottom bg-light">
        ${hasUnread ? `
            <button id="markAllReadBtn" class="btn btn-sm btn-primary">
                <i class="fas fa-check-double"></i> Mark All as Read
            </button>
        ` : ''}
    </div>
    <div class="list-group list-group-flush" style="max-height: 400px; overflow-y: auto;">
`;

        list.forEach(item => {
            let icon = 'fa-info-circle text-info';
            if (item.type && item.type.includes('APPROVED')) icon = 'fa-check-circle text-success';
            if (item.type && item.type.includes('REJECTED')) icon = 'fa-times-circle text-danger';

            const bgClass = item.is_read ? 'bg-white' : 'bg-light font-weight-bold';

            html += `
                <div class="list-group-item ${bgClass}">
                    <div class="d-flex w-100 justify-content-between">
                        <strong class="mb-1 text-dark" style="font-size: 0.9rem;">
                            <i class="fas ${icon} mr-1"></i> ${item.type || 'System'}
                        </strong>
                        <small class="text-muted" style="font-size: 0.75rem;">${formatDate(item.created_at)}</small>
                    </div>
                    <p class="mb-1 text-secondary" style="font-size: 0.85rem;">${escapeHtml(item.message)}</p>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    function renderAttendanceTable(data, container) {
        const currentUser = getUser();
        const myId = currentUser.id;
        const myName = currentUser.name;

        const filteredData = Array.isArray(data) ? data.filter(item => item.id !== myId && item.name !== myName) : [];

        if (filteredData.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-4">No team members present (except you).</div>`;
            return;
        }

        const headerHtml = `
            <div class="d-flex px-3 py-2 border-bottom bg-light fw-bold text-muted small text-uppercase">
                <div style="width: 40%">Name</div>
                <div style="width: 30%">Status</div>
                <div style="width: 30%; text-align: right;">Check-in</div>
            </div>`;

        const rowsHtml = filteredData.map(item => {
            const isPresent = (item.status || "").toLowerCase() === "present";
            const statusIcon = isPresent ? "🟢" : "🔴";
            return `
            <div class="d-flex align-items-center px-3 py-3 border-bottom hover-bg-light">
                <div style="width: 40%">
                    <div class="fw-bold text-dark">${escapeHtml(item.name)}</div>
                    <div class="small text-muted" style="font-size: 0.75rem;">${escapeHtml(item.designation || "Employee")}</div>
                </div>
                <div style="width: 30%"><span>${statusIcon} ${escapeHtml(item.status || "Absent")}</span></div>
                <div style="width: 30%; text-align: right;"><div class="fw-bold font-monospace">${escapeHtml(item.in_time || "--:--")}</div></div>
            </div>`;
        }).join("");

        container.innerHTML = headerHtml + rowsHtml;
    }

    function renderGenericList(data, container, endpoint) {
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-4">No records found</div>`;
            return;
        }

        const html = data.map(item => {
            let rightSide = "";
            if (
    (endpoint.includes("pending-leaves-list") ||
     endpoint.includes("pending/my-team/list"))
    && isManager()
) {

                rightSide = `
                    <div class="btn-group">
                        <button class="btn btn-sm btn-success approve-btn" data-id="${item.id}">Approve</button>
                        <button class="btn btn-sm btn-danger reject-btn" data-id="${item.id}">Reject</button>
                    </div>`;
            } else {
                const status = (item.status || "").toLowerCase();
                const badgeClass = status === "approved" ? "bg-success" : status === "rejected" ? "bg-danger" : "bg-primary";
                rightSide = `<span class="badge ${badgeClass}">${escapeHtml(item.status || "Info")}</span>`;
            }

            return `
            <div class="d-flex justify-content-between align-items-center p-3 border-bottom hover-bg-light">
                <div>
                    <div class="fw-semibold text-dark">${escapeHtml(item.name)}</div>
                    <small class="text-muted d-block">${escapeHtml(item.reason || "No details")}</small>
                </div>
                ${rightSide}
            </div>`;
        }).join("");

        container.innerHTML = html;
    }

    /* =========================================
       4. ACTION HANDLERS
       ========================================= */

  async function handleMarkAllRead(btn) {
    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.style.pointerEvents = 'none';

        const res = await fetch(`${API_BASE}/api/notifications/mark-all-read`, {
            method: 'PUT',
            headers: getHeaders()
        });

        if (!res.ok) {
            throw new Error("Server responded with " + res.status);
        }

        // 🔥 Use SAME fallback logic as openDashboardModal
        const modalBody =
            document.getElementById("dashboardModalBody") ||
            document.querySelector(".modal-body");

        if (!modalBody) return; // safety check

        // Re-fetch unread notifications
        const refreshed = await fetch(`${API_BASE}/api/notifications`, {
            headers: getHeaders()
        });

        const data = await refreshed.json();

        if (!Array.isArray(data) || data.length === 0) {
            modalBody.innerHTML =
                '<div class="text-center p-4 text-muted">No notifications found.</div>';
        } else {
            renderNotifications(data, modalBody);
        }

        refreshNotificationCount();

    } catch (err) {
        console.error("Mark Read Error:", err);
        btn.innerHTML = 'Mark All as Read';
        btn.style.pointerEvents = 'auto';
    }
}



    async function handleAction(approveBtn, rejectBtn) {
        const btn = approveBtn || rejectBtn;
        if (!btn || btn.disabled) return;

        btn.disabled = true;
        const originalContent = btn.innerHTML;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

        const id = btn.dataset.id;
const action = approveBtn ? "APPROVED" : "REJECTED";

const isTimesheet = currentModalEndpoint?.includes("pending/my-team/list");

const url = isTimesheet
    ? `${API_BASE}/api/timesheets/${id}/status`
    : `${API_BASE}/api/leaves/${id}/action`;

const body = isTimesheet
    ? { status: action }
    : { action };

try {
    const res = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(body)
    });


            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || "Action failed");
            }

            // Refresh Stats and Modal
            loadManagerStats();
            if (currentModalEndpoint) openDashboardModal("Refreshing...", currentModalEndpoint);

        } catch (error) {
            alert(error.message);
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
/* =========================================
   5. INITIALIZATION & LISTENERS
================================================*/

document.addEventListener("click", (e) => {

    const cardMap = {
        teamAttendanceCard: {
            title: "Team Attendance Details",
            endpoint: "/api/team/attendance/today"
        },

        pendingLeavesCard: {
            title: "Pending Leave Requests",
            endpoint: "/api/dashboard/pending-leaves-list"
        },

        pendingTimesheetsCard: {
            title: "Pending Timesheets",
            endpoint: "/api/timesheets/pending/my-team/list"
        },

        teamOnLeaveCard: {
            title: "Team On Leave Today",
            endpoint: "/api/dashboard/team-on-leave-list"
        },

        homeInboxCard: {
            title: "Notifications",
            endpoint: "/api/notifications"
        }
    };

    const clickedCardId = Object.keys(cardMap)
        .find(id => e.target.closest(`#${id}`));

    if (clickedCardId) {
        e.preventDefault();
        const { title, endpoint } = cardMap[clickedCardId];
        openDashboardModal(title, endpoint);
        return;
    }

    const markReadBtn = e.target.closest("#markAllReadBtn");
    if (markReadBtn) {
        e.preventDefault();
        handleMarkAllRead(markReadBtn);
        return;
    }

    const approveBtn = e.target.closest(".approve-btn");
    const rejectBtn = e.target.closest(".reject-btn");
    if (approveBtn || rejectBtn) {
        e.preventDefault();
        handleAction(approveBtn, rejectBtn);
        return;
    }

    const navBtn = e.target.closest("#viewAttendanceBtn");
    if (navBtn) {
        e.preventDefault();
        window.location.hash = "#/attendance";
    }

});


    // Init Triggers
    window.__triggerHomeInit();

    // Re-trigger on route changes (if you use a custom event for routing)
    window.addEventListener("route:loaded", window.__triggerHomeInit);

})();
