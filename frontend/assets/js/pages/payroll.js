console.log("payroll.js loaded");

let payrollInitialized = false;

/* =========================
   INIT
========================= */
function initPayroll() {
  if (payrollInitialized) return;
  payrollInitialized = true;

  console.log("initPayroll called");

  const monthSelect = document.getElementById("month");
  const downloadBtn = document.getElementById("downloadBtn");

  if (!monthSelect || !downloadBtn) {
    console.error("Payroll DOM missing");
    return;
  }

  loadMonths();

  monthSelect.addEventListener("change", () => {
    const month = monthSelect.value;
    if (month) loadPayslip(month);
  });

  downloadBtn.addEventListener("click", downloadPDF);

  enablePayrollUploadForHR();
  bindPayrollUpload();
}

/* =========================
   LOAD MONTHS
========================= */
async function loadMonths() {
  const monthSelect = document.getElementById("month");
  monthSelect.innerHTML = `<option>Loading...</option>`;

  try {
    // ✅ FIXED ENDPOINT
    const months = await apiGet("/payslips/my/months");

    if (!Array.isArray(months) || months.length === 0) {
      monthSelect.innerHTML = `<option>No payslips available</option>`;
      resetPayslipUI();
      return;
    }

    monthSelect.innerHTML = months
      .map(m => `<option value="${m}">${m}</option>`)
      .join("");

    monthSelect.value = months[0];
    await loadPayslip(months[0]);
  } catch (err) {
    console.error("Load months failed:", err);
    monthSelect.innerHTML = `<option>Error loading payslips</option>`;
    resetPayslipUI();
  }
}

/* =========================
   RESET UI
========================= */
function resetPayslipUI() {
  ["basic", "hra", "deductions", "netpay"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = "—";
  });
}

/* =========================
   LOAD PAYSLIP DATA
========================= */
async function loadPayslip(month) {
  try {
    // ✅ FIXED ENDPOINT
    const data = await apiGet(
      `/payslips/my/${encodeURIComponent(month)}`
    );

    if (!data || !data.month) {
      resetPayslipUI();
      return;
    }

    document.getElementById("basic").innerText = data.basic ?? "—";
    document.getElementById("hra").innerText = data.hra ?? "—";
    document.getElementById("deductions").innerText = data.deductions ?? "—";
    document.getElementById("netpay").innerText = data.net_pay ?? "—";
  } catch (err) {
    console.error("Load payslip failed:", err);
    resetPayslipUI();
  }
}

/* =========================
   DOWNLOAD PDF
========================= */
async function downloadPDF() {
  const month = document.getElementById("month").value;
  if (!month) return alert("Select a month");

  try {
    // ✅ FIXED ENDPOINT
    const res = await fetch(
      `/api/payslips/my/${encodeURIComponent(month)}/pdf`,
      {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      }
    );

    if (!res.ok) {
      throw new Error(`PDF download failed (${res.status})`);
    }

    const blob = await res.blob();

    // Safety check (prevents corrupt downloads)
    if (blob.size < 1000) {
      throw new Error("Invalid PDF received");
    }

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `Payslip-${month}.pdf`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Unable to download payslip PDF");
  }
}

/* =========================
   HR / ADMIN VISIBILITY
========================= */
function enablePayrollUploadForHR() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (["admin", "hr"].includes(user.role)) {
      document
        .getElementById("payrollUploadWrapper")
        ?.classList.remove("d-none");
    }
  } catch {}
}

/* =========================
   PAYROLL UPLOAD
========================= */
function bindPayrollUpload() {
  const form = document.getElementById("payrollUploadForm");
  const msg =
    document.getElementById("uploadMsg") ||
    document.getElementById("msg");

  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (msg) msg.innerHTML = "Uploading...";

    const formData = new FormData(form);

    try {
      const res = await fetch(`/api/payroll/upload`, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error("Upload failed");

      msg.innerHTML = `
        <div class="alert alert-success">
          Uploaded: ${data.uploaded ?? 0}<br>
          ${data.errors?.length ? data.errors.join("<br>") : ""}
        </div>
      `;
      form.reset();
    } catch (err) {
      msg.innerHTML =
        `<div class="alert alert-danger">Payroll upload failed</div>`;
    }
  });
}

/* =========================
   EXPORT
========================= */
window.initPayroll = initPayroll;
