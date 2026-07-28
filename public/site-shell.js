(() => {
  const localizedText = window.__ODD_TEXT__ || {};
  const tr = (key, fallback) => localizedText[key] || fallback;
  const categoryMenu = document.querySelector(".category-menu");
  const menuButton = categoryMenu?.querySelector(":scope > button");
  const menu = categoryMenu?.querySelector(".mega-menu");
  if (!menuButton || !menu) return;

  const closeMenu = () => {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  };

  menuButton.addEventListener("click", () => {
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    menuButton.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".category-menu")) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      const menuWasOpen = !menu.hidden;
      closeMenu();
      if (menuWasOpen) menuButton.focus();
    }
  });
})();

(() => {
  const toggle = document.querySelector(".mobile-menu-toggle");
  const navigation = document.getElementById("mainNavigation");
  if (!toggle || !navigation) return;

  const mobileMenuQuery = window.matchMedia("(max-width: 720px)");
  const closeCategoryMenu = () => {
    const categoryMenu = navigation.querySelector(".category-menu");
    const button = categoryMenu?.querySelector(":scope > button");
    const menu = categoryMenu?.querySelector(".mega-menu");
    if (!button || !menu) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };
  const closeMobileMenu = (restoreFocus = false) => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", tr("menu.open", "Open menu"));
    navigation.classList.remove("is-open");
    closeCategoryMenu();
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => {
    const willOpen = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(willOpen));
    toggle.setAttribute("aria-label", willOpen ? tr("menu.close", "Close menu") : tr("menu.open", "Open menu"));
    navigation.classList.toggle("is-open", willOpen);
  });
  navigation.addEventListener("click", event => {
    if (mobileMenuQuery.matches && event.target.closest("a")) closeMobileMenu();
  });
  document.addEventListener("click", event => {
    if (
      mobileMenuQuery.matches &&
      toggle.getAttribute("aria-expanded") === "true" &&
      !event.target.closest(".site-header")
    ) closeMobileMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      closeMobileMenu(true);
    }
  });
  mobileMenuQuery.addEventListener("change", event => {
    if (!event.matches) closeMobileMenu();
  });
})();
