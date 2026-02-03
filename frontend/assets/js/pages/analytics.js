console.log("analytics.js loaded");


/* =====================================================
   PAGE INIT
===================================================== */
function initAnalytics() {
  console.log("initAnalytics called");

  loadBenchAnalytics();
  loadCVRepository();

  // ✅ EXECUTIVE PANEL – lazy load on tab open
  const execTab = document.getElementById("exec-tab");
  if (execTab) {
    execTab.addEventListener("shown.bs.tab", () => {
      loadExecutiveActions();
    });
  }

  // ✅ If Executive tab is already active (page reload)
  const execPane = document.getElementById("execTab");
  if (execPane?.classList.contains("active")) {
    loadExecutiveActions();
  }
}

window.initAnalytics = initAnalytics;

/* =====================================================
   BENCH ANALYTICS (MASTER)
===================================================== */
async function loadBenchAnalytics() {
  try {
    const summary = await apiGet("/analytics/bench/summary");

    const rawAging = await apiGet("/analytics/bench/aging").catch(() => ({}));
    const aging = normalizeAging(rawAging);

    const burnRes = await apiGet("/analytics/bench/burn-trend").catch(() => ({}));
    const employees = await apiGet("/analytics/bench/list").catch(() => []);

    renderBenchSummary(summary, aging);
    loadUtilization(summary);
    renderBenchBurnTrend(burnRes?.trend || []);
    renderBenchAgingChart(aging);
    renderBenchEmployeeList(employees);

  } catch (err) {
    console.error("Bench analytics failed", err);

    const box = document.getElementById("benchSummary");
    if (box) {
      box.innerHTML = `
        <div class="text-muted text-center py-4">
          Unable to load bench analytics
        </div>`;
    }
  }
}

/* =====================================================
   KPI SUMMARY
===================================================== */
function renderBenchSummary(summary = {}, aging = {}) {
  const container = document.getElementById("benchSummary");
  if (!container) return;

  const onBench      = summary.bench_count ?? 0;
  const benchPercent = summary.bench_percent ?? 0;
  const over60       = aging["60_plus"] ?? 0;
  const riskClass    = over60 > 0 ? "text-danger" : "text-muted";

  container.innerHTML = `
    <div class="col-md-4">
      <div class="card p-3 text-center">
        <h6>On Bench</h6>
        <h2 class="text-danger">${onBench}</h2>
        <small>Employees unallocated</small>
      </div>
    </div>

    <div class="col-md-4">
      <div class="card p-3 text-center">
        <h6>Bench %</h6>
        <h2 class="text-warning">${benchPercent}%</h2>
        <small>Of total workforce</small>
      </div>
    </div>

    <div class="col-md-4">
      <div class="card p-3 text-center">
        <h6>&gt; 60 Days</h6>
        <h2 class="${riskClass}">${over60}</h2>
        <small class="${riskClass}">
          ${over60 > 0 ? "Needs action" : "Healthy"}
        </small>
      </div>
    </div>
  `;
}

/* =====================================================
   BENCH BURN TREND
===================================================== */
let benchBurnChart = null;

function renderBenchBurnTrend(trend = []) {
  const canvas = document.getElementById("benchBurnTrendChart");
  if (!canvas) return;

  if (benchBurnChart) {
    benchBurnChart.destroy();
    benchBurnChart = null;
  }

  document.getElementById("burnEmpty")?.remove();

  if (!Array.isArray(trend) || trend.length === 0) {
    canvas.style.display = "none";
    canvas.insertAdjacentHTML(
      "afterend",
      `<div id="burnEmpty" class="text-muted text-center py-4">
        No bench cost trend available
      </div>`
    );
    return;
  }

  canvas.style.display = "block";

  benchBurnChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: trend.map(r => r.month),
      datasets: [{
        data: trend.map(r => Number(r.bench_cost || 0)),
        borderColor: "#dc3545",
        backgroundColor: "rgba(220,53,69,0.15)",
        fill: true,
        tension: 0.35,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => `₹ ${c.parsed.y.toLocaleString("en-IN")}`
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => `₹${(v / 1000).toFixed(0)}k`
          }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/* =====================================================
   BENCH AGING
===================================================== */
let benchAgingChart = null;

function renderBenchAgingChart(aging = {}) {
  const canvas = document.getElementById("benchAgingChart");
  if (!canvas) return;

  if (benchAgingChart) {
    benchAgingChart.destroy();
    benchAgingChart = null;
  }

  benchAgingChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["0–30 Days", "31–60 Days", "60+ Days"],
      datasets: [{
        data: [
          aging["0_30"],
          aging["31_60"],
          aging["60_plus"]
        ],
        backgroundColor: ["#0d6efd", "#ffc107", "#dc3545"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

/* =====================================================
   BENCH EMPLOYEE LIST
===================================================== */
function renderBenchEmployeeList(list = []) {
  const box = document.getElementById("benchEmployeeList");
  if (!box) return;

  if (!list.length) {
    box.innerHTML = `<div class="text-muted">No employees on bench</div>`;
    return;
  }

  box.innerHTML = `
    <table class="table table-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>Department</th>
          <th>Bench Since</th>
          <th>Days</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(e => `
          <tr class="${e.bench_days > 60 ? "table-danger" : ""}">
            <td>${e.name}</td>
            <td>${e.department || "—"}</td>
            <td>${new Date(e.bench_since).toLocaleDateString("en-IN")}</td>
            <td class="fw-bold">${e.bench_days}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* =====================================================
   CV REPOSITORY
===================================================== */
async function loadCVRepository() {
  const box = document.getElementById("cvRepository");
  const skillSelect = document.getElementById("skillFilter");
  if (!box) return;

  try {
    const list = await apiGet("/documents/cv/list");

    if (!list.length) {
      box.innerHTML = `<div class="text-muted">No CVs uploaded</div>`;
      return;
    }

   const normalized = list.map(cv => {
  const rawSkills =
    cv.Skill_set ||
    cv.skill_set ||
    cv.skills ||
    cv.primary_skills ||
    "";

  return {
    ...cv,
    skills: typeof rawSkills === "string"
      ? rawSkills.split(",").map(s => s.trim()).filter(Boolean)
      : [],
    experience: cv.experience || cv.total_experience || "—"
  };
});

    if (skillSelect && !skillSelect.dataset.loaded) {
      const skills = extractSkills(normalized);
      skillSelect.innerHTML =
        `<option value="">All Skills</option>` +
        skills.map(s => `<option value="${s}">${s}</option>`).join("");

      skillSelect.dataset.loaded = "true";
      skillSelect.onchange = () => {
        const v = skillSelect.value;
        renderCVTable(
          v ? normalized.filter(cv => cv.skills.includes(v)) : normalized
        );
      };
    }

    renderCVTable(normalized);

  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="text-muted">Unable to load CV repository</div>`;
  }
}

/* =====================================================
   CV TABLE
===================================================== */
function renderCVTable(list = []) {
  const box = document.getElementById("cvRepository");
  if (!box) return;

  box.innerHTML = `
    <table class="table table-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>Skills</th>
          <th>Experience</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(cv => `
          <tr>
            <td>${cv.name || "—"}</td>
            <td>${cv.skills.join(", ") || "—"}</td>
            <td>${cv.experience || "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* =====================================================
   UTILIZATION
===================================================== */
function loadUtilization(summary = {}) {
  const box = document.getElementById("utilizationStats");
  if (!box) return;

  const benchPercent = Number(summary.bench_percent ?? 0);
  const utilization  = Math.max(0, 100 - benchPercent);

  let status = "Healthy";
  let cls = "text-success";

  if (utilization < 60) {
    status = "Critical";
    cls = "text-danger";
  } else if (utilization < 75) {
    status = "Under-utilized";
    cls = "text-warning";
  }

  box.innerHTML = `
    <div class="card p-3 text-center">
      <h6>Utilization</h6>
      <h2 class="${cls}">${utilization.toFixed(1)}%</h2>
      <small class="${cls}">${status}</small>
    </div>
  `;
}
/* =====================================================
   EXECUTIVE ACTION PANEL
===================================================== */
/* =====================================================
   EXECUTIVE ACTION PANEL
===================================================== */
async function loadExecutiveActions() {
  const box = document.getElementById("executiveActions");
  if (!box) return;

  try {
    const res = await apiGet("/executive/actions");

    if (!res?.actions?.length) {
      box.innerHTML = `
        <div class="text-muted">
          No executive actions required at this time
        </div>`;
      return;
    }

    box.innerHTML = res.actions.map(a => `
      <div class="card mb-3 border-start border-4 ${
        a.level === "CRITICAL"
          ? "border-danger"
          : a.level === "WARNING"
          ? "border-warning"
          : "border-success"
      }">
        <div class="card-body">
          <h6 class="mb-1">${a.title}</h6>
          <p class="mb-1 text-muted">${a.insight}</p>
          <strong>Recommended:</strong> ${a.action}
        </div>
      </div>
    `).join("");

  } catch (err) {
    console.error("Executive panel failed", err);
    box.innerHTML = `
      <div class="text-danger">
        Unable to load executive insights
      </div>`;
  }
}


/* =====================================================
   HELPERS
===================================================== */
function extractSkills(list) {
  const set = new Set();
  list.forEach(cv => (cv.skills || []).forEach(s => set.add(s)));
  return [...set].sort();
}

function severityClass(level) {
  if (level === "CRITICAL") return "danger";
  if (level === "WARNING") return "warning";
  return "success";
}

/* =====================================================
   AGING NORMALIZER (CRITICAL FIX)
===================================================== */
function normalizeAging(a = {}) {
  return {
    "0_30": a["0_30"] ?? a.days_0_30 ?? 0,
    "31_60": a["31_60"] ?? a.days_31_60 ?? 0,
    "60_plus": a["60_plus"] ?? a.days_60_plus ?? 0
  };
}
