console.log("team.js loaded");

/* =====================================================
   SPA INIT GUARD (SAFE)
===================================================== */
(function () {
  if (window.__teamLoaded) {
    console.log("team.js already initialized — skipping");
    return;
  }
  window.__teamLoaded = true;

/* =========================
   PAGE INIT
========================= */
async function initTeam() {
  console.log("initTeam called");

  let team = [];
  try {
    team = await apiGet("/team/my");
  } catch (e) {
    console.error("Failed to load team", e);
    return;
  }
  updateOverview(team);
  renderOrgTree(team);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  /* =========================
     MANAGER / HR ACTIONS
  ========================= */
  if (["manager", "hr", "admin"].includes(user.role)) {
    loadPendingLeaves();
  }

  /* =========================
     HR / ADMIN – BENCH MAP
  ========================= */
  if (["hr", "admin"].includes(user.role)) {
    const benchSection = document.getElementById("benchSection");
    benchSection?.classList.remove("d-none");

    if (!window.__benchMapLoaded) {
      const s = document.createElement("script");
      s.src = "/assets/js/pages/team-bench-map.js";
      s.defer = true;

      s.onload = () => {
        console.log("team-bench-map.js loaded");
        setTimeout(() => window.loadBenchMap?.(true), 150);
      };

      document.body.appendChild(s);
      window.__benchMapLoaded = true;
    } else {
      window.loadBenchMap?.();
    }
  }
}

window.initTeam = initTeam;

/* =========================
   OVERVIEW STATS
========================= */
function updateOverview(team) {
  const totalEl = document.getElementById("statTeamCount");
  const activeEl = document.getElementById("statActiveCount");

  if (totalEl) totalEl.innerText = team.length;
  if (activeEl) activeEl.innerText = team.filter(e => e.active).length;
}

/* =========================
   BUILD TREE
========================= */
function buildOrgTree(list) {
  const map = {};
  const roots = [];

  list.forEach(emp => (map[emp.id] = { ...emp, children: [] }));

  list.forEach(emp => {
    if (emp.manager_id && map[emp.manager_id]) {
      map[emp.manager_id].children.push(map[emp.id]);
    } else {
      roots.push(map[emp.id]);
    }
  });

  return roots;
}

/* =========================
   RENDER TREE
========================= */
function renderOrgTree(team) {
  const container = document.getElementById("orgTree");
  if (!container) return;
  container.innerHTML = "";

  const hrEmployees = team.filter(e => e.role === "hr");
  const lineEmployees = team.filter(e => e.role !== "hr");

  const lineRoots = buildOrgTree(lineEmployees);
  const hrRoots = buildOrgTree(hrEmployees);

  /* ===== LINE ORG ===== */
  if (lineRoots.length) {
    const section = document.createElement("div");
    section.className = "org-section";

    const title = document.createElement("h6");
    title.className = "org-section-title";
    title.innerText = "Organization Structure";

    section.appendChild(title);
    lineRoots.forEach(root => section.appendChild(createNode(root, true)));
    container.appendChild(section);
  }

  /* ===== HR ORG ===== */
  if (hrRoots.length) {
    const section = document.createElement("div");
    section.className = "org-section mt-4";

    const title = document.createElement("h6");
    title.className = "org-section-title";
    title.innerText = "Human Resources";

    section.appendChild(title);
    hrRoots.forEach(root => {
      root.matrix = true;
      section.appendChild(createNode(root, false));
    });

    container.appendChild(section);
  }
}

/* =========================
   CREATE NODE (FINAL + PRESENCE)
========================= */
function createNode(emp, expandedByDefault = false) {
  const node = document.createElement("div");
  node.className = "org-node";

  const hasChildren = emp.children?.length > 0;

  const card = document.createElement("div");
  card.className = `org-card role-${emp.role}`;
  card.onclick = () => (window.location.hash = `#/employee/${emp.id}`);

  const left = document.createElement("div");
  left.className = "org-left";

  const toggle = document.createElement("span");
  toggle.className = "org-toggle";
  left.appendChild(toggle);

  const avatar = document.createElement("div");
  avatar.className = "org-avatar";
  avatar.innerText = emp.name?.[0]?.toUpperCase() || "?";
  left.appendChild(avatar);

  const meta = document.createElement("div");
  meta.className = "org-meta";
  meta.innerHTML = `
    <div class="org-name">${emp.name}</div>
    <div class="org-role">
      ${emp.department || "—"}
      <span class="role-chip ${emp.role}">${emp.role.toUpperCase()}</span>
      ${emp.matrix ? `<span class="role-chip matrix">MATRIX</span>` : ""}
    </div>
  `;

  if (emp.role === "manager") {
    meta.innerHTML += `<div class="org-stats">👥 ${emp.children.length} reports</div>`;
  }

  left.appendChild(meta);

  const right = document.createElement("div");
  right.className = "org-right";

  const presenceClass = emp.online ? "online" : "offline";
  const presenceText = emp.online
    ? "Online"
    : emp.last_seen
      ? `Last seen ${formatDate(emp.last_seen)}`
      : "Offline";

  right.innerHTML = `
    <span class="status-badge ${emp.active ? "active" : "inactive"}">
      ${emp.active ? "Active" : "Inactive"}
    </span>
    <span class="presence-badge ${presenceClass}">
      ${presenceText}
    </span>
  `;

  card.append(left, right);
  node.appendChild(card);

  /* =========================
     CHILDREN HANDLING
  ========================= */
  if (hasChildren) {
    const childrenWrap = document.createElement("div");
    childrenWrap.className = "org-children";

    let isOpen = expandedByDefault === true;

    childrenWrap.style.maxHeight = isOpen ? "2000px" : "0px";
    toggle.innerText = isOpen ? "▼" : "▶";

    emp.children.forEach(child => {
      childrenWrap.appendChild(createNode(child, false));
    });

    toggle.onclick = e => {
      e.stopPropagation();
      isOpen = !isOpen;
      childrenWrap.style.maxHeight = isOpen ? "2000px" : "0px";
      toggle.innerText = isOpen ? "▼" : "▶";
    };

    node.appendChild(childrenWrap);
  } else {
    toggle.innerText = "";
  }

  return node;
}

/* =========================
   DATE FORMAT
========================= */
function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/* =========================
   PENDING LEAVES
========================= */
async function loadPendingLeaves() {
  const tbody = document.getElementById("pendingLeavesBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const url =
    user.role === "manager"
      ? "/leaves/pending/my-team"
      : "/leaves/pending";

  let data = [];
  try {
    data = await apiGet(url);
  } catch {
    tbody.innerHTML =
      `<tr><td colspan="6" class="text-danger">Failed to load</td></tr>`;
    return;
  }

  const pendingEl = document.getElementById("statPendingLeaves");
  if (pendingEl) pendingEl.innerText = data.length;

  if (!data.length) {
    tbody.innerHTML =
      `<tr><td colspan="6" class="text-muted">No pending leaves</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(l => `
    <tr>
      <td>${l.employee_name}</td>
      <td>${formatDate(l.from_date)}</td>
      <td>${formatDate(l.to_date)}</td>
      <td>${l.leave_type}</td>
      <td>${Math.abs(
        (new Date(l.to_date) - new Date(l.from_date)) / 86400000
      ) + 1}</td>
      <td>
        <button class="btn btn-success btn-sm"
          onclick="updateLeaveStatus(${l.id}, 'APPROVED')">Approve</button>
        <button class="btn btn-danger btn-sm ms-1"
          onclick="updateLeaveStatus(${l.id}, 'REJECTED')">Reject</button>
      </td>
    </tr>
  `).join("");
}

async function updateLeaveStatus(id, decision) {
  await apiPost(`/leaves/${id}/decision`, { decision });
  loadPendingLeaves();
}

})();
