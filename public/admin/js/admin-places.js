"use strict";

(function createAdminPlaces(global) {
  const PLACE_CATEGORIES = Object.freeze(["main_point", "community_tourism", "nature", "viewpoint", "lake", "activity", "food_cafe", "accommodation", "temple_culture", "product_shop", "waterfall", "cave", "service"]);
  const PLACE_STATUSES = Object.freeze(["", "draft", "published", "archived", "all"]);
  const CATEGORY_LABELS = Object.freeze({ main_point: "จุดหลัก", community_tourism: "ท่องเที่ยวชุมชน", nature: "ธรรมชาติ", viewpoint: "จุดชมวิว", lake: "เขื่อนและทะเลสาบ", activity: "กิจกรรม", food_cafe: "อาหารและคาเฟ่", accommodation: "ที่พัก", temple_culture: "วัดและวัฒนธรรม", product_shop: "ร้านผลิตภัณฑ์", waterfall: "น้ำตก", cave: "ถ้ำ", service: "บริการ" });
  const SAFE_ERRORS = Object.freeze({ UNAUTHORIZED: "สิทธิ์การใช้งานหมดอายุ กรุณาเข้าสู่ระบบใหม่", FORBIDDEN: "คุณไม่มีสิทธิ์ดูรายการนี้", NETWORK_ERROR: "ไม่สามารถเชื่อมต่อเพื่อโหลดรายการได้", TIMEOUT: "การโหลดรายการใช้เวลานานเกินไป", RATE_LIMITED: "มีการขอข้อมูลมากเกินไป กรุณาลองใหม่ภายหลัง" });
  let bound = false;
  let elements;
  let token = "";
  let role = "viewer";
  let state = { keyword: "", category: "", status: "", page: 1, page_size: 20, response: null, loading: false, error: "" };

  function select(selector) { return global.document.querySelector(selector); }
  function node(tag, className, text) { const element = global.document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
  function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
  function setHidden(element, hidden) { element.hidden = hidden; }
  function writable() { return role === "super_admin" || role === "editor"; }
  function nameFor(item) { return item.name_th || item.name_en || "—"; }
  function categoryFor(item) { return CATEGORY_LABELS[item.category] || "ไม่ระบุหมวดหมู่"; }
  function actionHref(item) { return `place-edit.html?place_id=${encodeURIComponent(item.place_id)}`; }
  function actionLabel() { return writable() ? "แก้ไข" : "ดูรายละเอียด"; }
  function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date); }
  function readUrlState() {
    const params = new URLSearchParams(global.location && global.location.search || "");
    const category = params.get("category") || "";
    const status = params.get("status") || "";
    const rawPage = params.get("page") || "";
    return { keyword: (params.get("keyword") || "").trim().slice(0, 200), category: PLACE_CATEGORIES.includes(category) ? category : "", status: PLACE_STATUSES.includes(status) ? status : "", page: /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1, page_size: 20 };
  }
  function replaceUrl() {
    if (!global.history || typeof global.history.replaceState !== "function") return;
    const params = new URLSearchParams();
    if (state.keyword) params.set("keyword", state.keyword);
    if (state.category) params.set("category", state.category);
    if (state.status) params.set("status", state.status);
    if (state.page > 1) params.set("page", String(state.page));
    const query = params.toString();
    global.history.replaceState(null, "", `places.html${query ? `?${query}` : ""}`);
  }
  function appendStatus(container, item) {
    const label = item.status === "draft" ? "ฉบับร่าง" : item.status === "published" ? "เผยแพร่แล้ว" : "เก็บถาวร";
    container.appendChild(node("span", `admin-places__status admin-places__status--${item.status}`, label));
    if (item.status === "published" && item.has_active_draft) container.appendChild(node("span", "admin-places__status admin-places__status--revision", "มีฉบับร่าง"));
  }
  function appendAction(container, item) { const action = node("a", "admin-places__action", actionLabel()); action.href = actionHref(item); container.appendChild(action); }
  function renderItems(items) {
    clear(elements.tableBody); clear(elements.cards);
    for (const item of items) {
      const area = item.area_summary && [item.area_summary.district, item.area_summary.province].filter(Boolean).join(" · ");
      const row = node("tr"); const name = node("th", "admin-places__name", nameFor(item)); name.scope = "row";
      if (area) name.appendChild(node("small", "admin-places__area", area));
      row.appendChild(name); row.appendChild(node("td", "admin-places__category", categoryFor(item)));
      const statuses = node("td", "admin-places__statuses"); appendStatus(statuses, item); row.appendChild(statuses);
      row.appendChild(node("td", "admin-places__updated", formatDate(item.updated_at)));
      const actionCell = node("td", "admin-places__actions"); appendAction(actionCell, item); row.appendChild(actionCell); elements.tableBody.appendChild(row);
      const card = node("li", "admin-places__card"); card.appendChild(node("h2", "admin-places__card-title", nameFor(item)));
      if (area) card.appendChild(node("p", "admin-places__area", area));
      const details = node("dl", "admin-places__card-details"); details.appendChild(node("dt", "sr-only", "หมวดหมู่")); details.appendChild(node("dd", "admin-places__category", categoryFor(item)));
      details.appendChild(node("dt", "sr-only", "สถานะ")); const cardStatuses = node("dd", "admin-places__statuses"); appendStatus(cardStatuses, item); details.appendChild(cardStatuses);
      details.appendChild(node("dt", "sr-only", "ปรับปรุงล่าสุด")); details.appendChild(node("dd", "admin-places__updated", formatDate(item.updated_at))); card.appendChild(details);
      const cardAction = node("p", "admin-places__actions"); appendAction(cardAction, item); card.appendChild(cardAction); elements.cards.appendChild(card);
    }
  }
  function pageButton(label, target, disabled) { const button = node("button", "admin-places__page", label); button.type = "button"; button.disabled = disabled; button.addEventListener("click", function () { if (!disabled) return load(target); }); return button; }
  function renderPagination(response) {
    clear(elements.pagination); if (!response || response.total_pages < 2) return;
    elements.pagination.appendChild(pageButton("ก่อนหน้า", response.page - 1, response.page <= 1));
    elements.pagination.appendChild(node("span", "admin-places__page-summary", `หน้า ${response.page} จาก ${response.total_pages}`));
    elements.pagination.appendChild(pageButton("ถัดไป", response.page + 1, response.page >= response.total_pages));
  }
  function render() {
    clear(elements.state); setHidden(elements.tableWrap, true); setHidden(elements.cards, true); setHidden(elements.pagination, true);
    if (state.loading) { elements.announcement.textContent = "กำลังโหลดสถานที่"; elements.state.appendChild(node("p", "admin-places__message", "กำลังโหลดสถานที่…")); return; }
    if (state.error) { elements.announcement.textContent = "ไม่สามารถโหลดรายการสถานที่ได้"; elements.state.appendChild(node("p", "admin-places__message", state.error)); const retry = node("button", "button admin-places__retry", "ลองใหม่"); retry.type = "button"; retry.addEventListener("click", function () { return load(state.page); }); elements.state.appendChild(retry); return; }
    const items = state.response && state.response.items || [];
    if (!items.length) { const filtered = Boolean(state.keyword || state.category || state.status); elements.announcement.textContent = filtered ? "ไม่พบสถานที่ตามเงื่อนไข" : "ยังไม่มีสถานที่"; elements.state.appendChild(node("p", "admin-places__message", filtered ? "ไม่พบสถานที่ตามเงื่อนไขที่เลือก" : "ยังไม่มีสถานที่ในระบบ")); return; }
    elements.announcement.textContent = `พบสถานที่ ${state.response.total} รายการ`; setHidden(elements.tableWrap, false); setHidden(elements.cards, false); setHidden(elements.pagination, false); renderItems(items); renderPagination(state.response);
  }
  async function load(page, corrected) {
    if (state.loading || !token) return;
    if (page) state.page = page;
    state.loading = true; state.error = ""; state.response = null; replaceUrl(); render();
    try {
      const response = await global.TakhunAdminApi.getPlaces(token, { keyword: state.keyword, category: state.category, status: state.status, page: state.page, page_size: 20 });
      state.response = response;
      if (response.total_pages === 0) { state.page = 1; state.loading = false; replaceUrl(); render(); return; }
      if (!corrected && response.total > 0 && response.items.length === 0 && state.page > response.total_pages) { state.page = response.total_pages; state.loading = false; return load(response.total_pages, true); }
      if (corrected && response.total > 0 && response.items.length === 0 && state.page > response.total_pages) { state.page = response.total_pages; state.response = null; state.error = "ไม่สามารถโหลดรายการสถานที่ได้ในขณะนี้"; state.loading = false; replaceUrl(); render(); return; }
      state.page = response.page;
    } catch (error) { state.error = SAFE_ERRORS[error && error.code] || "ไม่สามารถโหลดรายการสถานที่ได้ในขณะนี้"; }
    state.loading = false; replaceUrl(); render();
  }
  function bind() {
    elements.form.addEventListener("submit", function (event) { event.preventDefault(); if (state.loading) { elements.keyword.value = state.keyword; elements.category.value = state.category; elements.status.value = state.status; return; } state.keyword = String(elements.keyword.value || "").trim().slice(0, 200); state.category = PLACE_CATEGORIES.includes(elements.category.value) ? elements.category.value : ""; state.status = PLACE_STATUSES.includes(elements.status.value) ? elements.status.value : ""; state.page = 1; load(); });
  }
  function collect() { return { form: select("[data-admin-places-filters]"), keyword: select("#admin-places-keyword"), category: select("#admin-places-category"), status: select("#admin-places-status"), create: select("[data-admin-places-create]"), announcement: select("[data-admin-places-announcement]"), state: select("[data-admin-places-state]"), tableWrap: select("[data-admin-places-table-wrap]"), tableBody: select("[data-admin-places-table-body]"), cards: select("[data-admin-places-cards]"), pagination: select("[data-admin-places-pagination]") }; }
  function waitForShellRetry() {
    if (typeof global.MutationObserver !== "function" || !global.document.body) return;
    const observer = new global.MutationObserver(function () {
      if (!global.document.body.classList.contains("admin-authenticated")) return;
      observer.disconnect();
      complete({ admin: {} });
    });
    observer.observe(global.document.body, { attributes: true, attributeFilter: ["class"] });
  }
  async function complete(authenticated) {
    if (bound) return;
    const session = global.TakhunAdminAuth.readSession();
    if (!session || !session.token) return;
    token = session.token; role = authenticated.admin && authenticated.admin.role || session.role; elements = collect(); state = { ...state, ...readUrlState() }; bound = true;
    elements.keyword.value = state.keyword; elements.category.value = state.category; elements.status.value = state.status; setHidden(elements.create, !writable()); bind(); await load();
  }
  async function init() {
    const authenticated = await global.TakhunAdminShell.init();
    if (!authenticated || authenticated.status !== "authenticated") { waitForShellRetry(); return; }
    return complete(authenticated);
  }
  global.TakhunAdminPlaces = Object.freeze({ init });
})(window);
