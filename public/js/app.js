"use strict";

document.documentElement.classList.add("js");

const PUBLIC_NAVIGATION = Object.freeze({
  primary: [
    { key: "home", label: "หน้าแรก", href: "index.html", icon: "home" },
    { key: "map", label: "แผนที่", href: "map.html", icon: "map" },
    { key: "plan", label: "วางแผน", href: "trip-planner.html", icon: "plan" },
    { key: "saved", label: "บันทึกไว้", href: "favorites.html", icon: "saved" }
  ],
  secondary: [
    { key: "search", label: "ค้นหา", detail: "ค้นหาทั่ว Takhun Trip", href: "search.html", tone: "blue", icon: "search" },
    { key: "routes", label: "เส้นทาง", detail: "ทริปพร้อมออกเดินทาง", href: "routes.html", tone: "orange", icon: "routes" },
    { key: "places", label: "สถานที่", detail: "ธรรมชาติและชุมชน", href: "places.html", tone: "", icon: "pin" },
    { key: "products", label: "สินค้าและชุมชน", detail: "ของดีจากคนในพื้นที่", href: "products.html", tone: "gold", icon: "products" },
    { key: "events", label: "กิจกรรม", detail: "เทศกาลและเรื่องน่าสนใจ", href: "events.html", tone: "rose", icon: "events" },
    { key: "gallery", label: "แกลเลอรี", detail: "ภาพความทรงจำบ้านตาขุน", href: "gallery.html", tone: "blue", icon: "gallery" },
    { key: "about", label: "เกี่ยวกับเรา", detail: "รู้จัก Takhun Trip", href: "about.html", tone: "", icon: "about" }
  ]
});

const PUBLIC_PAGE_MAP = Object.freeze({
  "index.html": { primary: "home" },
  "map.html": { primary: "map" },
  "trip-planner.html": { primary: "plan" },
  "favorites.html": { primary: "saved" },
  "search.html": { more: true, secondary: "search" },
  "places.html": { more: true, secondary: "places" },
  "place-detail.html": { more: true, secondary: "places" },
  "routes.html": { more: true, secondary: "routes" },
  "route-detail.html": { more: true, secondary: "routes" },
  "products.html": { more: true, secondary: "products" },
  "product-detail.html": { more: true, secondary: "products" },
  "events.html": { more: true, secondary: "events" },
  "event-detail.html": { more: true, secondary: "events" },
  "gallery.html": { more: true, secondary: "gallery" },
  "about.html": { more: true, secondary: "about" }
});

const SHELL_ICONS = Object.freeze({
  home: '<path d="m3 11 9-8 9 8v9h-6v-6H9v6H3Z"/>',
  map: '<path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15m6-12v15"/>',
  plan: '<path d="M5 3v3m14-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="m9 14 2 2 4-4"/>',
  saved: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  routes: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  products: '<path d="M4 8h16v12H4Z"/><path d="M2 8l2-5h16l2 5M9 8v12m6-12v12"/>',
  events: '<path d="M5 3v3m14-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/>',
  gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 3 3 2-2 6 5"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'
});

function resolvePublicNavigation(pageName = "") {
  const normalized = pageName.split(/[?#]/)[0].split("/").pop() || "index.html";
  return PUBLIC_PAGE_MAP[normalized] || { more: true };
}

function shellSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${SHELL_ICONS[name]}</svg>`;
}

function activeAttributes(isActive) {
  return isActive ? ' class="is-active" aria-current="page"' : "";
}

function i18nText(key) {
  return window.TakhunI18n?.t(key) || key;
}

function renderPublicShell() {
  const mount = document.querySelector("[data-public-shell]");
  if (!mount) return;
  const current = resolvePublicNavigation(mount.dataset.page || window.location.pathname);
  const desktopLinks = [
    ...PUBLIC_NAVIGATION.primary.slice(0, 1),
    ...PUBLIC_NAVIGATION.secondary.slice(2, 3),
    ...PUBLIC_NAVIGATION.secondary.slice(1, 2),
    ...PUBLIC_NAVIGATION.primary.slice(1, 3),
    ...PUBLIC_NAVIGATION.secondary.slice(0, 1)
  ].map((item) => `<a${activeAttributes(current.primary === item.key || current.secondary === item.key)} href="${item.href}"><span data-i18n="${item.key === "search" ? "search.nav_label" : `nav.${item.key}`}">${item.label}</span></a>`).join("");
  const drawerLinks = PUBLIC_NAVIGATION.secondary.map((item) => {
    const tone = item.tone ? ` drawer-link__icon--${item.tone}` : "";
    return `<a${activeAttributes(current.secondary === item.key)} href="${item.href}"><span class="drawer-link__icon${tone}">${shellSvg(item.icon)}</span><span><span data-i18n="${item.key === "search" ? "search.nav_label" : `nav.${item.key}`}">${item.label}</span><small data-i18n="nav_detail.${item.key}">${item.detail}</small></span></a>`;
  }).join("");
  const bottomLinks = PUBLIC_NAVIGATION.primary.map((item) => `<a class="bottom-nav__item${current.primary === item.key ? " is-active" : ""}" href="${item.href}"${current.primary === item.key ? ' aria-current="page"' : ""} aria-label="${item.label}" data-i18n-attr="aria-label:nav.${item.key}">${shellSvg(item.icon)}<span data-i18n="nav.${item.key}">${item.label}</span></a>`).join("");
  const template = document.createElement("template");
  template.innerHTML = `
    <header class="site-header" data-site-header>
      <div class="site-header__inner">
        <a class="brand" href="index.html" aria-label="Takhun Trip หน้าแรก" data-i18n-attr="aria-label:shell.brand_home"><span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M7 31 18 15l7 10 5-7 11 13H7Z"/><path d="M7 34c7-4 13 4 20 0s10-1 14 1"/></svg></span><span class="brand__text"><strong>Takhun Trip</strong><small data-i18n="shell.location">บ้านตาขุน · สุราษฎร์ธานี</small></span></a>
        <nav class="site-nav" aria-label="เมนูหลัก" data-i18n-attr="aria-label:shell.primary_menu">${desktopLinks}</nav>
        <a class="button button--compact site-header__cta" href="trip-planner.html" data-i18n="actions.create_trip">สร้างทริปของคุณ</a>
        <div class="language-switcher header-language-switcher" role="group" aria-label="เลือกภาษา" data-i18n-attr="aria-label:shell.language_group"><button class="language-switcher__btn" type="button" data-lang="th" aria-label="ภาษาไทย" data-i18n-attr="aria-label:shell.thai" aria-pressed="true">TH</button><button class="language-switcher__btn" type="button" data-lang="en" aria-label="English" data-i18n-attr="aria-label:shell.english" aria-pressed="false">EN</button></div>
        <button class="menu-toggle" type="button" aria-label="เปิดเมนูเพิ่มเติม" data-i18n-attr="aria-label:shell.open_menu" aria-controls="mobile-menu" aria-expanded="false"><span></span><span></span><span></span></button>
      </div>
    </header>
    <div class="drawer-backdrop" data-menu-backdrop hidden></div>
    <aside class="mobile-drawer" id="mobile-menu" aria-label="เมนูเพิ่มเติม" data-i18n-attr="aria-label:shell.more_menu" aria-hidden="true" hidden>
      <div class="mobile-drawer__header"><span class="mobile-drawer__title" data-i18n="shell.explore">ออกสำรวจบ้านตาขุน</span><button class="icon-button" type="button" data-menu-close aria-label="ปิดเมนู" data-i18n-attr="aria-label:shell.close"><span class="close-glyph" aria-hidden="true">×</span></button></div>
      <nav class="mobile-drawer__nav" aria-label="เมนูรอง" data-i18n-attr="aria-label:shell.secondary_menu">${drawerLinks}</nav>
    </aside>
    <nav class="bottom-nav" aria-label="เมนูหลักบนมือถือ" data-i18n-attr="aria-label:shell.mobile_primary_menu">${bottomLinks}<button class="bottom-nav__item bottom-nav__more${current.more ? " is-active" : ""}" type="button" aria-label="เพิ่มเติม" data-i18n-attr="aria-label:nav.more" aria-controls="mobile-menu" aria-expanded="false">${shellSvg("more")}<span data-i18n="nav.more">เพิ่มเติม</span></button></nav>`;
  mount.replaceChildren(template.content);
  mount.classList.add("is-ready");
  window.TakhunI18n?.applyTranslations(mount);
}

renderPublicShell();

const menuToggle = document.querySelector(".menu-toggle");
const moreToggle = document.querySelector(".bottom-nav__more");
const mobileMenu = document.querySelector("#mobile-menu");
const menuClose = document.querySelector("[data-menu-close]");
const menuBackdrop = document.querySelector("[data-menu-backdrop]");
let lastDrawerTrigger = menuToggle || moreToggle;

function openMobileMenu(trigger = menuToggle || moreToggle) {
  if ((!menuToggle && !moreToggle) || !mobileMenu || !menuBackdrop) return;
  lastDrawerTrigger = trigger;
  mobileMenu.hidden = false; menuBackdrop.hidden = false;
  requestAnimationFrame(() => document.body.classList.add("menu-is-open"));
  menuToggle?.setAttribute("aria-expanded", "true"); moreToggle?.setAttribute("aria-expanded", "true");
  moreToggle?.classList.add("is-expanded"); mobileMenu.setAttribute("aria-hidden", "false");
  menuToggle?.setAttribute("data-i18n-attr", "aria-label:shell.close_menu");
  menuToggle?.setAttribute("aria-label", i18nText("shell.close_menu")); menuClose?.focus();
}

function closeMobileMenu({ restoreFocus = true } = {}) {
  if ((!menuToggle && !moreToggle) || !mobileMenu || !menuBackdrop) return;
  document.body.classList.remove("menu-is-open"); menuToggle?.setAttribute("aria-expanded", "false");
  moreToggle?.setAttribute("aria-expanded", "false"); moreToggle?.classList.remove("is-expanded");
  menuToggle?.setAttribute("data-i18n-attr", "aria-label:shell.open_menu");
  menuToggle?.setAttribute("aria-label", i18nText("shell.open_menu")); mobileMenu.setAttribute("aria-hidden", "true");
  window.setTimeout(() => { mobileMenu.hidden = true; menuBackdrop.hidden = true; }, 220);
  if (restoreFocus) lastDrawerTrigger?.focus();
}

menuToggle?.addEventListener("click", () => menuToggle.getAttribute("aria-expanded") === "true" ? closeMobileMenu() : openMobileMenu(menuToggle));
moreToggle?.addEventListener("click", () => moreToggle.getAttribute("aria-expanded") === "true" ? closeMobileMenu() : openMobileMenu(moreToggle));
menuClose?.addEventListener("click", () => closeMobileMenu());
menuBackdrop?.addEventListener("click", () => closeMobileMenu());
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && menuToggle?.getAttribute("aria-expanded") === "true") closeMobileMenu(); });
mobileMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMobileMenu({ restoreFocus: false })));

function trapDrawerFocus(event) {
  if (event.key !== "Tab" || !document.body.classList.contains("menu-is-open") || !mobileMenu) return;
  const focusable = [...mobileMenu.querySelectorAll('a[href], button:not([disabled])')];
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

document.addEventListener("keydown", trapDrawerFocus);
