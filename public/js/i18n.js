"use strict";

(function createTakhunI18n(global) {
  const SUPPORTED_LANGS = Object.freeze(["th", "en"]);
  const DEFAULT_LANG = "th";
  const LANG_STORAGE_KEY = "TAKHUN_LANG";
  const LANGUAGE_CHANGE_EVENT = "takhun:languagechange";
  const SAFE_ATTRIBUTES = new Set(["aria-label", "aria-description", "title", "placeholder", "content", "alt"]);

  const I18N_MESSAGES = Object.freeze({
    th: {
      nav: { home: "หน้าแรก", map: "แผนที่", plan: "วางแผน", saved: "บันทึกไว้", routes: "เส้นทาง", places: "สถานที่", products: "สินค้าและชุมชน", events: "กิจกรรม", gallery: "แกลเลอรี", about: "เกี่ยวกับเรา", more: "เพิ่มเติม" },
      nav_detail: { routes: "ทริปพร้อมออกเดินทาง", places: "ธรรมชาติและชุมชน", products: "ของดีจากคนในพื้นที่", events: "เทศกาลและเรื่องน่าสนใจ", gallery: "ภาพความทรงจำบ้านตาขุน", about: "รู้จัก Takhun Trip" },
      shell: { brand_home: "Takhun Trip หน้าแรก", location: "บ้านตาขุน · สุราษฎร์ธานี", primary_menu: "เมนูหลัก", mobile_primary_menu: "เมนูหลักบนมือถือ", secondary_menu: "เมนูรอง", open_menu: "เปิดเมนูเพิ่มเติม", close_menu: "ปิดเมนูเพิ่มเติม", more_menu: "เมนูเพิ่มเติม", close: "ปิดเมนู", explore: "ออกสำรวจบ้านตาขุน", language_group: "เลือกภาษา", thai: "ภาษาไทย", english: "English", skip: "ข้ามไปยังเนื้อหาหลัก", fallback_home: "Takhun Trip — หน้าแรก" },
      actions: { create_trip: "สร้างทริปของคุณ", start_planning: "เริ่มวางแผนทริป", view_places: "ดูสถานที่ทั้งหมด", view_routes: "ดูทุกเส้นทาง", view_details: "ดูรายละเอียด", view_route: "ดูเส้นทาง", back_home: "กลับหน้าแรก", explore: "สำรวจ" },
      system: { loading: "กำลังโหลดข้อมูล…", empty: "ยังไม่มีข้อมูลในหมวดนี้", error: "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", success: "ดำเนินการเรียบร้อย", preparing_page: "หน้านี้อยู่ระหว่างการจัดเตรียม", preparing_places: "กำลังเตรียมสถานที่น่าเที่ยวให้คุณ…", preparing_routes: "กำลังจัดเส้นทางแนะนำ…", preparing_ideas: "กำลังรวบรวมไอเดียการเดินทาง…", map_unavailable: "ยังไม่มีพิกัดสำหรับเปิดแผนที่", navigation_unavailable: "ยังไม่มีลิงก์นำทาง" },
      places: { eyebrow: "สำรวจบ้านตาขุน", header_title: "ค้นหาสถานที่ในแบบของคุณ", header_description: "ค้นหาข้อมูลตัวอย่างตามอำเภอ หมวดหมู่ และกลุ่มเส้นทาง เพื่อทดลองวางแผนการเดินทาง", demo_notice: "ข้อมูลตัวอย่าง — รายละเอียดทั้งหมดเป็น Demo data ที่ยังไม่ได้รับการยืนยัน", controls_label: "ค้นหาและกรองสถานที่", search_label: "ค้นหาสถานที่", search_placeholder: "ค้นหาชื่อหรือคำอธิบายสถานที่ตัวอย่าง", clear_search: "ล้างคำค้นหา", filter_district: "อำเภอ", filter_category: "หมวดหมู่", filter_route_group: "กลุ่มเส้นทาง", loading_options: "กำลังเตรียมตัวกรอง…", all: "ทั้งหมด", results_title: "รายการสถานที่ตัวอย่าง", results_summary: "พบ {total} รายการ แสดง {shown} รายการ", loading: "กำลังโหลดข้อมูลตัวอย่าง…", empty_all: "ยังไม่มีข้อมูลตัวอย่างที่เผยแพร่", empty_filtered: "ไม่พบข้อมูลตัวอย่างที่ตรงกับตัวกรอง", error: "โหลดข้อมูลตัวอย่างไม่สำเร็จ", retry: "ลองอีกครั้ง", load_more: "แสดงเพิ่มเติม", favorite_add: "บันทึก {name}", favorite_remove: "นำ {name} ออกจากรายการบันทึก", favorite_added: "บันทึกสถานที่ตัวอย่างแล้ว", favorite_removed: "นำออกจากรายการบันทึกแล้ว", view_details: "ดูรายละเอียด", view_map: "ดูบนแผนที่", navigate: "นำทาง", image_alt: "ภาพตัวอย่างของ {name}", image_fallback: "ยังไม่มีภาพตัวอย่าง", no_script: "ไม่สามารถโหลดรายการได้ โปรดเปิดใช้งาน JavaScript เพื่อดูข้อมูลตัวอย่าง", districts: { ban_ta_khun: "อำเภอบ้านตาขุน", khiri_rat_nikhom: "อำเภอคีรีรัฐนิคม", phanom: "อำเภอพนม" }, categories: { nature: "ธรรมชาติ", community_tourism: "วิสาหกิจชุมชน", viewpoint: "จุดชมวิว", food_cafe: "ร้านอาหาร / คาเฟ่", activity: "กิจกรรม" }, route_groups: { main_point_1: "กลุ่มเส้นทางตัวอย่าง 1", main_point_2: "กลุ่มเส้นทางตัวอย่าง 2", nearby_phanom: "พื้นที่ตัวอย่างใกล้พนม" } },
      home: { eyebrow: "ประตูสู่เขาสกและทะเลสาบเชี่ยวหลาน", title_start: "เที่ยวบ้านตาขุน", title_emphasis: "ให้ธรรมชาติพาไป", intro: "ค้นพบทะเลสาบสีมรกต ภูเขารูปหัวใจ และเสน่ห์ชุมชน วางแผนทุกจุดหมายได้ง่ายในทริปเดียว", hero_choice: "จุดหมายที่คนรักธรรมชาติเลือก", hero_story: "เริ่มต้นเรื่องราวดี ๆ ที่บ้านตาขุน", scroll: "เลื่อนไปดูทางลัด", quick_eyebrow: "เริ่มต้นง่าย ๆ", quick_title: "วันนี้อยากเที่ยวแบบไหน?", quick_text: "เลือกสิ่งที่สนใจ แล้วออกแบบวันดี ๆ ในแบบของคุณ", places_title: "สถานที่ท่องเที่ยว", places_detail: "ธรรมชาติและชุมชน", routes_title: "เส้นทางแนะนำ", routes_detail: "ทริปพร้อมออกเดินทาง", map_title: "แผนที่ท่องเที่ยว", map_detail: "ดูทุกจุดในภาพเดียว", planner_title: "วางแผนทริป", planner_detail: "จัดวันเที่ยวให้ลงตัว", featured_eyebrow: "ห้ามพลาดเมื่อมาถึง", featured_title: "สถานที่เด่นบ้านตาขุน", featured_text: "ธรรมชาติยิ่งใหญ่และเรื่องราวท้องถิ่นที่รอให้คุณสัมผัส", routes_eyebrow: "ทริปที่คิดมาให้แล้ว", routes_section_title: "เส้นทางแนะนำ", routes_text: "จัดเวลาให้คุ้ม เก็บครบทุกบรรยากาศที่อยากเจอ", inspiration_eyebrow: "เลือกตามสไตล์คุณ", inspiration_title: "แรงบันดาลใจสำหรับทริปถัดไป", inspiration_text: "ไม่ว่าจะชอบความสงบ ความอร่อย หรือเวลาคุณภาพกับครอบครัว บ้านตาขุนมีคำตอบ", footer_tagline: "เที่ยวตาขุน ครบในทริปเดียว", footer_text: "เพื่อนคู่คิดสำหรับทุกการเดินทาง เชื่อมคุณกับธรรมชาติ ชุมชน และเรื่องราวของบ้านตาขุน", footer_explore: "สำรวจ", footer_info: "ข้อมูล", footer_contact: "ติดต่อเรา", footer_about: "เกี่ยวกับโครงการ", footer_favorites: "รายการโปรด", footer_made: "สร้างด้วยใจ เพื่อการท่องเที่ยวบ้านตาขุน" },
      pages: {
        home: { title: "Takhun Trip | เที่ยวบ้านตาขุน ครบในทริปเดียว", description: "ออกเดินทางสู่บ้านตาขุน ค้นพบทะเลสาบเชี่ยวหลาน ภูเขารูปหัวใจ ชุมชน และเส้นทางท่องเที่ยวที่วางแผนได้ในที่เดียว" },
        map: { title: "แผนที่ท่องเที่ยวบ้านตาขุน | Takhun Trip", heading: "แผนที่ท่องเที่ยว" }, routes: { title: "เส้นทางท่องเที่ยว | Takhun Trip", heading: "เส้นทางท่องเที่ยว" }, route_detail: { title: "รายละเอียดเส้นทาง | Takhun Trip", heading: "รายละเอียดเส้นทาง" }, places: { title: "สถานที่ท่องเที่ยว | Takhun Trip", heading: "สถานที่ท่องเที่ยว" }, place_detail: { title: "รายละเอียดสถานที่ | Takhun Trip", heading: "รายละเอียดสถานที่" }, planner: { title: "วางแผนทริป | Takhun Trip", heading: "วางแผนทริป" }, products: { title: "สินค้าและชุมชน | Takhun Trip", heading: "สินค้าและชุมชน" }, product_detail: { title: "รายละเอียดสินค้า | Takhun Trip", heading: "รายละเอียดสินค้า" }, events: { title: "กิจกรรมและเทศกาล | Takhun Trip", heading: "กิจกรรมและเทศกาล" }, event_detail: { title: "รายละเอียดกิจกรรม | Takhun Trip", heading: "รายละเอียดกิจกรรม" }, gallery: { title: "แกลเลอรี | Takhun Trip", heading: "แกลเลอรี" }, favorites: { title: "รายการโปรด | Takhun Trip", heading: "รายการโปรด" }, about: { title: "เกี่ยวกับ Takhun Trip", heading: "เกี่ยวกับ Takhun Trip" }, not_found: { title: "ไม่พบหน้า | Takhun Trip", description: "ไม่พบหน้าที่ต้องการใน Takhun Trip", heading: "404 — ไม่พบหน้า", message: "หน้าที่คุณกำลังค้นหาอาจถูกย้ายหรือไม่มีอยู่" }, common: { description: "Takhun Trip เว็บแอปแนะนำการท่องเที่ยวบ้านตาขุน" }
      },
      test: { th_only: "ข้อความสำรอง" }
    },
    en: {
      nav: { home: "Home", map: "Map", plan: "Plan", saved: "Saved", routes: "Routes", places: "Places", products: "Local Products", events: "Events", gallery: "Gallery", about: "About", more: "More" },
      nav_detail: { routes: "Ready-made itineraries", places: "Nature and communities", products: "Local community goods", events: "Festivals and highlights", gallery: "Memories from Ban Ta Khun", about: "Discover Takhun Trip" },
      shell: { brand_home: "Takhun Trip Home", location: "Ban Ta Khun · Surat Thani", primary_menu: "Main navigation", mobile_primary_menu: "Mobile main navigation", secondary_menu: "Secondary navigation", open_menu: "Open more menu", close_menu: "Close more menu", more_menu: "More menu", close: "Close menu", explore: "Explore Ban Ta Khun", language_group: "Choose language", thai: "ภาษาไทย", english: "English", skip: "Skip to main content", fallback_home: "Takhun Trip — Home" },
      actions: { create_trip: "Create Your Trip", start_planning: "Start Planning", view_places: "View All Places", view_routes: "View All Routes", view_details: "View Details", view_route: "View Route", back_home: "Back to Home", explore: "Explore" },
      system: { loading: "Loading…", empty: "No information is available yet.", error: "Unable to load information. Please try again.", success: "Completed successfully.", preparing_page: "This page is being prepared.", preparing_places: "Preparing inspiring places for you…", preparing_routes: "Preparing recommended routes…", preparing_ideas: "Gathering travel ideas…", map_unavailable: "Map coordinates are unavailable.", navigation_unavailable: "Navigation link is unavailable." },
      places: { eyebrow: "Explore Ban Ta Khun", header_title: "Find Places Your Way", header_description: "Explore demo entries by district, category, and route group to try the trip-planning experience.", demo_notice: "Demo data — all details are samples and have not been verified.", controls_label: "Search and filter places", search_label: "Search places", search_placeholder: "Search sample names or descriptions", clear_search: "Clear search", filter_district: "District", filter_category: "Category", filter_route_group: "Route group", loading_options: "Preparing filters…", all: "All", results_title: "Sample Places", results_summary: "{total} results, showing {shown}", loading: "Loading demo data…", empty_all: "No published demo data is available.", empty_filtered: "No demo data matches these filters.", error: "Unable to load demo data.", retry: "Try Again", load_more: "Load More", favorite_add: "Save {name}", favorite_remove: "Remove {name} from saved places", favorite_added: "Sample place saved.", favorite_removed: "Sample place removed from saved places.", view_details: "View Details", view_map: "View on Map", navigate: "Navigate", image_alt: "Sample image of {name}", image_fallback: "No sample image yet", no_script: "The list cannot load. Enable JavaScript to view the demo data.", districts: { ban_ta_khun: "Ban Ta Khun District", khiri_rat_nikhom: "Khiri Rat Nikhom District", phanom: "Phanom District" }, categories: { nature: "Nature", community_tourism: "Community Tourism", viewpoint: "Viewpoint", food_cafe: "Food / Café", activity: "Activities" }, route_groups: { main_point_1: "Sample Route Group 1", main_point_2: "Sample Route Group 2", nearby_phanom: "Sample Area near Phanom" } },
      home: { eyebrow: "Gateway to Khao Sok and Cheow Lan Lake", title_start: "Explore Ban Ta Khun", title_emphasis: "Let Nature Lead the Way", intro: "Discover emerald waters, the heart-shaped mountain, and welcoming communities—all easy to plan in one trip.", hero_choice: "A favorite destination for nature lovers", hero_story: "Begin a memorable story in Ban Ta Khun", scroll: "Scroll to quick links", quick_eyebrow: "An easy start", quick_title: "How would you like to travel today?", quick_text: "Choose what inspires you and shape a memorable day your way.", places_title: "Places", places_detail: "Nature and communities", routes_title: "Recommended Routes", routes_detail: "Ready-made itineraries", map_title: "Travel Map", map_detail: "See every stop at a glance", planner_title: "Trip Planner", planner_detail: "Make every day fit", featured_eyebrow: "Ban Ta Khun highlights", featured_title: "Featured Places", featured_text: "Experience sweeping nature and local stories waiting to be discovered.", routes_eyebrow: "Trips planned for you", routes_section_title: "Recommended Routes", routes_text: "Make the most of your time and enjoy every atmosphere along the way.", inspiration_eyebrow: "Travel your way", inspiration_title: "Inspiration for Your Next Trip", inspiration_text: "Whether you seek calm, great food, or family time, Ban Ta Khun has something for you.", footer_tagline: "Ban Ta Khun in One Trip", footer_text: "Your travel companion connecting you with the nature, communities, and stories of Ban Ta Khun.", footer_explore: "Explore", footer_info: "Information", footer_contact: "Contact Us", footer_about: "About the Project", footer_favorites: "Saved Places", footer_made: "Made with care for travel in Ban Ta Khun" },
      pages: {
        home: { title: "Takhun Trip | Explore Ban Ta Khun in One Trip", description: "Discover Ban Ta Khun travel experiences, routes, nature, and local communities in one place." },
        map: { title: "Ban Ta Khun Travel Map | Takhun Trip", heading: "Travel Map" }, routes: { title: "Travel Routes | Takhun Trip", heading: "Travel Routes" }, route_detail: { title: "Route Details | Takhun Trip", heading: "Route Details" }, places: { title: "Places to Visit | Takhun Trip", heading: "Places to Visit" }, place_detail: { title: "Place Details | Takhun Trip", heading: "Place Details" }, planner: { title: "Trip Planner | Takhun Trip", heading: "Trip Planner" }, products: { title: "Local Products and Communities | Takhun Trip", heading: "Local Products and Communities" }, product_detail: { title: "Product Details | Takhun Trip", heading: "Product Details" }, events: { title: "Events and Festivals | Takhun Trip", heading: "Events and Festivals" }, event_detail: { title: "Event Details | Takhun Trip", heading: "Event Details" }, gallery: { title: "Gallery | Takhun Trip", heading: "Gallery" }, favorites: { title: "Saved Places | Takhun Trip", heading: "Saved Places" }, about: { title: "About Takhun Trip", heading: "About Takhun Trip" }, not_found: { title: "Page Not Found | Takhun Trip", description: "The requested Takhun Trip page could not be found.", heading: "404 — Page Not Found", message: "The page you are looking for may have moved or no longer exists." }, common: { description: "Takhun Trip is your guide to travel experiences in Ban Ta Khun." }
      }
    }
  });

  let currentLang = DEFAULT_LANG;
  let initialized = false;

  function normalizeLang(lang) { return SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG; }
  function readSavedLang() {
    try { return normalizeLang(global.localStorage?.getItem(LANG_STORAGE_KEY)); }
    catch (_error) { return currentLang; }
  }
  currentLang = readSavedLang();

  function getNestedValue(object, path) {
    if (!object || typeof path !== "string" || !path) return undefined;
    return path.split(".").reduce((value, part) => value !== null && value !== undefined ? value[part] : undefined, object);
  }

  function getCurrentLang() { return currentLang; }

  function t(key, lang = currentLang) {
    if (typeof key !== "string" || !key) return "";
    const normalizedLang = typeof lang === "string" ? normalizeLang(lang) : currentLang;
    const localized = getNestedValue(I18N_MESSAGES[normalizedLang], key);
    const fallback = getNestedValue(I18N_MESSAGES.th, key);
    const value = localized !== undefined && localized !== null && localized !== "" ? localized : fallback;
    return value === undefined || value === null || value === "" ? key : String(value);
  }

  function updateLanguageControls(root = global.document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("[data-lang]").forEach((control) => {
      const isActive = control.getAttribute("data-lang") === currentLang;
      control.classList?.toggle("is-active", isActive);
      control.setAttribute("aria-pressed", String(isActive));
    });
  }

  function applyTranslations(root = global.document) {
    if (!root?.querySelectorAll) return currentLang;
    if (global.document?.documentElement) global.document.documentElement.lang = currentLang;
    root.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (key) node.textContent = t(key);
    });
    root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
      const contract = node.getAttribute("data-i18n-attr");
      if (typeof contract !== "string") return;
      const separator = contract.indexOf(":");
      if (separator < 1) return;
      const attribute = contract.slice(0, separator).trim().toLowerCase();
      const key = contract.slice(separator + 1).trim();
      if (!SAFE_ATTRIBUTES.has(attribute) || !key) return;
      node.setAttribute(attribute, t(key));
    });
    const title = global.document?.querySelector?.("title[data-i18n]");
    if (title) global.document.title = t(title.getAttribute("data-i18n"));
    updateLanguageControls(root);
    return currentLang;
  }

  function setCurrentLang(lang) {
    const nextLang = normalizeLang(lang);
    const previousLang = currentLang;
    currentLang = nextLang;
    try { global.localStorage?.setItem(LANG_STORAGE_KEY, nextLang); } catch (_error) { /* Memory state remains authoritative. */ }
    if (global.document?.documentElement) global.document.documentElement.lang = nextLang;
    if (nextLang !== previousLang && global.document?.dispatchEvent && typeof global.CustomEvent === "function") {
      global.document.dispatchEvent(new global.CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { lang: nextLang, previousLang } }));
    }
    return nextLang;
  }

  function pickLangValue(item, field, lang = currentLang) {
    if (!item || typeof field !== "string" || !field) return "";
    const normalizedLang = normalizeLang(lang);
    return item[`${field}_${normalizedLang}`] || item[`${field}_th`] || "";
  }

  function handleLanguageClick(event) {
    const control = event.target?.closest?.("[data-lang]") || (event.target?.matches?.("[data-lang]") ? event.target : null);
    if (!control) return;
    const previousLang = currentLang;
    setCurrentLang(control.getAttribute("data-lang"));
    if (currentLang !== previousLang) applyTranslations(global.document);
  }

  function initI18n() {
    if (initialized) return currentLang;
    initialized = true;
    if (global.document?.addEventListener) global.document.addEventListener("click", handleLanguageClick);
    applyTranslations(global.document);
    return currentLang;
  }

  global.TakhunI18n = Object.freeze({ t, getCurrentLang, setCurrentLang, applyTranslations, pickLangValue, initI18n });
  initI18n();
})(window);
