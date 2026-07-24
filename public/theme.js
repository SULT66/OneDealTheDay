(() => {
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
