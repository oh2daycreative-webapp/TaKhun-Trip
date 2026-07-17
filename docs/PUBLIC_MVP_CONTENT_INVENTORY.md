# Public MVP Content Inventory

> สถานะการตรวจ: 17 กรกฎาคม 2026  
> Branch: `feature/public-mvp-content-inventory`  
> Base commit: `2a09ace`  
> ขอบเขต: inventory และ proposal เท่านั้น ไม่มีการเปลี่ยน runtime, API, Apps Script, Google Sheets, media หรือ config

## 1. Executive Summary

Public UI ครอบคลุมหน้าและ flow หลักของ MVP แล้ว แต่ **ยังไม่พร้อมสาธิตในฐานะเว็บไซต์ข้อมูลจริง** เพราะ `public/js/config.js` กำหนด `API_URL: ""` ทำให้ API client เปลี่ยนไปใช้ local fallback ตามที่แต่ละ feature เตรียมไว้ และข้อมูล entity ที่ตรวจพบใน repository เป็น mock/demo ทั้งหมด ไม่มี snapshot ของแถวข้อมูล Google Sheets ให้ยืนยันว่ามีข้อมูล production ใดอยู่จริง

สถานะข้อมูล runtime ปัจจุบัน:

- Places: 14 records ใน `public/js/place-data.js` (published 13, draft 1) ทุก record มี `MOCK-PLACE-*`, `is_demo: true`, คำบรรยายตัวอย่าง และบาง record มีพิกัดที่คำนวณขึ้นเพื่อทดสอบ
- Routes: 3 records ใน `public/js/routes.js` ทุก record เป็น mock; มี route หนึ่งที่จงใจใช้ stop order ผิดรูปแบบเพื่อทดสอบ
- Products: 5 records ใน `public/js/products.js` ทุก record เป็น mock; มีราคา เบอร์โทร และ URL ตัวอย่างที่ห้ามเผยแพร่เป็นข้อเท็จจริง
- Events: 4 records ใน `public/js/events.js` ทุก record เป็น mock และวันที่ถูกคำนวณจากวันที่เปิดหน้า ไม่ใช่วันจัดงานจริง
- Gallery: 4 records ใน `public/js/gallery.js` ทุก record เป็น mock; ใช้สื่อภายนอกสำหรับ demo และมี URL `javascript:` หนึ่งรายการสำหรับทดสอบการป้องกัน unsafe media
- Reviews: 1 approved mock review ผูกกับ `MOCK-PLACE-001`; หน้า review list รองรับ API/fallback แต่ยังไม่มี verified public reviews
- Settings/About: fallback มีชื่อเว็บ สโลแกน และอีเมลโครงการ แต่ phone, social, logo และ hero image ว่าง
- Search: ไม่มี mock fallback; เมื่อ `API_URL` ว่าง การค้นหาจะเข้า request-error
- Footer: มีเฉพาะหน้า Home และยังมี `0X-XXX-XXXX` กับ `contact@example.com` ซึ่งเป็น placeholder
- Media: ไม่มีไฟล์ภาพหรือวิดีโอจริงใน `public/`; media ที่เห็นมาจาก data URI, external demo URL หรือ CSS-generated fallback

สิ่งที่ต้องทำก่อนพร้อมสาธิต:

1. ยืนยันชุดข้อมูลจริงขั้นต่ำและเจ้าของแหล่งข้อมูลสำหรับ Places, Routes, Products, Events และ Gallery
2. ยืนยันชื่อ TH/EN, สถานะเผยแพร่ และ factual fields โดยเฉพาะราคา เวลาเปิด พิกัด เบอร์โทร วันกิจกรรม และเงื่อนไขบริการ
3. จัดหา media ที่มีสิทธิ์ใช้งาน พร้อม credit และ alt text สองภาษา
4. นำข้อมูลที่ยืนยันแล้วเข้าสู่ Google Sheets/API หรือ local content source ที่ตกลงกัน และลบการรั่วไหลของ mock จาก public mode
5. แก้ Search/API integration, Footer placeholder และตรวจ language fallback ก่อน demo

เอกสาร `PROMPT_PACK.md` ที่คำขอให้ตรวจไม่พบใน repository ณ base commit นี้

## 2. Public Page Inventory

| Page | HTML file | JavaScript file | Data source | Current content status | Thai status | English status | Media status | Loading/Empty/Error states | Issues | Recommended action |
|---|---|---|---|---|---|---|---|---|---|---|
| Home | `public/index.html` | `config.js`, `i18n.js`, `api.js`, `app.js`, `home.js` | `getHomeData`; local `MOCK_HOME_RESPONSE`; hardcoded inspiration/footer | Hero/editorial copy hardcoded; featured places/routes demo; other home collections empty | UI complete; editorial claims not source-verified | UI complete; entity copy is demo translation | No real hero/card files; CSS/fallback only | primary loading/ready/empty/error; section empty for places/routes | Demo entity names differ from shared place records; footer placeholders; products/events/gallery not rendered from mock | Replace all home collections from approved set; source footer/contact from verified settings |
| Places | `public/places.html` | `place-data.js`, `places.js` | **local mock only**; URL filters; `TAKHUN_FAVORITES` | 13 published demo + 1 draft demo | Demo copy complete | Demo copy complete | 7 records use shared data-URI DEMO art; others fallback | loading/ready/empty/error + retry | Does not call `getPlaces`; no real IDs/content; approximate/missing coordinates | Integrate approved place dataset/API and retain visible unverified warning until verified |
| Place Detail | `public/place-detail.html` | `place-data.js`, `reviews.js`, `place-detail.js` | `getPlaceDetail` with local mock; `id`; favorites localStorage; reviews API/mock | Fully functional demo detail | Demo copy complete | Demo copy complete | Data-URI demo gallery on selected records; no real media | loading/ready/not-found/error; reviews idle/loading/empty/error/ready | All visitor facts blank or fabricated demo; one mock review | Replace shared repository with verified records; hide empty factual fields; connect approved reviews |
| Map | `public/map.html` | `place-data.js`, Leaflet CDN, `map.js` | **local mock only**; `focus`, `route`; geolocation; favorites localStorage | Demo map/list | UI complete with explicit approximate-coordinate notice | UI complete | No real place media; OSM tiles and Leaflet external dependencies | loading/ready/empty/error; Leaflet/tile/focus/coordinate/route/location notices | 7 generated approximate coordinate pairs; route query cannot resolve real route data | Publish only confirmed coordinates; preserve list fallback; document CDN dependency |
| Routes | `public/routes.html` | `api.js`, `routes.js` | `getRoutes` with 3 local mocks; URL style filter | Demo list | Demo copy complete | Demo copy complete | All cover URLs empty | loading/ready/empty/error | Mock records include test-only route and no verified duration | Replace with 3-5 approved routes and images |
| Route Detail | `public/route-detail.html` | `api.js`, `routes.js` | `getRouteDetail` with local mocks; `id` | Demo detail | Demo copy complete | Demo copy complete | All route/stop images empty | loading/ready/not-found/error + empty timeline | `MOCK-ROUTE-001` includes invalid stop ID/order by design; no factual route timing | Validate every stop against published Places and verify duration/order |
| Trip Planner | `public/trip-planner.html` | `place-data.js`, `routes.js`, `trip-planner.js` | `getTripTemplates` with 3 local mocks; `from_route`, `add`; `TAKHUN_TRIP_PLAN` | Functional planner using demo records | UI/template demo copy complete | UI/template demo copy complete | Uses place fallback media | loading/error/empty templates; empty plan/action notices | Saved plans can persist mock IDs across content replacement | Version/migrate stored plan; publish templates only after route/place IDs stabilize |
| Products | `public/products.html` | `api.js`, `products.js` | `getProducts` with 5 local mocks; URL filters | Demo list | Demo copy complete | Demo copy complete | All image URLs empty | loading/ready/empty/filtered-empty/error | Contains unverified example price, phone and contact URLs | Replace entire mock set; verify producer/contact/price before showing |
| Product Detail | `public/product-detail.html` | `api.js`, `products.js` | `getProductDetail` with local mock; `id` | Demo detail | Demo copy complete | Demo copy complete | All image URLs empty | loading/ready/not-found/error | Same factual risk as list; related IDs do not match current `MOCK-PLACE-*` IDs | Use canonical related place IDs; hide price/contact unless verified |
| Events | `public/events.html` | `api.js`, `events.js` | `getEvents` with 4 local mocks; type/month URL filters | Demo list | Demo copy complete | Demo copy complete | All image URLs empty | loading/ready/empty/filtered-empty/error | Dates shift relative to browser date; example phone/register URL | Do not expose any demo event; ingest organizer-confirmed records only |
| Event Detail | `public/event-detail.html` | `api.js`, `events.js` | `getEventDetail` with local mock; `id` | Demo detail | Demo copy complete | Demo copy complete | No event images | loading/ready/not-found/error | Date/time/location/contact/register fields are demonstrative | Require verification timestamp/source for every public event |
| Gallery | `public/gallery.html` | `api.js`, `gallery.js` | `getGallery` with 4 local mocks; URL filters | Demo media viewer | Demo titles/captions complete | Demo titles/captions complete | Unsplash image/thumbnail, MDN MP4, YouTube URL, one blocked unsafe URL | initial/loading/ready/empty/filtered-empty/invalid-filter/error/malformed/media-load-error | External demo licensing/context not suitable; category set differs from requested editorial categories | Replace with owned/approved media and semantic categories/IDs |
| Search | `public/search.html` | `api.js`, `search.js` | `searchAll`; `q` URL parameter | UI exists but unusable in current config | UI complete | UI complete | Result media depends on API | idle/loading/ready/empty/validation-error/request-error + section empty | No mock fallback and empty API config always produces request-error | Connect API before demo; test all four result types and empty sections |
| Reviews | embedded in `public/place-detail.html` | `reviews.js`, `place-detail.js` | `getReviews` with local mock; `submitReview` client exists but no verified content | One approved mock review; no standalone public page | UI/system copy complete | UI/system copy complete; review content falls back | No review media | idle/loading/ready/empty/error + pagination | Mock review must never appear as real testimony; submission flow not a complete public feature | Start empty or with approved real reviews; retain moderation status and consent rules |
| Favorites | `public/favorites.html` | `place-data.js`, `favorites.js` | `TAKHUN_FAVORITES`; detail API/mock | Functional with demo IDs | UI complete | UI complete | Place demo/fallback media | initial/loading/empty/malformed-storage-recovered/error/ready/partial-error | Old mock IDs can remain in browsers | Remove stale IDs during content migration and communicate recovery |
| About | `public/about.html` | `api.js`, `about.js` | `getSettings` with `mockSettings`; hardcoded purpose/principles in HTML | Mixed editorial + mock settings | Main editorial copy present; claims need owner approval | English UI/content present | logo/hero empty; generated fallback | initial/loading/ready/empty/error/malformed-response | Only email populated; social/phone/media missing; API mode not proven | Approve bilingual project copy; use verified settings and branded assets |
| 404 | `public/404.html` | `i18n.js`, `app.js` | hardcoded HTML + i18n | Ready as system page | Complete | Complete | CSS illustration only | N/A | Not included in `PUBLIC_PAGE_MAP`, so shell defaults to More state | Verify navigation state and production routing behavior |
| Navigation | injected into all public pages by `app.js` | `public/js/app.js` | hardcoded route map + i18n | Functional desktop/drawer/bottom nav | Complete | Complete | Inline SVG icons | Shell fallback link exists in page HTML | Detail/foundation/404 coverage differs; no content flags from settings | Keep shared source; verify every destination and enabled-feature policy |
| Footer | Home only | inline in `public/index.html` | hardcoded HTML + i18n | **Not production-safe** | Copy present | Copy present via i18n | Inline SVG logo | N/A | Placeholder phone/email; footer absent from other pages; contact not sourced from Settings | Replace placeholder, decide global vs Home-only scope, source contacts from verified settings |
| Language switch | injected by `app.js`; engine `i18n.js` | `public/js/i18n.js`, `app.js` | i18n dictionaries; `TAKHUN_LANG`; entity `*_th`/`*_en` with Thai fallback | Functional | Complete UI baseline | Complete UI baseline | Alt labels localized/fallback-generated | Falls back to TH for missing entity field | Most current entity translations are demo; raw API field completeness unknown | Audit approved dataset field-by-field; no raw key or mixed-language card in acceptance |

`foundation-preview.html` เป็น internal design-system preview ไม่ใช่ Public MVP destination และไม่ควรนำขึ้นเมนูหรือใช้เป็น content source

## 3. Existing Data Inventory

นิยามสถานะในส่วนนี้:

- **Runtime mock** = ผู้ใช้เห็นได้เมื่อ `API_URL` ว่าง แต่ไม่ใช่ข้อเท็จจริง
- **Schema only** = Apps Script รองรับการอ่าน Google Sheets แต่ repository ไม่มี row data ให้ตรวจ
- **Source candidate** = มีชื่อ/ข้อมูลใน `README.md` แต่ยังไม่ได้เป็น entity ใน runtime และต้องยืนยันก่อนใช้

### 3.1 Places

Apps Script รองรับชีต `places`, filter เฉพาะ `status=published` และ project fields สำหรับ list/detail/map แต่ `api.js` ไม่มี public wrapper `getPlaces/getMapPlaces`; หน้า Places/Map ใช้ local repository โดยตรง

| place_id | name_th | name_en | district | category | route_group | status | data source | mock/demo/real | cover image | gallery | review | information requiring verification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MOCK-PLACE-001 | จุดชมธรรมชาติตัวอย่าง 1 | Sample Nature Stop 1 | ban_ta_khun | nature | main_point_1 | published | `place-data.js` | Demo | data-URI DEMO | 1 DEMO image | 1 mock approved | ทั้งหมด รวมชื่อ พิกัด ลิงก์นำทาง |
| MOCK-PLACE-002 | ชุมชนท่องเที่ยวตัวอย่าง 2 | Sample Community Stop 2 | ban_ta_khun | community_tourism | main_point_1 | published | `place-data.js` | Demo | data-URI DEMO | 1 DEMO image | none | ทั้งหมด; ไม่มีพิกัด |
| MOCK-PLACE-003 | จุดชมวิวตัวอย่าง 3 | Sample Viewpoint 3 | ban_ta_khun | viewpoint | main_point_2 | published | `place-data.js` | Demo | missing | missing | none | ทั้งหมด; generated approximate coordinate |
| MOCK-PLACE-004 | คาเฟ่ตัวอย่าง 4 | Sample Café 4 | ban_ta_khun | food_cafe | main_point_2 | published | `place-data.js` | Demo | data-URI DEMO | 1 DEMO image | none | ทั้งหมด; ไม่มีพิกัด/นำทาง |
| MOCK-PLACE-005 | กิจกรรมกลางแจ้งตัวอย่าง 5 | Sample Outdoor Activity 5 | khiri_rat_nikhom | activity | — | published | `place-data.js` | Demo | missing | missing | none | ทั้งหมด; generated approximate coordinate |
| MOCK-PLACE-006 | พื้นที่ธรรมชาติตัวอย่าง 6 | Sample Nature Area 6 | khiri_rat_nikhom | nature | — | published | `place-data.js` | Demo | data-URI DEMO | 1 DEMO image | none | ทั้งหมด; ไม่มีพิกัด/นำทาง |
| MOCK-PLACE-007 | ชุมชนตัวอย่าง 7 | Sample Community 7 | khiri_rat_nikhom | community_tourism | — | published | `place-data.js` | Demo | missing | missing | none | ทั้งหมด; ไม่มีพิกัด |
| MOCK-PLACE-008 | จุดชมวิวตัวอย่าง 8 | Sample Viewpoint 8 | phanom | viewpoint | nearby_phanom | published | `place-data.js` | Demo | data-URI DEMO | 1 DEMO image | none | ทั้งหมด; generated approximate coordinate |
| MOCK-PLACE-009 | กิจกรรมตัวอย่าง 9 | Sample Activity 9 | phanom | activity | nearby_phanom | published | `place-data.js` | Demo | missing | missing | none | ทั้งหมด; ไม่มีพิกัด/นำทาง |
| MOCK-PLACE-010 | คาเฟ่ตัวอย่าง 10 | Sample Café 10 | phanom | food_cafe | nearby_phanom | published | `place-data.js` | Demo | data-URI DEMO | 1 DEMO image | none | ทั้งหมด; ไม่มีพิกัด |
| MOCK-PLACE-011 | เส้นทางธรรมชาติตัวอย่าง 11 | Sample Nature Trail 11 | ban_ta_khun | nature | main_point_1 | published | `place-data.js` | Demo | missing | missing | none | ทั้งหมด; generated approximate coordinate |
| MOCK-PLACE-012 | กิจกรรมชุมชนตัวอย่าง 12 | Sample Community Activity 12 | ban_ta_khun | community_tourism | main_point_2 | published | `place-data.js` | Demo | data-URI DEMO | 1 DEMO image | none | ทั้งหมด; ไม่มีพิกัด/นำทาง |
| MOCK-PLACE-013 | จุดพักตัวอย่าง 13 | Sample Rest Stop 13 | ban_ta_khun | viewpoint | main_point_1 | published | `place-data.js` | Demo | missing | missing | none | ทั้งหมด; ไม่มีพิกัด/นำทาง |
| MOCK-PLACE-014 | ข้อมูลร่างตัวอย่าง | Sample Draft | ban_ta_khun | nature | main_point_1 | draft | `place-data.js` | Demo | missing | missing | none | ไม่ควรเผยแพร่; ทั้งหมดไม่ยืนยัน |

สรุป: ไม่มี Place ใดที่จัดเป็น verified real runtime record ได้ พิกัดของ records เลขคี่บางรายการสร้างจากสูตร `8.9 + number/1000`, `98.9 + number/1000` และต้องลบทิ้งเมื่อ integration

### 3.2 Routes

Apps Script รองรับชีต `routes`, `route_places`, `trip_templates`, เชื่อมเฉพาะ published places และเรียง `stop_order`

| route_id | title_th | title_en | duration | route stops | data source | mock/demo/real | image | information requiring verification |
|---|---|---|---|---|---|---|---|---|
| MOCK-ROUTE-001 | เส้นทางตัวอย่างบ้านตาขุน | Sample Ban Ta Khun Route | 1 วัน | MOCK-PLACE-002 (2), MOCK-PLACE-010 (10), MOCK-PLACE-INVALID (`later`) | `routes.js` | Demo | missing | ชื่อ ระยะเวลา จุดแวะ ลำดับ การเดินทางทั้งหมด; invalid stop เป็น test fixture |
| MOCK-ROUTE-002 | เส้นทางตัวอย่างธรรมชาติและภาพถ่าย | Sample Nature and Photo Route | ครึ่งวัน | ไม่มี detail stops ใน mock | `routes.js` | Demo | missing | ทั้งหมด |
| MOCK-ROUTE-EMPTY | เส้นทางตัวอย่างที่ยังไม่มีจุดแวะ | Sample Route Without Stops | missing | 0 | `routes.js` | Demo/test empty state | missing | ไม่ใช่ content candidate |

Trip templates เพิ่มอีก 3 demo records (`MOCK-TRIP-001..003`) และหยิบ places ตามตำแหน่ง array ไม่ใช่ curated verified itinerary

### 3.3 Products

Apps Script รองรับชีต `products`, เชื่อม `related_place_id` กับ published place และส่ง price/contact ออก public โดยตรง จึงต้องตรวจ factual fields ก่อน ingest

| product_id | title/name | category | producer | price/contact presence | mock/demo/real | image | information requiring verification |
|---|---|---|---|---|---|---|---|
| MOCK-PROD-001 | น้ำผึ้งป่าชุมชน / Community Forest Honey | honey | กลุ่มตัวอย่างพรุไทย | “เริ่มต้น 180 บาท”; 081 234 5678; example URLs | Demo | missing | ราคา เบอร์ ผู้ผลิต สถานที่ ช่องทางติดต่อทั้งหมด |
| MOCK-PROD-002 | ผ้าทอสีธรรมชาติ / Natural-dyed Handwoven Textile | handicraft | กลุ่มทอผ้าตัวอย่างบ้านเชี่ยวหลาน | no price; 087 270 0774 | Demo | missing | เบอร์ตรงกับข้อมูลใน README แต่ mock record ยังไม่ใช่หลักฐานอนุมัติ; ต้องยืนยันเจ้าของ |
| MOCK-PROD-003 | ชุดเรียนรู้สมุนไพร / Herbal Learning Kit | herbal | ชุมชนตัวอย่างคีรีรัฐนิคม | no price/phone; example contact URL | Demo | missing | ทั้งหมด |
| MOCK-PROD-004 | ผลไม้ตามฤดูกาล / Seasonal Fruit Selection | fruit | สวนตัวอย่างอำเภอพนม | “สอบถามตามฤดูกาล”; no contact | Demo | missing | ชนิดผลไม้ ฤดูกาล ผู้ผลิต ราคา |
| MOCK-PROD-005 | กิจกรรมทำของฝากชุมชน / Community Souvenir Workshop | community_activity | กลุ่มกิจกรรมตัวอย่างบ้านตาขุน | price `0` rendered as contact-for-price; no contact | Demo | missing | ทั้งหมด |

### 3.4 Events

| event_id | title | date | location | related place | status | mock/demo/real | image | information requiring verification |
|---|---|---|---|---|---|---|---|---|
| MOCK-EVT-TODAY | ตลาดชุมชนวันนี้ / Community Market Today | วันที่เปิดหน้า | บ้านตาขุน สุราษฎร์ธานี | BTK-001 | published | Demo | missing | ทุก field โดยเฉพาะวัน เวลา สถานที่ ผู้จัด |
| MOCK-EVT-UPCOMING | เทศกาลท่องเที่ยวบ้านตาขุน / Ban Ta Khun Tourism Festival | วันที่เปิดหน้า + 7 วัน | บ้านตาขุน สุราษฎร์ธานี | BTK-001 | published/featured | Demo | missing | ทุก field |
| MOCK-EVT-NO-TIME | กิจกรรมตัวอย่างบ้านตาขุน / Ban Ta Khun Demo Event | วันที่เปิดหน้า + 14 วัน | บ้านตาขุน สุราษฎร์ธานี | none | published | Demo | missing | ทุก field; ตั้งใจไม่มีเวลา/register |
| MOCK-EVT-PAST | กิจกรรมของดีชุมชน / Community Products Event | วันที่เปิดหน้า - 14 วัน | บ้านตาขุน สุราษฎร์ธานี | none | published | Demo | missing | ทุก field; ตั้งใจทดสอบ past/empty contact |

ทุก record ตั้งเวลาเริ่ม/จบ 09:00-15:00 ยกเว้น no-time, ใช้ example register URL/phone ใน base object และไม่สามารถใช้เป็นวันจัดงานจริงได้

### 3.5 Gallery

| media_id | category | related entity | current URL/path | mock/demo/real | missing media | alt text status |
|---|---|---|---|---|---|---|
| MOCK-GAL-001 | place | BTK-001 | Unsplash image + thumbnail external URLs | Demo | No owned/local original | No explicit `alt_text_th/en`; generated from localized title |
| MOCK-GAL-002 | community | none | MDN demo MP4 + Unsplash thumbnail | Demo | No owned/local original | Video thumbnail alt generated from title |
| MOCK-GAL-003 | event | BTK-004 | YouTube watch URL | Demo | No thumbnail/local media | Viewer opens external source; no explicit alt text |
| MOCK-GAL-004 | other | none | `javascript:alert(1)` | Demo security fixture | Invalid/blocked media | Fallback label only; must never ingest |

## 4. Content Gap Analysis

| Area/entity | Missing Thai content | Missing English content | Placeholder/demo | Unverified factual fields | Missing UX/system messages | Broken/missing media |
|---|---|---|---|---|---|---|
| Home | Approved hero/editorial wording and real collections | Approved translations for all collections | Mock featured cards; footer phone/email | Destination claims/contact | Core states present | Hero/card/product/event/gallery assets absent |
| Places/Detail | Real names, descriptions, highlights, activities, visitor guidance | Official names and full descriptions | All 14 records | phone, map URL, coordinates, opening time, fee, duration, best time | States present | No real cover/gallery/video |
| Map | Verified label/content | Verified label/content | All points local mock | all coordinates/navigation | Rich map/location states present | No real marker preview images; external tile dependency |
| Routes/Planner | Real route descriptions and stop narratives | Full translated routes/templates | 3 routes + 3 templates | duration, order, feasibility, conditions | States present; planner uses inline messages | All route media absent |
| Products | Real names, producers, descriptions | Complete translations | 5 records | price, phone, producer, contact, seasonal availability | States present | All images absent |
| Events | Organizer-approved title/description | Full translations | 4 date-relative records | date, time, venue, contact, registration, conditions | States present | All images absent |
| Gallery | Approved captions/credits | Approved captions/credits | All 4 records | rights/license, photographer, related entity | States comprehensive | No local/owned asset; one unsafe URL |
| Search | Result data | Result data | No fallback | Depends on production dataset | UI messages present | Depends on entity media; currently request-error |
| Reviews | Approved real reviews or intentional empty state | Translation policy for user-generated text | One mock review | consent, moderation, timestamps | List states present | N/A |
| About/Footer | Approved ownership/contact copy | Approved English copy | mock settings and footer placeholders | official phone/email/social/project owner | States present | logo/hero missing; footer not shared |
| Navigation/i18n/404 | No major UI gap found | No major UI gap found | Entity translations still demo | feature enablement policy | Core messages present | Inline/CSS art only |

Mojibake scan ไม่พบรูปแบบ `Ã`, `Â`, `â€`, `à¸` หรือ replacement character ในไฟล์ source ที่ตรวจ แต่ควรตรวจซ้ำหลัง import จาก Sheets/CSV เพราะเป็นจุดเสี่ยงใหม่ของ Milestone 2

## 5. Recommended Public MVP Content Set

หลักการเลือก: บ้านตาขุนเป็นแกน, จำนวน record ต่ำพอให้ตรวจข้อเท็จจริงและสื่อได้ครบ, และแยก “มีชื่อในเอกสาร” ออกจาก “พร้อมเผยแพร่” อย่างชัดเจน

### Places: เป้าหมาย 10 แห่ง

ไม่มีรายการใดเป็น real runtime record แล้วในปัจจุบัน รายการต่อไปนี้เป็น **source candidates จาก README เท่านั้น**; semantic ID เป็น proposal และยังห้าม ingest จนกว่าเจ้าของข้อมูลจะอนุมัติ

| Proposed ID | Candidate | Area | Source status | English/content status | Verification gate |
|---|---|---|---|---|---|
| BTK-001 | วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา | บ้านตาขุน | Named in README | Official English name missing | identity, phone, map, services, hours, media |
| BTK-002 | วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน | บ้านตาขุน | Named in README | Official English name missing | identity, phone, map, activities, media |
| BTK-003 | วิสาหกิจชุมชนพรุไทย ฮันนี่บี | บ้านตาขุน | Named in README | Official spelling/name missing | identity, phone, map, activity conditions, media |
| BTK-004 | วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์ | บ้านตาขุน | Named in README | Official English name missing | identity, phone, map, activities, media |
| BTK-005 | ทะเลสาบเขื่อนเชี่ยวหลาน | บ้านตาขุน | Named as nearby attraction in README | Official naming/description missing | access model, map point, safety/fees/hours, media |
| KRN-001 | หินพัด / หินนิลเปา | คีรีรัฐนิคม | Named in README | Canonical Thai/English name unresolved | canonical name, district, map, access, media |
| KRN-002 | ป่าต้นน้ำบ้านน้ำราด | คีรีรัฐนิคม | Named in README | English missing | operator, phone, map, hours/fees/conditions, media |
| KRN-003 | OASIS Forest Garden | คีรีรัฐนิคม | Named in README | Confirm official styling | operator, phone, map, hours/fees, media |
| PNM-001 | อุทยานแห่งชาติคลองพนม | พนม | Named in README | Use authority-approved bilingual name | official source, phone, map, hours/fees/rules, media rights |
| PNM-002 | อุทยานธรรมเขานาในหลวง | พนม | Named in README | Official English missing | official name, map, hours/rules, media |

เขียนเชิงบรรณาธิการได้ทันทีหลังยืนยันชื่อและขอบเขต: บทนำบรรยากาศแบบไม่ระบุราคา เวลา ระยะทาง ความปลอดภัย หรือคำรับรองเชิงเปรียบเทียบ เช่น “ชวนสำรวจธรรมชาติและเรื่องราวชุมชนในบ้านตาขุน” แต่ข้อความที่อ้างกิจกรรมเฉพาะต้องมีแหล่งยืนยัน

### Routes: เป้าหมาย 4 เส้นทาง

| Proposed ID | Proposal | Candidate stops | Status |
|---|---|---|---|
| ROUTE-BTK-CORE | 4 ชุมชนบ้านตาขุน | BTK-001 → BTK-002 → BTK-003 → BTK-004 | Proposed; verify order, travel time, opening/booking constraints |
| ROUTE-BTK-LAKE | เขื่อนและทะเลสาบ | BTK-001 + BTK-005 | Proposed; verify access point, operator, timing and safety |
| ROUTE-KRN-NATURE | ธรรมชาติคีรีรัฐนิคม | KRN-001 + KRN-002 + KRN-003 | Proposed; verify geographic feasibility and every factual field |
| ROUTE-PNM-NATURE | ธรรมชาติอำเภอพนม | PNM-001 + PNM-002 | Proposed; verify authority rules, route feasibility and seasonality |

ห้ามใส่ duration, distance, schedule หรือ stop order เป็นข้อเท็จจริงก่อน route owner/แหล่งแผนที่ยืนยัน

### Products: เป้าหมาย 7 รายการ

Source candidates จาก README: ผ้าทอมือบ้านเชี่ยวหลาน, น้ำผึ้ง/ผลิตภัณฑ์จากผึ้ง, สมุนไพรชุมชน, ทุเรียนคลองแสง, เงาะตามฤดูกาล, มังคุดตามฤดูกาล, ข้าวหลามปลายอก รายการเหล่านี้เสนอเพื่อเติม category mix เท่านั้น ต้องยืนยันชื่อสินค้า ผู้ผลิต ความพร้อมจำหน่าย ราคา ช่องทางติดต่อ ภาพ และความเกี่ยวข้องกับ place ก่อนเผยแพร่

- สามารถเขียน editorial description ที่ไม่อ้างสรรพคุณ ราคา ปริมาณ ฤดูกาลแน่นอน หรือการรับรองได้หลังผู้ผลิตอนุมัติ
- ถ้าราคายังไม่ยืนยัน ให้ซ่อน `price_range` ไม่ใช้ราคาจาก mock และแสดง “โปรดติดต่อผู้ผลิตเพื่อยืนยันข้อมูล” เฉพาะเมื่อช่องทางติดต่อได้รับการยืนยัน
- ผลิตภัณฑ์สมุนไพร/น้ำผึ้งห้ามมี health claims โดยไม่มีหลักฐานและการอนุมัติ

### Events: เป้าหมาย 1-3 รายการ

ยังไม่มี event candidate ใดใน repository ที่ปลอดภัยสำหรับเผยแพร่ แนะนำให้เริ่มด้วย 1 รายการที่ผู้จัดยืนยันครบถ้วน และเพิ่มได้สูงสุด 3 รายการเมื่อมีหลักฐานวัน เวลา สถานที่ ผู้ประสานงาน ช่องทางลงทะเบียน เงื่อนไข และภาพที่มีสิทธิ์ใช้ ห้ามแปลงชื่อ mock “ตลาดชุมชน/เทศกาลท่องเที่ยว” ให้เป็นกิจกรรมจริงโดยอนุมาน

### Gallery: เป้าหมาย 15-25 assets

ใช้ 5 editorial categories ตาม milestone โดย map เข้า semantic media IDs เช่น:

- `MEDIA-DAM-LAKE-001..`: เขื่อนและทะเลสาบ
- `MEDIA-MOUNTAIN-NATURE-001..`: ขุนเขาและธรรมชาติ
- `MEDIA-COMMUNITY-LIFE-001..`: ชุมชนและวิถีชีวิต
- `MEDIA-FOOD-FRUIT-001..`: อาหารและผลไม้
- `MEDIA-ACTIVITY-TRADITION-001..`: กิจกรรมและงานประเพณี

เสนออย่างน้อย category ละ 3 assets; Hero/Place cover ต้องเป็น required, gallery detail เป็น optional ตามตาราง media ในส่วน 7 ทุก asset ต้องมี owner/source, permission, credit, capture context และ alt text TH/EN

## 6. Content Safety Rules

| Classification | Fields | Rule |
|---|---|---|
| ใช้ได้ทันที | project name `Takhun Trip`; generic navigation/system labels; neutral editorial copy ที่ไม่สร้าง factual claim | ใช้ได้หลังตรวจภาษา/แบรนด์โดยเจ้าของโครงการ |
| ใช้ได้เมื่อมีแหล่งยืนยัน | entity names TH/EN, category, district, descriptions of actual activities, producer/operator, related entity, status, image credit | บันทึก source URL/document/owner และวันที่ตรวจ |
| High-risk: ต้องยืนยันล่าสุด | price, opening time, event date/time, coordinates, Google Maps URL, phone, contact URL, register URL, fees, duration/distance, booking/access/safety/seasonal conditions | ห้ามคัดจาก mock; ต้องมีแหล่ง authoritative หรือ owner confirmation |
| ควรซ่อน | internal IDs that expose no user value, draft/deleted/hidden rows, admin metadata, reviewer private data, `approved_by`, raw sheet fields, missing/unverified contact/price/coordinates | ไม่ render เป็นค่าว่าง/`undefined`; omit CTA/section |
| ห้ามใช้ | `MOCK-*`, example.com/maps.example URLs, generated coordinates, date-relative events, demo reviews, `javascript:` media, fake phone/footer placeholders, unsupported health/superlative claims | Remove or block before public integration |

ข้อความมาตรฐานสำหรับ factual data ที่อาจเปลี่ยนแปลงหลังมีแหล่งยืนยันแล้ว:

> โปรดตรวจสอบข้อมูลก่อนเดินทางกับผู้ให้บริการหรือหน่วยงานเจ้าของพื้นที่

ข้อความนี้ไม่ใช่ใบอนุญาตให้เผยแพร่ข้อมูลที่รู้ว่าเป็น mock หรือยังไม่มีแหล่งยืนยัน; กรณีนั้นต้องซ่อน field หรือไม่เผยแพร่ record

## 7. Media Inventory

### 7.1 Current references and files

- Local raster/vector/video files under `public/`: **0 files**
- Places: one inline `data:image/svg+xml` DEMO illustration reused by 7 mock records; remaining records use generated CSS/text fallback
- Home/Routes/Products/Events/About: media URLs empty; UI uses inline SVG/CSS fallback
- Gallery external URLs:
  - Unsplash photo and thumbnail query URLs for MOCK-GAL-001
  - Unsplash thumbnail for MOCK-GAL-002
  - MDN `flower.mp4` demo video for MOCK-GAL-002
  - YouTube watch URL for MOCK-GAL-003
  - invalid `javascript:alert(1)` for MOCK-GAL-004 (blocked by renderer; security fixture)
- Map infrastructure: Leaflet JS/CSS from unpkg and OpenStreetMap tile URL; these are runtime dependencies, not content assets
- Missing: brand logo file, Home hero, all entity covers, place galleries, product/event images, gallery-owned originals and thumbnails

### 7.2 Recommended media register

| Semantic ID pattern | Source filename pattern | Recommended usage | Required? | Minimum metadata |
|---|---|---|---|---|
| BRAND-LOGO-PRIMARY | `brand-logo-primary.svg` | Navigation/About/Footer | Required | owner, version, light/dark rule, alt |
| HOME-HERO-001 | `home-hero-cheow-lan.webp` | Home hero/social preview candidate | Required | source/rights, focal point, alt TH/EN |
| PLACE-{ID}-COVER | `place-{id}-cover.webp` | list/detail/map/search cards | Required per published place | place ID, credit, rights, alt TH/EN |
| PLACE-{ID}-GALLERY-{NN} | `place-{id}-gallery-{nn}.webp` | detail gallery | Optional; 2-5 preferred | place ID, order, caption/alt, credit |
| ROUTE-{ID}-COVER | `route-{id}-cover.webp` | Home/routes/detail/planner | Required per published route | route ID, rights, alt TH/EN |
| PRODUCT-{ID}-COVER | `product-{id}-cover.webp` | Home/products/search/detail | Required per published product | product/producer, rights, alt TH/EN |
| EVENT-{ID}-COVER | `event-{id}-cover.webp` | Home/events/search/detail | Required per published event | event/organizer, date context, rights, alt TH/EN |
| MEDIA-{CATEGORY}-{NNN} | `gallery-{category}-{nnn}.webp` | Gallery/Home preview | Required for gallery set | category, related entity, credit, rights, caption/alt TH/EN |
| MEDIA-{CATEGORY}-{NNN}-THUMB | `gallery-{category}-{nnn}-thumb.webp` | Gallery grid/video poster | Required when original is large/video | parent media ID, crop/focal point, alt |

ก่อน integration ให้ตกลง storage strategy (local optimized assets หรือ approved HTTPS CDN/Drive delivery), size/aspect targets, cache policy และ fallback behavior โดยไม่ใช้ external demo URLs เป็น production media

## 8. Proposed File Scope for Milestone 2

ส่วนนี้เป็น proposal เท่านั้น **ไม่มีไฟล์ใดด้านล่างถูกแก้ใน milestone ปัจจุบัน** Exact scope อาจลดลงได้ถ้าเลือก API-only content integration

### Home/About

- `public/index.html` — replace footer placeholders and approved static editorial/contact structure
- `public/js/home.js` — remove mock collections from public mode; map approved home data
- `public/about.html` — approved bilingual project copy if static ownership remains
- `public/js/about.js` — remove mock settings from public mode and hide unverified fields

### Places

- `public/js/api.js` — add/align `getPlaces` and `getMapPlaces` clients with existing Apps Script actions
- `public/js/places.js` — replace local-only loader with approved data source
- `public/js/place-detail.js` — verified-field omission/disclaimer behavior
- `public/js/place-data.js` — remove runtime mock repository after integration (or retain test fixtures outside public bundle)
- `public/places.html`, `public/place-detail.html`, `public/map.html`, `public/js/map.js` — adjust demo notices and production states only as required

### Routes

- `public/js/routes.js` — remove mock routes and integrate approved routes/stops
- `public/routes.html`, `public/route-detail.html` — production notice/metadata changes if required

### Trip Planner

- `public/js/trip-planner.js` — remove mock templates, migrate stored mock IDs/version, use approved templates
- `public/trip-planner.html` — content/disclaimer adjustments if required

### Products

- `public/js/products.js` — remove mock products; enforce verified price/contact omission
- `public/products.html`, `public/product-detail.html` — production notice/field states if required

### Events

- `public/js/events.js` — remove date-relative mock events
- `public/events.html`, `public/event-detail.html` — production notice/verification wording if required

### Gallery/Search

- `public/js/gallery.js`, `public/gallery.html` — approved category mapping, media source and metadata
- `public/js/search.js`, `public/search.html` — connect configured source and verify entity/media projections

### i18n/system states

- `public/js/i18n.js` — replace demo wording, add approved disclaimers, audit TH/EN parity
- `public/js/app.js` — feature flags/footer shell only if scope is approved
- `public/404.html` — only if production routing/nav validation finds a gap
- `public/js/config.js` — only in deployment/config milestone with explicit authorization; do not hardcode secrets

### Backend/data dependency (only if API/Sheet contract changes are approved)

- `apps-script/PlaceService.gs`, `RouteService.gs`, `ProductService.gs`, `EventService.gs`, `GalleryService.gs`, `HomeService.gs`, `SearchService.gs`, `SettingsService.gs`, `Router.gs`
- Google Sheets tabs: `settings`, `categories`, `places`, `routes`, `route_places`, `trip_templates`, `products`, `events`, `gallery`, `reviews`

Prefer data-only Sheet updates when existing schema is sufficient; do not modify Apps Script merely to load content

### Tests

- Existing relevant suites: `scripts/test-home.*`, `test-places.*`, `test-place-detail.*`, `test-map.*`, `test-routes.*`, `test-trip-planner.*`, `test-products.*`, `test-events.*`, `test-gallery.*`, `test-search.*`, `test-reviews.*`, `test-favorites.*`, `test-about.*`, `test-i18n.js`, `test-api.js`, corresponding service tests, `test-public-shell.ps1`, `test-404.ps1`, `test.ps1`
- Add data-contract checks for no `MOCK-*`, no example/unsafe URL, no generated coordinate/date, no placeholder contact, required TH/EN/media/source fields, unique IDs and valid relations

## 9. Risks and Blockers

| Risk/blocker | Evidence | Impact | Mitigation/gate |
|---|---|---|---|
| API/data mismatch | `API_URL` empty; Places/Map bypass API; Search has no fallback | Demo differs from production behavior; Search fails | Configure staging API and contract-test every action before content sign-off |
| Missing production data visibility | Repo contains schema/services, not Sheet rows | Cannot claim any real item already exists in system | Export sanitized inventory or provide read-only Sheet/API snapshot |
| Mock leakage | All entity fallbacks are `MOCK-*`; footer placeholders | False public claims and reputational risk | Automated no-mock/no-placeholder build gate |
| Factual-field exposure | Services project price, phone, dates, maps, coordinates directly | Incorrect travel/commerce/event guidance | Per-field verification source and omit-unverified policy |
| Language fallback | Apps Script and client fall back EN→TH | Mixed-language English pages may look complete while EN missing | Completeness report per record; mark translation status explicitly |
| Media dependency | No local assets; external demo URLs and CDN/tile dependencies | Broken media, rights/privacy/performance issues | Approved media register, optimization and dependency decision |
| Referential mismatch | mock products/gallery use BTK IDs while places use MOCK IDs; route invalid stop fixture | Broken related links and planner/map flows | Foreign-key validation across all public entities |
| Dynamic event dates | mock dates calculated from current date | Demo can masquerade as live event | Delete date-relative content; require organizer source/update timestamp |
| LocalStorage carryover | favorites/trip plan store mock IDs | Users see partial errors after migration | Bump/version/migrate storage and discard invalid IDs safely |
| Footer/contact inconsistency | Footer hardcoded only on Home; About reads Settings | Conflicting public contact | Single verified contact source and deliberate global footer decision |
| Possible backend dependency | Spreadsheet ID/property and deployed Apps Script not observable here | Integration can block despite complete frontend content | Staging endpoint, sample sanitized rows and deployment owner |
| Test coverage gap | Tests validate behavior/demo safety, not factual truth or actual media existence | Passing tests can still ship unsafe content | Add content lint/relations/media/source manifest checks |

## 10. Recommended Implementation Order

1. Freeze content schema and define verification metadata (`source`, `verified_by`, `verified_at`, optional `expires/recheck_at`) outside public projection as appropriate
2. Obtain read-only staging Sheet/API snapshot and reconcile actual rows against this inventory
3. Approve canonical IDs and the 8-12 place set; verify names TH/EN, status and relations first
4. Verify high-risk Place fields and ingest required cover media; make Places/Detail/Map use one source
5. Build and verify 3-5 routes plus trip templates using only approved place IDs; migrate localStorage
6. Approve 6-10 products; hide all unverified price/contact values; add required images
7. Publish 1 verified event first, then at most 3; add expiry/past-event handling
8. Replace Gallery demo URLs with approved media register and editorial categories
9. Populate Home/About/Footer from verified data and remove all placeholders/mock notices intended only for development
10. Connect Search to staging API and validate complete/empty/error behavior across four entity types
11. Audit TH/EN parity, alt text, system states, relations and unsafe fields
12. Run full test suite plus no-mock/content/media lint and conduct mobile/desktop staging walkthrough

ลำดับนี้ทำให้ Places/IDs ซึ่งเป็น dependency ของ Map, Routes, Planner, Products, Events, Gallery, Reviews และ Search เสถียรก่อน ลดการแก้ซ้ำและลดโอกาสเผยแพร่ relation ที่เสีย

## 11. Acceptance Checklist

### Dataset and provenance

- [ ] มี read-only snapshot หรือ owner-confirmed list ของข้อมูล production ปัจจุบัน
- [ ] ทุก public record มี canonical unique ID, status และ owner/source
- [ ] ไม่มี `MOCK-*`, demo/test fixture, example URL, generated coordinate หรือ date-relative event ใน public response/bundle
- [ ] ทุก relation อ้างถึง published canonical entity ที่มีอยู่จริง
- [ ] Draft/hidden/deleted/internal fields ไม่รั่วสู่ public UI

### Content and safety

- [ ] Places อยู่ในช่วง 8-12, Routes 3-5, Products 6-10, Events 1-3 ตามชุดที่อนุมัติ
- [ ] ชื่อและคำอธิบาย TH/EN ผ่าน owner/editor review หรือมีสถานะ missing ที่ชัดเจนก่อนเผยแพร่
- [ ] ราคา เวลาเปิด พิกัด เบอร์โทร วัน/เวลากิจกรรม fee/register/booking/condition มีแหล่งยืนยันล่าสุด
- [ ] field ที่ยังไม่ยืนยันถูกซ่อน ไม่แสดง placeholder หรือข้อความที่ตีความเป็นข้อเท็จจริง
- [ ] ไม่มี health claim, superlative หรือ safety/access claim ที่ไม่มีหลักฐาน
- [ ] disclaimer “โปรดตรวจสอบข้อมูลก่อนเดินทาง” ใช้กับข้อมูลที่เปลี่ยนแปลงได้ ไม่ใช้กลบข้อมูล mock

### Media

- [ ] ทุก published Place/Route/Product/Event มี required cover ที่มีสิทธิ์ใช้
- [ ] Gallery ใช้ approved assets เท่านั้น ไม่มี Unsplash/MDN/YouTube demo หรือ `javascript:` URL จาก mock set
- [ ] ทุก asset มี semantic media ID, source filename/URL, owner/credit, permission และ related entity
- [ ] ทุกภาพมี alt TH/EN ที่สื่อความหมาย; video มี title/poster/caption ตามเหมาะสม
- [ ] ไม่มี reference ไปยัง local file ที่ไม่มีจริง และมี fallback ที่ไม่ทำให้ข้อมูลผิด

### UX, i18n and integration

- [ ] Home, Places, Detail, Map, Routes, Planner, Products, Events, Gallery, Search, Reviews, About และ 404 ผ่าน ready/loading/empty/error/not-found ที่เกี่ยวข้อง
- [ ] Navigation/Footer/Language switch ใช้ contact/label ชุดเดียวและไม่มี raw i18n key
- [ ] English mode ไม่มี demo English, mixed-language โดยไม่ตั้งใจ หรือ silent missing fields
- [ ] Places/Map/Search และ entity details ใช้ staging source/contract ที่ตกลงกัน
- [ ] Search ไม่เข้า request-error จาก config ว่างใน demo environment
- [ ] localStorage เก่าที่มี mock IDs ถูก migrate/recover อย่างปลอดภัย

### Validation before Milestone 2 completion

- [ ] Full `scripts/test.ps1` ผ่าน
- [ ] JavaScript/service tests ที่เกี่ยวข้องผ่านทั้งหมด
- [ ] `git diff --check` ผ่าน
- [ ] Content lint ยืนยัน no mock/demo/placeholder/unsafe URL/public secret
- [ ] Foreign-key and unique-ID checks ผ่าน
- [ ] Media existence/HTTP/rights manifest checks ผ่าน
- [ ] เจ้าของโครงการอนุมัติ inventory, recommended set, factual sources และ exact implementation scope ก่อนแก้ runtime
