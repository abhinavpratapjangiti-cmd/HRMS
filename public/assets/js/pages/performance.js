console.log("performance.js loaded");

function initPerformance() {
  console.log("initPerformance called");

  const container = document.getElementById("page-content");
  if (!container) return;

  // Temporary content (to confirm page loads)
  container.innerHTML = `
    <div class="card p-4">
      <h4>Performance</h4>
      <p>This page is loading correctly.</p>
    </div>
  `;
}
