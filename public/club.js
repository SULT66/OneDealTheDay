(() => {
  const modal = document.getElementById("gateModal");
  const title = document.getElementById("modalTitle");
  const text = document.getElementById("modalText");
  let user = null;
  fetch("/api/me").then(response => response.json()).then(data => { user = data.user; });
  document.querySelectorAll(".club-action").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch("/api/club/participate", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feature:button.dataset.feature})});
    const result = await response.json();
    title.textContent = response.ok ? `${button.dataset.feature} unlocked` : user ? `Unlock ${button.dataset.feature}` : "Create your free account";
    text.textContent = response.ok ? result.message : result.error;
    modal.hidden = false;
  }));
  modal.querySelector(".close").onclick = () => modal.hidden = true;
  modal.querySelector(".backdrop").onclick = () => modal.hidden = true;
  document.getElementById("themeToggle").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  };
  if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");
})();
