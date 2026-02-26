console.log("team-bench-map.js loaded");

let benchMap = null;
let benchMarkers = null;
const geoCache = {}; // geocode cache

/* =========================
   GEO CODING (REAL LOCATION)
========================= */
async function geocodeLocation(place) {
  if (!place) return null;
  if (geoCache[place]) return geoCache[place];

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`
    );
    const data = await res.json();

    if (data && data.length) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
      geoCache[place] = coords;
      return coords;
    }
  } catch (e) {
    console.warn("Geocode failed:", place);
  }

  return null;
}

/* =========================
   LOAD BENCH MAP
========================= */
async function loadBenchMap() {
  if (typeof L === "undefined") {
    console.error("Leaflet not loaded");
    return;
  }

  const mapEl = document.getElementById("benchMap");
  const listEl = document.getElementById("benchList");
  if (!mapEl || !listEl) return;

  /* REQUIRED for Leaflet in SPA */
  mapEl.style.height = "420px";

  /* =========================
     MAP INIT / REUSE
  ========================= */
  if (!benchMap) {
    benchMap = L.map(mapEl, {
      zoomControl: false,
      scrollWheelZoom: true
    }).setView([20.5937, 78.9629], 4); // India

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap"
    }).addTo(benchMap);

    /* Custom zoom placement */
    L.control.zoom({ position: "bottomright" }).addTo(benchMap);

    benchMarkers = L.layerGroup().addTo(benchMap);
  } else {
    benchMarkers.clearLayers();
  }

  /* 🚨 SPA CRITICAL FIX */
  setTimeout(() => benchMap.invalidateSize(true), 50);

  listEl.innerHTML = "";

  /* =========================
     LOAD BENCH DATA
  ========================= */
  let data = [];
  try {
    data = await apiGet("/analytics/bench/list");
  } catch (e) {
    listEl.innerHTML =
      `<small class="text-danger">Failed to load bench data</small>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML =
      `<small class="text-muted">No bench employees</small>`;
    return;
  }

  const bounds = [];

  /* =========================
     MARKERS + LIST
  ========================= */
  for (const emp of data) {
    const days = emp.bench_days || 0;

    const color =
      days > 30 ? "#dc2626" :
      days > 7  ? "#f59e0b" :
                  "#16a34a";

    const geo =
      await geocodeLocation(emp.work_location || "India") ||
      { lat: 20.5937, lng: 78.9629 };

    const marker = L.circleMarker([geo.lat, geo.lng], {
      radius: 8,
      color,
      fillColor: color,
      fillOpacity: 0.9
    })
      .bindPopup(`
        <b>${emp.name}</b><br/>
        ${emp.designation || "—"}<br/>
        ${emp.work_location || "India"}<br/>
        <b>${days} days on bench</b>
      `)
      .addTo(benchMarkers);

    bounds.push([geo.lat, geo.lng]);

    /* LIST ITEM */
    const item = document.createElement("div");
    item.className =
      `bench-item ${days > 30 ? "red" : days > 7 ? "orange" : "green"}`;

    item.innerHTML = `
      <div class="bench-name">${emp.name}</div>
      <div class="bench-meta">
        ${emp.designation || "—"} • ${days} days<br/>
        ${emp.work_location || "India"}
      </div>
    `;

    /* CLICK LIST → FOCUS MARKER */
    item.onclick = () => {
      benchMap.setView([geo.lat, geo.lng], 8);
      marker.openPopup();
    };

    listEl.appendChild(item);
  }

  /* AUTO FIT */
  if (bounds.length) {
    benchMap.fitBounds(bounds, { padding: [40, 40] });
  }
}

/* SPA GLOBAL */
window.loadBenchMap = loadBenchMap;
