"use strict";

(function (global) {
  const PAGE_SIZE = 20;
  const MARKER = "takhun-routes-uncertain-create";
  const CONTENT_FIELDS = "name_th name_en slug short_description_th short_description_en description_th description_en duration travel_style cover_image_url map_focus_lat map_focus_lng is_featured sort_order".split(" ");
  const TRANSITIONS = Object.freeze({
    draft: ["published", "archived", "deleted"], published: ["hidden", "archived", "deleted"],
    hidden: ["draft", "published", "archived", "deleted"], archived: ["draft", "deleted"], deleted: ["draft"]
  });
  const STATUS_LABELS = Object.freeze({ draft: "ฉบับร่าง", published: "เผยแพร่", hidden: "ซ่อน", archived: "เก็บถาวร", deleted: "ลบแล้ว" });
  const UNCERTAIN_CODES = ["OUTCOME_UNKNOWN", "NETWORK_ERROR", "TIMEOUT", "HTTP_ERROR", "MALFORMED_RESPONSE"];
  let elements, token, role, canWrite = false, initialized = false, bound = false;
  let page = 1, filters = { keyword: "", status: "" }, listBusy = false, mutationBusy = false, mutationRequestBusy = false, detailGeneration = 0;
  let record = null, stops = [], placeResults = [], placePage = 1, placeTotalPages = 0, placeGeneration = 0, placeBusy = false, dirty = false, blocked = false, currentView = "list";
  let deleteAuditWarning = "", mutationMessageGeneration = 0;
  let uncertainMarkerKey = "", uncertainGeneration = 0, uncertainReadyGeneration = -1;

  function q(selector) { return global.document.querySelector(selector); }
  function node(tag, text, className) { const item = global.document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; }
  function button(text, handler) { const item = node("button", text, "button"); item.type = "button"; item.addEventListener("click", handler); return item; }
  function show(item, visible) { item.hidden = !visible; }
  function announce(text, editor) { (editor ? elements.editorStatus : elements.listStatus).textContent = !editor && deleteAuditWarning ? (text ? `${text} · ${deleteAuditWarning}` : deleteAuditWarning) : text; }
  function beginMutationMessage() { deleteAuditWarning = ""; return ++mutationMessageGeneration; }
  function safeMessage(error) {
    return ({ UNAUTHORIZED: "กรุณาเข้าสู่ระบบอีกครั้ง", FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์ทำรายการ", VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", NOT_FOUND: "ไม่พบเส้นทาง", CONFLICT: "ข้อมูลบนเซิร์ฟเวอร์เปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดเพื่อกระทบยอด", INVALID_TRANSITION: "ไม่สามารถเปลี่ยนเป็นสถานะนี้ได้", OUTCOME_UNKNOWN: "ยังยืนยันผลรายการไม่ได้ กรุณากระทบยอดก่อนทำรายการใหม่", NETWORK_ERROR: "การเชื่อมต่อขัดข้อง ผลรายการอาจยังไม่แน่นอน", TIMEOUT: "หมดเวลารอผล ผลรายการอาจยังไม่แน่นอน" })[error && error.code] || "ไม่สามารถทำรายการได้ในขณะนี้";
  }
  function readMarker() { try { const value = global.sessionStorage.getItem(MARKER); return value ? JSON.parse(value) : null; } catch (_error) { return null; } }
  function resetUncertainReadiness(marker) { uncertainMarkerKey = marker ? JSON.stringify(marker) : ""; uncertainGeneration += 1; uncertainReadyGeneration = -1; if (elements) elements.uncertainComplete.hidden = true; }
  function writeMarker(value) { try { if (value) global.sessionStorage.setItem(MARKER, JSON.stringify(value)); else global.sessionStorage.removeItem(MARKER); resetUncertainReadiness(value); return true; } catch (_error) { return false; } }
  function syncUncertainControls() { const marker = readMarker(); if ((marker ? JSON.stringify(marker) : "") !== uncertainMarkerKey) resetUncertainReadiness(marker); show(elements.uncertain, !!marker); elements.create.disabled = !!marker; elements.uncertainComplete.hidden = !marker || uncertainReadyGeneration !== uncertainGeneration; return marker; }
  function writer() { return canWrite && !mutationBusy && !blocked; }
  function setDirty(value) { dirty = value; }
  function syncPlaceControls() {
    const disabled = !writer() || placeBusy;
    elements.placeKeyword.disabled = disabled; elements.placeSearch.disabled = disabled; elements.placeResults.disabled = disabled; elements.addStop.disabled = disabled;
    elements.placeNext.disabled = disabled || placePage >= placeTotalPages;
  }
  function invalidatePlaceSearch() {
    placeGeneration += 1; placeBusy = false; placePage = 1; placeTotalPages = 0; placeResults = [];
    if (elements && elements.placeResults) { elements.placeResults.replaceChildren(); elements.placeStatus.textContent = ""; syncPlaceControls(); }
  }
  function syncMutationControls() {
    const writable = writer();
    elements.contentFields.disabled = !writable;
    elements.stopsFields.disabled = !writable;
    elements.save.hidden = !canWrite;
    elements.save.disabled = !writable;
    elements.delete.hidden = !canWrite || !record || !(TRANSITIONS[record.status] || []).includes("deleted");
    elements.delete.disabled = !writable;
    elements.lifecycle.querySelectorAll("button").forEach(item => { item.disabled = !writable; });
    elements.reconcile.hidden = !blocked || !record;
    elements.editor.setAttribute("aria-busy", String(mutationBusy));
    syncPlaceControls();
  }
  function collect() {
    elements = {
      host: q("[data-admin-routes]"), listView: q("[data-route-list-view]"), editorView: q("[data-route-editor-view]"), filters: q("[data-route-filters]"),
      create: q("[data-route-create]"), refresh: q("[data-route-refresh]"), listStatus: q("[data-route-list-status]"), list: q("[data-route-list]"), pagination: q("[data-route-pagination]"),
      uncertain: q("[data-route-uncertain]"), uncertainReconcile: q("[data-route-uncertain-reconcile]"), uncertainComplete: q("[data-route-uncertain-complete]"),
      editor: q("[data-route-editor]"), editorTitle: q("[data-route-editor-title]"), editorStatus: q("[data-route-editor-status]"), identity: q("[data-route-identity]"), back: q("[data-route-back]"),
      contentFields: q("[data-route-content-fields]"), stopsFields: q("[data-route-stops-fields]"), stops: q("[data-route-stops]"), lifecycle: q("[data-route-lifecycle]"), save: q("[data-route-save]"), delete: q("[data-route-delete]"), reconcile: q("[data-route-reconcile]"),
      placeKeyword: q("[data-route-place-keyword]"), placeSearch: q("[data-route-place-search]"), placeResults: q("[data-route-place-results]"), addStop: q("[data-route-add-stop]"), placeNext: q("[data-route-place-next]"), placeStatus: q("[data-route-place-status]")
    };
  }
  function listPayload() { return { keyword: filters.keyword, status: filters.status, page, page_size: PAGE_SIZE }; }
  async function loadList(reset) {
    if (listBusy) return false;
    if (reset) page = 1;
    listBusy = true; elements.filters.querySelectorAll("button,input,select").forEach(item => { item.disabled = true; }); elements.pagination.querySelectorAll("button").forEach(item => { item.disabled = true; });
    announce("กำลังโหลดรายการเส้นทาง…", false);
    try {
      const result = await global.TakhunAdminApi.getRoutes(token, listPayload());
      elements.list.replaceChildren();
      result.items.forEach(item => {
        const card = node("article", undefined, "content-card"), title = node("h3", item.name_th || item.route_id), summary = node("p", item.travel_style || "ไม่ระบุรูปแบบ", "content-summary");
        const status = node("span", STATUS_LABELS[item.status] || item.status, `content-badge content-badge--${item.status}`);
        const updated = node("p", `แก้ไขล่าสุด ${item.updated_at || "-"}`), open = button(canWrite ? "แก้ไข" : "ดูรายละเอียด", () => openEditor(item.route_id));
        card.append(title, summary, status, updated, open); elements.list.appendChild(card);
      });
      renderPagination(result);
      announce(result.items.length ? `พบ ${result.total} เส้นทาง` : "ยังไม่มีเส้นทาง", false);
      return true;
    } catch (error) { announce(safeMessage(error), false); return false; }
    finally { listBusy = false; elements.filters.querySelectorAll("button,input,select").forEach(item => { item.disabled = false; }); }
  }
  function renderPagination(result) {
    elements.pagination.replaceChildren();
    const previous = button("หน้าก่อน", () => { if (!listBusy && page > 1) { page -= 1; loadList(false); } }); previous.disabled = page <= 1;
    const summary = node("span", `หน้า ${result.page} จาก ${result.total_pages || 1}`);
    const next = button("หน้าถัดไป", () => { if (!listBusy && page < result.total_pages) { page += 1; loadList(false); } }); next.disabled = page >= result.total_pages;
    elements.pagination.append(previous, summary, next);
  }
  function emptyContent() { return { name_th: "", name_en: "", slug: "", short_description_th: "", short_description_en: "", description_th: "", description_en: "", duration: "", travel_style: "", cover_image_url: "", map_focus_lat: "", map_focus_lng: "", is_featured: false, sort_order: "" }; }
  function fillContent(content) {
    CONTENT_FIELDS.forEach(key => { const input = elements.editor.elements.namedItem(key); if (input.type === "checkbox") input.checked = content[key] === true; else input.value = content[key] === undefined ? "" : String(content[key]); });
  }
  function readContent() {
    const result = {};
    CONTENT_FIELDS.forEach(key => { const input = elements.editor.elements.namedItem(key); if (input.type === "checkbox") result[key] = input.checked; else if (["map_focus_lat", "map_focus_lng", "sort_order"].includes(key)) result[key] = input.value === "" ? "" : Number(input.value); else result[key] = input.value; });
    return result;
  }
  function stopInput(type, value, label) { const wrap = node("label", label), input = node("input"); input.type = type; input.value = value === "" ? "" : String(value); wrap.appendChild(input); return { wrap, input }; }
  function renderStops(focusTarget) {
    elements.stops.replaceChildren();
    let focusControl = null;
    stops.forEach((stop, index) => {
      const card = node("article", undefined, "admin-routes__stop"), heading = node("h3", `จุดแวะ ${index + 1}`);
      const placeLabel = node("label", "สถานที่"), select = node("select"); select.setAttribute("aria-label", `สถานที่จุดแวะ ${index + 1}`);
      const options = [{ place_id: stop.place_id, name_th: stop.place_name || stop.place_id }, ...placeResults.filter(item => item.place_id !== stop.place_id)];
      options.forEach(item => { const option = node("option", `${item.name_th || item.place_id} · ${item.place_id}`); option.value = item.place_id; select.appendChild(option); }); select.value = stop.place_id;
      select.addEventListener("change", () => { if (stops.some((item, position) => position !== index && item.place_id === select.value)) { announce("เลือกสถานที่ซ้ำไม่ได้", true); select.value = stop.place_id; return; } stop.place_id = select.value; stop.place_name = select.options[select.selectedIndex].textContent; setDirty(true); }); placeLabel.appendChild(select);
      const day = stopInput("number", stop.day_number, "วันที่ของทริป"), start = stopInput("time", stop.start_time, "เวลาเริ่ม"), end = stopInput("time", stop.end_time, "เวลาสิ้นสุด"), noteTh = stopInput("text", stop.note_th, "หมายเหตุภาษาไทย"), noteEn = stopInput("text", stop.note_en, "หมายเหตุภาษาอังกฤษ"); day.input.min = "1"; day.input.step = "1";
      [[day.input,"day_number"],[start.input,"start_time"],[end.input,"end_time"],[noteTh.input,"note_th"],[noteEn.input,"note_en"]].forEach(([input,key]) => input.addEventListener("input", () => { stop[key] = input.value; setDirty(true); }));
      const controls = node("div", undefined, "admin-routes__stop-actions"), up = button("เลื่อนขึ้น", () => moveStop(index, -1)), down = button("เลื่อนลง", () => moveStop(index, 1)), remove = button("นำออก", () => removeStop(index));
      up.setAttribute("aria-label", `เลื่อนจุดแวะ ${index + 1} ขึ้น`); down.setAttribute("aria-label", `เลื่อนจุดแวะ ${index + 1} ลง`); remove.setAttribute("aria-label", `นำจุดแวะ ${index + 1} ออก`); up.disabled = index === 0 || !writer(); down.disabled = index === stops.length - 1 || !writer(); remove.disabled = !writer(); controls.append(up, down, remove);
      if (focusTarget && focusTarget.index === index) focusControl = focusTarget.action === "remove" ? remove : focusTarget.action === "up" ? (up.disabled ? down : up) : (down.disabled ? up : down);
      card.append(heading, placeLabel, day.wrap, start.wrap, end.wrap, noteTh.wrap, noteEn.wrap, controls); elements.stops.appendChild(card);
    });
    if (focusControl && !focusControl.disabled) focusControl.focus();
    else if (focusTarget && stops.length === 0) elements.addStop.focus();
  }
  function moveStop(index, delta) { const target = index + delta; if (!writer() || target < 0 || target >= stops.length) return; [stops[index], stops[target]] = [stops[target], stops[index]]; setDirty(true); renderStops({ index: target, action: delta < 0 ? "up" : "down" }); }
  function removeStop(index) { if (!writer()) return; stops.splice(index, 1); setDirty(true); renderStops({ index: Math.min(index, stops.length - 1), action: "remove" }); }
  function requestStops(status) { return stops.map((stop, index) => ({ route_place_id: stop.route_place_id || "", place_id: stop.place_id, day_number: stop.day_number === "" ? "" : Number(stop.day_number), stop_order: index + 1, start_time: stop.start_time || "", end_time: stop.end_time || "", note_th: stop.note_th || "", note_en: stop.note_en || "", status })); }
  function renderLifecycle() {
    elements.lifecycle.replaceChildren();
    if (!canWrite || !record) return;
    (TRANSITIONS[record.status] || []).filter(status => status !== "deleted").forEach(status => elements.lifecycle.appendChild(button(`เปลี่ยนเป็น ${STATUS_LABELS[status]}`, () => transition(status))));
  }
  function renderEditor() {
    currentView = "editor"; show(elements.listView, false); show(elements.editorView, true);
    const content = record ? record.content : emptyContent(); fillContent(content);
    stops = record ? record.stops.map(stop => ({ ...stop, place_name: stop.place_id })) : []; invalidatePlaceSearch();
    elements.editorTitle.textContent = record ? (canWrite ? "แก้ไขเส้นทาง" : "รายละเอียดเส้นทาง") : "สร้างเส้นทางใหม่";
    elements.identity.textContent = record ? `${record.route_id} · ${STATUS_LABELS[record.status]}` : "เส้นทางใหม่ · ฉบับร่าง";
    blocked = false; mutationBusy = false; setDirty(false); renderStops(); renderLifecycle(); announce(canWrite ? "" : "บัญชีนี้ดูข้อมูลได้อย่างเดียว", true); syncMutationControls();
  }
  async function openEditor(routeId) {
    if (mutationRequestBusy) { announce("กำลังรอผลการบันทึก กรุณารอให้รายการเสร็จสิ้น", currentView === "editor"); return; }
    if (dirty && !global.confirm("มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากหน้านี้หรือไม่?")) return;
    const turn = ++detailGeneration; invalidatePlaceSearch();
    if (!routeId) { if (readMarker()) { announce("ต้องกระทบยอดการสร้างครั้งก่อนก่อนสร้างใหม่", false); return; } record = null; renderEditor(); return; }
    announce("กำลังโหลดรายละเอียด…", false);
    try { const loaded = await global.TakhunAdminApi.getRouteDetail(token, { route_id: routeId }); if (turn !== detailGeneration) return; record = loaded; renderEditor(); } catch (error) { if (turn === detailGeneration) announce(safeMessage(error), false); }
  }
  function validEditor() {
    if (!elements.editor.checkValidity()) { elements.editor.reportValidity(); announce("กรุณากรอกช่องที่จำเป็นให้ครบ", true); return false; }
    const duplicate = stops.some((stop, index) => stops.findIndex(item => item.place_id === stop.place_id) !== index);
    if (duplicate) { announce("เลือกสถานที่ซ้ำไม่ได้", true); return false; }
    return true;
  }
  function blockFor(error, creating) {
    const uncertain = error && UNCERTAIN_CODES.includes(error.code);
    if (error && error.code === "CONFLICT" || uncertain) blocked = true;
    if (creating && uncertain) { writeMarker({ route_id: error && error.route_id || "", at: Date.now() }); syncUncertainControls(); }
    announce(safeMessage(error), true); syncMutationControls();
  }
  async function save(event) {
    event.preventDefault(); if (!writer() || !validEditor()) return;
    const turn = detailGeneration; beginMutationMessage();
    mutationBusy = true; syncMutationControls(); const creating = !record, status = record ? record.status : "draft";
    if (creating && !writeMarker({ route_id: "", at: Date.now() })) { mutationBusy = false; announce("ไม่สามารถเก็บสถานะความไม่แน่นอนได้ จึงยังไม่เริ่มสร้าง", true); syncMutationControls(); return; }
    const payload = creating ? { content: readContent(), stops: requestStops(status) } : { route_id: record.route_id, expected_revision: record.revision, content: readContent(), stops: requestStops(status) };
    let result;
    mutationRequestBusy = true;
    try { result = creating ? await global.TakhunAdminApi.createRoute(token, payload) : await global.TakhunAdminApi.updateRoute(token, payload); }
    catch (error) { mutationRequestBusy = false; if (creating && !(error && UNCERTAIN_CODES.includes(error.code))) writeMarker(null); blockFor(error, creating); mutationBusy = false; syncMutationControls(); return; }
    mutationRequestBusy = false;
    if (creating) writeMarker(null);
    if (turn !== detailGeneration) { mutationBusy = false; return; }
    record = { ...(record || {}), ...result, content: payload.content, stops: payload.stops };
    setDirty(false);
    try {
      const loaded = await global.TakhunAdminApi.getRouteDetail(token, { route_id: result.route_id });
      if (turn !== detailGeneration) return;
      record = loaded;
      mutationBusy = false; renderEditor(); announce(result.audit_status === "unconfirmed" ? "บันทึกแล้ว แต่ยังยืนยันบันทึกตรวจสอบไม่ได้" : "บันทึกแล้ว", true);
    } catch (error) {
      if (turn !== detailGeneration) return;
      blocked = true; mutationBusy = false; announce("บันทึกได้รับการยืนยันแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากระทบยอดก่อนทำรายการใหม่", true); syncMutationControls();
    }
  }
  async function transition(status) {
    if (!writer() || !record || !(TRANSITIONS[record.status] || []).includes(status)) return;
    if (dirty) { announce("กรุณาบันทึกหรือโหลดข้อมูลล่าสุดก่อนเปลี่ยนสถานะ", true); return; }
    if (!global.confirm(`ยืนยันเปลี่ยนสถานะเป็น ${STATUS_LABELS[status]}?`)) return;
    const turn = detailGeneration; beginMutationMessage(); mutationBusy = true; mutationRequestBusy = true; syncMutationControls();
    let result;
    try { result = await global.TakhunAdminApi.updateRoute(token, { route_id: record.route_id, expected_revision: record.revision, status }); }
    catch (error) { mutationRequestBusy = false; blockFor(error, false); mutationBusy = false; syncMutationControls(); return; }
    mutationRequestBusy = false;
    if (turn !== detailGeneration) { mutationBusy = false; return; }
    record = { ...record, ...result };
    try { const loaded = await global.TakhunAdminApi.getRouteDetail(token, { route_id: record.route_id }); if (turn !== detailGeneration) return; record = loaded; mutationBusy = false; renderEditor(); announce(result.audit_status === "unconfirmed" ? `เปลี่ยนสถานะเป็น ${STATUS_LABELS[status]} แล้ว แต่ยังยืนยันบันทึกตรวจสอบไม่ได้` : `เปลี่ยนสถานะเป็น ${STATUS_LABELS[status]} แล้ว`, true); }
    catch (_error) { if (turn !== detailGeneration) return; blocked = true; mutationBusy = false; announce(result.audit_status === "unconfirmed" ? "เปลี่ยนสถานะได้รับการยืนยันแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ และยังยืนยันบันทึกตรวจสอบไม่ได้ กรุณากระทบยอด" : "เปลี่ยนสถานะได้รับการยืนยันแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากระทบยอด", true); syncMutationControls(); }
  }
  async function removeRoute() {
    if (!writer() || !record || !(TRANSITIONS[record.status] || []).includes("deleted")) return;
    if (dirty) { announce("กรุณาบันทึกหรือโหลดข้อมูลล่าสุดก่อนลบ", true); return; }
    if (!global.confirm("ยืนยันลบแบบซอฟต์? ข้อมูลจะยังคงอยู่ในระบบ")) return;
    const messageGeneration = beginMutationMessage();
    mutationBusy = true; mutationRequestBusy = true; syncMutationControls();
    let result;
    try { result = await global.TakhunAdminApi.deleteRoute(token, { route_id: record.route_id, expected_revision: record.revision }); }
    catch (error) { mutationRequestBusy = false; blockFor(error, false); mutationBusy = false; syncMutationControls(); return; }
    mutationRequestBusy = false; mutationBusy = false; setDirty(false); currentView = "list"; show(elements.editorView, false); show(elements.listView, true); syncMutationControls();
    // Keep the confirmed Delete's audit notice when any pending list read finishes.
    deleteAuditWarning = result.audit_status === "unconfirmed" ? "ลบแล้ว แต่ยังยืนยันบันทึกตรวจสอบไม่ได้" : "";
    await loadList(true);
    if (result.audit_status === "unconfirmed" && messageGeneration === mutationMessageGeneration) announce("", false);
  }
  async function reconcileEditor() {
    if (!record || mutationBusy) return; const turn = detailGeneration, routeId = record.route_id; mutationBusy = true; syncMutationControls();
    try { const loaded = await global.TakhunAdminApi.getRouteDetail(token, { route_id: routeId }); if (turn !== detailGeneration) return; record = loaded; blocked = false; renderEditor(); announce("โหลดข้อมูลล่าสุดแล้ว ตรวจสอบก่อนทำรายการใหม่", true); }
    catch (error) { if (turn === detailGeneration) announce(safeMessage(error), true); }
    finally { if (turn === detailGeneration) { mutationBusy = false; syncMutationControls(); } }
  }
  async function searchPlaces(reset) {
    if (!reset && placeBusy) return;
    const requestedPage = reset ? 1 : placePage + 1, turn = ++placeGeneration, keyword = elements.placeKeyword.value.trim();
    placeBusy = true; syncPlaceControls();
    try {
      const result = await global.TakhunAdminApi.getPlaces(token, { keyword, status: "all", page: requestedPage, page_size: PAGE_SIZE });
      if (turn !== placeGeneration) return;
      placePage = result.page; placeTotalPages = result.total_pages;
      placeResults = result.items; elements.placeResults.replaceChildren(); result.items.forEach(item => { const option = node("option", `${item.name_th || item.place_id} · ${item.place_id}`); option.value = item.place_id; elements.placeResults.appendChild(option); });
      elements.placeStatus.textContent = `หน้าสถานที่ ${result.page} จาก ${result.total_pages || 1}`; elements.placeNext.disabled = placePage >= result.total_pages; renderStops();
    } catch (error) { if (turn === placeGeneration) elements.placeStatus.textContent = safeMessage(error); }
    finally { if (turn === placeGeneration) { placeBusy = false; syncPlaceControls(); } }
  }
  function addStop() {
    if (!writer()) return; const placeId = elements.placeResults.value, place = placeResults.find(item => item.place_id === placeId);
    if (!placeId) { elements.placeStatus.textContent = "กรุณาเลือกสถานที่"; return; }
    if (stops.some(stop => stop.place_id === placeId)) { elements.placeStatus.textContent = "เลือกสถานที่ซ้ำไม่ได้"; return; }
    stops.push({ route_place_id: "", place_id: placeId, place_name: place && place.name_th || placeId, day_number: "", start_time: "", end_time: "", note_th: "", note_en: "" }); setDirty(true); renderStops();
  }
  async function reconcileUncertain() {
    const marker = syncUncertainControls(); if (!marker) return;
    const markerKey = uncertainMarkerKey, turn = ++uncertainGeneration;
    uncertainReadyGeneration = -1; elements.uncertainComplete.hidden = true;
    let ok = false;
    if (marker.route_id) { try { await global.TakhunAdminApi.getRouteDetail(token, { route_id: marker.route_id }); ok = true; } catch (_error) { ok = await loadList(true); } }
    else ok = await loadList(true);
    if (turn !== uncertainGeneration || JSON.stringify(readMarker()) !== markerKey) return;
    uncertainReadyGeneration = ok ? turn : -1; syncUncertainControls();
  }
  function bind() {
    elements.filters.addEventListener("submit", event => { event.preventDefault(); filters = { keyword: elements.filters.elements.namedItem("keyword").value.trim(), status: elements.filters.elements.namedItem("status").value }; loadList(true); });
    elements.refresh.addEventListener("click", () => loadList(false)); elements.create.addEventListener("click", () => openEditor(""));
    elements.back.addEventListener("click", () => { if (mutationRequestBusy) { announce("กำลังรอผลการบันทึก กรุณารอให้รายการเสร็จสิ้น", true); return; } if (dirty && !global.confirm("มีข้อมูลที่ยังไม่บันทึก ต้องการกลับรายการหรือไม่?")) return; detailGeneration += 1; mutationBusy = false; blocked = false; invalidatePlaceSearch(); setDirty(false); currentView = "list"; show(elements.editorView, false); show(elements.listView, true); loadList(false); });
    elements.editor.addEventListener("submit", save); elements.delete.addEventListener("click", removeRoute); elements.reconcile.addEventListener("click", reconcileEditor);
    elements.placeSearch.addEventListener("click", () => searchPlaces(true)); elements.placeNext.addEventListener("click", () => searchPlaces(false)); elements.addStop.addEventListener("click", addStop);
    elements.editor.addEventListener("input", () => { if (currentView === "editor") setDirty(true); }); elements.editor.addEventListener("change", () => { if (currentView === "editor") setDirty(true); });
    elements.uncertainReconcile.addEventListener("click", reconcileUncertain); elements.uncertainComplete.addEventListener("click", () => { if (!syncUncertainControls() || uncertainReadyGeneration !== uncertainGeneration) return; if (!global.confirm("ยืนยันว่าตรวจสอบรายการบนเซิร์ฟเวอร์แล้ว?")) return; writeMarker(null); syncUncertainControls(); });
    global.addEventListener("beforeunload", event => { if (dirty || mutationBusy) { event.preventDefault(); event.returnValue = ""; } });
  }
  async function complete(result) {
    if (bound) return; const session = global.TakhunAdminAuth.readSession(); if (!session || !session.token) return; bound = true;
    collect(); token = session.token; role = result.admin && result.admin.role || session.role; canWrite = role === "super_admin" || role === "editor";
    elements.create.hidden = !canWrite; syncUncertainControls();
    bind(); return loadList(true);
  }
  async function init() {
    if (initialized) return; initialized = true; const result = await global.TakhunAdminShell.init();
    if (result && result.status === "authenticated") return complete(result);
    if (typeof global.MutationObserver === "function") { const observer = new global.MutationObserver(() => { if (global.document.body.classList.contains("admin-authenticated")) { observer.disconnect(); complete({ admin: {} }); } }); observer.observe(global.document.body, { attributes: true, attributeFilter: ["class"] }); }
  }
  global.TakhunAdminRoutes = Object.freeze({ init });
})(window);
