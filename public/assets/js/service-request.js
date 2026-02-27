(function initServiceRequest() {
  // 1. Grab elements from the DOM
  const toSelect = document.getElementById("srTo");
  const fromInput = document.getElementById("loggedUser");
  const subjectInput = document.getElementById("srSubject");
  const messageInput = document.getElementById("srMessage");
  const submitBtn = document.getElementById("srSubmitBtn");

  // Prevent crashing if the page hasn't fully rendered the button yet
  if (!submitBtn) return;

  // 2. Auto-fill the 'From' input with the active user's name
  const headerUserName = document.getElementById("profileName");
  if (fromInput && headerUserName) {
    fromInput.value = headerUserName.innerText;
  }

  // 3. Attach the click listener
  submitBtn.addEventListener("click", function (e) {
    e.preventDefault(); // Stop standard form submission

    const to = toSelect ? toSelect.value : "Admin";
    const subject = subjectInput ? subjectInput.value.trim() : "";
    const message = messageInput ? messageInput.value.trim() : "";

    // 4. Basic Validation
    if (subject === "" || message === "") {
      alert("Please fill in both the Subject and Your Message.");
      return;
    }

    // 5. Loading State
    submitBtn.innerText = "Submitting...";
    submitBtn.disabled = true;

// 6. Real API Call to your Flask Backend
    fetch('/api/service-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${localStorage.getItem('token')}` // Uncomment if your API requires a login token
      },
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
      
      // Clear the form
      if (subjectInput) subjectInput.value = "";
      if (messageInput) messageInput.value = "";
      
      // Reset the button
      submitBtn.innerText = "Submit";
      submitBtn.disabled = false;
    })
    .catch(error => {
      console.error("Error submitting request:", error);
      alert("Something went wrong saving to the database. Check the console.");
      submitBtn.innerText = "Submit";
      submitBtn.disabled = false;
    });
  });

  /* =====================================================
     ROLE BASED EXTRA CARD (Manager / Admin Only)
  ===================================================== */

  const roleContainer = document.getElementById("roleBasedContainer");

  if (roleContainer) {
    const user = JSON.parse(localStorage.getItem("user"));
    const role = user?.role?.toLowerCase();

    if (role === "manager" || role === "admin") {

      roleContainer.innerHTML = `
        <div class="card shadow-sm">
          <div class="card-header bg-primary text-white">
            <h5 class="mb-0">
              ${role === "manager" 
                ? "Team Service Requests" 
                : "All Employees Service Requests"}
            </h5>
          </div>
          <div class="card-body">
            <div id="roleRequestList">Loading...</div>
          </div>
        </div>
      `;

      if (role === "manager") {
        loadTeamRequests();
      } else {
        loadAllRequests();
      }
    }
  }

  function loadTeamRequests() {
    fetch('/api/service-requests/team')
      .then(res => res.json())
      .then(data => renderRequests(data))
      .catch(err => {
        console.error(err);
        document.getElementById("roleRequestList").innerHTML =
          "<p class='text-danger'>Failed to load team requests</p>";
      });
  }

  function loadAllRequests() {
    fetch('/api/service-requests/all')
      .then(res => res.json())
      .then(data => renderRequests(data))
      .catch(err => {
        console.error(err);
        document.getElementById("roleRequestList").innerHTML =
          "<p class='text-danger'>Failed to load requests</p>";
      });
  }

function renderRequests(data) {
  const container = document.getElementById("roleRequestList");
  const user = JSON.parse(localStorage.getItem("user"));
  const role = user?.role?.toLowerCase();

  if (!data || data.length === 0) {
    container.innerHTML = "<p>No service requests found.</p>";
    return;
  }

  container.innerHTML = data.map(req => {

    const statusClass =
      req.status === "resolved"
        ? "bg-success"
        : "bg-warning text-dark";

    return `
      <div class="border rounded p-3 mb-2 request-item"
           style="cursor:pointer"
           data-id="${req.id}"
           data-from="${req.request_from}"
           data-to="${req.request_to}"
           data-subject="${req.subject}"
           data-message="${req.message}"
           data-status="${req.status}">

        <div class="d-flex justify-content-between">
          <strong>${req.subject}</strong>
          <span class="badge ${statusClass}">
            ${req.status}
          </span>
        </div>

        <small class="text-muted">From: ${req.request_from}</small>
      </div>
    `;
  }).join("");

  attachClickHandlers(role);
}

function resolveRequest(id) {
  fetch(`/api/service-requests/${id}/resolve`, {
    method: "PUT"
  })
  .then(res => res.json())
  .then(() => {

    // Update badge instantly without full reload
    const card = document.querySelector(`[data-id="${id}"]`);

    if (card) {
      card.dataset.status = "resolved";

      const badge = card.querySelector(".badge");
      badge.className = "badge bg-success";
      badge.innerText = "resolved";
    }

    // Update modal status text
    document.getElementById("detailStatus").innerText = "resolved";

    // Hide resolve button
    document.getElementById("resolveBtn").classList.add("d-none");

  })
  .catch(err => {
    console.error(err);
    alert("Failed to resolve request");
  });
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

      if ((role === "admin" || role === "manager") &&
          this.dataset.status !== "resolved") {

        resolveBtn.classList.remove("d-none");
        resolveBtn.onclick = () => resolveRequest(this.dataset.id);

      } else {
        resolveBtn.classList.add("d-none");
      }

      const modal = new bootstrap.Modal(
        document.getElementById("requestDetailModal")
      );
      modal.show();
    });
  });
}

/* =====================================================
   REAL-TIME SOCKET UPDATES (TARGETED USERS ONLY)
===================================================== */

if (window.socket) {

  const notificationSound = new Audio("/assets/sounds/notification.mp3");

  // 🔔 When new request arrives
  window.socket.on("service_request_created", (newRequest) => {

    notificationSound.play();

    const user = JSON.parse(localStorage.getItem("user"));
    const role = user?.role?.toLowerCase();

    // Reload only if user is admin or manager
    if (role === "admin") {
      loadAllRequests();
    }

    if (role === "manager") {
      loadTeamRequests();
    }
  });

  // 🔔 When request gets resolved
  window.socket.on("service_request_updated", (updatedRequest) => {

    notificationSound.play();

    const card = document.querySelector(
      `[data-id="${updatedRequest.id}"]`
    );

    if (card) {
      card.dataset.status = updatedRequest.status;

      const badge = card.querySelector(".badge");
      badge.className = "badge bg-success";
      badge.innerText = "resolved";
    }

    // Update modal if open
    const statusEl = document.getElementById("detailStatus");
    if (statusEl) {
      statusEl.innerText = updatedRequest.status;
    }
  });

}

})();

