# DATA_SCHEMA.md — Takhun Trip

เอกสารนี้กำหนดโครงสร้างข้อมูลของเว็บแอป **Takhun Trip** สำหรับใช้ควบคุมการสร้างฐานข้อมูลใน Google Sheets และการเชื่อมต่อกับ Google Apps Script / Frontend ผ่าน API

เป้าหมายของไฟล์นี้คือให้ Codex ใช้เป็นมาตรฐานเดียวกันในการตั้งชื่อชีต ชื่อฟิลด์ ชนิดข้อมูล ค่าเริ่มต้น สถานะ และความสัมพันธ์ของข้อมูล เพื่อป้องกันการตั้งชื่อ field ซ้ำซ้อนหรือไม่ตรงกันระหว่าง Frontend, Backend และ Google Sheets

---

## 1. Data Architecture Overview

### 1.1 Database

ใช้ **Google Sheets** เป็นฐานข้อมูลหลัก

### 1.2 Backend

ใช้ **Google Apps Script Web App** เป็นตัวกลางในการอ่าน/เขียนข้อมูล

### 1.3 Frontend

ใช้ **HTML5 + CSS3 + Vanilla JavaScript + Fetch API**

### 1.4 File Storage

ใช้ **Google Drive** สำหรับเก็บรูปภาพหรือไฟล์ประกอบ โดยใน Google Sheets ให้เก็บเป็น URL

---

## 2. Core Data Principles

1. ทุกข้อมูลหลักต้องมี `id` เฉพาะของตัวเอง
2. ใช้สถานะ `status` เพื่อควบคุมการเผยแพร่
3. ห้ามลบข้อมูลถาวรทันที ควรใช้ soft delete ด้วย `status = deleted`
4. ข้อมูลที่แสดงในหน้า Public ต้องมี `status = published` เท่านั้น
5. ข้อมูลที่รองรับ 2 ภาษา ให้ใช้ suffix `_th` และ `_en`
6. ถ้าข้อมูลภาษาอังกฤษไม่มี ให้ Frontend fallback เป็นภาษาไทย
7. วันที่ใช้รูปแบบ `YYYY-MM-DD`
8. วันที่และเวลาเก็บเป็นข้อความมาตรฐาน อ่านง่าย และแปลงใช้งานได้
9. พิกัดใช้ WGS84 แบบเลขทศนิยม เช่น `8.987654`, `98.765432`
10. รูปภาพให้เก็บเป็น URL ไม่เก็บไฟล์ใน Google Sheets

---

## 3. Sheet List

Google Sheets ควรมีชีตดังนี้

| Sheet Name | Purpose |
|---|---|
| `places` | ข้อมูลสถานที่ท่องเที่ยว |
| `routes` | ข้อมูลเส้นทางท่องเที่ยว |
| `route_places` | ความสัมพันธ์ระหว่างเส้นทางกับสถานที่ |
| `products` | สินค้าและบริการชุมชน |
| `events` | กิจกรรมและปฏิทินท่องเที่ยว |
| `reviews` | รีวิวและคะแนน |
| `gallery` | รูปภาพและวิดีโอ |
| `categories` | หมวดหมู่กลางของระบบ |
| `settings` | ค่าตั้งค่าระบบ |
| `admins` | ผู้ดูแลระบบ |
| `admin_sessions` | session ฝั่งเซิร์ฟเวอร์สำหรับ Admin |
| `activity_logs` | ประวัติการทำงานของ Admin |
| `trip_templates` | แผนทริปสำเร็จรูปสำหรับ Trip Planner |
| `form_submissions` | ข้อมูลฟอร์มติดต่อหรือประเมินความพึงพอใจ ถ้ามี |

---

## 4. Common Fields

ฟิลด์เหล่านี้ควรใช้ร่วมกันในหลายชีต

| Field | Type | Required | Description |
|---|---|---:|---|
| `created_at` | datetime text | yes | วันที่สร้างข้อมูล |
| `updated_at` | datetime text | yes | วันที่แก้ไขล่าสุด |
| `created_by` | text | no | id หรือ username ของผู้สร้าง |
| `updated_by` | text | no | id หรือ username ของผู้แก้ไขล่าสุด |
| `status` | enum | yes | สถานะข้อมูล |
| `sort_order` | number | no | ลำดับการแสดงผล |
| `note` | text | no | หมายเหตุภายใน |

### 4.1 Common Status Values

| Value | Meaning |
|---|---|
| `draft` | ฉบับร่าง |
| `published` | เผยแพร่ |
| `hidden` | ซ่อน |
| `archived` | เก็บถาวร |
| `deleted` | ลบแบบ soft delete |

---

## 5. Sheet: `places`

**M7 note:** section 25 is the authoritative current Place schema/lifecycle contract. This older baseline table is retained for legacy columns and general context; it does not authorize legacy Place statuses or URL-era Gallery data for M7.

ใช้เก็บข้อมูลสถานที่ท่องเที่ยวทั้งหมด ทั้งอำเภอบ้านตาขุนและอำเภอใกล้เคียง

### 5.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `place_id` | text | yes | `BTK-001` | รหัสสถานที่ |
| `name_th` | text | yes | `วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา` | ชื่อภาษาไทย |
| `name_en` | text | no | `Ratchaprapha Dam Community Tourism Enterprise` | ชื่อภาษาอังกฤษ |
| `slug` | text | no | `ratchaprapha-dam-community` | slug สำหรับ URL ถ้ามี |
| `district` | enum | yes | `ban_ta_khun` | อำเภอ |
| `province` | text | yes | `สุราษฎร์ธานี` | จังหวัด |
| `route_group` | enum | no | `main_point_1` | กลุ่มเส้นทาง |
| `category` | enum | yes | `community_tourism` | ประเภทสถานที่ |
| `sub_category` | text | no | `รถเช่า/จุดบริการ` | ประเภทย่อย |
| `short_description_th` | text | yes | `จุดบริการท่องเที่ยวใกล้เขื่อนรัชชประภา` | คำอธิบายสั้นภาษาไทย |
| `short_description_en` | text | no | `Tourism service point near Ratchaprapha Dam` | คำอธิบายสั้นภาษาอังกฤษ |
| `description_th` | long text | yes | - | รายละเอียดภาษาไทย |
| `description_en` | long text | no | - | รายละเอียดภาษาอังกฤษ |
| `activities_th` | long text/list | no | `ล่องเรือ, พายคายัค` | กิจกรรมภาษาไทย |
| `activities_en` | long text/list | no | `Boat trip, kayaking` | กิจกรรมภาษาอังกฤษ |
| `highlight_th` | text | no | `ทะเลสาบสีเขียวมรกต` | จุดเด่นภาษาไทย |
| `highlight_en` | text | no | `Emerald lake scenery` | จุดเด่นภาษาอังกฤษ |
| `phone` | text | no | `083 789 4493` | เบอร์โทร |
| `line_url` | url | no | - | ลิงก์ LINE |
| `facebook_url` | url | no | - | ลิงก์ Facebook |
| `website_url` | url | no | - | เว็บไซต์ |
| `google_maps_url` | url | no | `https://maps.app.goo.gl/...` | ลิงก์ Google Maps |
| `latitude` | number | no | `8.987654` | ละติจูด |
| `longitude` | number | no | `98.765432` | ลองจิจูด |
| `coordinate_status` | enum | yes | `pending_verify` | สถานะพิกัด |
| `open_time_th` | text | no | `08.00–17.00 น.` | เวลาเปิดปิดภาษาไทย |
| `open_time_en` | text | no | `08:00–17:00` | เวลาเปิดปิดภาษาอังกฤษ |
| `fee_th` | text | no | `ขึ้นอยู่กับกิจกรรม` | ค่าใช้จ่ายภาษาไทย |
| `fee_en` | text | no | `Depends on activity` | ค่าใช้จ่ายภาษาอังกฤษ |
| `cover_image_url` | url | no | - | รูปภาพหลัก |
| `gallery_image_urls` | text/list | no | URL คั่นด้วย `|` | รูปภาพเพิ่มเติม |
| `video_url` | url | no | - | วิดีโอ |
| `tags` | text/list | no | `เขื่อน|ล่องเรือ|ธรรมชาติ` | tag สำหรับค้นหา |
| `recommended_duration` | text | no | `1–2 ชั่วโมง` | ระยะเวลาที่แนะนำ |
| `best_time_th` | text | no | `เช้า / เย็น` | ช่วงเวลาที่เหมาะสม |
| `best_time_en` | text | no | `Morning / Evening` | ช่วงเวลาที่เหมาะสมอังกฤษ |
| `nearby_place_ids` | text/list | no | `BTK-002|BTK-003` | สถานที่ใกล้เคียง |
| `is_featured` | boolean | no | `TRUE` | แสดงเป็นสถานที่เด่น |
| `is_main_route_point` | boolean | no | `TRUE` | เป็นจุดหลักในเส้นทาง 4 จุด |
| `sort_order` | number | no | `1` | ลำดับแสดงผล |
| `status` | enum | yes | `published` | สถานะข้อมูล |
| `created_at` | datetime text | yes | `2026-07-11 10:00:00` | วันที่สร้าง |
| `updated_at` | datetime text | yes | `2026-07-11 10:00:00` | วันที่แก้ไข |

### 5.2 District Enum

| Value | Display TH |
|---|---|
| `ban_ta_khun` | อำเภอบ้านตาขุน |
| `khiri_rat_nikhom` | อำเภอคีรีรัฐนิคม |
| `phanom` | อำเภอพนม |

### 5.3 Route Group Enum

| Value | Meaning |
|---|---|
| `main_point_1` | วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา |
| `main_point_2` | วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน |
| `main_point_3` | วิสาหกิจชุมชนพรุไทย ฮันนี่บี |
| `main_point_4` | วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์ |
| `nearby_khiri_rat_nikhom` | สถานที่ใกล้เคียง อำเภอคีรีรัฐนิคม |
| `nearby_phanom` | สถานที่ใกล้เคียง อำเภอพนม |

### 5.4 Place Category Enum

| Value | Display TH |
|---|---|
| `main_point` | จุดหลัก |
| `community_tourism` | วิสาหกิจชุมชน |
| `nature` | ธรรมชาติ |
| `viewpoint` | จุดชมวิว |
| `lake` | ทะเลสาบ / เขื่อน |
| `activity` | กิจกรรม |
| `food_cafe` | ร้านอาหาร / คาเฟ่ |
| `accommodation` | ที่พัก / แพ |
| `temple_culture` | วัด / วัฒนธรรม |
| `product_shop` | ร้านสินค้า / ของฝาก |
| `waterfall` | น้ำตก |
| `cave` | ถ้ำ |
| `service` | จุดบริการนักท่องเที่ยว |

### 5.5 Coordinate Status Enum

| Value | Meaning |
|---|---|
| `verified` | ยืนยันพิกัดแล้ว |
| `pending_verify` | มีพิกัด/ลิงก์แล้วแต่รอยืนยัน |
| `needs_survey` | ต้องสำรวจภาคสนาม |
| `no_coordinate` | ยังไม่มีพิกัด |
| `approximate` | พิกัดประมาณ |

### 5.6 Initial Places Seed Data

ข้อมูลเริ่มต้นควรมีอย่างน้อยรายการต่อไปนี้

| place_id | name_th | route_group | district | phone | google_maps_url |
|---|---|---|---|---|---|
| `BTK-001` | วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา | `main_point_1` | `ban_ta_khun` | `083 789 4493` | `https://maps.app.goo.gl/w3bUxMLBWFF1THb78` |
| `BTK-002` | วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน | `main_point_2` | `ban_ta_khun` | `087 270 0774` | `https://maps.app.goo.gl/S5tcKDkpDUZQMZfw5` |
| `BTK-003` | วิสาหกิจชุมชนพรุไทย ฮันนี่บี | `main_point_3` | `ban_ta_khun` | `081 396 8145` | `https://maps.app.goo.gl/s8xAKHfxqCozuhEX7` |
| `BTK-004` | วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์ | `main_point_4` | `ban_ta_khun` | `084 843 7924` | `https://maps.app.goo.gl/ofZvwrSAPckbfYZn6` |
| `BTK-005` | วัดเขาพัง | `main_point_4` | `ban_ta_khun` | - | `https://maps.app.goo.gl/zFBfChoV7jpuUH8m6` |
| `KRN-001` | หินพัด / หินนิลเปา | `nearby_khiri_rat_nikhom` | `khiri_rat_nikhom` | - | `https://maps.app.goo.gl/tNE5WbKPDovt7BxQ7` |
| `KRN-002` | ป่าต้นน้ำบ้านน้ำราด | `nearby_khiri_rat_nikhom` | `khiri_rat_nikhom` | `065 698 5176` | `https://maps.app.goo.gl/aw49GXxSTHVGoW9H9` |
| `KRN-003` | OASIS Forest Garden | `nearby_khiri_rat_nikhom` | `khiri_rat_nikhom` | `093 590 8684` | `https://maps.app.goo.gl/egbwZN4BkMqX7QNPA` |
| `PNM-001` | อุทยานแห่งชาติคลองพนม | `nearby_phanom` | `phanom` | `077 270 905` | `https://maps.app.goo.gl/wBby5ZCeJ5gFdT738` |
| `PNM-002` | อุทยานธรรมเขานาในหลวง | `nearby_phanom` | `phanom` | - | `https://maps.app.goo.gl/2s62n8TjaaD9LZpY9` |

---

## 6. Sheet: `routes`

ใช้เก็บข้อมูลเส้นทางท่องเที่ยว

### 6.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `route_id` | text | yes | `ROUTE-001` | รหัสเส้นทาง |
| `name_th` | text | yes | `เส้นทางเที่ยวบ้านตาขุน 4 จุดหลัก` | ชื่อเส้นทางภาษาไทย |
| `name_en` | text | no | `Ban Ta Khun Main Route` | ชื่อภาษาอังกฤษ |
| `slug` | text | no | `ban-ta-khun-main-route` | slug |
| `short_description_th` | text | yes | `เส้นทางแนะนำจากเขื่อนสู่ชุมชน` | คำอธิบายสั้น |
| `short_description_en` | text | no | - | คำอธิบายสั้นอังกฤษ |
| `description_th` | long text | yes | - | รายละเอียดภาษาไทย |
| `description_en` | long text | no | - | รายละเอียดอังกฤษ |
| `duration` | text | no | `1 วัน` | ระยะเวลาแนะนำ |
| `travel_style` | enum/list | no | `nature|community|photo` | สไตล์การเที่ยว |
| `cover_image_url` | url | no | - | รูปปก |
| `map_focus_lat` | number | no | - | พิกัดกลางแผนที่ |
| `map_focus_lng` | number | no | - | พิกัดกลางแผนที่ |
| `is_featured` | boolean | no | `TRUE` | แสดงเป็นเส้นทางเด่น |
| `sort_order` | number | no | `1` | ลำดับ |
| `status` | enum | yes | `published` | สถานะ |
| `created_at` | datetime text | yes | - | วันที่สร้าง |
| `updated_at` | datetime text | yes | - | วันที่แก้ไข |

### 6.2 Initial Routes

| route_id | name_th | duration | travel_style |
|---|---|---|---|
| `ROUTE-001` | เส้นทางเที่ยวบ้านตาขุน 4 จุดหลัก | `1 วัน` | `nature|community|photo` |
| `ROUTE-002` | เส้นทางกุ้ยหลินเมืองไทยและเขื่อนรัชชประภา | `ครึ่งวัน` | `nature|photo` |
| `ROUTE-003` | เส้นทางชุมชน ผ้าทอ น้ำผึ้ง และของดีบ้านตาขุน | `1 วัน` | `community|product|learning` |
| `ROUTE-004` | เส้นทางบ้านเขาเทพพิทักษ์ ภูเขารูปหัวใจ | `ครึ่งวัน` | `photo|community|nature` |
| `ROUTE-005` | เส้นทางเชื่อมอำเภอใกล้เคียง | `2 วัน 1 คืน` | `nature|adventure|camping` |

---

## 7. Sheet: `route_places`

ใช้เก็บความสัมพันธ์ระหว่างเส้นทางกับสถานที่ เพื่อให้จัดลำดับสถานที่ในแต่ละเส้นทางได้

### 7.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `route_place_id` | text | yes | `RP-001` | รหัสรายการ |
| `route_id` | text | yes | `ROUTE-001` | รหัสเส้นทาง |
| `place_id` | text | yes | `BTK-001` | รหัสสถานที่ |
| `day_number` | number | no | `1` | วันที่ของทริป |
| `stop_order` | number | yes | `1` | ลำดับจุด |
| `start_time` | text | no | `09:00` | เวลาเริ่มโดยประมาณ |
| `end_time` | text | no | `10:30` | เวลาสิ้นสุดโดยประมาณ |
| `note_th` | text | no | `เริ่มต้นที่จุดบริการรถเช่า` | หมายเหตุไทย |
| `note_en` | text | no | - | หมายเหตุอังกฤษ |
| `status` | enum | yes | `published` | สถานะ |

### 7.2 Initial Route Places for Main Route

| route_place_id | route_id | place_id | stop_order |
|---|---|---|---:|
| `RP-001` | `ROUTE-001` | `BTK-001` | 1 |
| `RP-002` | `ROUTE-001` | `BTK-002` | 2 |
| `RP-003` | `ROUTE-001` | `BTK-003` | 3 |
| `RP-004` | `ROUTE-001` | `BTK-004` | 4 |

---

## 8. Sheet: `products`

ใช้เก็บข้อมูลสินค้าและบริการชุมชน

### 8.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `product_id` | text | yes | `PROD-001` | รหัสสินค้า/บริการ |
| `name_th` | text | yes | `ผ้าทอมือบ้านเชี่ยวหลาน` | ชื่อไทย |
| `name_en` | text | no | `Ban Chiao Lan Handwoven Fabric` | ชื่ออังกฤษ |
| `category` | enum | yes | `handicraft` | หมวดสินค้า |
| `producer_name` | text | no | `กลุ่มผ้าทอมือบ้านเชี่ยวหลาน` | ผู้ผลิต |
| `related_place_id` | text | no | `BTK-002` | สถานที่ที่เกี่ยวข้อง |
| `district` | enum | no | `ban_ta_khun` | อำเภอ |
| `description_th` | long text | yes | - | รายละเอียดไทย |
| `description_en` | long text | no | - | รายละเอียดอังกฤษ |
| `price_range` | text | no | `เริ่มต้น 150 บาท` | ราคาโดยประมาณ |
| `phone` | text | no | `087 270 0774` | เบอร์โทร |
| `contact_url` | url | no | - | LINE/Facebook/เว็บไซต์ |
| `google_maps_url` | url | no | - | ลิงก์นำทาง |
| `latitude` | number | no | - | ละติจูด |
| `longitude` | number | no | - | ลองจิจูด |
| `image_url` | url | no | - | รูปภาพ |
| `tags` | text/list | no | `ผ้าทอ|ของฝาก` | tag |
| `is_featured` | boolean | no | `TRUE` | สินค้าเด่น |
| `sort_order` | number | no | `1` | ลำดับ |
| `status` | enum | yes | `published` | สถานะ |
| `created_at` | datetime text | yes | - | วันที่สร้าง |
| `updated_at` | datetime text | yes | - | วันที่แก้ไข |

### 8.2 Product Category Enum

| Value | Display TH |
|---|---|
| `food` | อาหาร |
| `souvenir` | ของฝาก |
| `herbal` | สมุนไพร |
| `honey` | น้ำผึ้ง / ผลิตภัณฑ์จากผึ้ง |
| `handicraft` | ผ้าทอ / หัตถกรรม |
| `fruit` | ผลไม้ |
| `community_activity` | กิจกรรมชุมชน |
| `tourism_service` | บริการท่องเที่ยว |
| `accommodation` | ที่พัก / แพ |
| `transport` | รถเช่า / บริการเดินทาง |

---

## 9. Sheet: `events`

ใช้เก็บข้อมูลกิจกรรมและปฏิทินท่องเที่ยว

### 9.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `event_id` | text | yes | `EVT-001` | รหัสกิจกรรม |
| `title_th` | text | yes | `กิจกรรมเปิดเส้นทางท่องเที่ยวบ้านตาขุน` | ชื่อกิจกรรมไทย |
| `title_en` | text | no | `Ban Ta Khun Tourism Route Launch` | ชื่ออังกฤษ |
| `event_type` | enum | yes | `festival` | ประเภทกิจกรรม |
| `event_date` | date text | yes | `2026-08-01` | วันที่จัด |
| `start_time` | time text | no | `10:00` | เวลาเริ่ม |
| `end_time` | time text | no | `16:00` | เวลาสิ้นสุด |
| `location_th` | text | yes | `ตลาดคลองแสง` | สถานที่ภาษาไทย |
| `location_en` | text | no | `Khlong Saeng Market` | สถานที่ภาษาอังกฤษ |
| `related_place_id` | text | no | `BTK-004` | สถานที่เกี่ยวข้อง |
| `description_th` | long text | yes | - | รายละเอียดไทย |
| `description_en` | long text | no | - | รายละเอียดอังกฤษ |
| `image_url` | url | no | - | รูปกิจกรรม |
| `contact_name` | text | no | - | ผู้ประสานงาน |
| `contact_phone` | text | no | - | เบอร์ติดต่อ |
| `register_url` | url | no | - | ลิงก์ลงทะเบียน |
| `google_maps_url` | url | no | - | ลิงก์นำทาง |
| `latitude` | number | no | - | ละติจูด |
| `longitude` | number | no | - | ลองจิจูด |
| `is_featured` | boolean | no | `FALSE` | กิจกรรมเด่น |
| `status` | enum | yes | `published` | สถานะ |
| `created_at` | datetime text | yes | - | วันที่สร้าง |
| `updated_at` | datetime text | yes | - | วันที่แก้ไข |

### 9.2 Event Type Enum

| Value | Display TH |
|---|---|
| `launch` | งานเปิดเส้นทาง |
| `festival` | เทศกาล |
| `community_market` | ตลาดชุมชน |
| `learning` | กิจกรรมเรียนรู้ |
| `seasonal` | กิจกรรมตามฤดูกาล |
| `otop` | สินค้า OTOP / ของดีชุมชน |
| `tourism` | กิจกรรมท่องเที่ยว |
| `other` | อื่น ๆ |

---

## 10. Sheet: `reviews`

ใช้เก็บรีวิวและคะแนนของสถานที่

### 10.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `review_id` | text | yes | `REV-001` | รหัสรีวิว |
| `place_id` | text | yes | `BTK-001` | สถานที่ที่ถูกรีวิว |
| `reviewer_name` | text | no | `นักท่องเที่ยว` | ชื่อผู้รีวิว |
| `is_anonymous` | boolean | no | `FALSE` | ไม่แสดงชื่อหรือไม่ |
| `rating` | number | yes | `5` | คะแนน 1–5 |
| `comment` | text | yes | `วิวสวยมาก เดินทางสะดวก` | ความคิดเห็น |
| `admin_reply` | text | no | - | คำตอบจาก Admin |
| `status` | enum | yes | `pending` | สถานะรีวิว |
| `created_at` | datetime text | yes | - | วันที่ส่ง |
| `updated_at` | datetime text | yes | - | วันที่แก้ไข |
| `approved_at` | datetime text | no | - | วันที่อนุมัติ |
| `approved_by` | text | no | - | ผู้อนุมัติ |

### 10.2 Review Status Enum

| Value | Meaning |
|---|---|
| `pending` | รอตรวจสอบ |
| `approved` | เผยแพร่แล้ว |
| `hidden` | ซ่อน |
| `deleted` | ลบ |

### 10.3 Review Rules

1. รีวิวใหม่ต้องเริ่มต้นที่ `pending`
2. หน้า Public แสดงเฉพาะ `approved`
3. Admin เท่านั้นที่เปลี่ยนสถานะได้
4. คะแนนต้องอยู่ระหว่าง 1–5

---

## 11. Sheet: `gallery`

ใช้เก็บรูปภาพและวิดีโอ

### 11.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `media_id` | text | yes | `GAL-001` | รหัสสื่อ |
| `title_th` | text | yes | `ทะเลสาบเชี่ยวหลาน` | ชื่อไทย |
| `title_en` | text | no | `Cheow Lan Lake` | ชื่ออังกฤษ |
| `media_type` | enum | yes | `image` | ประเภทสื่อ |
| `category` | enum | yes | `place` | หมวด |
| `related_place_id` | text | no | `BTK-001` | สถานที่ที่เกี่ยวข้อง |
| `image_url` | url | no | - | URL รูป |
| `video_url` | url | no | - | URL วิดีโอ |
| `thumbnail_url` | url | no | - | รูป thumbnail |
| `caption_th` | text | no | - | คำบรรยายไทย |
| `caption_en` | text | no | - | คำบรรยายอังกฤษ |
| `credit` | text | no | - | เครดิตภาพ |
| `sort_order` | number | no | `1` | ลำดับ |
| `status` | enum | yes | `published` | สถานะ |
| `created_at` | datetime text | yes | - | วันที่สร้าง |
| `updated_at` | datetime text | yes | - | วันที่แก้ไข |

### 11.2 Media Type Enum

| Value | Meaning |
|---|---|
| `image` | รูปภาพ |
| `video` | วิดีโอ |

### 11.3 Gallery Category Enum

| Value | Display TH |
|---|---|
| `place` | สถานที่ |
| `route` | เส้นทาง |
| `event` | กิจกรรม |
| `product` | สินค้า |
| `community` | ชุมชน |
| `hero` | ภาพ Hero |
| `other` | อื่น ๆ |

---

## 12. Sheet: `categories`

ใช้เก็บหมวดหมู่กลาง เพื่อให้ Admin แก้ไขและเพิ่มหมวดหมู่ได้ในอนาคต

### 12.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `category_id` | text | yes | `CAT-PLACE-NATURE` | รหัสหมวดหมู่ |
| `category_type` | enum | yes | `place` | ประเภทหมวด |
| `name_th` | text | yes | `ธรรมชาติ` | ชื่อไทย |
| `name_en` | text | no | `Nature` | ชื่ออังกฤษ |
| `icon` | text | no | `leaf` | ชื่อ icon |
| `color` | text | no | `#22C55E` | สีหมวด |
| `sort_order` | number | no | `1` | ลำดับ |
| `status` | enum | yes | `published` | สถานะ |

### 12.2 Category Type Enum

| Value | Meaning |
|---|---|
| `place` | หมวดสถานที่ |
| `product` | หมวดสินค้า |
| `event` | หมวดกิจกรรม |
| `gallery` | หมวดแกลเลอรี |
| `route_style` | สไตล์เส้นทาง |

---

## 13. Sheet: `settings`

ใช้เก็บค่าตั้งค่าระบบ

### 13.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `setting_key` | text | yes | `site_name` | key |
| `setting_value` | long text | no | `Takhun Trip` | value |
| `description` | text | no | `ชื่อเว็บแอป` | คำอธิบาย |
| `updated_at` | datetime text | yes | - | วันที่แก้ไข |

### 13.2 Required Settings

| setting_key | Example Value | Description |
|---|---|---|
| `site_name` | `Takhun Trip` | ชื่อเว็บ |
| `site_slogan_th` | `เที่ยวตาขุน ครบในทริปเดียว` | สโลแกนไทย |
| `site_slogan_en` | `Discover Ta Khun in One Trip` | สโลแกนอังกฤษ |
| `default_language` | `th` | ภาษาเริ่มต้น |
| `main_phone` | - | เบอร์หลัก |
| `main_email` | `oh2daycreative@gmail.com` | อีเมล |
| `facebook_url` | - | Facebook |
| `line_url` | - | LINE |
| `logo_url` | - | โลโก้ |
| `hero_image_url` | - | ภาพ Hero |
| `reviews_enabled` | `TRUE` | เปิด/ปิดรีวิว |
| `events_enabled` | `TRUE` | เปิด/ปิดกิจกรรม |
| `maintenance_mode` | `FALSE` | โหมดปิดปรับปรุง |

---

## 14. Sheet: `admins`

ใช้เก็บข้อมูลผู้ดูแลระบบ

### 14.1 Required headers

ทุก header ด้านล่างต้อง present exactly once โดย backend ใช้ order-independent, header-name-based access ลำดับนี้เป็นเพียง preferred order สำหรับชีตว่างใหม่เท่านั้น การย้าย schema ต้องเป็น non-destructive: อาจ append header ที่ขาดเมื่อปลอดภัย แต่ต้อง never reorder คอลัมน์หรือแถวเดิมของชีตที่มีข้อมูลเพื่อให้ตรงกับลำดับนำเสนอ

```text
admin_id
username
display_name
email
password_algorithm
password_hash
password_salt
password_iterations
role
status
last_login_at
created_at
updated_at
```

### 14.2 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `admin_id` | text | yes | `ADM-123e4567-e89b-12d3-a456-426614174000` | `ADM-` และ UUID ที่ server สร้าง |
| `username` | text | yes | `operator` | canonical username สำหรับ login |
| `display_name` | text | yes | `ผู้ดูแลระบบ` | 1-100 Unicode code points |
| `email` | email | no | `operator@example.test` | optional profile/contact value, at most 254 characters; not a login identifier |
| `password_algorithm` | text | yes | `pbkdf2_sha256` | algorithm ที่ต้องตรงค่านี้เท่านั้น |
| `password_hash` | text | yes | - | derived key 32 bytes เป็น unpadded base64url 43-character |
| `password_salt` | text | yes | - | salt ใหม่ 16 bytes เป็น unpadded base64url 22-character |
| `password_iterations` | integer | yes | `120000` | stored value ที่ valid อยู่ในช่วง `100000` ถึง `1000000` |
| `role` | enum | yes | `super_admin` | สิทธิ์ |
| `status` | enum | yes | `active` | สถานะ |
| `last_login_at` | RFC 3339 UTC text | no | - | เข้าใช้ล่าสุด |
| `created_at` | RFC 3339 UTC text | yes | `2026-08-08T04:30:00.000Z` | วันที่สร้าง |
| `updated_at` | RFC 3339 UTC text | yes | `2026-08-08T04:30:00.000Z` | วันที่แก้ไข |

### 14.3 Admin Role Enum

| Value | Meaning |
|---|---|
| `super_admin` | จัดการได้ทุกอย่าง |
| `editor` | เพิ่ม/แก้ไขข้อมูลได้ |
| `reviewer` | ตรวจรีวิวได้ |
| `viewer` | ดูข้อมูลได้อย่างเดียว |

### 14.4 Admin Status Enum

| Value | Meaning |
|---|---|
| `active` | ใช้งานได้ |
| `inactive` | ปิดใช้งาน |
| `deleted` | ลบ |

### 14.5 Credential, input, and write contracts

- Login ใช้ username-only login; `email` is not accepted as a login identifier
- canonical username ต้อง unique after trim and lowercase, มี 3-64 ASCII characters และตรง regex `^[a-z0-9][a-z0-9._-]{2,63}$`
- `password_algorithm` ต้องเป็น `pbkdf2_sha256`; `ADMIN_PBKDF2_ITERATIONS_` สำหรับบัญชีใหม่เท่ากับ `120000`
- salt ใหม่มี 16 bytes และ serialize เป็น 22-character unpadded base64url; hash มี 32 bytes และ serialize เป็น 43-character unpadded base64url
- stored `password_iterations` ต้องเป็น safe integer ตั้งแต่ `100000` ถึง `1000000`
- provisioning password มี 14-128 Unicode code points; login รับได้สูงสุด 128 Unicode code points และทุกกรณีไม่เกิน 256 UTF-8 bytes
- password ใช้ตามที่กรอกโดยมี no Unicode normalization และ no case folding
- plaintext/raw password is never stored ใน Sheets, logs, responses หรือ browser storage
- role ที่อนุญาตมี exactly `super_admin`, `editor`, `reviewer`, `viewer`; status มี exactly `active`, `inactive`, `deleted`
- human free text เช่น `display_name` และ `email` ต้อง formula-safe; strict security fields ต้อง validate แล้วเขียน unchanged โดยไม่เติม apostrophe
- auth timestamps ทุก field เป็น strict canonical RFC 3339 UTC เช่น `2026-08-08T04:30:00.000Z` ไม่ใช้เวลาแสดงผลแบบ Asia/Bangkok

Safe Admin projection มี exactly:

```json
{
  "admin_id": "ADM-123e4567-e89b-12d3-a456-426614174000",
  "username": "operator",
  "display_name": "ผู้ดูแลระบบ",
  "role": "super_admin"
}
```

Projection นี้ห้ามมี `email`, `status`, `password_algorithm`, `password_hash`, `password_salt` หรือ `password_iterations`

---

## 14A. Sheet: `admin_sessions`

`admin_sessions` เป็น authoritative session source บน every protected request; cache หรือข้อมูล identity จาก browser ใช้ยืนยันสิทธิ์แทนชีตนี้ไม่ได้

### 14A.1 Required headers

ทุก header ต้อง present exactly once และอ่านแบบ order-independent ตามชื่อ ห้ามมีคอลัมน์ `raw_token`

```text
session_id
admin_id
token_hash
created_at
expires_at
revoked_at
last_seen_at
```

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `session_id` | text | yes | `SES-123e4567-e89b-12d3-a456-426614174000` | `SES-` และ UUID |
| `admin_id` | text | yes | `ADM-123e4567-e89b-12d3-a456-426614174000` | อ้างถึง Admin |
| `token_hash` | text | yes | - | SHA-256 ของ raw token, 32 bytes เป็น 43-character unpadded base64url |
| `created_at` | RFC 3339 UTC text | yes | `2026-08-08T04:30:00.000Z` | เวลาออก session |
| `expires_at` | RFC 3339 UTC text | yes | `2026-08-08T12:30:00.000Z` | `created_at + 28,800,000` ms |
| `revoked_at` | RFC 3339 UTC text | no | - | ว่างจนกว่าจะ revoke |
| `last_seen_at` | RFC 3339 UTC text | yes | `2026-08-08T04:30:00.000Z` | เท่ากับ created_at ตอนออก session |

- raw token มี 32 bytes และ serialize เป็น 43-character unpadded base64url แต่ raw token is never stored in a Sheet; ส่งออกได้ครั้งเดียวใน successful login response และ browser sessionStorage เท่านั้น
- เก็บเฉพาะ `token_hash` ที่คำนวณด้วย SHA-256; ห้ามใช้ random key เป็น session lookup hash key
- อายุเป็น absolute 8-hour expiry (`28,800,000` ms), with no sliding renewal; `last_seen_at` does not extend expiry
- validation ปฏิเสธที่ exact expiry instant และอ่าน authoritative `admin_sessions` บน every protected request
- security values และ strict RFC 3339 UTC timestamps เขียนและอ่าน unchanged

### 14A.2 Lifecycle and retention contract

`admin_sessions` is append-and-revoke for Milestone 6. Logout updates only `revoked_at` as revocation metadata; the session row is not deleted on logout. `token_hash` remains stored after revocation for lookup and audit, and `session_id`, `admin_id`, `created_at`, `expires_at`, and `last_seen_at` are not removed merely because logout occurs.

Expired session rows remain stored and revoked session rows remain stored for audit. Validation rejects revoked and expired rows but does not remove them. Automatic cleanup or retention deletion of session rows is outside Milestone 6; any later purge or retention policy requires separate reviewed design and implementation.

---

## 14B. Admin authentication property ownership

- Human/operator supplies only `ADMIN_AUTH_RANDOM_KEY`: secret 32 bytes ในรูป 43-character unpadded base64url; documentation and source contain no production random key value
- Code owns `ADMIN_AUTH_RANDOM_COUNTER` and `ADMIN_AUTH_STATE_VERSION`; `ADMIN_AUTH_STATE_VERSION` has exact value `1`, ทั้งสองเป็น not human-managed และห้าม reset/repair แบบเงียบ
- temporary bootstrap properties มี `ADMIN_BOOTSTRAP_ENABLED`, `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`
- There are no default credentials, default Admin username/password หรือ embedded secret; temporary values ต้องถูกล้างตาม bootstrap contract

---

## 14C. Milestone 6 authentication lifecycle

Milestone 6 uses the exact `admins` and `admin_sessions` headers defined above. Required headers are unique, their order is independent, and authentication code resolves every column by header name. No additional authentication columns are implied. All authentication timestamps are canonical RFC3339 UTC values.

The only roles are `super_admin`, `editor`, `reviewer`, and `viewer`. The only Admin statuses are `active`, `inactive`, and `deleted`. Human text fields (`display_name` and `email`) are formula-escaped when written to Sheets; validated security fields, identifiers, hashes, salts, counters, enums, and timestamps are written unchanged.

`setupAdminAuthSchema()` validates the manually supplied `ADMIN_AUTH_RANDOM_KEY`, creates or validates `ADMIN_AUTH_RANDOM_COUNTER`, and creates or validates `ADMIN_AUTH_STATE_VERSION=1`. A caller-held script lock protects random derivation. For every derivation, the incremented counter is persisted before any derived bytes are released; the state version and purpose such as `admin-session-token` provide domain separation. Persistence failures return no bytes. There is no rollback: a skipped counter is never rolled back or reused.

On successful login the critical write order is fixed: update `last_login_at` and `updated_at` on the Admin row, derive the token, then append the complete `admin_sessions` row containing the `token_hash`. The session append is the final security-state write. The raw token is returned only after the append succeeds; it is never stored in a Sheet or log.

`admin_sessions` is append-and-revoke for Milestone 6. Logout updates `revoked_at` rather than deleting a row or clearing `token_hash`. The audit identifiers and timestamps (`session_id`, `admin_id`, `created_at`, `expires_at`, and `last_seen_at`) remain stored. Expired and revoked rows remain for audit, authorization rejects them without deletion, and Milestone 6 has no automatic purge or invented retention duration.

---

## 15. Sheet: `activity_logs`

ใช้บันทึกประวัติการทำงานของ Admin

### 15.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `log_id` | text | yes | `LOG-001` | รหัส log |
| `admin_id` | text | no | `ADM-001` | ผู้ทำรายการ |
| `action` | enum | yes | `create` | action |
| `entity_type` | text | yes | `place` | ประเภทข้อมูล |
| `entity_id` | text | no | `BTK-001` | id ที่เกี่ยวข้อง |
| `description` | text | no | `เพิ่มสถานที่ใหม่` | รายละเอียด |
| `created_at` | datetime text | yes | - | วันที่เกิดรายการ |

### 15.2 Action Enum

| Value | Meaning |
|---|---|
| `create` | เพิ่มข้อมูล |
| `update` | แก้ไขข้อมูล |
| `hide` | ซ่อนข้อมูล |
| `publish` | เผยแพร่ |
| `delete` | ลบ |
| `login` | เข้าสู่ระบบ |
| `logout` | ออกจากระบบ |
| `approve` | อนุมัติ |
| `reject` | ไม่อนุมัติ |

---

## 16. Sheet: `trip_templates`

ใช้เก็บแผนทริปสำเร็จรูปสำหรับ Trip Planner

### 16.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `template_id` | text | yes | `TRIP-001` | รหัส template |
| `name_th` | text | yes | `เที่ยวบ้านตาขุน 1 วัน` | ชื่อไทย |
| `name_en` | text | no | `One Day in Ban Ta Khun` | ชื่ออังกฤษ |
| `duration_type` | enum | yes | `one_day` | ระยะเวลา |
| `travel_style` | text/list | yes | `nature|photo|community` | สไตล์ |
| `place_ids` | text/list | yes | `BTK-001|BTK-002|BTK-003|BTK-004` | สถานที่ |
| `description_th` | long text | no | - | รายละเอียดไทย |
| `description_en` | long text | no | - | รายละเอียดอังกฤษ |
| `cover_image_url` | url | no | - | รูปปก |
| `sort_order` | number | no | `1` | ลำดับ |
| `status` | enum | yes | `published` | สถานะ |

### 16.2 Duration Type Enum

| Value | Display TH |
|---|---|
| `half_day` | ครึ่งวัน |
| `one_day` | 1 วัน |
| `two_days_one_night` | 2 วัน 1 คืน |

### 16.3 Travel Style Enum

| Value | Display TH |
|---|---|
| `nature` | ธรรมชาติ |
| `community` | ชุมชน |
| `photo` | ถ่ายภาพ |
| `family` | ครอบครัว |
| `activity` | กิจกรรม |
| `food_cafe` | ของกิน / คาเฟ่ |
| `product` | สินค้าชุมชน |
| `adventure` | ผจญภัยเบา ๆ |
| `learning` | เรียนรู้ |

---

## 17. Sheet: `form_submissions`

ใช้เก็บข้อมูลฟอร์มทั่วไป เช่น ประเมินความพึงพอใจ หรือแบบฟอร์มติดต่อ

### 17.1 Fields

| Field | Type | Required | Example | Description |
|---|---|---:|---|---|
| `submission_id` | text | yes | `SUB-001` | รหัสรายการ |
| `form_type` | enum | yes | `satisfaction` | ประเภทฟอร์ม |
| `name` | text | no | - | ชื่อผู้กรอก |
| `phone` | text | no | - | เบอร์โทร |
| `email` | email | no | - | อีเมล |
| `rating` | number | no | `5` | คะแนน |
| `message` | long text | no | - | ข้อความ |
| `related_place_id` | text | no | - | สถานที่ที่เกี่ยวข้อง |
| `raw_data` | json text | no | - | ข้อมูลเพิ่มเติมแบบ JSON |
| `status` | enum | yes | `new` | สถานะ |
| `created_at` | datetime text | yes | - | วันที่ส่ง |

### 17.2 Form Type Enum

| Value | Meaning |
|---|---|
| `satisfaction` | แบบประเมินความพึงพอใจ |
| `contact` | ติดต่อสอบถาม |
| `event_interest` | สนใจกิจกรรม |
| `suggestion` | ข้อเสนอแนะ |

---

## 18. API Response Data Shape

ทุก API ควรส่งข้อมูลกลับในรูปแบบเดียวกัน

### 18.1 Success Response

```json
{
  "ok": true,
  "data": {},
  "message": "success"
}
```

### 18.2 List Response

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0
  },
  "message": "success"
}
```

### 18.3 Error Response

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "กรุณากรอกข้อมูลให้ครบ"
  }
}
```

---

## 19. ID Naming Rules

ใช้รูปแบบ ID ให้สั้นและอ่านง่าย

| Entity | Prefix | Example |
|---|---|---|
| Place | `BTK`, `KRN`, `PNM` | `BTK-001` |
| Route | `ROUTE` | `ROUTE-001` |
| Route Place | `RP` | `RP-001` |
| Product | `PROD` | `PROD-001` |
| Event | `EVT` | `EVT-001` |
| Review | `REV` | `REV-001` |
| Gallery | `GAL` | `GAL-001` |
| Category | `CAT` | `CAT-PLACE-NATURE` |
| Admin | `ADM` | `ADM-123e4567-e89b-12d3-a456-426614174000` |
| Admin Session | `SES` | `SES-123e4567-e89b-12d3-a456-426614174000` |
| Log | `LOG` | `LOG-001` |
| Trip Template | `TRIP` | `TRIP-001` |
| Submission | `SUB` | `SUB-001` |

---

## 20. Validation Rules

### 20.1 Place Validation

- `place_id` ห้ามว่าง
- `name_th` ห้ามว่าง
- `district` ต้องอยู่ใน enum
- `category` ต้องอยู่ใน enum
- ถ้ามี `latitude` ต้องมี `longitude`
- ถ้ามี `longitude` ต้องมี `latitude`
- ถ้ามี `phone` ให้เก็บเป็น text ไม่ใช่ number
- `status` ต้องอยู่ใน enum

### 20.2 Review Validation

- `place_id` ห้ามว่าง
- `rating` ต้องเป็น 1–5
- `comment` ห้ามว่าง
- รีวิวใหม่ต้องมี `status = pending`

### 20.3 Admin Validation

- ใช้ exact contracts ในหัวข้อ 14, 14A และ 14B
- required headers ต้อง unique และเข้าถึงตามชื่อ ไม่อิงลำดับคอลัมน์
- credential/session fields ที่ malformed ต้อง fail closed; เฉพาะ `status = active` จึง login ได้

### 20.4 Event Validation

- `title_th` ห้ามว่าง
- `event_date` ห้ามว่าง
- `location_th` ห้ามว่าง
- ถ้ามี `register_url` ต้องเป็น URL

---

## 21. Relationship Summary

```text
routes 1 ---- many route_places
places 1 ---- many route_places

places 1 ---- many reviews
places 1 ---- many gallery
places 1 ---- many products
places 1 ---- many events

trip_templates many ---- many places ผ่าน field place_ids
categories ใช้ประกอบ places/products/events/gallery
admins 1 ---- many activity_logs
admins 1 ---- many admin_sessions
```

---

## 22. Frontend Browser Storage Schema

ใช้ Local Storage เฉพาะข้อมูลชั่วคราวที่ไม่สำคัญ

### 22.1 `TAKHUN_LANG`

```json
"th"
```

### 22.2 `TAKHUN_FAVORITES`

```json
["BTK-001", "BTK-004"]
```

### 22.3 `TAKHUN_TRIP_PLAN`

```json
{
  "duration_type": "one_day",
  "travel_style": ["nature", "photo"],
  "place_ids": ["BTK-001", "BTK-002", "BTK-003", "BTK-004"],
  "updated_at": "2026-07-11 10:00:00"
}
```

### 22.4 `TAKHUN_RECENT_PLACES`

```json
["BTK-004", "BTK-001"]
```

### 22.5 `TAKHUN_ADMIN_SESSION`

Admin authentication ใช้ `sessionStorage only` ภายใต้ key `TAKHUN_ADMIN_SESSION`; มี no localStorage, no cookie auth token และ no URL/query token ค่าเก็บมี exactly ห้า fields ด้านล่างเท่านั้น

```json
{
  "admin_id": "ADM-123e4567-e89b-12d3-a456-426614174000",
  "display_name": "ผู้ดูแลระบบ",
  "role": "super_admin",
  "token": "<43-character-base64url-token>",
  "expires_at": "2026-08-08T12:30:00.000Z"
}
```

---

## 23. Codex Instructions for Data Schema

เมื่อใช้ Codex สร้างหรือแก้ระบบข้อมูล ให้ยึดกติกาดังนี้:

1. อ่าน `docs/DATA_SCHEMA.md` ก่อนสร้าง API หรือ Sheet
2. ใช้ชื่อชีตตามที่กำหนดเท่านั้น
3. ใช้ชื่อ field ตามที่กำหนดเท่านั้น
4. ห้ามเปลี่ยนชื่อ field เอง
5. ถ้าต้องเพิ่ม field ใหม่ ให้เพิ่มในเอกสารนี้ก่อน
6. ข้อมูลสถานที่ต้องใช้ `place_id` เป็น key หลัก
7. ข้อมูลเส้นทางต้องใช้ `route_id` เป็น key หลัก
8. หน้า Public แสดงเฉพาะข้อมูล `status = published`
9. รีวิวใหม่ต้องเป็น `pending`
10. ห้ามเก็บข้อมูลสำคัญใน Local Storage
11. ทุก API ต้องส่ง response ตามมาตรฐาน `ok`, `data`, `message` หรือ `error`
12. ถ้าไม่แน่ใจเรื่องโครงสร้างข้อมูล ให้ถามก่อน ไม่เดา

---

## 24. Minimum Data Acceptance Criteria

ระบบข้อมูลจะถือว่าผ่านเมื่อ:

1. Google Sheets มีชีตหลักครบตามที่กำหนด
2. ชีต `places` มีข้อมูลจุดหลัก 4 จุดของบ้านตาขุน
3. ชีต `routes` มีเส้นทางหลักอย่างน้อย 1 เส้นทาง
4. ชีต `route_places` เชื่อมเส้นทางหลักกับ 4 จุดได้ถูกลำดับ
5. หน้า Public อ่านข้อมูลสถานที่จาก API ได้
6. หน้า Map แสดงหมุดจาก `latitude` และ `longitude` ได้
7. หน้า Route Detail แสดงสถานที่ตามลำดับ `route_places.stop_order`
8. Admin เพิ่ม/แก้ไขข้อมูลสถานที่แล้วแสดงใน Public ได้
9. รีวิวใหม่บันทึกเป็น `pending`
10. Admin อนุมัติรีวิวแล้ว Public แสดงได้
11. ข้อมูลภาษาอังกฤษ fallback เป็นภาษาไทยเมื่อไม่มีข้อมูล
12. ไม่มี field ที่ frontend/backend เรียกใช้แล้วไม่มีอยู่ใน schema

---

## 25. M7 Admin Places authoritative schema override

This section is authoritative for M7 Places and supersedes older general Place wording in this document. It does not redefine status values for Routes, Reviews, Gallery, Admin accounts, or other entities.

### 25.1 Physical sheets and append-only setup

`setupAdminPlaceSchema()` is idempotent: it verifies existing headers, appends only missing headers, creates `place_drafts` only when absent, and never reorders, removes, or rewrites existing rows as part of setup.

`places` retains immutable `place_id`, Place lifecycle/server metadata, and the last promoted Published content. Its M7 appended headers are `address_th`, `address_en`, `facilities_th`, `facilities_en`, `gallery_media_ids`, `entity_version`, `published_version`, `created_by`, `updated_by`, `published_at`, `published_by`, `archived_at`, and `archived_by`.

`place_drafts` holds at most one active mutable Draft Revision per `place_id`. It contains the Place content columns (including address/facilities and `gallery_media_ids`) plus `draft_version`, `base_published_version`, `created_at`, `updated_at`, `created_by`, and `updated_by`. A draft is isolated from Public projections; saving it never changes the published snapshot.

`activity_logs` retains legacy columns and appends `audit_id`, `actor_admin_id`, and `occurred_at`. Every M7 audit also writes compatibility aliases: `log_id = audit_id`, `admin_id = actor_admin_id`, and `created_at = occurred_at`. M7 actions are `CREATE`, `UPDATE_DRAFT`, `PUBLISH`, `UNPUBLISH`, `ARCHIVE`, and `RESTORE` with `entity_type = place`.

### 25.2 Place lifecycle, revisions, and media

M7 Place status is exactly `draft`, `published`, or `archived`. Create produces `draft`; Publish promotes the active draft and produces `published`; Unpublish produces `draft`; Archive accepts draft or published and produces `archived`; Restore produces `draft` and never publishes directly. `published_with_draft` is an Admin-only derived display state, not a stored status.

`entity_version` is the authoritative positive version for a Place identity. The Admin response exposes it as `working_version`; an active draft has `draft_version` equal to that version. `published_version` identifies the last promoted snapshot and is absent/null for a new unpromoted Place. A draft has `base_published_version` identifying the published snapshot it began from (or `0` for a new draft). The server checks `expected_version`; stale writes return `CONFLICT` and make no write or success audit.

`gallery_media_ids` is the authoritative ordered Gallery selection: browser payloads use `""` for empty or an ordered array; Sheets use `""` or pipe serialization. It permits 0–50 unique approved manifest IDs belonging to the same Place and `role = gallery`. `cover_image_url` remains legacy/inert for this contract; the Hero is derived only from the same-Place approved `cover` manifest item and cannot be selected. `gallery_image_urls` is likewise inert. Cross-Place, cover-as-Gallery, duplicate, over-limit, arbitrary URL, source path, or filesystem reference is rejected. Public Detail projects only the stored, ordered published Gallery; draft media never leaks and invalid published serialization yields `[]`.

### 25.3 Migration and operator gate

`inspectAdminPlaceStatusMigration()`, `migrateAdminPlaceLegacyStatuses()`, and `verifyAdminPlaceStatusMigration()` are explicit, non-routed operator functions. They never run during a request. Before migration, a human operator must take and verify a recoverable backup, dry-run and verify row count/ID digest and source statuses, then set the required migration controls. Mapping is non-destructive: legacy `hidden` becomes retained draft content with status `draft`; legacy `deleted` becomes retained content with status `archived`. Unknown statuses, duplicate/blank IDs, missing backup, failed verification, or any mutation failure stops activation and requires restoring/verifying the complete backup. No production migration has been executed by this repository.

## 26. Final Data Direction

โครงสร้างข้อมูลของ **Takhun Trip** ต้องเรียบง่ายแต่รองรับการขยายในอนาคต

หลักสำคัญคือ:

- ใช้ Google Sheets ให้ดูแลง่าย
- ใช้ field ชัดเจนและคงที่
- แยกข้อมูลเป็นชีตตามประเภท
- ใช้สถานะควบคุมการเผยแพร่
- รองรับภาษาไทยและอังกฤษ
- รองรับพิกัดและแผนที่
- รองรับระบบ Admin ที่ใช้งานจริง
- ไม่สร้างโครงสร้างซับซ้อนเกิน MVP
