(() => {
  let mode = "register";
  const params = new URLSearchParams(location.search);
  const form = document.getElementById("authForm");
  const status = document.getElementById("status");
  const nameLabel = document.getElementById("nameLabel");
  const passwordLabel = document.getElementById("password").closest("label");
  const submit = form.querySelector("button[type=submit]");
  const forgot = document.getElementById("forgotLink");
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const passwordRules = document.getElementById("passwordRules");
  const termsLabel = document.getElementById("termsLabel");
  const termsAccepted = document.getElementById("termsAccepted");

  const updatePasswordRules = () => {
    const password = passwordInput.value;
    const rules = {
      length: password.length >= 12,
      lower: /[a-z]/.test(password),
      upper: /[A-Z]/.test(password),
      number: /\d/.test(password),
      symbol: /[^A-Za-z0-9]/.test(password)
    };
    passwordRules.querySelectorAll("[data-rule]").forEach(item => item.classList.toggle("met", rules[item.dataset.rule]));
    return Object.values(rules).every(Boolean);
  };

  const setMode = next => {
    mode = next;
    const reset = mode === "reset";
    const forgotMode = mode === "forgot";
    document.getElementById("tabs").hidden = reset || forgotMode;
    nameLabel.hidden = mode !== "register";
    form.reset();
    status.classList.remove("is-error");
    submit.hidden = false;
    submit.disabled = false;
    nameInput.required = mode === "register";
    passwordLabel.hidden = forgotMode;
    passwordInput.required = !forgotMode;
    passwordRules.hidden = forgotMode || mode === "login";
    termsLabel.hidden = mode !== "register";
    termsAccepted.required = mode === "register";
    passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
    forgot.hidden = mode !== "login";
    document.getElementById("title").textContent = reset ? "Choose a new password" : forgotMode ? "Reset your password" : mode === "register" ? "Create your free account" : "Welcome back";
    submit.textContent = reset ? "Save new password" : forgotMode ? "Send reset link" : mode === "register" ? "Create free account" : "Sign In";
    document.getElementById("registerTab").classList.toggle("active", mode === "register");
    document.getElementById("loginTab").classList.toggle("active", mode === "login");
    status.innerHTML = forgotMode ? 'We will email a secure link that expires in one hour.<br><button class="back-button" type="button">Back to Sign In</button>' : reset ? "Create a strong password for your account." : mode === "register" ? "Free forever. Club is optional." : "Enter the email and password for your account.";
    status.querySelector(".back-button")?.addEventListener("click", () => setMode("login"));
    updatePasswordRules();
    (mode === "register" ? nameInput : emailInput).focus();
  };

  document.getElementById("registerTab").onclick = () => setMode("register");
  document.getElementById("loginTab").onclick = () => setMode("login");
  forgot.onclick = event => { event.preventDefault(); setMode("forgot"); };
  if (location.pathname === "/reset-password" && params.get("token")) setMode("reset");
  else if (params.get("mode") === "login") setMode("login");
  passwordInput.addEventListener("input", updatePasswordRules);

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
    status.classList.remove("is-error");
    if ((mode === "register" || mode === "reset") && !updatePasswordRules()) {
      status.textContent = "Your password must meet all five requirements.";
      status.classList.add("is-error");
      passwordInput.focus();
      return;
    }
    if (mode === "register" && !termsAccepted.checked) {
      status.textContent = "Please agree to the Terms and Privacy Policy.";
      status.classList.add("is-error");
      termsAccepted.focus();
      return;
    }
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
      status.classList.add("is-error");
      submit.disabled = false;
    }
  });

  const logout = async () => { await fetch("/api/auth/logout", {method:"POST"}); location.href="/"; };
  document.getElementById("profileLogout").onclick = logout;

  /* The Google button appears only once the server confirms a client is
     configured. Shipping it before the keys are in place would send people to
     a broken sign-in at the one moment they were willing to sign up. */
  const googleButton = document.getElementById("googleButton");
  const orDivider = document.getElementById("orDivider");
  if (googleButton) {
    fetch("/api/auth/providers")
      .then((response) => response.json())
      .then((providers) => {
        if (!providers || !providers.google) return;
        googleButton.hidden = false;
        if (orDivider) orDivider.hidden = false;
      })
      .catch(() => {});
  }

  /* Something failed inside Google's redirect and the shopper is back here
     with no idea why. Say what to do next in one sentence, and never show the
     underlying reason: it means nothing to them, and it helps anyone probing
     the flow work out which step they got past. */
  const googleFailures = {
    google_unavailable: "Google sign-in is not set up yet. Use your email and password for now.",
    google_state: "That sign-in link expired. Tap Continue with Google to try again.",
    google_cancelled: "Google sign-in was cancelled. Nothing has changed.",
    google_identity: "Google did not confirm that email address, so we could not sign you in.",
    google: "Google sign-in did not go through. Please try again."
  };
  const failure = googleFailures[new URLSearchParams(location.search).get("error")];
  if (failure) {
    status.textContent = failure;
    status.classList.add("is-error");
  }
})();
