# UI_FLOW.md — Takhun Trip

เอกสารนี้ใช้กำหนดลำดับหน้าจอและเส้นทางการใช้งานของเว็บแอป **Takhun Trip** เพื่อให้ Codex สร้างหน้าเว็บ ลิงก์ เมนู ปุ่ม และการเชื่อมต่อระหว่างฟังก์ชันได้ถูกต้อง ไม่หลุด flow และไม่สร้างหน้าซ้ำซ้อน

---

## 1. UI Flow Overview

เว็บแอป **Takhun Trip** แบ่ง flow หลักออกเป็น 2 ส่วน

1. **Public User Flow**  
   สำหรับนักท่องเที่ยวหรือผู้ใช้งานทั่วไป

2. **Admin CMS Flow**  
   สำหรับผู้ดูแลระบบในการจัดการข้อมูลสถานที่ เส้นทาง สินค้า กิจกรรม รีวิว แกลเลอรี และตั้งค่าระบบ

---

## 2. Main Navigation Structure

### 2.1 Public Navigation

เมนูหลักฝั่งผู้ใช้งานทั่วไป

```text
หน้าแรก
├── แผนที่
├── เส้นทางท่องเที่ยว
├── สถานที่ท่องเที่ยว
├── วางแผนทริป
├── สินค้าและชุมชน
├── กิจกรรม
├── แกลเลอรี
├── รายการโปรด
└── เกี่ยวกับ / ติดต่อ
```

### 2.2 Mobile Bottom Navigation

บนมือถือให้ใช้ Bottom Navigation เป็นทางลัดหลัก

```text
หน้าแรก | แผนที่ | วางแผน | รายการโปรด | เพิ่มเติม
```

รายการใน “เพิ่มเติม” ได้แก่

```text
เส้นทางท่องเที่ยว
สถานที่ท่องเที่ยว
สินค้าและชุมชน
กิจกรรม
แกลเลอรี
เกี่ยวกับ / ติดต่อ
เปลี่ยนภาษา
```

### 2.3 Admin Navigation

เมนูหลักฝั่ง Admin

```text
Admin Login
└── Dashboard
    ├── จัดการสถานที่
    ├── จัดการเส้นทาง
    ├── จัดการสินค้า/บริการ
    ├── จัดการกิจกรรม
    ├── จัดการรีวิว
    ├── จัดการแกลเลอรี
    ├── ตั้งค่าระบบ
    └── ออกจากระบบ
```

---

## 3. Public User Flow

### 3.1 First-time User Flow

เป้าหมาย: ผู้ใช้เปิดเว็บครั้งแรกแล้วเข้าใจทันทีว่าเว็บนี้ช่วยเที่ยวบ้านตาขุนได้อย่างไร

```text
เปิดเว็บ
→ index.html
→ เห็น Hero Section + สโลแกน
→ เลือกการกระทำหลัก
   ├── วางแผนทริป
   ├── สำรวจแผนที่
   ├── ดูเส้นทางแนะนำ
   └── ดูสถานที่ยอดนิยม
```

### 3.2 Returning User Flow

เป้าหมาย: ผู้ใช้ที่เคยเข้าเว็บแล้วเข้าถึงข้อมูลที่ต้องการเร็วขึ้น

```text
เปิดเว็บ
→ โหลดภาษาเดิมจาก Local Storage
→ โหลดรายการโปรดจาก Local Storage
→ แสดง Quick Actions
→ ผู้ใช้ไปยัง:
   ├── แผนที่
   ├── รายการโปรด
   ├── แผนทริปที่บันทึกไว้
   └── สถานที่ล่าสุด/แนะนำ
```

---

## 4. Home Page Flow

### 4.1 Home Page Entry

ไฟล์หลัก:

```text
public/index.html
```

### 4.2 Home Page Sections

ลำดับการแสดงผลบนมือถือ:

```text
Header
→ Hero Image Card
→ Search Bar
→ Quick Action Icons
→ เส้นทางหลัก 4 จุด
→ สถานที่ยอดนิยม
→ จุดถ่ายรูปแนะนำ
→ กิจกรรมใกล้ถึง
→ สินค้าและชุมชน
→ Footer / Bottom Navigation
```

ลำดับการแสดงผลบน Desktop:

```text
Floating Header
→ Hero Section แบบกว้าง
→ Quick Action Cards
→ Main Route Section
→ Popular Places Grid
→ Map Preview
→ Events Section
→ Community Products Section
→ Gallery Preview
→ Footer
```

### 4.3 Home CTA Flow

```text
กด “สำรวจแผนที่”
→ map.html

กด “วางแผนทริป”
→ trip-planner.html

กด “ดูเส้นทางแนะนำ”
→ routes.html

กดการ์ดสถานที่
→ place-detail.html?id={place_id}

กดการ์ดกิจกรรม
→ event-detail.html?id={event_id}

กดการ์ดสินค้า
→ product-detail.html?id={product_id}
```

---

## 5. Search Flow

### 5.1 Basic Search

```text
ผู้ใช้พิมพ์คำค้นใน Search Bar
→ ระบบค้นหาจาก:
   ├── ชื่อสถานที่
   ├── หมวดหมู่
   ├── อำเภอ
   ├── กิจกรรม
   ├── สินค้า/บริการ
   └── คำอธิบายสั้น
→ แสดงผลลัพธ์แบบ Card
```

### 5.2 Search Result Actions

```text
กดผลลัพธ์ประเภทสถานที่
→ place-detail.html?id={place_id}

กดผลลัพธ์ประเภทสินค้า
→ product-detail.html?id={product_id}

กดผลลัพธ์ประเภทกิจกรรม
→ event-detail.html?id={event_id}

กด “ดูบนแผนที่”
→ map.html?focus={place_id}
```

### 5.3 Empty Search State

ถ้าไม่พบข้อมูล ให้แสดง:

```text
ยังไม่พบข้อมูลที่ตรงกับการค้นหา
ลองค้นหาด้วยคำอื่น เช่น เขื่อน, สะพาน, น้ำผึ้ง, ผ้าทอ
```

---

## 6. Interactive Map Flow

### 6.1 Map Entry Points

ผู้ใช้สามารถเข้าแผนที่จาก:

```text
หน้าแรก → สำรวจแผนที่
เส้นทางท่องเที่ยว → เปิดแผนที่เส้นทาง
รายละเอียดสถานที่ → ดูบนแผนที่
รายการโปรด → ดูบนแผนที่
Bottom Navigation → แผนที่
```

### 6.2 Map Main Flow

```text
เปิด map.html
→ โหลดข้อมูลสถานที่จาก API
→ แสดงหมุดทั้งหมดที่มี Latitude/Longitude
→ แสดงเส้นทางหลัก 4 จุด
→ ผู้ใช้เลือก Filter
→ ระบบกรองหมุดตามประเภท
→ ผู้ใช้กดหมุด
→ แสดง Bottom Place Preview Card
→ ผู้ใช้เลือก:
   ├── ดูรายละเอียด
   ├── นำทาง
   ├── โทร
   └── บันทึกเป็นรายการโปรด
```

### 6.3 Map Filter Flow

หมวด Filter ที่ควรมี:

```text
ทั้งหมด
จุดหลักบ้านตาขุน
ธรรมชาติ
จุดชมวิว
กิจกรรมชุมชน
สินค้า/บริการ
อาหาร/คาเฟ่
ที่พัก/แพ
วัด/วัฒนธรรม
อำเภอใกล้เคียง
```

### 6.4 Main Route on Map Flow

```text
ผู้ใช้เลือก “เส้นทางหลัก”
→ แผนที่เน้น 4 จุดหลัก
→ แสดงเส้นเชื่อมจากจุดที่ 1 ถึงจุดที่ 4
→ แสดงตัวเลขลำดับบนหมุด
→ ผู้ใช้กดแต่ละจุดเพื่อดูรายละเอียด
```

ลำดับเส้นทางหลัก:

```text
1. วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา
2. วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน
3. วิสาหกิจชุมชนพรุไทย ฮันนี่บี
4. วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์
```

### 6.5 Navigate Flow

```text
ผู้ใช้กด “นำทาง”
→ ถ้ามี google_maps_url
   → เปิด Google Maps URL
→ ถ้าไม่มี google_maps_url แต่มี latitude/longitude
   → เปิด https://www.google.com/maps/dir/?api=1&destination={lat},{lng}
→ ถ้าไม่มีพิกัด
   → แสดงข้อความ “ยังไม่มีพิกัดนำทางของสถานที่นี้”
```

---

## 7. Route Explorer Flow

### 7.1 Route List Flow

ไฟล์หลัก:

```text
public/routes.html
```

Flow:

```text
เปิด routes.html
→ โหลดรายการเส้นทาง
→ แสดงเส้นทางหลักบ้านตาขุน
→ แสดง Trip Cards
→ ผู้ใช้กดเส้นทาง
→ route-detail.html?id={route_id}
```

### 7.2 Route Detail Flow

ไฟล์หลัก:

```text
public/route-detail.html
```

Flow:

```text
เปิด route-detail.html?id={route_id}
→ โหลดข้อมูลเส้นทาง
→ แสดง Hero Route
→ แสดง Timeline จุดท่องเที่ยว
→ แสดงรายละเอียดแต่ละจุด
→ แสดงปุ่ม:
   ├── เปิดบนแผนที่
   ├── เพิ่มทั้งหมดใน Trip Planner
   ├── แชร์เส้นทาง
   └── ดูสถานที่แต่ละจุด
```

### 7.3 Add Route to Trip Planner

```text
กด “เพิ่มทั้งหมดใน Trip Planner”
→ บันทึก place_ids ลง Local Storage
→ เปิด trip-planner.html?from_route={route_id}
→ แสดงแผนทริปจากเส้นทางนั้น
```

---

## 8. Place Listing Flow

### 8.1 Place List Entry

ไฟล์หลัก:

```text
public/places.html
```

### 8.2 Place List Flow

```text
เปิด places.html
→ โหลดข้อมูลสถานที่
→ แสดง Filter:
   ├── อำเภอ
   ├── ประเภท
   ├── เส้นทาง
   └── คำค้น
→ แสดง Place Cards
→ ผู้ใช้กด Card
→ place-detail.html?id={place_id}
```

### 8.3 Place Filter Flow

```text
เลือกอำเภอ
→ บ้านตาขุน / คีรีรัฐนิคม / พนม

เลือกประเภท
→ ธรรมชาติ / จุดชมวิว / ชุมชน / อาหาร / วัด / สินค้า / กิจกรรม

เลือกเส้นทาง
→ จุดที่ 1 / จุดที่ 2 / จุดที่ 3 / จุดที่ 4 / อำเภอใกล้เคียง
```

---

## 9. Place Detail Flow

### 9.1 Place Detail Entry

ไฟล์หลัก:

```text
public/place-detail.html?id={place_id}
```

### 9.2 Place Detail Flow

```text
เปิด place-detail.html?id={place_id}
→ โหลดข้อมูลสถานที่
→ แสดง Hero Image
→ แสดงชื่อสถานที่
→ แสดงหมวดหมู่ / อำเภอ / กลุ่มเส้นทาง
→ แสดงปุ่มหลัก:
   ├── นำทาง
   ├── โทร
   ├── แชร์
   └── บันทึก
→ แสดงรายละเอียด
→ แสดงกิจกรรมที่ทำได้
→ แสดงแกลเลอรี
→ แสดงสถานที่ใกล้เคียง
→ แสดงรีวิว
```

### 9.3 Place Detail Action Flow

```text
กด “นำทาง”
→ เปิด Google Maps

กด “โทร”
→ tel:{phone}

กด “แชร์”
→ Web Share API
→ ถ้าไม่รองรับ ให้ Copy Link

กด “บันทึก”
→ บันทึก place_id ลง Local Storage
→ แสดง Toast “เพิ่มลงรายการโปรดแล้ว”

กด “เขียนรีวิว”
→ เปิด Review Form
```

---

## 10. Review Flow

### 10.1 Submit Review Flow

```text
จาก place-detail.html
→ กด “เขียนรีวิว”
→ กรอกชื่อหรือเลือกไม่แสดงชื่อ
→ เลือกคะแนน 1–5 ดาว
→ เขียนความคิดเห็น
→ กดส่งรีวิว
→ Validate Form
→ ส่งข้อมูลไป API
→ บันทึกสถานะ pending
→ แสดงข้อความ “ส่งรีวิวแล้ว รอตรวจสอบก่อนเผยแพร่”
```

### 10.2 Review Display Flow

```text
โหลดรีวิวจาก API
→ แสดงเฉพาะรีวิว status = approved
→ เรียงจากใหม่ไปเก่า
```

### 10.3 Review Error Flow

```text
ส่งรีวิวไม่สำเร็จ
→ แสดง Toast “ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่”
→ ไม่ล้างข้อมูลในฟอร์มทันที
```

---

## 11. Trip Planner Flow

### 11.1 Trip Planner Entry

ไฟล์หลัก:

```text
public/trip-planner.html
```

เข้าได้จาก:

```text
หน้าแรก
Bottom Navigation
Route Detail
Place Detail
รายการโปรด
```

### 11.2 Planner Step Flow

```text
Step 1: เลือกระยะเวลา
→ ครึ่งวัน / 1 วัน / 2 วัน 1 คืน

Step 2: เลือกสไตล์การเที่ยว
→ ธรรมชาติ / ชุมชน / ถ่ายภาพ / ครอบครัว / กิจกรรม / ของกิน

Step 3: ระบบแสดงแผนแนะนำ
→ แสดงสถานที่ตามลำดับ
→ แสดงระยะเวลาโดยประมาณ

Step 4: ผู้ใช้ปรับแผน
→ เพิ่มสถานที่
→ ลบสถานที่
→ เรียงลำดับใหม่ ถ้าทำได้ง่าย

Step 5: บันทึกหรือแชร์
→ บันทึก Local Storage
→ แชร์ผ่าน Web Share API / Copy Link
```

### 11.3 Planner Data Flow

```text
ผู้ใช้เลือกเงื่อนไข
→ ระบบค้นหา template trip ที่เหมาะสม
→ แสดง trip plan
→ บันทึกใน Local Storage key: TAKHUN_TRIP_PLAN
```

### 11.4 Planner Empty Flow

ถ้าระบบยังไม่มีแผนที่ตรงเงื่อนไข:

```text
ยังไม่มีแผนทริปที่ตรงกับตัวเลือกนี้
ลองเลือกสไตล์อื่น หรือเริ่มจากเส้นทางหลักบ้านตาขุน
```

---

## 12. Favorite Places Flow

### 12.1 Add Favorite

```text
ผู้ใช้กดปุ่มหัวใจบน Place Card หรือ Place Detail
→ บันทึก place_id ลง Local Storage
→ เปลี่ยนสถานะปุ่มเป็น active
→ แสดง Toast “เพิ่มลงรายการโปรดแล้ว”
```

### 12.2 Remove Favorite

```text
ผู้ใช้กดหัวใจซ้ำ
→ ลบ place_id จาก Local Storage
→ เปลี่ยนสถานะปุ่มเป็น inactive
→ แสดง Toast “นำออกจากรายการโปรดแล้ว”
```

### 12.3 Favorites Page

ไฟล์หลัก:

```text
public/favorites.html
```

Flow:

```text
เปิด favorites.html
→ อ่าน place_ids จาก Local Storage
→ โหลดข้อมูลสถานที่ที่เกี่ยวข้องจาก API
→ แสดงรายการโปรด
→ ผู้ใช้เลือก:
   ├── ดูรายละเอียด
   ├── เปิดแผนที่
   ├── ลบออก
   └── เพิ่มลง Trip Planner
```

### 12.4 Empty Favorites

```text
ยังไม่มีสถานที่โปรด
ลองสำรวจแผนที่หรือดูเส้นทางแนะนำ แล้วกดบันทึกสถานที่ที่สนใจ
```

---

## 13. Community Products Flow

### 13.1 Products List Flow

ไฟล์หลัก:

```text
public/products.html
```

Flow:

```text
เปิด products.html
→ โหลดรายการสินค้า/บริการ
→ แสดงหมวดหมู่
→ ผู้ใช้เลือกหมวด
→ แสดง Product Cards
→ กดสินค้า
→ product-detail.html?id={product_id}
```

### 13.2 Product Detail Flow

```text
เปิด product-detail.html?id={product_id}
→ แสดงรูปสินค้า
→ แสดงชื่อสินค้า
→ แสดงกลุ่มผู้ผลิต
→ แสดงรายละเอียด
→ แสดงราคาโดยประมาณ
→ แสดงปุ่ม:
   ├── โทร
   ├── ติดต่อ / แชท
   ├── นำทาง
   └── แชร์
```

### 13.3 Product Contact Flow

```text
กด “โทร”
→ tel:{phone}

กด “ติดต่อ”
→ เปิด contact_url ถ้ามี

กด “นำทาง”
→ เปิด Google Maps ถ้ามีพิกัดหรือ google_maps_url
```

---

## 14. Event Calendar Flow

### 14.1 Event List Flow

ไฟล์หลัก:

```text
public/events.html
```

Flow:

```text
เปิด events.html
→ โหลดรายการกิจกรรม
→ แสดงกิจกรรมใกล้ถึงก่อน
→ แสดง Filter:
   ├── เดือน
   ├── ประเภทกิจกรรม
   └── สถานะ: กำลังจะมาถึง / ผ่านไปแล้ว
→ กดกิจกรรม
→ event-detail.html?id={event_id}
```

### 14.2 Event Detail Flow

```text
เปิด event-detail.html?id={event_id}
→ แสดงรูปกิจกรรม
→ แสดงวันที่และเวลา
→ แสดงสถานที่
→ แสดงรายละเอียด
→ แสดงผู้ประสานงาน
→ แสดงปุ่ม:
   ├── นำทาง
   ├── โทร
   ├── สนใจเข้าร่วม
   └── แชร์
```

### 14.3 Interested Flow

```text
กด “สนใจเข้าร่วม”
→ ถ้ามี register_url
   → เปิด Google Form หรือ URL ลงทะเบียน
→ ถ้าไม่มี register_url
   → แสดงข้อความ “กรุณาติดต่อผู้ประสานงาน”
```

---

## 15. Gallery Flow

### 15.1 Gallery List Flow

ไฟล์หลัก:

```text
public/gallery.html
```

Flow:

```text
เปิด gallery.html
→ โหลดภาพ/วิดีโอ
→ แสดงหมวดหมู่
→ ผู้ใช้เลือกหมวด
→ แสดง Grid
→ กดภาพ
→ เปิด Lightbox
```

### 15.2 Video Flow

```text
กดวิดีโอ
→ เปิด YouTube Embed หรือเปิดลิงก์วิดีโอ
```

---

## 16. About / Contact Flow

ไฟล์หลัก:

```text
public/about.html
```

Flow:

```text
เปิด about.html
→ แสดงข้อมูลโครงการ
→ แสดงวัตถุประสงค์
→ แสดงข้อมูลติดต่อ
→ แสดงปุ่ม:
   ├── โทร
   ├── Facebook
   ├── LINE
   └── Email
```

---

## 17. Language Flow

### 17.1 Change Language

```text
ผู้ใช้กด TH / EN
→ เปลี่ยนภาษาใน UI
→ บันทึกค่าใน Local Storage key: TAKHUN_LANG
→ โหลดข้อมูลตาม field ภาษา
```

### 17.2 Language Fallback

```text
ถ้าเลือก EN
→ ถ้า field ภาษาอังกฤษมีข้อมูล
   → แสดงภาษาอังกฤษ
→ ถ้าไม่มีข้อมูล
   → fallback เป็นภาษาไทย
```

### 17.3 Language Scope

ต้องรองรับ:

- เมนู
- ปุ่ม
- ข้อความระบบ
- ชื่อสถานที่
- รายละเอียดสถานที่
- เส้นทาง
- สินค้า
- กิจกรรม
- รีวิวบางส่วนถ้ามี

---

## 18. Admin Authentication Flow

### 18.1 Login Flow

ไฟล์หลัก:

```text
public/admin/login.html
```

Flow:

```text
เปิด admin/login.html
→ กรอก username และ password
→ กดเข้าสู่ระบบ
→ Validate form
→ ส่งข้อมูลไป API
→ ถ้าสำเร็จ:
   → บันทึก session/token
   → ไป admin/dashboard.html
→ ถ้าไม่สำเร็จ:
   → แสดงข้อความผิดพลาด
```

### 18.2 Protected Page Flow

```text
เปิดหน้า admin ใด ๆ
→ ตรวจ session/token
→ ถ้าไม่มีหรือหมดอายุ
   → redirect ไป admin/login.html
→ ถ้ามี
   → โหลดหน้า Admin
```

### 18.3 Logout Flow

```text
กดออกจากระบบ
→ ล้าง session/token
→ redirect ไป admin/login.html
```

---

## 19. Admin Dashboard Flow

ไฟล์หลัก:

```text
public/admin/dashboard.html
```

Flow:

```text
เปิด dashboard
→ ตรวจ session
→ โหลดสถิติจาก API
→ แสดง Summary Cards
→ แสดงรีวิวรออนุมัติล่าสุด
→ แสดงกิจกรรมใกล้ถึง
→ แสดงปุ่มลัด
```

Summary Cards:

```text
สถานที่ทั้งหมด
เส้นทางทั้งหมด
สินค้า/บริการ
กิจกรรม
รีวิวรออนุมัติ
ภาพ/วิดีโอ
```

---

## 20. Admin Manage Places Flow

### 20.1 Places List

ไฟล์หลัก:

```text
public/admin/places.html
```

Flow:

```text
เปิดหน้า Manage Places
→ โหลดรายการสถานที่
→ แสดง Table บน Desktop
→ แสดง Card List บน Mobile
→ ค้นหา/กรองได้
→ ผู้ใช้เลือก:
   ├── เพิ่มสถานที่
   ├── แก้ไข
   ├── ซ่อน
   └── ลบ
```

### 20.2 Add Place

```text
กด “เพิ่มสถานที่”
→ เปิด Form
→ กรอกข้อมูล
→ Validate
→ ส่ง API
→ บันทึกลง Google Sheets
→ แสดง Toast “บันทึกข้อมูลเรียบร้อย”
→ กลับไป List หรืออยู่หน้าเดิม
```

### 20.3 Edit Place

```text
กด “แก้ไข”
→ โหลดข้อมูลเดิม
→ แสดง Form
→ แก้ไขข้อมูล
→ Validate
→ ส่ง API
→ Update Google Sheets
→ แสดง Toast
```

### 20.4 Hide / Delete Place

```text
กด “ซ่อน”
→ เปลี่ยน status = hidden

กด “ลบ”
→ แสดง Confirm Dialog
→ ถ้ายืนยัน
   → เปลี่ยน status = deleted หรือ delete row ตามกติกาที่กำหนด
```

หมายเหตุ: แนะนำใช้ soft delete โดยเปลี่ยนสถานะเป็น `deleted`

---

## 21. Admin Manage Routes Flow

```text
เปิด admin/routes.html
→ โหลดเส้นทาง
→ เพิ่ม/แก้ไขเส้นทาง
→ เลือกสถานที่ในเส้นทาง
→ จัดลำดับ place_ids
→ บันทึก
→ Public route-detail แสดงข้อมูลตามลำดับที่กำหนด
```

---

## 22. Admin Manage Products Flow

```text
เปิด admin/products.html
→ โหลดสินค้า/บริการ
→ เพิ่มสินค้า
→ แก้ไขสินค้า
→ ซ่อน/ลบสินค้า
→ Public products.html แสดงเฉพาะ status = published
```

---

## 23. Admin Manage Events Flow

```text
เปิด admin/events.html
→ โหลดกิจกรรม
→ เพิ่มกิจกรรม
→ แก้ไขกิจกรรม
→ ซ่อน/ลบกิจกรรม
→ Public events.html แสดงกิจกรรมตามวันที่
```

---

## 24. Admin Manage Reviews Flow

```text
เปิด admin/reviews.html
→ โหลดรีวิวทั้งหมด
→ แยก Tab:
   ├── รอตรวจสอบ
   ├── เผยแพร่แล้ว
   ├── ซ่อน
   └── ลบแล้ว
→ Admin เลือก:
   ├── อนุมัติ
   ├── ซ่อน
   ├── ลบ
   └── ตอบกลับ
```

Review status flow:

```text
pending → approved
pending → hidden
approved → hidden
hidden → approved
any → deleted
```

---

## 25. Admin Manage Gallery Flow

```text
เปิด admin/gallery.html
→ โหลดภาพ/วิดีโอ
→ เพิ่มรายการใหม่
→ กรอก title, category, image_url หรือ video_url
→ บันทึก
→ Public gallery.html แสดงเฉพาะ status = published
```

หมายเหตุ: รุ่นแรกสามารถใช้ URL จาก Google Drive หรือ YouTube ก่อน ยังไม่ต้องมีระบบอัปโหลดไฟล์ซับซ้อน

---

## 26. Admin Settings Flow

```text
เปิด admin/settings.html
→ โหลด settings
→ แก้ไข:
   ├── ชื่อเว็บ
   ├── สโลแกน
   ├── โลโก้
   ├── Hero Image
   ├── Facebook
   ├── LINE
   ├── เบอร์โทรหลัก
   ├── ภาษาเริ่มต้น
   ├── เปิด/ปิดรีวิว
   └── เปิด/ปิดกิจกรรม
→ กดบันทึก
→ Update settings
```

---

## 27. API Data Flow Summary

### 27.1 Public Data Flow

```text
Public Page
→ api.js
→ Google Apps Script Web App
→ Google Sheets
→ Response JSON
→ Render UI
```

### 27.2 Admin Data Flow

```text
Admin Page
→ admin-api.js
→ ตรวจ session/token
→ Google Apps Script Web App
→ Google Sheets
→ Response JSON
→ Update UI
```

---

## 28. Loading / Empty / Error Flow

### 28.1 Loading

```text
เริ่มโหลดข้อมูล
→ แสดง Skeleton หรือ Loading Spinner
→ ได้ข้อมูล
→ ซ่อน Loading
→ Render Content
```

### 28.2 Empty

```text
API สำเร็จแต่ไม่มีข้อมูล
→ แสดง Empty State
→ แสดงปุ่มแนะนำ เช่น “ดูทั้งหมด” หรือ “เพิ่มข้อมูลใหม่” ใน Admin
```

### 28.3 Error

```text
API ไม่สำเร็จ
→ แสดง Error State
→ แสดงปุ่ม “ลองใหม่”
→ log error ใน console เฉพาะระหว่างพัฒนา
```

---

## 29. Toast / Feedback Flow

ใช้ Toast สำหรับการแจ้งผลสั้น ๆ

กรณีที่ต้องแสดง Toast:

```text
เพิ่มรายการโปรดสำเร็จ
ลบรายการโปรดสำเร็จ
คัดลอกลิงก์แล้ว
ส่งรีวิวแล้ว
บันทึกข้อมูลสำเร็จ
โหลดข้อมูลไม่สำเร็จ
กรุณากรอกข้อมูลให้ครบ
```

ตำแหน่ง:

- Mobile: ด้านล่าง เหนือ Bottom Navigation
- Desktop: มุมขวาบนหรือขวาล่าง

---

## 30. Local Storage Flow

ใช้ Local Storage เฉพาะข้อมูลที่ไม่สำคัญและไม่กระทบความปลอดภัย

### 30.1 Keys

```text
TAKHUN_LANG
TAKHUN_FAVORITES
TAKHUN_TRIP_PLAN
TAKHUN_RECENT_PLACES
TAKHUN_ADMIN_SESSION
```

### 30.2 Do Not Store

ห้ามเก็บข้อมูลต่อไปนี้แบบไม่ปลอดภัย:

```text
รหัสผ่านจริง
ข้อมูลส่วนตัวที่ละเอียดอ่อน
Token สำคัญที่ไม่มีวันหมดอายุ
ข้อมูลชำระเงิน
```

---

## 31. Recommended User Journey

### 31.1 Journey: นักท่องเที่ยวอยากเที่ยวบ้านตาขุน 1 วัน

```text
เปิดหน้าแรก
→ กด “วางแผนทริป”
→ เลือก 1 วัน
→ เลือก ธรรมชาติ + ถ่ายภาพ
→ ระบบแนะนำเส้นทาง 4 จุดหลัก
→ ผู้ใช้บันทึกแผน
→ เปิดแผนที่
→ กดนำทางไปจุดที่ 1
```

### 31.2 Journey: นักท่องเที่ยวอยู่ที่เขื่อนแล้วอยากไปต่อ

```text
เปิดเว็บบนมือถือ
→ กด Bottom Navigation: แผนที่
→ กด Current Location
→ ดูสถานที่ใกล้เคียง
→ กดหมุดบ้านเชี่ยวหลาน
→ ดูรายละเอียด
→ กดนำทาง
```

### 31.3 Journey: ผู้ใช้สนใจสินค้าชุมชน

```text
หน้าแรก
→ กดสินค้าและชุมชน
→ เลือกหมวด ผ้าทอ / น้ำผึ้ง / ผลไม้
→ ดูรายละเอียดสินค้า
→ กดโทรติดต่อ
```

### 31.4 Journey: Admin เพิ่มสถานที่ใหม่

```text
เข้า admin/login.html
→ Login
→ Dashboard
→ จัดการสถานที่
→ เพิ่มสถานที่
→ กรอกข้อมูลและพิกัด
→ บันทึก
→ เปิดหน้า Public เพื่อตรวจสอบ
```

---

## 32. Page-to-Page Link Matrix

| From Page | Action | To Page |
|---|---|---|
| index.html | สำรวจแผนที่ | map.html |
| index.html | วางแผนทริป | trip-planner.html |
| index.html | ดูเส้นทาง | routes.html |
| index.html | กดสถานที่ | place-detail.html?id={place_id} |
| map.html | ดูรายละเอียด | place-detail.html?id={place_id} |
| routes.html | กดเส้นทาง | route-detail.html?id={route_id} |
| route-detail.html | เปิดบนแผนที่ | map.html?route={route_id} |
| route-detail.html | เพิ่มลงทริป | trip-planner.html?from_route={route_id} |
| places.html | กดสถานที่ | place-detail.html?id={place_id} |
| place-detail.html | เพิ่มลงทริป | trip-planner.html?add={place_id} |
| products.html | กดสินค้า | product-detail.html?id={product_id} |
| events.html | กดกิจกรรม | event-detail.html?id={event_id} |
| favorites.html | ดูรายละเอียด | place-detail.html?id={place_id} |
| admin/login.html | Login สำเร็จ | admin/dashboard.html |
| admin/dashboard.html | จัดการสถานที่ | admin/places.html |
| admin/dashboard.html | จัดการเส้นทาง | admin/routes.html |
| admin/dashboard.html | จัดการสินค้า | admin/products.html |
| admin/dashboard.html | จัดการกิจกรรม | admin/events.html |
| admin/dashboard.html | จัดการรีวิว | admin/reviews.html |
| admin/dashboard.html | จัดการแกลเลอรี | admin/gallery.html |
| admin/dashboard.html | ตั้งค่า | admin/settings.html |

---

## 33. Minimum Flow Acceptance Criteria

ระบบ UI Flow จะถือว่าผ่านเมื่อ:

1. ผู้ใช้จากหน้าแรกสามารถไปยังแผนที่ได้
2. ผู้ใช้จากหน้าแรกสามารถไปยังเส้นทางหลักได้
3. ผู้ใช้จากหน้าแรกสามารถไปยัง Trip Planner ได้
4. ผู้ใช้สามารถกดสถานที่เพื่อดูรายละเอียดได้
5. ผู้ใช้สามารถกดนำทางจากรายละเอียดสถานที่ได้
6. ผู้ใช้สามารถบันทึกสถานที่โปรดได้
7. ผู้ใช้สามารถเปิดรายการโปรดได้
8. ผู้ใช้สามารถส่งรีวิวเข้าสถานะรอตรวจสอบได้
9. Admin สามารถ Login ได้
10. Admin สามารถเพิ่ม/แก้ไขสถานที่ได้
11. ข้อมูลที่ Admin เพิ่มแสดงในหน้า Public ได้
12. Admin สามารถอนุมัติรีวิวได้
13. เมนูหลักใช้งานได้ทั้งมือถือและคอมพิวเตอร์
14. ไม่มีหน้าที่เป็นทางตันโดยไม่มีปุ่มกลับหรือเมนูนำทาง

---

## 34. Codex Instructions for UI Flow

เมื่อใช้ Codex สร้างหรือแก้ flow ให้ยึดกติกานี้:

1. อ่าน `docs/UI_FLOW.md` ก่อนสร้างหน้าใหม่
2. ห้ามสร้างหน้าใหม่โดยไม่ตรวจว่ามีอยู่ใน flow หรือไม่
3. ทุกปุ่ม CTA ต้องพาไปหน้าที่กำหนดใน Link Matrix
4. ทุกหน้าต้องมีทางกลับหรือเมนูนำทาง
5. ห้ามทำ path หรือ filename แตกต่างจากที่กำหนดโดยไม่จำเป็น
6. การทำงานบนมือถือสำคัญที่สุด
7. ถ้าหน้าใดยังไม่มีข้อมูล ให้ทำ Empty State แทนการปล่อยว่าง
8. ถ้าโหลดข้อมูลไม่สำเร็จ ให้มี Error State และปุ่มลองใหม่
9. อย่าทำ flow ซับซ้อนเกิน MVP
10. ถ้าไม่แน่ใจว่า user ควรไปหน้าไหน ให้ถามก่อน ไม่เดา

---

## 35. Final UI Flow Direction

**Takhun Trip** ต้องมี flow ที่ง่ายมาก:

```text
เปิดเว็บ
→ เห็นภาพรวม
→ เลือกแผนที่ / เส้นทาง / วางแผน / สถานที่
→ ดูรายละเอียด
→ กดนำทาง / โทร / แชร์ / บันทึก
```

และฝั่ง Admin ต้องง่ายเช่นกัน:

```text
Login
→ Dashboard
→ เลือกหมวดข้อมูล
→ เพิ่ม/แก้ไข
→ บันทึก
→ ข้อมูลแสดงบนหน้า Public
```

เป้าหมายสำคัญคือทำให้ผู้ใช้ไม่หลงทาง และทำให้ผู้ดูแลระบบจัดการข้อมูลได้จริง
