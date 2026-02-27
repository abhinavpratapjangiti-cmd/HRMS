(function initServiceRequest() {
  // 1. Grab elements from the DOM
  const toSelect = document.getElementById("srTo");
  const fromInput = document.getElementById("loggedUser");
  const subjectInput = document.getElementById("srSubject");
  const messageInput = document.getElementById("srMessage");
  const submitBtn = document.getElementById("srSubmitBtn");

  if (!submitBtn) return;

  // 2. Auto-fill the 'From' input
  const headerUserName = document.getElementById("profileName");
  if (fromInput && headerUserName) {
    fromInput.value = headerUserName.innerText;
  }

  // 3. Form Submission Logic
  submitBtn.addEventListener("click", function (e) {
    e.preventDefault();
    const to = toSelect ? toSelect.value : "Admin";
    const subject = subjectInput ? subjectInput.value.trim() : "";
    const message = messageInput ? messageInput.value.trim() : "";

    if (subject === "" || message === "") {
      alert("Please fill in both the Subject and Your Message.");
      return;
    }

    submitBtn.innerText = "Submitting...";
    submitBtn.disabled = true;

    fetch('/api/service-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: to,
        from: fromInput ? fromInput.value : 'Unknown',
        subject: subject,
        message: message
      })
    })
    .then(response => {
      if (!response.ok) throw new Error("Network response was not ok");
      return response.json();
    })
    .then(data => {
      alert(`Success! Your service request to ${to} has been submitted.`);
      if (subjectInput) subjectInput.value = "";
      if (messageInput) messageInput.value = "";
      submitBtn.innerText = "Submit";
      submitBtn.disabled = false;
    })
    .catch(error => {
      console.error("Error:", error);
      alert("Error saving to database.");
      submitBtn.innerText = "Submit";
      submitBtn.disabled = false;
    });
  });

  /* =====================================================
      ROLE BASED CARD LOADING
  ===================================================== */
  const roleContainer = document.getElementById("roleBasedContainer");
  if (roleContainer) {
    const user = JSON.parse(localStorage.getItem("user"));
    const role = user?.role?.toLowerCase();

    if (role === "manager" || role === "admin" || role === "hr-manager") {
      roleContainer.innerHTML = `
        <div class="card shadow-sm">
          <div class="card-header bg-primary text-white">
            <h5 class="mb-0">${role === "admin" ? "All Requests" : "Team Requests"}</h5>
          </div>
          <div class="card-body"><div id="roleRequestList">Loading...</div></div>
        </div>`;
      role === "admin" ? loadAllRequests() : loadTeamRequests();
    }
  }

  function loadTeamRequests() {
    fetch('/api/service-requests/team').then(res => res.json()).then(data => renderRequests(data));
  }

  function loadAllRequests() {
    fetch('/api/service-requests/all').then(res => res.json()).then(data => renderRequests(data));
  }

  function renderRequests(data) {
    const container = document.getElementById("roleRequestList");
    const user = JSON.parse(localStorage.getItem("user"));
    if (!data || data.length === 0) {
      container.innerHTML = "<p>No requests found.</p>";
      return;
    }
    container.innerHTML = data.map(req => `
      <div class="border rounded p-3 mb-2 request-item" style="cursor:pointer"
           data-id="${req.id}" data-from="${req.request_from}" data-to="${req.request_to}"
           data-subject="${req.subject}" data-message="${req.message}" data-status="${req.status}">
        <div class="d-flex justify-content-between">
          <strong>${req.subject}</strong>
          <span class="badge ${req.status === 'resolved' ? 'bg-success' : 'bg-warning text-dark'}">${req.status}</span>
        </div>
        <small class="text-muted">From: ${req.request_from}</small>
      </div>`).join("");
    attachClickHandlers(user?.role?.toLowerCase());
  }

  function attachClickHandlers(role) {
    document.querySelectorAll(".request-item").forEach(item => {
      item.addEventListener("click", function () {
        document.getElementById("detailFrom").innerText = this.dataset.from;
        document.getElementById("detailTo").innerText = this.dataset.to;
        document.getElementById("detailSubject").innerText = this.dataset.subject;
        document.getElementById("detailMessage").innerText = this.dataset.message;
        document.getElementById("detailStatus").innerText = this.dataset.status;

        const resolveBtn = document.getElementById("resolveBtn");
        if ((role === "admin" || role === "manager" || role === "hr-manager") && this.dataset.status !== "resolved") {
          resolveBtn.classList.remove("d-none");
          resolveBtn.onclick = () => resolveRequest(this.dataset.id);
        } else {
          resolveBtn.classList.add("d-none");
        }
        new bootstrap.Modal(document.getElementById("requestDetailModal")).show();
      });
    });
  }

  function resolveRequest(id) {
    fetch(`/api/service-requests/${id}/resolve`, { method: "PUT" })
    .then(() => {
        const card = document.querySelector(`[data-id="${id}"]`);
        if (card) {
            card.dataset.status = "resolved";
            const badge = card.querySelector(".badge");
            badge.className = "badge bg-success";
            badge.innerText = "resolved";
        }
        document.getElementById("detailStatus").innerText = "resolved";
        document.getElementById("resolveBtn").classList.add("d-none");
    });
  }

/* =====================================================
   REAL-TIME SOCKET UPDATES (FIXED)
===================================================== */

function attachSocketListeners() {
  if (!window.socket) {
    setTimeout(attachSocketListeners, 300);
    return;
  }

  const user = JSON.parse(localStorage.getItem("user"));
  const notificationSound = new Audio("/assets/sounds/notification.mp3");

  console.log("✅ Service Request listeners attached");

  // Warm up audio
  document.addEventListener('click', () => {
    notificationSound.play().then(() => {
      notificationSound.pause();
      notificationSound.currentTime = 0;
    }).catch(() => {});
  }, { once: true });

  window.socket.on("service_request_created", (newRequest) => {
    const role = user?.role?.toLowerCase();

    const isForAdmin =
      newRequest.request_to?.toLowerCase() === "admin" &&
      role === "admin";

    const isForHR =
      newRequest.request_to?.toLowerCase() === "hr" &&
      (role === "hr-manager" || role === "manager");

    if (isForAdmin || isForHR) {
      notificationSound.play().catch(() => {});
      role === "admin" ? loadAllRequests() : loadTeamRequests();
    }
  });

  window.socket.on("service_request_updated", (updatedRequest) => {
    const card = document.querySelector(`[data-id="${updatedRequest.id}"]`);
    if (card) {
      notificationSound.play().catch(() => {});
      card.dataset.status = updatedRequest.status;
      const badge = card.querySelector(".badge");
      badge.className = "badge bg-success";
      badge.innerText = "resolved";
    }
  });
}

attachSocketListeners();
})();
