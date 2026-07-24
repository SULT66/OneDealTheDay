(() => {
  const scrollStyle = document.createElement("style");
  scrollStyle.textContent = `
    .scroll-top-button{--scroll-progress:0deg;position:fixed!important;left:24px!important;right:auto!important;bottom:24px;z-index:80;width:56px;height:56px;padding:3px;border:0;border-radius:18px;background:conic-gradient(var(--accent,#ff6b00) var(--scroll-progress),rgba(148,153,162,.35) 0);color:var(--text,#15171a);box-shadow:0 14px 36px rgba(13,22,40,.22);cursor:pointer;opacity:0;visibility:hidden;transform:translateY(18px) scale(.92);transition:opacity .2s ease,visibility .2s ease,transform .25s ease,filter .2s ease}
    .scroll-top-button::before{content:"";position:absolute;inset:4px;border-radius:15px;background:var(--surface,#fff)}
    .scroll-top-button span{position:relative;z-index:1;display:grid;place-items:center;width:100%;height:100%;font-size:25px;font-weight:900;line-height:1}
    .scroll-top-button.is-visible{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
    .scroll-top-button:hover,.scroll-top-button:focus-visible{filter:brightness(1.06);transform:translateY(-3px) scale(1.04);outline:3px solid rgba(255,107,0,.25);outline-offset:3px}
    @media(max-width:720px){.scroll-top-button{left:14px!important;right:auto!important;bottom:14px;width:50px;height:50px;border-radius:16px}.scroll-top-button::before{border-radius:13px}}
  `;
  document.head.appendChild(scrollStyle);

  const button = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
    document.body.classList.add("dark");
  }
  if (!button) return;

  const render = () => {
    const dark = document.body.classList.contains("dark");
    const icon = button.querySelector(".theme-button-icon");
    const label = button.querySelector(".theme-button-label");
    if (icon) icon.textContent = dark ? "☀" : "☾";
    else button.textContent = dark ? "☀" : "☾";
    if (label) label.textContent = dark ? "Light" : "Dark";
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    button.title = dark ? "Light mode" : "Dark mode";
  };

  button.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
    render();
  });

  render();

  const scrollButton = document.createElement("button");
  scrollButton.type = "button";
  scrollButton.className = "scroll-top-button";
  scrollButton.setAttribute("aria-label", "Back to top");
  scrollButton.title = "Back to top";
  scrollButton.innerHTML = '<span aria-hidden="true">↑</span>';
  document.body.appendChild(scrollButton);

  const updateScrollButton = () => {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
    scrollButton.style.setProperty("--scroll-progress", `${progress * 360}deg`);
    scrollButton.classList.toggle("is-visible", window.scrollY > Math.min(420, window.innerHeight * 0.55));
  };
  scrollButton.addEventListener("click", () => window.scrollTo({top: 0, behavior: "smooth"}));
  window.addEventListener("scroll", updateScrollButton, {passive: true});
  window.addEventListener("resize", updateScrollButton);
  updateScrollButton();
})();
