# Takhun Trip Media Requirements

Use only photographs taken by the project owner. Never download or copy images
from the internet. Originals stay under `media-source/`, are ignored by Git, and
are never deployed. The website uses generated WebP files only.

## Processing profiles

| Profile | Ratio | Recommended source | Minimum source | Generated sizes | Fallback |
|---|---:|---:|---:|---|---|
| Hero | 16:9 | 2400×1350 | 1920×1080 | 640×360, 960×540, 1440×810, 1920×1080 | `hero.svg` |
| Cover | 3:2 | 2000×1333 | 1600×1067 | 480×320, 800×533, 1200×800, 1600×1067 | `cover.svg` |
| Card | 16:9 | 1600×900 | 1200×675 | 480×270, 800×450, 1200×675 | `cover.svg` |
| Product | 1:1 | 1600×1600 | 1200×1200 | 400×400, 800×800, 1200×1200 | `product.svg` |
| Gallery | 3:2 | 2400×1600 | 1800×1200 | 640×427, 1200×800, 1800×1200 | `gallery.svg` |

All outputs use WebP quality 82, alpha quality 100, smart chroma subsampling,
effort 4, `fit: cover`, and the declared focal position. EXIF, GPS, IPTC, XMP,
and other metadata must not be copied to outputs.

## Required photographs

Every row below has `required=true`. Alt text must be corrected if the selected
photograph does not depict the described subject precisely.

| media_id | Source file / folder | Entity | Usage pages | Profile | Alt TH | Alt EN |
|---|---|---|---|---|---|---|
| `event-heart-of-hills-2026-cover` | `events/event-heart-of-hills-2026-cover.jpg` | event `EVENT-HEART-OF-HILLS-2026` | Home, Events, Event Detail, Search | Cover | ภาพกิจกรรม Heart of the Hills ที่เจ้าของโครงการยืนยัน | Project-owner photograph of the Heart of the Hills event |
| `gallery-dam-lake-001` | `gallery/gallery-dam-lake-001.jpg` | gallery `GALLERY-DAM-LAKE-001` | Gallery | Gallery | ทิวทัศน์เขื่อนหรือทะเลสาบจากภาพที่เจ้าของโครงการถ่าย | Dam or lake landscape photographed by the project owner |
| `home-hero-heart-mountain` | `home/home-hero-heart-mountain.jpg` | home `HOME` | Home alternate hero | Hero | ภูเขารูปหัวใจและภูมิทัศน์บ้านเขาเทพพิทักษ์ | Heart-shaped mountain and the Khao Thep Phithak landscape |
| `home-hero-ratchaprapha` | `home/home-hero-ratchaprapha.jpg` | home `HOME` | Home hero | Hero | ทิวทัศน์เขื่อนรัชชประภา ทะเลสาบ และแนวภูเขา | Ratchaprapha Dam lake and mountain landscape |
| `place-btk-001-cover` | `places/place-btk-001-cover.jpg` | place `BTK-001` | Home, Places, Detail, Map, Search, Favorites | Cover | วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา | Ratchaprapha Dam Community Tourism Enterprise |
| `place-btk-002-cover` | `places/place-btk-002-cover.jpg` | place `BTK-002` | Home, Places, Detail, Map, Search, Favorites | Cover | วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน | Ban Chiao Lan Community Tourism Enterprise |
| `place-btk-003-cover` | `places/place-btk-003-cover.jpg` | place `BTK-003` | Home, Places, Detail, Map, Search, Favorites | Cover | วิสาหกิจชุมชนพรุไทย ฮันนี่บี | Phru Thai Honey Bee Community Enterprise |
| `place-btk-004-cover` | `places/place-btk-004-cover.jpg` | place `BTK-004` | Home, Places, Detail, Map, Search, Favorites | Cover | สะพานแขวนและภูเขารูปหัวใจที่บ้านเขาเทพพิทักษ์ | Suspension bridge and heart-shaped mountain at Khao Thep Phithak |
| `place-btk-005-cover` | `places/place-btk-005-cover.jpg` | place `BTK-005` | Places, Detail, Map, Search, Favorites | Cover | วัดเขาพัง อำเภอบ้านตาขุน | Wat Khao Phang in Ban Ta Khun |
| `place-krn-002-cover` | `places/place-krn-002-cover.jpg` | place `KRN-002` | Places, Detail, Map, Search, Favorites | Cover | ป่าต้นน้ำบ้านน้ำราด อำเภอคีรีรัฐนิคม | Ban Nam Rat Headwaters Forest in Khiri Rat Nikhom |
| `place-pnm-001-cover` | `places/place-pnm-001-cover.jpg` | place `PNM-001` | Places, Detail, Map, Search, Favorites | Cover | ธรรมชาติในอุทยานแห่งชาติคลองพนม | Nature in Khlong Phanom National Park |
| `product-btk-durian-cover` | `products/product-btk-durian-cover.jpg` | product `PROD-BTK-DURIAN` | Home, Products, Product Detail, Search | Product | ทุเรียนคลองแสงจากภาพที่เจ้าของโครงการถ่าย | Khlong Saeng durian photographed by the project owner |
| `product-btk-honey-cover` | `products/product-btk-honey-cover.jpg` | product `PROD-BTK-HONEY` | Home, Products, Product Detail, Search | Product | ผลิตภัณฑ์น้ำผึ้งชุมชนจากพรุไทย ฮันนี่บี | Community honey products from Phru Thai Honey Bee |
| `product-btk-textile-cover` | `products/product-btk-textile-cover.jpg` | product `PROD-BTK-TEXTILE` | Home, Products, Product Detail, Search | Product | ผ้าทอมือบ้านเชี่ยวหลาน | Ban Chiao Lan handwoven textiles |
| `route-btk-core-cover` | `routes/route-btk-core-cover.jpg` | route `ROUTE-BTK-CORE` | Home, Routes, Route Detail, Planner, Search | Card | ภาพแทนเส้นทางสี่ชุมชนหลักบ้านตาขุน | Representative view of the four Ban Ta Khun community route |
| `route-btk-heart-cover` | `routes/route-btk-heart-cover.jpg` | route `ROUTE-BTK-HEART` | Home, Routes, Route Detail, Planner, Search | Card | ภูเขารูปหัวใจในเส้นทางบ้านเขาเทพพิทักษ์ | Heart-shaped mountain on the Khao Thep Phithak route |
| `route-krn-nature-cover` | `routes/route-krn-nature-cover.jpg` | route `ROUTE-KRN-NATURE` | Home, Routes, Route Detail, Planner, Search | Card | ธรรมชาติในเส้นทางคีรีรัฐนิคม | Nature along the Khiri Rat Nikhom route |
| `shared-about-project` | `shared/shared-about-project.jpg` | shared `ABOUT` | About | Hero | ภูมิทัศน์เขื่อนและภูเขาที่ใช้ประกอบเรื่องราวโครงการ Takhun Trip | Dam and mountain landscape illustrating the Takhun Trip project |

## User checklist

- [ ] The photograph was taken by the project owner.
- [ ] The subject matches the media ID, entity, and bilingual alt text.
- [ ] The file uses the exact lowercase filename and approved extension.
- [ ] The source meets the recommended dimensions, or at least the minimum.
- [ ] Faces, vehicle plates, documents, and private information are approved.
- [ ] Run `npm.cmd run media:check` and resolve every error.
- [ ] Run `npm.cmd run media:build`; never manufacture a replacement for a missing required photo.
- [ ] Inspect generated WebP files and the public manifest.
- [ ] Check Thai/English alt text and crop at mobile, tablet, and desktop widths.
- [ ] Confirm `git status` never lists an original under `media-source/`.
