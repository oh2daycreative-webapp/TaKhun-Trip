"use strict";

(function createMockPlaceRepository(global) {
  const DEMO_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 520'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%2300796B'/%3E%3Cstop offset='1' stop-color='%2318B7B5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='520' fill='url(%23g)'/%3E%3Cpath d='M0 420 180 210l120 125 130-190 160 205 95-105 115 175' fill='%23064E3B' opacity='.72'/%3E%3Ccircle cx='650' cy='115' r='58' fill='%23FDBA2D'/%3E%3Ctext x='40' y='480' fill='white' font-size='36' font-family='sans-serif'%3EDEMO%3C/text%3E%3C/svg%3E";

  function list(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    return String(value || "").split(/[|,]/).map((item) => item.trim()).filter(Boolean);
  }

  function finiteCoordinate(value) {
    if (value === null || value === "" || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validUrl(value) {
    const url = String(value || "").trim();
    return /^https:\/\//i.test(url) ? url : "";
  }

  function validMockMediaUrl(value) {
    const url = String(value || "").trim();
    return validUrl(url) || (/^data:image\/svg\+xml,/i.test(url) ? url : "");
  }

  function normalizeReview(review) {
    const rating = Number(review?.rating);
    return {
      review_id: String(review?.review_id || "").trim(),
      reviewer_name: String(review?.reviewer_name || "").trim(),
      is_anonymous: Boolean(review?.is_anonymous),
      rating: Number.isFinite(rating) ? rating : null,
      comment_th: String(review?.comment_th || "").trim(),
      comment_en: String(review?.comment_en || "").trim(),
      admin_reply_th: String(review?.admin_reply_th || "").trim(),
      admin_reply_en: String(review?.admin_reply_en || "").trim(),
      created_at: String(review?.created_at || "").trim(),
      status: String(review?.status || "").trim(),
      is_demo: true
    };
  }

  function normalizePlace(place) {
    const reviews = Array.isArray(place?.reviews) ? place.reviews.map(normalizeReview) : [];
    const approved = reviews.filter((review) => review.status === "approved" && review.rating >= 1 && review.rating <= 5);
    const average = approved.length ? approved.reduce((sum, review) => sum + review.rating, 0) / approved.length : null;
    return {
      ...place,
      phone: String(place?.phone || "").trim(),
      google_maps_url: validUrl(place?.google_maps_url),
      latitude: finiteCoordinate(place?.latitude),
      longitude: finiteCoordinate(place?.longitude),
      activities_th: list(place?.activities_th),
      activities_en: list(place?.activities_en),
      gallery_image_urls: list(place?.gallery_image_urls).map(validMockMediaUrl).filter(Boolean),
      nearby_place_ids: [...new Set(list(place?.nearby_place_ids))],
      reviews,
      review_summary: { average_rating: average, review_count: approved.length },
      is_demo: true
    };
  }

  function demo(id, nameTh, nameEn, district, category, routeGroup, image, coordinates, navigation, nearby = []) {
    const number = Number(id);
    return normalizePlace({
      place_id: `MOCK-PLACE-${id}`,
      name_th: nameTh,
      name_en: nameEn,
      district,
      province: "สุราษฎร์ธานี",
      route_group: routeGroup,
      category,
      short_description_th: "ข้อความสาธิตสำหรับทดสอบหน้ารายการ ไม่ใช่รายละเอียดสถานที่ที่ได้รับการยืนยัน",
      short_description_en: "Demo copy for testing the list page; this is not verified place information.",
      description_th: "รายละเอียดตัวอย่างสำหรับทดสอบโครงสร้างหน้าเท่านั้น ข้อมูลนี้ยังไม่ได้รับการตรวจสอบหรือยืนยัน",
      description_en: "Sample detail copy used only to test the page structure. This information has not been verified.",
      highlight_th: "จุดเด่นตัวอย่างที่ยังไม่ได้ยืนยัน",
      highlight_en: "An unverified sample highlight",
      activities_th: ["กิจกรรมตัวอย่างที่ยังไม่ได้ยืนยัน"],
      activities_en: ["Unverified sample activity"],
      open_time_th: "",
      open_time_en: "",
      fee_th: "",
      fee_en: "",
      recommended_duration: "",
      best_time_th: "",
      best_time_en: "",
      cover_image_url: image ? DEMO_IMAGE : "",
      gallery_image_urls: image ? [DEMO_IMAGE] : [],
      phone: "",
      google_maps_url: navigation ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nameEn)}` : "",
      latitude: coordinates ? 8.9 + number / 1000 : null,
      longitude: coordinates ? 98.9 + number / 1000 : null,
      coordinate_status: coordinates ? "approximate" : "no_coordinate",
      nearby_place_ids: nearby,
      reviews: id === "001" ? [{ review_id: "MOCK-REVIEW-001", reviewer_name: "ผู้รีวิวตัวอย่าง", is_anonymous: false, rating: 5, comment_th: "ความคิดเห็นตัวอย่างสำหรับทดสอบหน้าจอเท่านั้น", comment_en: "Sample review copy for interface testing only.", created_at: "", status: "approved" }] : [],
      is_featured: false,
      is_main_route_point: false,
      sort_order: number,
      status: "published"
    });
  }

  const SOURCE = Object.freeze([
    demo("001", "จุดชมธรรมชาติตัวอย่าง 1", "Sample Nature Stop 1", "ban_ta_khun", "nature", "main_point_1", true, true, true, ["MOCK-PLACE-002", "MOCK-PLACE-003"]),
    demo("002", "ชุมชนท่องเที่ยวตัวอย่าง 2", "Sample Community Stop 2", "ban_ta_khun", "community_tourism", "main_point_1", true, false, true, ["MOCK-PLACE-001"]),
    demo("003", "จุดชมวิวตัวอย่าง 3", "Sample Viewpoint 3", "ban_ta_khun", "viewpoint", "main_point_2", false, true, false),
    demo("004", "คาเฟ่ตัวอย่าง 4", "Sample Café 4", "ban_ta_khun", "food_cafe", "main_point_2", true, false, false),
    demo("005", "กิจกรรมกลางแจ้งตัวอย่าง 5", "Sample Outdoor Activity 5", "khiri_rat_nikhom", "activity", "", false, true, true),
    demo("006", "พื้นที่ธรรมชาติตัวอย่าง 6", "Sample Nature Area 6", "khiri_rat_nikhom", "nature", "", true, false, false),
    demo("007", "ชุมชนตัวอย่าง 7", "Sample Community 7", "khiri_rat_nikhom", "community_tourism", "", false, false, true),
    demo("008", "จุดชมวิวตัวอย่าง 8", "Sample Viewpoint 8", "phanom", "viewpoint", "nearby_phanom", true, true, false),
    demo("009", "กิจกรรมตัวอย่าง 9", "Sample Activity 9", "phanom", "activity", "nearby_phanom", false, false, false),
    demo("010", "คาเฟ่ตัวอย่าง 10", "Sample Café 10", "phanom", "food_cafe", "nearby_phanom", true, false, true),
    demo("011", "เส้นทางธรรมชาติตัวอย่าง 11", "Sample Nature Trail 11", "ban_ta_khun", "nature", "main_point_1", false, true, false),
    demo("012", "กิจกรรมชุมชนตัวอย่าง 12", "Sample Community Activity 12", "ban_ta_khun", "community_tourism", "main_point_2", true, false, false),
    demo("013", "จุดพักตัวอย่าง 13", "Sample Rest Stop 13", "ban_ta_khun", "viewpoint", "main_point_1", false, false, false),
    { ...demo("014", "ข้อมูลร่างตัวอย่าง", "Sample Draft", "ban_ta_khun", "nature", "main_point_1", false, false, false), status: "draft" }
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function listPlaces() {
    return clone(SOURCE);
  }

  function getPlaceById(id) {
    const placeId = String(id || "").trim();
    const found = SOURCE.find((place) => place.place_id === placeId);
    return found ? clone(found) : null;
  }

  function getNearbyPlaces(ids, currentId = "") {
    const wanted = [...new Set(list(ids))];
    return wanted.map(getPlaceById).filter((place) => place && place.status === "published" && place.place_id !== currentId);
  }

  global.TakhunPlaceData = Object.freeze({ listPlaces, getPlaceById, getNearbyPlaces });
})(window);
