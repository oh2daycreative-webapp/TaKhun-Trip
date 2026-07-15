# API_SPEC.md — Takhun Trip

เอกสารนี้กำหนดมาตรฐาน API สำหรับเว็บแอป **Takhun Trip** เพื่อใช้ควบคุมการพัฒนา Frontend, Google Apps Script Web App และ Google Sheets ให้ทำงานร่วมกันอย่างเป็นระบบ

ระบบนี้ใช้แนวทาง:

```text
Frontend HTML/CSS/Vanilla JS
→ Fetch API
→ Google Apps Script Web App
→ Google Sheets
```

---

## 1. API Overview

### 1.1 Backend Platform

ใช้ **Google Apps Script Web App** เป็น Backend API

### 1.2 Main Entry Points

Google Apps Script ต้องมี function หลัก:

```javascript
function doGet(e) {}
function doPost(e) {}
```

### 1.3 API Pattern

ใช้ `action` เป็นตัวกำหนดว่าจะเรียกฟังก์ชันใด

ตัวอย่าง GET:

```text
GET {SCRIPT_URL}?action=getPlaces
```

ตัวอย่าง POST:

```json
{
  "action": "createPlace",
  "payload": {
    "name_th": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา"
  }
}
```

### 1.4 Data Format

ทุก API ต้องรับส่งข้อมูลเป็น JSON

### 1.5 Character Encoding

ต้องรองรับภาษาไทยเต็มรูปแบบ

```text
Content-Type: application/json; charset=utf-8
```

---

## 2. API Design Principles

1. ทุก response ต้องมีรูปแบบเดียวกัน
2. ทุก request ต้องมี `action`
3. ทุก POST ต้องมี `payload`
4. Public API อ่านข้อมูลได้โดยไม่ต้อง login
5. Admin API ต้องตรวจ session/token
6. ห้ามให้หน้า Public เห็นข้อมูล `hidden`, `draft`, `deleted`
7. รีวิวใหม่ต้องเข้าสถานะ `pending`
8. ต้อง validate ข้อมูลก่อนบันทึก
9. ต้องใช้ Lock Service กับคำสั่งเขียนข้อมูล
10. ใช้ Cache Service กับข้อมูล Public ที่อ่านบ่อย
11. API ต้องไม่ throw error กลับเป็น HTML
12. Error ต้องอยู่ใน JSON format เท่านั้น

---

## 3. Standard Response Format

### 3.1 Success Response

```json
{
  "ok": true,
  "data": {},
  "message": "success"
}
```

### 3.2 List Response

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

### 3.3 Paginated Response

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 100,
    "page": 1,
    "page_size": 20,
    "total_pages": 5
  },
  "message": "success"
}
```

### 3.4 Error Response

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

## 4. Standard Error Codes

| Code | Meaning |
|---|---|
| `UNKNOWN_ACTION` | ไม่พบ action ที่เรียก |
| `VALIDATION_ERROR` | ข้อมูลไม่ถูกต้องหรือไม่ครบ |
| `NOT_FOUND` | ไม่พบข้อมูล |
| `UNAUTHORIZED` | ยังไม่ได้เข้าสู่ระบบ |
| `FORBIDDEN` | ไม่มีสิทธิ์ทำรายการ |
| `DUPLICATE_ID` | id ซ้ำ |
| `SAVE_FAILED` | บันทึกข้อมูลไม่สำเร็จ |
| `DELETE_FAILED` | ลบข้อมูลไม่สำเร็จ |
| `CACHE_ERROR` | เกิดปัญหากับ cache |
| `SERVER_ERROR` | ข้อผิดพลาดทั่วไปของระบบ |

---

## 5. Request Method Rules

### 5.1 GET

ใช้สำหรับอ่านข้อมูล Public และข้อมูลที่ไม่เปลี่ยนแปลง

ตัวอย่าง:

```text
getPlaces
getPlaceDetail
getRoutes
getRouteDetail
getProducts
getEvents
getGallery
getSettings
```

### 5.2 POST

ใช้สำหรับสร้าง แก้ไข ลบ อนุมัติ และ action ที่เปลี่ยนข้อมูล

ตัวอย่าง:

```text
adminLogin
createPlace
updatePlace
deletePlace
submitReview
approveReview
updateSettings
```

---

## 6. Public API

Public API เป็น API ที่ผู้ใช้ทั่วไปเรียกได้โดยไม่ต้อง Login

---

## 6.1 `getSettings`

ใช้โหลดค่าตั้งค่าระบบ เช่น ชื่อเว็บ สโลแกน โลโก้ Hero Image และข้อมูลติดต่อ

### Request

```text
GET ?action=getSettings
```

### Response

```json
{
  "ok": true,
  "data": {
    "site_name": "Takhun Trip",
    "site_slogan_th": "เที่ยวตาขุน ครบในทริปเดียว",
    "site_slogan_en": "Discover Ta Khun in One Trip",
    "default_language": "th",
    "main_email": "oh2daycreative@gmail.com",
    "main_phone": "",
    "facebook_url": "",
    "line_url": "",
    "logo_url": "",
    "hero_image_url": "",
    "reviews_enabled": true,
    "events_enabled": true
  },
  "message": "success"
}
```

---

## 6.2 `getHomeData`

ใช้โหลดข้อมูลหน้าแรกในครั้งเดียว เพื่อลดจำนวน request

### Request

```text
GET ?action=getHomeData&lang=th
```

### Query Parameters

| Parameter | Required | Example | Description |
|---|---:|---|---|
| `lang` | no | `th` | ภาษา `th` หรือ `en`; ถ้าไม่ส่งหรือส่งค่าอื่นให้ใช้ `th` |

### Response

```json
{
  "ok": true,
  "data": {
    "featured_routes": [],
    "featured_places": [],
    "featured_products": [],
    "upcoming_events": [],
    "gallery_preview": []
  },
  "message": "success"
}
```

### Section Item Projections

แต่ละ section ต้องใช้ public list projection ของ API ต้นทางเท่านั้น ห้ามเพิ่ม response envelope, pagination metadata, status, internal field หรือ field สำหรับ UI โดยเฉพาะ

#### `featured_routes`

ใช้ item projection เดียวกับ `getRoutes`:

```json
{
  "route_id": "ROUTE-001",
  "name": "เส้นทางเที่ยวบ้านตาขุน 4 จุดหลัก",
  "short_description": "เส้นทางแนะนำจากเขื่อนสู่ชุมชน",
  "duration": "1 วัน",
  "travel_style": ["nature", "community", "photo"],
  "cover_image_url": "",
  "is_featured": true
}
```

ส่งเฉพาะข้อมูล `status = published` และ `is_featured = true` หลังเรียงตามกติกาของ `getRoutes` แล้วให้ไม่เกิน 2 รายการ

#### `featured_places`

ใช้ item projection เดียวกับ `getPlaces`:

```json
{
  "place_id": "BTK-001",
  "name": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
  "name_th": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
  "name_en": "Ratchaprapha Dam Community Tourism Enterprise",
  "district": "ban_ta_khun",
  "category": "community_tourism",
  "route_group": "main_point_1",
  "short_description": "จุดบริการท่องเที่ยวใกล้เขื่อนรัชชประภา",
  "phone": "083 789 4493",
  "google_maps_url": "https://maps.app.goo.gl/w3bUxMLBWFF1THb78",
  "latitude": "",
  "longitude": "",
  "cover_image_url": "",
  "is_featured": true,
  "is_main_route_point": true
}
```

ส่งเฉพาะข้อมูล `status = published` และ `is_featured = true` หลังเรียงตามกติกาของ `getPlaces` แล้วให้ไม่เกิน 4 รายการ

#### `featured_products`

ใช้ item projection เดียวกับ `getProducts`:

```json
{
  "product_id": "PROD-001",
  "name": "น้ำผึ้งพรุไทย ฮันนี่บี",
  "category": "honey",
  "producer_name": "วิสาหกิจชุมชนพรุไทย ฮันนี่บี",
  "related_place_id": "BTK-003",
  "description": "",
  "price_range": "",
  "phone": "081 396 8145",
  "contact_url": "",
  "google_maps_url": "https://maps.app.goo.gl/s8xAKHfxqCozuhEX7",
  "image_url": "",
  "is_featured": true
}
```

ส่งเฉพาะข้อมูล `status = published` และ `is_featured = true` หลังเรียงตามกติกาของ `getProducts` แล้วให้ไม่เกิน 4 รายการ

#### `upcoming_events`

ใช้ item projection เดียวกับ `getEvents`:

```json
{
  "event_id": "EVT-001",
  "title": "กิจกรรมเปิดเส้นทางท่องเที่ยวบ้านตาขุน",
  "event_type": "launch",
  "event_date": "2026-08-01",
  "start_time": "10:00",
  "end_time": "16:00",
  "location": "ตลาดคลองแสง",
  "image_url": "",
  "contact_name": "",
  "contact_phone": "",
  "register_url": ""
}
```

ส่งเฉพาะข้อมูล `status = published` ที่มี `event_date` ถูกต้องและมีวันที่ตั้งแต่วันปัจจุบันเป็นต้นไป หลังเรียงตามกติกาของ `getEvents` แล้วให้ไม่เกิน 3 รายการ

#### `gallery_preview`

ใช้ item projection เดียวกับ `getGallery`:

```json
{
  "media_id": "GAL-001",
  "title": "ทะเลสาบเชี่ยวหลาน",
  "media_type": "image",
  "category": "place",
  "related_place_id": "BTK-001",
  "image_url": "",
  "video_url": "",
  "thumbnail_url": "",
  "caption": "",
  "credit": ""
}
```

ส่งเฉพาะข้อมูล `status = published` ที่เป็น media row ถูกต้อง หลังเรียงตามกติกาปัจจุบันของ `getGallery` แล้วให้ไม่เกิน 6 รายการ

### Rules

- Effective language มีเพียง `th` และ `en`: ไม่ส่ง `lang` ให้ใช้ `th`, ส่ง `en` ให้ใช้ `en`, และค่าอื่นให้ normalize เป็น `th`
- ถ้าเลือก `lang=en` แต่ field ภาษาอังกฤษว่าง ให้ fallback เป็นภาษาไทยตามกติกาของ API ต้นทาง
- Deduplicate แต่ละ section ด้วย `route_id`, `place_id`, `product_id`, `event_id` หรือ `media_id` ตาม domain โดยเลือก valid item แรก และต้องรองรับ identifier ที่เหมือนชื่อ property บน prototype ได้อย่างปลอดภัย
- ต้อง filter, deduplicate และเรียงข้อมูลให้เสร็จก่อนใช้ limit `2/4/4/3/6`; equal values ต้องคงลำดับเดิมและห้าม mutate source rows
- Section ที่ไม่มีข้อมูลต้องเป็น `[]`; ถ้าทุก section ไม่มีข้อมูลยังต้องตอบ success พร้อม array ว่างครบทั้ง 5 section
- ถ้าอ่านข้อมูล, build หรือ validate section ใดไม่สำเร็จ ให้ทั้ง request ตอบ safe `SERVER_ERROR`; ห้ามตอบ partial data, warnings หรือ cache failure response
- ใช้ Cache Service 300 วินาที โดยมี effective key เฉพาะ `public:getHomeData:lang=th` และ `public:getHomeData:lang=en`
- Cache เฉพาะ successful response ที่มี envelope, section names และ item projections ตรงตาม contract; cache ที่ parse ไม่ได้ มี shape ผิด หรือมี field เกินต้องถูกละทิ้งและโหลดข้อมูลใหม่
- Cache Service failure ต้องไม่ทำให้ request ล้มเมื่อยังอ่านข้อมูลต้นทางได้ และห้ามใช้ Lock Service
- `getHomeData` ไม่อ่านหรือส่ง Settings และไม่ใช้ `maintenance_mode`, `events_enabled` หรือ `reviews_enabled` ควบคุม section ใด

---

## 6.3 `getPlaces`

ใช้โหลดรายการสถานที่ท่องเที่ยว

### Request

```text
GET ?action=getPlaces&district=ban_ta_khun&category=nature&route_group=main_point_1&keyword=เขื่อน&page=1&page_size=20&lang=th
```

### Query Parameters

| Parameter | Required | Example | Description |
|---|---:|---|---|
| `district` | no | `ban_ta_khun` | กรองอำเภอ |
| `category` | no | `nature` | กรองประเภท |
| `route_group` | no | `main_point_1` | กรองกลุ่มเส้นทาง |
| `keyword` | no | `เขื่อน` | คำค้น |
| `featured` | no | `true` | เฉพาะสถานที่เด่น |
| `main_route` | no | `true` | เฉพาะจุดหลัก |
| `page` | no | `1` | หน้าที่ต้องการ |
| `page_size` | no | `20` | จำนวนต่อหน้า |
| `lang` | no | `th` | ภาษา |

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "place_id": "BTK-001",
        "name": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
        "name_th": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
        "name_en": "Ratchaprapha Dam Community Tourism Enterprise",
        "district": "ban_ta_khun",
        "category": "community_tourism",
        "route_group": "main_point_1",
        "short_description": "จุดบริการท่องเที่ยวใกล้เขื่อนรัชชประภา",
        "phone": "083 789 4493",
        "google_maps_url": "https://maps.app.goo.gl/w3bUxMLBWFF1THb78",
        "latitude": "",
        "longitude": "",
        "cover_image_url": "",
        "is_featured": true,
        "is_main_route_point": true
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  },
  "message": "success"
}
```

### Rules

- แสดงเฉพาะ `status = published`
- ถ้าเลือก `lang=en` แต่ไม่มีข้อมูลอังกฤษ ให้ fallback เป็นภาษาไทย
- ถ้าไม่มีพิกัด ให้ยังแสดงในรายการได้ แต่ไม่ต้องแสดงเป็นหมุดบนแผนที่

---

## 6.4 `getPlaceDetail`

ใช้โหลดรายละเอียดสถานที่

### Request

```text
GET ?action=getPlaceDetail&place_id=BTK-001&lang=th
```

### Query Parameters

| Parameter | Required | Example |
|---|---:|---|
| `place_id` | yes | `BTK-001` |
| `lang` | no | `th` |

### Response

```json
{
  "ok": true,
  "data": {
    "place_id": "BTK-001",
    "name": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
    "name_th": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
    "name_en": "",
    "district": "ban_ta_khun",
    "province": "สุราษฎร์ธานี",
    "route_group": "main_point_1",
    "category": "community_tourism",
    "short_description": "",
    "description": "",
    "activities": "",
    "highlight": "",
    "phone": "083 789 4493",
    "line_url": "",
    "facebook_url": "",
    "website_url": "",
    "google_maps_url": "https://maps.app.goo.gl/w3bUxMLBWFF1THb78",
    "latitude": "",
    "longitude": "",
    "coordinate_status": "pending_verify",
    "open_time": "",
    "fee": "",
    "cover_image_url": "",
    "gallery_image_urls": [],
    "video_url": "",
    "tags": [],
    "recommended_duration": "",
    "best_time": "",
    "nearby_places": [],
    "reviews_summary": {
      "average_rating": 0,
      "review_count": 0
    }
  },
  "message": "success"
}
```

### Error

ถ้าไม่พบข้อมูล:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "ไม่พบสถานที่นี้"
  }
}
```

---

## 6.5 `getMapPlaces`

ใช้โหลดข้อมูลสำหรับแผนที่โดยเฉพาะ

### Request

```text
GET ?action=getMapPlaces&category=all&route=main&lang=th
```

### Query Parameters

| Parameter | Required | Example | Description |
|---|---:|---|---|
| `category` | no | `nature` | กรองหมวด |
| `route` | no | `main` | ถ้า `main` ให้เน้นเส้นทางหลัก 4 จุด |
| `district` | no | `ban_ta_khun` | กรองอำเภอ |
| `lang` | no | `th` | ภาษา |

### Response

```json
{
  "ok": true,
  "data": {
    "places": [
      {
        "place_id": "BTK-001",
        "name": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
        "category": "community_tourism",
        "district": "ban_ta_khun",
        "route_group": "main_point_1",
        "latitude": 0,
        "longitude": 0,
        "google_maps_url": "https://maps.app.goo.gl/w3bUxMLBWFF1THb78",
        "phone": "083 789 4493",
        "cover_image_url": "",
        "is_main_route_point": true,
        "sort_order": 1
      }
    ],
    "main_route": {
      "route_id": "ROUTE-001",
      "place_ids": ["BTK-001", "BTK-002", "BTK-003", "BTK-004"]
    }
  },
  "message": "success"
}
```

### Rules

- ส่งเฉพาะสถานที่ที่มี latitude และ longitude สำหรับการปักหมุด
- ถ้าไม่มีพิกัด ไม่ต้องส่งใน `places` ของแผนที่
- เส้นทางหลักต้องเรียงตาม `sort_order` หรือข้อมูลใน `route_places`

---

## 6.6 `getRoutes`

ใช้โหลดรายการเส้นทางท่องเที่ยว

### Request

```text
GET ?action=getRoutes&featured=true&lang=th
```

### Query Parameters

| Parameter | Required | Example |
|---|---:|---|
| `featured` | no | `true` |
| `style` | no | `nature` |
| `lang` | no | `th` |

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "route_id": "ROUTE-001",
        "name": "เส้นทางเที่ยวบ้านตาขุน 4 จุดหลัก",
        "short_description": "เส้นทางแนะนำจากเขื่อนสู่ชุมชน",
        "duration": "1 วัน",
        "travel_style": ["nature", "community", "photo"],
        "cover_image_url": "",
        "is_featured": true
      }
    ],
    "total": 1
  },
  "message": "success"
}
```

---

## 6.7 `getRouteDetail`

ใช้โหลดรายละเอียดเส้นทางและสถานที่ในเส้นทาง

### Request

```text
GET ?action=getRouteDetail&route_id=ROUTE-001&lang=th
```

### Response

```json
{
  "ok": true,
  "data": {
    "route_id": "ROUTE-001",
    "name": "เส้นทางเที่ยวบ้านตาขุน 4 จุดหลัก",
    "description": "",
    "duration": "1 วัน",
    "travel_style": ["nature", "community", "photo"],
    "cover_image_url": "",
    "places": [
      {
        "place_id": "BTK-001",
        "stop_order": 1,
        "name": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
        "short_description": "",
        "phone": "083 789 4493",
        "google_maps_url": "https://maps.app.goo.gl/w3bUxMLBWFF1THb78",
        "latitude": "",
        "longitude": "",
        "cover_image_url": ""
      }
    ]
  },
  "message": "success"
}
```

### Rules

- รายการ `places` ต้องเรียงตาม `route_places.stop_order`
- หน้า Route Detail ใช้ข้อมูลนี้สร้าง Timeline

---

## 6.8 `getProducts`

ใช้โหลดสินค้าและบริการชุมชน

### Request

```text
GET ?action=getProducts&category=honey&district=ban_ta_khun&keyword=น้ำผึ้ง&page=1&page_size=20&lang=th
```

### Query Parameters

| Parameter | Required | Example |
|---|---:|---|
| `category` | no | `honey` |
| `district` | no | `ban_ta_khun` |
| `related_place_id` | no | `BTK-003` |
| `keyword` | no | `น้ำผึ้ง` |
| `featured` | no | `true` |
| `page` | no | `1` |
| `page_size` | no | `20` |
| `lang` | no | `th` |

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "product_id": "PROD-001",
        "name": "น้ำผึ้งพรุไทย ฮันนี่บี",
        "category": "honey",
        "producer_name": "วิสาหกิจชุมชนพรุไทย ฮันนี่บี",
        "related_place_id": "BTK-003",
        "description": "",
        "price_range": "",
        "phone": "081 396 8145",
        "contact_url": "",
        "google_maps_url": "https://maps.app.goo.gl/s8xAKHfxqCozuhEX7",
        "image_url": "",
        "is_featured": true
      }
    ],
    "total": 1
  },
  "message": "success"
}
```

---

## 6.9 `getProductDetail`

ใช้โหลดรายละเอียดสินค้า/บริการ

### Request

```text
GET ?action=getProductDetail&product_id=PROD-001&lang=th
```

### Response

```json
{
  "ok": true,
  "data": {
    "product_id": "PROD-001",
    "name": "น้ำผึ้งพรุไทย ฮันนี่บี",
    "category": "honey",
    "producer_name": "วิสาหกิจชุมชนพรุไทย ฮันนี่บี",
    "related_place": {
      "place_id": "BTK-003",
      "name": "วิสาหกิจชุมชนพรุไทย ฮันนี่บี"
    },
    "description": "",
    "price_range": "",
    "phone": "081 396 8145",
    "contact_url": "",
    "google_maps_url": "https://maps.app.goo.gl/s8xAKHfxqCozuhEX7",
    "latitude": "",
    "longitude": "",
    "image_url": "",
    "tags": []
  },
  "message": "success"
}
```

---

## 6.10 `getEvents`

ใช้โหลดรายการกิจกรรม

### Request

```text
GET ?action=getEvents&status=upcoming&type=festival&month=2026-08&lang=th
```

### Query Parameters

| Parameter | Required | Example | Description |
|---|---:|---|---|
| `status` | no | `upcoming` | `upcoming`, `past`, `all` |
| `type` | no | `festival` | ประเภทกิจกรรม |
| `month` | no | `2026-08` | เดือน |
| `featured` | no | `true` | กิจกรรมเด่น |
| `lang` | no | `th` | ภาษา |

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "event_id": "EVT-001",
        "title": "กิจกรรมเปิดเส้นทางท่องเที่ยวบ้านตาขุน",
        "event_type": "launch",
        "event_date": "2026-08-01",
        "start_time": "10:00",
        "end_time": "16:00",
        "location": "ตลาดคลองแสง",
        "image_url": "",
        "contact_name": "",
        "contact_phone": "",
        "register_url": ""
      }
    ],
    "total": 1
  },
  "message": "success"
}
```

---

## 6.11 `getEventDetail`

ใช้โหลดรายละเอียดกิจกรรม

### Request

```text
GET ?action=getEventDetail&event_id=EVT-001&lang=th
```

### Response

```json
{
  "ok": true,
  "data": {
    "event_id": "EVT-001",
    "title": "กิจกรรมเปิดเส้นทางท่องเที่ยวบ้านตาขุน",
    "event_type": "launch",
    "event_date": "2026-08-01",
    "start_time": "10:00",
    "end_time": "16:00",
    "location": "ตลาดคลองแสง",
    "description": "",
    "image_url": "",
    "contact_name": "",
    "contact_phone": "",
    "register_url": "",
    "google_maps_url": "",
    "latitude": "",
    "longitude": ""
  },
  "message": "success"
}
```

---

## 6.12 `getGallery`

ใช้โหลดแกลเลอรีภาพและวิดีโอ

### Request

```text
GET ?action=getGallery&category=place&related_place_id=BTK-001&lang=th
```

### Query Parameters

| Parameter | Required | Example |
|---|---:|---|
| `category` | no | `place` |
| `media_type` | no | `image` |
| `related_place_id` | no | `BTK-001` |
| `lang` | no | `th` |

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "media_id": "GAL-001",
        "title": "ทะเลสาบเชี่ยวหลาน",
        "media_type": "image",
        "category": "place",
        "related_place_id": "BTK-001",
        "image_url": "",
        "video_url": "",
        "thumbnail_url": "",
        "caption": "",
        "credit": ""
      }
    ],
    "total": 1
  },
  "message": "success"
}
```

---

## 6.13 `getReviews`

ใช้โหลดรีวิวที่ผ่านการอนุมัติแล้วของสถานที่

### Request

```text
GET ?action=getReviews&place_id=BTK-001&page=1&page_size=10
```

### Query Parameters

| Parameter | Required | Example |
|---|---:|---|
| `place_id` | yes | `BTK-001` |
| `page` | no | `1` |
| `page_size` | no | `10` |

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "review_id": "REV-001",
        "place_id": "BTK-001",
        "reviewer_name": "นักท่องเที่ยว",
        "is_anonymous": false,
        "rating": 5,
        "comment": "วิวสวยมาก",
        "admin_reply": "",
        "created_at": "2026-07-11 10:00:00"
      }
    ],
    "summary": {
      "average_rating": 5,
      "review_count": 1
    },
    "total": 1
  },
  "message": "success"
}
```

### Rules

- แสดงเฉพาะ `status = approved`
- ถ้า `is_anonymous = true` ให้แสดงชื่อเป็น `นักท่องเที่ยว`

---

## 6.14 `submitReview`

ใช้ส่งรีวิวใหม่จากผู้ใช้ทั่วไป

### Request

```text
POST
```

```json
{
  "action": "submitReview",
  "payload": {
    "place_id": "BTK-001",
    "reviewer_name": "โอ๋",
    "is_anonymous": false,
    "rating": 5,
    "comment": "วิวสวยมาก เดินทางสะดวก"
  }
}
```

### Validation

| Field | Rule |
|---|---|
| `place_id` | required |
| `rating` | required, number 1–5 |
| `comment` | required, max 1000 characters |
| `reviewer_name` | optional |
| `is_anonymous` | boolean |

### Response

```json
{
  "ok": true,
  "data": {
    "review_id": "REV-001",
    "status": "pending"
  },
  "message": "ส่งรีวิวแล้ว รอตรวจสอบก่อนเผยแพร่"
}
```

### Rules

- รีวิวใหม่ต้องบันทึกเป็น `pending`
- ห้ามแสดงรีวิวทันที
- ใช้ Lock Service ขณะบันทึก

---

## 6.15 `searchAll`

ใช้ค้นหารวมจากสถานที่ สินค้า กิจกรรม และเส้นทาง

### Request

```text
GET ?action=searchAll&keyword=น้ำผึ้ง&lang=th
```

### Response

```json
{
  "ok": true,
  "data": {
    "places": [],
    "products": [],
    "events": [],
    "routes": [],
    "total": 0
  },
  "message": "success"
}
```

### Rules

- ค้นจากเฉพาะข้อมูล `published`
- จำกัดผลลัพธ์แต่ละประเภท เช่น 5–10 รายการ
- ถ้า keyword ว่าง ให้ส่ง empty result

---

## 7. Admin API

Admin API ต้องตรวจสอบ session/token ทุกครั้ง ยกเว้น `adminLogin`

---

## 7.1 `adminLogin`

ใช้เข้าสู่ระบบ Admin

### Request

```json
{
  "action": "adminLogin",
  "payload": {
    "username": "admin",
    "password": "password"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "admin_id": "ADM-001",
    "display_name": "ผู้ดูแลระบบ",
    "role": "super_admin",
    "token": "session-token",
    "expires_at": "2026-07-11 18:00:00"
  },
  "message": "เข้าสู่ระบบสำเร็จ"
}
```

### Error

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
  }
}
```

### Rules

- ตรวจ `username`
- ตรวจ password กับ `password_hash`
- Admin ต้องมี `status = active`
- บันทึก `last_login_at`
- สร้าง session/token ที่มีวันหมดอายุ

---

## 7.2 `adminLogout`

ใช้ logout

### Request

```json
{
  "action": "adminLogout",
  "token": "session-token"
}
```

### Response

```json
{
  "ok": true,
  "data": {},
  "message": "ออกจากระบบแล้ว"
}
```

---

## 7.3 `adminGetDashboard`

โหลดข้อมูลสรุป Dashboard

### Request

```json
{
  "action": "adminGetDashboard",
  "token": "session-token"
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "total_places": 20,
    "total_routes": 5,
    "total_products": 12,
    "total_events": 3,
    "pending_reviews": 4,
    "total_gallery": 30,
    "latest_reviews": [],
    "upcoming_events": []
  },
  "message": "success"
}
```

---

## 7.4 `adminGetPlaces`

โหลดรายการสถานที่สำหรับ Admin

### Request

```json
{
  "action": "adminGetPlaces",
  "token": "session-token",
  "payload": {
    "keyword": "",
    "district": "",
    "category": "",
    "status": "",
    "page": 1,
    "page_size": 20
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "page_size": 20
  },
  "message": "success"
}
```

### Rules

- Admin เห็นได้ทุก status ยกเว้นถ้ากรองเอง
- รองรับ search/filter/pagination

---

## 7.5 `createPlace`

เพิ่มสถานที่

### Request

```json
{
  "action": "createPlace",
  "token": "session-token",
  "payload": {
    "name_th": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
    "name_en": "",
    "district": "ban_ta_khun",
    "province": "สุราษฎร์ธานี",
    "route_group": "main_point_1",
    "category": "community_tourism",
    "short_description_th": "จุดบริการท่องเที่ยวใกล้เขื่อนรัชชประภา",
    "description_th": "",
    "phone": "083 789 4493",
    "google_maps_url": "https://maps.app.goo.gl/w3bUxMLBWFF1THb78",
    "latitude": "",
    "longitude": "",
    "coordinate_status": "pending_verify",
    "cover_image_url": "",
    "status": "published"
  }
}
```

### Validation

| Field | Rule |
|---|---|
| `name_th` | required |
| `district` | required |
| `category` | required |
| `status` | required |
| `latitude` / `longitude` | ถ้ามี ต้องมีคู่กัน |

### Response

```json
{
  "ok": true,
  "data": {
    "place_id": "BTK-001"
  },
  "message": "บันทึกสถานที่เรียบร้อย"
}
```

### Rules

- สร้าง `place_id` อัตโนมัติถ้าไม่ได้ส่งมา
- ใช้ Lock Service
- บันทึก activity log
- clear cache ที่เกี่ยวข้อง

---

## 7.6 `updatePlace`

แก้ไขสถานที่

### Request

```json
{
  "action": "updatePlace",
  "token": "session-token",
  "payload": {
    "place_id": "BTK-001",
    "name_th": "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา",
    "status": "published"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "place_id": "BTK-001"
  },
  "message": "แก้ไขสถานที่เรียบร้อย"
}
```

### Rules

- ต้องมี `place_id`
- ถ้าไม่พบให้ส่ง `NOT_FOUND`
- อัปเดต `updated_at`
- clear cache ที่เกี่ยวข้อง

---

## 7.7 `deletePlace`

ลบสถานที่แบบ soft delete

### Request

```json
{
  "action": "deletePlace",
  "token": "session-token",
  "payload": {
    "place_id": "BTK-001"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "place_id": "BTK-001",
    "status": "deleted"
  },
  "message": "ลบสถานที่เรียบร้อย"
}
```

### Rules

- ไม่ลบ row จริง
- เปลี่ยน `status = deleted`
- clear cache

---

## 7.8 `adminGetRoutes`

โหลดรายการเส้นทางสำหรับ Admin

### Request

```json
{
  "action": "adminGetRoutes",
  "token": "session-token",
  "payload": {
    "keyword": "",
    "status": "",
    "page": 1,
    "page_size": 20
  }
}
```

### Response

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

---

## 7.9 `createRoute`

เพิ่มเส้นทาง

### Request

```json
{
  "action": "createRoute",
  "token": "session-token",
  "payload": {
    "name_th": "เส้นทางเที่ยวบ้านตาขุน 4 จุดหลัก",
    "name_en": "",
    "short_description_th": "เส้นทางแนะนำจากเขื่อนสู่ชุมชน",
    "description_th": "",
    "duration": "1 วัน",
    "travel_style": ["nature", "community", "photo"],
    "place_ids": ["BTK-001", "BTK-002", "BTK-003", "BTK-004"],
    "status": "published"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "route_id": "ROUTE-001"
  },
  "message": "บันทึกเส้นทางเรียบร้อย"
}
```

### Rules

- บันทึกข้อมูลลง `routes`
- บันทึกความสัมพันธ์ลง `route_places`
- `place_ids` ต้องเรียงตามลำดับเส้นทาง
- clear cache

---

## 7.10 `updateRoute`

แก้ไขเส้นทาง

### Request

```json
{
  "action": "updateRoute",
  "token": "session-token",
  "payload": {
    "route_id": "ROUTE-001",
    "name_th": "เส้นทางเที่ยวบ้านตาขุน 4 จุดหลัก",
    "place_ids": ["BTK-001", "BTK-002", "BTK-003", "BTK-004"],
    "status": "published"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "route_id": "ROUTE-001"
  },
  "message": "แก้ไขเส้นทางเรียบร้อย"
}
```

---

## 7.11 `deleteRoute`

ลบเส้นทางแบบ soft delete

### Request

```json
{
  "action": "deleteRoute",
  "token": "session-token",
  "payload": {
    "route_id": "ROUTE-001"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "route_id": "ROUTE-001",
    "status": "deleted"
  },
  "message": "ลบเส้นทางเรียบร้อย"
}
```

---

## 7.12 `adminGetProducts`

โหลดสินค้า/บริการสำหรับ Admin

### Request

```json
{
  "action": "adminGetProducts",
  "token": "session-token",
  "payload": {
    "keyword": "",
    "category": "",
    "status": "",
    "page": 1,
    "page_size": 20
  }
}
```

### Response

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

---

## 7.13 `createProduct`

เพิ่มสินค้า/บริการ

### Request

```json
{
  "action": "createProduct",
  "token": "session-token",
  "payload": {
    "name_th": "น้ำผึ้งพรุไทย ฮันนี่บี",
    "name_en": "",
    "category": "honey",
    "producer_name": "วิสาหกิจชุมชนพรุไทย ฮันนี่บี",
    "related_place_id": "BTK-003",
    "description_th": "",
    "price_range": "",
    "phone": "081 396 8145",
    "contact_url": "",
    "image_url": "",
    "status": "published"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "product_id": "PROD-001"
  },
  "message": "บันทึกสินค้าเรียบร้อย"
}
```

---

## 7.14 `updateProduct`

แก้ไขสินค้า/บริการ

```json
{
  "action": "updateProduct",
  "token": "session-token",
  "payload": {
    "product_id": "PROD-001",
    "name_th": "น้ำผึ้งพรุไทย ฮันนี่บี",
    "status": "published"
  }
}
```

---

## 7.15 `deleteProduct`

ลบสินค้า/บริการแบบ soft delete

```json
{
  "action": "deleteProduct",
  "token": "session-token",
  "payload": {
    "product_id": "PROD-001"
  }
}
```

---

## 7.16 `adminGetEvents`

โหลดกิจกรรมสำหรับ Admin

```json
{
  "action": "adminGetEvents",
  "token": "session-token",
  "payload": {
    "keyword": "",
    "status": "",
    "page": 1,
    "page_size": 20
  }
}
```

---

## 7.17 `createEvent`

เพิ่มกิจกรรม

```json
{
  "action": "createEvent",
  "token": "session-token",
  "payload": {
    "title_th": "กิจกรรมเปิดเส้นทางท่องเที่ยวบ้านตาขุน",
    "title_en": "",
    "event_type": "launch",
    "event_date": "2026-08-01",
    "start_time": "10:00",
    "end_time": "16:00",
    "location_th": "ตลาดคลองแสง",
    "description_th": "",
    "image_url": "",
    "contact_name": "",
    "contact_phone": "",
    "register_url": "",
    "status": "published"
  }
}
```

---

## 7.18 `updateEvent`

แก้ไขกิจกรรม

```json
{
  "action": "updateEvent",
  "token": "session-token",
  "payload": {
    "event_id": "EVT-001",
    "title_th": "กิจกรรมเปิดเส้นทางท่องเที่ยวบ้านตาขุน",
    "status": "published"
  }
}
```

---

## 7.19 `deleteEvent`

ลบกิจกรรมแบบ soft delete

```json
{
  "action": "deleteEvent",
  "token": "session-token",
  "payload": {
    "event_id": "EVT-001"
  }
}
```

---

## 7.20 `adminGetReviews`

โหลดรีวิวสำหรับ Admin

### Request

```json
{
  "action": "adminGetReviews",
  "token": "session-token",
  "payload": {
    "status": "pending",
    "place_id": "",
    "page": 1,
    "page_size": 20
  }
}
```

### Response

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

---

## 7.21 `approveReview`

อนุมัติรีวิว

```json
{
  "action": "approveReview",
  "token": "session-token",
  "payload": {
    "review_id": "REV-001"
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "review_id": "REV-001",
    "status": "approved"
  },
  "message": "อนุมัติรีวิวเรียบร้อย"
}
```

---

## 7.22 `hideReview`

ซ่อนรีวิว

```json
{
  "action": "hideReview",
  "token": "session-token",
  "payload": {
    "review_id": "REV-001"
  }
}
```

---

## 7.23 `deleteReview`

ลบรีวิวแบบ soft delete

```json
{
  "action": "deleteReview",
  "token": "session-token",
  "payload": {
    "review_id": "REV-001"
  }
}
```

---

## 7.24 `adminGetGallery`

โหลดแกลเลอรีสำหรับ Admin

```json
{
  "action": "adminGetGallery",
  "token": "session-token",
  "payload": {
    "category": "",
    "media_type": "",
    "status": "",
    "page": 1,
    "page_size": 20
  }
}
```

---

## 7.25 `createGalleryItem`

เพิ่มรูปภาพ/วิดีโอ

```json
{
  "action": "createGalleryItem",
  "token": "session-token",
  "payload": {
    "title_th": "ทะเลสาบเชี่ยวหลาน",
    "title_en": "",
    "media_type": "image",
    "category": "place",
    "related_place_id": "BTK-001",
    "image_url": "",
    "video_url": "",
    "thumbnail_url": "",
    "caption_th": "",
    "credit": "",
    "status": "published"
  }
}
```

---

## 7.26 `updateGalleryItem`

แก้ไขรูปภาพ/วิดีโอ

```json
{
  "action": "updateGalleryItem",
  "token": "session-token",
  "payload": {
    "media_id": "GAL-001",
    "title_th": "ทะเลสาบเชี่ยวหลาน",
    "status": "published"
  }
}
```

---

## 7.27 `deleteGalleryItem`

ลบรูปภาพ/วิดีโอแบบ soft delete

```json
{
  "action": "deleteGalleryItem",
  "token": "session-token",
  "payload": {
    "media_id": "GAL-001"
  }
}
```

---

## 7.28 `adminGetSettings`

โหลดค่าตั้งค่าระบบสำหรับ Admin

```json
{
  "action": "adminGetSettings",
  "token": "session-token"
}
```

---

## 7.29 `updateSettings`

แก้ไขค่าตั้งค่าระบบ

```json
{
  "action": "updateSettings",
  "token": "session-token",
  "payload": {
    "site_name": "Takhun Trip",
    "site_slogan_th": "เที่ยวตาขุน ครบในทริปเดียว",
    "site_slogan_en": "Discover Ta Khun in One Trip",
    "main_email": "oh2daycreative@gmail.com",
    "main_phone": "",
    "facebook_url": "",
    "line_url": "",
    "logo_url": "",
    "hero_image_url": "",
    "reviews_enabled": true,
    "events_enabled": true
  }
}
```

---

## 8. Categories API

## 8.1 `getCategories`

ใช้โหลดหมวดหมู่สำหรับ Public และ Admin

### Request

```text
GET ?action=getCategories&type=place&lang=th
```

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "category_id": "CAT-PLACE-NATURE",
        "category_type": "place",
        "name": "ธรรมชาติ",
        "icon": "leaf",
        "color": "#22C55E"
      }
    ]
  },
  "message": "success"
}
```

---

## 9. Trip Planner API

Trip Planner รุ่นแรกสามารถทำงานบน Frontend ด้วย `trip_templates` และ Local Storage

## 9.1 `getTripTemplates`

โหลดแผนทริปสำเร็จรูป

### Request

```text
GET ?action=getTripTemplates&duration_type=one_day&style=nature&lang=th
```

### Response

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "template_id": "TRIP-001",
        "name": "เที่ยวบ้านตาขุน 1 วัน",
        "duration_type": "one_day",
        "travel_style": ["nature", "photo", "community"],
        "place_ids": ["BTK-001", "BTK-002", "BTK-003", "BTK-004"],
        "places": [],
        "description": "",
        "cover_image_url": ""
      }
    ],
    "total": 1
  },
  "message": "success"
}
```

---

## 10. File / Image Handling

รุ่นแรกแนะนำให้ใช้ URL จาก Google Drive หรือแหล่งเก็บไฟล์ที่กำหนดไว้ก่อน ยังไม่ต้องทำระบบอัปโหลดซับซ้อน

### 10.1 Image URL Rules

- ให้เก็บเป็น `cover_image_url`, `image_url`, `gallery_image_urls`
- ถ้าเป็นหลายรูป ใช้ `|` คั่นใน Google Sheets
- Frontend แปลงเป็น array ก่อนใช้งาน
- ต้องมี fallback image ถ้าไม่มีรูป

### 10.2 Optional Future API: `uploadImage`

ยังไม่บังคับใน MVP

ถ้าจะทำภายหลัง:

```json
{
  "action": "uploadImage",
  "token": "session-token",
  "payload": {
    "file_name": "place.jpg",
    "mime_type": "image/jpeg",
    "base64": "..."
  }
}
```

หมายเหตุ: การอัปโหลด base64 ผ่าน Apps Script อาจมีข้อจำกัดเรื่องขนาดไฟล์ จึงไม่ควรเป็นฟังก์ชันหลักในรุ่นแรก

---

## 11. Authentication and Session

### 11.1 Token

หลัง Login สำเร็จ ระบบควรคืน `token`

Frontend เก็บไว้ใน Local Storage หรือ Session Storage:

```text
TAKHUN_ADMIN_SESSION
```

### 11.2 Token Payload Example

```json
{
  "admin_id": "ADM-001",
  "display_name": "ผู้ดูแลระบบ",
  "role": "super_admin",
  "token": "session-token",
  "expires_at": "2026-07-11 18:00:00"
}
```

### 11.3 Token Validation Rules

- ทุก Admin API ต้องส่ง `token`
- ถ้า token ไม่มี ให้ส่ง `UNAUTHORIZED`
- ถ้า token หมดอายุ ให้ส่ง `UNAUTHORIZED`
- ถ้า role ไม่มีสิทธิ์ ให้ส่ง `FORBIDDEN`

---

## 12. Cache Strategy

ใช้ Cache Service กับ Public API ที่อ่านบ่อย

### 12.1 Recommended Cache

| API | Cache Time |
|---|---:|
| `getSettings` | 10 นาที |
| `getHomeData` | 5 นาที |
| `getPlaces` | 5 นาที |
| `getPlaceDetail` | 5 นาที |
| `getMapPlaces` | 5 นาที |
| `getRoutes` | 10 นาที |
| `getRouteDetail` | 10 นาที |
| `getProducts` | 5 นาที |
| `getEvents` | 5 นาที |
| `getGallery` | 10 นาที |
| `getCategories` | 30 นาที |

### 12.2 Clear Cache Rules

ต้อง clear cache เมื่อ Admin ทำ action ต่อไปนี้:

- createPlace
- updatePlace
- deletePlace
- createRoute
- updateRoute
- deleteRoute
- createProduct
- updateProduct
- deleteProduct
- createEvent
- updateEvent
- deleteEvent
- approveReview
- hideReview
- deleteReview
- createGalleryItem
- updateGalleryItem
- deleteGalleryItem
- updateSettings

---

## 13. Lock Strategy

ใช้ Lock Service ทุกครั้งที่เขียนข้อมูล

### 13.1 Required Lock Actions

- submitReview
- createPlace
- updatePlace
- deletePlace
- createRoute
- updateRoute
- deleteRoute
- createProduct
- updateProduct
- deleteProduct
- createEvent
- updateEvent
- deleteEvent
- approveReview
- hideReview
- deleteReview
- createGalleryItem
- updateGalleryItem
- deleteGalleryItem
- updateSettings
- adminLogin ถ้ามีการ update last_login_at

---

## 14. Frontend API Client

ควรมีไฟล์:

```text
public/js/api.js
public/admin/js/admin-api.js
```

### 14.1 Public API Client Example

```javascript
async function apiGet(action, params = {}) {
  const url = new URL(APP_CONFIG.API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error?.message || "API error");
  }

  return result.data;
}
```

### 14.2 Admin API Client Example

```javascript
async function adminPost(action, payload = {}) {
  const session = getAdminSession();

  const response = await fetch(APP_CONFIG.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      token: session?.token || "",
      payload
    })
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error?.message || "API error");
  }

  return result.data;
}
```

หมายเหตุ: Google Apps Script Web App บางกรณีมี CORS/Preflight จึงใช้ `Content-Type: text/plain` ได้เพื่อเลี่ยง preflight ในงานเรียบง่าย

---

## 15. Google Apps Script Routing

ควรมี Router กลาง เช่น

```javascript
function handleAction_(action, params, payload, context) {
  switch (action) {
    case "getSettings":
      return SettingsService_getPublicSettings();

    case "getHomeData":
      return PublicService_getHomeData(params);

    case "getPlaces":
      return PlaceService_getPlaces(params);

    case "getPlaceDetail":
      return PlaceService_getPlaceDetail(params.place_id, params.lang);

    case "submitReview":
      return ReviewService_submitReview(payload);

    case "adminLogin":
      return AuthService_login(payload);

    case "createPlace":
      AuthService_requireAdmin(context.token);
      return PlaceService_createPlace(payload, context);

    default:
      return ApiResponse_error("UNKNOWN_ACTION", "ไม่พบ action ที่เรียก");
  }
}
```

---

## 16. Security Rules

1. Admin API ต้องตรวจ token ทุกครั้ง
2. ห้ามส่ง `password_hash` กลับไป Frontend
3. ห้ามให้ Public API เห็นข้อมูล Admin
4. ห้ามให้ Public API เห็นรีวิว `pending`
5. ต้อง validate input ทุกครั้ง
6. ต้อง sanitize ข้อความก่อนแสดงผล
7. ห้าม eval ข้อมูลจาก API
8. ห้ามเก็บรหัสผ่านจริงใน Local Storage
9. หากใช้ password hash ใน Apps Script ให้ใช้วิธี hash ที่สอดคล้องกับข้อจำกัดของระบบ
10. ข้อมูลที่ไม่จำเป็นไม่ต้องส่งออกไปใน response

---

## 17. Pagination Rules

API ที่มีรายการจำนวนมากควรรองรับ pagination

### 17.1 Request

```text
page=1&page_size=20
```

### 17.2 Defaults

| Parameter | Default |
|---|---:|
| `page` | 1 |
| `page_size` | 20 |
| `max_page_size` | 100 |

---

## 18. Sorting Rules

### 18.1 Public

ค่าเรียงลำดับเริ่มต้น:

- สถานที่: `is_featured desc`, `sort_order asc`, `name_th asc`
- เส้นทาง: `sort_order asc`
- กิจกรรม: `event_date asc`
- สินค้า: `is_featured desc`, `sort_order asc`
- Gallery: `sort_order asc`, `created_at desc`

### 18.2 Admin

ค่าเรียงลำดับเริ่มต้น:

- `updated_at desc`

---

## 19. API Acceptance Criteria

API จะถือว่าผ่านเมื่อ:

1. ทุก action ส่ง response เป็น JSON format เดียวกัน
2. `getPlaces` โหลดรายการสถานที่ได้
3. `getPlaceDetail` โหลดรายละเอียดสถานที่ได้
4. `getMapPlaces` ส่งเฉพาะสถานที่ที่มีพิกัดได้
5. `getRoutes` และ `getRouteDetail` แสดงเส้นทางหลัก 4 จุดได้ถูกลำดับ
6. `submitReview` บันทึกรีวิวเป็น `pending`
7. Public API ไม่แสดงข้อมูล `hidden`, `draft`, `deleted`
8. Public API ไม่แสดงรีวิวที่ยังไม่อนุมัติ
9. `adminLogin` ใช้งานได้
10. Admin API ปฏิเสธ request ที่ไม่มี token
11. Admin สามารถสร้าง/แก้ไข/ลบแบบ soft delete ได้
12. เมื่อแก้ข้อมูลแล้ว cache ถูกล้าง
13. Frontend ใช้ `api.js` และ `admin-api.js` เรียก API ได้
14. Error ทุกกรณีเป็น JSON ไม่ใช่ HTML

---

## 20. Codex Instructions for API

เมื่อใช้ Codex สร้างหรือแก้ API ให้ยึดกติกานี้:

1. อ่าน `docs/API_SPEC.md` และ `docs/DATA_SCHEMA.md` ก่อนแก้ API
2. ใช้ action name ตามเอกสารนี้เท่านั้น
3. ใช้ response format มาตรฐานทุกครั้ง
4. ห้ามเปลี่ยนชื่อ field ที่กำหนดใน DATA_SCHEMA
5. Public API ต้องกรองเฉพาะ `published`
6. Admin API ต้องตรวจ token
7. ใช้ Lock Service กับการเขียนข้อมูล
8. ใช้ Cache Service กับ Public API ที่อ่านบ่อย
9. ห้ามสร้าง endpoint ใหม่ซ้ำซ้อน
10. ถ้าจำเป็นต้องเพิ่ม endpoint ให้เพิ่มในเอกสารนี้ก่อน
11. หลังแก้ API ต้องทดสอบอย่างน้อย 1 public action และ 1 admin action
12. ถ้าไม่แน่ใจ ให้ถามก่อน ไม่เดา

---

## 21. Final API Direction

API ของ **Takhun Trip** ต้องเรียบง่าย ใช้งานจริง และดูแลต่อได้

แนวทางสำคัญ:

- ใช้ action-based API
- ส่ง JSON format เดียวกันทุกครั้ง
- แยก Public API กับ Admin API ชัดเจน
- ใช้ Google Sheets เป็นฐานข้อมูลหลัก
- ใช้ Cache เพื่อลดการโหลดซ้ำ
- ใช้ Lock เพื่อลดปัญหาการเขียนข้อมูลชนกัน
- ใช้ soft delete
- รองรับภาษาไทย/อังกฤษ
- รองรับข้อมูลแผนที่และพิกัด
- ไม่ทำระบบซับซ้อนเกิน MVP
