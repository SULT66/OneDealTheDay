(() => {
  const modal = document.getElementById("gateModal");
  const title = document.getElementById("modalTitle");
  const text = document.getElementById("modalText");
  const action = document.getElementById("modalAction");
  let user = null;

  const showModal = () => {
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modal.querySelector(".close").focus();
  };
  const closeModal = () => {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };
  const setGateAction = () => {
    if (user) {
      action.href = "#compare";
      action.textContent = "View Club membership";
    } else {
      action.href = "/account?plan=club";
      action.textContent = "Create free account";
    }
  };

  const userReady = fetch("/api/me").then(response => response.json()).then(data => {
    user = data.user;
    setGateAction();
    return user;
  });

  document.querySelectorAll(".club-action").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch("/api/club/participate", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({feature: button.dataset.feature})
    });
    const result = await response.json();
    title.textContent = response.ok ? `${button.dataset.feature} unlocked` : user ? `Unlock ${button.dataset.feature}` : "Create your free account";
    text.textContent = response.ok ? result.message : result.error;
    setGateAction();
    showModal();
  }));

  modal.querySelectorAll("[data-close-modal]").forEach(element => {
    element.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    });
  });
  action.addEventListener("click", event => {
    if (!user) return;
    event.preventDefault();
    closeModal();
    document.getElementById("compare").scrollIntoView({behavior: "smooth", block: "start"});
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  document.querySelectorAll("[data-subscribe]").forEach(link => {
    link.addEventListener("click", async event => {
      event.preventDefault();
      await userReady;
      if (!user) {
        location.href = "/account?plan=club";
        return;
      }
      title.textContent = "Club checkout is not connected yet";
      text.textContent = "Your Free account is active. Secure $2.99/month payment will open here after Stripe is connected.";
      action.href = "#compare";
      action.textContent = "Review Club benefits";
      showModal();
    });
  });

  document.getElementById("themeToggle").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  };
  if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");
})();
