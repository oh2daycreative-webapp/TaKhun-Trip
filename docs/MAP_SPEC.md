# MAP_SPEC.md — Takhun Trip

เอกสารนี้กำหนดรายละเอียดระบบแผนที่ของเว็บแอป **Takhun Trip** เพื่อใช้ควบคุมการพัฒนาใน VS Code / Codex ให้ระบบแผนที่ทำงานได้จริง ใช้งานง่ายบนมือถือ และสอดคล้องกับข้อมูลสถานที่ท่องเที่ยวอำเภอบ้านตาขุนและอำเภอใกล้เคียง

ระบบแผนที่ถือเป็นหัวใจหลักของเว็บแอป เพราะผู้ใช้ต้องสามารถเห็นเส้นทางท่องเที่ยว จุดปักหมุด สถานที่ใกล้เคียง และกดนำทางได้ทันที

---

## 1. Map Objective

ระบบแผนที่ของ **Takhun Trip** มีเป้าหมายเพื่อ:

1. แสดงจุดท่องเที่ยวหลักของอำเภอบ้านตาขุน
2. แสดงเส้นทางแนะนำจากจุดที่ 1 ไปจุดที่ 4 ตามลำดับ
3. แสดงสถานที่ท่องเที่ยวในอำเภอใกล้เคียง ได้แก่ คีรีรัฐนิคมและพนม
4. ให้ผู้ใช้กดดูรายละเอียดสถานที่จากหมุดได้
5. ให้ผู้ใช้กดนำทางผ่าน Google Maps ได้
6. ให้ผู้ใช้กรองหมวดหมู่สถานที่ได้
7. ให้ผู้ใช้เปิดแผนที่จากมือถือแล้วใช้งานได้ง่าย
8. ให้ Admin เพิ่ม/แก้ไขพิกัดสถานที่ผ่านระบบหลังบ้านได้

---

## 2. Map Technology

### 2.1 Recommended Map Library

ใช้:

```text
Leaflet.js + OpenStreetMap
```

### 2.2 เหตุผลที่แนะนำ Leaflet

- ใช้งานฟรี
- ไม่ต้องผูกค่าใช้จ่ายระยะยาว
- เหมาะกับเว็บแอปประชาสัมพันธ์ท่องเที่ยว
- ใช้งานกับ Vanilla JavaScript ได้ง่าย
- แสดง marker, popup, route line ได้เพียงพอ
- เหมาะกับ MVP

### 2.3 Required Files

```text
public/map.html
public/js/map.js
public/css/main.css
public/css/components.css
```

ถ้าแยก CSS เฉพาะแผนที่ได้ ให้ใช้:

```text
public/css/map.css
```

---

## 3. Map Page URL

หน้าแผนที่หลัก:

```text
/map.html
```

รองรับ query string:

```text
/map.html?focus={place_id}
/map.html?route={route_id}
/map.html?category={category}
/map.html?district={district}
```

ตัวอย่าง:

```text
/map.html?focus=BTK-004
/map.html?route=ROUTE-001
/map.html?category=community_tourism
/map.html?district=ban_ta_khun
```

---

## 4. Map Data Source

### 4.1 API หลัก

ใช้ API:

```text
getMapPlaces
```

ตัวอย่าง:

```text
GET ?action=getMapPlaces&category=all&route=main&lang=th
```

### 4.2 API Response ที่ต้องใช้

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

### 4.3 Data Rules

1. แผนที่แสดงเฉพาะสถานที่ที่มี `latitude` และ `longitude`
2. สถานที่ที่ไม่มีพิกัดให้แสดงในหน้ารายการ แต่ไม่ต้องปักหมุด
3. หน้า Public ต้องแสดงเฉพาะข้อมูล `status = published`
4. ถ้าเลือกภาษาอังกฤษแต่ไม่มีข้อมูล ให้ fallback เป็นภาษาไทย
5. ควร cache ข้อมูลแผนที่ประมาณ 5 นาที
6. ถ้ามี `google_maps_url` ให้ใช้ URL นั้นสำหรับปุ่มนำทาง
7. ถ้าไม่มี `google_maps_url` แต่มีพิกัด ให้สร้างลิงก์นำทางจาก lat/lng

---

## 5. Main Route Requirement

เส้นทางหลักของอำเภอบ้านตาขุนต้องแสดงจากจุดที่ 1 ถึงจุดที่ 4 ตามลำดับ

```text
1. วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา
2. วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน
3. วิสาหกิจชุมชนพรุไทย ฮันนี่บี
4. วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์
```

### 5.1 Main Route Place IDs

```text
BTK-001 → BTK-002 → BTK-003 → BTK-004
```

### 5.2 Main Route Display Rules

- หมุดเส้นทางหลักต้องเด่นกว่าหมุดทั่วไป
- หมุดต้องมีเลขลำดับ 1, 2, 3, 4
- ต้องมีเส้นเชื่อมระหว่างจุดตามลำดับ
- เส้นทางหลักควรใช้สีเด่น เช่น `#FDBA2D` หรือ gradient เหลืองทอง/ส้ม
- เมื่อผู้ใช้เลือก “เส้นทางหลัก” ให้ zoom หรือ fit bounds ให้เห็นครบทั้ง 4 จุด
- ถ้าจุดใดไม่มีพิกัด ให้ข้ามการลากเส้นเฉพาะจุดนั้น และแสดงข้อความเตือนใน console ระหว่างพัฒนา

---

## 6. Required Map Locations

### 6.1 Main Ban Ta Khun Points

| place_id | ชื่อสถานที่ | route_group | phone | google_maps_url |
|---|---|---|---|---|
| `BTK-001` | วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา | `main_point_1` | `083 789 4493` | `https://maps.app.goo.gl/w3bUxMLBWFF1THb78` |
| `BTK-002` | วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน | `main_point_2` | `087 270 0774` | `https://maps.app.goo.gl/S5tcKDkpDUZQMZfw5` |
| `BTK-003` | วิสาหกิจชุมชนพรุไทย ฮันนี่บี | `main_point_3` | `081 396 8145` | `https://maps.app.goo.gl/s8xAKHfxqCozuhEX7` |
| `BTK-004` | วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์ | `main_point_4` | `084 843 7924` | `https://maps.app.goo.gl/ofZvwrSAPckbfYZn6` |
| `BTK-005` | วัดเขาพัง | `main_point_4` | - | `https://maps.app.goo.gl/zFBfChoV7jpuUH8m6` |

### 6.2 Nearby District Points — Khiri Rat Nikhom

| place_id | ชื่อสถานที่ | district | phone | google_maps_url |
|---|---|---|---|---|
| `KRN-001` | หินพัด / หินนิลเปา | `khiri_rat_nikhom` | - | `https://maps.app.goo.gl/tNE5WbKPDovt7BxQ7` |
| `KRN-002` | ป่าต้นน้ำบ้านน้ำราด | `khiri_rat_nikhom` | `065 698 5176` | `https://maps.app.goo.gl/aw49GXxSTHVGoW9H9` |
| `KRN-003` | OASIS Forest Garden | `khiri_rat_nikhom` | `093 590 8684` | `https://maps.app.goo.gl/egbwZN4BkMqX7QNPA` |

### 6.3 Nearby District Points — Phanom

| place_id | ชื่อสถานที่ | district | phone | google_maps_url |
|---|---|---|---|---|
| `PNM-001` | อุทยานแห่งชาติคลองพนม | `phanom` | `077 270 905` | `https://maps.app.goo.gl/wBby5ZCeJ5gFdT738` |
| `PNM-002` | อุทยานธรรมเขานาในหลวง | `phanom` | - | `https://maps.app.goo.gl/2s62n8TjaaD9LZpY9` |

### 6.4 Places Without Confirmed Coordinates

สถานที่บางรายการอาจมีในเนื้อหา แต่ยังไม่ควรปักหมุดจนกว่าจะยืนยันพิกัด เช่น:

- สวนผลไม้ชุมชน
- ร้านกาแฟและร้านอาหารบนสันเขื่อน
- แพกลางน้ำแต่ละแห่ง
- จุดชมพระอาทิตย์ขึ้นบนสันเขื่อน
- เส้นทางเดินป่าชุมชน
- แก่งหินใต้สะพานแขวน
- จุดชมวิวทิวทัศน์คลองพระแสง
- น้ำตกบางแห่งที่ยังไม่ระบุชื่อ
- จุดล่องแก่งแม่น้ำพุมดวง
- วัดและโบราณสถานริมแม่น้ำพุมดวง

กฎ: ถ้ายังไม่มีพิกัดที่ยืนยันแล้ว ให้แสดงในรายการสถานที่ แต่ไม่ปักหมุดบนแผนที่

---

## 7. Map Categories

### 7.1 Category List

หมวดหมู่แผนที่ที่ต้องรองรับ:

| Category Value | Label TH | Pin Color |
|---|---|---|
| `all` | ทั้งหมด | - |
| `main_point` | จุดหลักบ้านตาขุน | `#00796B` |
| `community_tourism` | วิสาหกิจชุมชน | `#18B7B5` |
| `nature` | ธรรมชาติ | `#22C55E` |
| `viewpoint` | จุดชมวิว | `#FDBA2D` |
| `lake` | ทะเลสาบ / เขื่อน | `#0EA5E9` |
| `activity` | กิจกรรม | `#A855F7` |
| `food_cafe` | ร้านอาหาร / คาเฟ่ | `#F97316` |
| `accommodation` | ที่พัก / แพ | `#2563EB` |
| `temple_culture` | วัด / วัฒนธรรม | `#8B5CF6` |
| `product_shop` | ร้านสินค้า / ของฝาก | `#EC4899` |
| `waterfall` | น้ำตก | `#06B6D4` |
| `cave` | ถ้ำ | `#78716C` |
| `service` | จุดบริการนักท่องเที่ยว | `#64748B` |
| `nearby` | อำเภอใกล้เคียง | `#475569` |

### 7.2 Filter Chips

บนหน้า Map ต้องมี Filter Chips:

```text
ทั้งหมด
เส้นทางหลัก
ธรรมชาติ
จุดชมวิว
ชุมชน
อาหาร/คาเฟ่
สินค้า
กิจกรรม
ที่พัก
วัด/วัฒนธรรม
อำเภอใกล้เคียง
```

### 7.3 Filter Behavior

```text
ผู้ใช้กด Filter
→ ซ่อนหมุดที่ไม่ตรงหมวด
→ แสดงเฉพาะหมุดที่ตรงหมวด
→ ปรับจำนวนสถานที่ใน UI
→ ไม่ต้อง reload หน้า
```

---

## 8. Map Pin Design

### 8.1 General Pin

หมุดทั่วไปควรเป็น:

- วงกลมหรือหยดน้ำแบบ modern
- สีตามหมวดหมู่
- มี icon เล็ก ๆ ข้างในถ้าทำได้
- มีขอบสีขาว
- มีเงาเบา ๆ

### 8.2 Main Route Pin

หมุดเส้นทางหลักต้องเด่นกว่า

องค์ประกอบ:

- สีหลัก `#00796B` หรือ `#FDBA2D`
- ตัวเลขลำดับ 1–4
- ขอบขาว
- เงา
- ขนาดใหญ่กว่าหมุดทั่วไปเล็กน้อย

### 8.3 Selected Pin

เมื่อผู้ใช้เลือกหมุด:

- หมุดควรใหญ่ขึ้นเล็กน้อย
- เปลี่ยนสีหรือเพิ่ม glow
- แสดง Bottom Sheet / Preview Card

### 8.4 Pin Accessibility

- แต่ละ marker ต้องมี title
- ถ้าใช้ HTML marker ต้องมี aria-label
- สีหมุดต้องไม่เป็นวิธีเดียวในการสื่อความหมาย ควรมี icon/label ประกอบ

---

## 9. Map UI Layout

### 9.1 Mobile Map Layout

```text
Top Map Header
→ Search Bar / Back Button
→ Filter Chips แนวนอน
→ Full-screen Map
→ Floating Current Location Button
→ Floating Layer/Route Button
→ Bottom Place Preview Card เมื่อเลือกหมุด
→ Bottom Navigation
```

### 9.2 Desktop Map Layout

```text
Top Header
→ Map Page Layout
   ├── Left Panel: Search + Filters + Place List
   └── Right Panel: Map
```

หรือทำแบบ Full Map พร้อม Floating Panel ก็ได้

### 9.3 Mobile Priority

บนมือถือให้ความสำคัญกับ:

- แผนที่เต็มจอ
- ปุ่มกดง่าย
- Bottom Sheet แทน Popup เล็ก ๆ
- Filter Chips เลื่อนซ้ายขวาได้
- ปุ่มนำทางเด่น

---

## 10. Map Header

### 10.1 Mobile Header

ควรมี:

- ปุ่มกลับ
- ชื่อหน้า “แผนที่ท่องเที่ยว”
- ปุ่มค้นหา
- ปุ่มเปลี่ยนภาษา หรืออยู่ในเมนูเพิ่มเติม

### 10.2 Desktop Header

ควรมี:

- Logo
- Menu หลัก
- Search
- Language Switcher

---

## 11. Map Search

### 11.1 Search Behavior

```text
ผู้ใช้พิมพ์คำค้น
→ ค้นหาจากสถานที่ที่โหลดมา
→ แสดงผลลัพธ์ใน list หรือ dropdown
→ กดผลลัพธ์
→ แผนที่ pan/zoom ไปยังสถานที่
→ เปิด Preview Card
```

### 11.2 Search Fields

ค้นหาจาก:

- `name_th`
- `name_en`
- `category`
- `district`
- `tags`
- `short_description_th`

### 11.3 Search Empty State

```text
ไม่พบสถานที่ที่ตรงกับคำค้น
ลองค้นหาด้วยคำว่า เขื่อน, สะพาน, น้ำผึ้ง, ผ้าทอ, น้ำราด
```

---

## 12. Place Preview Card

เมื่อกดหมุด ให้แสดง Card ด้านล่างบนมือถือ หรือ Popup/Floating Card บน Desktop

### 12.1 Required Fields

- รูป thumbnail
- ชื่อสถานที่
- หมวดหมู่
- อำเภอ
- คำอธิบายสั้น
- เบอร์โทร ถ้ามี
- ปุ่มดูรายละเอียด
- ปุ่มนำทาง
- ปุ่มโทร ถ้ามี
- ปุ่มบันทึก Favorite

### 12.2 Mobile Preview Card Layout

```text
[รูป]
ชื่อสถานที่
หมวดหมู่ / อำเภอ
คำอธิบายสั้น
[ดูรายละเอียด] [นำทาง] [โทร]
```

### 12.3 Preview Card Actions

```text
ดูรายละเอียด → place-detail.html?id={place_id}
นำทาง → เปิด Google Maps
โทร → tel:{phone}
Favorite → บันทึก Local Storage
```

---

## 13. Navigation Link Rules

### 13.1 Priority

เมื่อกดปุ่ม “นำทาง” ให้ใช้ลำดับนี้:

```text
1. ถ้ามี google_maps_url → เปิด google_maps_url
2. ถ้าไม่มี google_maps_url แต่มี latitude/longitude → เปิด Google Maps Directions
3. ถ้าไม่มีทั้งสองอย่าง → แสดง Toast “ยังไม่มีพิกัดนำทางของสถานที่นี้”
```

### 13.2 Google Maps Directions URL

```javascript
const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
```

### 13.3 Open Behavior

```text
target="_blank"
rel="noopener noreferrer"
```

---

## 14. Current Location / Nearby Places

### 14.1 Feature Status

เป็นฟังก์ชัน Should Have แต่ควรทำถ้าไม่ซับซ้อน

### 14.2 Flow

```text
ผู้ใช้กดปุ่ม “ใกล้ฉัน”
→ Browser ขอ permission location
→ ถ้าอนุญาต:
   → แสดงตำแหน่งผู้ใช้
   → คำนวณระยะทางจากสถานที่
   → เรียงสถานที่ใกล้ที่สุด
→ ถ้าไม่อนุญาต:
   → แสดง Toast “ไม่สามารถเข้าถึงตำแหน่งของคุณได้”
```

### 14.3 Distance Formula

ใช้ Haversine Formula บน Frontend ได้

### 14.4 Nearby Rules

- ไม่ต้องส่งตำแหน่งผู้ใช้ไป Backend
- คำนวณบนเครื่องผู้ใช้
- แสดงระยะทางโดยประมาณ เช่น `2.4 กม.`
- ใช้เฉพาะสถานที่ที่มีพิกัด

---

## 15. Route Line

### 15.1 Main Route Polyline

ใช้ Leaflet Polyline แสดงเส้นทางหลัก 4 จุด

```javascript
L.polyline(routeLatLngs, {
  color: "#FDBA2D",
  weight: 5,
  opacity: 0.9,
  lineCap: "round",
  lineJoin: "round"
}).addTo(map);
```

### 15.2 Route Line Rules

- เส้นทางหลักต้องเด่น
- ห้ามลากเส้นถ้าจุดไม่มีพิกัด
- ถ้าพิกัดบางจุดหาย ให้แสดงเฉพาะเส้นที่มีข้อมูลครบ
- ควรใช้ fitBounds ให้เห็นเส้นทางทั้งหมด

### 15.3 Important Note

Polyline เป็นเพียงเส้นแสดงลำดับการเดินทาง ไม่ใช่เส้นถนนจริง

ถ้าต้องการเส้นถนนจริง ต้องใช้ routing service ซึ่งไม่จำเป็นใน MVP

---

## 16. Map Layers

### 16.1 Required Layer

ใช้ OpenStreetMap เป็น base layer

```javascript
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
});
```

### 16.2 Optional Layers

ถ้าทำได้ง่าย อาจเพิ่ม:

- Standard Map
- Satellite Link ผ่านการเปิด Google Maps ไม่ใช่ใน Leaflet
- Terrain style จาก tile provider อื่น

MVP ใช้ Standard Map เพียงพอ

---

## 17. Map Initial View

### 17.1 Default Center

ค่าเริ่มต้นควรตั้งให้อยู่บริเวณอำเภอบ้านตาขุน

ถ้ายังไม่มีพิกัดกลางแน่นอน ให้ใช้วิธี:

```text
โหลดหมุดที่มีพิกัด
→ fitBounds จากหมุดทั้งหมด
→ ถ้าไม่มีหมุดเลย ให้ใช้ default center ของจังหวัดสุราษฎร์ธานี/บ้านตาขุน
```

### 17.2 Zoom Rules

| Situation | Behavior |
|---|---|
| เปิดหน้าแผนที่ทั่วไป | fitBounds หมุดทั้งหมด |
| เปิดจาก route | fitBounds เฉพาะหมุดใน route |
| เปิดจาก place detail | zoom ไปยัง place |
| ไม่มีหมุด | แสดง default center |

---

## 18. Focus Place Flow

รองรับ URL:

```text
map.html?focus=BTK-004
```

Flow:

```text
โหลดสถานที่ทั้งหมด
→ ค้นหา place_id = BTK-004
→ ถ้ามีพิกัด:
   → pan/zoom ไปยังหมุด
   → เปิด Preview Card
→ ถ้าไม่มีพิกัด:
   → แสดง Toast “สถานที่นี้ยังไม่มีพิกัดบนแผนที่”
```

---

## 19. Route Focus Flow

รองรับ URL:

```text
map.html?route=ROUTE-001
```

Flow:

```text
โหลดข้อมูล route detail
→ โหลดสถานที่ใน route
→ แสดงหมุดเฉพาะ route
→ ลากเส้นเชื่อมตามลำดับ
→ fitBounds ให้เห็นครบทุกจุด
```

---

## 20. Missing Coordinate Handling

### 20.1 Place Without Coordinates

ถ้าสถานที่ไม่มี `latitude` หรือ `longitude`:

- ไม่ต้องสร้าง marker
- แสดงใน Place List ได้
- ใน Place Detail ให้แสดงข้อความ:

```text
ยังไม่มีพิกัดบนแผนที่ กรุณาใช้ลิงก์ Google Maps หรือติดต่อผู้ประสานงาน
```

ถ้ามี `google_maps_url` ให้ยังใช้ปุ่มนำทางได้

### 20.2 Admin Warning

ในหน้า Admin ถ้าสถานที่ `published` แต่ไม่มีพิกัด ควรแสดง badge:

```text
ยังไม่มีพิกัด
```

หรือ

```text
รอยืนยันพิกัด
```

---

## 21. Coordinate Data Rules

### 21.1 Format

ใช้เลขทศนิยมแบบ WGS84

```text
latitude: 8.987654
longitude: 98.765432
```

### 21.2 Validation

- latitude ต้องอยู่ระหว่าง `-90` ถึง `90`
- longitude ต้องอยู่ระหว่าง `-180` ถึง `180`
- ถ้ามี latitude ต้องมี longitude
- ถ้ามี longitude ต้องมี latitude
- ห้ามเก็บพิกัดเป็นลิงก์ Google Maps ใน field latitude/longitude

### 21.3 Coordinate Status

ใช้ field:

```text
coordinate_status
```

ค่า:

```text
verified
pending_verify
needs_survey
no_coordinate
approximate
```

---

## 22. Google Maps URL Handling

### 22.1 Short URL

ข้อมูลที่แนบมี Google Maps Short URL เช่น:

```text
https://maps.app.goo.gl/w3bUxMLBWFF1THb78
```

สามารถเก็บไว้ใน `google_maps_url` ได้

### 22.2 Lat/Lng Extraction

ไม่ต้องบังคับแปลง short URL เป็น lat/lng อัตโนมัติใน MVP

แนวทางที่แนะนำ:

```text
Admin เปิดลิงก์ Google Maps
→ ตรวจตำแหน่งจริง
→ คัดลอกพิกัด lat/lng
→ กรอกลง latitude/longitude
→ เปลี่ยน coordinate_status เป็น verified หรือ pending_verify
```

### 22.3 Why Not Auto Extract

ไม่ควรทำ auto extract จาก short URL ใน MVP เพราะ:

- short URL ต้อง redirect
- Apps Script อาจเข้าถึงข้อมูลไม่ครบ
- เสี่ยงได้พิกัดผิด
- ใช้คนตรวจสอบแม่นยำกว่า

---

## 23. Map Legend

แผนที่ควรมี Legend สำหรับอธิบายสีหมุด

### 23.1 Legend Items

```text
จุดหลักบ้านตาขุน
ธรรมชาติ
จุดชมวิว
ชุมชน
อาหาร/คาเฟ่
สินค้า
ที่พัก
วัด/วัฒนธรรม
อำเภอใกล้เคียง
```

### 23.2 Mobile Legend

บนมือถือให้แสดงเป็น Bottom Sheet หรือปุ่ม “คำอธิบายหมุด”

---

## 24. Map Controls

### 24.1 Required Controls

- Zoom Control
- Current Location Button
- Main Route Toggle
- Filter Chips
- Search
- Reset View Button

### 24.2 Optional Controls

- Nearby Places
- Legend
- Fullscreen Map
- Layer Switcher

### 24.3 Control Placement — Mobile

```text
Top: Search + Filter
Right: Current Location / Reset
Bottom: Place Preview Card
```

---

## 25. Map Performance Rules

1. อย่าโหลดรูปขนาดใหญ่ใน marker popup
2. ใช้ thumbnail image ใน Preview Card
3. ถ้าหมุดเยอะมากในอนาคต อาจใช้ marker clustering
4. MVP ยังไม่ต้องใช้ clustering ถ้าหมุดไม่เกิน 100 จุด
5. Cache ข้อมูลแผนที่
6. หลีกเลี่ยงการ reload marker ทั้งหมดโดยไม่จำเป็น
7. Filter ควรทำบน client หลังโหลดข้อมูลแล้ว

---

## 26. Map Accessibility

ต้องรองรับ:

- ปุ่มมี aria-label
- Marker มี title
- สีหมุดมี legend
- Focus state มองเห็น
- ข้อความบน card อ่านง่าย
- ปุ่มนำทาง/โทรต้องใหญ่พอ

---

## 27. Map Error States

### 27.1 API Error

```text
โหลดแผนที่ไม่สำเร็จ
กรุณาลองใหม่อีกครั้ง
[ลองใหม่]
```

### 27.2 No Places

```text
ยังไม่มีสถานที่ที่มีพิกัดสำหรับแสดงบนแผนที่
```

### 27.3 Location Permission Denied

```text
ไม่สามารถเข้าถึงตำแหน่งของคุณได้
กรุณาอนุญาตตำแหน่งในเบราว์เซอร์
```

### 27.4 Place Not Found

```text
ไม่พบสถานที่ที่ต้องการแสดงบนแผนที่
```

---

## 28. Map Loading State

ระหว่างโหลดข้อมูล:

- แสดง Skeleton หรือ Loading Overlay
- ข้อความ:

```text
กำลังโหลดแผนที่ท่องเที่ยว...
```

เมื่อโหลดเสร็จ:

- ซ่อน Loading
- แสดงหมุด
- fitBounds

---

## 29. Map Integration with Other Pages

### 29.1 From Home

```text
index.html → map.html
```

### 29.2 From Place Detail

```text
place-detail.html?id=BTK-004
→ กด “ดูบนแผนที่”
→ map.html?focus=BTK-004
```

### 29.3 From Route Detail

```text
route-detail.html?id=ROUTE-001
→ กด “เปิดบนแผนที่”
→ map.html?route=ROUTE-001
```

### 29.4 From Favorites

```text
favorites.html
→ กด “ดูบนแผนที่”
→ map.html?focus={place_id}
```

---

## 30. Map Admin Requirements

ระบบ Admin ต้องช่วยจัดการข้อมูลแผนที่ได้

### 30.1 Place Form Map Fields

ใน Manage Places ต้องมี field:

```text
google_maps_url
latitude
longitude
coordinate_status
```

### 30.2 Admin Coordinate Helper

ควรมีข้อความช่วยเหลือ:

```text
วิธีหาพิกัด:
1. เปิด Google Maps
2. กดค้างบนตำแหน่งที่ต้องการ
3. คัดลอกตัวเลขพิกัด เช่น 8.123456, 98.123456
4. วางลงช่อง Latitude และ Longitude
```

### 30.3 Admin Open Link Button

ถ้ามี `google_maps_url` ให้มีปุ่ม:

```text
เปิด Google Maps
```

### 30.4 Admin Coordinate Validation

เมื่อกด Save:

- ถ้ามี latitude แต่ไม่มี longitude → error
- ถ้ามี longitude แต่ไม่มี latitude → error
- ถ้า latitude นอกช่วง → error
- ถ้า longitude นอกช่วง → error

---

## 31. Recommended Map Component Functions

ใน `public/js/map.js` ควรมีฟังก์ชันประมาณนี้:

```javascript
initMap()
loadMapData()
renderMarkers(places)
renderMainRoute(routePlaces)
createMarker(place)
createMainRouteMarker(place, order)
createPopupContent(place)
showPlacePreview(place)
filterMarkers(category)
focusPlace(placeId)
focusRoute(routeId)
openNavigation(place)
getDirectionsUrl(place)
getCurrentLocation()
calculateDistance(lat1, lng1, lat2, lng2)
fitMapToPlaces(places)
clearMarkers()
showMapLoading()
showMapError(message)
showMapEmpty()
```

---

## 32. Recommended Map State

ใน `map.js` ควรมี state กลาง:

```javascript
const mapState = {
  map: null,
  places: [],
  markers: new Map(),
  activeCategory: "all",
  selectedPlaceId: null,
  mainRouteLayer: null,
  userLocation: null,
  lang: "th"
};
```

---

## 33. CSS Class Naming

แนะนำใช้ class ดังนี้:

```text
.map-page
.map-shell
.map-header
.map-search
.map-filter-bar
.map-filter-chip
.map-filter-chip.is-active
.map-canvas
.map-floating-controls
.map-control-btn
.map-preview-card
.map-preview-card.is-open
.map-legend
.map-loading
.map-error
.map-empty
```

---

## 34. Leaflet Setup Example

ตัวอย่างโครงสร้างเบื้องต้น:

```javascript
function initMap() {
  const map = L.map("map").setView([8.9, 98.8], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  mapState.map = map;
}
```

---

## 35. Marker Creation Example

```javascript
function createMarker(place) {
  if (!place.latitude || !place.longitude) return null;

  const marker = L.marker([Number(place.latitude), Number(place.longitude)], {
    title: place.name
  });

  marker.on("click", () => {
    mapState.selectedPlaceId = place.place_id;
    showPlacePreview(place);
  });

  return marker;
}
```

---

## 36. Navigation Helper Example

```javascript
function getDirectionsUrl(place) {
  if (place.google_maps_url) {
    return place.google_maps_url;
  }

  if (place.latitude && place.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
  }

  return "";
}
```

---

## 37. Map MVP Acceptance Criteria

ระบบแผนที่จะถือว่าผ่าน MVP เมื่อ:

1. หน้า `map.html` เปิดได้
2. Leaflet map แสดงผลได้
3. โหลดข้อมูลจาก `getMapPlaces` ได้
4. ปักหมุดสถานที่ที่มีพิกัดได้
5. หมุดมีสีหรือรูปแบบแยกประเภทได้
6. หมุดจุดหลัก 4 จุดมีเลขลำดับได้
7. แสดงเส้นเชื่อมเส้นทางหลัก 4 จุดได้
8. กดหมุดแล้วแสดง Preview Card ได้
9. กด “ดูรายละเอียด” ไป `place-detail.html?id={place_id}` ได้
10. กด “นำทาง” เปิด Google Maps ได้
11. Filter หมวดหมู่ทำงานได้
12. URL `map.html?focus={place_id}` ทำงานได้
13. URL `map.html?route={route_id}` ทำงานได้
14. ถ้าไม่มีพิกัดต้องไม่ทำให้แผนที่ error
15. แสดงผลบนมือถือได้ดี
16. มี Loading / Empty / Error State
17. ไม่มี error หลักใน browser console

---

## 38. Should-have Acceptance Criteria

ถ้าทำฟังก์ชันเสริมได้ ระบบจะสมบูรณ์ขึ้นเมื่อ:

1. Current Location ทำงานได้
2. Nearby Places เรียงตามระยะทางได้
3. Search บนแผนที่ทำงานได้
4. Legend แสดงสีหมุดได้
5. Reset View กลับไปมุมมองเริ่มต้นได้
6. Favorite จาก Preview Card ทำงานได้

---

## 39. Codex Instructions for Map

เมื่อใช้ Codex สร้างหรือแก้ระบบแผนที่ ให้ยึดกติกานี้:

1. อ่าน `docs/MAP_SPEC.md`, `docs/DATA_SCHEMA.md`, `docs/API_SPEC.md`, `docs/DESIGN.md` และ `docs/UI_FLOW.md` ก่อนเริ่ม
2. ใช้ Leaflet + OpenStreetMap
3. ห้ามใช้ Google Maps API แบบเสียเงินใน MVP
4. ห้าม hardcode พิกัดใน `map.js` ถ้าข้อมูลควรมาจาก API
5. ใช้ `getMapPlaces` เป็นแหล่งข้อมูลหลัก
6. แสดงเฉพาะสถานที่ที่มีพิกัดบนแผนที่
7. สถานที่ไม่มีพิกัดต้องไม่ทำให้ระบบ error
8. เส้นทางหลัก 4 จุดต้องเรียงถูกต้อง
9. ปุ่มนำทางต้องใช้ `google_maps_url` ก่อน lat/lng
10. หน้า Map ต้องใช้งานได้ดีบนมือถือ
11. ถ้าทำ current location ต้องไม่ส่งตำแหน่งผู้ใช้ไป backend
12. ทุก error ต้องมี UI แจ้งผู้ใช้
13. ถ้าไม่แน่ใจ ให้ถามก่อน ไม่เดา

---

## 40. Final Map Direction

ระบบแผนที่ของ **Takhun Trip** ต้องเป็นเครื่องมือที่นักท่องเที่ยวเปิดแล้วเข้าใจทันทีว่า:

- จุดหลักอยู่ตรงไหน
- เส้นทางควรไปจากจุดไหนไปจุดไหน
- มีสถานที่ใกล้เคียงอะไรบ้าง
- กดดูรายละเอียดได้
- กดนำทางได้
- ใช้งานบนมือถือได้จริง

แผนที่ต้องไม่ซับซ้อนเกินไป แต่ต้องดูดี ทันสมัย และเป็นหัวใจของประสบการณ์ใช้งานเว็บแอป
