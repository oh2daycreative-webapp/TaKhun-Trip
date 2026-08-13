# ROUTES_AND_PAGES.md — Takhun Trip

เอกสารนี้กำหนดโครงสร้างหน้าเว็บ URL เส้นทางไฟล์ และการเชื่อมโยงหน้าต่าง ๆ ของเว็บแอป **Takhun Trip** เพื่อใช้ควบคุมการพัฒนาใน VS Code / Codex ให้สร้างหน้าเว็บได้ครบ ไม่ตั้งชื่อไฟล์ซ้ำ ไม่สร้างหน้าหลุด flow และเชื่อมโยงกับ `UI_FLOW.md`, `APP_SPEC.md`, `DESIGN.md`, `MAP_SPEC.md`, `ADMIN_CMS_SPEC.md` และ `API_SPEC.md`

---

## 1. Purpose

ไฟล์นี้มีเป้าหมายเพื่อกำหนดว่าเว็บแอป **Takhun Trip** ต้องมีหน้าอะไรบ้าง แต่ละหน้ามี URL อะไร ใช้ไฟล์ใด ใช้ JavaScript ใด ใช้ API ใด และมีหน้าที่อะไร

เอกสารนี้ช่วยป้องกันปัญหา:

- Codex สร้างชื่อไฟล์ไม่ตรงกัน
- หน้าเว็บซ้ำซ้อน
- ลิงก์ไปผิดหน้า
- ปุ่ม CTA ไม่มีปลายทาง
- Admin และ Public ใช้โครงสร้างปะปนกัน
- หน้า Detail ไม่มี query parameter ที่ชัดเจน
- ระบบ Map / Place / Route เชื่อมกันผิด

---

## 2. Route Naming Principles

### 2.1 General Rules

1. ใช้ชื่อไฟล์ lowercase
2. ใช้ kebab-case เมื่อมีหลายคำ
3. ไฟล์ public อยู่ใน `public/`
4. ไฟล์ admin อยู่ใน `public/admin/`
5. หน้ารายละเอียดใช้ query parameter เช่น `?id=BTK-001`
6. ห้ามสร้าง dynamic route แบบ framework เพราะโปรเจกต์นี้ใช้ HTML static + Vanilla JS
7. ทุกหน้าต้องมีทางกลับไปหน้าแรกหรือเมนูหลัก
8. ทุกหน้าต้องรองรับ mobile-first
9. ทุกหน้าที่โหลดข้อมูลต้องมี Loading / Empty / Error State
10. ทุกหน้าต้องใช้โทนดีไซน์ตาม `DESIGN.md`

### 2.2 Query Parameter Rules

ใช้รูปแบบนี้เป็นมาตรฐาน:

| Purpose | Parameter | Example |
|---|---|---|
| รายละเอียดสถานที่ | `id` | `place-detail.html?id=BTK-001` |
| รายละเอียดเส้นทาง | `id` | `route-detail.html?id=ROUTE-001` |
| รายละเอียดสินค้า | `id` | `product-detail.html?id=PROD-001` |
| รายละเอียดกิจกรรม | `id` | `event-detail.html?id=EVT-001` |
| โฟกัสสถานที่บนแผนที่ | `focus` | `map.html?focus=BTK-004` |
| แสดงเส้นทางบนแผนที่ | `route` | `map.html?route=ROUTE-001` |
| กรองหมวดหมู่ | `category` | `places.html?category=nature` |
| กรองอำเภอ | `district` | `places.html?district=ban_ta_khun` |
| ภาษา | `lang` | `index.html?lang=en` |

---

## 3. Public Page Structure

```text
public/
├── index.html
├── map.html
├── routes.html
├── route-detail.html
├── places.html
├── place-detail.html
├── trip-planner.html
├── products.html
├── product-detail.html
├── events.html
├── event-detail.html
├── gallery.html
├── favorites.html
├── search.html
├── about.html
└── 404.html
```

---

## 4. Admin Page Structure

```text
public/admin/
├── login.html
├── dashboard.html
├── places.html
├── routes.html
├── products.html
├── events.html
├── reviews.html
├── gallery.html
├── settings.html
└── 404.html
```

---

## 5. Public Pages

## 5.1 Home Page

### File

```text
public/index.html
```

### URL

```text
/
index.html
```

### Purpose

หน้าแรกของเว็บแอป ใช้แนะนำภาพรวมของ **Takhun Trip** และเป็นจุดเริ่มต้นไปยังแผนที่ เส้นทาง สถานที่ Trip Planner สินค้าชุมชน และกิจกรรม

### Main Sections

1. Header
2. Hero Section
3. Search Bar
4. Quick Actions
5. Main Route 4 Points
6. Featured Places
7. Trip Planner CTA
8. Community Products Preview
9. Upcoming Events Preview
10. Gallery Preview
11. Footer
12. Mobile Bottom Navigation

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/app.js
```

### Main API

```text
getSettings
getHomeData
```

### Main CTAs

| Button | Destination |
|---|---|
| สำรวจแผนที่ | `map.html` |
| วางแผนทริป | `trip-planner.html` |
| ดูเส้นทาง | `routes.html` |
| ดูสถานที่ทั้งหมด | `places.html` |
| ดูของดีชุมชน | `products.html` |
| ดูกิจกรรม | `events.html` |

---

## 5.2 Map Page

### File

```text
public/map.html
```

### URL

```text
map.html
map.html?focus={place_id}
map.html?route={route_id}
map.html?category={category}
map.html?district={district}
```

### Purpose

หน้าแผนที่ท่องเที่ยว แสดงหมุดสถานที่ท่องเที่ยว เส้นทางหลัก 4 จุด และสถานที่ใกล้เคียง

### Required Sections

1. Map Header
2. Search Bar
3. Filter Chips
4. Map Canvas
5. Floating Controls
6. Bottom Place Preview Card
7. Map Legend
8. Loading / Empty / Error State

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/map.js
```

### Required CSS

```text
public/css/main.css
public/css/components.css
public/css/map.css
```

ถ้าไม่มี `map.css` ให้รวม style ไว้ใน `components.css` หรือ `main.css`

### Main API

```text
getMapPlaces
getPlaceDetail
getRouteDetail
```

### Query Behavior

| URL | Behavior |
|---|---|
| `map.html` | แสดงหมุดทั้งหมดที่มีพิกัด |
| `map.html?focus=BTK-004` | zoom ไปยังสถานที่นั้น |
| `map.html?route=ROUTE-001` | แสดงเส้นทางนั้น |
| `map.html?category=nature` | กรองหมวดธรรมชาติ |
| `map.html?district=ban_ta_khun` | กรองอำเภอบ้านตาขุน |

### Important Rules

- ใช้ Leaflet + OpenStreetMap
- ปุ่มนำทางใช้ `google_maps_url` ก่อน `lat/lng`
- แสดงเฉพาะสถานที่ที่มีพิกัดบนแผนที่
- จุดหลัก 4 จุดต้องมีเลขลำดับ
- เส้นทางหลักต้องเรียง `BTK-001 → BTK-002 → BTK-003 → BTK-004`

---

## 5.3 Routes Page

### File

```text
public/routes.html
```

### URL

```text
routes.html
routes.html?style={travel_style}
```

### Purpose

แสดงรายการเส้นทางท่องเที่ยว เช่น เส้นทางหลักบ้านตาขุน 4 จุด และเส้นทางแนะนำอื่น ๆ

### Required Sections

1. Page Header
2. Route Filter
3. Featured Route Card
4. Route List
5. Empty State
6. CTA ไป Trip Planner

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/routes.js
```

### Main API

```text
getRoutes
```

### CTA Links

| Action | Destination |
|---|---|
| กดเส้นทาง | `route-detail.html?id={route_id}` |
| เปิดบนแผนที่ | `map.html?route={route_id}` |
| เพิ่มลงทริป | `trip-planner.html?from_route={route_id}` |

---

## 5.4 Route Detail Page

### File

```text
public/route-detail.html
```

### URL

```text
route-detail.html?id={route_id}
```

### Purpose

แสดงรายละเอียดเส้นทางท่องเที่ยว พร้อม Timeline และสถานที่ในเส้นทาง

### Required Sections

1. Hero Route
2. Route Summary
3. Route Timeline
4. Place Cards ตามลำดับ
5. Map Preview หรือปุ่มเปิดแผนที่
6. Share CTA
7. Add to Trip Planner CTA

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/routes.js
```

### Main API

```text
getRouteDetail
```

### Required Query

| Parameter | Required | Example |
|---|---:|---|
| `id` | yes | `ROUTE-001` |

### CTA Links

| Action | Destination |
|---|---|
| เปิดบนแผนที่ | `map.html?route={route_id}` |
| ดูสถานที่ | `place-detail.html?id={place_id}` |
| เพิ่มทั้งหมดในทริป | `trip-planner.html?from_route={route_id}` |
| แชร์ | Web Share API / Copy Link |

---

## 5.5 Places Page

### File

```text
public/places.html
```

### URL

```text
places.html
places.html?district={district}
places.html?category={category}
places.html?route_group={route_group}
places.html?keyword={keyword}
```

### Purpose

แสดงรายการสถานที่ท่องเที่ยวทั้งหมด

### Required Sections

1. Page Header
2. Search Bar
3. Filter by District
4. Filter by Category
5. Filter by Route Group
6. Place Card Grid/List
7. Empty State
8. Pagination หรือ Load More

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/places.js
```

### Main API

```text
getPlaces
```

### CTA Links

| Action | Destination |
|---|---|
| กดสถานที่ | `place-detail.html?id={place_id}` |
| ดูบนแผนที่ | `map.html?focus={place_id}` |
| นำทาง | เปิด Google Maps |
| บันทึก | Local Storage |

---

## 5.6 Place Detail Page

### File

```text
public/place-detail.html
```

### URL

```text
place-detail.html?id={place_id}
```

### Purpose

แสดงรายละเอียดสถานที่ท่องเที่ยวแบบครบถ้วน

### Required Sections

1. Hero Image
2. Back / Favorite / Share Buttons
3. Place Title
4. Category / District / Route Group Badge
5. Review Summary
6. CTA Buttons: นำทาง / โทร / แชร์
7. Description
8. Activities
9. Gallery
10. Map Preview หรือปุ่มเปิดแผนที่
11. Nearby Places
12. Reviews
13. Review Form

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/places.js
public/js/reviews.js
```

### Main API

```text
getPlaceDetail
getReviews
submitReview
```

### Required Query

| Parameter | Required | Example |
|---|---:|---|
| `id` | yes | `BTK-001` |

### CTA Links

| Action | Destination |
|---|---|
| ดูบนแผนที่ | `map.html?focus={place_id}` |
| นำทาง | Google Maps URL |
| โทร | `tel:{phone}` |
| แชร์ | Web Share API / Copy Link |
| เพิ่มลงทริป | `trip-planner.html?add={place_id}` |
| ดูสถานที่ใกล้เคียง | `place-detail.html?id={nearby_place_id}` |

---

## 5.7 Trip Planner Page

### File

```text
public/trip-planner.html
```

### URL

```text
trip-planner.html
trip-planner.html?from_route={route_id}
trip-planner.html?add={place_id}
```

### Purpose

ให้ผู้ใช้วางแผนทริปแบบง่าย โดยเลือกเวลา สไตล์ และสถานที่ที่สนใจ

### Required Sections

1. Page Header
2. Step 1: เลือกระยะเวลา
3. Step 2: เลือกสไตล์
4. Step 3: แผนทริปแนะนำ
5. Selected Places
6. Save Plan
7. Share Plan
8. Open in Map

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/trip-planner.js
```

### Main API

```text
getTripTemplates
getPlaceDetail
getRouteDetail
```

### Local Storage

```text
TAKHUN_TRIP_PLAN
```

### Query Behavior

| URL | Behavior |
|---|---|
| `trip-planner.html` | เริ่มวางแผนใหม่ |
| `trip-planner.html?from_route=ROUTE-001` | โหลดสถานที่จากเส้นทาง |
| `trip-planner.html?add=BTK-004` | เพิ่มสถานที่นั้นในแผน |

### CTA Links

| Action | Destination |
|---|---|
| เปิดแผนที่ | `map.html?route={route_id}` หรือ focus สถานที่แรก |
| ดูสถานที่ | `place-detail.html?id={place_id}` |
| แชร์แผน | Web Share API / Copy Link |

---

## 5.8 Products Page

### File

```text
public/products.html
```

### URL

```text
products.html
products.html?category={category}
products.html?related_place_id={place_id}
products.html?district={district}
```

### Purpose

แสดงสินค้าและบริการชุมชน

### Required Sections

1. Page Header
2. Category Filter
3. Featured Products
4. Product Card Grid/List
5. Empty State

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/products.js
```

### Main API

```text
getProducts
```

### CTA Links

| Action | Destination |
|---|---|
| กดสินค้า | `product-detail.html?id={product_id}` |
| ติดต่อ | contact URL หรือ tel |
| ดูสถานที่เกี่ยวข้อง | `place-detail.html?id={related_place_id}` |

---

## 5.9 Product Detail Page

### File

```text
public/product-detail.html
```

### URL

```text
product-detail.html?id={product_id}
```

### Purpose

แสดงรายละเอียดสินค้า/บริการชุมชน

### Required Sections

1. Product Image
2. Product Title
3. Category Badge
4. Producer Name
5. Description
6. Price Range
7. Contact Buttons
8. Related Place
9. Related Products

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/products.js
```

### Main API

```text
getProductDetail
```

### Required Query

| Parameter | Required | Example |
|---|---:|---|
| `id` | yes | `PROD-001` |

### CTA Links

| Action | Destination |
|---|---|
| โทร | `tel:{phone}` |
| ติดต่อ | `contact_url` |
| นำทาง | Google Maps |
| ดูสถานที่เกี่ยวข้อง | `place-detail.html?id={related_place_id}` |

---

## 5.10 Events Page

### File

```text
public/events.html
```

### URL

```text
events.html
events.html?status=upcoming
events.html?type={event_type}
events.html?month=2026-08
```

### Purpose

แสดงกิจกรรมและเทศกาล

### Required Sections

1. Page Header
2. Event Filter
3. Upcoming Events
4. Past Events
5. Empty State

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/events.js
```

### Main API

```text
getEvents
```

### CTA Links

| Action | Destination |
|---|---|
| กดกิจกรรม | `event-detail.html?id={event_id}` |
| นำทาง | Google Maps |
| ลงทะเบียน/สนใจ | register URL |

---

## 5.11 Event Detail Page

### File

```text
public/event-detail.html
```

### URL

```text
event-detail.html?id={event_id}
```

### Purpose

แสดงรายละเอียดกิจกรรม

### Required Sections

1. Event Hero Image
2. Event Title
3. Date / Time Badge
4. Location
5. Description
6. Contact Info
7. Register / Interested Button
8. Map / Navigation
9. Related Place ถ้ามี

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/events.js
```

### Main API

```text
getEventDetail
```

### Required Query

| Parameter | Required | Example |
|---|---:|---|
| `id` | yes | `EVT-001` |

### CTA Links

| Action | Destination |
|---|---|
| นำทาง | Google Maps |
| โทร | `tel:{contact_phone}` |
| สนใจเข้าร่วม | `register_url` |
| สถานที่เกี่ยวข้อง | `place-detail.html?id={related_place_id}` |

---

## 5.12 Gallery Page

### File

```text
public/gallery.html
```

### URL

```text
gallery.html
gallery.html?category={category}
gallery.html?media_type=image
gallery.html?related_place_id={place_id}
```

### Purpose

แสดงภาพและวิดีโอของสถานที่ เส้นทาง กิจกรรม สินค้า และชุมชน

### Required Sections

1. Page Header
2. Category Filter
3. Image/Video Grid
4. Lightbox
5. Empty State

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/gallery.js
```

### Main API

```text
getGallery
```

### CTA Links

| Action | Destination |
|---|---|
| กดภาพ | เปิด Lightbox |
| กดวิดีโอ | เปิด YouTube Embed หรือ URL |
| ดูสถานที่เกี่ยวข้อง | `place-detail.html?id={related_place_id}` |

---

## 5.13 Favorites Page

### File

```text
public/favorites.html
```

### URL

```text
favorites.html
```

### Purpose

แสดงสถานที่ที่ผู้ใช้บันทึกไว้ในเครื่อง

### Required Sections

1. Page Header
2. Favorite Place Cards
3. Empty State
4. Clear Favorites Button
5. Add to Trip Planner CTA

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/favorites.js
```

### Main Data Source

```text
Local Storage: TAKHUN_FAVORITES
API: getPlaceDetail หรือ getPlaces
```

### CTA Links

| Action | Destination |
|---|---|
| ดูรายละเอียด | `place-detail.html?id={place_id}` |
| ดูบนแผนที่ | `map.html?focus={place_id}` |
| เพิ่มลงทริป | `trip-planner.html?add={place_id}` |
| ลบออก | Update Local Storage |

---

## 5.14 Search Page

### File

```text
public/search.html
```

### URL

```text
search.html?q={keyword}
```

### Purpose

ค้นหารวมจากสถานที่ เส้นทาง สินค้า และกิจกรรม

### Required Sections

1. Search Input
2. Result Tabs หรือ Grouped Results
3. Place Results
4. Route Results
5. Product Results
6. Event Results
7. Empty State

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/search.js
```

### Main API

```text
searchAll
```

### CTA Links

| Result Type | Destination |
|---|---|
| place | `place-detail.html?id={place_id}` |
| route | `route-detail.html?id={route_id}` |
| product | `product-detail.html?id={product_id}` |
| event | `event-detail.html?id={event_id}` |

### MVP Note

ถ้าต้องการลดขอบเขตในรุ่นแรก สามารถยังไม่ทำ `search.html` แยกได้ และใช้ Search เฉพาะในแต่ละหน้าแทน แต่ควรเตรียม path นี้ไว้ในโครงสร้าง

---

## 5.15 About Page

### File

```text
public/about.html
```

### URL

```text
about.html
```

### Purpose

แสดงข้อมูลเกี่ยวกับโครงการ Takhun Trip วัตถุประสงค์ และช่องทางติดต่อ

### Required Sections

1. Project Overview
2. Tourism Vision
3. Contact Information
4. Social Links
5. Partner / Community Information ถ้ามี

### Required JS

```text
public/js/config.js
public/js/api.js
public/js/i18n.js
public/js/app.js
```

### Main API

```text
getSettings
```

### CTA Links

| Action | Destination |
|---|---|
| ส่งอีเมล | `mailto:{main_email}` |
| โทร | `tel:{main_phone}` |
| Facebook | `facebook_url` |
| LINE | `line_url` |

---

## 5.16 Public 404 Page

### File

```text
public/404.html
```

### Purpose

แสดงเมื่อไม่พบหน้าเว็บ

### Required Copy

```text
ไม่พบหน้าที่คุณต้องการ
กลับไปหน้าแรก หรือสำรวจแผนที่ท่องเที่ยวบ้านตาขุน
```

### CTA

| Button | Destination |
|---|---|
| กลับหน้าแรก | `index.html` |
| สำรวจแผนที่ | `map.html` |

---

## 6. Admin Pages

## 6.1 Admin Login Page

### File

```text
public/admin/login.html
```

### URL

```text
admin/login.html
```

### Purpose

หน้าเข้าสู่ระบบผู้ดูแล

### Required Sections

1. Logo / App Name
2. Login Form
3. Error Message
4. Loading State

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
```

### Main API

```text
adminLogin
```

### Success Destination

```text
admin/dashboard.html
```

---

## 6.2 Admin Dashboard Page

### File

```text
public/admin/dashboard.html
```

### URL

```text
admin/dashboard.html
```

### Purpose

แสดงภาพรวมระบบและปุ่มลัดจัดการข้อมูล

### Required Sections

1. Admin Header
2. Sidebar / Mobile Drawer
3. Summary Cards
4. Pending Reviews
5. Upcoming Events
6. Quick Actions

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-dashboard.js
```

### Main API

```text
adminGetDashboard
```

---

## 6.3 Admin Places Page

### Files and page ownership

```text
public/admin/places.html
public/admin/place-edit.html
```

`places.html` owns only the list, search, category/status filters, pagination, and navigation to Create/Edit/read-only detail. It does not contain the Place form, map, media selector, or lifecycle/conflict dialogs.

`place-edit.html` owns Create, Edit, reviewer/viewer read-only detail, the map picker, manifest-backed Hero/Gallery presentation and selection, and the lifecycle, dependency, unsaved-change, and conflict UX.

### URL

```text
admin/places.html
admin/place-edit.html
admin/place-edit.html?place_id={canonical_place_id}
```

The bare editor URL is Create. The single bounded `place_id` query is Edit/read-only detail. `?edit=`, alternate `?id=`, duplicate or extra parameters, fragments, arbitrary query preservation, traversal, credentials, and authentication material are not compatibility aliases. Invalid Place Edit intent falls back safely to `admin/places.html`; authentication return preserves only the two canonical editor forms.

### Purpose

จัดการข้อมูลสถานที่ท่องเที่ยวด้วย lifecycle `draft` / `published` / `archived` โดยแยก working Draft Revision ออกจาก Published snapshot

### Required Sections

`places.html`:

1. Page Header and Add Place navigation
2. Search / category / status filters
3. Pagination
4. Places Table / Mobile Cards
5. Loading / empty / safe error states

`place-edit.html`:

1. Create/Edit identity and semantic editable form for authorized writers
2. Semantic read-only detail for `reviewer` and `viewer`
3. Map picker with manual coordinate alternative and no geolocation
4. Derived same-Place Hero and ordered same-Place Gallery selector
5. Save/Publish and capability-authorized lifecycle controls
6. Advisory dependency preview and locked Archive-result reconciliation
7. Unsaved-change, conflict, confirmation, validation, and safe error dialogs/status

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-places.js
public/admin/js/admin-place-edit.js
public/admin/js/admin-place-map.js
public/admin/js/admin-place-media.js
```

### M7 Place-specific routed actions

```text
adminGetPlaces
adminGetPlaceDetail
adminCreatePlace
adminSavePlaceDraft
adminPublishPlace
adminInspectPlaceDependencies
adminUnpublishPlace
adminArchivePlace
adminRestorePlace
adminGetPlaceMediaOptions
```

These are exactly the ten M7 Place-specific POST actions, not the entire global Router action set. Legacy Place action names are not M7 aliases. Browser presentation never grants authority: `super_admin` and `editor` receive write controls only as allowed by the server-projected capabilities and lifecycle; `reviewer` and `viewer` receive read-only UX; the server validates the session, role, lifecycle, and version on every operation.

### Public Preview

```text
../place-detail.html?id={place_id}
```

---

## 6.4 Admin Routes Page

### File

```text
public/admin/routes.html
```

### URL

```text
admin/routes.html
admin/routes.html?edit={route_id}
```

### Purpose

จัดการเส้นทางท่องเที่ยวและลำดับสถานที่ในเส้นทาง

### Required Sections

1. Route List
2. Add Route Button
3. Route Form
4. Ordered Place Selector
5. Status Control
6. Preview Button

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-routes.js
```

### Main API

```text
adminGetRoutes
createRoute
updateRoute
deleteRoute
adminGetPlaces
```

### Public Preview

```text
../route-detail.html?id={route_id}
```

---

## 6.5 Admin Products Page

### File

```text
public/admin/products.html
```

### URL

```text
admin/products.html
admin/products.html?edit={product_id}
```

### Purpose

จัดการสินค้าและบริการชุมชน

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-products.js
```

### Main API

```text
adminGetProducts
createProduct
updateProduct
deleteProduct
adminGetPlaces
```

### Public Preview

```text
../product-detail.html?id={product_id}
```

---

## 6.6 Admin Events Page

### File

```text
public/admin/events.html
```

### URL

```text
admin/events.html
admin/events.html?edit={event_id}
```

### Purpose

จัดการกิจกรรมและปฏิทินกิจกรรม

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-events.js
```

### Main API

```text
adminGetEvents
createEvent
updateEvent
deleteEvent
adminGetPlaces
```

### Public Preview

```text
../event-detail.html?id={event_id}
```

---

## 6.7 Admin Reviews Page

### File

```text
public/admin/reviews.html
```

### URL

```text
admin/reviews.html
admin/reviews.html?status=pending
```

### Purpose

ตรวจสอบ อนุมัติ ซ่อน หรือลบรีวิว

### Required Sections

1. Review Tabs
2. Review List
3. Review Detail
4. Approve / Hide / Delete Buttons
5. Confirm Dialog

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-reviews.js
```

### Main API

```text
adminGetReviews
approveReview
hideReview
deleteReview
```

---

## 6.8 Admin Gallery Page

### File

```text
public/admin/gallery.html
```

### URL

```text
admin/gallery.html
admin/gallery.html?edit={media_id}
```

### Purpose

จัดการรูปภาพและวิดีโอ

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-gallery.js
```

### Main API

```text
adminGetGallery
createGalleryItem
updateGalleryItem
deleteGalleryItem
adminGetPlaces
```

---

## 6.9 Admin Settings Page

### File

```text
public/admin/settings.html
```

### URL

```text
admin/settings.html
```

### Purpose

จัดการค่าตั้งค่าระบบ เช่น ชื่อเว็บ สโลแกน โลโก้ Hero Image และช่องทางติดต่อ

### Required JS

```text
public/js/config.js
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/admin/js/admin-settings.js
```

### Main API

```text
adminGetSettings
updateSettings
```

---

## 6.10 Admin 404 Page

### File

```text
public/admin/404.html
```

### Purpose

แสดงเมื่อไม่พบหน้า Admin

### CTA

| Button | Destination |
|---|---|
| กลับ Dashboard | `dashboard.html` |
| ออกจากระบบ | `login.html` |

---

## 7. Shared Layout Components

## 7.1 Public Header

ใช้ในทุกหน้า Public

### Required Elements

- Logo / App Name
- Main Menu
- Search Icon
- Language Switcher
- Mobile Menu Button

### Pages

ทุกหน้าใน `public/*.html` ยกเว้นอาจลดรูปใน `map.html`

---

## 7.2 Public Bottom Navigation

ใช้บนมือถือ

### Items

| Label | Link |
|---|---|
| หน้าแรก | `index.html` |
| แผนที่ | `map.html` |
| วางแผน | `trip-planner.html` |
| บันทึกไว้ | `favorites.html` |
| เพิ่มเติม | เปิด More Menu |

---

## 7.3 More Menu

บนมือถือ เมนู “เพิ่มเติม” ควรมี:

| Label | Link |
|---|---|
| เส้นทาง | `routes.html` |
| สถานที่ | `places.html` |
| สินค้าและชุมชน | `products.html` |
| กิจกรรม | `events.html` |
| แกลเลอรี | `gallery.html` |
| เกี่ยวกับเรา | `about.html` |
| เปลี่ยนภาษา | action |

---

## 7.4 Admin Layout

ใช้ในทุกหน้า Admin ยกเว้น Login

### Required Elements

- Admin Header
- Sidebar / Drawer
- Page Title
- User Info
- Logout Button
- Toast Container
- Confirm Dialog

---

## 8. Global JavaScript Files

## 8.1 `config.js`

### Path

```text
public/js/config.js
```

### Purpose

เก็บค่าตั้งค่าฝั่ง Frontend

### Contains

```javascript
const APP_CONFIG = {
  API_URL: "",
  SITE_URL: "https://takhun-trip.pages.dev",
  DEFAULT_LANG: "th"
};
```

---

## 8.2 `api.js`

### Path

```text
public/js/api.js
```

### Purpose

Public API helper

### Used By

- index.html
- map.html
- routes.html
- route-detail.html
- places.html
- place-detail.html
- trip-planner.html
- products.html
- product-detail.html
- events.html
- event-detail.html
- gallery.html
- favorites.html
- search.html
- about.html

---

## 8.3 `i18n.js`

### Path

```text
public/js/i18n.js
```

### Purpose

จัดการภาษาไทย/อังกฤษ

### Used By

ทุกหน้า Public และอาจใช้บางส่วนใน Admin

---

## 8.4 `app.js`

### Path

```text
public/js/app.js
```

### Purpose

จัดการ global UI เช่น header, mobile menu, language switcher, toast, share helper

---

## 9. Admin JavaScript Files

## 9.1 `admin-api.js`

### Path

```text
public/admin/js/admin-api.js
```

### Purpose

Admin API helper

### Used By

ทุกหน้า Admin

---

## 9.2 `admin-auth.js`

### Path

```text
public/admin/js/admin-auth.js
```

### Purpose

จัดการ session, login, logout และการป้องกันหน้า Admin

### Used By

ทุกหน้า Admin

---

## 10. CSS Files

## 10.1 `main.css`

### Path

```text
public/css/main.css
```

### Purpose

Design tokens, typography, layout หลัก

---

## 10.2 `components.css`

### Path

```text
public/css/components.css
```

### Purpose

ปุ่ม การ์ด badge toast modal empty state loading state

---

## 10.3 `mobile.css`

### Path

```text
public/css/mobile.css
```

### Purpose

Responsive rules และ mobile-specific layout

---

## 10.4 `admin.css`

### Path

```text
public/css/admin.css
```

### Purpose

Admin layout, table, form, dashboard card, sidebar

---

## 10.5 `map.css`

### Path

```text
public/css/map.css
```

### Purpose

Map page, filter chips, marker preview, bottom sheet, map controls

### Note

ถ้าไม่ต้องการแยกไฟล์เพิ่ม สามารถรวมใน `components.css` ได้ แต่สำหรับโปรเจกต์นี้แนะนำให้แยก `map.css` เพราะระบบแผนที่เป็นหัวใจหลัก

---

## 11. Page Metadata

### 11.1 Public Page Titles

| Page | Title |
|---|---|
| index.html | `Takhun Trip | เที่ยวตาขุน ครบในทริปเดียว` |
| map.html | `แผนที่ท่องเที่ยวบ้านตาขุน | Takhun Trip` |
| routes.html | `เส้นทางท่องเที่ยว | Takhun Trip` |
| route-detail.html | `{route_name} | Takhun Trip` |
| places.html | `สถานที่ท่องเที่ยว | Takhun Trip` |
| place-detail.html | `{place_name} | Takhun Trip` |
| trip-planner.html | `วางแผนทริป | Takhun Trip` |
| products.html | `สินค้าและชุมชน | Takhun Trip` |
| product-detail.html | `{product_name} | Takhun Trip` |
| events.html | `กิจกรรมและเทศกาล | Takhun Trip` |
| event-detail.html | `{event_title} | Takhun Trip` |
| gallery.html | `แกลเลอรี | Takhun Trip` |
| favorites.html | `รายการโปรด | Takhun Trip` |
| about.html | `เกี่ยวกับ Takhun Trip` |

---

## 12. Route Access Rules

### 12.1 Public Pages

เปิดได้ทุกคน ไม่ต้อง login

### 12.2 Admin Pages

ต้อง login ก่อน ยกเว้น:

```text
admin/login.html
```

### 12.3 If Not Logged In

ถ้าเปิดหน้า Admin อื่นโดยยังไม่ได้ login:

```text
redirect → admin/login.html
```

### 12.4 If Logged In and Open Login Page

ถ้า login อยู่แล้วและเปิด `admin/login.html`:

```text
redirect → admin/dashboard.html
```

---

## 13. Error and Missing ID Rules

### 13.1 Detail Page Missing ID

ถ้าหน้า detail ไม่มี `id` เช่น:

```text
place-detail.html
```

ให้แสดง Error State:

```text
ไม่พบรหัสข้อมูลที่ต้องการแสดง
```

พร้อมปุ่ม:

```text
กลับไปหน้ารายการ
```

### 13.2 Detail Page ID Not Found

ถ้า API ส่ง `NOT_FOUND`:

```text
ไม่พบข้อมูลนี้ หรือข้อมูลอาจถูกซ่อนจากระบบ
```

### 13.3 Admin Edit ID Not Found

ถ้าเปิด `admin/place-edit.html?place_id=BTK-999` ด้วย canonical Place ID แล้ว API ส่ง `NOT_FOUND`:

```text
ไม่พบข้อมูลที่ต้องการแก้ไข
```

หน้าต้องคง safe error state และให้กลับ `admin/places.html` ได้ โดยไม่เปิด form Create โดยบังเอิญ หาก URL ไม่ตรง canonical grammar ตั้งแต่แรก ให้ใช้ bounded fallback ไป `admin/places.html` และห้ามส่ง query ที่ไม่อนุญาตต่อไปยัง login/return flow

---

## 14. Required Link Matrix

| From | Action | To |
|---|---|---|
| `index.html` | สำรวจแผนที่ | `map.html` |
| `index.html` | วางแผนทริป | `trip-planner.html` |
| `index.html` | ดูเส้นทาง | `routes.html` |
| `index.html` | ดูสถานที่ | `places.html` |
| `index.html` | ดูสินค้า | `products.html` |
| `index.html` | ดูกิจกรรม | `events.html` |
| `map.html` | ดูรายละเอียด | `place-detail.html?id={place_id}` |
| `map.html` | นำทาง | Google Maps |
| `routes.html` | ดูเส้นทาง | `route-detail.html?id={route_id}` |
| `route-detail.html` | เปิดแผนที่ | `map.html?route={route_id}` |
| `route-detail.html` | ดูสถานที่ | `place-detail.html?id={place_id}` |
| `route-detail.html` | เพิ่มลงทริป | `trip-planner.html?from_route={route_id}` |
| `places.html` | ดูรายละเอียด | `place-detail.html?id={place_id}` |
| `place-detail.html` | เปิดแผนที่ | `map.html?focus={place_id}` |
| `place-detail.html` | เพิ่มลงทริป | `trip-planner.html?add={place_id}` |
| `place-detail.html` | ดูสินค้าเกี่ยวข้อง | `products.html?related_place_id={place_id}` |
| `products.html` | ดูสินค้า | `product-detail.html?id={product_id}` |
| `product-detail.html` | ดูสถานที่เกี่ยวข้อง | `place-detail.html?id={related_place_id}` |
| `events.html` | ดูกิจกรรม | `event-detail.html?id={event_id}` |
| `event-detail.html` | ดูสถานที่เกี่ยวข้อง | `place-detail.html?id={related_place_id}` |
| `gallery.html` | ดูสถานที่เกี่ยวข้อง | `place-detail.html?id={related_place_id}` |
| `favorites.html` | ดูรายละเอียด | `place-detail.html?id={place_id}` |
| `favorites.html` | เปิดแผนที่ | `map.html?focus={place_id}` |
| `search.html` | กดผลลัพธ์สถานที่ | `place-detail.html?id={place_id}` |
| `search.html` | กดผลลัพธ์เส้นทาง | `route-detail.html?id={route_id}` |
| `search.html` | กดผลลัพธ์สินค้า | `product-detail.html?id={product_id}` |
| `search.html` | กดผลลัพธ์กิจกรรม | `event-detail.html?id={event_id}` |

---

## 15. Admin Link Matrix

| From | Action | To |
|---|---|---|
| `admin/login.html` | Login Success | `admin/dashboard.html` |
| `admin/dashboard.html` | จัดการสถานที่ | `admin/places.html` |
| `admin/dashboard.html` | จัดการเส้นทาง | `admin/routes.html` |
| `admin/dashboard.html` | จัดการสินค้า | `admin/products.html` |
| `admin/dashboard.html` | จัดการกิจกรรม | `admin/events.html` |
| `admin/dashboard.html` | จัดการรีวิว | `admin/reviews.html` |
| `admin/dashboard.html` | จัดการแกลเลอรี | `admin/gallery.html` |
| `admin/dashboard.html` | ตั้งค่า | `admin/settings.html` |
| `admin/places.html` | เพิ่มสถานที่ | `admin/place-edit.html` |
| `admin/places.html` | แก้ไข/ดูรายละเอียด | `admin/place-edit.html?place_id={canonical_place_id}` |
| `admin/place-edit.html` | กลับรายการ | `admin/places.html` |
| `admin/places.html` | Preview | `../place-detail.html?id={place_id}` |
| `admin/routes.html` | Preview | `../route-detail.html?id={route_id}` |
| `admin/products.html` | Preview | `../product-detail.html?id={product_id}` |
| `admin/events.html` | Preview | `../event-detail.html?id={event_id}` |
| any admin page | Logout | `admin/login.html` |

---

## 16. MVP Page Priority

### 16.1 Phase 1 — Required First

ต้องสร้างก่อน:

1. `index.html`
2. `map.html`
3. `places.html`
4. `place-detail.html`
5. `routes.html`
6. `route-detail.html`
7. `trip-planner.html`

### 16.2 Phase 2 — Public Support Pages

สร้างต่อ:

8. `products.html`
9. `product-detail.html`
10. `events.html`
11. `event-detail.html`
12. `gallery.html`
13. `favorites.html`
14. `about.html`

### 16.3 Phase 3 — Admin

สร้างหลัง public core:

15. `admin/login.html`
16. `admin/dashboard.html`
17. `admin/places.html`
18. `admin/place-edit.html`
19. `admin/routes.html`
20. `admin/products.html`
21. `admin/events.html`
22. `admin/reviews.html`
23. `admin/gallery.html`
24. `admin/settings.html`

### 16.4 Phase 4 — Optional

ทำภายหลังได้:

25. `search.html`
26. `404.html`
27. `admin/404.html`

---

## 17. Page Acceptance Criteria

### 17.1 Public Page Criteria

ทุกหน้า Public ต้องมี:

1. Header หรือ navigation
2. Mobile Bottom Navigation
3. Page title
4. Loading State ถ้าโหลดข้อมูล
5. Empty State ถ้าไม่มีข้อมูล
6. Error State ถ้า API ล้มเหลว
7. Responsive layout
8. Language support
9. ไม่มี console error หลัก
10. ปุ่มกลับหรือทางไปหน้าอื่น

### 17.2 Detail Page Criteria

ทุกหน้า Detail ต้องมี:

1. ตรวจ query `id`
2. โหลดข้อมูลจาก API
3. แสดง error ถ้าไม่พบ `id`
4. มี CTA ที่เกี่ยวข้อง
5. มีปุ่มแชร์ถ้าทำได้
6. มีปุ่มกลับ
7. SEO title เปลี่ยนตามข้อมูล

### 17.3 Admin Page Criteria

ทุกหน้า Admin ต้องมี:

1. ตรวจ session
2. Admin Header
3. Admin Menu
4. Loading State
5. Empty State
6. Error State
7. Toast
8. Confirm Dialog สำหรับ action สำคัญ
9. Responsive layout
10. ปุ่ม Logout

---

## 18. Codex Instructions for Routes and Pages

เมื่อใช้ Codex สร้างหรือแก้หน้าเว็บ ให้ยึดกติกานี้:

1. อ่าน `docs/ROUTES_AND_PAGES.md` ก่อนสร้างหน้าใหม่
2. ตรวจว่าหน้านั้นมี path กำหนดไว้แล้วหรือไม่
3. ใช้ชื่อไฟล์ตามเอกสารนี้เท่านั้น
4. ห้ามสร้าง route ใหม่ซ้ำซ้อน
5. ห้ามใช้ชื่อ query parameter นอกเหนือจากที่กำหนดโดยไม่จำเป็น
6. ทุกปุ่ม CTA ต้องลิงก์ตาม Link Matrix
7. ทุกหน้า detail ต้องตรวจ `id`
8. ทุกหน้า Admin ต้องตรวจ session
9. ทุกหน้า Public ต้องรองรับ mobile-first
10. ถ้าต้องเพิ่มหน้าใหม่ ให้เพิ่มในเอกสารนี้ก่อน
11. ถ้าไม่แน่ใจ ให้ถามก่อน ไม่เดา

---

## 19. Final Route Direction

โครงสร้างหน้าเว็บของ **Takhun Trip** ต้องเรียบง่ายและตรงไปตรงมา:

```text
หน้าแรก
→ แผนที่ / เส้นทาง / สถานที่ / วางแผนทริป
→ รายละเอียด
→ นำทาง / โทร / แชร์ / บันทึก
```

ฝั่ง Admin ต้องเรียบง่ายเช่นกัน:

```text
Login
→ Dashboard
→ เลือกหมวดข้อมูล
→ เพิ่ม/แก้ไข/ซ่อน/ลบ
→ ข้อมูลแสดงหน้า Public
```

เป้าหมายคือให้ผู้ใช้ไม่หลงทาง และให้ Codex ไม่สร้างไฟล์หรือ route นอกระบบที่วางไว้
