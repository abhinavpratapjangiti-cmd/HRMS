console.log("sidebar-edit.js loaded");

/* =========================
   ELEMENT GETTERS (SAFE)
========================= */
function el(id) {
  return document.getElementById(id);
}

/* =========================
   OPEN / CLOSE SIDEBAR
========================= */
function openEditSidebar(html) {
  const sidebar = el("editSidebar");
  const backdrop = el("sidebarBackdrop");

  if (!sidebar || !backdrop) return;

  sidebar.innerHTML = html;
  sidebar.classList.add("open");
  backdrop.classList.add("show");
}

function closeEditSidebar() {
  const sidebar = el("editSidebar");
  const backdrop = el("sidebarBackdrop");

  if (!sidebar || !backdrop) return;

  sidebar.classList.remove("open");
  backdrop.classList.remove("show");
  sidebar.innerHTML = "";
}

/* =========================
   GLOBAL BACKDROP CLOSE
========================= */
(function bindBackdrop() {
  const backdrop = el("sidebarBackdrop");
  if (!backdrop) return;

  backdrop.addEventListener("click", closeEditSidebar);
})();

/* =========================
   DELEGATED EDIT BUTTON HANDLER
   (WORKS FOR TIMESHEETS & LEAVES)
========================= */
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-edit-type]");
  if (!btn) return;

  const type = btn.dataset.editType; // timesheet | leave
  const id = btn.dataset.id;

  if (!type || !id) return;

  if (type === "timesheet") {
    loadTimesheetEditor(id);
  }

  if (type === "leave") {
    loadLeaveEditor(id);
  }
});

/* =========================
   TIMESHEET EDITOR
========================= */
async function loadTimesheetEditor(id) {
  try {
    const ts = await apiGet(`/timesheets/${id}`);

    openEditSidebar(`
      <div class="p-4">
        <h5>Edit Timesheet</h5>

        <div class="mb-3">
          <label class="form-label">Project</label>
          <input id="editProject" class="form-control" value="${ts.project || ""}">
        </div>

        <div class="mb-3">
          <label class="form-label">Task</label>
          <input id="editTask" class="form-control" value="${ts.task || ""}">
        </div>

        <div class="mb-3">
          <label class="form-label">Hours</label>
          <input id="editHours" type="number" step="0.5"
            class="form-control" value="${ts.hours}">
        </div>

        <div class="d-flex gap-2">
          <button class="btn btn-primary"
            onclick="saveTimesheet(${id})">Save</button>
          <button class="btn btn-outline-secondary"
            onclick="closeEditSidebar()">Cancel</button>
        </div>
      </div>
    `);
  } catch (e) {
    alert("Failed to load timesheet");
  }
}

async function saveTimesheet(id) {
  await apiPut(`/timesheets/${id}`, {
    project: el("editProject")?.value,
    task: el("editTask")?.value,
    hours: el("editHours")?.value
  });

  closeEditSidebar();
  location.reload();
}

/* =========================
   LEAVE EDITOR
========================= */
async function loadLeaveEditor(id) {
  try {
    const lv = await apiGet(`/leaves/${id}`);

    openEditSidebar(`
      <div class="p-4">
        <h5>Edit Leave</h5>

        <div class="mb-3">
          <label class="form-label">From</label>
          <input id="editFrom" type="date" class="form-control"
            value="${lv.from_date}">
        </div>

        <div class="mb-3">
          <label class="form-label">To</label>
          <input id="editTo" type="date" class="form-control"
            value="${lv.to_date}">
        </div>

        <div class="mb-3">
          <label class="form-label">Reason</label>
          <textarea id="editReason" class="form-control">${lv.reason || ""}</textarea>
        </div>

        <div class="d-flex gap-2">
          <button class="btn btn-primary"
            onclick="saveLeave(${id})">Save</button>
          <button class="btn btn-outline-secondary"
            onclick="closeEditSidebar()">Cancel</button>
        </div>
      </div>
    `);
  } catch (e) {
    alert("Failed to load leave");
  }
}

async function saveLeave(id) {
  await apiPut(`/leaves/${id}`, {
    from_date: el("editFrom")?.value,
    to_date: el("editTo")?.value,
    reason: el("editReason")?.value
  });

  closeEditSidebar();
  location.reload();
}

/* =========================
   EXPORT (SPA SAFE)
========================= */
window.openEditSidebar = openEditSidebar;
window.closeEditSidebar = closeEditSidebar;
