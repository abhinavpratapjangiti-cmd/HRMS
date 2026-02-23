// assets/js/admin.js
requireAuth("admin");

/* =========================
   LOAD ALL LEAVES (ADMIN)
========================= */
async function loadAllLeaves() {
  const table = document.getElementById("adminLeaveTable");
  if (!table) return;

  table.innerHTML =
    `<tr><td colspan="7" class="text-center">Loading...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/leave/admin`, {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to load leaves");
    }

    const data = await res.json();
    table.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      table.innerHTML =
        `<tr><td colspan="7" class="text-center">No leave requests</td></tr>`;
      return;
    }

    const currentUser = getCurrentUser();

    data.forEach(l => {
      const isSelf = Number(l.employee_id) === Number(currentUser.id);
      const isPending = l.status === "Pending";

      table.innerHTML += `
        <tr>
          <td>${escapeHtml(l.employee)}</td>
          <td>${fmtDate(l.from_date)}</td>
          <td>${fmtDate(l.to_date)}</td>
          <td>${escapeHtml(l.reason || "-")}</td>
          <td>
            <span class="badge ${
              l.status === "Approved"
                ? "bg-success"
                : l.status === "Rejected"
                ? "bg-danger"
                : "bg-warning text-dark"
            }">
              ${l.status}
            </span>
          </td>
          <td>${fmtDate(l.created_at)}</td>
          <td>
            <button
              class="btn btn-success btn-sm me-1"
              ${!isPending || isSelf ? "disabled" : ""}
              title="${isSelf ? "Cannot approve your own leave" : ""}"
              onclick="updateLeaveStatus(${l.id}, 'Approved')">
              Approve
            </button>

            <button
              class="btn btn-danger btn-sm"
              ${!isPending || isSelf ? "disabled" : ""}
              title="${isSelf ? "Cannot reject your own leave" : ""}"
              onclick="updateLeaveStatus(${l.id}, 'Rejected')">
              Reject
            </button>
          </td>
        </tr>
      `;
    });

  } catch (err) {
    console.error("Load leaves error:", err);
    table.innerHTML =
      `<tr>
        <td colspan="7" class="text-center text-danger">
          Error loading leave data
        </td>
      </tr>`;
  }
}

/* =========================
   UPDATE LEAVE STATUS
========================= */
async function updateLeaveStatus(id, status) {
  if (!confirm(`Are you sure you want to ${status.toLowerCase()} this leave?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/leave/${id}/status`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.message || "Failed to update leave");
      return;
    }

    loadAllLeaves();

  } catch (err) {
    console.error("Update leave error:", err);
    alert("Server error while updating leave");
  }
}

/* =========================
   HELPERS
========================= */
function fmtDate(d) {
  if (!d) return "-";
  return String(d).split("T")[0];
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", loadAllLeave
