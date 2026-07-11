# COMPONENTS.md — Takhun Trip

เอกสารนี้กำหนดมาตรฐาน Component ของเว็บแอป **Takhun Trip** เพื่อใช้ควบคุมการพัฒนาใน VS Code / Codex ให้ทุกหน้ามีรูปแบบ UI ที่สอดคล้องกัน ใช้ซ้ำได้ ดูพรีเมี่ยม และไม่สร้าง component ซ้ำซ้อนหลายแบบโดยไม่จำเป็น

Component ในเอกสารนี้ต้องสอดคล้องกับ:

```text
README.md
docs/APP_SPEC.md
docs/DESIGN.md
docs/UI_FLOW.md
docs/DATA_SCHEMA.md
docs/API_SPEC.md
docs/ADMIN_CMS_SPEC.md
docs/MAP_SPEC.md
docs/CONTENT_GUIDE.md
docs/ROUTES_AND_PAGES.md
docs/DEVELOPMENT_RULES.md
```

---

## 1. Component Design Principles

Component ของ **Takhun Trip** ต้องยึดหลัก:

1. ใช้งานง่ายบนมือถือ
2. รูปแบบสวยทันสมัย สดใส และพรีเมี่ยม
3. ใช้ซ้ำได้หลายหน้า
4. ไม่สร้างหลายเวอร์ชันโดยไม่จำเป็น
5. รองรับภาษาไทยและอังกฤษ
6. รองรับ Loading / Empty / Error State
7. ใช้ design tokens จาก `DESIGN.md`
8. ไม่พึ่งพา framework
9. ใช้ HTML/CSS/Vanilla JavaScript
10. รองรับ accessibility ขั้นพื้นฐาน

---

## 2. Component Naming Rules

### 2.1 CSS Class Naming

ใช้ kebab-case

ตัวอย่าง:

```text
app-header
hero-section
place-card
route-card
map-preview-card
bottom-nav
toast-message
admin-data-card
```

### 2.2 JavaScript Function Naming

ใช้ camelCase

ตัวอย่าง:

```javascript
renderPlaceCard()
renderRouteCard()
showToast()
openConfirmDialog()
renderEmptyState()
```

### 2.3 Data Attribute Naming

ใช้ `data-*` สำหรับ hook ใน JavaScript

ตัวอย่าง:

```html
<div data-place-list></div>
<button data-action="save-place"></button>
```

### 2.4 ห้ามใช้

- class ชื่อมั่ว เช่น `.box1`, `.card2`, `.new-style`
- inline style ซ้ำ ๆ
- component ซ้ำหน้าตาใกล้กันแต่ใช้คนละ class
- JavaScript เลือก element ด้วย class ที่ใช้เพื่อ styling อย่างเดียวถ้าเลี่ยงได้

---

## 3. Shared Public Components

Component กลางที่ใช้ในฝั่งผู้ใช้ทั่วไป

```text
App Header
Mobile Bottom Navigation
More Menu
Hero Section
Search Bar
Quick Action Card
Section Header
Place Card
Route Card
Product Card
Event Card
Gallery Card
Review Card
Map Preview Card
Favorite Button
Share Button
Language Switcher
CTA Button
Badge
Toast
Modal / Dialog
Loading State
Empty State
Error State
Footer
```

---

## 4. Shared Admin Components

Component กลางฝั่ง Admin / CMS

```text
Admin Header
Admin Sidebar / Drawer
Admin Summary Card
Admin Data Table
Admin Mobile Data Card
Admin Form Section
Admin Status Badge
Admin Search Filter
Admin Pagination
Admin Confirm Dialog
Admin Toast
Admin Loading State
Admin Empty State
Admin Error State
```

---

## 5. Design Tokens Dependency

ทุก Component ต้องใช้ตัวแปรกลางจาก `main.css`

```css
:root {
  --color-primary: #00796B;
  --color-primary-dark: #064E3B;
  --color-accent: #FDBA2D;
  --color-accent-2: #F97316;
  --color-water: #18B7B5;
  --color-bg: #F8FAF8;
  --color-sand: #FFF7E6;
  --color-text: #1F2937;
  --color-muted: #6B7280;

  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --radius-pill: 999px;

  --shadow-soft: 0 12px 32px rgba(15, 23, 42, 0.10);
  --shadow-card: 0 16px 40px rgba(15, 23, 42, 0.12);
  --shadow-floating: 0 20px 60px rgba(15, 23, 42, 0.18);
}
```

---

## 6. App Header

### 6.1 Purpose

ใช้เป็น Header หลักของหน้า Public

### 6.2 Used In

```text
index.html
routes.html
route-detail.html
places.html
place-detail.html
trip-planner.html
products.html
product-detail.html
events.html
event-detail.html
gallery.html
favorites.html
about.html
```

หน้า `map.html` ใช้ Header แบบย่อได้ เพราะต้องให้พื้นที่แผนที่มากที่สุด

### 6.3 Required Elements

- Logo / App Name
- Main Menu
- Search Button
- Language Switcher
- Mobile Menu Button

### 6.4 Desktop Layout

```text
[Logo] [หน้าแรก] [แผนที่] [เส้นทาง] [สถานที่] [สินค้า] [กิจกรรม] [แกลเลอรี] [TH/EN] [Search]
```

### 6.5 Mobile Layout

```text
[Logo]                    [Search] [TH] [Menu]
```

หรือใช้ Bottom Navigation เป็นหลัก

### 6.6 CSS Classes

```text
app-header
app-header__inner
app-header__brand
app-header__logo
app-header__nav
app-header__nav-link
app-header__actions
app-header__menu-btn
```

### 6.7 Rules

- Header ต้องไม่สูงเกินไปบนมือถือ
- Active menu ต้องชัดเจน
- เมื่อ scroll สามารถใช้พื้นหลังขาวโปร่งหรือ glass effect ได้
- ต้องมี aria-label สำหรับปุ่ม icon
- ห้าม hardcode เมนูหลายที่ ควรใช้ component/render function หรือ snippet กลางเท่าที่ทำได้

---

## 7. Mobile Bottom Navigation

### 7.1 Purpose

เป็น navigation หลักบนมือถือ เพื่อให้เว็บรู้สึกเหมือนแอป

### 7.2 Used In

ทุกหน้า Public บนมือถือ

### 7.3 Items

| Label TH | Label EN | Link / Action |
|---|---|---|
| หน้าแรก | Home | `index.html` |
| แผนที่ | Map | `map.html` |
| วางแผน | Plan | `trip-planner.html` |
| บันทึกไว้ | Saved | `favorites.html` |
| เพิ่มเติม | More | เปิด More Menu |

### 7.4 CSS Classes

```text
bottom-nav
bottom-nav__item
bottom-nav__item.is-active
bottom-nav__icon
bottom-nav__label
bottom-nav__more
```

### 7.5 Rules

- แสดงเฉพาะ mobile/tablet ตามความเหมาะสม
- กดง่าย ความสูงอย่างน้อย 64px
- ไม่บัง Toast หรือ Bottom Sheet
- `map.html` ต้องจัดตำแหน่ง Bottom Preview Card ไม่ให้ชนกับ Bottom Navigation
- มี active state ตามหน้าปัจจุบัน

---

## 8. More Menu

### 8.1 Purpose

เมนูเพิ่มเติมบนมือถือ

### 8.2 Items

```text
เส้นทาง
สถานที่
สินค้าและชุมชน
กิจกรรม
แกลเลอรี
เกี่ยวกับเรา
เปลี่ยนภาษา
```

### 8.3 CSS Classes

```text
more-menu
more-menu.is-open
more-menu__backdrop
more-menu__panel
more-menu__item
more-menu__close
```

### 8.4 Rules

- เปิด/ปิดได้
- ปิดเมื่อกด backdrop
- ปิดเมื่อกดปุ่ม close
- รองรับ keyboard เบื้องต้น
- ไม่ซ้อนกับ modal อื่นโดยไม่จำเป็น

---

## 9. Hero Section

### 9.1 Purpose

ใช้เปิดหน้าแรกหรือหน้าหลักของแต่ละหมวดให้ดูพรีเมี่ยม

### 9.2 Used In

```text
index.html
routes.html
places.html
trip-planner.html
products.html
events.html
gallery.html
about.html
```

### 9.3 Required Elements

- Eyebrow text / badge
- Title
- Description
- CTA buttons
- Hero image
- Optional floating stats/card

### 9.4 CSS Classes

```text
hero-section
hero-section__content
hero-section__eyebrow
hero-section__title
hero-section__description
hero-section__actions
hero-section__media
hero-section__image
hero-section__floating-card
```

### 9.5 Rules

- ใช้ภาพใหญ่คุณภาพดี
- มี overlay ถ้าวางข้อความบนภาพ
- บนมือถือไม่ควรสูงเกินไปจนผู้ใช้ไม่เห็น CTA
- CTA หลักต้องชัดเจน
- Hero ของหน้าแรกต้องโดดเด่นที่สุด

---

## 10. Search Bar

### 10.1 Purpose

ใช้ค้นหาสถานที่ เส้นทาง สินค้า กิจกรรม หรือข้อมูลในหน้าปัจจุบัน

### 10.2 Variants

```text
global-search
page-search
map-search
admin-search
```

### 10.3 CSS Classes

```text
search-bar
search-bar__icon
search-bar__input
search-bar__clear
search-bar__submit
```

### 10.4 Rules

- Placeholder ต้องชัดเจน
- ต้องมี clear button ถ้าพิมพ์แล้ว
- บนมือถือ input ต้องสูงอย่างน้อย 44px
- ถ้าไม่พบข้อมูลให้แสดง Empty State
- ห้ามค้นหาทุกครั้งแบบหนักเกินไปโดยไม่ debounce

### 10.5 Recommended Placeholder

Thai:

```text
ค้นหาสถานที่ เส้นทาง หรือของดีชุมชน
```

English:

```text
Search places, routes, or local products
```

---

## 11. Section Header

### 11.1 Purpose

ใช้เป็นหัวข้อ section พร้อมคำอธิบายและปุ่มดูทั้งหมด

### 11.2 CSS Classes

```text
section-header
section-header__eyebrow
section-header__title
section-header__description
section-header__action
```

### 11.3 Example

```html
<div class="section-header">
  <div>
    <p class="section-header__eyebrow">Recommended Route</p>
    <h2 class="section-header__title">เส้นทางหลักบ้านตาขุน</h2>
    <p class="section-header__description">เที่ยวครบ 4 จุดเด่น จากเขื่อนสู่ชุมชน</p>
  </div>
  <a class="section-header__action" href="routes.html">ดูทั้งหมด</a>
</div>
```

### 11.4 Rules

- Title ต้องสั้นและชัดเจน
- Description ไม่ควรเกิน 2 บรรทัด
- ปุ่มดูทั้งหมดต้องลิงก์ถูกหน้า

---

## 12. Quick Action Card

### 12.1 Purpose

เป็นทางลัดจากหน้าแรกไปยังฟังก์ชันหลัก

### 12.2 Items

```text
แผนที่ท่องเที่ยว
เส้นทางแนะนำ
วางแผนทริป
จุดถ่ายรูป
ของดีชุมชน
กิจกรรม
```

### 12.3 CSS Classes

```text
quick-actions
quick-action-card
quick-action-card__icon
quick-action-card__title
quick-action-card__description
```

### 12.4 Rules

- การ์ดต้องกดได้ทั้งใบ
- Icon ต้องเป็น modern minimal
- ใช้สีแตกต่างกันตามหมวด
- บนมือถือสามารถใช้ grid 2 คอลัมน์ หรือ horizontal scroll

---

## 13. Place Card

### 13.1 Purpose

แสดงสถานที่ท่องเที่ยวในหน้า list, home, route detail, favorites และ nearby places

### 13.2 Used In

```text
index.html
places.html
route-detail.html
favorites.html
place-detail.html
map.html preview related
```

### 13.3 Required Data

```text
place_id
name
category
district
short_description
cover_image_url
phone
google_maps_url
latitude
longitude
rating summary ถ้ามี
is_featured
is_main_route_point
```

### 13.4 Required Elements

- Image
- Category Badge
- Title
- Short Description
- District
- Rating ถ้ามี
- Favorite Button
- CTA: ดูรายละเอียด
- CTA: นำทาง

### 13.5 CSS Classes

```text
place-card
place-card__image-wrap
place-card__image
place-card__badge
place-card__content
place-card__title
place-card__meta
place-card__description
place-card__actions
place-card__favorite
```

### 13.6 Variants

```text
place-card--featured
place-card--compact
place-card--horizontal
place-card--map-preview
```

### 13.7 Rules

- กดการ์ดไป `place-detail.html?id={place_id}`
- ปุ่มนำทางต้องใช้ Google Maps URL
- ถ้าไม่มีภาพให้ใช้ fallback image
- ถ้าไม่มีพิกัด ห้ามแสดงปุ่ม “ดูบนแผนที่” แบบทำให้ error
- ชื่อยาวต้องตัดด้วย line-clamp
- คำอธิบายไม่เกิน 2 บรรทัดในการ์ด

---

## 14. Route Card

### 14.1 Purpose

แสดงเส้นทางท่องเที่ยว

### 14.2 Used In

```text
index.html
routes.html
trip-planner.html
```

### 14.3 Required Data

```text
route_id
name
short_description
duration
travel_style
cover_image_url
places count
is_featured
```

### 14.4 Required Elements

- Image
- Route Title
- Duration
- Travel Style Chips
- Short Description
- CTA: ดูเส้นทาง
- CTA: เปิดแผนที่

### 14.5 CSS Classes

```text
route-card
route-card__image
route-card__content
route-card__title
route-card__meta
route-card__chips
route-card__description
route-card__actions
```

### 14.6 Rules

- กดไป `route-detail.html?id={route_id}`
- ปุ่มเปิดแผนที่ไป `map.html?route={route_id}`
- เส้นทางหลักควรแสดงเด่นที่สุด
- ใช้ timeline/number ใน route detail

---

## 15. Route Timeline

### 15.1 Purpose

ใช้ในหน้า `route-detail.html` เพื่อแสดงลำดับสถานที่ในเส้นทาง

### 15.2 Required Elements

- Step Number
- Place Name
- Short Description
- Suggested Time ถ้ามี
- CTA ดูสถานที่
- CTA นำทาง

### 15.3 CSS Classes

```text
route-timeline
route-timeline__item
route-timeline__number
route-timeline__line
route-timeline__content
route-timeline__title
route-timeline__meta
route-timeline__actions
```

### 15.4 Rules

- เส้นทางหลักต้องแสดงลำดับ 1–4 ชัดเจน
- ต้องเรียงตาม `route_places.stop_order`
- ถ้าสถานที่ใดไม่มีพิกัด ปุ่มนำทางยังใช้ google_maps_url ได้ถ้ามี

---

## 16. Product Card

### 16.1 Purpose

แสดงสินค้าและบริการชุมชน

### 16.2 Used In

```text
index.html
products.html
product-detail.html related products
place-detail.html related products
```

### 16.3 Required Data

```text
product_id
name
category
producer_name
description
price_range
phone
contact_url
image_url
related_place_id
```

### 16.4 Required Elements

- Product Image
- Category Badge
- Product Name
- Producer Name
- Price Range ถ้ามี
- CTA: ดูรายละเอียด
- CTA: โทร/ติดต่อ

### 16.5 CSS Classes

```text
product-card
product-card__image
product-card__badge
product-card__content
product-card__title
product-card__producer
product-card__price
product-card__actions
```

### 16.6 Rules

- ห้ามทำตะกร้าสินค้าใน MVP
- เน้นติดต่อผู้ผลิตโดยตรง
- ถ้าไม่มีราคา ให้แสดง “สอบถามราคา”
- ถ้าไม่มีรูป ให้ใช้ fallback product image

---

## 17. Event Card

### 17.1 Purpose

แสดงกิจกรรมและเทศกาล

### 17.2 Used In

```text
index.html
events.html
place-detail.html related events
```

### 17.3 Required Data

```text
event_id
title
event_type
event_date
start_time
end_time
location
image_url
contact_phone
register_url
```

### 17.4 Required Elements

- Event Image
- Date Badge
- Event Title
- Location
- Time
- CTA: ดูรายละเอียด
- CTA: สนใจเข้าร่วม

### 17.5 CSS Classes

```text
event-card
event-card__image
event-card__date
event-card__content
event-card__title
event-card__meta
event-card__actions
```

### 17.6 Rules

- กิจกรรมใกล้ถึงแสดงก่อน
- ถ้าเลยวันที่แล้วให้แสดงเป็นกิจกรรมที่ผ่านมา
- วันที่ต้องอ่านง่ายบนมือถือ
- ถ้าไม่มี register_url ให้ปุ่ม “สนใจเข้าร่วม” แสดงข้อความให้ติดต่อผู้ประสานงาน

---

## 18. Gallery Card

### 18.1 Purpose

แสดงรูปภาพและวิดีโอ

### 18.2 Used In

```text
gallery.html
place-detail.html
index.html gallery preview
```

### 18.3 Required Data

```text
media_id
title
media_type
category
image_url
video_url
thumbnail_url
caption
credit
```

### 18.4 Required Elements

- Thumbnail
- Media Type Icon
- Title
- Caption ถ้ามี
- Credit ถ้ามี

### 18.5 CSS Classes

```text
gallery-grid
gallery-card
gallery-card__media
gallery-card__badge
gallery-card__title
gallery-card__caption
```

### 18.6 Rules

- กดภาพเปิด Lightbox
- กดวิดีโอเปิด Embed หรือ URL
- ถ้าเป็นวิดีโอควรมี icon play
- รูปต้องมี alt text

---

## 19. Review Card

### 19.1 Purpose

แสดงรีวิวที่ผ่านการอนุมัติ

### 19.2 Used In

```text
place-detail.html
admin/reviews.html
```

### 19.3 Required Data

```text
review_id
place_id
reviewer_name
is_anonymous
rating
comment
admin_reply
created_at
status
```

### 19.4 Required Elements

- Reviewer Name
- Rating Stars
- Comment
- Date
- Admin Reply ถ้ามี

### 19.5 CSS Classes

```text
review-card
review-card__header
review-card__name
review-card__rating
review-card__comment
review-card__reply
review-card__date
```

### 19.6 Rules

- Public แสดงเฉพาะ `approved`
- ถ้า anonymous ให้แสดง “นักท่องเที่ยว”
- ต้อง escape comment ก่อน render
- ห้ามแสดงรีวิว pending ใน public

---

## 20. Map Preview Card

### 20.1 Purpose

แสดงข้อมูลสถานที่เมื่อกดหมุดบนแผนที่

### 20.2 Used In

```text
map.html
```

### 20.3 Required Elements

- Thumbnail
- Place Name
- Category
- District
- Short Description
- CTA: ดูรายละเอียด
- CTA: นำทาง
- CTA: โทร ถ้ามี
- Favorite Button

### 20.4 CSS Classes

```text
map-preview-card
map-preview-card.is-open
map-preview-card__image
map-preview-card__content
map-preview-card__title
map-preview-card__meta
map-preview-card__actions
```

### 20.5 Rules

- บนมือถือแสดงเป็น bottom sheet/card
- ต้องไม่บัง Bottom Navigation จนใช้งานไม่ได้
- ปุ่มนำทางต้องเด่น
- ปิดได้
- ถ้าไม่มีรูปให้ใช้ fallback

---

## 21. Favorite Button

### 21.1 Purpose

บันทึกสถานที่โปรดใน Local Storage

### 21.2 Used In

```text
place-card
place-detail.html
map-preview-card
favorites.html
```

### 21.3 CSS Classes

```text
favorite-btn
favorite-btn.is-active
```

### 21.4 Local Storage

```text
TAKHUN_FAVORITES
```

### 21.5 Rules

- กดครั้งแรก: เพิ่ม
- กดซ้ำ: ลบ
- แสดง Toast
- เปลี่ยน state ทันที
- ต้องมี aria-label

---

## 22. Share Button

### 22.1 Purpose

แชร์สถานที่ เส้นทาง สินค้า กิจกรรม หรือแผนทริป

### 22.2 CSS Classes

```text
share-btn
```

### 22.3 Behavior

```text
ถ้า Browser รองรับ Web Share API
→ ใช้ navigator.share()

ถ้าไม่รองรับ
→ copy link
→ show toast “คัดลอกลิงก์แล้ว”
```

### 22.4 Rules

- ต้องมี fallback copy link
- ต้องไม่ทำให้หน้า error ถ้า share ไม่สำเร็จ
- ใช้ title/description ตามประเภทข้อมูล

---

## 23. Language Switcher

### 23.1 Purpose

เปลี่ยนภาษาไทย/อังกฤษ

### 23.2 CSS Classes

```text
language-switcher
language-switcher__btn
language-switcher__btn.is-active
```

### 23.3 Local Storage

```text
TAKHUN_LANG
```

### 23.4 Rules

- ค่าเริ่มต้นเป็น `th`
- เปลี่ยนภาษาแล้วบันทึก localStorage
- ถ้าข้อมูลอังกฤษไม่มี ให้ fallback ไทย
- UI labels ควรใช้ `i18n.js`

---

## 24. CTA Button

### 24.1 Variants

```text
btn
btn-primary
btn-secondary
btn-ghost
btn-danger
btn-icon
btn-link
```

### 24.2 CSS Classes

```text
btn
btn--primary
btn--secondary
btn--ghost
btn--danger
btn--icon
btn--link
```

### 24.3 Rules

- ปุ่มมือถือสูงอย่างน้อย 44px
- Primary CTA ใช้ gradient เหลือง/ส้ม
- Secondary ใช้พื้นขาวหรือ glass
- Danger ใช้กับลบเท่านั้น
- Icon button ต้องมี aria-label

---

## 25. Badge / Chip

### 25.1 Purpose

แสดงหมวดหมู่ สถานะ สไตล์ หรือ metadata

### 25.2 Variants

```text
category-badge
status-badge
style-chip
filter-chip
date-badge
```

### 25.3 CSS Classes

```text
badge
badge--primary
badge--success
badge--warning
badge--danger
badge--muted
chip
chip.is-active
```

### 25.4 Rules

- ใช้สีตามหมวด/สถานะ
- ข้อความสั้น
- ห้ามใช้สีอย่างเดียว ต้องมี label
- Filter chip ต้องมี active state

---

## 26. Toast

### 26.1 Purpose

แจ้งผลการทำงานสั้น ๆ

### 26.2 Types

```text
success
error
warning
info
```

### 26.3 CSS Classes

```text
toast-container
toast-message
toast-message--success
toast-message--error
toast-message--warning
toast-message--info
```

### 26.4 Position

- Public mobile: ด้านล่าง เหนือ Bottom Navigation
- Admin desktop: มุมขวาบนหรือขวาล่าง
- Map: ไม่บัง Preview Card

### 26.5 Rules

- แสดง 2–4 วินาที
- ปิดเองได้
- มีปุ่มปิดถ้าข้อความสำคัญ
- ไม่แสดงซ้อนเยอะจนบังจอ

---

## 27. Confirm Dialog

### 27.1 Purpose

ยืนยัน action สำคัญ เช่น ลบ ซ่อน อนุมัติ

### 27.2 CSS Classes

```text
confirm-dialog
confirm-dialog.is-open
confirm-dialog__backdrop
confirm-dialog__panel
confirm-dialog__title
confirm-dialog__message
confirm-dialog__actions
```

### 27.3 Rules

- ต้องมีปุ่มยกเลิก
- ต้องมีปุ่มยืนยัน
- ใช้กับ action ที่มีผลต่อข้อมูล
- ปิดด้วย ESC ได้ถ้าทำได้
- ไม่ใช้ browser `confirm()` ถ้าต้องการ UI สวยสอดคล้อง

---

## 28. Modal / Lightbox

### 28.1 Purpose

ใช้กับ Gallery, Form หรือภาพขยาย

### 28.2 CSS Classes

```text
modal
modal.is-open
modal__backdrop
modal__panel
modal__header
modal__body
modal__footer
lightbox
lightbox__image
```

### 28.3 Rules

- ปิดได้ด้วยปุ่ม
- ปิดด้วย backdrop ได้ถ้าเหมาะสม
- บนมือถือ panel ต้องไม่ล้นจอ
- รูปภาพต้องไม่บิดสัดส่วน
- Form ยาวควรใช้หน้าเต็มหรือ section แทน modal ถ้า modal ใช้งานยาก

---

## 29. Loading State

### 29.1 Purpose

แสดงสถานะกำลังโหลดข้อมูล

### 29.2 Variants

```text
spinner
skeleton-card
page-loading
map-loading
```

### 29.3 CSS Classes

```text
loading-state
loading-spinner
skeleton
skeleton-card
```

### 29.4 Rules

- ทุกหน้าที่เรียก API ต้องมี Loading State
- Map ต้องมีข้อความ “กำลังโหลดแผนที่ท่องเที่ยว...”
- Admin table ต้องมี skeleton หรือข้อความโหลด
- ห้ามปล่อยพื้นที่ว่างโดยไม่มีข้อความ

---

## 30. Empty State

### 30.1 Purpose

แสดงเมื่อไม่มีข้อมูล

### 30.2 CSS Classes

```text
empty-state
empty-state__icon
empty-state__title
empty-state__description
empty-state__action
```

### 30.3 Example Text

```text
ยังไม่มีข้อมูลในหมวดนี้
ไม่พบข้อมูลที่ตรงกับการค้นหา
ยังไม่มีสถานที่โปรด
ยังไม่มีกิจกรรมในช่วงนี้
```

### 30.4 Rules

- ต้องมีข้อความชัดเจน
- ถ้าเหมาะสมให้มีปุ่ม action เช่น “ดูทั้งหมด” หรือ “เพิ่มข้อมูล”
- Admin Empty State ควรมีปุ่มเพิ่มข้อมูล

---

## 31. Error State

### 31.1 Purpose

แสดงเมื่อโหลดข้อมูลหรือทำ action ไม่สำเร็จ

### 31.2 CSS Classes

```text
error-state
error-state__icon
error-state__title
error-state__description
error-state__action
```

### 31.3 Example Text

```text
โหลดข้อมูลไม่สำเร็จ
กรุณาลองใหม่อีกครั้ง
```

### 31.4 Rules

- ต้องมีปุ่ม “ลองใหม่”
- ห้ามแสดง error ดิบให้ผู้ใช้
- console log ได้เฉพาะช่วงพัฒนา
- ต้องไม่ทำให้ทั้งหน้า crash

---

## 32. Footer

### 32.1 Purpose

แสดงข้อมูลเว็บและช่องทางติดต่อ

### 32.2 Required Elements

- Logo / App Name
- Slogan
- Main Links
- Contact
- Social Links
- Copyright

### 32.3 CSS Classes

```text
app-footer
app-footer__brand
app-footer__links
app-footer__contact
app-footer__copyright
```

### 32.4 Rules

- ไม่จำเป็นต้องแสดง footer ใหญ่ใน map.html
- บนมือถือ footer ต้องไม่ยาวเกินไป
- Social links ต้องเปิดหน้าใหม่อย่างปลอดภัย

---

# Admin Components

## 33. Admin Header

### 33.1 Purpose

Header หลักของหน้า Admin

### 33.2 Required Elements

- Page title
- Admin display name
- Open Public Site button
- Logout button
- Mobile menu button

### 33.3 CSS Classes

```text
admin-header
admin-header__title
admin-header__actions
admin-header__user
admin-header__logout
```

---

## 34. Admin Sidebar / Drawer

### 34.1 Purpose

เมนูนำทางระบบหลังบ้าน

### 34.2 Items

```text
Dashboard
สถานที่
เส้นทาง
สินค้า/บริการ
กิจกรรม
รีวิว
แกลเลอรี
ตั้งค่า
ออกจากระบบ
```

### 34.3 CSS Classes

```text
admin-sidebar
admin-sidebar__brand
admin-sidebar__nav
admin-sidebar__link
admin-sidebar__link.is-active
admin-drawer
```

### 34.4 Rules

- Desktop ใช้ sidebar
- Mobile ใช้ drawer หรือ dropdown
- Active page ต้องชัดเจน
- Logout ต้องเห็นชัดแต่ไม่เด่นเกิน action หลัก

---

## 35. Admin Summary Card

### 35.1 Purpose

แสดงสถิติบน Dashboard

### 35.2 Required Data

```text
label
value
icon
trend หรือ description ถ้ามี
```

### 35.3 CSS Classes

```text
admin-summary-grid
admin-summary-card
admin-summary-card__icon
admin-summary-card__label
admin-summary-card__value
admin-summary-card__description
```

### 35.4 Rules

- ใช้สีอ่อนแยกหมวด
- ค่าเลขต้องใหญ่และอ่านง่าย
- กด card เพื่อไปหน้าจัดการข้อมูลได้ถ้าเหมาะสม

---

## 36. Admin Data Table

### 36.1 Purpose

แสดงรายการข้อมูลบน desktop

### 36.2 CSS Classes

```text
admin-table
admin-table__wrapper
admin-table__head
admin-table__row
admin-table__cell
admin-table__actions
```

### 36.3 Rules

- ใช้บน desktop
- มี action ด้านขวา
- มี status badge
- รองรับ empty/loading/error
- บน mobile ให้เปลี่ยนเป็น Card List

---

## 37. Admin Mobile Data Card

### 37.1 Purpose

แทน Data Table บนมือถือ

### 37.2 CSS Classes

```text
admin-data-card
admin-data-card__title
admin-data-card__meta
admin-data-card__status
admin-data-card__actions
```

### 37.3 Rules

- แสดงข้อมูลสำคัญก่อน
- ปุ่มแก้ไข/ดู/ซ่อน/ลบต้องกดง่าย
- ไม่ควรมีข้อความยาวเกินไป

---

## 38. Admin Form Section

### 38.1 Purpose

จัดกลุ่มฟอร์มในหน้า Admin

### 38.2 CSS Classes

```text
admin-form
admin-form__section
admin-form__section-title
admin-form__grid
form-field
form-field__label
form-field__input
form-field__help
form-field__error
```

### 38.3 Rules

- Form ยาวต้องแบ่ง section
- Required field มี `*`
- Error แสดงใต้ field
- บนมือถือใช้คอลัมน์เดียว
- ปุ่ม Save อยู่ท้ายฟอร์มและเห็นชัด

---

## 39. Admin Search Filter

### 39.1 Purpose

ค้นหาและกรองรายการใน Admin

### 39.2 CSS Classes

```text
admin-filter-bar
admin-filter-bar__search
admin-filter-bar__select
admin-filter-bar__actions
```

### 39.3 Rules

- ค้นหาได้
- กรองตาม status/category/district ตามแต่ละหน้า
- มีปุ่ม reset filter
- ควรทำ debounce กับ search

---

## 40. Admin Pagination

### 40.1 Purpose

แบ่งหน้าเมื่อข้อมูลเยอะ

### 40.2 CSS Classes

```text
pagination
pagination__btn
pagination__btn.is-active
pagination__summary
```

### 40.3 Rules

- มีปุ่มก่อนหน้า/ถัดไป
- แสดงหน้าปัจจุบัน
- ถ้าข้อมูลน้อยไม่ต้องแสดง
- บนมือถือใช้รูปแบบย่อ

---

## 41. Status Badge Mapping

### 41.1 Content Status

| Status | Label TH | Class |
|---|---|---|
| `draft` | ร่าง | `badge--muted` |
| `published` | เผยแพร่ | `badge--success` |
| `hidden` | ซ่อน | `badge--warning` |
| `archived` | เก็บถาวร | `badge--muted` |
| `deleted` | ลบแล้ว | `badge--danger` |

### 41.2 Review Status

| Status | Label TH | Class |
|---|---|---|
| `pending` | รอตรวจสอบ | `badge--warning` |
| `approved` | เผยแพร่แล้ว | `badge--success` |
| `hidden` | ซ่อน | `badge--muted` |
| `deleted` | ลบแล้ว | `badge--danger` |

### 41.3 Coordinate Status

| Status | Label TH | Class |
|---|---|---|
| `verified` | ยืนยันพิกัดแล้ว | `badge--success` |
| `pending_verify` | รอยืนยัน | `badge--warning` |
| `needs_survey` | ต้องสำรวจ | `badge--warning` |
| `no_coordinate` | ยังไม่มีพิกัด | `badge--muted` |
| `approximate` | พิกัดประมาณ | `badge--info` |

---

## 42. Component Rendering Functions

แนะนำให้มีฟังก์ชัน render component ที่ใช้ซ้ำ

### 42.1 Public

```javascript
renderPlaceCard(place, options = {})
renderRouteCard(route, options = {})
renderProductCard(product, options = {})
renderEventCard(event, options = {})
renderGalleryCard(media, options = {})
renderReviewCard(review, options = {})
renderBadge(label, type = "muted")
renderEmptyState(options)
renderErrorState(options)
showToast(message, type = "info")
openConfirmDialog(options)
```

### 42.2 Admin

```javascript
renderAdminSummaryCard(item)
renderAdminStatusBadge(status, type)
renderAdminTable({ columns, rows, actions })
renderAdminMobileCard(item, actions)
renderAdminEmptyState(options)
renderAdminErrorState(options)
renderPagination(options)
```

### 42.3 Rules

- หลีกเลี่ยง render HTML ซ้ำหลายไฟล์
- ถ้า component ใช้หลายหน้า ให้ย้ายไป helper กลาง
- ข้อมูลจากผู้ใช้ต้อง escape ก่อน render

---

## 43. Accessibility Rules for Components

ทุก component ต้องคำนึงถึง:

1. ปุ่ม icon มี aria-label
2. ภาพมี alt
3. Modal มีปุ่มปิด
4. Form มี label
5. Focus state มองเห็น
6. Badge มี label ไม่ใช้สีอย่างเดียว
7. Bottom Navigation กดง่าย
8. Card ที่กดได้ควรมี link หรือ role ที่เหมาะสม
9. Toast สำคัญควรใช้ aria-live
10. ไม่ทำ animation รบกวนผู้ใช้

---

## 44. Component Acceptance Criteria

Component จะถือว่าผ่านเมื่อ:

1. ใช้ style ตาม `DESIGN.md`
2. ใช้ class ตามเอกสารนี้
3. รองรับ mobile-first
4. ใช้ซ้ำได้มากกว่า 1 หน้าเมื่อเหมาะสม
5. ไม่มี inline style ซ้ำซ้อน
6. ไม่มี JS error เมื่อข้อมูลว่าง
7. มี fallback image/text
8. รองรับ TH/EN
9. มี Loading/Empty/Error state เมื่อเกี่ยวข้อง
10. ไม่สร้าง component ใหม่ซ้ำกับที่มีอยู่

---

## 45. Codex Instructions for Components

เมื่อใช้ Codex สร้างหรือแก้ Component ให้ยึดกติกานี้:

1. อ่าน `docs/COMPONENTS.md` และ `docs/DESIGN.md` ก่อนแก้ UI
2. ตรวจว่ามี component เดิมที่ใช้ได้หรือไม่
3. ห้ามสร้าง component ใหม่ถ้าของเดิมปรับใช้ได้
4. ใช้ class naming ตามเอกสารนี้
5. ใช้ design tokens จาก `main.css`
6. ทำ mobile-first ก่อน desktop
7. ทุก component ที่มี action ต้องมี state
8. ทุก component ที่เรียกข้อมูลต้องมี loading/empty/error
9. ทุก component ต้องไม่ทำให้หน้าอื่นพัง
10. ถ้าไม่แน่ใจ ให้ถามก่อน ไม่เดา

---

## 46. Final Component Direction

Component ของ **Takhun Trip** ต้องทำให้เว็บแอปรู้สึกเป็นระบบเดียวกันทั้งหน้า Public และ Admin

ภาพรวมที่ต้องการคือ:

```text
การ์ดสวย
ปุ่มชัด
หมวดหมู่เข้าใจง่าย
ข้อมูลอ่านเร็ว
กดนำทางได้ทันที
ใช้งานมือถือดี
ดูพรีเมี่ยมแต่ไม่ซับซ้อน
```

เป้าหมายสำคัญคือให้ Codex มีมาตรฐานกลางในการสร้าง UI และไม่สร้างส่วนประกอบใหม่แบบหลุดทิศทางของโปรเจกต์
