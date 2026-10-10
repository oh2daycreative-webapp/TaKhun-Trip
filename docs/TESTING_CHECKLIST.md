# TESTING_CHECKLIST.md — Takhun Trip

เอกสารนี้กำหนดรายการตรวจสอบและวิธีทดสอบเว็บแอป **Takhun Trip** เพื่อใช้ควบคุมคุณภาพก่อนสรุปว่างานเสร็จ และก่อน Deploy ขึ้น Cloudflare Pages

ใช้ไฟล์นี้ร่วมกับ:

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
docs/DEVELOPMENT_RULES.md
docs/ROUTES_AND_PAGES.md
docs/COMPONENTS.md
docs/I18N_SPEC.md
```

---

## 1. Testing Objective

เป้าหมายของการทดสอบคือทำให้มั่นใจว่าเว็บแอป **Takhun Trip**:

1. เปิดใช้งานได้จริง
2. แสดงผลถูกต้องบนมือถือ
3. หน้า Public ใช้งานได้ครบ
4. ระบบแผนที่ทำงานได้
5. ข้อมูลมาจาก Google Sheets/API
6. Admin จัดการข้อมูลได้จริง
7. ภาษาไทย/อังกฤษทำงานได้
8. ไม่มี error หลักใน Console
9. Deploy แล้วไม่พัง
10. ผู้ใช้ทั่วไปและผู้ดูแลระบบใช้งานได้โดยไม่หลงทาง

---

## 2. Testing Levels

ให้แบ่งการทดสอบออกเป็น 6 ระดับ

```text
Level 1: Static UI Test
Level 2: Responsive Test
Level 3: Public Feature Test
Level 4: API / Data Test
Level 5: Admin CMS Test
Level 6: Deployment Test
```

---

## 3. Testing Devices and Screen Sizes

### 3.1 Required Screen Sizes

ควรทดสอบอย่างน้อย:

| Device Type | Size |
|---|---|
| Small Mobile | `360 x 800` |
| iPhone-like | `390 x 844` |
| Tablet | `768 x 1024` |
| Laptop | `1366 x 768` |
| Desktop | `1920 x 1080` |

### 3.2 Browser

ควรทดสอบอย่างน้อย:

- Google Chrome
- Microsoft Edge
- Mobile Chrome
- Mobile Safari ถ้ามีอุปกรณ์

### 3.3 DevTools

ให้เปิด DevTools เพื่อตรวจ:

- Console
- Network
- Responsive mode
- Lighthouse ถ้าต้องการตรวจเพิ่มเติม

---

## 4. Pre-test Checklist

ก่อนเริ่มทดสอบ ให้ตรวจสอบ:

- [ ] รันหรือเปิดเว็บในเครื่องได้
- [ ] ตั้งค่า `APP_CONFIG.API_URL` แล้ว
- [ ] Google Apps Script Web App deploy แล้ว
- [ ] Google Sheets มีชีตตาม `DATA_SCHEMA.md`
- [ ] มีข้อมูลจุดหลัก 4 จุดในชีต `places`
- [ ] มีข้อมูลเส้นทางหลักใน `routes`
- [ ] มีข้อมูลเชื่อม route ใน `route_places`
- [ ] ไม่มีไฟล์สำคัญหาย
- [ ] ไม่มี error ตอนโหลดหน้าแรก
- [ ] เปิด DevTools Console ไว้ระหว่างทดสอบ

---

## 5. Global UI Checklist

ตรวจทุกหน้า Public และ Admin

### 5.1 Basic Layout

- [ ] หน้าเปิดได้
- [ ] ไม่มีหน้าขาว
- [ ] ไม่มีข้อความซ้อนกัน
- [ ] ไม่มีปุ่มล้นจอ
- [ ] ไม่มีรูปภาพแตก layout
- [ ] ฟอนต์อ่านง่าย
- [ ] สีตรงแนวทาง `DESIGN.md`
- [ ] ปุ่ม CTA มองเห็นชัด
- [ ] Card มี spacing เหมาะสม
- [ ] เนื้อหาไม่แน่นเกินไป

### 5.2 Navigation

- [ ] Header แสดงถูกต้อง
- [ ] Menu กดได้
- [ ] Bottom Navigation แสดงบนมือถือ
- [ ] Active menu ถูกต้อง
- [ ] More Menu เปิด/ปิดได้
- [ ] ปุ่มกลับทำงาน
- [ ] ไม่มีลิงก์ตายที่สำคัญ
- [ ] ทุกหน้ามีทางกลับหน้าแรกหรือเมนูหลัก

### 5.3 UI States

- [ ] Loading State แสดงเมื่อโหลดข้อมูล
- [ ] Empty State แสดงเมื่อไม่มีข้อมูล
- [ ] Error State แสดงเมื่อ API ล้มเหลว
- [ ] Toast แสดงเมื่อทำ action สำเร็จ/ไม่สำเร็จ
- [ ] Confirm Dialog แสดงก่อนลบ/ซ่อนข้อมูลสำคัญ

---

## 6. Responsive Checklist

### 6.1 Mobile

- [ ] เปิดได้ที่ความกว้าง 360px
- [ ] ไม่ต้อง zoom เพื่ออ่าน
- [ ] ปุ่มสูงอย่างน้อย 44px
- [ ] Bottom Navigation ไม่บังเนื้อหาสำคัญ
- [ ] Card เรียงสวยบนจอเล็ก
- [ ] Form เป็นคอลัมน์เดียว
- [ ] รูปภาพ crop เหมาะสม
- [ ] Map Preview Card ไม่บังปุ่มหลัก
- [ ] Text ไม่เล็กเกินไป
- [ ] ไม่มี horizontal scroll ที่ไม่จำเป็น

### 6.2 Tablet

- [ ] Layout ไม่ว่างเกินไป
- [ ] Card/grid ปรับคอลัมน์เหมาะสม
- [ ] Navigation ใช้งานได้
- [ ] Map แสดงพื้นที่พอดี

### 6.3 Desktop

- [ ] Container ไม่กว้างเกินไป
- [ ] Header สวยและใช้งานได้
- [ ] Grid แสดงหลายคอลัมน์เหมาะสม
- [ ] Admin table อ่านง่าย
- [ ] Form ไม่กว้างเกินจนอ่านยาก

---

## 7. Console and Network Checklist

### 7.1 Console

เปิด DevTools Console และตรวจ:

- [ ] ไม่มี JavaScript error หลัก
- [ ] ไม่มี `undefined is not a function`
- [ ] ไม่มี `Cannot read properties of null`
- [ ] ไม่มี `Cannot read properties of undefined`
- [ ] ไม่มี syntax error
- [ ] ไม่มี CORS error สำคัญ
- [ ] ไม่มี API parse error
- [ ] ไม่มี 404 ไฟล์ CSS/JS หลัก

### 7.2 Network

ตรวจ Network:

- [ ] `index.html` โหลดสำเร็จ
- [ ] CSS โหลดสำเร็จ
- [ ] JS โหลดสำเร็จ
- [ ] รูปภาพสำคัญโหลดได้
- [ ] API response เป็น JSON
- [ ] ไม่มี request สำคัญล้มเหลว
- [ ] ไม่มี redirect loop
- [ ] ไม่มีไฟล์ใหญ่เกินจำเป็นในหน้าแรก

---

## 8. Public Page Testing

## 8.1 Home Page — `index.html`

### Layout

- [ ] Hero Section แสดงถูกต้อง
- [ ] สโลแกนแสดงถูกต้อง
- [ ] CTA หลักแสดงชัดเจน
- [ ] Quick Action Cards แสดงครบ
- [ ] เส้นทางหลัก 4 จุดแสดงได้
- [ ] Featured Places แสดงได้
- [ ] Products Preview แสดงได้
- [ ] Events Preview แสดงได้
- [ ] Gallery Preview แสดงได้
- [ ] Footer แสดงได้

### Actions

- [ ] กด “สำรวจแผนที่” ไป `map.html`
- [ ] กด “วางแผนทริป” ไป `trip-planner.html`
- [ ] กด “ดูเส้นทาง” ไป `routes.html`
- [ ] กด Place Card ไป `place-detail.html?id={place_id}`
- [ ] กด Product Card ไป `product-detail.html?id={product_id}`
- [ ] กด Event Card ไป `event-detail.html?id={event_id}`

---

## 8.2 Map Page — `map.html`

### Basic

- [ ] Leaflet map แสดงผลได้
- [ ] OpenStreetMap tile โหลดได้
- [ ] โหลดข้อมูลจาก `getMapPlaces`
- [ ] หมุดแสดงเฉพาะสถานที่ที่มีพิกัด
- [ ] สถานที่ไม่มีพิกัดไม่ทำให้หน้า error
- [ ] Filter Chips แสดงได้
- [ ] Search แสดงได้
- [ ] Loading / Empty / Error State ทำงาน

### Main Route

- [ ] จุดหลัก 4 จุดแสดงได้เมื่อมีพิกัด
- [ ] หมุดจุดหลักมีเลข 1–4
- [ ] เส้นทางหลักแสดงตามลำดับ
- [ ] `BTK-001 → BTK-002 → BTK-003 → BTK-004` ถูกต้อง
- [ ] กด “เส้นทางหลัก” แล้ว fitBounds เห็นครบ

### Marker Interaction

- [ ] กดหมุดแล้วแสดง Preview Card
- [ ] Preview Card แสดงชื่อสถานที่
- [ ] Preview Card แสดงหมวดหมู่
- [ ] Preview Card มีปุ่มดูรายละเอียด
- [ ] Preview Card มีปุ่มนำทาง
- [ ] Preview Card มีปุ่มโทรถ้ามีเบอร์
- [ ] Favorite จาก Preview Card ทำงาน

### URL Query

- [ ] `map.html?focus=BTK-001` zoom ไปสถานที่
- [ ] `map.html?route=ROUTE-001` แสดง route
- [ ] `map.html?category=nature` กรองหมวด
- [ ] `map.html?district=ban_ta_khun` กรองอำเภอ

### Navigation

- [ ] ถ้ามี `google_maps_url` ปุ่มนำทางเปิด Google Maps URL
- [ ] ถ้าไม่มี `google_maps_url` แต่มี lat/lng สร้าง directions URL ได้
- [ ] ถ้าไม่มีทั้งสอง แสดง Toast แจ้งไม่มีพิกัดนำทาง

---

## 8.3 Routes Page — `routes.html`

- [ ] โหลดข้อมูลจาก `getRoutes`
- [ ] แสดงรายการเส้นทาง
- [ ] แสดงเส้นทางหลักเด่น
- [ ] Filter travel style ทำงาน ถ้ามี
- [ ] กด Route Card ไป `route-detail.html?id={route_id}`
- [ ] กดเปิดแผนที่ไป `map.html?route={route_id}`
- [ ] Empty State ทำงานเมื่อไม่มีข้อมูล

---

## 8.4 Route Detail Page — `route-detail.html?id={route_id}`

- [ ] ตรวจ query `id`
- [ ] ถ้าไม่มี `id` แสดง Error State
- [ ] โหลดข้อมูลจาก `getRouteDetail`
- [ ] แสดงชื่อเส้นทาง
- [ ] แสดงรายละเอียดเส้นทาง
- [ ] แสดงสถานที่ตามลำดับ `stop_order`
- [ ] เส้นทางหลักแสดง 4 จุดถูกลำดับ
- [ ] กดสถานที่ไป `place-detail.html?id={place_id}`
- [ ] กดเปิดแผนที่ไป `map.html?route={route_id}`
- [ ] กดเพิ่มลง Trip Planner ไป `trip-planner.html?from_route={route_id}`
- [ ] Share ทำงานหรือ fallback copy link

---

## 8.5 Places Page — `places.html`

- [ ] โหลดข้อมูลจาก `getPlaces`
- [ ] แสดง Place Cards
- [ ] Search ทำงาน
- [ ] Filter district ทำงาน
- [ ] Filter category ทำงาน
- [ ] Filter route_group ทำงาน
- [ ] กดการ์ดไป `place-detail.html?id={place_id}`
- [ ] กดดูบนแผนที่ไป `map.html?focus={place_id}`
- [ ] กดนำทางเปิด Google Maps
- [ ] Favorite ทำงาน
- [ ] Pagination หรือ Load More ทำงาน ถ้ามี
- [ ] Empty State ทำงาน

---

## 8.6 Place Detail Page — `place-detail.html?id={place_id}`

- [ ] ตรวจ query `id`
- [ ] ถ้าไม่มี `id` แสดง Error State
- [ ] โหลดข้อมูลจาก `getPlaceDetail`
- [ ] แสดง Hero Image หรือ fallback
- [ ] แสดงชื่อสถานที่
- [ ] แสดงหมวดหมู่/อำเภอ
- [ ] แสดงคำอธิบาย
- [ ] แสดงกิจกรรม
- [ ] แสดงเบอร์โทรถ้ามี
- [ ] กดโทรแล้วเปิด `tel:`
- [ ] กดนำทางแล้วเปิด Google Maps
- [ ] กดดูบนแผนที่ไป `map.html?focus={place_id}`
- [ ] กดบันทึก Favorite ได้
- [ ] Share ทำงานหรือ copy link
- [ ] Gallery แสดงได้
- [ ] Nearby Places แสดงได้ถ้ามี
- [ ] Reviews แสดงเฉพาะ approved
- [ ] Review Form ส่งรีวิวได้
- [ ] รีวิวใหม่มีสถานะ pending

---

## 8.7 Trip Planner Page — `trip-planner.html`

- [ ] หน้าเปิดได้
- [ ] เลือกระยะเวลาได้
- [ ] เลือกสไตล์การเที่ยวได้
- [ ] โหลด template จาก `getTripTemplates`
- [ ] แสดงแผนทริปแนะนำ
- [ ] บันทึกแผนลง `TAKHUN_TRIP_PLAN`
- [ ] Reload แล้วยังอ่านแผนได้
- [ ] Share Plan ทำงานหรือ copy link
- [ ] `trip-planner.html?from_route=ROUTE-001` โหลด route ได้
- [ ] `trip-planner.html?add=BTK-004` เพิ่มสถานที่ได้
- [ ] Empty State แสดงเมื่อไม่มีแผนที่ตรงเงื่อนไข

---

## 8.8 Products Page — `products.html`

- [ ] โหลดข้อมูลจาก `getProducts`
- [ ] แสดง Product Cards
- [ ] Filter category ทำงาน
- [ ] Filter related_place_id ทำงาน
- [ ] กดสินค้าไป `product-detail.html?id={product_id}`
- [ ] กดติดต่อ/โทรทำงาน
- [ ] Empty State ทำงาน

---

## 8.9 Product Detail Page — `product-detail.html?id={product_id}`

- [ ] ตรวจ query `id`
- [ ] โหลดข้อมูลจาก `getProductDetail`
- [ ] แสดงชื่อสินค้า
- [ ] แสดงรูปหรือ fallback
- [ ] แสดงกลุ่มผู้ผลิต
- [ ] แสดงรายละเอียด
- [ ] แสดงราคา หรือ “สอบถามราคา”
- [ ] กดโทรทำงาน
- [ ] กด contact_url ทำงาน
- [ ] กดดูสถานที่เกี่ยวข้องไป `place-detail.html?id={related_place_id}`

---

## 8.10 Events Page — `events.html`

- [ ] โหลดข้อมูลจาก `getEvents`
- [ ] แสดงกิจกรรมใกล้ถึง
- [ ] แสดงกิจกรรมที่ผ่านมา ถ้ามี
- [ ] Filter month ทำงาน
- [ ] Filter event_type ทำงาน
- [ ] กดกิจกรรมไป `event-detail.html?id={event_id}`
- [ ] Empty State ทำงาน

---

## 8.11 Event Detail Page — `event-detail.html?id={event_id}`

- [ ] ตรวจ query `id`
- [ ] โหลดข้อมูลจาก `getEventDetail`
- [ ] แสดงชื่อกิจกรรม
- [ ] แสดงวันที่
- [ ] แสดงเวลา
- [ ] แสดงสถานที่
- [ ] แสดงรายละเอียด
- [ ] กดนำทางทำงาน
- [ ] กดโทรทำงาน
- [ ] กด register_url ทำงานถ้ามี
- [ ] กดสถานที่เกี่ยวข้องไป `place-detail.html?id={related_place_id}`

---

## 8.12 Gallery Page — `gallery.html`

- [ ] โหลดข้อมูลจาก `getGallery`
- [ ] แสดงรูปภาพ
- [ ] แสดงวิดีโอถ้ามี
- [ ] Filter category ทำงาน
- [ ] Filter media_type ทำงาน
- [ ] กดภาพเปิด Lightbox
- [ ] กดวิดีโอเปิดได้
- [ ] Empty State ทำงาน

---

## 8.13 Favorites Page — `favorites.html`

- [ ] อ่าน `TAKHUN_FAVORITES`
- [ ] แสดงสถานที่ที่บันทึกไว้
- [ ] ลบออกจาก Favorites ได้
- [ ] Empty State แสดงเมื่อไม่มีรายการโปรด
- [ ] กดดูรายละเอียดได้
- [ ] กดดูบนแผนที่ได้
- [ ] กดเพิ่มลง Trip Planner ได้

---

## 8.14 About Page — `about.html`

- [ ] โหลด settings ได้
- [ ] แสดงข้อมูลโครงการ
- [ ] แสดงช่องทางติดต่อ
- [ ] ปุ่มโทรทำงาน
- [ ] ปุ่มอีเมลทำงาน
- [ ] Social links เปิดได้

---

## 9. i18n Testing

### 9.1 Basic Language

- [ ] ค่าเริ่มต้นเป็นภาษาไทย
- [ ] กด EN แล้ว UI เปลี่ยนเป็นอังกฤษ
- [ ] กด TH แล้ว UI กลับเป็นไทย
- [ ] Reload แล้วจำภาษาที่เลือกไว้
- [ ] `document.documentElement.lang` เปลี่ยนถูกต้อง
- [ ] ปุ่มภาษาที่ active แสดงถูกต้อง

### 9.2 UI Labels

- [ ] Header เปลี่ยนภาษา
- [ ] Bottom Navigation เปลี่ยนภาษา
- [ ] ปุ่มหลักเปลี่ยนภาษา
- [ ] Filter Chips เปลี่ยนภาษา
- [ ] Loading / Empty / Error เปลี่ยนภาษา
- [ ] Review Form เปลี่ยนภาษา
- [ ] Map UI เปลี่ยนภาษา
- [ ] Trip Planner เปลี่ยนภาษา

### 9.3 Data Fallback

- [ ] เลือก EN แล้วใช้ `name_en`
- [ ] ถ้า `name_en` ว่าง ใช้ `name_th`
- [ ] `description_en` ว่าง fallback `description_th`
- [ ] Product/Event/Route fallback ถูกต้อง
- [ ] ไม่มีข้อความ `undefined`

---

## 10. API Testing

## 10.1 Public API

ทดสอบ action ต่อไปนี้:

- [ ] `getSettings`
- [ ] `getHomeData`
- [ ] `getPlaces`
- [ ] `getPlaceDetail`
- [ ] `getMapPlaces`
- [ ] `getRoutes`
- [ ] `getRouteDetail`
- [ ] `getProducts`
- [ ] `getProductDetail`
- [ ] `getEvents`
- [ ] `getEventDetail`
- [ ] `getGallery`
- [ ] `getReviews`
- [ ] `submitReview`
- [ ] `searchAll`
- [ ] `getTripTemplates`

### 10.2 Public API Rules

- [ ] Response มี `ok`
- [ ] Success มี `data`
- [ ] Error มี `error.code` และ `error.message`
- [ ] Public API แสดงเฉพาะ `published`
- [ ] Public API ไม่แสดง `hidden`, `draft`, `deleted`
- [ ] Public API ไม่ส่ง `password_hash`
- [ ] รีวิว Public แสดงเฉพาะ `approved`
- [ ] `submitReview` บันทึกเป็น `pending`

---

## 11. Admin Testing

## 11.1 Admin Login

- [ ] เปิด `admin/login.html` ได้
- [ ] Login ด้วยข้อมูลถูกต้องได้
- [ ] Login ผิดแสดง error
- [ ] Session ถูกบันทึกใน `TAKHUN_ADMIN_SESSION`
- [ ] Login สำเร็จไป `admin/dashboard.html`
- [ ] Logout ได้
- [ ] Session หมดอายุ redirect login
- [ ] เปิดหน้า Admin โดยไม่ login ถูก redirect ไป login

---

## 11.2 Admin Dashboard

- [ ] โหลดสถิติได้
- [ ] Summary Cards แสดงถูกต้อง
- [ ] Pending Reviews แสดงได้
- [ ] Upcoming Events แสดงได้
- [ ] Quick Actions ไปหน้าถูกต้อง
- [ ] Mobile layout ใช้งานได้

---

## 11.3 Admin Places

- [ ] โหลดรายการสถานที่ได้
- [ ] Search ทำงาน
- [ ] Filter district/category/status ทำงาน
- [ ] เพิ่มสถานที่ได้
- [ ] แก้ไขสถานที่ได้
- [ ] Validate required fields
- [ ] Validate lat/lng
- [ ] Preview image URL ทำงานถ้ามี
- [ ] ซ่อนสถานที่ได้
- [ ] ลบแบบ soft delete ได้
- [ ] ข้อมูลที่เผยแพร่แสดงในหน้า Public
- [ ] ข้อมูล hidden ไม่แสดงใน Public

---

## 11.4 Admin Routes

- [ ] โหลดรายการเส้นทางได้
- [ ] เพิ่มเส้นทางได้
- [ ] แก้ไขเส้นทางได้
- [ ] เลือกสถานที่ในเส้นทางได้
- [ ] จัดลำดับสถานที่ด้วยปุ่มขึ้น/ลงได้
- [ ] เส้นทางหลักเรียง 4 จุดถูกต้อง
- [ ] ลบแบบ soft delete ได้
- [ ] Route Detail หน้า Public แสดงตามลำดับ

---

## 11.5 Admin Products

- [ ] โหลดสินค้าได้
- [ ] เพิ่มสินค้าได้
- [ ] แก้ไขสินค้าได้
- [ ] กรองหมวดได้
- [ ] ซ่อน/เผยแพร่ได้
- [ ] ลบแบบ soft delete ได้
- [ ] Public แสดงเฉพาะ published

---

## 11.6 Admin Events

- [ ] โหลดกิจกรรมได้
- [ ] เพิ่มกิจกรรมได้
- [ ] แก้ไขกิจกรรมได้
- [ ] กรองเดือน/ประเภท/สถานะได้
- [ ] ซ่อน/เผยแพร่ได้
- [ ] ลบแบบ soft delete ได้
- [ ] Public แสดงกิจกรรมถูกต้อง

---

## 11.7 Admin Reviews

- [ ] โหลดรีวิว pending ได้
- [ ] อนุมัติรีวิวได้
- [ ] ซ่อนรีวิวได้
- [ ] ลบรีวิวแบบ soft delete ได้
- [ ] Public แสดงเฉพาะ approved
- [ ] Anonymous review แสดงชื่อเป็น “นักท่องเที่ยว”
- [ ] Review comment ไม่แสดง HTML อันตราย

---

## 11.8 Admin Gallery

- [ ] โหลดแกลเลอรีได้
- [ ] manifest-approved image Create ใช้ `media_id` ที่เลือกและสร้างเป็น draft เท่านั้น
- [ ] ไม่มี arbitrary image/thumbnail/video URL, path, upload, media-type หรือ manual media ID authoring
- [ ] Preview ใช้เฉพาะ sanitized generated output/fallback และไม่ใช้ legacy URL columns
- [ ] Legacy video อ่านได้และ lifecycle-only โดยไม่มี editor, URL link/embed, duplicate หรือ Publish
- [ ] Legacy image category แสดงค่าเดิมและต้องเลือกหนึ่งในห้าหมวด canonical เพื่อซ่อมก่อน Save/Publish
- [ ] Related Place ใช้ paginated Admin Place search; ค่าเดิมที่ไม่อยู่ในผลค้นหายังคงแสดงและไม่ถูกล้างอัตโนมัติ
- [ ] Untouched related Place ไม่ถูกส่งใน Update; explicit clear/replacement ส่งค่า exact และ stale relation error ไม่ retry
- [ ] `super_admin`/`editor` เขียนได้; `reviewer`/`viewer` เรียก mutation จาก controller ไม่ได้
- [ ] uncertain Create reconciliation ใช้ marker `media_id` และ read-only Detail โดยไม่ส่ง Create ซ้ำ
- [ ] revision conflict รักษาฟอร์มและใช้ fresh read reconciliation โดยไม่มี force save/retry
- [ ] `audit_status:"unconfirmed"` แสดงเป็น successful write พร้อมคำเตือน
- [ ] label/error/live region/focus/keyboard picker/44px target/reduced motion ทำงาน
- [ ] list, filters, editor, picker, Place search, long IDs, badges และ pagination ใช้งานได้ที่ mobile width
- [ ] ลบแบบ soft delete ได้
- [ ] Public แสดงเฉพาะ published

---

## 11.9 Admin Settings

- [ ] โหลด settings ได้
- [ ] แก้ไขชื่อเว็บได้
- [ ] แก้ไขสโลแกนได้
- [ ] แก้ไขโลโก้/hero image URL ได้
- [ ] แก้ไขเบอร์โทร/อีเมลได้
- [ ] เปิด/ปิด reviews ได้ ถ้าระบบรองรับ
- [ ] เปิด/ปิด events ได้ ถ้าระบบรองรับ
- [ ] Public อ่าน settings ล่าสุดได้

---

## 12. Admin Responsive Testing

- [ ] หน้า Login ใช้ได้บนมือถือ
- [ ] Dashboard Cards แสดงสวยบนมือถือ
- [ ] Admin table เปลี่ยนเป็น Card List หรือใช้งานได้
- [ ] Form ไม่ล้นจอ
- [ ] ปุ่ม Save กดง่าย
- [ ] Sidebar/Drawer เปิดปิดได้
- [ ] Toast ไม่บังปุ่มสำคัญ
- [ ] Confirm Dialog ไม่ล้นจอ

---

## 13. Data Schema Testing

ตรวจ Google Sheets:

- [ ] มีชีต `places`
- [ ] มีชีต `routes`
- [ ] มีชีต `route_places`
- [ ] มีชีต `products`
- [ ] มีชีต `events`
- [ ] มีชีต `reviews`
- [ ] มีชีต `gallery`
- [ ] มีชีต `categories`
- [ ] มีชีต `settings`
- [ ] มีชีต `admins`
- [ ] มีชีต `activity_logs`
- [ ] มีชีต `trip_templates`

### Field Check

- [ ] Header field ตรงกับ `DATA_SCHEMA.md`
- [ ] ไม่มี field ชื่อผิดที่ frontend เรียกไม่ได้
- [ ] `status` ใช้ค่าตรง enum
- [ ] `place_id` ไม่ซ้ำ
- [ ] `route_id` ไม่ซ้ำ
- [ ] เบอร์โทรเป็น text
- [ ] lat/lng แปลงเป็นตัวเลขได้
- [ ] URL เปิดได้

---

## 14. Security Testing

### 14.1 Public

- [ ] Public ไม่เห็นข้อมูล Admin
- [ ] Public ไม่เห็น `password_hash`
- [ ] Public ไม่เห็นรีวิว pending
- [ ] Public ไม่เห็นข้อมูล hidden/deleted
- [ ] ข้อความรีวิวถูก escape
- [ ] ไม่มีการใช้ `eval`

### 14.2 Admin

- [ ] Admin API ไม่มี token ถูกปฏิเสธ
- [ ] Token ผิดถูกปฏิเสธ
- [ ] Session หมดอายุถูก redirect
- [ ] Delete ใช้ soft delete
- [ ] Password ไม่ถูกส่งกลับ frontend
- [ ] Input สำคัญ validate ก่อนบันทึก

---

## 15. Performance Testing

### 15.1 Public

- [ ] หน้าแรกโหลดเร็วพอสมควร
- [ ] รูปภาพไม่ใหญ่เกินไป
- [ ] ใช้ lazy loading กับรูปที่เหมาะสม
- [ ] ไม่โหลดข้อมูล Admin บน Public
- [ ] ไม่เรียก API ซ้ำเกินจำเป็น
- [ ] `getHomeData` ลด request หน้าแรกได้

### 15.2 Map

- [ ] แผนที่โหลดได้ภายในเวลายอมรับได้
- [ ] หมุดไม่ทำให้หน้าอืด
- [ ] Popup/Preview Card เปิดเร็ว
- [ ] Filter ทำงานไม่กระตุก
- [ ] รูปใน preview เป็น thumbnail หรือขนาดเหมาะสม

### 15.3 Admin

- [ ] รายการมี pagination
- [ ] Search/filter ไม่ทำให้หน้าอืด
- [ ] Save ไม่ค้างนานผิดปกติ
- [ ] Loading แสดงระหว่างรอ API

---

## 16. Accessibility Testing

- [ ] รูปภาพมี alt text
- [ ] ปุ่ม icon มี aria-label
- [ ] Form มี label
- [ ] Focus state มองเห็น
- [ ] Contrast อ่านง่าย
- [ ] ปุ่มกดง่ายบนมือถือ
- [ ] ไม่ใช้สีอย่างเดียวสื่อสถานะ
- [ ] Modal/More Menu ปิดได้
- [ ] รองรับ prefers-reduced-motion
- [ ] เมนูใช้งานด้วย keyboard ขั้นพื้นฐานได้

---

## 17. Deployment Testing

### 17.1 Before Deploy

- [ ] `git status` สะอาดหรือรู้ว่ามีไฟล์ใดเปลี่ยน
- [ ] `git diff --check` ผ่าน
- [ ] ไม่มีไฟล์ลับถูก commit
- [ ] `APP_CONFIG.API_URL` เป็น URL ที่ถูกต้อง
- [ ] ไม่มี mock data ที่ลืมเปิดทิ้งไว้ใน production
- [ ] ไม่มี console.log สำคัญที่ไม่ควรอยู่ production

### 17.2 Cloudflare Pages

- [ ] Deploy สำเร็จ
- [ ] Production URL เปิดได้
- [ ] หน้าแรกเปิดได้
- [ ] CSS/JS โหลดได้
- [ ] API เรียกได้จาก production domain
- [ ] Map โหลดได้
- [ ] Admin login ได้
- [ ] ไม่มี 404 ไฟล์สำคัญ
- [ ] Refresh หน้า detail แล้วไม่พัง

### 17.3 Production Smoke Test

หลัง deploy ให้ทดสอบอย่างน้อย:

- [ ] เปิด `https://takhun-trip.pages.dev`
- [ ] เปิด `map.html`
- [ ] เปิด `places.html`
- [ ] เปิด `place-detail.html?id=BTK-001`
- [ ] เปิด `routes.html`
- [ ] เปิด `route-detail.html?id=ROUTE-001`
- [ ] เปิด `trip-planner.html`
- [ ] เปิด `admin/login.html`
- [ ] Login admin
- [ ] แก้ไขข้อมูลทดสอบ 1 รายการ
- [ ] ตรวจว่า Public แสดงข้อมูลล่าสุด

---

## 18. Regression Testing

เมื่อแก้ระบบใดระบบหนึ่ง ให้ตรวจสิ่งที่อาจได้รับผลกระทบ

### 18.1 แก้ API

ต้องตรวจ:

- [ ] หน้าแรก
- [ ] Map
- [ ] Places
- [ ] Place Detail
- [ ] Admin ที่ใช้ API เดียวกัน
- [ ] Response format ยังเหมือนเดิม

### 18.2 แก้ Data Schema

ต้องตรวจ:

- [ ] API mapping
- [ ] Frontend render
- [ ] Admin form
- [ ] Google Sheets header
- [ ] ไม่มี field undefined

### 18.3 แก้ CSS

ต้องตรวจ:

- [ ] Mobile
- [ ] Desktop
- [ ] Header
- [ ] Bottom Navigation
- [ ] Cards
- [ ] Admin
- [ ] Map

### 18.4 แก้ i18n

ต้องตรวจ:

- [ ] TH/EN ทุกหน้าหลัก
- [ ] fallback
- [ ] Local Storage
- [ ] dynamic content re-render

### 18.5 แก้ Map

ต้องตรวจ:

- [ ] Marker
- [ ] Route line
- [ ] Filter
- [ ] Focus query
- [ ] Navigation link
- [ ] Mobile layout

---

## 19. Bug Report Template

เมื่อพบปัญหา ให้บันทึกตามรูปแบบนี้:

```text
หัวข้อปัญหา:
หน้า/ไฟล์:
ขั้นตอนที่ทำ:
ผลที่เกิดขึ้น:
ผลที่ควรเกิดขึ้น:
ข้อความ error ใน console:
ข้อมูลทดสอบ:
ภาพหน้าจอ:
ความรุนแรง:
ข้อสันนิษฐาน:
```

### Severity

| Level | Meaning |
|---|---|
| Critical | ระบบหลักใช้ไม่ได้ เช่น หน้าแรก/แผนที่/Admin login พัง |
| High | ฟังก์ชันสำคัญใช้ไม่ได้ เช่น ปุ่มนำทาง/บันทึกข้อมูล |
| Medium | ใช้งานได้แต่มีข้อผิดพลาดบางส่วน |
| Low | ปัญหาเล็ก เช่น spacing, wording, สี |

---

## 20. Final Pre-launch Checklist

ก่อนส่งมอบหรือใช้งานจริง ตรวจรายการนี้:

### Public

- [ ] หน้าแรกพร้อมใช้งาน
- [ ] แผนที่พร้อมใช้งาน
- [ ] เส้นทางหลัก 4 จุดถูกต้อง
- [ ] รายละเอียดสถานที่ถูกต้อง
- [ ] ปุ่มนำทางทำงาน
- [ ] เบอร์โทรถูกต้อง
- [ ] ภาษาไทย/อังกฤษทำงาน
- [ ] รูปภาพสำคัญแสดงได้
- [ ] ไม่มีข้อความ mock/test เหลืออยู่
- [ ] ไม่มี error console หลัก

### Admin

- [ ] Admin login ได้
- [ ] เพิ่ม/แก้ไขสถานที่ได้
- [ ] จัดการเส้นทางได้
- [ ] จัดการสินค้าได้
- [ ] จัดการกิจกรรมได้
- [ ] อนุมัติรีวิวได้
- [ ] แก้ settings ได้
- [ ] Logout ได้

### Data

- [ ] Google Sheets header ถูกต้อง
- [ ] ข้อมูลจุดหลัก 4 จุดถูกต้อง
- [ ] Google Maps URL เปิดได้
- [ ] พิกัดที่ใช้ปักหมุดผ่านการตรวจสอบ
- [ ] status ถูกต้อง
- [ ] ไม่มีข้อมูลทดสอบที่ไม่ควรเผยแพร่

### Production

- [ ] Cloudflare Pages deploy สำเร็จ
- [ ] Production URL เปิดได้
- [ ] API เชื่อมได้
- [ ] Mobile ใช้งานดี
- [ ] แชร์ลิงก์ได้
- [ ] Admin ใช้งานได้จาก production

---

## 21. Codex Instructions for Testing

เมื่อใช้ Codex ตรวจหรือแก้ bug ให้สั่งตามนี้:

```text
อ่าน docs/TESTING_CHECKLIST.md และ docs/DEVELOPMENT_RULES.md ก่อน
ตรวจปัญหานี้:
[อธิบายปัญหา]

ให้ทำ:
1. วิเคราะห์สาเหตุ
2. ระบุไฟล์ที่เกี่ยวข้อง
3. แก้เฉพาะจุดที่จำเป็น
4. ห้ามเปลี่ยน field/API/action โดยไม่จำเป็น
5. ห้ามเพิ่ม framework
6. ทดสอบตาม checklist ที่เกี่ยวข้อง
7. สรุปไฟล์ที่แก้และวิธีทดสอบ
```

---

## 22. Testing Acceptance Criteria

การทดสอบจะถือว่าผ่านเมื่อ:

1. หน้า Public หลักเปิดได้ครบ
2. ระบบแผนที่ใช้งานได้
3. เส้นทางหลัก 4 จุดถูกต้อง
4. รายละเอียดสถานที่แสดงได้
5. ปุ่มนำทาง/โทร/แชร์ทำงาน
6. Trip Planner ใช้งานได้ระดับ MVP
7. สินค้า/กิจกรรม/แกลเลอรีแสดงได้
8. รีวิวส่งแล้วเป็น pending
9. Admin login ได้
10. Admin เพิ่ม/แก้ไข/ลบแบบ soft delete ได้
11. i18n TH/EN ทำงาน
12. Responsive ผ่านมือถือ
13. ไม่มี error หลักใน console
14. Deploy production แล้วเปิดได้จริง
15. ข้อมูลหลักถูกต้องตามเอกสารแนวทางของโครงการ

---

## 23. Final Testing Direction

การทดสอบ **Takhun Trip** ต้องเน้นว่า “ผู้ใช้จริงเปิดแล้วเที่ยวได้” และ “ผู้ดูแลจริงแก้ข้อมูลได้”

ไม่ควรทดสอบแค่หน้าเว็บสวย แต่ต้องตรวจว่า:

```text
เปิดเว็บได้
เห็นข้อมูลถูกต้อง
กดแผนที่ได้
กดนำทางได้
กดโทรได้
บันทึกสถานที่ได้
ส่งรีวิวได้
Admin แก้ข้อมูลได้
ข้อมูลใหม่ขึ้นหน้า Public
มือถือใช้งานดี
ไม่มี error สำคัญ
```

เมื่อผ่าน checklist นี้แล้ว จึงค่อยถือว่าแต่ละส่วนพร้อมสำหรับใช้งานจริงหรือส่งต่อให้ Codex ทำขั้นถัดไป

---

## 24. Milestone 6 automated local verification

Task 11 is complete only when all local checks pass without contacting external services:

- CryptoService primitives and independent vectors: `node scripts/test-crypto-service.js`
- SheetService header-safe reads/writes: `node scripts/test-sheet-service.js`
- Admin schema/docs contract: `node scripts/test-admin-schema.js`
- AuthService login, sessions, random state, setup, benchmark, bootstrap, and rate limits: `node scripts/test-auth-service.js`
- Router and static Apps Script contract: `node scripts/test-apps-script.js`
- Admin API transport: `node scripts/test-admin-api.js`
- browser auth guard, safe return, logout, and Admin login: `node scripts/test-admin-auth.js`
- Admin shell/accessibility: `node scripts/test-admin-shell.js`
- public regressions, including ReviewService submission compatibility: `npm test` and `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`
- production build: `npm run build`
- JavaScript syntax for every tracked `.js` file with `node --check`
- secret scan for committed credentials, private keys, and secret-bearing logs
- changed-file allowlist against the approved Milestone 6 responsibility map
- whitespace/error-marker validation with `git diff --check`

These are deterministic local checks. They do not replace the future real Apps Script benchmark or authorize any remote setup, credential, Sheet, deployment, or staging action.

---

## 25. Future human-only Milestone 6 gates

**DO NOT PERFORM THESE MANUAL GATES UNTIL TASKS 1-11 ARE REVIEWED AND COMPLETE.** The gates are sequential; a human records each result before continuing.

### Gate A - Reviewed code and tests complete

A human confirms reviewed code, focused tests, full regression, build, syntax, security scans, and documentation are complete and approved.

### Gate B - Install reviewed backend in non-production

A human installs the reviewed backend into a **NON-PRODUCTION Apps Script environment**. Do not begin in production.

### Gate C - Create only the permanent random key

A human manually creates only `ADMIN_AUTH_RANDOM_KEY` using 32 cryptographically random bytes encoded as 43-character unpadded base64url. The value must not be printed, logged, copied into source, or included in evidence. At this point the human must not create `ADMIN_AUTH_RANDOM_COUNTER`, `ADMIN_AUTH_STATE_VERSION`, `ADMIN_BOOTSTRAP_ENABLED`, or any bootstrap credential properties.

### Gate D - Run setup

A human runs `setupAdminAuthSchema()` in the editor. Verify the random key is valid without printing it, state version is `1`, the counter is initialized and valid, required auth headers are unique, and no credentials or Admin account were created. A partial or malformed established state stops the gate; do not manually repair code-owned state.

### Gate E - Run the real PBKDF2 benchmark

A human runs `benchmarkAdminPbkdf2()` in the real non-production Apps Script V8 environment. Require one warm-up plus five measured derivations, exactly 120000 iterations, all correctness checks passing, median <= 3000 ms, max <= 5000 ms, and `passed=true`.

If ANY benchmark requirement fails: **STOP. NO bootstrap. NO manual iteration reduction.** Return to code/performance review. Local Node timing is not approval for this gate.

### Gate F - Set temporary bootstrap properties

Only after the benchmark is a PASS, a human sets temporary `ADMIN_BOOTSTRAP_ENABLED=true`, `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, optional `ADMIN_BOOTSTRAP_EMAIL`, and `ADMIN_BOOTSTRAP_PASSWORD`. Do not calculate or paste hash, salt, or iteration fields.

### Gate G - Run bootstrap once

A human runs `bootstrapFirstAdmin()` once in the editor. There is no automated retry. If it does not report success, follow the failure procedure in section 26.

### Gate H - Verify bootstrap state

A human verifies exactly one active `super_admin`; its PBKDF2 algorithm, salt, hash, and iteration fields are valid; no plaintext password exists in Sheets, logs, source, or output; all temporary credential properties are removed; `ADMIN_BOOTSTRAP_ENABLED=false`; no session row was created; and random state remains valid. Do not display secret values while verifying categories/state.

### Gate I - Deploy the backend

Only after Gate H passes, a human deploys and versions the reviewed Apps Script backend in the approved environment.

### Gate J - Verify backend compatibility

A human verifies unauthenticated `adminValidateSession` returns safe `UNAUTHORIZED` JSON with no secret details, and verifies the existing public GET API remains healthy.

### Gate K - Deploy the frontend

Only after the reviewed backend verification passes, a human deploys the reviewed static frontend.

### Gate L - Manual desktop and mobile QA

A human performs desktop and mobile login, protected-page session validation, safe navigation/return behavior, timeout/rate feedback, and logout QA. Verify logout revocation makes the old token unauthorized and the responsive shell, keyboard focus, drawer, and protected 404 remain usable.

---

## 26. Bootstrap failure recovery procedure

If `bootstrapFirstAdmin()` throws, returns failure, or cleanup cannot be verified: **STOP.** Do NOT blindly rerun `bootstrapFirstAdmin()`, do NOT deploy, do not assume there is no partial state, and do not manually alter a generated hash, salt, or iteration count.

A human must inspect only non-secret state/categories: whether an Admin row exists, whether temporary bootstrap properties remain, whether the enabled flag remains true, and whether random state, counter, and version remain valid. Do not expose secret material in output or evidence. Inspection is limited to presence and validity categories; all underlying values remain undisclosed.

During controlled recovery, manually delete any remaining `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, `ADMIN_BOOTSTRAP_EMAIL`, and `ADMIN_BOOTSTRAP_PASSWORD`. Set `ADMIN_BOOTSTRAP_ENABLED=false` if it is still true. Never edit generated `password_hash`, `password_salt`, or `password_iterations`; never reset or roll back the auth counter. Return to security/code review before any rerun is authorized.

---

## 27. Agent operation boundary

During Tasks 1-11, an agent must not access Apps Script remotely, open or edit a remote Apps Script project, read or modify Google Sheets, read or modify Script Properties, create or read credentials, create `ADMIN_AUTH_RANDOM_KEY`, run `setupAdminAuthSchema()`, run `benchmarkAdminPbkdf2()`, run `bootstrapFirstAdmin()`, deploy backend or frontend, send staging requests, push, or create a pull request.

Task 12 and Gates A-L are **HUMAN-ONLY** operations after Tasks 1-11 implementation and review are approved. Documentation of a future operation is not authorization to perform it.

## 28. M7 Admin Places local regression checklist

Run the focused Admin Place suites plus the full repository regression and build; do not rely on volatile test counts. Focused suites cover schema/migration controls, service lifecycle/authorization/concurrency/audit behavior, list/editor/map/media behavior, accessibility, and integrated M7 regressions.

- [ ] Exact M7 Place Router actions remain `adminGetPlaces`, `adminGetPlaceDetail`, `adminCreatePlace`, `adminSavePlaceDraft`, `adminPublishPlace`, `adminInspectPlaceDependencies`, `adminUnpublishPlace`, `adminArchivePlace`, `adminRestorePlace`, and `adminGetPlaceMediaOptions`; no legacy alias, dynamic dispatch, or unrelated global action is admitted by this Place-specific set.
- [ ] All four roles: `super_admin`/`editor` can write only when lifecycle permits; fabricated reviewer/viewer writes return `FORBIDDEN`; server authorization is independent of visible controls.
- [ ] Create → draft, Draft Save, Publish, Unpublish → draft, Archive from draft/published → archived, Restore → draft only; `published_with_draft` is display-only.
- [ ] New Draft and published-working Draft isolation: Public Places, Detail, Map, Home, Search, Route Detail, Trip Templates, Product Detail, Event Detail, and Reviews retain published data until Publish; drafts, unpublished, and archived content do not leak.
- [ ] `expected_version` stale writes return `CONFLICT`, write nothing, and create no success audit; no force save, automatic retry, or auto merge. Conflict UI keeps edits and reloads latest only by explicit action.
- [ ] Dependency preview lists routes, nearby_places, products, events, gallery, trip_templates, and reviews, while Archive recomputes under lock and returns fresh execution-time safe dependencies. Verify the route relationship through `route_places`, never `routes.place_ids`.
- [ ] Gallery rejects cross-Place, cover-role, duplicate, over-50, URL, and source-path selections; published ordered Gallery projects correctly; draft Gallery never reaches Public.
- [ ] Epoch lifecycle matrix: no bump for Draft Save, media-options read, draft Archive, Restore; bump for Publish, Unpublish, published Archive; failed epoch-changing transactions restore the prior epoch.
- [ ] Safe return accepts only `place-edit.html` or exactly one canonical `place_id`; reject historical edit query, extra/duplicate query, fragment, traversal, external/credential/auth-material input and fall back to `places.html`.
- [ ] Migration functions are non-routed and never execute during normal requests. Test dry-run/operator controls, deterministic legacy mapping, verification, and rollback gates without mutating a real Sheet.
- [ ] Accessibility regression: semantic validation summary/first-invalid focus, dialog keyboard containment/focus return, bilingual tabs, read-only semantic views, 44×44 targets, manual map alternative, keyboard Gallery ordering, live status, reduced motion, and mobile/desktop parity.

Required local commands:

```text
node scripts/test-admin-place-schema.js
node scripts/test-admin-place-service.js
node scripts/test-admin-places.js
node scripts/test-admin-place-edit.js
node scripts/test-admin-place-map.js
node scripts/test-admin-place-media.js
node scripts/test-admin-places-accessibility.js
node scripts/test-admin-place-regressions.js
npm test
npm run build
git diff --check
```

## 29. M7 human-only release gates

Local implementation/test/build completion does not perform remote work. The following remain pending human operations: `clasp push`; Apps Script deployment; Script Property setup/change; production or staging Sheet backup/schema setup; legacy migration dry-run, execution, verification, and rollback exercise; staging/production manual QA; production release; branch push; PR; and merge. Do not mark any as complete without recorded human evidence.

## 30. M8 PR1 Phase A local backend regressions

`node scripts/test-admin-content-service.js` uses in-memory Sheets, locks and cache with the real domain services, SheetService, Router, CryptoService, public readers and AuthService session validation. It is mandatory in `npm test`.

- Check all 25 status pairs per domain, retained soft deletes, safe restore and rejected combined restore/retirement edits.
- Check all roles, invalid/expired/revoked/inactive sessions, fabricated authority, and auth/revision rechecks after lock acquisition.
- Check exact payloads, every editable field, domain enums, dates/times, numeric/boolean types, references, duplicate IDs, formulas and unsafe URLs.
- Check deterministic revisions, stale editors, preflight schema/formats, one-row writes and complete read-back, no retries, uncertain create/update/delete results, audit warnings and lock-release failures.
- Check actual Product/Event list/detail, Home and Search freshness, cache generation eviction, in-flight readers, public visibility and lost-response reconciliation.
- Retain Admin Places and Product/Event/Home/Search public regressions, explicit Router allowlist and body-token transport checks.

Required commands: `node scripts/test-admin-content-service.js`, `cmd /c npm test`, `cmd /c npm run build`, `node scripts/test-apps-script.js`, `git diff --check`. The Apps Script suite compiles all `.gs` files and checks unique function names and static routing. Remote Sheets format/schema QA and Phase B browser UI testing remain deferred; do not infer those from local PASS results.

## 31. M8 PR1 Phase B local UI regressions

The mandatory runner now includes `test-admin-content-api.js`, `test-admin-content-model.js` and `test-admin-content-ui.js`. These exercise exact action/body contracts, strict response validation, roles, field mapping, lifecycle/revisions, no retries, double-submit protection, conflict/unknown reconciliation, persistent pending-create markers, preserved unsaved edits, audit warnings, paginated reads, dates/times, Boolean/numeric/URL validation, safe text rendering and labelled responsive UI structure.

Retain all Admin Places and public regressions. Run all three focused suites, `cmd /c npm test`, `cmd /c npm run build`, JavaScript syntax, Apps Script static and `git diff --check`. Use [M8_PHASE_B_QA.md](M8_PHASE_B_QA.md) for the precise later non-production role, lifecycle, failure, keyboard, touch and mobile matrix. Local fixture rendering does not substitute for that remote integration QA.

## 32. M8 PR1 Phase B.1 remediation regressions
The mandatory Phase B runner includes the narrow native-browser `test-admin-content-browser.js`. It covers Product/Event related-Place Enter isolation, Save behavior, intentional numeric blanks, native `badInput`, field feedback/focus and valid numeric normalization. API contracts cover exact legacy content metadata `YYYY-MM-DD HH:mm:ss` for Product/Event list/detail while authentication timestamps remain strict ISO. Lifecycle expectations use a separately declared literal matrix for both domains.
