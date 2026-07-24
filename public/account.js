(() => {
  let mode = "register";
  const params = new URLSearchParams(location.search);
  const form = document.getElementById("authForm");
  const status = document.getElementById("status");
  const nameLabel = document.getElementById("nameLabel");
  const passwordLabel = document.getElementById("password").closest("label");
  const submit = form.querySelector("button[type=submit]");
  const forgot = document.getElementById("forgotLink");

  const setMode = next => {
    mode = next;
    const reset = mode === "reset";
    const forgotMode = mode === "forgot";
    document.getElementById("tabs").hidden = reset || forgotMode;
    nameLabel.hidden = mode !== "register";
    document.getElementById("name").required = mode === "register";
    passwordLabel.hidden = forgotMode;
    document.getElementById("password").required = !forgotMode;
    forgot.hidden = mode !== "login";
    document.getElementById("title").textContent = reset ? "Choose a new password" : forgotMode ? "Reset your password" : mode === "register" ? "Create your account" : "Welcome back";
    submit.textContent = reset ? "Save new password" : forgotMode ? "Send reset link" : mode === "register" ? "Create free account" : "Sign In";
    document.getElementById("registerTab").classList.toggle("active", mode === "register");
    document.getElementById("loginTab").classList.toggle("active", mode === "login");
    status.innerHTML = forgotMode ? 'We will email a secure link that expires in one hour.<br><button class="back-button" type="button">Back to Sign In</button>' : reset ? "Use at least 8 characters." : mode === "register" ? "Free forever. Club is optional." : "Enter the email and password for your account.";
    status.querySelector(".back-button")?.addEventListener("click", () => setMode("login"));
  };

  document.getElementById("registerTab").onclick = () => setMode("register");
  document.getElementById("loginTab").onclick = () => setMode("login");
  forgot.onclick = event => { event.preventDefault(); setMode("forgot"); };
  if (params.get("plan") === "club") document.getElementById("planNote").hidden = false;
  if (location.pathname === "/reset-password" && params.get("token")) setMode("reset");
  else if (params.get("mode") === "login") setMode("login");

  fetch("/api/me").then(r => r.json()).then(({user}) => {
    if (!user || mode === "reset") return;
    document.getElementById("authCard").hidden = true;
    const profile = document.getElementById("profileCard");
    profile.hidden = false;
    document.getElementById("profileAvatar").textContent = (user.name || user.email).charAt(0).toUpperCase();
    document.getElementById("profileName").textContent = user.name;
    document.getElementById("profileEmail").textContent = user.email;
    const isClub = user.membership === "club";
    document.getElementById("profilePlan").textContent = isClub ? "OneDailyDrop Club" : "Free account";
    document.getElementById("profilePlanText").textContent = isClub ? "Your Club membership is active." : "You are signed in on the Free plan.";
    document.getElementById("profileSubscribe").hidden = isClub;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = mode === "register" ? "Creating your account…" : mode === "login" ? "Signing in…" : mode === "forgot" ? "Sending your secure link…" : "Saving your new password…";
    const endpoint = mode === "forgot" ? "/api/auth/forgot-password" : mode === "reset" ? "/api/auth/reset-password" : `/api/auth/${mode}`;
    const body = mode === "forgot" ? {email:document.getElementById("email").value} : mode === "reset" ? {token:params.get("token"),password:document.getElementById("password").value} : {name:document.getElementById("name").value,email:document.getElementById("email").value,password:document.getElementById("password").value};
    try {
      const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please try again.");
      if (mode === "forgot") {
        status.textContent = result.message;
        submit.hidden = true;
      } else {
        location.href = mode === "reset" ? "/account" : params.get("plan") === "club" ? "/club" : "/account";
      }
    } catch (error) {
      status.textContent = error.message;
      submit.disabled = false;
    }
  });

  const logout = async () => { await fetch("/api/auth/logout", {method:"POST"}); location.href="/"; };
  document.getElementById("profileLogout").onclick = logout;
})();
