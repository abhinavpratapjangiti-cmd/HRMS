console.log("🎊 Festival engine loaded");

(async function () {
  try {
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await fetch("/api/holiday/today", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const holiday = await res.json();
    if (!holiday || !holiday.name) return;

    const check = await fetch(
      `/api/festival/should-show?festival=${encodeURIComponent(holiday.name)}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const { show } = await check.json();
    if (!show) return;

    const name = holiday.name.toLowerCase();

    if (name.includes("new year")) {
      await loadFestival("/assets/js/festivals/newyear.js");
    } else if (name.includes("sankranti")) {
      await loadFestival("/assets/js/festivals/sankranti.js");
    } else if (name.includes("diwali")) {
      await loadFestival("/assets/js/festivals/diwali.js");
    }

    await fetch("/api/festival/mark-viewed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ festival: holiday.name })
    });

  } catch (e) {
    console.warn("Festival engine skipped", e);
  }
})();

function loadFestival(src) {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();

    const s = document.createElement("script");
    s.src = src;
    s.onload = () => {
      console.log("🎉 Festival loaded:", src);
      resolve();
    };
    document.body.appendChild(s);
  });
}
