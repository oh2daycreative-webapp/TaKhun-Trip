(function (global) {
  "use strict";

  const NAV_ITEMS = Object.freeze([
    Object.freeze({ key: "dashboard", href: "dashboard.html", label: "แดชบอร์ด" }),
    Object.freeze({ key: "places", href: "places.html", label: "สถานที่" }),
    Object.freeze({ key: "routes", href: "routes.html", label: "เส้นทาง" }),
    Object.freeze({ key: "products", href: "products.html", label: "สินค้า" }),
    Object.freeze({ key: "events", href: "events.html", label: "กิจกรรม" }),
    Object.freeze({ key: "reviews", href: "reviews.html", label: "รีวิว" }),
    Object.freeze({ key: "gallery", href: "gallery.html", label: "แกลเลอรี" }),
    Object.freeze({ key: "settings", href: "settings.html", label: "ตั้งค่า" })
  ]);
  const DESKTOP_QUERY = "(min-width: 900px)";
  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let initialized = false;
  let guardBusy = false;
  let logoutBusy = false;
  let drawerOpen = false;
  let elements = null;

  function select(selector) {
    return global.document.querySelector(selector);
  }

  function collectElements() {
    return {
      shell: select("[data-admin-shell]"),
      skip: select("[data-admin-skip]"),
      guard: select("[data-admin-guard]"),
      guardMessage: select("[data-admin-guard-message]"),
      retry: select("[data-admin-retry]"),
      loginLink: select("[data-admin-login-link]"),
      drawer: select("[data-admin-drawer]"),
      opener: select("[data-admin-drawer-open]"),
      close: select("[data-admin-drawer-close]"),
      backdrop: select("[data-admin-backdrop]"),
      header: select("[data-admin-header]"),
      main: select("[data-admin-main]"),
      content: select("[data-admin-content]"),
      nav: select("[data-admin-nav]"),
      displayName: select("[data-admin-display-name]"),
      role: select("[data-admin-role]"),
      logout: select("[data-admin-logout]"),
      account: select("[data-admin-account]"),
      accountDesktop: select("[data-admin-account-desktop]"),
      accountMobile: select("[data-admin-account-mobile]")
    };
  }

  function pageKey() {
    const value = global.document.body.getAttribute("data-admin-page");
    return NAV_ITEMS.some((item) => item.key === value) ? value : null;
  }

  function isDesktop() {
    return typeof global.matchMedia === "function" && global.matchMedia(DESKTOP_QUERY).matches;
  }

  function setHidden(element, hidden) {
    element.hidden = hidden;
    element.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  function renderNavigation() {
    const activeKey = pageKey();
    elements.nav.textContent = "";
    NAV_ITEMS.forEach((item) => {
      const link = global.document.createElement("a");
      link.classList.add("admin-nav__link");
      link.setAttribute("href", item.href);
      link.setAttribute("data-admin-nav-key", item.key);
      link.textContent = item.label;
      if (item.key === activeKey) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
      link.addEventListener("click", closeDrawer);
      elements.nav.appendChild(link);
    });
  }

  function focusableDrawerControls() {
    return Array.from(elements.drawer.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => !element.hidden && !element.disabled);
  }

  function setBackgroundInert(inert) {
    [elements.skip, elements.header, elements.main].forEach((element) => {
      if (inert) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    });
  }

  function openDrawer() {
    if (drawerOpen || isDesktop()) return;
    drawerOpen = true;
    elements.drawer.classList.add("is-open");
    setHidden(elements.drawer, false);
    elements.backdrop.hidden = false;
    elements.opener.setAttribute("aria-expanded", "true");
    global.document.body.classList.add("admin-drawer-open");
    setBackgroundInert(true);
    const controls = focusableDrawerControls();
    if (controls.length) controls[0].focus();
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    elements.drawer.classList.remove("is-open");
    elements.backdrop.hidden = true;
    elements.opener.setAttribute("aria-expanded", "false");
    global.document.body.classList.remove("admin-drawer-open");
    setBackgroundInert(false);
    if (isDesktop()) setHidden(elements.drawer, false);
    else setHidden(elements.drawer, true);
    elements.opener.focus();
  }

  function syncAccountForViewport() {
    const mount = isDesktop() ? elements.accountDesktop : elements.accountMobile;
    if (elements.account.parentElement !== mount) mount.appendChild(elements.account);
  }

  function syncDrawerForViewport() {
    syncAccountForViewport();
    if (isDesktop()) {
      drawerOpen = false;
      elements.drawer.classList.remove("is-open");
      setHidden(elements.drawer, false);
      elements.backdrop.hidden = true;
      elements.opener.setAttribute("aria-expanded", "false");
      global.document.body.classList.remove("admin-drawer-open");
      setBackgroundInert(false);
    } else if (!drawerOpen) {
      setHidden(elements.drawer, true);
    }
  }

  function trapDrawerFocus(event) {
    if (!drawerOpen || event.key !== "Tab") return;
    const controls = focusableDrawerControls();
    if (!controls.length) {
      event.preventDefault();
      elements.drawer.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!elements.drawer.contains(global.document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (controls.length === 1 || (!event.shiftKey && global.document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && global.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }

  function handleKeydown(event) {
    if (drawerOpen && event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    trapDrawerFocus(event);
  }

  function showPending() {
    global.document.body.classList.add("admin-auth-pending");
    global.document.body.classList.remove("admin-authenticated");
    setHidden(elements.shell, true);
    setHidden(elements.content, true);
    elements.skip.hidden = true;
    elements.guard.hidden = false;
    elements.guardMessage.textContent = "กำลังตรวจสอบสิทธิ์ผู้ดูแล กรุณารอสักครู่";
    elements.retry.hidden = true;
    elements.loginLink.hidden = true;
  }

  function showRetry() {
    global.document.body.classList.add("admin-auth-pending");
    setHidden(elements.shell, true);
    setHidden(elements.content, true);
    elements.skip.hidden = true;
    elements.guard.hidden = false;
    elements.guardMessage.textContent = "ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้งหรือกลับหน้าเข้าสู่ระบบ";
    elements.retry.hidden = false;
    elements.loginLink.hidden = false;
  }

  function showAuthenticated(result) {
    const admin = result && result.admin && typeof result.admin === "object" ? result.admin : {};
    elements.displayName.textContent = typeof admin.display_name === "string" ? admin.display_name : "ผู้ดูแล";
    elements.role.textContent = typeof admin.role === "string" ? admin.role : "";
    global.document.body.classList.remove("admin-auth-pending");
    global.document.body.classList.add("admin-authenticated");
    setHidden(elements.shell, false);
    setHidden(elements.content, false);
    elements.skip.hidden = false;
    elements.guard.hidden = true;
    syncDrawerForViewport();
  }

  async function runGuard() {
    if (guardBusy) return { status: "pending" };
    guardBusy = true;
    elements.retry.disabled = true;
    elements.retry.setAttribute("aria-busy", "true");
    showPending();
    try {
      return await global.TakhunAdminAuth.guardProtectedPage({
        onAuthenticated: showAuthenticated,
        onRetry: showRetry
      });
    } catch (_guardError) {
      showRetry();
      return { status: "unconfirmed" };
    } finally {
      guardBusy = false;
      elements.retry.disabled = false;
      elements.retry.setAttribute("aria-busy", "false");
    }
  }

  async function handleLogout() {
    if (logoutBusy) return;
    logoutBusy = true;
    elements.logout.disabled = true;
    elements.logout.setAttribute("aria-busy", "true");
    try {
      await global.TakhunAdminAuth.logout();
    } finally {
      logoutBusy = false;
    }
  }

  function bindInteractions() {
    elements.opener.addEventListener("click", openDrawer);
    elements.close.addEventListener("click", closeDrawer);
    elements.backdrop.addEventListener("click", closeDrawer);
    elements.retry.addEventListener("click", runGuard);
    elements.logout.addEventListener("click", handleLogout);
    global.document.addEventListener("keydown", handleKeydown);
    if (typeof global.matchMedia === "function") {
      const desktop = global.matchMedia(DESKTOP_QUERY);
      if (typeof desktop.addEventListener === "function") desktop.addEventListener("change", syncDrawerForViewport);
    }
  }

  function init() {
    if (initialized) return runGuard();
    initialized = true;
    elements = collectElements();
    renderNavigation();
    bindInteractions();
    return runGuard();
  }

  global.TakhunAdminShell = Object.freeze({ init });
})(window);
