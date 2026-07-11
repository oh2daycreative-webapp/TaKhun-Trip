# DESIGN.md — Takhun Trip

เอกสารนี้ใช้กำหนดมาตรฐาน UX/UI ของเว็บแอป **Takhun Trip** เพื่อให้การออกแบบและการพัฒนาด้วย Codex ใน VS Code มีทิศทางเดียวกันทั้งระบบ

เป้าหมายคือให้เว็บแอปมีภาพลักษณ์ **ทันสมัย สดใส มีสีสัน ดูพรีเมี่ยม เหมาะกับการท่องเที่ยวบ้านตาขุน และไม่ดูเหมือนเว็บราชการหรือเว็บ Template ทั่วไป**

---

## 1. Design Vision

**Takhun Trip** ต้องเป็นเว็บแอปท่องเที่ยวที่ให้ความรู้สึกเหมือนแอปท่องเที่ยวระดับพรีเมี่ยม เปิดแล้วอยากออกเดินทางทันที

ภาพรวมที่ต้องการ:

- สดใส
- ทันสมัย
- พรีเมี่ยม
- เป็นมิตร
- ใช้งานง่าย
- เหมาะกับมือถือ
- มีเสน่ห์ของธรรมชาติบ้านตาขุน
- เชื่อมโยงทะเลสาบ ภูเขา สะพาน ชุมชน และกิจกรรมท้องถิ่น
- ไม่แข็งแบบราชการ
- ไม่เรียบจนจืด
- ไม่ดูเป็นงาน AI สำเร็จรูปทั่วไป

---

## 2. Core Design Keywords

ให้ใช้คำเหล่านี้เป็นหลักในการตัดสินใจด้านดีไซน์:

- Premium Travel
- Fresh & Vibrant
- Nature Inspired
- Mobile-first
- Clean but Colorful
- Soft Glass Card
- Destination Discovery
- Local Experience
- Easy Navigation
- One Tap Travel Guide

---

## 3. Mood & Tone

### 3.1 ความรู้สึกหลัก

เว็บแอปควรให้ความรู้สึกเหมือน:

- เปิดแผนที่ท่องเที่ยวสมัยใหม่
- เห็นทะเลสาบสีเขียวมรกต
- เห็นภูเขาและหมอกยามเช้า
- เห็นแสงแดดสีทอง
- เห็นสะพานและเรือที่ชวนเดินทาง
- เห็นชุมชนท้องถิ่นที่อบอุ่น
- อยากกดดูเส้นทางและออกเดินทางต่อ

### 3.2 สิ่งที่ต้องหลีกเลี่ยง

ห้ามออกแบบให้ดูเป็น:

- เว็บราชการแบบแข็ง ๆ
- เว็บข้อมูลที่มีแต่ตาราง
- เว็บท่องเที่ยวแบบ Template สำเร็จรูป
- โทนสีจืดเกินไป
- โทนเขียวอย่างเดียวทั้งระบบ
- การ์ดสีเทา/ขาวล้วนที่ไม่มีชีวิต
- Icon การ์ตูนเด็กเกินไป
- Font เล็ก อ่านยาก
- หน้าเว็บที่เหมือนรายงานเอกสาร

---

## 4. Brand Personality

บุคลิกของ Takhun Trip:

| คุณลักษณะ | แนวทาง |
|---|---|
| ทันสมัย | ใช้ layout แบบแอปท่องเที่ยวร่วมสมัย |
| สดใส | ใช้สีธรรมชาติที่มีพลัง เช่น เขียวมรกต ฟ้า เหลืองทอง ส้ม |
| พรีเมี่ยม | ใช้ spacing ดี เงานุ่ม การ์ดโค้งมน ภาพใหญ่ |
| เป็นมิตร | ภาษาเข้าใจง่าย ปุ่มชัด ใช้งานง่าย |
| ท้องถิ่น | มีเรื่องเล่าชุมชน สินค้า กิจกรรม วิถีชีวิต |
| เชื่อถือได้ | ข้อมูลชัดเจน มีเบอร์โทร ปุ่มนำทาง และหมุดแผนที่ |

---

## 5. Color Palette

### 5.1 Primary Colors

ใช้สีหลักจากธรรมชาติของบ้านตาขุน

| ชื่อสี | Hex | การใช้งาน |
|---|---|---|
| Emerald Lake | `#00796B` | สีหลัก ปุ่มหลัก Header Icon |
| Deep Forest | `#064E3B` | ข้อความสำคัญ พื้นหลังเข้ม |
| Turquoise Water | `#18B7B5` | Accent แผนที่ การ์ด ฟีเจอร์ |
| Golden Sun | `#FDBA2D` | ปุ่มเด่น Badge Highlight |
| Sunset Orange | `#F97316` | CTA รอง Pin หรือจุดเด่น |
| Mist White | `#F8FAF8` | พื้นหลังหลัก |
| Soft Sand | `#FFF7E6` | พื้นหลัง section อบอุ่น |
| Sky Blue | `#E0F7FA` | พื้นหลังหมวดแผนที่หรือ Card |
| Slate Text | `#1F2937` | ข้อความหลัก |
| Muted Text | `#6B7280` | ข้อความรอง |

### 5.2 Gradient Palette

ใช้ Gradient เพื่อให้ดูสดใสและพรีเมี่ยม

#### Hero Gradient

```css
background: linear-gradient(135deg, #064E3B 0%, #00796B 45%, #18B7B5 100%);
```

#### CTA Gradient

```css
background: linear-gradient(135deg, #FDBA2D 0%, #F97316 100%);
```

#### Card Accent Gradient

```css
background: linear-gradient(135deg, rgba(24,183,181,0.12), rgba(253,186,45,0.12));
```

#### Premium Dark Overlay

```css
background: linear-gradient(180deg, rgba(6,78,59,0.15) 0%, rgba(6,78,59,0.88) 100%);
```

---

## 6. Color Usage Rules

### 6.1 ใช้สีหลักอย่างไร

- ปุ่มหลักใช้ `Golden Sun` หรือ `CTA Gradient`
- Header / Active Menu ใช้ `Emerald Lake`
- พื้นหลังเข้มใช้ `Deep Forest`
- แผนที่และหมุดใช้หลายสีแยกหมวด
- Badge และ Highlight ใช้ `Golden Sun`
- สถานะสำคัญใช้สีที่แยกชัดเจน

### 6.2 ห้ามใช้สีอย่างไร

- ห้ามใช้สีเขียวเดียวทั้งเว็บ
- ห้ามใช้สีสดหลายสีพร้อมกันโดยไม่มีลำดับ
- ห้ามใช้พื้นหลังดำทึบจนดูหนัก
- ห้ามใช้สีอ่อนบนพื้นอ่อนจนอ่านยาก
- ห้ามใช้สีแดงเป็นสีหลัก ยกเว้นแจ้งเตือน

---

## 7. Typography

### 7.1 Font Recommendation

แนะนำใช้ฟอนต์จาก Google Fonts ที่รองรับภาษาไทยและอังกฤษ

ตัวเลือกหลัก:

```css
font-family: "Prompt", "Kanit", "Inter", sans-serif;
```

ตัวเลือกที่แนะนำ:

- หัวข้อใหญ่: `Prompt SemiBold` หรือ `Kanit SemiBold`
- ข้อความทั่วไป: `Prompt Regular`
- ตัวเลข/Label: `Inter` หรือ `Prompt`

### 7.2 Type Scale

| Element | Desktop | Mobile | Weight |
|---|---:|---:|---|
| Hero Title | 56–72px | 38–46px | 700 |
| Page Title | 36–44px | 28–34px | 700 |
| Section Title | 28–34px | 22–26px | 600 |
| Card Title | 18–22px | 17–20px | 600 |
| Body Text | 16px | 15–16px | 400 |
| Caption | 13–14px | 12–13px | 400 |
| Button | 15–16px | 15px | 600 |

### 7.3 Typography Rules

- หัวข้อใหญ่ต้องชัดและมีเอกลักษณ์
- ข้อความไทยต้องอ่านง่าย ไม่อัดแน่น
- ระยะบรรทัดควรอยู่ที่ `1.55–1.7`
- ห้ามใช้ Font หลายตระกูลเกินไป
- ห้ามใช้ตัวบางเกินไปบนภาพพื้นหลัง

---

## 8. Layout Principles

### 8.1 Mobile-first

ทุกหน้าฝั่งผู้ใช้ต้องออกแบบจากมือถือก่อน

ลำดับความสำคัญ:

1. Mobile
2. Tablet
3. Desktop

### 8.2 Layout Style

- ใช้ Hero Section ขนาดใหญ่
- ใช้ Card-based Layout
- ใช้ Section ที่มีระยะหายใจ
- ใช้ภาพใหญ่ในจุดสำคัญ
- ใช้ Grid บน Desktop
- ใช้ Horizontal Scroll Card บน Mobile เฉพาะจุดที่เหมาะสม
- ใช้ Bottom Navigation บน Mobile

### 8.3 Spacing System

ใช้ spacing แบบ 4px scale:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

### 8.4 Container Width

```css
--container-max: 1180px;
--container-padding-mobile: 16px;
--container-padding-desktop: 32px;
```

---

## 9. Border Radius

เว็บต้องใช้มุมโค้งมนเพื่อให้ดูเป็นมิตรและทันสมัย

```css
--radius-sm: 10px;
--radius-md: 16px;
--radius-lg: 24px;
--radius-xl: 32px;
--radius-pill: 999px;
```

การใช้งาน:

- Button: `999px`
- Card: `20–28px`
- Image Card: `24px`
- Bottom Sheet: `28px 28px 0 0`
- App-like Panel: `32px`

---

## 10. Shadow System

ใช้เงานุ่ม ไม่ใช้เงาแข็ง

```css
--shadow-soft: 0 12px 32px rgba(15, 23, 42, 0.10);
--shadow-card: 0 16px 40px rgba(15, 23, 42, 0.12);
--shadow-floating: 0 20px 60px rgba(15, 23, 42, 0.18);
--shadow-glow: 0 0 32px rgba(24, 183, 181, 0.25);
```

กฎ:

- Card สำคัญใช้ `shadow-card`
- Floating Search ใช้ `shadow-floating`
- ปุ่มเด่นใช้เงาเบา ๆ สีทองหรือเขียว
- ห้ามใช้เงาดำหนักเกินไป

---

## 11. Buttons

### 11.1 Primary Button

ใช้สำหรับ CTA หลัก เช่น “วางแผนทริปของคุณ”

```css
.btn-primary {
  background: linear-gradient(135deg, #FDBA2D, #F97316);
  color: #ffffff;
  border-radius: 999px;
  padding: 14px 22px;
  font-weight: 700;
  box-shadow: 0 12px 26px rgba(249, 115, 22, 0.28);
}
```

### 11.2 Secondary Button

ใช้สำหรับ “สำรวจแผนที่” หรือ “ดูรายละเอียด”

```css
.btn-secondary {
  background: rgba(255,255,255,0.86);
  color: #064E3B;
  border: 1px solid rgba(0,121,107,0.18);
  border-radius: 999px;
  padding: 14px 22px;
  backdrop-filter: blur(12px);
}
```

### 11.3 Icon Button

ใช้สำหรับ Search, Favorite, Share, Back

```css
.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ffffff;
  box-shadow: var(--shadow-soft);
}
```

### 11.4 Button Rules

- ปุ่มบนมือถือสูงอย่างน้อย 44px
- CTA หลักต้องเด่นเสมอ
- ปุ่มนำทางควรมองเห็นง่าย
- ห้ามใช้ปุ่มเล็กเกินไปในหน้าแผนที่

---

## 12. Card Design

### 12.1 General Card

```css
.card {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
```

### 12.2 Glass Card

ใช้บนภาพ Hero หรือ Map Overlay

```css
.glass-card {
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.35);
  backdrop-filter: blur(18px);
  border-radius: 24px;
  box-shadow: var(--shadow-floating);
}
```

### 12.3 Destination Card

ควรมี:

- ภาพขนาดใหญ่
- Gradient Overlay
- ชื่อสถานที่
- หมวดหมู่
- คะแนนดาว
- ปุ่มดูรายละเอียด
- Favorite icon

### 12.4 Card Rules

- Card ต้องมีภาพหรือ Icon ที่ช่วยสื่อความหมาย
- ห้ามใช้ Card ขาวล้วนทั้งระบบ
- ห้ามใส่ข้อความยาวเกินไปในการ์ด
- ใช้ Badge ช่วยบอกหมวดหมู่
- ทุก Card ต้องกดได้ชัดเจน

---

## 13. Icon Style

### 13.1 Icon Direction

Icon ต้องเป็นแบบ:

- Modern
- Minimal
- Rounded
- Friendly
- Premium
- ไม่การ์ตูนเด็ก
- ไม่เป็น 3D หนักเกินไป
- ใช้เส้นสม่ำเสมอ

### 13.2 Main Icons

ต้องมี Icon สำหรับ:

- แผนที่
- วางแผนทริป
- จุดถ่ายรูป
- กิจกรรม
- สินค้าชุมชน
- รายการโปรด
- นำทาง
- โทร
- แชร์
- ภาษา
- ผู้ใช้ / Admin
- ค้นหา

### 13.3 Icon Container

Icon หมวดหลักควรอยู่ในกล่องสีสด:

```css
.feature-icon {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  display: grid;
  place-items: center;
}
```

ตัวอย่างสี icon container:

- Map: `#00796B`
- Trip Planner: `#FDBA2D`
- Photo Spot: `#18B7B5`
- Event: `#6366F1`
- Community: `#A855F7`

---

## 14. Image Style

### 14.1 Image Direction

ภาพควรสื่อ:

- ทะเลสาบเชี่ยวหลาน
- ภูเขาหินปูน
- เรือหางยาว / เรือท่องเที่ยว
- สะพานแขวน
- ภูเขารูปหัวใจ
- ชุมชน
- ผ้าทอ
- น้ำผึ้ง
- ผลไม้
- แสงเช้า / แสงเย็น

### 14.2 Image Rules

- ภาพหลักต้องคมชัด
- ใช้ภาพแนวนอนใน Hero
- ใช้ภาพแนว 4:3 หรือ 1:1 ใน Card
- ต้องมี Overlay เมื่อมีข้อความวางบนภาพ
- ห้ามวางข้อความสีขาวบนภาพสว่างโดยไม่มี Overlay
- ควรบีบอัดภาพก่อนนำขึ้นเว็บ

### 14.3 Recommended Aspect Ratios

| Use Case | Ratio |
|---|---|
| Hero Desktop | 16:9 หรือ 21:9 |
| Hero Mobile | 4:5 หรือ 9:16 crop |
| Place Card | 4:3 |
| Route Card | 3:4 |
| Gallery | 1:1 / 4:3 |
| Event Banner | 16:9 |

---

## 15. Header Design

### 15.1 Desktop Header

ควรเป็น Header แบบ Floating หรือ Glass Bar

องค์ประกอบ:

- Logo Takhun Trip
- Menu:
  - หน้าแรก
  - เส้นทางท่องเที่ยว
  - แผนที่
  - สถานที่ท่องเที่ยว
  - กิจกรรม
  - สินค้าและชุมชน
  - เกี่ยวกับเรา
- Language Switcher
- Search / Profile Icon

### 15.2 Mobile Header

องค์ประกอบ:

- Logo
- Search Icon
- Language Switcher
- Menu Icon หรือใช้ Bottom Navigation เป็นหลัก

### 15.3 Header Rules

- Header ต้องไม่กินพื้นที่มือถือมากเกินไป
- เมื่อ scroll อาจทำให้พื้นหลังเป็นขาวโปร่งหรือ blur
- Active menu ใช้เส้นหรือ badge สี `Emerald Lake`

---

## 16. Bottom Navigation

Mobile ต้องมี Bottom Navigation เพื่อให้ใช้งานเหมือนแอป

### 16.1 Recommended Items

1. หน้าแรก
2. แผนที่
3. วางแผน
4. รายการโปรด
5. เพิ่มเติม

### 16.2 Style

```css
.bottom-nav {
  position: fixed;
  bottom: 12px;
  left: 12px;
  right: 12px;
  height: 68px;
  border-radius: 24px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-floating);
}
```

### 16.3 Center Action

สามารถมีปุ่มกลางแบบ Floating สำหรับ “วางแผนทริป” หรือ “เปิดแผนที่”

---

## 17. Home Page UI

### 17.1 Desktop Home Layout

ลำดับ Section:

1. Floating Header
2. Hero Section ภาพใหญ่
3. Quick Action Cards
4. 4 เส้นทางต้องห้ามพลาด
5. สถานที่ยอดนิยม
6. จุดถ่ายรูป
7. กิจกรรมใกล้คุณ
8. สินค้าและชุมชน
9. Footer

### 17.2 Mobile Home Layout

ลำดับ Section:

1. Compact Header
2. Hero Image Card
3. Search Bar แบบ Floating
4. Quick Action Icons
5. Recommended Trip Card
6. Main Route Cards แนวนอน
7. Popular Places
8. Events
9. Bottom Navigation

### 17.3 Home Design Rules

- Hero ต้องเด่นที่สุด
- Quick Action ต้องกดง่าย
- การ์ดเส้นทางต้องมีภาพจริงหรือภาพแทนที่น่าสนใจ
- หน้าแรกต้องไม่ยาวเกินไปจนผู้ใช้หลง
- ใช้ปุ่ม “ดูทั้งหมด” เพื่อไปหน้าเต็ม

---

## 18. Map UI

### 18.1 Map Layout

หน้าจอแผนที่ควรมี:

- Header พร้อมปุ่มกลับและค้นหา
- Filter Chips ด้านบน
- Full-screen Map
- Floating Layer Control
- Current Location Button
- Place Preview Bottom Card
- ปุ่มนำทางชัดเจน

### 18.2 Map Pin Colors

| Category | Color |
|---|---|
| จุดหลักบ้านตาขุน | `#00796B` |
| ธรรมชาติ | `#22C55E` |
| จุดชมวิว | `#FDBA2D` |
| กิจกรรมชุมชน | `#A855F7` |
| อาหาร / คาเฟ่ | `#F97316` |
| ที่พัก / แพ | `#2563EB` |
| วัด / วัฒนธรรม | `#8B5CF6` |
| อำเภอใกล้เคียง | `#64748B` |

### 18.3 Map Popup Card

Popup ต้องมี:

- รูปขนาดเล็ก
- ชื่อสถานที่
- หมวดหมู่
- ระยะทาง ถ้ามี
- คะแนน ถ้ามี
- ปุ่มดูรายละเอียด
- ปุ่มนำทาง

### 18.4 Map Rules

- บนมือถือห้าม popup ใหญ่เกินไป
- ควรใช้ Bottom Sheet แทน Popup ใหญ่
- ถ้าสถานที่ไม่มีพิกัด ไม่ต้องแสดงบนแผนที่ แต่ให้แสดงในรายการ
- เส้นทาง 4 จุดหลักต้องเด่นกว่าหมุดอื่น

---

## 19. Route UI

### 19.1 Route Explorer

ควรแสดงเป็น Timeline หรือ Step Card

ตัวอย่าง:

```text
01 เขื่อนรัชชประภา
02 บ้านเชี่ยวหลาน
03 พรุไทย ฮันนี่บี
04 บ้านเขาเทพพิทักษ์
```

### 19.2 Route Card

ควรมี:

- เลขลำดับ
- ภาพสถานที่
- ชื่อจุด
- รายละเอียดสั้น
- กิจกรรมเด่น
- ระยะเวลาแนะนำ
- ปุ่มเปิดแผนที่

### 19.3 Route Design Rules

- เส้นทางหลักต้องดูเป็น “ทริป” ไม่ใช่แค่รายชื่อ
- ใช้เส้นเชื่อม timeline เพื่อให้เห็นการเดินทาง
- ใช้เลขลำดับใหญ่ชัดเจน

---

## 20. Place Detail UI

### 20.1 Layout

หน้ารายละเอียดสถานที่ควรประกอบด้วย:

1. ภาพหลักเต็มความกว้าง
2. ปุ่ม Back / Favorite / Share
3. ชื่อสถานที่
4. Badge หมวดหมู่
5. คะแนนรีวิว
6. CTA Buttons:
   - นำทาง
   - โทร
   - แชร์
7. รายละเอียดสถานที่
8. กิจกรรมที่ทำได้
9. รูปภาพเพิ่มเติม
10. สถานที่ใกล้เคียง
11. รีวิว

### 20.2 Place Detail Rules

- CTA ต้องอยู่ด้านบนและมองเห็นชัด
- ข้อมูลติดต่อห้ามซ่อนลึก
- แผนที่ย่อยควรเปิดนำทางได้
- เนื้อหายาวให้แบ่งเป็น block อ่านง่าย

---

## 21. Trip Planner UI

### 21.1 Planner Style

ควรออกแบบแบบ Step-by-step

Step 1: เลือกระยะเวลา  
Step 2: เลือกสไตล์  
Step 3: ดูแผนแนะนำ  
Step 4: บันทึกหรือแชร์

### 21.2 Visual Style

- ใช้ Progress Step
- ใช้ Chip สีสด
- ใช้ Card สำหรับสถานที่
- ใช้ Timeline สำหรับแผนทริป
- ใช้ปุ่ม CTA สีทอง/ส้ม

### 21.3 Planner Rules

- ต้องไม่ซับซ้อน
- ไม่ต้องมี Login
- ข้อมูลบันทึกใน Local Storage ได้
- ผู้ใช้ควรสร้างแผนง่ายภายใน 1 นาที

---

## 22. Community Products UI

### 22.1 Product Card

ควรมี:

- รูปสินค้า
- ชื่อสินค้า
- หมวดหมู่
- กลุ่มผู้ผลิต
- ราคาโดยประมาณ ถ้ามี
- ปุ่มโทร / ติดต่อ

### 22.2 Product UI Tone

ต้องให้ความรู้สึก:

- ของดีชุมชน
- สะอาด
- น่าเชื่อถือ
- ซื้อหรือสอบถามง่าย
- ไม่เหมือน Marketplace ซับซ้อน

### 22.3 Product Rules

- ไม่ต้องมีตะกร้าสินค้าในรุ่นแรก
- เน้นติดต่อผู้ขายโดยตรง
- รูปสินค้าต้องมีคุณภาพพอสมควร

---

## 23. Event UI

### 23.1 Event Card

ควรมี:

- วันที่แบบ Badge
- รูปภาพกิจกรรม
- ชื่อกิจกรรม
- สถานที่
- เวลา
- ปุ่มรายละเอียด
- ปุ่มสนใจเข้าร่วม

### 23.2 Event Rules

- กิจกรรมใกล้ถึงควรแสดงก่อน
- กิจกรรมหมดอายุควรอยู่ในหมวดกิจกรรมที่ผ่านมา
- วันที่ต้องอ่านง่ายมากบนมือถือ

---

## 24. Admin UI

### 24.1 Admin Mood

Admin ต้อง:

- สะอาด
- อ่านง่าย
- ใช้งานจริง
- ไม่จำเป็นต้องสีสันเท่าหน้า Public
- แต่ยังควรใช้แบรนด์เดียวกัน

### 24.2 Admin Layout Desktop

- Sidebar ด้านซ้าย
- Top Bar
- Dashboard Cards
- Data Table
- Search / Filter
- Modal หรือ Form Page สำหรับเพิ่ม/แก้ไข

### 24.3 Admin Layout Mobile

- Top Header
- Bottom หรือ Drawer Menu
- Card List แทน Table ที่กว้างเกินไป
- Form แบบ Single Column
- ปุ่ม Save ใหญ่ ชัดเจน

### 24.4 Admin Card Colors

ใช้สีอ่อนเพื่อแยกข้อมูล:

- Places: `#E0F7FA`
- Routes: `#DCFCE7`
- Products: `#FFF7E6`
- Events: `#EEF2FF`
- Reviews: `#FCE7F3`
- Gallery: `#F3E8FF`

---

## 25. Forms

### 25.1 Form Style

```css
.input {
  border: 1px solid #E5E7EB;
  border-radius: 16px;
  padding: 14px 16px;
  font-size: 16px;
  background: #ffffff;
}
```

### 25.2 Form Rules

- Label ต้องชัดเจน
- Placeholder ไม่ควรแทน Label
- Required field ต้องมีสัญลักษณ์
- Error message ต้องบอกชัดว่าผิดอะไร
- ปุ่ม Save ต้องอยู่ในจุดที่มองเห็นง่าย
- บนมือถือใช้ฟอร์มคอลัมน์เดียว

---

## 26. States

ทุก Component สำคัญต้องมี State

### 26.1 Loading State

ใช้ Skeleton Card หรือ Spinner แบบเรียบ

### 26.2 Empty State

ต้องมีข้อความเป็นมิตร เช่น:

- “ยังไม่มีข้อมูลในหมวดนี้”
- “ยังไม่พบสถานที่ที่ตรงกับการค้นหา”
- “ยังไม่มีกิจกรรมในช่วงนี้”

### 26.3 Error State

ต้องมีข้อความ:

- “โหลดข้อมูลไม่สำเร็จ”
- “กรุณาลองใหม่อีกครั้ง”
- ปุ่ม “ลองใหม่”

### 26.4 Success State

ใช้ Toast หรือ Alert สีเขียว:

- “บันทึกข้อมูลเรียบร้อย”
- “เพิ่มลงรายการโปรดแล้ว”
- “คัดลอกลิงก์แล้ว”

---

## 27. Language Switcher

### 27.1 Style

ควรเป็น Pill Button:

```text
TH ˅
```

หรือ

```text
TH | EN
```

### 27.2 Rules

- ค่าเริ่มต้นเป็นภาษาไทย
- บันทึกภาษาที่เลือกไว้ใน Local Storage
- หากข้อมูลภาษาอังกฤษไม่มี ให้ fallback ภาษาไทย
- ไม่ควร reload หน้าเว็บถ้าไม่จำเป็น

---

## 28. Responsive Breakpoints

```css
--breakpoint-sm: 480px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
```

แนวทาง:

- Mobile: 0–767px
- Tablet: 768–1023px
- Desktop: 1024px ขึ้นไป

---

## 29. CSS Variables

ให้กำหนด Design Token ใน `main.css`

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

  --container-max: 1180px;
}
```

---

## 30. Animation

### 30.1 Animation Style

ใช้ animation เบา ๆ เท่านั้น

ตัวอย่าง:

- Card hover ยกขึ้นเล็กน้อย
- Button hover สว่างขึ้น
- Bottom Sheet slide up
- Toast fade in/out
- Map marker bounce เบา ๆ เมื่อเลือก

### 30.2 Motion Rules

- ห้ามใช้ animation เยอะจนรบกวน
- ความเร็วควรอยู่ที่ 180–300ms
- ต้องรองรับ `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

---

## 31. Accessibility Rules

ต้องคำนึงถึงการใช้งานจริง

- Contrast ต้องอ่านง่าย
- ปุ่มต้องใหญ่พอกดด้วยนิ้ว
- Icon ต้องมี aria-label ถ้าไม่มีข้อความ
- รูปภาพต้องมี alt text
- Form ต้องมี label
- Focus state ต้องมองเห็น
- ห้ามใช้สีเพียงอย่างเดียวในการสื่อสถานะ

---

## 32. Page-specific Design Summary

### 32.1 Home

- ภาพใหญ่
- CTA ชัด
- สีสด
- การ์ดโค้งมน
- Quick Action Icons

### 32.2 Map

- Full-screen map
- Filter chips
- Bottom place card
- Pin สีสด
- ปุ่มนำทางเด่น

### 32.3 Routes

- Timeline
- Step Card
- ภาพและเลขลำดับ
- CTA เปิดแผนที่

### 32.4 Place Detail

- Hero image
- Floating action buttons
- CTA โทร / นำทาง / แชร์
- ข้อมูลแบ่งเป็น section

### 32.5 Trip Planner

- Step-by-step
- Chip เลือกสไตล์
- Timeline ทริป
- ปุ่มแชร์

### 32.6 Products

- Card สินค้า
- ปุ่มติดต่อเร็ว
- หมวดหมู่ชัดเจน

### 32.7 Events

- Date badge
- Event card
- ปุ่มสนใจเข้าร่วม

### 32.8 Admin

- ใช้งานง่าย
- Table / Card ตามขนาดจอ
- Form ชัดเจน
- Dashboard ดูภาพรวมได้เร็ว

---

## 33. Design Do / Don’t

### 33.1 Do

- ใช้ภาพใหญ่และคุณภาพดี
- ใช้สีสดอย่างมีระบบ
- ใช้ปุ่ม CTA ชัดเจน
- ใช้ Card โค้งมนและเงานุ่ม
- ทำ Mobile-first
- ใช้ Icon minimal
- ทำให้กดนำทาง โทร แชร์ ได้ง่าย
- ใช้ภาษาสั้น เข้าใจง่าย
- แสดงข้อมูลสำคัญก่อน

### 33.2 Don’t

- อย่าใช้พื้นขาวล้วนทั้งเว็บ
- อย่าใช้สีเขียวเดียวทุกหน้า
- อย่าทำให้ดูเหมือนเอกสารราชการ
- อย่าใส่ข้อความยาวในการ์ด
- อย่าใช้ icon หลายสไตล์ปนกัน
- อย่าใช้ animation เยอะเกินไป
- อย่าซ่อนปุ่มนำทางลึกเกินไป
- อย่าทำระบบซับซ้อนเกิน MVP

---

## 34. Codex Design Instructions

เมื่อใช้ Codex สร้างหรือแก้ UI ให้สั่งตามหลักนี้:

1. อ่าน `docs/DESIGN.md` ก่อนแก้ UI ทุกครั้ง
2. รักษาโทน Premium Travel, Fresh & Vibrant, Mobile-first
3. ใช้สีจาก Color Palette เท่านั้น เว้นแต่มีคำสั่งใหม่
4. ใช้ Design Tokens จาก CSS Variables
5. สร้าง Component ที่ reuse ได้
6. ทุกหน้าต้อง Responsive
7. ทุกปุ่มต้องกดง่ายบนมือถือ
8. ทุก Card ต้องมี spacing และ shadow ตามระบบ
9. ห้ามเพิ่ม framework ใหม่
10. ห้ามเปลี่ยนแนวทางดีไซน์โดยไม่ได้รับอนุญาต

---

## 35. Final Design Direction

ภาพรวมสุดท้ายของ **Takhun Trip** ต้องเป็นเว็บแอปที่รู้สึกว่า:

> “นี่คือแอปท่องเที่ยวบ้านตาขุนที่ดูทันสมัย ใช้งานง่าย มีสีสัน สดใส และน่าออกเดินทาง”

ทุกหน้าควรรักษาความรู้สึกเดียวกัน คือ

- ท่องเที่ยว
- ธรรมชาติ
- สดใส
- พรีเมี่ยม
- ใช้งานง่าย
- เชื่อมโยงชุมชน
- เหมาะกับนักท่องเที่ยวจริง
