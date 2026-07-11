"use strict";

document.documentElement.classList.add("js");

const HOME_DATA = Object.freeze({
  featuredPlaces: [
    { name: "ทะเลสาบเชี่ยวหลาน", category: "ธรรมชาติ", description: "ล่องเรือผ่านผืนน้ำสีมรกต โอบล้อมด้วยภูเขาหินปูนและหมอกยามเช้า", href: "place-detail.html?id=cheow-lan-lake", tone: "lake", label: "ยอดนิยม" },
    { name: "ภูเขารูปหัวใจ", category: "จุดชมวิว", description: "มุมมองอันเป็นเอกลักษณ์ของบ้านเขาเทพพิทักษ์ พร้อมวิถีชุมชนที่น่ารัก", href: "place-detail.html?id=heart-mountain", tone: "heart", label: "ถ่ายรูปสวย" },
    { name: "เขื่อนรัชชประภา", category: "แลนด์มาร์ก", description: "ชมวิวกว้างจากสันเขื่อน รับลมเย็น และแสงสีทองในช่วงเย็น", href: "place-detail.html?id=ratchaprapha-dam", tone: "dam", label: "ห้ามพลาด" }
  ],
  recommendedRoutes: [
    { title: "เชี่ยวหลานในหนึ่งวัน", subtitle: "ทะเลสาบ · เขาสามเกลอ · สันเขื่อน", stops: 4, duration: "เต็มวัน", type: "ธรรมชาติ", href: "route-detail.html?id=cheow-lan-one-day", tone: "route-lake" },
    { title: "หัวใจแห่งเขาเทพพิทักษ์", subtitle: "สะพานแขวน · ภูเขารูปหัวใจ · ชุมชน", stops: 5, duration: "ครึ่งวัน", type: "ชุมชน", href: "route-detail.html?id=heart-community", tone: "route-heart" }
  ],
  tripInspiration: [
    { name: "ธรรมชาติ", detail: "น้ำใส ภูเขา และอากาศดี", href: "places.html?category=nature", tone: "nature", icon: "leaf" },
    { name: "ชุมชน", detail: "เรื่องเล่าจากคนในพื้นที่", href: "places.html?category=community", tone: "community", icon: "community" },
    { name: "อาหาร", detail: "รสชาติใต้แบบบ้านตาขุน", href: "products.html?category=food", tone: "food", icon: "food" },
    { name: "คาเฟ่", detail: "จิบกาแฟท่ามกลางวิว", href: "places.html?category=cafe", tone: "cafe", icon: "cup" },
    { name: "ครอบครัว", detail: "กิจกรรมสนุกสำหรับทุกวัย", href: "routes.html?type=family", tone: "family", icon: "family" }
  ]
});

const SVG_PATHS = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M19 4C11 4 5 8 5 15c0 2 1 4 3 5 0-6 4-10 9-12-4 3-7 7-8 12 7 0 11-5 10-16Z"/>',
  community: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 20c0-4 2-7 6-7s6 3 6 7m0-5c3 0 5 2 5 5"/>',
  food: '<path d="M7 3v7m-3-7v5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V3M7 10v11m10-18c-3 3-3 8 0 10v8"/>',
  cup: '<path d="M4 7h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm13 2h2a3 3 0 0 1 0 6h-2M7 3c0 1 1 1 1 2m3-2c0 1 1 1 1 2"/>',
  family: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 20c0-5 2-8 6-8s6 3 6 8m0-6c4 0 6 2 6 6"/>'
};

function createSvg(pathName, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  svg.innerHTML = SVG_PATHS[pathName] || SVG_PATHS.arrow;
  return svg;
}

function makeText(tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function renderFeaturedPlaces(items) {
  const mount = document.querySelector("#featured-places");
  if (!mount || !Array.isArray(items) || items.length === 0) return;
  mount.replaceChildren(...items.map((item) => {
    const card = document.createElement("article"); card.className = "place-card";
    const media = document.createElement("div"); media.className = `place-card__media place-card__media--${item.tone}`; media.setAttribute("role", "img"); media.setAttribute("aria-label", `ภาพตัวอย่าง ${item.name}`);
    media.append(makeText("span", item.label, "place-card__badge"));
    const content = document.createElement("div"); content.className = "place-card__content";
    const category = makeText("p", item.category, "place-card__category"); category.prepend(createSvg("pin"));
    const title = makeText("h3", item.name); const description = makeText("p", item.description);
    const link = document.createElement("a"); link.className = "text-link"; link.href = item.href; link.textContent = "ดูรายละเอียด"; link.setAttribute("aria-label", `ดูรายละเอียด ${item.name}`); link.append(createSvg("arrow"));
    content.append(category, title, description, link); card.append(media, content); return card;
  }));
}

function renderRecommendedRoutes(items) {
  const mount = document.querySelector("#recommended-routes");
  if (!mount || !Array.isArray(items) || items.length === 0) return;
  mount.replaceChildren(...items.map((item) => {
    const card = document.createElement("article"); card.className = "route-card";
    const media = document.createElement("div"); media.className = `route-card__media route-card__media--${item.tone}`; media.setAttribute("role", "img"); media.setAttribute("aria-label", `ภาพตัวอย่างเส้นทาง ${item.title}`);
    media.append(makeText("span", item.type, "route-card__type"));
    const content = document.createElement("div"); content.className = "route-card__content";
    content.append(makeText("h3", item.title), makeText("p", item.subtitle));
    const meta = document.createElement("div"); meta.className = "route-card__meta";
    const stops = makeText("span", `${item.stops} จุด`); stops.prepend(createSvg("pin"));
    const duration = makeText("span", item.duration); duration.prepend(createSvg("clock")); meta.append(stops, duration);
    const link = document.createElement("a"); link.className = "button button--outline"; link.href = item.href; link.textContent = "ดูเส้นทาง"; link.setAttribute("aria-label", `ดูเส้นทาง ${item.title}`); link.append(createSvg("arrow"));
    content.append(meta, link); card.append(media, content); return card;
  }));
}

function renderTripInspiration(items) {
  const mount = document.querySelector("#trip-inspiration");
  if (!mount || !Array.isArray(items) || items.length === 0) return;
  mount.replaceChildren(...items.map((item) => {
    const link = document.createElement("a"); link.className = `inspiration-card inspiration-card--${item.tone}`; link.href = item.href; link.setAttribute("aria-label", `เที่ยวสไตล์${item.name}: ${item.detail}`);
    const icon = document.createElement("span"); icon.className = "inspiration-card__icon"; icon.append(createSvg(item.icon));
    const text = document.createElement("span"); text.append(makeText("strong", item.name), makeText("small", item.detail));
    link.append(icon, text, createSvg("arrow", "inspiration-card__arrow")); return link;
  }));
}

const menuToggle = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector("#mobile-menu");
const menuClose = document.querySelector("[data-menu-close]");
const menuBackdrop = document.querySelector("[data-menu-backdrop]");

function openMobileMenu() {
  if (!menuToggle || !mobileMenu || !menuBackdrop) return;
  mobileMenu.hidden = false; menuBackdrop.hidden = false;
  requestAnimationFrame(() => document.body.classList.add("menu-is-open"));
  menuToggle.setAttribute("aria-expanded", "true"); mobileMenu.setAttribute("aria-hidden", "false");
  menuToggle.setAttribute("aria-label", "ปิดเมนูเพิ่มเติม"); menuClose?.focus();
}

function closeMobileMenu({ restoreFocus = true } = {}) {
  if (!menuToggle || !mobileMenu || !menuBackdrop) return;
  document.body.classList.remove("menu-is-open"); menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "เปิดเมนูเพิ่มเติม"); mobileMenu.setAttribute("aria-hidden", "true");
  window.setTimeout(() => { mobileMenu.hidden = true; menuBackdrop.hidden = true; }, 220);
  if (restoreFocus) menuToggle.focus();
}

menuToggle?.addEventListener("click", () => menuToggle.getAttribute("aria-expanded") === "true" ? closeMobileMenu() : openMobileMenu());
menuClose?.addEventListener("click", () => closeMobileMenu());
menuBackdrop?.addEventListener("click", () => closeMobileMenu());
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && menuToggle?.getAttribute("aria-expanded") === "true") closeMobileMenu(); });
mobileMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMobileMenu({ restoreFocus: false })));

renderFeaturedPlaces(HOME_DATA.featuredPlaces);
renderRecommendedRoutes(HOME_DATA.recommendedRoutes);
renderTripInspiration(HOME_DATA.tripInspiration);
