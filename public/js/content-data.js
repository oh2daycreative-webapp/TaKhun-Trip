"use strict";

(function createCanonicalContentRepository(global) {
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function localized(item, field, lang = "th") {
    const language = lang === "en" ? "en" : "th";
    return String(item?.[`${field}_${language}`] || item?.[`${field}_th`] || item?.[field] || "").trim();
  }

  const PLACES = Object.freeze([
    {
      place_id: "BTK-001", name_th: "วิสาหกิจชุมชนท่องเที่ยวเขื่อนรัชชประภา", name_en: "Ratchaprapha Dam Community Tourism Enterprise",
      district: "ban_ta_khun", province: "สุราษฎร์ธานี", route_group: "main_point_1", category: "community_tourism",
      short_description_th: "จุดเริ่มต้นเที่ยวบ้านตาขุน เชื่อมเรื่องราวของเขื่อนรัชชประภา ทะเลสาบ และบริการเดินทางในพื้นที่",
      short_description_en: "A starting point for exploring Ban Ta Khun, Ratchaprapha Dam, the lake, and local transport services.",
      description_th: "เริ่มต้นทำความรู้จักบ้านตาขุนผ่านชุมชนท่องเที่ยวเขื่อนรัชชประภา ซึ่งเชื่อมโยงการเดินทางสู่เขื่อน ทะเลสาบเชี่ยวหลาน และจุดหมายโดยรอบ ข้อมูลในโครงการระบุบริการรถเช่า จักรยาน จักรยานไฟฟ้า รถสามล้อไฟฟ้า และรถกอล์ฟ โปรดติดต่อชุมชนเพื่อตรวจสอบความพร้อมก่อนเดินทาง",
      description_en: "Begin your Ban Ta Khun journey with the Ratchaprapha Dam community. Project information connects this place with the dam, Cheow Lan Lake, and local transport services. Please contact the community to confirm availability before traveling.",
      highlight_th: "จุดเชื่อมต่อเรื่องราวเขื่อน ทะเลสาบ และการเดินทางในบ้านตาขุน", highlight_en: "A community gateway to the dam, lake, and Ban Ta Khun travel experiences",
      activities_th: ["สอบถามบริการเดินทางในพื้นที่", "วางแผนเที่ยวเขื่อนรัชชประภาและทะเลสาบเชี่ยวหลาน"], activities_en: ["Ask about local transport services", "Plan a visit to Ratchaprapha Dam and Cheow Lan Lake"],
      phone: "083 789 4493", google_maps_url: "https://maps.app.goo.gl/w3bUxMLBWFF1THb78", nearby_place_ids: ["BTK-002", "BTK-003"], is_featured: true, is_main_route_point: true, sort_order: 1
    },
    {
      place_id: "BTK-002", name_th: "วิสาหกิจชุมชนท่องเที่ยวบ้านเชี่ยวหลาน", name_en: "Ban Chiao Lan Community Tourism Enterprise",
      district: "ban_ta_khun", province: "สุราษฎร์ธานี", route_group: "main_point_2", category: "community_tourism",
      short_description_th: "เรียนรู้ผ้าทอมือ เลือกชมของดีชุมชน และทำความรู้จักวิถีบ้านเชี่ยวหลาน",
      short_description_en: "Discover handwoven textiles, local products, and the community life of Ban Chiao Lan.",
      description_th: "บ้านเชี่ยวหลานชวนเรียนรู้งานฝีมือและเรื่องราวชุมชน ข้อมูลในโครงการระบุการสาธิตทอผ้า ผลิตภัณฑ์ชุมชน สมุนไพร และผลไม้ตามฤดูกาล โปรดตรวจสอบกิจกรรมและความพร้อมกับชุมชนก่อนเดินทาง",
      description_en: "Ban Chiao Lan shares local craft and community stories. Project information highlights weaving demonstrations, community products, herbs, and seasonal fruit. Please confirm activities and availability before visiting.",
      highlight_th: "งานทอมือและของดีจากชุมชน", highlight_en: "Handwoven craft and community products",
      activities_th: ["ชมสาธิตการทอผ้า", "เลือกชมผลิตภัณฑ์ชุมชน"], activities_en: ["Watch a weaving demonstration", "Browse community products"],
      phone: "087 270 0774", google_maps_url: "https://maps.app.goo.gl/S5tcKDkpDUZQMZfw5", nearby_place_ids: ["BTK-001", "BTK-003"], is_featured: true, is_main_route_point: true, sort_order: 2
    },
    {
      place_id: "BTK-003", name_th: "วิสาหกิจชุมชนพรุไทย ฮันนี่บี", name_en: "Phru Thai Honey Bee Community Enterprise",
      district: "ban_ta_khun", province: "สุราษฎร์ธานี", route_group: "main_point_3", category: "community_tourism",
      short_description_th: "เรียนรู้เรื่องผึ้ง น้ำผึ้ง และผลิตภัณฑ์ชุมชนจากพรุไทย ฮันนี่บี",
      short_description_en: "Learn about bees, honey, and community products at Phru Thai Honey Bee.",
      description_th: "พรุไทย ฮันนี่บีเป็นจุดเรียนรู้เรื่องผึ้งและผลิตภัณฑ์จากน้ำผึ้ง ข้อมูลในโครงการระบุกิจกรรมชิมน้ำผึ้งสดจากรวง ชมการเลี้ยงผึ้ง และเรียนรู้การเก็บรวงผึ้ง โปรดตรวจสอบรอบกิจกรรมก่อนเดินทาง",
      description_en: "Phru Thai Honey Bee is a community learning stop focused on bees and honey products. Project information mentions honey tasting and beekeeping activities. Please confirm activity availability before visiting.",
      highlight_th: "เรื่องราวการเลี้ยงผึ้งและผลิตภัณฑ์น้ำผึ้ง", highlight_en: "Beekeeping stories and honey products",
      activities_th: ["เรียนรู้การเลี้ยงผึ้ง", "ชิมน้ำผึ้งสดจากรวงเมื่อกิจกรรมพร้อม"], activities_en: ["Learn about beekeeping", "Taste fresh honey when the activity is available"],
      phone: "081 396 8145", google_maps_url: "https://maps.app.goo.gl/s8xAKHfxqCozuhEX7", nearby_place_ids: ["BTK-001", "BTK-002"], is_featured: true, is_main_route_point: true, sort_order: 3
    },
    {
      place_id: "BTK-004", name_th: "วิสาหกิจชุมชนท่องเที่ยวเชิงอนุรักษ์บ้านเขาเทพพิทักษ์", name_en: "Khao Thep Phithak Community Tourism Enterprise",
      district: "ban_ta_khun", province: "สุราษฎร์ธานี", route_group: "main_point_4", category: "community_tourism",
      short_description_th: "จุดถ่ายภาพสะพานแขวน ภูเขารูปหัวใจ และเรื่องราวชุมชนเขาเทพพิทักษ์",
      short_description_en: "A community stop known for its suspension bridge, heart-shaped mountain, and local stories.",
      description_th: "บ้านเขาเทพพิทักษ์เชื่อมโยงภาพจำของสะพานแขวนและภูเขารูปหัวใจกับวิถีชุมชน ข้อมูลในโครงการยังระบุการสาธิตทำข้าวหลามปลายอกและสวนผลไม้ชุมชน โปรดตรวจสอบกิจกรรมก่อนเดินทาง",
      description_en: "Khao Thep Phithak connects the suspension bridge and heart-shaped mountain with local community life. Project information also mentions Khao Lam Plai Ok demonstrations and community orchards. Please confirm activities before visiting.",
      highlight_th: "สะพานแขวนและภูเขารูปหัวใจ", highlight_en: "The suspension bridge and heart-shaped mountain",
      activities_th: ["ชมสะพานแขวนและภูเขารูปหัวใจ", "เรียนรู้กิจกรรมชุมชนเมื่อเปิดให้เข้าร่วม"], activities_en: ["See the suspension bridge and heart-shaped mountain", "Join community activities when available"],
      phone: "084 843 7924", google_maps_url: "https://maps.app.goo.gl/ofZvwrSAPckbfYZn6", nearby_place_ids: ["BTK-005"], is_featured: true, is_main_route_point: true, sort_order: 4
    },
    {
      place_id: "BTK-005", name_th: "วัดเขาพัง", name_en: "Wat Khao Phang", district: "ban_ta_khun", province: "สุราษฎร์ธานี", route_group: "main_point_4", category: "temple_culture",
      short_description_th: "จุดหมายด้านวัฒนธรรมใกล้ชุมชนบ้านเขาเทพพิทักษ์", short_description_en: "A cultural destination near the Khao Thep Phithak community.",
      description_th: "วัดเขาพังเป็นหนึ่งในจุดหมายที่ระบุไว้ใกล้ชุมชนบ้านเขาเทพพิทักษ์ เหมาะสำหรับแวะทำความรู้จักพื้นที่ด้วยความเคารพ โปรดตรวจสอบเวลาและข้อปฏิบัติก่อนเดินทาง",
      description_en: "Wat Khao Phang is listed as a destination near the Khao Thep Phithak community. Visit respectfully and check current access information before traveling.",
      highlight_th: "จุดหมายเชิงวัฒนธรรมในบ้านตาขุน", highlight_en: "A cultural stop in Ban Ta Khun", activities_th: [], activities_en: [],
      phone: "", google_maps_url: "https://maps.app.goo.gl/zFBfChoV7jpuUH8m6", nearby_place_ids: ["BTK-004"], is_featured: false, is_main_route_point: false, sort_order: 5
    },
    {
      place_id: "KRN-001", name_th: "หินพัด / หินนิลเปา", name_en: "Hin Phat / Hin Nin Pao", district: "khiri_rat_nikhom", province: "สุราษฎร์ธานี", route_group: "nearby_khiri_rat_nikhom", category: "viewpoint",
      short_description_th: "จุดหมายธรรมชาติในอำเภอคีรีรัฐนิคมสำหรับเชื่อมทริปจากบ้านตาขุน", short_description_en: "A natural destination in Khiri Rat Nikhom that can extend a Ban Ta Khun trip.",
      description_th: "หินพัด หรือหินนิลเปา เป็นจุดหมายที่โครงการระบุไว้ในอำเภอคีรีรัฐนิคม โปรดตรวจสอบเส้นทางและสภาพพื้นที่ก่อนเดินทาง",
      description_en: "Hin Phat, also listed as Hin Nin Pao, is a project-listed destination in Khiri Rat Nikhom. Check current access and site conditions before traveling.",
      highlight_th: "จุดหมายธรรมชาติในคีรีรัฐนิคม", highlight_en: "A natural stop in Khiri Rat Nikhom", activities_th: [], activities_en: [], phone: "", google_maps_url: "https://maps.app.goo.gl/tNE5WbKPDovt7BxQ7", nearby_place_ids: ["KRN-002", "KRN-003"], is_featured: false, is_main_route_point: false, sort_order: 6
    },
    {
      place_id: "KRN-002", name_th: "ป่าต้นน้ำบ้านน้ำราด", name_en: "Ban Nam Rat Headwaters Forest", district: "khiri_rat_nikhom", province: "สุราษฎร์ธานี", route_group: "nearby_khiri_rat_nikhom", category: "nature",
      short_description_th: "จุดหมายธรรมชาติในคีรีรัฐนิคมที่เชื่อมต่อการสำรวจพื้นที่ใกล้บ้านตาขุน", short_description_en: "A nature destination in Khiri Rat Nikhom for extending a Ban Ta Khun journey.",
      description_th: "ป่าต้นน้ำบ้านน้ำราดเป็นจุดหมายธรรมชาติที่ระบุไว้ในโครงการ โปรดตรวจสอบเวลา ค่าใช้จ่าย และข้อกำหนดของพื้นที่ก่อนเดินทาง",
      description_en: "Ban Nam Rat Headwaters Forest is a nature destination listed in the project. Check current hours, fees, and site rules before traveling.",
      highlight_th: "พื้นที่ธรรมชาติในคีรีรัฐนิคม", highlight_en: "Nature in Khiri Rat Nikhom", activities_th: [], activities_en: [], phone: "065 698 5176", google_maps_url: "https://maps.app.goo.gl/aw49GXxSTHVGoW9H9", nearby_place_ids: ["KRN-001", "KRN-003"], is_featured: false, is_main_route_point: false, sort_order: 7
    },
    {
      place_id: "KRN-003", name_th: "OASIS Forest Garden", name_en: "OASIS Forest Garden", district: "khiri_rat_nikhom", province: "สุราษฎร์ธานี", route_group: "nearby_khiri_rat_nikhom", category: "nature",
      short_description_th: "พื้นที่สีเขียวในคีรีรัฐนิคมสำหรับแวะเที่ยวต่อจากบ้านตาขุน", short_description_en: "A green destination in Khiri Rat Nikhom for extending a Ban Ta Khun trip.",
      description_th: "OASIS Forest Garden เป็นจุดหมายในอำเภอคีรีรัฐนิคมที่ระบุไว้ในโครงการ โปรดติดต่อสถานที่เพื่อตรวจสอบข้อมูลก่อนเดินทาง",
      description_en: "OASIS Forest Garden is a project-listed destination in Khiri Rat Nikhom. Contact the venue to confirm current visitor information before traveling.",
      highlight_th: "พื้นที่สีเขียวในคีรีรัฐนิคม", highlight_en: "A green stop in Khiri Rat Nikhom", activities_th: [], activities_en: [], phone: "093 590 8684", google_maps_url: "https://maps.app.goo.gl/egbwZN4BkMqX7QNPA", nearby_place_ids: ["KRN-001", "KRN-002"], is_featured: false, is_main_route_point: false, sort_order: 8
    },
    {
      place_id: "PNM-001", name_th: "อุทยานแห่งชาติคลองพนม", name_en: "Khlong Phanom National Park", district: "phanom", province: "สุราษฎร์ธานี", route_group: "nearby_phanom", category: "nature",
      short_description_th: "จุดหมายธรรมชาติในอำเภอพนมสำหรับเชื่อมทริปจากบ้านตาขุน", short_description_en: "A nature destination in Phanom that can extend a Ban Ta Khun trip.",
      description_th: "อุทยานแห่งชาติคลองพนมเป็นจุดหมายธรรมชาติในอำเภอพนม โปรดตรวจสอบประกาศ เวลา ค่าใช้จ่าย และกฎของอุทยานก่อนเดินทาง",
      description_en: "Khlong Phanom National Park is a nature destination in Phanom. Check current notices, hours, fees, and park rules before traveling.",
      highlight_th: "ธรรมชาติในอำเภอพนม", highlight_en: "Nature in Phanom", activities_th: [], activities_en: [], phone: "077 270 905", google_maps_url: "https://maps.app.goo.gl/wBby5ZCeJ5gFdT738", nearby_place_ids: ["PNM-002"], is_featured: false, is_main_route_point: false, sort_order: 9
    },
    {
      place_id: "PNM-002", name_th: "อุทยานธรรมเขานาในหลวง", name_en: "Khao Na Nai Luang Dharma Park", district: "phanom", province: "สุราษฎร์ธานี", route_group: "nearby_phanom", category: "temple_culture",
      short_description_th: "จุดหมายธรรมชาติและวัฒนธรรมในอำเภอพนม", short_description_en: "A nature and cultural destination in Phanom.",
      description_th: "อุทยานธรรมเขานาในหลวงเป็นจุดหมายในอำเภอพนมที่ระบุไว้ในโครงการ โปรดตรวจสอบเวลา เส้นทาง และข้อปฏิบัติก่อนเดินทาง",
      description_en: "Khao Na Nai Luang Dharma Park is a project-listed destination in Phanom. Check current access, hours, and visitor guidance before traveling.",
      highlight_th: "ธรรมชาติและวัฒนธรรมในพนม", highlight_en: "Nature and culture in Phanom", activities_th: [], activities_en: [], phone: "", google_maps_url: "https://maps.app.goo.gl/2s62n8TjaaD9LZpY9", nearby_place_ids: ["PNM-001"], is_featured: false, is_main_route_point: false, sort_order: 10
    }
  ].map((place) => Object.freeze({
    ...place, open_time_th: "", open_time_en: "", fee_th: "", fee_en: "", recommended_duration: "", best_time_th: "", best_time_en: "",
    cover_image_url: "", gallery_image_urls: Object.freeze([]), latitude: null, longitude: null, coordinate_status: place.google_maps_url ? "pending_verify" : "no_coordinate",
    reviews: Object.freeze([]), review_summary: Object.freeze({ average_rating: null, review_count: 0 }), status: "published"
  })));

  function stop(placeId, order) {
    const place = PLACES.find((item) => item.place_id === placeId);
    return Object.freeze({ place_id: placeId, stop_order: order, name_th: place.name_th, name_en: place.name_en, short_description_th: place.short_description_th, short_description_en: place.short_description_en, cover_image_url: "", phone: place.phone, google_maps_url: place.google_maps_url });
  }

  const ROUTES = Object.freeze([
    { route_id: "ROUTE-BTK-CORE", name_th: "4 จุดหลักบ้านตาขุน", name_en: "Four Community Highlights of Ban Ta Khun", short_description_th: "ทำความรู้จักสี่ชุมชนหลักที่เชื่อมเรื่องราวเขื่อน งานฝีมือ น้ำผึ้ง และภูเขารูปหัวใจ", short_description_en: "Meet four core communities connecting the dam, local craft, honey, and the heart-shaped mountain.", description_th: "เส้นทางนำเสนอสี่จุดหลักตามลำดับในแผนงาน Takhun Trip โปรดตรวจสอบเวลาเปิด กิจกรรม และการเดินทางกับแต่ละชุมชนก่อนออกเดินทาง", description_en: "This route presents the four core points in the Takhun Trip project order. Confirm opening information, activities, and travel arrangements with each community before visiting.", travel_style: ["community", "learning"], is_featured: true, places: [stop("BTK-001", 1), stop("BTK-002", 2), stop("BTK-003", 3), stop("BTK-004", 4)] },
    { route_id: "ROUTE-BTK-HEART", name_th: "เรื่องเล่าภูเขารูปหัวใจ", name_en: "Stories Around the Heart-shaped Mountain", short_description_th: "เชื่อมชุมชนบ้านเขาเทพพิทักษ์กับวัดเขาพังผ่านเรื่องราวของพื้นที่", short_description_en: "Connect Khao Thep Phithak community with Wat Khao Phang through local stories.", description_th: "เส้นทางนำเสนอจุดหมายใกล้ชุมชนบ้านเขาเทพพิทักษ์โดยไม่กำหนดเวลา ระยะทาง หรือเงื่อนไขการเข้าพื้นที่", description_en: "This route presents destinations around Khao Thep Phithak without claiming travel time, distance, or access conditions.", travel_style: ["community", "photo"], is_featured: true, places: [stop("BTK-004", 1), stop("BTK-005", 2)] },
    { route_id: "ROUTE-KRN-NATURE", name_th: "ธรรมชาติคีรีรัฐนิคม", name_en: "Nature in Khiri Rat Nikhom", short_description_th: "รวมจุดหมายธรรมชาติในคีรีรัฐนิคมสำหรับวางแผนเที่ยวต่อจากบ้านตาขุน", short_description_en: "A collection of Khiri Rat Nikhom nature stops for extending a Ban Ta Khun trip.", description_th: "ใช้รายการนี้เป็นแนวทางเลือกจุดหมาย และตรวจสอบเส้นทาง เวลา และเงื่อนไขของแต่ละแห่งก่อนเดินทาง", description_en: "Use this collection to choose destinations, then confirm routes, hours, and access conditions before traveling.", travel_style: ["nature"], is_featured: false, places: [stop("KRN-001", 1), stop("KRN-002", 2), stop("KRN-003", 3)] },
    { route_id: "ROUTE-PNM-NATURE", name_th: "ธรรมชาติและวัฒนธรรมพนม", name_en: "Nature and Culture in Phanom", short_description_th: "เชื่อมจุดหมายธรรมชาติและวัฒนธรรมในอำเภอพนม", short_description_en: "Connect nature and cultural destinations in Phanom.", description_th: "ใช้รายการนี้เป็นแนวทางเลือกจุดหมายในพนม โดยตรวจสอบประกาศ เวลา และข้อปฏิบัติของพื้นที่ก่อนเดินทาง", description_en: "Use this collection to choose Phanom destinations and check current notices, hours, and site rules before traveling.", travel_style: ["nature", "learning"], is_featured: false, places: [stop("PNM-001", 1), stop("PNM-002", 2)] }
  ].map((route) => Object.freeze({ ...route, duration: "", cover_image_url: "", status: "published", places: Object.freeze(route.places) })));

  const PRODUCTS = Object.freeze([
    ["PROD-BTK-TEXTILE", "ผ้าทอมือบ้านเชี่ยวหลาน", "Ban Chiao Lan Handwoven Textiles", "handicraft", "BTK-002", "งานทอมือที่เชื่อมโยงภูมิปัญญาและเรื่องราวของชุมชนบ้านเชี่ยวหลาน", "Handwoven textiles sharing the craft and stories of the Ban Chiao Lan community."],
    ["PROD-BTK-HONEY", "ผลิตภัณฑ์น้ำผึ้งชุมชน", "Community Honey Products", "honey", "BTK-003", "ผลิตภัณฑ์จากผึ้งที่เชื่อมโยงกับการเรียนรู้ของชุมชนพรุไทย ฮันนี่บี", "Bee products connected with the learning experiences of Phru Thai Honey Bee."],
    ["PROD-BTK-HERBAL", "ผลิตภัณฑ์สมุนไพรชุมชน", "Community Herbal Products", "herbal", "BTK-002", "ผลิตภัณฑ์สมุนไพรที่ปรากฏในเรื่องราวของชุมชนบ้านเชี่ยวหลาน", "Herbal products featured in the Ban Chiao Lan community story."],
    ["PROD-BTK-DURIAN", "ทุเรียนคลองแสง", "Khlong Saeng Durian", "fruit", "BTK-002", "ผลไม้ท้องถิ่นคลองแสงที่มีตามฤดูกาลและความพร้อมของชุมชน", "Khlong Saeng fruit available according to the season and community supply."],
    ["PROD-BTK-RAMBUTAN", "เงาะตามฤดูกาล", "Seasonal Rambutan", "fruit", "BTK-002", "ผลไม้จากสวนชุมชนที่มีตามฤดูกาล", "Fruit from community orchards, available seasonally."],
    ["PROD-BTK-MANGOSTEEN", "มังคุดตามฤดูกาล", "Seasonal Mangosteen", "fruit", "BTK-002", "ผลไม้จากสวนชุมชนที่มีตามฤดูกาล", "Fruit from community orchards, available seasonally."],
    ["PROD-BTK-KHAO-LAM", "ข้าวหลามปลายอก", "Khao Lam Plai Ok", "food", "BTK-004", "ของดีชุมชนที่เชื่อมโยงกับกิจกรรมบ้านเขาเทพพิทักษ์", "A local specialty connected with activities in Khao Thep Phithak. "]
  ].map((item, index) => Object.freeze({ product_id: item[0], name_th: item[1], name_en: item[2], category: item[3], related_place_id: item[4], district: "ban_ta_khun", producer_name: "", description_th: item[5], description_en: item[6].trim(), price_range: "", phone: "", contact_url: "", google_maps_url: "", image_url: "", is_featured: index < 2, sort_order: index + 1, status: "published" })));

  const EVENTS = Object.freeze([Object.freeze({
    event_id: "EVENT-HEART-OF-HILLS-2026",
    title_th: "Heart of the Hills จากเขื่อนรัชชประภา... สู่ภูผาแห่งหัวใจ", title_en: "Heart of the Hills", event_type: "community_tourism",
    event_date: "2026-07-18", start_time: "10:00", end_time: "",
    location_th: "ตลาดคลองแสง ตำบลเขาพัง อำเภอบ้านตาขุน จังหวัดสุราษฎร์ธานี", location_en: "Khlong Saeng Market, Khao Phang, Ban Ta Khun, Surat Thani",
    related_place_id: "BTK-004",
    description_th: "กิจกรรมส่งเสริมการท่องเที่ยวและเศรษฐกิจชุมชน เชื่อมโยงเขื่อนรัชชประภา ภูเขารูปหัวใจ วิถีชุมชน และของดีคลองแสง ภายในงานมีบุฟเฟต์ทุเรียนคลองแสงและผลไม้ บัตรราคา 250 บาท สินค้าชุมชน ดนตรีโฟล์กซอง และเวลา 14.00 น. มีกิจกรรมเสวนา “สามเศรษฐกิจ Plus”",
    description_en: "A community tourism event connecting Ratchaprapha Dam, the heart-shaped mountain, local ways of life, and products from Khlong Saeng.",
    contact_name: "", contact_phone: "0848437924", register_url: "", google_maps_url: "", latitude: null, longitude: null,
    image_url: "", is_featured: true, status: "published"
  })]);

  const GALLERY_CATEGORIES = Object.freeze([
    { category_id: "dam_lake", name_th: "เขื่อนและทะเลสาบ", name_en: "Dam and Lake" },
    { category_id: "mountain_nature", name_th: "ขุนเขาและธรรมชาติ", name_en: "Mountains and Nature" },
    { category_id: "community_life", name_th: "ชุมชนและวิถีชีวิต", name_en: "Community and Local Life" },
    { category_id: "food_fruit", name_th: "อาหารและผลไม้", name_en: "Food and Fruit" },
    { category_id: "activity_tradition", name_th: "กิจกรรมและงานประเพณี", name_en: "Activities and Traditions" }
  ].map(Object.freeze));

  function listPlaces() { return clone(PLACES); }
  function getPlaceById(id) { const found = PLACES.find((item) => item.place_id === String(id || "").trim()); return found ? clone(found) : null; }
  function getNearbyPlaces(ids, currentId = "") { const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String))]; return wanted.map(getPlaceById).filter((item) => item && item.status === "published" && item.place_id !== currentId); }
  function listRoutes() { return clone(ROUTES); }
  function getRouteById(id) { const found = ROUTES.find((item) => item.route_id === String(id || "").trim()); return found ? clone(found) : null; }
  function listProducts() { return clone(PRODUCTS); }
  function getProductById(id) { const found = PRODUCTS.find((item) => item.product_id === String(id || "").trim()); return found ? clone(found) : null; }
  function listEvents() { return clone(EVENTS); }
  function getEventById(id) { const found = EVENTS.find((item) => item.event_id === String(id || "").trim()); return found ? clone(found) : null; }
  function listGalleryCategories() { return clone(GALLERY_CATEGORIES); }
  function listGallery() { return []; }

  function localDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function eventState(event, now = new Date()) {
    const today = localDateKey(now);
    if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(event?.event_date || "")) return "unknown";
    if (event.event_date === today) return "current";
    return event.event_date > today ? "upcoming" : "past";
  }

  function homePlace(item, lang) { return { place_id: item.place_id, name: localized(item, "name", lang), category: item.category, short_description: localized(item, "short_description", lang), cover_image_url: item.cover_image_url, is_featured: Boolean(item.is_featured) }; }
  function homeRoute(item, lang) { return { route_id: item.route_id, name: localized(item, "name", lang), short_description: localized(item, "short_description", lang), duration: item.duration, travel_style: item.travel_style.slice(), cover_image_url: item.cover_image_url, is_featured: Boolean(item.is_featured) }; }
  function homeEvent(item, lang) { return { event_id: item.event_id, title: localized(item, "title", lang), event_type: item.event_type, event_date: item.event_date, start_time: item.start_time, end_time: item.end_time, location: localized(item, "location", lang), image_url: item.image_url, is_featured: Boolean(item.is_featured) }; }
  function getHomeData(lang = "th", now = new Date()) {
    const language = lang === "en" ? "en" : "th";
    return { ok: true, data: { featured_routes: ROUTES.filter((item) => item.is_featured).slice(0, 2).map((item) => homeRoute(item, language)), featured_places: PLACES.filter((item) => item.is_featured).slice(0, 4).map((item) => homePlace(item, language)), featured_products: [], upcoming_events: EVENTS.filter((item) => ["upcoming", "current"].includes(eventState(item, now))).map((item) => homeEvent(item, language)), gallery_preview: [] }, message: "success" };
  }

  function canonicalText(value) { return String(value || "").normalize("NFC").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
  function matches(item, fields, keyword) { return fields.some((field) => { const value = item[field]; return canonicalText(Array.isArray(value) ? value.join(" ") : value).includes(keyword); }); }
  function searchAll(params = {}) {
    const lang = params.lang === "en" ? "en" : "th";
    const keyword = canonicalText(params.keyword);
    const data = { places: [], products: [], events: [], routes: [], total: 0 };
    if (!keyword) return data;
    data.places = PLACES.filter((item) => matches(item, ["name_th", "name_en", "short_description_th", "short_description_en", "description_th", "description_en", "district", "category", "route_group"], keyword)).map((item) => ({ place_id: item.place_id, name: localized(item, "name", lang), short_description: localized(item, "short_description", lang), category: item.category, district: item.district, cover_image_url: item.cover_image_url }));
    data.routes = ROUTES.filter((item) => matches(item, ["name_th", "name_en", "short_description_th", "short_description_en", "description_th", "description_en", "travel_style"], keyword)).map((item) => ({ route_id: item.route_id, name: localized(item, "name", lang), short_description: localized(item, "short_description", lang), duration: item.duration, travel_style: item.travel_style.slice(), cover_image_url: item.cover_image_url }));
    data.products = PRODUCTS.filter((item) => matches(item, ["name_th", "name_en", "description_th", "description_en", "producer_name", "category"], keyword)).map((item) => ({ product_id: item.product_id, name: localized(item, "name", lang), description: localized(item, "description", lang), category: item.category, producer_name: item.producer_name, image_url: item.image_url }));
    data.events = EVENTS.filter((item) => matches(item, ["title_th", "title_en", "description_th", "description_en", "location_th", "location_en", "event_type"], keyword)).map((item) => ({ event_id: item.event_id, title: localized(item, "title", lang), event_type: item.event_type, event_date: item.event_date, start_time: item.start_time, end_time: item.end_time, location: localized(item, "location", lang), image_url: item.image_url }));
    data.total = data.places.length + data.products.length + data.events.length + data.routes.length;
    return clone(data);
  }

  global.TakhunContentData = Object.freeze({
    listPlaces, getPlaceById, getNearbyPlaces, listRoutes, getRouteById, listProducts, getProductById,
    listEvents, getEventById, listGalleryCategories, listGallery, getHomeData, searchAll, eventState
  });
})(window);
