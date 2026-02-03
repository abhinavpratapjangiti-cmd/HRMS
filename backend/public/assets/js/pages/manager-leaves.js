console.log("manager-leaves.js loaded");

/* =========================
   INIT
========================= */
async function initManagerLeaves() {
  console.log("initManagerLeaves called");

  const tbody = document.getElementById("pendingLeavesBody");
  if (!tbody) return;

  try {
    // ✅ CORRECT API
    const leaves = await apiGet("/leaves/pending/my-team");

    if (!leaves || leaves.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted">
            No pending leave requests
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = leaves.map(l => `
      <tr>
        <td>${l.employee}</td>
        <td>${formatDate(l.from_date)}</td>
        <td>${formatDate(l.to_date)}</td>
        <td>${l.leave_type}</td>
        <td>${l.days}</td>
        <td>
          <button class="btn btn-success btn-sm"
            onclick="updateLeave(${l.id}, 'APPROVED')">
            Approve
          </button>

          <button class="btn btn-danger btn-sm ms-1"
            onclick="updateLeave(${l.id}, 'REJECTED')">
            Reject
          </button>
        </td>
      </tr>
    `).join("");

  } catch (e) {
    console.error("Failed to load pending leaves", e);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger">
          Failed to load data
        </td>
      </tr>`;
  }
}

/* =========================
   APPROVE / REJECT
========================= */
async function updateLeave(id, decision) {
  if (!confirm(`Are you sure you want to ${decision.toLowerCase()} this leave?`)) {
    return;
  }

  try {
    // ✅ CORRECT API + PAYLOAD
    await apiPost(`/leaves/${id}/decision`, { decision });

    // reload list
    initManagerLeaves();
  } catch (e) {
    console.error("Leave action failed", e);
    alert("Action failed. Please try again.");
  }
}

/* =========================
   DATE FORMATTER
========================= */
function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

window.initManagerLeaves = initManagerLeaves;
