# ADMIN_CMS_SPEC.md — Takhun Trip

เอกสารนี้กำหนดรายละเอียดระบบหลังบ้าน **Admin / CMS** ของเว็บแอป **Takhun Trip** เพื่อใช้ควบคุมการพัฒนาใน VS Code / Codex ให้ระบบจัดการข้อมูลทำงานได้จริง สอดคล้องกับ `APP_SPEC.md`, `DATA_SCHEMA.md`, `API_SPEC.md` และ `UI_FLOW.md`

ระบบหลังบ้านต้องรองรับการเพิ่ม ลบ แก้ไข และจัดการข้อมูลสถานที่ท่องเที่ยว เส้นทาง สินค้า/บริการชุมชน กิจกรรม รีวิว แกลเลอรี และการตั้งค่าระบบ โดยต้องใช้งานได้ทั้งบนคอมพิวเตอร์และมือถือ

---

## 1. Admin CMS Objective

ระบบ Admin / CMS มีเป้าหมายเพื่อให้ผู้ดูแลระบบสามารถจัดการข้อมูลของเว็บแอป **Takhun Trip** ได้เอง โดยไม่ต้องแก้โค้ด

ผู้ดูแลควรสามารถทำงานหลักเหล่านี้ได้:

1. เพิ่ม/แก้ไข/ซ่อน/ลบสถานที่ท่องเที่ยว
2. จัดการเส้นทางท่องเที่ยวหลักและเส้นทางแนะนำ
3. เพิ่ม/แก้ไขสินค้าและบริการชุมชน
4. เพิ่ม/แก้ไขกิจกรรมและปฏิทินกิจกรรม
5. ตรวจสอบและอนุมัติรีวิว
6. จัดการรูปภาพและวิดีโอ
7. ตั้งค่าข้อมูลเว็บ เช่น โลโก้ สโลแกน Hero Image และช่องทางติดต่อ
8. ตรวจสอบภาพรวมข้อมูลผ่าน Dashboard

---

## 2. Admin CMS Scope

ระบบ Admin / CMS รุ่นแรกต้องเน้น **ใช้งานจริง เรียบง่าย ไม่ซับซ้อนเกินไป**

### 2.1 Must Have

ต้องมีในรุ่นแรก:

- Admin Login
- Admin Dashboard
- Manage Places
- Manage Routes
- Manage Products
- Manage Events
- Manage Reviews
- Manage Gallery
- Settings
- Logout
- Validation
- Toast / Alert
- Loading / Empty / Error State
- Responsive Layout

### 2.2 Should Have

ควรมีถ้าทำได้ไม่ซับซ้อน:

- Search / Filter ในหน้ารายการ
- Pagination
- Soft Delete
- Preview Public Page
- Activity Logs
- Status Badge
- Quick Actions
- Image URL Preview

### 2.3 Not Required in MVP

ยังไม่ต้องทำในรุ่นแรก:

- ระบบอัปโหลดรูปไฟล์จริงแบบซับซ้อน
- ระบบ Drag & Drop รูปภาพ
- ระบบจัดการสิทธิ์หลายระดับแบบละเอียดมาก
- ระบบ Workflow อนุมัติหลายขั้น
- ระบบ Export รายงานขั้นสูง
- ระบบแจ้งเตือน Email อัตโนมัติ
- ระบบจอง/ชำระเงิน

---

## 3. Admin User Roles

### 3.1 Role List

| Role | ความหมาย | สิทธิ์ |
|---|---|---|
| `super_admin` | ผู้ดูแลสูงสุด | จัดการได้ทุกอย่าง |
| `editor` | ผู้แก้ไขข้อมูล | เพิ่ม/แก้ไขสถานที่ เส้นทาง สินค้า กิจกรรม แกลเลอรี |
| `reviewer` | ผู้ตรวจรีวิว | ตรวจสอบ อนุมัติ ซ่อนรีวิว |
| `viewer` | ผู้ดูข้อมูล | ดูข้อมูลอย่างเดียว ไม่สามารถบันทึกได้ |

### 3.2 MVP Recommendation

ในรุ่นแรกสามารถเริ่มด้วย `super_admin` เพียง role เดียวก่อนได้ เพื่อให้ระบบไม่ซับซ้อนเกินไป

แต่โครงสร้างข้อมูลควรรองรับ `role` ไว้ตาม `DATA_SCHEMA.md`

---

## 4. Admin Page List

ระบบหลังบ้านควรมีหน้าดังนี้

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
└── js/
    ├── admin-api.js
    ├── admin-auth.js
    ├── admin-dashboard.js
    ├── admin-places.js
    ├── admin-routes.js
    ├── admin-products.js
    ├── admin-events.js
    ├── admin-reviews.js
    ├── admin-gallery.js
    └── admin-settings.js
```

---

## 5. Admin Layout

### 5.1 Desktop Layout

บนจอคอมพิวเตอร์ให้ใช้ Layout แบบ Dashboard

```text
Sidebar ด้านซ้าย
→ Top Bar
→ Page Header
→ Content Area
→ Table / Form / Card
```

องค์ประกอบหลัก:

- Sidebar Menu
- Top Bar
- Page Title
- Breadcrumb หรือคำอธิบายสั้น
- Action Button เช่น “เพิ่มสถานที่”
- Search / Filter
- Data Table
- Pagination
- Toast

### 5.2 Mobile Layout

บนมือถือให้ใช้ Layout ที่กดง่าย ไม่บีบตาราง

```text
Top Header
→ Mobile Admin Menu
→ Summary Card / Action Button
→ Card List แทน Table
→ Bottom Action หรือ Floating Save Button
```

กฎสำคัญ:

- ห้ามทำตารางกว้างจนล้นจอบนมือถือ
- ใช้ Card List แทน Table เมื่อจอเล็ก
- ปุ่ม Save ต้องใหญ่และเห็นชัด
- ฟอร์มต้องเป็นคอลัมน์เดียว
- เมนู Admin ควรเปิด/ปิดได้แบบ Drawer หรือ Dropdown

---

## 6. Admin Design Direction

### 6.1 Mood

Admin UI ต้องดู:

- สะอาด
- เป็นระบบ
- อ่านง่าย
- ใช้งานจริง
- ไม่หนักสีเกินไป
- ยังอยู่ในแบรนด์ Takhun Trip

### 6.2 Color Usage

ใช้สีเดียวกับ `DESIGN.md` แต่ลดความสดลงเล็กน้อยในหน้า Admin

| Section | Recommended Color |
|---|---|
| Places | `#E0F7FA` |
| Routes | `#DCFCE7` |
| Products | `#FFF7E6` |
| Events | `#EEF2FF` |
| Reviews | `#FCE7F3` |
| Gallery | `#F3E8FF` |
| Settings | `#F8FAFC` |

### 6.3 Admin Components

ต้องมี component พื้นฐาน:

- Admin Header
- Admin Sidebar / Drawer
- Summary Card
- Data Table
- Mobile Data Card
- Search Box
- Filter Select
- Status Badge
- Form Input
- Image Preview
- Confirm Dialog
- Toast Message
- Loading Skeleton
- Empty State
- Error State

---

## 7. Authentication Flow

### 7.1 Login Page

ไฟล์:

```text
public/admin/login.html
```

### 7.2 Login Form Fields

| Field | Type | Required | Description |
|---|---|---:|---|
| `username` | text | yes | ชื่อผู้ใช้ |
| `password` | password | yes | รหัสผ่าน |

### 7.3 Login Flow

```text
เปิด admin/login.html
→ กรอก username/password
→ กดเข้าสู่ระบบ
→ Validate form
→ เรียก API adminLogin
→ ถ้าสำเร็จ:
   → บันทึก session/token ใน Local Storage
   → redirect ไป admin/dashboard.html
→ ถ้าไม่สำเร็จ:
   → แสดง error message
```

### 7.4 Session Storage Key

```text
TAKHUN_ADMIN_SESSION
```

### 7.5 Session Object

```json
{
  "admin_id": "ADM-001",
  "display_name": "ผู้ดูแลระบบ",
  "role": "super_admin",
  "token": "session-token",
  "expires_at": "2026-07-11 18:00:00"
}
```

### 7.6 Protected Page Rule

ทุกหน้าใน `/admin/` ยกเว้น `login.html` ต้องตรวจ session ก่อนแสดงผล

ถ้าไม่มี session:

```text
redirect → admin/login.html
```

ถ้า session หมดอายุ:

```text
ล้าง session
redirect → admin/login.html
```

---

## 8. Admin Dashboard

### 8.1 File

```text
public/admin/dashboard.html
```

### 8.2 Purpose

แสดงภาพรวมข้อมูลทั้งหมดของเว็บแอป และเป็นศูนย์กลางสำหรับเข้าถึงเมนูจัดการข้อมูล

### 8.3 Dashboard Widgets

ต้องมี Summary Cards:

| Card | Data Source | Description |
|---|---|---|
| สถานที่ทั้งหมด | `places` | จำนวนสถานที่ทั้งหมด |
| เส้นทางทั้งหมด | `routes` | จำนวนเส้นทาง |
| สินค้า/บริการ | `products` | จำนวนสินค้าและบริการ |
| กิจกรรม | `events` | จำนวนกิจกรรม |
| รีวิวรอตรวจสอบ | `reviews` | จำนวนรีวิว `pending` |
| ภาพ/วิดีโอ | `gallery` | จำนวนสื่อทั้งหมด |

### 8.4 Dashboard Sections

ควรมี:

1. Summary Cards
2. รีวิวรอตรวจสอบล่าสุด
3. กิจกรรมใกล้ถึง
4. สถานที่ที่เพิ่งแก้ไข
5. Quick Action Buttons

### 8.5 Quick Actions

- เพิ่มสถานที่
- เพิ่มกิจกรรม
- เพิ่มสินค้า
- ตรวจรีวิว
- เปิดหน้าเว็บจริง

### 8.6 API

ใช้ API:

```text
adminGetDashboard
```

---

## 9. Manage Places

### 9.1 File

```text
public/admin/places.html
```

### 9.2 Purpose

จัดการข้อมูลสถานที่ท่องเที่ยวทั้งหมด

### 9.3 Required Actions

- ดูรายการสถานที่
- ค้นหา
- กรองตามอำเภอ
- กรองตามประเภท
- กรองตามสถานะ
- เพิ่มสถานที่
- แก้ไขสถานที่
- ซ่อนสถานที่
- เผยแพร่สถานที่
- ลบสถานที่แบบ soft delete
- ดูตัวอย่างหน้า Public

### 9.4 List Columns — Desktop

| Column | Description |
|---|---|
| รูป | cover image |
| ชื่อสถานที่ | `name_th` |
| อำเภอ | `district` |
| ประเภท | `category` |
| กลุ่มเส้นทาง | `route_group` |
| พิกัด | coordinate status |
| สถานะ | `status` |
| อัปเดตล่าสุด | `updated_at` |
| จัดการ | action buttons |

### 9.5 Mobile Card Fields

บนมือถือให้แสดงเป็น Card:

```text
[รูป]
ชื่อสถานที่
อำเภอ / ประเภท
สถานะพิกัด
สถานะเผยแพร่
ปุ่ม: แก้ไข | ดู | ซ่อน | ลบ
```

### 9.6 Place Form Fields

| Field | Required | Input Type |
|---|---:|---|
| `name_th` | yes | text |
| `name_en` | no | text |
| `district` | yes | select |
| `province` | yes | text |
| `route_group` | no | select |
| `category` | yes | select |
| `sub_category` | no | text |
| `short_description_th` | yes | textarea |
| `short_description_en` | no | textarea |
| `description_th` | yes | rich textarea/simple textarea |
| `description_en` | no | textarea |
| `activities_th` | no | textarea |
| `activities_en` | no | textarea |
| `highlight_th` | no | text |
| `highlight_en` | no | text |
| `phone` | no | text |
| `line_url` | no | url |
| `facebook_url` | no | url |
| `website_url` | no | url |
| `google_maps_url` | no | url |
| `latitude` | no | number/text |
| `longitude` | no | number/text |
| `coordinate_status` | yes | select |
| `open_time_th` | no | text |
| `open_time_en` | no | text |
| `fee_th` | no | text |
| `fee_en` | no | text |
| `cover_image_url` | no | url |
| `gallery_image_urls` | no | textarea |
| `video_url` | no | url |
| `tags` | no | text |
| `recommended_duration` | no | text |
| `best_time_th` | no | text |
| `best_time_en` | no | text |
| `nearby_place_ids` | no | multi select/text |
| `is_featured` | no | checkbox |
| `is_main_route_point` | no | checkbox |
| `sort_order` | no | number |
| `status` | yes | select |

### 9.7 Place Validation

- `name_th` ห้ามว่าง
- `district` ห้ามว่าง
- `category` ห้ามว่าง
- `short_description_th` ห้ามว่าง
- ถ้ากรอก `latitude` ต้องกรอก `longitude`
- ถ้ากรอก `longitude` ต้องกรอก `latitude`
- `phone` ต้องเก็บเป็น text
- `status` ต้องอยู่ใน enum
- URL ต้องขึ้นต้นด้วย `http://` หรือ `https://`

### 9.8 Place Status Options

```text
draft
published
hidden
archived
deleted
```

### 9.9 Place APIs

- `adminGetPlaces`
- `createPlace`
- `updatePlace`
- `deletePlace`

---

## 10. Manage Routes

### 10.1 File

```text
public/admin/routes.html
```

### 10.2 Purpose

จัดการเส้นทางท่องเที่ยว เช่น เส้นทางหลักบ้านตาขุน 4 จุด และเส้นทางแนะนำอื่น ๆ

### 10.3 Required Actions

- ดูรายการเส้นทาง
- เพิ่มเส้นทาง
- แก้ไขเส้นทาง
- ซ่อน/เผยแพร่เส้นทาง
- ลบแบบ soft delete
- จัดลำดับสถานที่ในเส้นทาง
- ดูตัวอย่างหน้า Public

### 10.4 Route Form Fields

| Field | Required | Input Type |
|---|---:|---|
| `name_th` | yes | text |
| `name_en` | no | text |
| `short_description_th` | yes | textarea |
| `short_description_en` | no | textarea |
| `description_th` | yes | textarea |
| `description_en` | no | textarea |
| `duration` | no | text/select |
| `travel_style` | no | checkbox group |
| `cover_image_url` | no | url |
| `map_focus_lat` | no | number/text |
| `map_focus_lng` | no | number/text |
| `is_featured` | no | checkbox |
| `sort_order` | no | number |
| `status` | yes | select |
| `place_ids` | yes | ordered place selector |

### 10.5 Ordered Place Selector

ระบบจัดเส้นทางต้องเลือกสถานที่และเรียงลำดับได้

MVP ทำแบบง่ายได้:

```text
เลือกสถานที่จาก dropdown
→ กดเพิ่ม
→ แสดงรายการสถานที่ในเส้นทาง
→ ปุ่มขึ้น/ลง เพื่อเรียงลำดับ
→ ปุ่มลบออกจากเส้นทาง
```

ไม่จำเป็นต้องทำ drag & drop ในรุ่นแรก

### 10.6 Main Route Requirement

เส้นทางหลักต้องเรียงดังนี้:

1. `BTK-001` วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา
2. `BTK-002` วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน
3. `BTK-003` วิสาหกิจชุมชนพรุไทย ฮันนี่บี
4. `BTK-004` วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์

### 10.7 Route APIs

- `adminGetRoutes`
- `createRoute`
- `updateRoute`
- `deleteRoute`

---

## 11. Manage Products

### 11.1 File

```text
public/admin/products.html
```

### 11.2 Purpose

จัดการสินค้าและบริการชุมชน เช่น ผ้าทอ น้ำผึ้ง ผลไม้ ของฝาก กิจกรรมชุมชน และบริการท่องเที่ยว

### 11.3 Required Actions

- ดูรายการสินค้า/บริการ
- ค้นหา
- กรองหมวดหมู่
- เพิ่มสินค้า/บริการ
- แก้ไขสินค้า/บริการ
- ซ่อน/เผยแพร่
- ลบแบบ soft delete

### 11.4 Product Form Fields

| Field | Required | Input Type |
|---|---:|---|
| `name_th` | yes | text |
| `name_en` | no | text |
| `category` | yes | select |
| `producer_name` | no | text |
| `related_place_id` | no | select |
| `district` | no | select |
| `description_th` | yes | textarea |
| `description_en` | no | textarea |
| `price_range` | no | text |
| `phone` | no | text |
| `contact_url` | no | url |
| `google_maps_url` | no | url |
| `latitude` | no | number/text |
| `longitude` | no | number/text |
| `image_url` | no | url |
| `tags` | no | text |
| `is_featured` | no | checkbox |
| `sort_order` | no | number |
| `status` | yes | select |

### 11.5 Product Categories

```text
food
souvenir
herbal
honey
handicraft
fruit
community_activity
tourism_service
accommodation
transport
```

### 11.6 Product APIs

- `adminGetProducts`
- `createProduct`
- `updateProduct`
- `deleteProduct`

---

## 12. Manage Events

### 12.1 File

```text
public/admin/events.html
```

### 12.2 Purpose

จัดการกิจกรรมและปฏิทินท่องเที่ยว

### 12.3 Required Actions

- ดูรายการกิจกรรม
- เพิ่มกิจกรรม
- แก้ไขกิจกรรม
- ซ่อน/เผยแพร่กิจกรรม
- ลบแบบ soft delete
- กรองตามเดือน/ประเภท/สถานะ

### 12.4 Event Form Fields

| Field | Required | Input Type |
|---|---:|---|
| `title_th` | yes | text |
| `title_en` | no | text |
| `event_type` | yes | select |
| `event_date` | yes | date |
| `start_time` | no | time |
| `end_time` | no | time |
| `location_th` | yes | text |
| `location_en` | no | text |
| `related_place_id` | no | select |
| `description_th` | yes | textarea |
| `description_en` | no | textarea |
| `image_url` | no | url |
| `contact_name` | no | text |
| `contact_phone` | no | text |
| `register_url` | no | url |
| `google_maps_url` | no | url |
| `latitude` | no | number/text |
| `longitude` | no | number/text |
| `is_featured` | no | checkbox |
| `status` | yes | select |

### 12.5 Event Types

```text
launch
festival
community_market
learning
seasonal
otop
tourism
other
```

### 12.6 Event APIs

- `adminGetEvents`
- `createEvent`
- `updateEvent`
- `deleteEvent`

---

## 13. Manage Reviews

### 13.1 File

```text
public/admin/reviews.html
```

### 13.2 Purpose

ตรวจสอบ อนุมัติ ซ่อน หรือลบรีวิวจากผู้ใช้งาน

### 13.3 Review Tabs

ควรมี Tab:

```text
รอตรวจสอบ
เผยแพร่แล้ว
ซ่อน
ลบแล้ว
ทั้งหมด
```

### 13.4 Review List Fields

| Field | Description |
|---|---|
| สถานที่ | ชื่อสถานที่ที่ถูกรีวิว |
| ผู้รีวิว | ชื่อหรือไม่แสดงชื่อ |
| คะแนน | 1–5 ดาว |
| ความคิดเห็น | ข้อความรีวิว |
| วันที่ส่ง | `created_at` |
| สถานะ | `status` |
| จัดการ | action buttons |

### 13.5 Review Actions

- อนุมัติ
- ซ่อน
- ลบ
- ตอบกลับ
- ดูสถานที่ที่เกี่ยวข้อง

### 13.6 Review Rules

1. รีวิวใหม่จาก Public ต้องเป็น `pending`
2. Public แสดงเฉพาะ `approved`
3. Admin ต้องกดอนุมัติก่อนแสดงผล
4. การลบใช้ `status = deleted`
5. ถ้า `is_anonymous = TRUE` ให้แสดงชื่อเป็น “นักท่องเที่ยว”

### 13.7 Review APIs

- `adminGetReviews`
- `approveReview`
- `hideReview`
- `deleteReview`

---

## 14. Manage Gallery

### 14.1 File

```text
public/admin/gallery.html
```

### 14.2 Purpose

จัดการรูปภาพและวิดีโอของเว็บแอป

### 14.3 Required Actions

- ดูรายการรูปภาพ/วิดีโอ
- เพิ่มรูปภาพจาก URL
- เพิ่มวิดีโอจาก YouTube URL
- แก้ไขข้อมูลสื่อ
- ซ่อน/เผยแพร่
- ลบแบบ soft delete
- กรองตามหมวดหมู่

### 14.4 Gallery Form Fields

| Field | Required | Input Type |
|---|---:|---|
| `title_th` | yes | text |
| `title_en` | no | text |
| `media_type` | yes | select |
| `category` | yes | select |
| `related_place_id` | no | select |
| `image_url` | no | url |
| `video_url` | no | url |
| `thumbnail_url` | no | url |
| `caption_th` | no | textarea |
| `caption_en` | no | textarea |
| `credit` | no | text |
| `sort_order` | no | number |
| `status` | yes | select |

### 14.5 Media Type

```text
image
video
```

### 14.6 Gallery APIs

- `adminGetGallery`
- `createGalleryItem`
- `updateGalleryItem`
- `deleteGalleryItem`

### 14.7 MVP Image Handling Rule

รุ่นแรกให้กรอก URL รูปภาพเองก่อน เช่น URL จาก Google Drive หรือแหล่งเก็บไฟล์ที่เตรียมไว้

ยังไม่ต้องทำระบบ upload file ใน Admin รุ่นแรก

---

## 15. Settings

### 15.1 File

```text
public/admin/settings.html
```

### 15.2 Purpose

จัดการค่าตั้งค่าพื้นฐานของเว็บแอป

### 15.3 Setting Fields

| Field | Required | Description |
|---|---:|---|
| `site_name` | yes | ชื่อเว็บ |
| `site_slogan_th` | yes | สโลแกนไทย |
| `site_slogan_en` | no | สโลแกนอังกฤษ |
| `default_language` | yes | ภาษาเริ่มต้น |
| `main_phone` | no | เบอร์โทรหลัก |
| `main_email` | no | อีเมลหลัก |
| `facebook_url` | no | Facebook |
| `line_url` | no | LINE |
| `logo_url` | no | โลโก้ |
| `hero_image_url` | no | ภาพ Hero |
| `reviews_enabled` | yes | เปิด/ปิดรีวิว |
| `events_enabled` | yes | เปิด/ปิดกิจกรรม |
| `maintenance_mode` | yes | โหมดปิดปรับปรุง |

### 15.4 Settings APIs

- `adminGetSettings`
- `updateSettings`

---

## 16. Status Badge Rules

### 16.1 Content Status

| Status | Label TH | Badge Style |
|---|---|---|
| `draft` | ร่าง | gray |
| `published` | เผยแพร่ | green |
| `hidden` | ซ่อน | amber |
| `archived` | เก็บถาวร | slate |
| `deleted` | ลบแล้ว | red |

### 16.2 Review Status

| Status | Label TH | Badge Style |
|---|---|---|
| `pending` | รอตรวจสอบ | amber |
| `approved` | เผยแพร่แล้ว | green |
| `hidden` | ซ่อน | gray |
| `deleted` | ลบแล้ว | red |

### 16.3 Coordinate Status

| Status | Label TH | Badge Style |
|---|---|---|
| `verified` | ยืนยันพิกัดแล้ว | green |
| `pending_verify` | รอยืนยัน | amber |
| `needs_survey` | ต้องสำรวจ | orange |
| `no_coordinate` | ยังไม่มีพิกัด | gray |
| `approximate` | พิกัดประมาณ | blue |

---

## 17. Form UX Rules

1. ทุกฟอร์มต้องมี Label ชัดเจน
2. Placeholder ห้ามใช้แทน Label
3. ช่อง Required ต้องมีสัญลักษณ์ `*`
4. ปุ่ม Save ต้องอยู่ด้านล่างและเห็นชัด
5. บนมือถือใช้ฟอร์มคอลัมน์เดียว
6. Form ยาวให้แบ่งเป็น Section
7. URL field ควรมีปุ่ม Preview หรือ Open Link
8. Image URL ควรแสดง preview ถ้ามี URL
9. ถ้าบันทึกไม่สำเร็จ ต้องไม่ล้างข้อมูลในฟอร์ม
10. หลังบันทึกสำเร็จให้แสดง Toast

---

## 18. Recommended Form Sections

### 18.1 Place Form Sections

```text
1. ข้อมูลพื้นฐาน
2. คำอธิบายและกิจกรรม
3. พิกัดและการนำทาง
4. ช่องทางติดต่อ
5. รูปภาพและวิดีโอ
6. การแสดงผลและสถานะ
```

### 18.2 Route Form Sections

```text
1. ข้อมูลเส้นทาง
2. สไตล์และระยะเวลา
3. สถานที่ในเส้นทาง
4. รูปภาพ
5. สถานะ
```

### 18.3 Product Form Sections

```text
1. ข้อมูลสินค้า/บริการ
2. กลุ่มผู้ผลิตและสถานที่เกี่ยวข้อง
3. ราคาและช่องทางติดต่อ
4. รูปภาพ
5. สถานะ
```

### 18.4 Event Form Sections

```text
1. ข้อมูลกิจกรรม
2. วัน เวลา และสถานที่
3. รายละเอียดและการลงทะเบียน
4. รูปภาพ
5. สถานะ
```

---

## 19. Table / List UX Rules

### 19.1 Desktop

ใช้ Data Table:

- Header ชัดเจน
- มี Search
- มี Filter
- มี Pagination
- Action อยู่ด้านขวา
- แสดง Status Badge
- แสดงรูป thumbnail ถ้ามี

### 19.2 Mobile

ใช้ Card List:

- ข้อมูลสำคัญอยู่ด้านบน
- ปุ่มจัดการชัด
- ไม่บังคับ scroll แนวนอน
- Card แต่ละใบต้องมี spacing เพียงพอ

---

## 20. Confirm Dialog Rules

ใช้ Confirm Dialog ก่อน action ที่มีผลต่อข้อมูล เช่น:

- ลบสถานที่
- ลบเส้นทาง
- ลบสินค้า
- ลบกิจกรรม
- ลบรูปภาพ
- ลบรีวิว
- ซ่อนข้อมูลสำคัญ

ข้อความตัวอย่าง:

```text
ยืนยันการลบข้อมูลนี้หรือไม่?
ข้อมูลจะถูกซ่อนจากหน้าเว็บ แต่ยังสามารถกู้คืนได้จากฐานข้อมูล
```

ปุ่ม:

```text
ยกเลิก
ยืนยัน
```

---

## 21. Toast / Feedback Rules

ต้องมี Toast แจ้งผลทุกครั้งหลังทำ action

### Success Messages

```text
บันทึกข้อมูลเรียบร้อย
แก้ไขข้อมูลเรียบร้อย
ลบข้อมูลเรียบร้อย
เผยแพร่ข้อมูลเรียบร้อย
ซ่อนข้อมูลเรียบร้อย
อนุมัติรีวิวเรียบร้อย
```

### Error Messages

```text
บันทึกข้อมูลไม่สำเร็จ
โหลดข้อมูลไม่สำเร็จ
กรุณากรอกข้อมูลให้ครบ
ไม่มีสิทธิ์ทำรายการนี้
Session หมดอายุ กรุณาเข้าสู่ระบบใหม่
```

---

## 22. Loading / Empty / Error State

### 22.1 Loading State

ใช้เมื่อกำลังโหลดข้อมูลจาก API

```text
กำลังโหลดข้อมูล...
```

หรือใช้ Skeleton Card

### 22.2 Empty State

ตัวอย่างข้อความ:

```text
ยังไม่มีข้อมูลสถานที่
กด “เพิ่มสถานที่” เพื่อเริ่มเพิ่มข้อมูลแรก
```

### 22.3 Error State

ตัวอย่างข้อความ:

```text
โหลดข้อมูลไม่สำเร็จ
กรุณาลองใหม่อีกครั้ง
```

ต้องมีปุ่ม:

```text
ลองใหม่
```

---

## 23. Admin API Mapping

| Page | API |
|---|---|
| login.html | `adminLogin` |
| dashboard.html | `adminGetDashboard` |
| places.html | `adminGetPlaces`, `createPlace`, `updatePlace`, `deletePlace` |
| routes.html | `adminGetRoutes`, `createRoute`, `updateRoute`, `deleteRoute` |
| products.html | `adminGetProducts`, `createProduct`, `updateProduct`, `deleteProduct` |
| events.html | `adminGetEvents`, `createEvent`, `updateEvent`, `deleteEvent` |
| reviews.html | `adminGetReviews`, `approveReview`, `hideReview`, `deleteReview` |
| gallery.html | `adminGetGallery`, `createGalleryItem`, `updateGalleryItem`, `deleteGalleryItem` |
| settings.html | `adminGetSettings`, `updateSettings` |

---

## 24. Activity Log Rules

ทุก action สำคัญของ Admin ควรบันทึกลง `activity_logs`

### 24.1 Actions to Log

- login
- logout
- create
- update
- publish
- hide
- delete
- approve
- reject

### 24.2 Log Example

```json
{
  "log_id": "LOG-001",
  "admin_id": "ADM-001",
  "action": "update",
  "entity_type": "place",
  "entity_id": "BTK-001",
  "description": "แก้ไขข้อมูลสถานที่",
  "created_at": "2026-07-11 10:00:00"
}
```

---

## 25. Admin Security Rules

1. ทุก Admin API ต้องตรวจ token
2. หน้า Admin ทุกหน้า ยกเว้น login ต้องตรวจ session
3. ห้ามส่ง `password_hash` ไปยัง Frontend
4. ห้ามเก็บ password จริงใน Local Storage
5. ถ้า session หมดอายุ ให้ redirect ไปหน้า login
6. ทุก input ต้อง validate ก่อนส่ง API
7. ทุกข้อมูลที่แสดงจากผู้ใช้ เช่น รีวิว ต้อง escape ก่อน render
8. ลบข้อมูลควรใช้ soft delete
9. Admin ที่ `status != active` ห้าม login
10. ถ้ามี role ต้องตรวจสิทธิ์ก่อน action สำคัญ

---

## 26. Admin Responsive Acceptance Criteria

ระบบ Admin จะถือว่ารองรับมือถือเมื่อ:

1. เปิดได้บนจอมือถือ 360px
2. เมนูไม่ล้นจอ
3. ตารางเปลี่ยนเป็น Card List หรือ scroll ได้อย่างเหมาะสม
4. ฟอร์มเป็นคอลัมน์เดียว
5. ปุ่ม Save กดง่าย
6. ปุ่มจัดการแต่ละรายการไม่เล็กเกินไป
7. ไม่มีข้อความทับกัน
8. ไม่ต้องซูมเพื่อใช้งาน
9. Toast ไม่บังปุ่มสำคัญ
10. หน้า Login ใช้งานได้ดีบนมือถือ

---

## 27. Admin MVP Acceptance Criteria

ระบบ Admin / CMS จะถือว่าผ่าน MVP เมื่อ:

1. Admin Login ได้
2. Admin Logout ได้
3. หน้า Dashboard โหลดสถิติได้
4. เพิ่มสถานที่ใหม่ได้
5. แก้ไขสถานที่ได้
6. ซ่อน/ลบสถานที่แบบ soft delete ได้
7. เพิ่มและแก้ไขเส้นทางได้
8. จัดลำดับสถานที่ในเส้นทางหลัก 4 จุดได้
9. เพิ่มและแก้ไขสินค้า/บริการชุมชนได้
10. เพิ่มและแก้ไขกิจกรรมได้
11. ดูรีวิวรอตรวจสอบได้
12. อนุมัติรีวิวได้
13. เพิ่มรูปภาพ/วิดีโอด้วย URL ได้
14. แก้ไขค่าตั้งค่าระบบได้
15. ข้อมูลที่บันทึกแสดงในหน้า Public ได้
16. หน้า Admin ใช้งานได้ทั้งคอมพิวเตอร์และมือถือ
17. ไม่มี error หลักใน console
18. ทุก action มี Toast แจ้งผล

---

## 28. Recommended Development Order

ให้ Codex พัฒนา Admin ตามลำดับนี้:

### Step 1: Admin Layout

- สร้างโครงสร้างหน้า Admin
- สร้าง Sidebar / Header
- สร้าง CSS Admin
- สร้าง Toast / Confirm Dialog

### Step 2: Authentication

- สร้าง login.html
- สร้าง admin-auth.js
- เชื่อม adminLogin
- ตรวจ session ทุกหน้า

### Step 3: Dashboard

- สร้าง dashboard.html
- เชื่อม adminGetDashboard
- แสดง Summary Cards

### Step 4: Manage Places

- สร้าง places.html
- แสดงรายการ
- เพิ่ม/แก้ไข/ลบ
- เชื่อม API

### Step 5: Manage Routes

- สร้าง routes.html
- จัดลำดับสถานที่ในเส้นทาง
- เชื่อม route_places

### Step 6: Manage Products

- สร้าง products.html
- เชื่อม CRUD

### Step 7: Manage Events

- สร้าง events.html
- เชื่อม CRUD

### Step 8: Manage Reviews

- สร้าง reviews.html
- อนุมัติ/ซ่อน/ลบรีวิว

### Step 9: Manage Gallery

- สร้าง gallery.html
- เพิ่มรูป/วิดีโอจาก URL

### Step 10: Settings

- สร้าง settings.html
- แก้ไขค่าระบบ

### Step 11: Responsive & Polish

- ตรวจมือถือ
- ตรวจ desktop
- ตรวจ error state
- ตรวจ permission
- ปรับ UI ให้สอดคล้องกับ DESIGN.md

---

## 29. Codex Instructions for Admin CMS

เมื่อใช้ Codex สร้างหรือแก้ Admin / CMS ให้ยึดกติกานี้:

1. อ่าน `docs/ADMIN_CMS_SPEC.md`, `docs/API_SPEC.md`, `docs/DATA_SCHEMA.md` และ `docs/DESIGN.md` ก่อนเริ่ม
2. ห้ามสร้าง field นอกเหนือจาก schema โดยไม่จำเป็น
3. ห้ามเปลี่ยนชื่อ API action เอง
4. ห้ามลบข้อมูลจริง ให้ใช้ soft delete
5. ทุกหน้า Admin ต้องตรวจ session
6. ทุกฟอร์มต้อง validate
7. ทุก action ต้องมี Toast
8. ทุกรายการต้องมี status badge
9. Admin mobile ต้องใช้งานได้จริง
10. ถ้ายังไม่ทำ upload file ให้ใช้ image URL ก่อน
11. ห้ามเพิ่ม framework ใหม่โดยไม่ได้รับอนุญาต
12. ถ้าไม่แน่ใจ ให้ถามก่อน ไม่เดา

---

## 30. Final Admin CMS Direction

Admin / CMS ของ **Takhun Trip** ต้องเป็นระบบที่:

- ใช้งานง่าย
- ไม่ซับซ้อน
- รองรับข้อมูลท่องเที่ยวจริง
- จัดการเนื้อหาได้ครบ
- ใช้ได้ทั้งคอมพิวเตอร์และมือถือ
- เชื่อม Google Sheets ได้ตรงตาม schema
- มีระบบตรวจสอบรีวิวก่อนเผยแพร่
- ใช้ soft delete เพื่อป้องกันข้อมูลหาย
- มี UX ที่ช่วยให้ผู้ดูแลทำงานได้เร็ว
- ดูแลต่อได้จริงหลังส่งมอบโครงการ

เป้าหมายสำคัญคือให้ผู้ดูแลสามารถจัดการข้อมูลของเว็บแอปได้เอง โดยไม่ต้องแก้โค้ด
