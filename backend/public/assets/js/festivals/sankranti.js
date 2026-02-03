function loadSankranti() {
  console.log("🪁 Sankranti animation");

  const container = document.createElement("div");
  container.style.cssText = `
    position:fixed; inset:0;
    pointer-events:none;
    z-index:9999;
  `;
  document.body.appendChild(container);

  for (let i = 0; i < 8; i++) {
    const kite = document.createElement("div");
    kite.innerText = "🪁";
    kite.style.cssText = `
      position:absolute;
      font-size:${24 + Math.random() * 24}px;
      left:${Math.random() * 100}%;
      top:${60 + Math.random() * 20}%;
      animation: kiteFly ${8 + Math.random() * 4}s linear infinite;
    `;
    container.appendChild(kite);
  }

  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes kiteFly {
      from { transform: translateX(-120px) rotate(-10deg); }
      to { transform: translateX(120vw) rotate(10deg); }
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => container.remove(), 7000);
}
