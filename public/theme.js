(() => {
  const button = document.getElementById("themeToggle");
  if (!button) return;

  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
    document.body.classList.add("dark");
  }

  const render = () => {
    const dark = document.body.classList.contains("dark");
    button.textContent = dark ? "☀" : "☾";
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
