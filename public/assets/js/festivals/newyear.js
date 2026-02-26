console.log("🎆 New Year festival script loaded");

(function () {
  // Prevent double render
  if (document.getElementById("festival-overlay")) return;

  // Overlay
  const overlay = document.createElement("div");
  overlay.id = "festival-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: radial-gradient(circle at top, #1e3a8a, #020617);
    overflow: hidden;
  `;

  // Greeting
  const msg = document.createElement("div");
  msg.innerHTML = `
    <h1 style="font-size:48px;margin:0">🎉 Happy New Year 2026 🎉</h1>
    <p style="font-size:18px;opacity:0.9">Wishing you success & happiness at LovasIT</p>
  `;
  msg.style.cssText = `
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    text-align: center;
    font-family: system-ui, sans-serif;
    animation: fadeIn 1.2s ease;
  `;
  overlay.appendChild(msg);

  // Confetti
  for (let i = 0; i < 120; i++) {
    const c = document.createElement("div");
    c.style.cssText = `
      position:absolute;
      width:8px;
      height:8px;
      background:hsl(${Math.random() * 360},100%,60%);
      top:-10px;
      left:${Math.random() * 100}%;
      opacity:0.9;
      animation: fall ${3 + Math.random() * 3}s linear infinite;
    `;
    overlay.appendChild(c);
  }

  // Close hint
  const closeHint = document.createElement("div");
  closeHint.innerText = "Click anywhere to continue";
  closeHint.style.cssText = `
    position:absolute;
    bottom:40px;
    width:100%;
    text-align:center;
    color:#c7d2fe;
    font-size:14px;
    font-family:system-ui;
  `;
  overlay.appendChild(closeHint);

  overlay.onclick = () => overlay.remove();

  // Animations
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes fall {
      to { transform: translateY(110vh) rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity:0; transform:translate(-50%,-60%); }
      to { opacity:1; transform:translate(-50%,-50%); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(overlay);

  // Soft chime (desktop safe)
  const audio = new Audio("/assets/sounds/newyear-chime.mp3");
  audio.volume = 0.3;
  audio.play().catch(() => {});
})();
