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
})();
