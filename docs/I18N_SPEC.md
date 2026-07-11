# I18N_SPEC.md — Takhun Trip

เอกสารนี้กำหนดมาตรฐานระบบภาษาไทย/อังกฤษ หรือ Internationalization (i18n) ของเว็บแอป **Takhun Trip** เพื่อให้ Codex สร้างระบบหลายภาษาได้เป็นระบบ ใช้งานจริง และไม่ทำให้ข้อความกระจัดกระจายหลายไฟล์

เว็บแอปนี้ต้องรองรับอย่างน้อย 2 ภาษา:

```text
th = ภาษาไทย
en = ภาษาอังกฤษ
```

ค่าเริ่มต้นของระบบคือ **ภาษาไทย**

---

## 1. I18N Objective

ระบบ i18n ของ **Takhun Trip** มีเป้าหมายเพื่อ:

1. รองรับภาษาไทยและภาษาอังกฤษ
2. ให้ผู้ใช้เปลี่ยนภาษาได้
3. จดจำภาษาที่ผู้ใช้เลือกไว้ใน Local Storage
4. แสดงข้อมูลสถานที่ เส้นทาง สินค้า กิจกรรม และข้อความ UI ตามภาษาที่เลือก
5. ถ้าข้อมูลภาษาอังกฤษไม่มี ให้ fallback เป็นภาษาไทย
6. ลดการเขียนข้อความซ้ำหลายไฟล์
7. ทำให้เพิ่มภาษาอื่นในอนาคตได้ง่ายขึ้น

---

## 2. Language Scope

ระบบต้องรองรับภาษาในส่วนต่อไปนี้:

### 2.1 UI Labels

เช่น:

- เมนู
- ปุ่ม
- หัวข้อ
- ข้อความระบบ
- Loading / Empty / Error / Success
- Form labels
- Badge
- Filter
- Admin UI บางส่วน

### 2.2 Data Content

ข้อมูลจาก Google Sheets เช่น:

- ชื่อสถานที่
- รายละเอียดสถานที่
- ชื่อเส้นทาง
- รายละเอียดเส้นทาง
- ชื่อสินค้า
- รายละเอียดสินค้า
- ชื่อกิจกรรม
- รายละเอียดกิจกรรม
- แกลเลอรี
- หมวดหมู่

### 2.3 SEO / Metadata

เช่น:

- title
- meta description
- share title
- share description

---

## 3. Language Rules

### 3.1 Default Language

ค่าเริ่มต้น:

```javascript
DEFAULT_LANG = "th";
```

### 3.2 Supported Languages

```javascript
const SUPPORTED_LANGS = ["th", "en"];
```

### 3.3 Local Storage Key

ใช้ key:

```text
TAKHUN_LANG
```

ตัวอย่างค่า:

```json
"th"
```

หรือ

```json
"en"
```

### 3.4 Language Fallback Rule

ถ้าผู้ใช้เลือกภาษาอังกฤษ แต่ข้อมูลภาษาอังกฤษว่าง ให้ใช้ภาษาไทยแทน

ตัวอย่าง:

```javascript
function pickLangValue(item, key, lang = "th") {
  const langKey = `${key}_${lang}`;
  const fallbackKey = `${key}_th`;

  return item?.[langKey] || item?.[fallbackKey] || "";
}
```

ตัวอย่าง:

```javascript
pickLangValue(place, "name", "en");
```

จะเลือกตามลำดับ:

```text
name_en → name_th → ""
```

---

## 4. File Structure

ระบบ i18n ควรอยู่ในไฟล์:

```text
public/js/i18n.js
```

ถ้าในอนาคตข้อความเยอะมาก สามารถแยกเป็น:

```text
public/js/i18n.js
public/js/i18n-th.js
public/js/i18n-en.js
```

แต่ใน MVP ให้เริ่มจากไฟล์เดียวก่อนเพื่อให้ง่าย

---

## 5. Recommended i18n Object Structure

ใช้ object กลางใน `i18n.js`

```javascript
const I18N_MESSAGES = {
  th: {
    nav: {
      home: "หน้าแรก",
      map: "แผนที่",
      routes: "เส้นทาง",
      places: "สถานที่",
      planner: "วางแผน",
      products: "สินค้าและชุมชน",
      events: "กิจกรรม",
      gallery: "แกลเลอรี",
      favorites: "บันทึกไว้",
      about: "เกี่ยวกับเรา",
      more: "เพิ่มเติม"
    }
  },
  en: {
    nav: {
      home: "Home",
      map: "Map",
      routes: "Routes",
      places: "Places",
      planner: "Plan",
      products: "Local Products",
      events: "Events",
      gallery: "Gallery",
      favorites: "Saved",
      about: "About",
      more: "More"
    }
  }
};
```

---

## 6. Core i18n Functions

ใน `i18n.js` ควรมีฟังก์ชันหลักดังนี้

### 6.1 `getCurrentLang()`

```javascript
function getCurrentLang() {
  const saved = localStorage.getItem("TAKHUN_LANG");
  if (SUPPORTED_LANGS.includes(saved)) {
    return saved;
  }
  return APP_CONFIG.DEFAULT_LANG || "th";
}
```

### 6.2 `setCurrentLang(lang)`

```javascript
function setCurrentLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) {
    lang = "th";
  }
  localStorage.setItem("TAKHUN_LANG", lang);
  document.documentElement.lang = lang;
}
```

### 6.3 `t(key, params = {})`

ใช้แปลข้อความจาก key

```javascript
function t(key, params = {}) {
  const lang = getCurrentLang();
  const value = getNestedValue(I18N_MESSAGES[lang], key)
    || getNestedValue(I18N_MESSAGES.th, key)
    || key;

  return interpolate(value, params);
}
```

ตัวอย่าง:

```javascript
t("nav.home");
```

### 6.4 `pickLangValue(item, key, lang)`

ใช้เลือก field จากข้อมูล เช่น `name_th`, `name_en`

```javascript
function pickLangValue(item, key, lang = getCurrentLang()) {
  const langKey = `${key}_${lang}`;
  const fallbackKey = `${key}_th`;

  return item?.[langKey] || item?.[fallbackKey] || "";
}
```

### 6.5 `applyI18n(root = document)`

ใช้แปลข้อความใน DOM จาก attribute

```javascript
function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });

  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    el.setAttribute("aria-label", t(key));
  });
}
```

---

## 7. HTML Attribute Standard

ใช้ attribute ต่อไปนี้ใน HTML

### 7.1 Text Content

```html
<span data-i18n="nav.home">หน้าแรก</span>
```

### 7.2 Placeholder

```html
<input data-i18n-placeholder="search.placeholder" placeholder="ค้นหาสถานที่">
```

### 7.3 Aria Label

```html
<button data-i18n-aria-label="actions.open_menu" aria-label="เปิดเมนู">
  ...
</button>
```

### 7.4 Title Attribute

```html
<a data-i18n-title="actions.open_map" title="เปิดแผนที่">
  ...
</a>
```

ถ้าใช้ title attribute ให้ `applyI18n()` รองรับด้วย

---

## 8. UI Message Keys

### 8.1 Navigation

```javascript
nav: {
  home: "หน้าแรก",
  map: "แผนที่",
  routes: "เส้นทาง",
  places: "สถานที่",
  planner: "วางแผน",
  products: "สินค้าและชุมชน",
  events: "กิจกรรม",
  gallery: "แกลเลอรี",
  favorites: "บันทึกไว้",
  about: "เกี่ยวกับเรา",
  more: "เพิ่มเติม",
  admin: "ผู้ดูแล"
}
```

English:

```javascript
nav: {
  home: "Home",
  map: "Map",
  routes: "Routes",
  places: "Places",
  planner: "Plan",
  products: "Local Products",
  events: "Events",
  gallery: "Gallery",
  favorites: "Saved",
  about: "About",
  more: "More",
  admin: "Admin"
}
```

---

## 9. Button Keys

### 9.1 Thai

```javascript
actions: {
  explore_map: "สำรวจแผนที่",
  plan_trip: "วางแผนทริป",
  view_routes: "ดูเส้นทาง",
  view_places: "ดูสถานที่",
  view_details: "ดูรายละเอียด",
  view_all: "ดูทั้งหมด",
  navigate: "นำทาง",
  call: "โทรเลย",
  share: "แชร์",
  save: "บันทึกไว้",
  saved: "บันทึกแล้ว",
  remove_saved: "ลบออก",
  add_to_trip: "เพิ่มในทริป",
  open_map: "เปิดแผนที่",
  try_again: "ลองใหม่",
  cancel: "ยกเลิก",
  confirm: "ยืนยัน",
  save_changes: "บันทึกการแก้ไข",
  login: "เข้าสู่ระบบ",
  logout: "ออกจากระบบ",
  publish: "เผยแพร่",
  hide: "ซ่อน",
  delete: "ลบ",
  edit: "แก้ไข"
}
```

### 9.2 English

```javascript
actions: {
  explore_map: "Explore Map",
  plan_trip: "Plan Your Trip",
  view_routes: "View Routes",
  view_places: "View Places",
  view_details: "View Details",
  view_all: "View All",
  navigate: "Navigate",
  call: "Call Now",
  share: "Share",
  save: "Save",
  saved: "Saved",
  remove_saved: "Remove",
  add_to_trip: "Add to Trip",
  open_map: "Open Map",
  try_again: "Try Again",
  cancel: "Cancel",
  confirm: "Confirm",
  save_changes: "Save Changes",
  login: "Login",
  logout: "Logout",
  publish: "Publish",
  hide: "Hide",
  delete: "Delete",
  edit: "Edit"
}
```

---

## 10. System Message Keys

### 10.1 Thai

```javascript
system: {
  loading: "กำลังโหลดข้อมูล...",
  loading_map: "กำลังโหลดแผนที่ท่องเที่ยว...",
  saving: "กำลังบันทึกข้อมูล...",
  no_data: "ยังไม่มีข้อมูลในหมวดนี้",
  no_results: "ไม่พบข้อมูลที่ตรงกับการค้นหา",
  no_favorites: "ยังไม่มีสถานที่โปรด",
  no_events: "ยังไม่มีกิจกรรมในช่วงนี้",
  load_failed: "โหลดข้อมูลไม่สำเร็จ",
  try_again: "กรุณาลองใหม่อีกครั้ง",
  save_success: "บันทึกข้อมูลเรียบร้อย",
  save_failed: "บันทึกข้อมูลไม่สำเร็จ",
  added_favorite: "เพิ่มลงรายการโปรดแล้ว",
  removed_favorite: "นำออกจากรายการโปรดแล้ว",
  link_copied: "คัดลอกลิงก์แล้ว",
  review_submitted: "ส่งรีวิวแล้ว รอตรวจสอบก่อนเผยแพร่",
  session_expired: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่"
}
```

### 10.2 English

```javascript
system: {
  loading: "Loading...",
  loading_map: "Loading travel map...",
  saving: "Saving...",
  no_data: "No data available.",
  no_results: "No results found.",
  no_favorites: "No saved places yet.",
  no_events: "No events available at this time.",
  load_failed: "Failed to load data.",
  try_again: "Please try again.",
  save_success: "Saved successfully.",
  save_failed: "Failed to save data.",
  added_favorite: "Added to favorites.",
  removed_favorite: "Removed from favorites.",
  link_copied: "Link copied.",
  review_submitted: "Thank you. Your review will be reviewed before publishing.",
  session_expired: "Session expired. Please log in again."
}
```

---

## 11. Page Title Keys

### 11.1 Thai

```javascript
pages: {
  home_title: "เที่ยวตาขุน ครบในทริปเดียว",
  home_description: "รวมแผนที่ เส้นทางท่องเที่ยว จุดถ่ายภาพ กิจกรรม และของดีชุมชนบ้านตาขุนไว้ในที่เดียว",
  map_title: "แผนที่ท่องเที่ยวบ้านตาขุน",
  routes_title: "เส้นทางท่องเที่ยว",
  places_title: "สถานที่ท่องเที่ยว",
  planner_title: "วางแผนทริป",
  products_title: "ของดีชุมชนบ้านตาขุน",
  events_title: "กิจกรรมและเทศกาล",
  gallery_title: "ภาพเล่าเรื่องบ้านตาขุน",
  favorites_title: "สถานที่ที่บันทึกไว้",
  about_title: "เกี่ยวกับ Takhun Trip"
}
```

### 11.2 English

```javascript
pages: {
  home_title: "Discover Ta Khun in One Trip",
  home_description: "Explore Ban Ta Khun with maps, routes, photo spots, events, and local products in one place.",
  map_title: "Ban Ta Khun Travel Map",
  routes_title: "Travel Routes",
  places_title: "Places to Visit",
  planner_title: "Trip Planner",
  products_title: "Local Products from Ban Ta Khun",
  events_title: "Events & Festivals",
  gallery_title: "Ban Ta Khun Gallery",
  favorites_title: "Saved Places",
  about_title: "About Takhun Trip"
}
```

---

## 12. Category Labels

### 12.1 Place Categories

```javascript
categories: {
  all: "ทั้งหมด",
  main_point: "จุดหลัก",
  community_tourism: "วิสาหกิจชุมชน",
  nature: "ธรรมชาติ",
  viewpoint: "จุดชมวิว",
  lake: "ทะเลสาบ / เขื่อน",
  activity: "กิจกรรม",
  food_cafe: "อาหาร / คาเฟ่",
  accommodation: "ที่พัก / แพ",
  temple_culture: "วัด / วัฒนธรรม",
  product_shop: "สินค้า / ของฝาก",
  waterfall: "น้ำตก",
  cave: "ถ้ำ",
  service: "จุดบริการ"
}
```

English:

```javascript
categories: {
  all: "All",
  main_point: "Main Point",
  community_tourism: "Community Tourism",
  nature: "Nature",
  viewpoint: "Viewpoint",
  lake: "Lake / Dam",
  activity: "Activity",
  food_cafe: "Food / Café",
  accommodation: "Stay / Floating Raft",
  temple_culture: "Temple / Culture",
  product_shop: "Local Products",
  waterfall: "Waterfall",
  cave: "Cave",
  service: "Service Point"
}
```

---

## 13. District Labels

### 13.1 Thai

```javascript
districts: {
  ban_ta_khun: "บ้านตาขุน",
  khiri_rat_nikhom: "คีรีรัฐนิคม",
  phanom: "พนม"
}
```

### 13.2 English

```javascript
districts: {
  ban_ta_khun: "Ban Ta Khun",
  khiri_rat_nikhom: "Khiri Rat Nikhom",
  phanom: "Phanom"
}
```

---

## 14. Status Labels

### 14.1 Content Status

Thai:

```javascript
status: {
  draft: "ร่าง",
  published: "เผยแพร่",
  hidden: "ซ่อน",
  archived: "เก็บถาวร",
  deleted: "ลบแล้ว"
}
```

English:

```javascript
status: {
  draft: "Draft",
  published: "Published",
  hidden: "Hidden",
  archived: "Archived",
  deleted: "Deleted"
}
```

### 14.2 Review Status

Thai:

```javascript
review_status: {
  pending: "รอตรวจสอบ",
  approved: "เผยแพร่แล้ว",
  hidden: "ซ่อน",
  deleted: "ลบแล้ว"
}
```

English:

```javascript
review_status: {
  pending: "Pending",
  approved: "Approved",
  hidden: "Hidden",
  deleted: "Deleted"
}
```

### 14.3 Coordinate Status

Thai:

```javascript
coordinate_status: {
  verified: "ยืนยันพิกัดแล้ว",
  pending_verify: "รอยืนยัน",
  needs_survey: "ต้องสำรวจ",
  no_coordinate: "ยังไม่มีพิกัด",
  approximate: "พิกัดประมาณ"
}
```

English:

```javascript
coordinate_status: {
  verified: "Verified",
  pending_verify: "Pending verification",
  needs_survey: "Needs survey",
  no_coordinate: "No coordinates",
  approximate: "Approximate"
}
```

---

## 15. Form Labels

### 15.1 Review Form

Thai:

```javascript
review_form: {
  title: "เขียนรีวิว",
  name: "ชื่อของคุณ",
  anonymous: "ไม่แสดงชื่อ",
  rating: "ให้คะแนน",
  comment: "ความคิดเห็น",
  submit: "ส่งรีวิว"
}
```

English:

```javascript
review_form: {
  title: "Write a Review",
  name: "Your Name",
  anonymous: "Post Anonymously",
  rating: "Rating",
  comment: "Comment",
  submit: "Submit Review"
}
```

### 15.2 Admin Login Form

Thai:

```javascript
admin_login: {
  title: "เข้าสู่ระบบผู้ดูแล",
  subtitle: "จัดการข้อมูล Takhun Trip",
  username: "ชื่อผู้ใช้",
  password: "รหัสผ่าน",
  submit: "เข้าสู่ระบบ",
  invalid: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
}
```

English:

```javascript
admin_login: {
  title: "Admin Login",
  subtitle: "Manage Takhun Trip content",
  username: "Username",
  password: "Password",
  submit: "Login",
  invalid: "Invalid username or password"
}
```

---

## 16. Data Field Naming for Multilingual Content

ทุกข้อมูลที่รองรับสองภาษาต้องใช้รูปแบบนี้:

```text
field_th
field_en
```

ตัวอย่างใน `places`:

```text
name_th
name_en
short_description_th
short_description_en
description_th
description_en
activities_th
activities_en
highlight_th
highlight_en
open_time_th
open_time_en
fee_th
fee_en
best_time_th
best_time_en
```

ตัวอย่างใน `routes`:

```text
name_th
name_en
short_description_th
short_description_en
description_th
description_en
```

ตัวอย่างใน `products`:

```text
name_th
name_en
description_th
description_en
```

ตัวอย่างใน `events`:

```text
title_th
title_en
location_th
location_en
description_th
description_en
```

ตัวอย่างใน `gallery`:

```text
title_th
title_en
caption_th
caption_en
```

---

## 17. Data Mapping Rules

### 17.1 Places

เมื่อ render place:

```javascript
const placeView = {
  name: pickLangValue(place, "name", lang),
  short_description: pickLangValue(place, "short_description", lang),
  description: pickLangValue(place, "description", lang),
  activities: pickLangValue(place, "activities", lang),
  highlight: pickLangValue(place, "highlight", lang),
  open_time: pickLangValue(place, "open_time", lang),
  fee: pickLangValue(place, "fee", lang),
  best_time: pickLangValue(place, "best_time", lang)
};
```

### 17.2 Routes

```javascript
const routeView = {
  name: pickLangValue(route, "name", lang),
  short_description: pickLangValue(route, "short_description", lang),
  description: pickLangValue(route, "description", lang)
};
```

### 17.3 Products

```javascript
const productView = {
  name: pickLangValue(product, "name", lang),
  description: pickLangValue(product, "description", lang)
};
```

### 17.4 Events

```javascript
const eventView = {
  title: pickLangValue(event, "title", lang),
  location: pickLangValue(event, "location", lang),
  description: pickLangValue(event, "description", lang)
};
```

---

## 18. Language Switcher Component

### 18.1 Display Options

แบบสั้น:

```text
TH | EN
```

หรือแบบ dropdown:

```text
TH ▾
```

### 18.2 Recommended MVP

ใช้แบบปุ่มสองภาษา:

```html
<div class="language-switcher">
  <button data-lang="th">TH</button>
  <button data-lang="en">EN</button>
</div>
```

### 18.3 Behavior

```text
ผู้ใช้กด EN
→ setCurrentLang("en")
→ applyI18n()
→ re-render ข้อมูลหน้าปัจจุบันถ้ามี data dynamic
→ บันทึก TAKHUN_LANG = "en"
```

### 18.4 CSS Classes

```text
language-switcher
language-switcher__btn
language-switcher__btn.is-active
```

### 18.5 Rules

- ปุ่มภาษาที่ active ต้องชัดเจน
- ไม่จำเป็นต้อง reload หน้า
- ถ้าหน้านั้น render จาก API ให้ re-render โดยใช้ข้อมูลเดิมถ้ามี
- ถ้าข้อมูลยังไม่โหลด ให้ใช้ภาษาที่เลือกตอนโหลดใหม่

---

## 19. SEO i18n Rules

### 19.1 Page Title

เมื่อเปลี่ยนภาษา ควร update:

```javascript
document.title = t("seo.home_title");
```

### 19.2 Meta Description

ถ้าทำได้ ให้ update:

```javascript
const meta = document.querySelector('meta[name="description"]');
if (meta) {
  meta.setAttribute("content", t("seo.home_description"));
}
```

### 19.3 SEO Keys

Thai:

```javascript
seo: {
  home_title: "Takhun Trip | เที่ยวตาขุน ครบในทริปเดียว",
  home_description: "Takhun Trip เว็บแอปแนะนำเส้นทางท่องเที่ยวบ้านตาขุน พร้อมแผนที่ จุดเที่ยว กิจกรรม สินค้าชุมชน และปุ่มนำทางสำหรับนักท่องเที่ยว"
}
```

English:

```javascript
seo: {
  home_title: "Takhun Trip | Discover Ban Ta Khun in One Trip",
  home_description: "Takhun Trip is a travel web app for Ban Ta Khun, featuring routes, maps, attractions, local products, events, and easy navigation."
}
```

---

## 20. API Language Parameter

ทุก Public API ที่คืนข้อความควรรองรับ parameter:

```text
lang=th
lang=en
```

ตัวอย่าง:

```text
GET ?action=getPlaces&lang=th
GET ?action=getPlaceDetail&place_id=BTK-001&lang=en
```

### 20.1 Backend Options

มี 2 แนวทาง:

#### Option A — Backend ส่งทั้ง `_th` และ `_en`

ข้อดี:

- Frontend fallback ได้ง่าย
- เปลี่ยนภาษาโดยไม่ reload API ใหม่
- เหมาะกับ MVP

ข้อเสีย:

- response ใหญ่ขึ้นเล็กน้อย

#### Option B — Backend ส่ง field ที่แปลแล้ว เช่น `name`, `description`

ข้อดี:

- frontend ง่าย
- response สั้น

ข้อเสีย:

- เปลี่ยนภาษาต้องโหลดใหม่
- fallback ต้องทำ backend

### 20.2 Recommended for MVP

ใช้ **Option A**:

```text
Backend ส่งทั้ง field _th และ _en
Frontend ใช้ pickLangValue()
```

แต่ API อาจส่ง field สะดวกเพิ่ม เช่น `name`, `description` ได้ ถ้าไม่ทำให้ซับซ้อน

---

## 21. Admin i18n Rules

### 21.1 Admin UI Language

Admin รุ่นแรกสามารถใช้ภาษาไทยเป็นหลักได้

แต่ field ข้อมูลต้องรองรับสองภาษา เช่น:

```text
ชื่อสถานที่ภาษาไทย
ชื่อสถานที่ภาษาอังกฤษ
รายละเอียดภาษาไทย
รายละเอียดภาษาอังกฤษ
```

### 21.2 Admin Labels

ควรมี label ไทยที่ชัดเจนก่อน เช่น:

```text
ชื่อสถานที่ (ภาษาไทย)
ชื่อสถานที่ (ภาษาอังกฤษ)
รายละเอียด (ภาษาไทย)
รายละเอียด (ภาษาอังกฤษ)
```

### 21.3 Admin English UI

ยังไม่บังคับใน MVP แต่ควรใช้ key ใน i18n ได้ถ้าจะขยายภายหลัง

---

## 22. Content Fallback Rules

### 22.1 Text Fallback

```text
name_en ว่าง → ใช้ name_th
description_en ว่าง → ใช้ description_th
title_en ว่าง → ใช้ title_th
caption_en ว่าง → ใช้ caption_th
```

### 22.2 UI Fallback

```text
key en หาย → ใช้ key th
key th หาย → แสดง key เดิมเพื่อ debug
```

### 22.3 Image Fallback

ไม่เกี่ยวกับภาษาโดยตรง แต่ถ้าไม่มีภาพ:

```text
ใช้ fallback image กลาง
```

### 22.4 Link Fallback

ถ้าไม่มี URL ในภาษาใด ให้ใช้ URL กลาง ไม่ต้องแยกภาษา

---

## 23. Date and Time Localization

### 23.1 Thai Date

แสดงแบบ:

```text
1 สิงหาคม 2569
```

### 23.2 English Date

แสดงแบบ:

```text
August 1, 2026
```

### 23.3 Date Storage

เก็บใน Google Sheets แบบ:

```text
YYYY-MM-DD
```

ตัวอย่าง:

```text
2026-08-01
```

### 23.4 Date Formatter

ควรมี helper:

```javascript
function formatDateByLang(dateText, lang = getCurrentLang()) {
  if (!dateText) return "";

  const date = new Date(dateText);

  if (lang === "th") {
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
```

### 23.5 Time Format

Thai:

```text
10.00–16.00 น.
```

English:

```text
10:00 AM – 4:00 PM
```

---

## 24. Number and Distance Localization

### 24.1 Distance

Thai:

```text
2.4 กม.
```

English:

```text
2.4 km
```

Helper:

```javascript
function formatDistance(km, lang = getCurrentLang()) {
  if (km === null || km === undefined) return "";
  return lang === "th" ? `${km.toFixed(1)} กม.` : `${km.toFixed(1)} km`;
}
```

### 24.2 Rating

ใช้ตัวเลขเดียวกันได้:

```text
4.8
```

แต่ label ต่างกัน:

Thai:

```text
จาก 24 รีวิว
```

English:

```text
from 24 reviews
```

---

## 25. Validation Messages

### 25.1 Thai

```javascript
validation: {
  required: "กรุณากรอกข้อมูลนี้",
  required_name: "กรุณากรอกชื่อ",
  required_place_name: "กรุณากรอกชื่อสถานที่",
  required_comment: "กรุณากรอกความคิดเห็น",
  invalid_url: "กรุณาใส่ URL ที่ถูกต้อง",
  invalid_phone: "กรุณาใส่เบอร์โทรที่ถูกต้อง",
  invalid_latitude: "Latitude ต้องอยู่ระหว่าง -90 ถึง 90",
  invalid_longitude: "Longitude ต้องอยู่ระหว่าง -180 ถึง 180",
  rating_required: "กรุณาเลือกคะแนน",
  rating_invalid: "คะแนนต้องอยู่ระหว่าง 1 ถึง 5"
}
```

### 25.2 English

```javascript
validation: {
  required: "This field is required.",
  required_name: "Please enter your name.",
  required_place_name: "Please enter the place name.",
  required_comment: "Please enter your comment.",
  invalid_url: "Please enter a valid URL.",
  invalid_phone: "Please enter a valid phone number.",
  invalid_latitude: "Latitude must be between -90 and 90.",
  invalid_longitude: "Longitude must be between -180 and 180.",
  rating_required: "Please select a rating.",
  rating_invalid: "Rating must be between 1 and 5."
}
```

---

## 26. Map i18n

### 26.1 Thai

```javascript
map: {
  title: "แผนที่ท่องเที่ยวบ้านตาขุน",
  search_placeholder: "ค้นหาสถานที่บนแผนที่",
  main_route: "เส้นทางหลัก",
  nearby: "ใกล้ฉัน",
  reset_view: "กลับสู่มุมมองเริ่มต้น",
  legend: "คำอธิบายหมุด",
  no_coordinates: "สถานที่นี้ยังไม่มีพิกัดบนแผนที่",
  navigation_unavailable: "ยังไม่มีพิกัดนำทางของสถานที่นี้",
  location_denied: "ไม่สามารถเข้าถึงตำแหน่งของคุณได้"
}
```

### 26.2 English

```javascript
map: {
  title: "Ban Ta Khun Travel Map",
  search_placeholder: "Search places on the map",
  main_route: "Main Route",
  nearby: "Near Me",
  reset_view: "Reset View",
  legend: "Map Legend",
  no_coordinates: "This place does not have map coordinates yet.",
  navigation_unavailable: "Navigation is not available for this place yet.",
  location_denied: "Unable to access your location."
}
```

---

## 27. Trip Planner i18n

### 27.1 Thai

```javascript
planner: {
  title: "วางแผนทริป",
  step_duration: "เลือกระยะเวลา",
  step_style: "เลือกสไตล์การเที่ยว",
  step_result: "แผนทริปแนะนำ",
  half_day: "ครึ่งวัน",
  one_day: "1 วัน",
  two_days_one_night: "2 วัน 1 คืน",
  nature: "ธรรมชาติ",
  community: "ชุมชน",
  photo: "ถ่ายภาพ",
  family: "ครอบครัว",
  activity: "กิจกรรม",
  food_cafe: "ของกิน / คาเฟ่",
  save_plan: "บันทึกแผน",
  share_plan: "แชร์แผน",
  empty: "ยังไม่มีแผนทริปที่ตรงกับตัวเลือกนี้"
}
```

### 27.2 English

```javascript
planner: {
  title: "Trip Planner",
  step_duration: "Choose Duration",
  step_style: "Choose Travel Style",
  step_result: "Recommended Trip Plan",
  half_day: "Half Day",
  one_day: "1 Day",
  two_days_one_night: "2 Days 1 Night",
  nature: "Nature",
  community: "Community",
  photo: "Photo Spots",
  family: "Family",
  activity: "Activities",
  food_cafe: "Food / Café",
  save_plan: "Save Plan",
  share_plan: "Share Plan",
  empty: "No trip plan matches your selection yet."
}
```

---

## 28. Share Text

### 28.1 Place Share

Thai:

```javascript
share: {
  place_title: "ชวนเที่ยว {name} | Takhun Trip",
  place_text: "ดูข้อมูล {name} พร้อมแผนที่และปุ่มนำทางใน Takhun Trip"
}
```

English:

```javascript
share: {
  place_title: "Explore {name} | Takhun Trip",
  place_text: "View {name} with details, map, and navigation in Takhun Trip."
}
```

### 28.2 Route Share

Thai:

```javascript
share: {
  route_title: "เส้นทางเที่ยว {name} | Takhun Trip",
  route_text: "ดูเส้นทางท่องเที่ยวบ้านตาขุน พร้อมแผนที่และจุดแนะนำ"
}
```

English:

```javascript
share: {
  route_title: "{name} Travel Route | Takhun Trip",
  route_text: "Explore this Ban Ta Khun travel route with maps and recommended stops."
}
```

---

## 29. Suggested Full i18n.js Skeleton

```javascript
const SUPPORTED_LANGS = ["th", "en"];
const DEFAULT_LANG = "th";
const LANG_STORAGE_KEY = "TAKHUN_LANG";

const I18N_MESSAGES = {
  th: {
    nav: {},
    actions: {},
    system: {},
    pages: {},
    categories: {},
    districts: {},
    status: {},
    review_status: {},
    coordinate_status: {},
    validation: {},
    map: {},
    planner: {},
    share: {},
    seo: {}
  },
  en: {
    nav: {},
    actions: {},
    system: {},
    pages: {},
    categories: {},
    districts: {},
    status: {},
    review_status: {},
    coordinate_status: {},
    validation: {},
    map: {},
    planner: {},
    share: {},
    seo: {}
  }
};

function getCurrentLang() {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  return SUPPORTED_LANGS.includes(saved) ? saved : DEFAULT_LANG;
}

function setCurrentLang(lang) {
  const nextLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  localStorage.setItem(LANG_STORAGE_KEY, nextLang);
  document.documentElement.lang = nextLang;
  return nextLang;
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? params[key] : `{${key}}`;
  });
}

function t(key, params = {}) {
  const lang = getCurrentLang();
  const value =
    getNestedValue(I18N_MESSAGES[lang], key) ||
    getNestedValue(I18N_MESSAGES.th, key) ||
    key;

  return interpolate(value, params);
}

function pickLangValue(item, key, lang = getCurrentLang()) {
  if (!item) return "";
  return item[`${key}_${lang}`] || item[`${key}_th`] || "";
}

function applyI18n(root = document) {
  document.documentElement.lang = getCurrentLang();

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });

  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
  });

  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
}
```

---

## 30. Language Switch Flow

```text
ผู้ใช้กดปุ่มภาษา
→ setCurrentLang(lang)
→ update active button
→ applyI18n()
→ re-render dynamic data
→ update SEO title/meta ถ้าจำเป็น
→ show toast
```

ข้อความ Toast:

Thai:

```text
เปลี่ยนภาษาเรียบร้อย
```

English:

```text
Language changed.
```

---

## 31. Implementation Order

ให้ Codex พัฒนาระบบ i18n ตามลำดับนี้:

### Step 1: Create i18n.js

- สร้าง constants
- สร้าง I18N_MESSAGES
- สร้าง `t()`
- สร้าง `getCurrentLang()`
- สร้าง `setCurrentLang()`
- สร้าง `pickLangValue()`
- สร้าง `applyI18n()`

### Step 2: Apply to Global UI

- Header
- Bottom Navigation
- More Menu
- Buttons
- System Messages

### Step 3: Apply to Data Rendering

- Place Card
- Route Card
- Product Card
- Event Card
- Gallery Card
- Detail Pages

### Step 4: Apply to Forms

- Review Form
- Search
- Admin Login
- Admin Forms เฉพาะ label ที่จำเป็น

### Step 5: Apply to SEO

- Page titles
- Meta descriptions
- Share text

### Step 6: Test

- เปลี่ยน TH → EN
- เปลี่ยน EN → TH
- reload แล้วยังจำภาษาเดิม
- field ภาษาอังกฤษว่างแล้ว fallback ไทย
- ไม่มี key หายสำคัญ

---

## 32. i18n Acceptance Criteria

ระบบ i18n จะถือว่าผ่านเมื่อ:

1. ค่าเริ่มต้นเป็นภาษาไทย
2. เปลี่ยนภาษาเป็นอังกฤษได้
3. Reload หน้าแล้วยังจำภาษาที่เลือก
4. Header และ Bottom Navigation เปลี่ยนภาษาได้
5. ปุ่มหลักเปลี่ยนภาษาได้
6. Loading / Empty / Error / Success เปลี่ยนภาษาได้
7. Place Card ใช้ `name_en` เมื่อเลือก EN
8. ถ้า `name_en` ว่าง ใช้ `name_th`
9. Route / Product / Event ใช้ field ภาษาถูกต้อง
10. Review Form เปลี่ยนภาษาได้
11. Map UI เปลี่ยนภาษาได้
12. Trip Planner UI เปลี่ยนภาษาได้
13. ไม่มี error เมื่อ localStorage ใช้งานไม่ได้
14. ไม่มีข้อความอังกฤษแปลทื่อเกินไป
15. ไม่มี hardcode ข้อความซ้ำซ้อนเกินจำเป็น

---

## 33. Common Mistakes to Avoid

1. เขียนข้อความไทย/อังกฤษกระจายทุกไฟล์
2. ใช้ key ไม่สม่ำเสมอ
3. ลืม fallback ภาษาไทย
4. เปลี่ยนภาษาแล้ว dynamic card ไม่ re-render
5. ใช้ `innerHTML` กับข้อความที่ไม่ escape
6. เก็บภาษาผิด key ใน Local Storage
7. Admin field ชื่อภาษาอังกฤษไม่ตรง schema
8. API ส่งเฉพาะภาษาเดียวจนเปลี่ยนภาษาหน้าเดิมไม่ได้
9. แปลชื่อเฉพาะแบบผิดธรรมชาติ
10. ใช้ข้อความอังกฤษยาวเกินปุ่ม

---

## 34. Codex Instructions for i18n

เมื่อใช้ Codex สร้างหรือแก้ระบบภาษา ให้ยึดกติกานี้:

1. อ่าน `docs/I18N_SPEC.md`, `docs/CONTENT_GUIDE.md`, `docs/DATA_SCHEMA.md` และ `docs/API_SPEC.md` ก่อนเริ่ม
2. ใช้ `public/js/i18n.js` เป็นศูนย์กลาง
3. ใช้ Local Storage key `TAKHUN_LANG`
4. ค่าเริ่มต้นต้องเป็น `th`
5. ใช้ `t()` สำหรับ UI labels
6. ใช้ `pickLangValue()` สำหรับข้อมูลจาก Sheets
7. ถ้าข้อมูลอังกฤษว่าง ต้อง fallback เป็นไทย
8. ห้ามเปลี่ยนชื่อ field `_th`, `_en`
9. ห้ามเขียนข้อความซ้ำหลายไฟล์ถ้าใช้ key ได้
10. หลังทำเสร็จต้องทดสอบ TH/EN และ reload
11. ถ้าไม่แน่ใจ ให้ถามก่อน ไม่เดา

---

## 35. Final i18n Direction

ระบบภาษาของ **Takhun Trip** ต้องเรียบง่าย ใช้งานจริง และต่อยอดได้

แนวทางสำคัญ:

```text
UI ใช้ t()
ข้อมูลใช้ pickLangValue()
ค่าเริ่มต้นภาษาไทย
อังกฤษเป็นภาษารอง
fallback ไทยเสมอ
ข้อความต้องเป็นธรรมชาติ
ไม่แปลทื่อ
ไม่ทำให้ระบบซับซ้อนเกิน MVP
```

เป้าหมายคือให้นักท่องเที่ยวไทยใช้งานได้เต็มรูปแบบ และนักท่องเที่ยวต่างชาติสามารถเข้าใจข้อมูลหลักของบ้านตาขุนได้ง่ายขึ้น
