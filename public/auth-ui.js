(() => {
  const mount = document.querySelector("[data-account-nav]");
  if (!mount) return;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));

  fetch("/api/me").then(response => response.json()).then(({user}) => {
    if (!user) {
      mount.innerHTML = '<a class="sign-in-link" href="/account?mode=login">Sign In</a>';
      return;
    }
    const initial = esc((user.name || user.email || "A").trim().charAt(0).toUpperCase());
    const plan = user.membership === "club" ? "Club member" : "Free account";
    mount.innerHTML = `<details class="account-menu"><summary><span class="account-avatar">${initial}</span><span class="account-summary"><b>${esc(user.name)}</b><small>${esc(plan)}</small></span><span aria-hidden="true">⌄</span></summary><div class="account-popover"><p>Signed in as</p><strong>${esc(user.email)}</strong><a href="/account">My account</a>${user.membership === "club" ? "" : '<a class="upgrade-link" href="/club">Subscribe - $2.99/month</a>'}<button type="button" data-logout>Log Out</button></div></details>`;
    mount.querySelector("[data-logout]").addEventListener("click", async () => {
      await fetch("/api/auth/logout", {method:"POST"});
      location.href = "/";
    });
  }).catch(() => {
    mount.innerHTML = '<a class="sign-in-link" href="/account?mode=login">Sign In</a>';
  });
})();
