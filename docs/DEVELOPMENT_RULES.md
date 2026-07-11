# DEVELOPMENT_RULES.md — Takhun Trip

เอกสารนี้กำหนดกติกาการพัฒนาเว็บแอป **Takhun Trip** เพื่อใช้ควบคุมการทำงานของ Codex ใน VS Code ให้พัฒนาอย่างเป็นระบบ ปลอดภัย ไม่ทำให้โปรเจกต์พัง และสอดคล้องกับเอกสารหลักของโปรเจกต์

เอกสารนี้ต้องใช้ร่วมกับ:

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
```

---

## 1. Development Philosophy

แนวทางการพัฒนา **Takhun Trip** คือ:

```text
ทำให้ง่ายก่อน
ใช้งานได้จริงก่อน
ค่อยเพิ่มความสวยและฟังก์ชันเสริม
ห้ามทำระบบซับซ้อนเกินความจำเป็น
```

เป้าหมายไม่ใช่การสร้างระบบใหญ่เกินงบหรือเกินความจำเป็น แต่ต้องเป็นเว็บแอปที่:

- เปิดใช้งานได้จริง
- แสดงผลสวยบนมือถือ
- มีแผนที่และปุ่มนำทางที่ใช้งานได้
- ข้อมูลมาจาก Google Sheets
- Admin เพิ่ม/แก้ไขข้อมูลได้
- ดูแลต่อได้ง่าย
- ไม่พังเมื่อแก้ไขต่อ

---

## 2. Core Rules

กติกาหลักที่ต้องยึดเสมอ:

1. อ่านเอกสารใน `docs/` ก่อนเริ่มแก้โค้ด
2. ทำงานทีละขั้น ไม่แก้หลายระบบพร้อมกัน
3. ห้ามลบไฟล์หรือฟังก์ชันเดิมโดยไม่ตรวจสอบผลกระทบ
4. ห้ามเปลี่ยนชื่อไฟล์หลักเอง
5. ห้ามเปลี่ยนชื่อ field ในข้อมูลเอง
6. ห้ามเปลี่ยนชื่อ API action เอง
7. ห้าม hardcode ข้อมูลที่ควรมาจาก Google Sheets
8. ห้ามเพิ่ม framework ใหม่โดยไม่ได้รับอนุญาต
9. ต้องพัฒนาแบบ Mobile-first
10. ต้องทดสอบหลังแก้ไขทุกครั้ง
11. ถ้าไม่แน่ใจ ให้ถามก่อน ไม่เดา
12. ต้องสรุปไฟล์ที่แก้และสิ่งที่เปลี่ยนทุกครั้งหลังทำงาน

---

## 3. Project Stack Rules

### 3.1 Frontend

ใช้เทคโนโลยีตามนี้เท่านั้น:

```text
HTML5
CSS3
Vanilla JavaScript
Fetch API
Responsive Web Design
Local Storage เฉพาะข้อมูลชั่วคราวที่ไม่สำคัญ
```

### 3.2 Backend

ใช้:

```text
Google Apps Script Web App
doGet()
doPost()
Cache Service
Lock Service
Script Properties
```

### 3.3 Database

ใช้:

```text
Google Sheets
```

### 3.4 File Storage

ใช้:

```text
Google Drive
```

### 3.5 Hosting

ใช้:

```text
Cloudflare Pages
```

### 3.6 Version Control

ใช้:

```text
GitHub
```

---

## 4. Framework Rules

### 4.1 ห้ามเพิ่มโดยไม่ได้รับอนุญาต

ห้ามเพิ่มสิ่งเหล่านี้เอง:

```text
React
Vue
Angular
Svelte
Next.js
Nuxt
Astro
Tailwind build system
Bootstrap
jQuery
TypeScript
Webpack
Vite
Node backend
Express
Firebase
Supabase
Cloudflare Workers API
Cloudflare D1
```

### 4.2 เหตุผล

โปรเจกต์นี้ตั้งใจให้เป็นเว็บแอปที่สร้างและดูแลได้ง่าย ด้วย HTML/CSS/Vanilla JS + Google Apps Script + Google Sheets

ถ้าจะเพิ่ม framework หรือเปลี่ยน stack ต้องถามก่อนเสมอ

---

## 5. Folder and File Rules

### 5.1 Recommended Structure

ต้องรักษาโครงสร้างหลักนี้:

```text
takhun-trip/
├── README.md
├── docs/
│   ├── APP_SPEC.md
│   ├── DESIGN.md
│   ├── UI_FLOW.md
│   ├── DATA_SCHEMA.md
│   ├── API_SPEC.md
│   ├── ADMIN_CMS_SPEC.md
│   ├── MAP_SPEC.md
│   ├── CONTENT_GUIDE.md
│   ├── DEVELOPMENT_RULES.md
│   └── PROMPT_PACK.md
├── public/
│   ├── index.html
│   ├── map.html
│   ├── routes.html
│   ├── route-detail.html
│   ├── places.html
│   ├── place-detail.html
│   ├── trip-planner.html
│   ├── products.html
│   ├── product-detail.html
│   ├── events.html
│   ├── event-detail.html
│   ├── gallery.html
│   ├── favorites.html
│   ├── about.html
│   ├── assets/
│   │   ├── icons/
│   │   ├── images/
│   │   └── videos/
│   ├── css/
│   │   ├── main.css
│   │   ├── components.css
│   │   ├── mobile.css
│   │   └── admin.css
│   ├── js/
│   │   ├── config.js
│   │   ├── api.js
│   │   ├── app.js
│   │   ├── i18n.js
│   │   ├── map.js
│   │   ├── routes.js
│   │   ├── places.js
│   │   ├── trip-planner.js
│   │   ├── products.js
│   │   ├── events.js
│   │   ├── gallery.js
│   │   ├── favorites.js
│   │   └── reviews.js
│   └── admin/
│       ├── login.html
│       ├── dashboard.html
│       ├── places.html
│       ├── routes.html
│       ├── products.html
│       ├── events.html
│       ├── reviews.html
│       ├── gallery.html
│       ├── settings.html
│       └── js/
│           ├── admin-api.js
│           ├── admin-auth.js
│           ├── admin-dashboard.js
│           ├── admin-places.js
│           ├── admin-routes.js
│           ├── admin-products.js
│           ├── admin-events.js
│           ├── admin-reviews.js
│           ├── admin-gallery.js
│           └── admin-settings.js
└── apps-script/
    ├── Code.gs
    ├── Config.gs
    ├── Router.gs
    ├── ApiResponse.gs
    ├── AuthService.gs
    ├── PlaceService.gs
    ├── RouteService.gs
    ├── ProductService.gs
    ├── EventService.gs
    ├── ReviewService.gs
    ├── GalleryService.gs
    ├── SettingsService.gs
    └── SheetService.gs
```

### 5.2 File Naming Rules

- ใช้ lowercase สำหรับไฟล์ HTML, CSS, JS
- ใช้ kebab-case เช่น `trip-planner.html`
- ไฟล์ Apps Script ใช้ PascalCase หรือชื่อ Service ชัดเจน เช่น `PlaceService.gs`
- ห้ามสร้างชื่อไฟล์ซ้ำหน้าที่กัน
- ห้ามตั้งชื่อไฟล์ใหม่โดยไม่ตรวจ `UI_FLOW.md`

---

## 6. Documentation-first Rule

ก่อนเริ่มสร้างหรือแก้ฟังก์ชันใด ๆ ให้ตรวจเอกสารที่เกี่ยวข้องก่อน

| งานที่ทำ | ต้องอ่านไฟล์ |
|---|---|
| สร้างหน้าใหม่ | `UI_FLOW.md`, `DESIGN.md` |
| สร้างฟังก์ชันใหม่ | `APP_SPEC.md`, `UI_FLOW.md` |
| สร้าง/แก้ข้อมูล | `DATA_SCHEMA.md` |
| สร้าง/แก้ API | `API_SPEC.md`, `DATA_SCHEMA.md` |
| สร้าง/แก้ระบบ Admin | `ADMIN_CMS_SPEC.md` |
| สร้าง/แก้แผนที่ | `MAP_SPEC.md` |
| เขียนข้อความ/เนื้อหา | `CONTENT_GUIDE.md` |
| ปรับ UI | `DESIGN.md` |
| เขียน Prompt ต่อ | `PROMPT_PACK.md` |

---

## 7. Development Workflow

ทุกครั้งที่สั่ง Codex ให้ทำงาน ควรให้ทำตามลำดับนี้:

```text
1. อ่านไฟล์เอกสารที่เกี่ยวข้อง
2. ตรวจไฟล์ปัจจุบัน
3. สรุปแผนการแก้ไขสั้น ๆ
4. แก้ไขเฉพาะไฟล์ที่จำเป็น
5. รักษาโครงสร้างเดิม
6. ทดสอบเบื้องต้น
7. สรุปว่าแก้ไฟล์ใดบ้าง
8. แจ้งข้อควรตรวจสอบต่อ
```

---

## 8. Git Rules

### 8.1 Before Editing

ก่อนแก้ไขงานใหญ่ ให้ตรวจ:

```bash
git status
```

### 8.2 After Editing

หลังแก้ไข ให้ตรวจ:

```bash
git diff --stat
git diff --check
```

### 8.3 Commit Rule

Commit ควรสั้นและชัดเจน เช่น:

```text
feat: add public map page
feat: add admin places management
fix: correct map marker filtering
style: improve mobile home layout
docs: add API specification
```

### 8.4 ห้ามทำ

- ห้าม force push โดยไม่ได้รับอนุญาต
- ห้ามลบ branch เอง
- ห้าม commit ไฟล์ลับ เช่น `.env`, `.dev.vars`
- ห้าม commit ไฟล์ cache หรือ build output ที่ไม่จำเป็น

---

## 9. HTML Rules

### 9.1 General Rules

- ใช้ HTML semantic เท่าที่เหมาะสม
- ทุกหน้าต้องมี `<meta name="viewport">`
- ทุกหน้าต้องมี title ชัดเจน
- ทุกหน้าควรมี description meta
- ใช้ปุ่ม `<button>` สำหรับ action
- ใช้ `<a>` สำหรับ link
- รูปภาพต้องมี `alt`
- ห้ามใส่ JavaScript ยาว ๆ ใน HTML ถ้าแยกไฟล์ได้

### 9.2 Required Head Example

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Takhun Trip</title>
<meta name="description" content="เว็บแอปแนะนำเส้นทางท่องเที่ยวบ้านตาขุน พร้อมแผนที่ จุดเที่ยว กิจกรรม สินค้าชุมชน และปุ่มนำทาง">
```

### 9.3 Accessibility

- ปุ่ม icon ต้องมี `aria-label`
- Form ต้องมี `<label>`
- Modal/Dialog ต้องปิดได้ด้วยปุ่ม
- Link ที่เปิดหน้าใหม่ควรมี `rel="noopener noreferrer"`

---

## 10. CSS Rules

### 10.1 CSS Structure

ให้แยก CSS ตามหน้าที่:

```text
main.css        → design tokens, base style, layout หลัก
components.css  → card, button, badge, toast, modal
mobile.css      → responsive mobile/tablet
admin.css       → admin dashboard/cms
map.css         → ถ้ามี css แผนที่เฉพาะ
```

### 10.2 Design Tokens

ต้องใช้ตัวแปรจาก `DESIGN.md`

ตัวอย่าง:

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
  --radius-lg: 24px;
  --radius-pill: 999px;
  --shadow-card: 0 16px 40px rgba(15, 23, 42, 0.12);
}
```

### 10.3 CSS Rules

- ห้ามใช้สีมั่ว ให้ใช้จาก Design Tokens
- ห้ามใช้ inline style ถ้าไม่จำเป็น
- ห้ามใช้ `!important` ยกเว้นจำเป็นจริง
- ต้องรองรับ responsive
- ปุ่มบนมือถือสูงอย่างน้อย 44px
- ห้ามทำข้อความเล็กจนอ่านยาก
- ต้องรองรับ `prefers-reduced-motion`

### 10.4 Responsive Breakpoints

```css
@media (min-width: 768px) {}
@media (min-width: 1024px) {}
@media (min-width: 1280px) {}
```

---

## 11. JavaScript Rules

### 11.1 General Rules

- ใช้ Vanilla JavaScript เท่านั้น
- ใช้ `const` / `let` ไม่ใช้ `var`
- แยกไฟล์ตามฟังก์ชัน
- ห้ามเขียนทุกอย่างรวมใน `app.js`
- ห้ามสร้าง global variable จำนวนมาก
- ฟังก์ชันต้องตั้งชื่อชัดเจน
- ต้อง handle error ทุกครั้งเมื่อเรียก API
- ต้องมี Loading / Empty / Error State

### 11.2 API Calls

ต้องเรียกผ่าน:

```text
public/js/api.js
public/admin/js/admin-api.js
```

ห้ามให้แต่ละหน้าเขียน fetch ซ้ำเองแบบไม่ผ่าน helper ยกเว้นมีเหตุผลเฉพาะ

### 11.3 DOM Rules

- ตรวจว่า element มีอยู่ก่อนใช้งาน
- ห้ามทำให้หน้าอื่น error เพราะ JS หา element ไม่เจอ
- ใช้ event delegation เมื่อเหมาะสม
- ถ้าใช้ `innerHTML` ต้องระวังข้อมูลจากผู้ใช้
- ข้อความรีวิวหรือ input ผู้ใช้ต้อง escape ก่อน render

### 11.4 Example Safe Pattern

```javascript
const el = document.querySelector("[data-place-list]");
if (el) {
  renderPlaces(el, places);
}
```

---

## 12. API Development Rules

### 12.1 API Response Format

ทุก API ต้องส่ง JSON รูปแบบเดียวกัน

Success:

```json
{
  "ok": true,
  "data": {},
  "message": "success"
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "กรุณากรอกข้อมูลให้ครบ"
  }
}
```

### 12.2 Public API Rules

- แสดงเฉพาะ `status = published`
- ไม่ส่งข้อมูล Admin
- ไม่ส่ง `password_hash`
- ไม่ส่งรีวิวที่ยังไม่อนุมัติ
- ใช้ Cache Service เมื่อเหมาะสม

### 12.3 Admin API Rules

- ต้องตรวจ token
- ต้อง validate input
- ต้องใช้ Lock Service ตอนเขียนข้อมูล
- ต้องบันทึก activity log สำหรับ action สำคัญ
- ต้อง clear cache หลังแก้ข้อมูล
- ลบข้อมูลด้วย soft delete

### 12.4 API Action Rules

ห้ามเปลี่ยนชื่อ action ที่กำหนดใน `API_SPEC.md`

ถ้าจำเป็นต้องเพิ่ม action ใหม่:

1. เพิ่มใน `API_SPEC.md`
2. เพิ่มใน Router
3. เพิ่ม Service
4. เพิ่ม frontend helper
5. ทดสอบ

---

## 13. Google Apps Script Rules

### 13.1 File Separation

แยก service ตามหน้าที่:

```text
Code.gs          → doGet/doPost
Router.gs        → route action
ApiResponse.gs   → response helpers
AuthService.gs   → login/session
SheetService.gs  → อ่าน/เขียน Google Sheets
PlaceService.gs  → places
RouteService.gs  → routes
ProductService.gs → products
EventService.gs  → events
ReviewService.gs → reviews
GalleryService.gs → gallery
SettingsService.gs → settings
```

### 13.2 Apps Script Rules

- ห้ามเขียน logic ทุกอย่างใน `Code.gs`
- ห้าม duplicate function name
- ใช้ Lock Service เมื่อเขียนข้อมูล
- ใช้ Cache Service กับ Public Data
- ใช้ Script Properties เก็บค่าตั้งค่าที่สำคัญ
- ต้อง handle error ด้วย JSON
- ห้าม return HTML error
- ห้าม hardcode Spreadsheet ID ในหลายไฟล์ ให้เก็บใน Config/Properties

### 13.3 Sheet Rules

- ใช้ชื่อชีตตาม `DATA_SCHEMA.md`
- ใช้ header row เป็น field name
- ห้ามสลับชื่อ field โดยไม่อัปเดต schema
- ห้ามอ้างตำแหน่ง column แบบตายตัวถ้าเลี่ยงได้
- ควร map ด้วย header name

---

## 14. Data Rules

### 14.1 Google Sheets

- ชีตหลักต้องตรงกับ `DATA_SCHEMA.md`
- field ต้องตรงกับ schema
- ใช้ `status` ควบคุมการเผยแพร่
- ใช้ soft delete
- วันที่ใช้รูปแบบสม่ำเสมอ
- เบอร์โทรเก็บเป็น text
- URL เก็บเป็น text
- lat/lng เก็บเป็นตัวเลขทศนิยมหรือ text ที่แปลงเป็น number ได้

### 14.2 ห้าม Hardcode

ห้าม hardcode ข้อมูลเหล่านี้ใน HTML/JS ถ้าควรมาจาก Google Sheets:

- รายชื่อสถานที่
- รายละเอียดสถานที่
- เบอร์โทร
- Google Maps URL
- รูปภาพสถานที่
- รายการสินค้า
- กิจกรรม
- รีวิว
- settings

### 14.3 ยกเว้น Hardcode ได้

อนุญาต hardcode ได้เฉพาะ:

- fallback text
- default empty state
- default categories ชั่วคราวก่อนเชื่อม API
- UI labels
- mock data เฉพาะช่วงเริ่มต้น แต่ต้องแยกชัดเจนว่าเป็น mock

---

## 15. Map Development Rules

ให้ยึด `MAP_SPEC.md`

### 15.1 Required

- ใช้ Leaflet + OpenStreetMap
- แสดงหมุดจาก API
- ใช้ `getMapPlaces`
- แสดงเส้นทางหลัก 4 จุด
- กดหมุดแล้วแสดง Preview Card
- กดนำทางเปิด Google Maps
- Filter ทำงานบน client
- สถานที่ไม่มีพิกัดต้องไม่ทำให้ error

### 15.2 ห้ามทำ

- ห้ามใช้ Google Maps API แบบเสียเงินโดยไม่ได้รับอนุญาต
- ห้าม hardcode พิกัดใน map.js เป็นข้อมูลหลัก
- ห้ามลากเส้นถนนจริงถ้าไม่มี routing service
- ห้ามส่งตำแหน่งผู้ใช้ไป backend โดยไม่จำเป็น

---

## 16. Admin Development Rules

ให้ยึด `ADMIN_CMS_SPEC.md`

### 16.1 Required

- ทุกหน้า Admin ต้องตรวจ session
- Login ต้องใช้ `adminLogin`
- CRUD ต้องผ่าน Admin API
- ทุกฟอร์มต้อง validate
- ทุก action ต้องมี Toast
- ลบข้อมูลแบบ soft delete
- หน้า Admin ต้อง responsive

### 16.2 Admin Mobile

- ห้ามใช้ table ที่ล้นจอโดยไม่มีทางใช้งาน
- ใช้ Card List บนมือถือ
- Form ใช้คอลัมน์เดียว
- ปุ่ม Save ใหญ่และชัดเจน

---

## 17. Content Rules

ให้ยึด `CONTENT_GUIDE.md`

### 17.1 ภาษา

- ภาษาไทยต้องอ่านง่าย
- ภาษาอังกฤษต้องไม่แปลทื่อ
- ปุ่มต้องสั้น
- Card ต้องไม่ยัดข้อความยาว
- ไม่ใช้คำโฆษณาเกินจริง
- ข้อมูลที่ยังไม่ยืนยันต้องมีหมายเหตุ

### 17.2 ห้าม

- ห้ามแต่งข้อมูลพิกัด เวลา ราคา หรือเบอร์โทร
- ห้ามอ้างว่าเป็นข้อมูลยืนยันถ้ายังไม่ตรวจ
- ห้ามใช้ข้อความราชการยาว ๆ บนหน้า Public
- ห้ามใช้ภาษา AI ซ้ำ ๆ จนดูไม่ธรรมชาติ

---

## 18. Local Storage Rules

ใช้ Local Storage เฉพาะข้อมูลชั่วคราวที่ไม่สำคัญ

### 18.1 Allowed Keys

```text
TAKHUN_LANG
TAKHUN_FAVORITES
TAKHUN_TRIP_PLAN
TAKHUN_RECENT_PLACES
TAKHUN_ADMIN_SESSION
```

### 18.2 ห้ามเก็บ

```text
รหัสผ่านจริง
ข้อมูลชำระเงิน
ข้อมูลส่วนตัวละเอียดอ่อน
Token ที่ไม่มีวันหมดอายุ
ข้อมูลลับของระบบ
```

### 18.3 Error Handling

ถ้า Local Storage ใช้งานไม่ได้:

- ระบบต้องไม่พัง
- แสดง fallback
- ใช้ memory state ชั่วคราวได้

---

## 19. Security Rules

### 19.1 Frontend

- Escape ข้อมูลจากผู้ใช้ก่อน render
- ห้ามใช้ `eval`
- ห้ามแทรก HTML จากรีวิวโดยตรง
- Link เปิดหน้าใหม่ต้องใช้ `rel="noopener noreferrer"`
- ตรวจ input ก่อนส่ง API

### 19.2 Backend

- Admin API ต้องตรวจ token
- ห้ามส่ง `password_hash`
- ห้ามส่งข้อมูลที่ไม่จำเป็น
- Validate ทุก payload
- ใช้ Lock Service เมื่อเขียน
- ใช้ soft delete
- จัดการ error เป็น JSON

### 19.3 Password

- ห้ามเก็บรหัสผ่านเป็น plain text ถ้าหลีกเลี่ยงได้
- ใช้ password hash ตามความเหมาะสมของ Google Apps Script
- อย่าส่งรหัสผ่านกลับไป frontend

---

## 20. Performance Rules

### 20.1 Frontend

- บีบอัดรูปก่อนใช้งานจริง
- ใช้ lazy loading กับรูปภาพ
- ไม่โหลดข้อมูลทุกอย่างพร้อมกันถ้าไม่จำเป็น
- ใช้ thumbnail ใน Card
- หลีกเลี่ยง JS ขนาดใหญ่
- แยกโหลดข้อมูลตามหน้า

### 20.2 API

- ใช้ Cache Service กับ Public API
- ลดจำนวน request หน้าแรกด้วย `getHomeData`
- ไม่อ่านทั้งชีตซ้ำหลายครั้งถ้า cache ได้
- Pagination สำหรับรายการยาว

### 20.3 Map

- ไม่โหลดรูปใหญ่ใน marker
- Filter บน client หลังโหลดข้อมูล
- ถ้าหมุดไม่เกิน 100 จุด ยังไม่ต้อง clustering
- ถ้าหมุดมากขึ้นค่อยเพิ่ม marker clustering ภายหลัง

---

## 21. Accessibility Rules

ต้องทำให้ใช้งานได้ง่ายที่สุด

1. ปุ่มต้องกดง่ายบนมือถือ
2. ข้อความต้อง contrast ดี
3. รูปภาพต้องมี alt text
4. Form ต้องมี label
5. Focus state ต้องมองเห็น
6. Icon button ต้องมี aria-label
7. ห้ามใช้สีเพียงอย่างเดียวสื่อสถานะ
8. รองรับ `prefers-reduced-motion`
9. Font ไม่เล็กเกินไป
10. เมนูต้องใช้ keyboard ได้ในระดับพื้นฐาน

---

## 22. Responsive Rules

### 22.1 Public Pages

ต้องเริ่มจากมือถือก่อน

ขั้นต่ำต้องรองรับ:

```text
360px mobile
768px tablet
1024px desktop
1280px large desktop
```

### 22.2 Admin Pages

ต้องใช้ได้ทั้ง:

- จอคอมพิวเตอร์
- tablet
- mobile

### 22.3 Testing Sizes

ควรทดสอบอย่างน้อย:

```text
360 x 800
390 x 844
768 x 1024
1366 x 768
1920 x 1080
```

---

## 23. UI State Rules

ทุกหน้าที่โหลดข้อมูลต้องมี:

1. Loading State
2. Empty State
3. Error State
4. Success/Toast เมื่อทำ action สำเร็จ

### 23.1 Loading Example

```text
กำลังโหลดข้อมูล...
```

### 23.2 Empty Example

```text
ยังไม่มีข้อมูลในหมวดนี้
```

### 23.3 Error Example

```text
โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
```

---

## 24. Testing Rules

หลังแก้ไขทุกครั้ง ต้องตรวจอย่างน้อย:

### 24.1 Visual Test

- หน้าเปิดได้
- Layout ไม่พัง
- Mobile ไม่ล้นจอ
- ปุ่มกดได้
- รูปไม่แตก
- สีและฟอนต์ตรงแนวทาง

### 24.2 Console Test

เปิด DevTools แล้วตรวจ:

```text
ไม่มี error หลักใน console
ไม่มี 404 ไฟล์สำคัญ
ไม่มี function undefined
ไม่มี API parse error
```

### 24.3 Function Test

ตามงานที่แก้ เช่น:

- แก้ Map → ทดสอบหมุด, filter, นำทาง
- แก้ Admin → ทดสอบ login, save, validation
- แก้ API → ทดสอบ response success/error
- แก้ UI → ทดสอบ mobile/desktop

---

## 25. Acceptance Before Saying “เสร็จแล้ว”

ห้ามสรุปว่างานเสร็จจนกว่าจะตรวจ:

1. ไฟล์ที่เกี่ยวข้องถูกแก้จริง
2. ไม่มี syntax error
3. หน้าเว็บที่เกี่ยวข้องเปิดได้
4. ฟังก์ชันหลักทำงานได้
5. ไม่มี error สำคัญใน console
6. ไม่กระทบหน้าอื่น
7. สอดคล้องกับเอกสาร spec
8. มีสรุปไฟล์ที่แก้
9. มีข้อควรทดสอบต่อ ถ้ามี

---

## 26. Error Handling Rules

### 26.1 API Error

Frontend ต้องแสดงข้อความที่อ่านเข้าใจง่าย ไม่แสดง error ดิบ

ไม่ควรแสดง:

```text
TypeError: Cannot read properties of undefined
```

ควรแสดง:

```text
โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
```

### 26.2 Form Error

ต้องบอกช่องที่ผิด เช่น:

```text
กรุณากรอกชื่อสถานที่
กรุณากรอก Latitude และ Longitude ให้ครบ
กรุณาใส่ URL ที่ถูกต้อง
```

### 26.3 Missing Data

ถ้าข้อมูลบางส่วนไม่มี ให้แสดง fallback เช่น:

```text
ยังไม่มีข้อมูล
ยังไม่มีรูปภาพ
ยังไม่มีเบอร์ติดต่อ
ยังไม่มีพิกัด
```

---

## 27. Image Rules

### 27.1 Image Source

รุ่นแรกใช้ URL รูปภาพจาก:

- Google Drive
- Cloudflare Pages assets
- แหล่งไฟล์ที่เตรียมไว้

### 27.2 Image Requirements

- มี fallback image
- มี alt text
- ใช้ lazy loading
- ไม่ใช้ภาพใหญ่เกินจำเป็น
- URL เสียต้องไม่ทำให้ layout พัง

### 27.3 Upload

ยังไม่ต้องทำระบบ upload file ใน Admin MVP  
ให้ใช้ image URL ก่อน

---

## 28. Review System Rules

1. Public ส่งรีวิวได้
2. รีวิวใหม่ต้องเป็น `pending`
3. Public แสดงเฉพาะ `approved`
4. Admin อนุมัติ/ซ่อน/ลบได้
5. ลบเป็น soft delete
6. ถ้า anonymous ให้แสดงชื่อเป็น “นักท่องเที่ยว”
7. ความคิดเห็นต้อง escape ก่อน render
8. ห้ามเปิดอัปโหลดรูปรีวิวใน MVP ถ้าไม่ได้สั่ง

---

## 29. Trip Planner Rules

1. ไม่ต้องทำ AI ใน MVP
2. ใช้ trip templates จาก Google Sheets
3. ผู้ใช้เลือกเวลาและสไตล์
4. บันทึกใน Local Storage
5. แชร์ได้ถ้าทำได้ง่าย
6. ห้ามทำระบบ login นักท่องเที่ยว
7. ห้ามทำระบบคำนวณเส้นทางซับซ้อน
8. แผนทริปต้องแก้ง่ายและเข้าใจง่าย

---

## 30. Language / i18n Rules

1. ค่าเริ่มต้นเป็นภาษาไทย
2. รองรับ `th` และ `en`
3. บันทึกภาษาที่เลือกใน `TAKHUN_LANG`
4. ข้อมูล field ใช้ `_th` และ `_en`
5. ถ้าไม่มีข้อมูลอังกฤษ ให้ fallback เป็นไทย
6. UI labels ควรอยู่ใน `i18n.js`
7. ห้ามเขียนข้อความซ้ำกระจายหลายไฟล์ถ้าควรรวมใน i18n

---

## 31. Deployment Rules

### 31.1 Cloudflare Pages

- ใช้ `public/` เป็น output directory ถ้าโครงสร้างกำหนดแบบ static
- Build command สามารถเป็นค่าว่างหรือ `exit 0`
- ตรวจ Production URL หลัง deploy

### 31.2 Environment Config

ให้มีไฟล์ config เช่น:

```text
public/js/config.js
```

ควรเก็บ:

```javascript
const APP_CONFIG = {
  API_URL: "GOOGLE_APPS_SCRIPT_WEB_APP_URL",
  SITE_URL: "https://takhun-trip.pages.dev",
  DEFAULT_LANG: "th"
};
```

### 31.3 ห้าม Commit Secret

ห้าม commit:

```text
.env
.dev.vars
credentials.json
private keys
รหัสผ่านจริง
```

---

## 32. Prompting Rules for Codex

เวลาสั่ง Codex ให้ใช้รูปแบบนี้:

```text
อ่านไฟล์ docs/DEVELOPMENT_RULES.md และไฟล์ spec ที่เกี่ยวข้องก่อน
ทำเฉพาะงานนี้เท่านั้น:
[ระบุงาน]

ข้อห้าม:
- ห้ามแก้ไฟล์นอกเหนือจากที่จำเป็น
- ห้ามเปลี่ยนชื่อ field/API/action
- ห้ามเพิ่ม framework
- ห้ามลบฟังก์ชันเดิม

หลังทำเสร็จ:
- สรุปไฟล์ที่แก้
- สรุปสิ่งที่เปลี่ยน
- บอกวิธีทดสอบ
```

---

## 33. Work Scope Control

ถ้าสั่งให้ทำ “หน้า Map” ห้ามไปทำ:

- Admin
- Products
- Events
- Trip Planner
- Login
- API ทั้งระบบ

ถ้าสั่งให้ทำ “Admin Places” ห้ามไปทำ:

- Public Home
- Map UI
- Products
- Events
- Gallery

ทำเฉพาะงานที่สั่ง และ dependencies ที่จำเป็นเท่านั้น

---

## 34. Common Mistakes to Avoid

1. สร้างระบบใหญ่เกิน MVP
2. เปลี่ยนชื่อ field ไม่ตรง schema
3. เขียน fetch ซ้ำหลายไฟล์
4. hardcode ข้อมูลสถานที่ใน HTML
5. ไม่ตรวจ mobile
6. ไม่มี error state
7. ไม่มี empty state
8. ไม่มี validation
9. รีวิวขึ้นทันทีโดยไม่อนุมัติ
10. หน้า Admin ใช้ table ล้นจอมือถือ
11. แผนที่ error เมื่อพิกัดว่าง
12. ปุ่มนำทางไม่ใช้ Google Maps URL
13. เพิ่ม framework ใหม่โดยไม่จำเป็น
14. สรุปว่างานเสร็จโดยไม่ได้ทดสอบ
15. ลบข้อมูลจริงแทน soft delete

---

## 35. Minimum MVP Completion Criteria

โปรเจกต์ MVP จะถือว่าใกล้สมบูรณ์เมื่อ:

1. หน้าแรกใช้งานได้
2. หน้าแผนที่ใช้งานได้
3. เส้นทางหลัก 4 จุดแสดงได้
4. หน้ารายละเอียดสถานที่แสดงได้
5. ปุ่มนำทางทำงานได้
6. Trip Planner ใช้งานแบบง่ายได้
7. สินค้าชุมชนแสดงได้
8. กิจกรรมแสดงได้
9. Gallery แสดงได้
10. รีวิวส่งแล้วเป็น pending
11. Admin Login ได้
12. Admin เพิ่ม/แก้ไขสถานที่ได้
13. Admin จัดการเส้นทางได้
14. Admin อนุมัติรีวิวได้
15. ข้อมูล Public มาจาก Google Sheets
16. รองรับมือถือดี
17. ไม่มี error หลักใน console
18. Deploy บน Cloudflare Pages ได้

---

## 36. Final Development Direction

การพัฒนา **Takhun Trip** ต้องยึดหลัก:

```text
ชัดเจน
เรียบง่าย
สวยพรีเมี่ยม
ใช้งานได้จริง
ไม่ซับซ้อนเกินไป
ไม่ทำของเดิมพัง
```

เป้าหมายคือให้เว็บแอปนี้เป็นเครื่องมือท่องเที่ยวที่นักท่องเที่ยวใช้งานได้จริง และชุมชนสามารถดูแลข้อมูลต่อได้จริงหลังส่งมอบ
