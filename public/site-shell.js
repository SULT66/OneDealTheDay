(() => {
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
      closeMenu();
      menuButton.focus();
    }
  });
})();
