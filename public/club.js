(() => {
  const form = document.getElementById("clubWaitlistForm");
  const email = document.getElementById("clubEmail");
  const status = document.getElementById("clubWaitlistStatus");
  const button = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!email.checkValidity()) {
      email.reportValidity();
      return;
    }
    button.disabled = true;
    status.classList.remove("is-error", "is-success");
    status.textContent = "Adding you to the waitlist…";
    try {
      const response = await fetch("/api/club/interest", {
        method: "POST",
        headers: {"Content-Type":"application/json", Accept:"application/json"},
        body: JSON.stringify({email:email.value.trim()})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not join the waitlist.");
      status.textContent = result.message;
      status.classList.add("is-success");
      form.reset();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("is-error");
    } finally {
      button.disabled = false;
    }
  });

  if (localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.body.classList.add("dark");
  }
})();
