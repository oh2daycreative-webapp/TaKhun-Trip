"use strict";

(function (global) {
  let host, model, domain, kind, token, role, controller, bound = false;
  let page = 1, filters = { keyword: "", status: "" }, generation = 0, listBusy = false, dirty = false;
  let fields = {}, fieldErrors = {}, editorStatus, editorButtons = [], editorForm, currentView = "list";
  let createUncertain = false;
  const writer = () => role === "editor" || role === "super_admin";
  const node = (tag, text, cls) => { const e = global.document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const append = (parent, ...children) => children.forEach(e => parent.appendChild(e));
  function button(text, action) { const e = node("button", text, "button"); e.type = "button"; e.addEventListener("click", action); return e; }
  function option(value, text) { const e = node("option", text); e.value = value; return e; }
  function statusNode() { const e = node("p", "", "content-notice"); e.setAttribute("role", "status"); e.setAttribute("aria-live", "polite"); e.setAttribute("aria-atomic", "true"); return e; }
  function labelled(text, input, id) { input.id = id; const wrap = node("div", undefined, "content-field"), label = node("label", text); label.setAttribute("for", id); append(wrap, label, input); return wrap; }
  function marker(value) {
    createUncertain = value;
    try { if (value) global.sessionStorage.setItem("takhun-content-uncertain-" + kind, "1"); else global.sessionStorage.removeItem("takhun-content-uncertain-" + kind); return true; } catch (_storage) { return false; }
  }
  function newController() { controller = model.createController(kind, role, global.TakhunAdminApi, token); }
  function mayLeave() { return !controller || !controller.state.busy && (!dirty || global.confirm("มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากแบบฟอร์มหรือไม่?")); }
  function badge(state) { return node("span", model.statuses[state] || state, "content-badge content-badge--" + state); }
  function safeReadMessage(error) { return error && error.code === "UNAUTHORIZED" ? "สิทธิ์หมดอายุ กรุณาเข้าสู่ระบบใหม่" : "โหลดข้อมูลไม่สำเร็จ กรุณาลองโหลดใหม่"; }

  async function showList() {
    if (!mayLeave()) return;
    dirty = false; currentView = "list"; const turn = ++generation;
    host.replaceChildren();
    const heading = node("h2", kind === "products" ? "สินค้าและบริการชุมชน" : "กิจกรรมท่องเที่ยว"); heading.tabIndex = -1;
    const top = node("div", undefined, "content-toolbar"); append(top, heading);
    if (writer()) append(top, button("เพิ่มรายการ", () => { if (!listBusy && !createUncertain) return openEditor(); }));
    append(top, button("โหลดรายการใหม่", () => { if (!listBusy) return showList(); })); append(host, top);
    if (createUncertain) {
      const warning = statusNode(); warning.textContent = "ยังยืนยันผลการสร้างครั้งก่อนไม่ได้ กรุณาค้นหาชื่อและเปิดตรวจสอบรายการก่อนสร้างอีกครั้ง";
      append(host, warning, button("ตรวจสอบรายการแล้ว", () => {
        if (listBusy) return;
        if (global.confirm("ตรวจสอบรายการและรายละเอียดแล้วว่าไม่มีรายการที่สร้างครั้งก่อนใช่หรือไม่? หากพบรายการแล้วให้เปิดรายการนั้นแทน")) { marker(false); return showList(); }
      }));
    }
    const form = node("form", undefined, "content-filters");
    const keyword = node("input"); keyword.type = "search"; keyword.maxLength = 200; keyword.value = filters.keyword;
    const status = node("select"); append(status, option("", "ทุกสถานะ")); Object.keys(model.statuses).forEach(s => append(status, option(s, model.statuses[s]))); status.value = filters.status;
    const category = node("select"); append(category, option("", "ทุกประเภท")); domain.categories.forEach(c => append(category, option(c, model.categoryLabels[c] || c))); category.value = filters[domain.category] || "";
    const search = node("button", "ค้นหา", "button"); search.type = "submit";
    append(form, labelled("ค้นหาชื่อหรือรหัส", keyword, "content-keyword"), labelled("สถานะ", status, "content-status"), labelled("ประเภท", category, "content-category"), search);
    form.addEventListener("submit", e => { e.preventDefault(); if (listBusy) return; filters = {keyword: keyword.value.trim(), status: status.value, [domain.category]: category.value}; page = 1; return showList(); });
    const notice = statusNode(), rows = node("div", undefined, "content-list"), pagination = node("nav", undefined, "content-toolbar"); pagination.setAttribute("aria-label", "หน้ารายการ");
    append(host, form, notice, rows, pagination); listBusy = true; search.disabled = true; notice.textContent = "กำลังโหลดรายการ…"; rows.setAttribute("aria-busy", "true");
    try {
      const result = await global.TakhunAdminApi[domain.methods.list](token, { ...filters, page, page_size: 20 });
      if (turn !== generation) return;
      page = result.page; notice.textContent = result.items.length ? `พบ ${result.total} รายการ · หน้า ${page} จาก ${result.total_pages}` : "ไม่พบรายการตามเงื่อนไข";
      for (const item of result.items) {
        const card = node("article", undefined, "content-card"), title = node("h3", item[domain.title]);
        const summary = node("p", "กำลังโหลดรายละเอียด…", "content-summary"), actions = node("div", undefined, "content-toolbar");
        append(card, title, node("p", item[domain.id], "content-id"), badge(item.status), node("p", model.categoryLabels[item[domain.category]] || item[domain.category]), summary);
        append(actions, button(writer() ? "เปิด / จัดการ" : "ดูรายละเอียด", () => openEditor(item[domain.id]))); append(card, actions); append(rows, card);
        // The locked list projection omits featured/date fields. Read only this page's details.
        global.TakhunAdminApi[domain.methods.detail](token, { [domain.id]: item[domain.id] }).then(detail => {
          if (turn !== generation) return;
          const c = detail.content;
          title.textContent = c[domain.title];
          summary.textContent = (c.is_featured ? "รายการแนะนำ" : "รายการทั่วไป") + (kind === "events" ? ` · ${c.event_date} ${c.start_time || ""}${c.end_time ? "–" + c.end_time : ""}` : "");
        }).catch(() => { if (turn === generation) summary.textContent = "รายละเอียดเพิ่มเติมยังโหลดไม่ได้ โปรดเปิดรายการหรือโหลดใหม่"; });
      }
      const prev = button("หน้าก่อน", () => { if (!listBusy) { page = Math.max(1,page-1); return showList(); } }); prev.disabled = page <= 1;
      const next = button("หน้าถัดไป", () => { if (!listBusy) { page += 1; return showList(); } }); next.disabled = page >= result.total_pages;
      append(pagination, prev, next);
      if (!result.items.length && page > 1) append(pagination, button("กลับหน้าแรก", () => { page = 1; return showList(); }));
    } catch (error) { if (turn === generation) notice.textContent = safeReadMessage(error); }
    finally { if (turn === generation) { listBusy = false; search.disabled = false; rows.setAttribute("aria-busy", "false"); } }
  }

  function inputFor(field, content) {
    let input;
    const choices = field === domain.category ? domain.categories : field === "district" ? ["ban_ta_khun", "khiri_rat_nikhom", "phanom"] : null;
    if (choices) { input = node("select"); append(input, option("", "เลือก…")); choices.forEach(c => append(input, option(c, model.categoryLabels[c] || ({ban_ta_khun:"บ้านตาขุน",khiri_rat_nikhom:"คีรีรัฐนิคม",phanom:"พนม"})[c] || c))); }
    else if (field.startsWith("description_")) input = node("textarea");
    else if (field === "related_place_id") { input = node("select"); append(input, option("", "ไม่เชื่อมโยงสถานที่")); if (content[field]) append(input, option(content[field], content[field] + " (ค่าปัจจุบัน)")); }
    else { input = node("input"); input.type = field === "is_featured" ? "checkbox" : ["latitude","longitude","sort_order"].includes(field) ? "number" : "text"; }
    if (input.type === "checkbox") input.checked = content[field] === true;
    else input.value = content[field] === undefined ? "" : String(content[field]);
    if (["latitude","longitude","sort_order"].includes(field)) { input.step = field === "sort_order" ? "1" : "any"; input.min = field === "latitude" ? "-90" : field === "longitude" ? "-180" : "0"; if(field !== "sort_order") input.max = field === "latitude" ? "90" : "180"; }
    if (field === "event_date") input.placeholder = "YYYY-MM-DD เช่น 2028-02-29";
    if (field === "start_time" || field === "end_time") input.placeholder = "HH:mm เช่น 09:30";
    input.required = domain.required.includes(field); input.maxLength = field.endsWith("_url") ? 2048 : 20000;
    input.addEventListener("input", () => { dirty = true; }); input.addEventListener("change", () => { dirty = true; });
    return input;
  }

  function placePicker(parent, turn) {
    let placePage = 1, busy = false;
    const search = node("input"); search.type = "search"; search.maxLength = 200;
    const notice = statusNode(), controls = node("div", undefined, "content-toolbar");
    async function load(reset) {
      if (busy || controller.state.busy) return; if (reset) placePage = 1; busy = true; find.disabled = true; more.disabled = true;
      try {
        const result = await global.TakhunAdminApi.getPlaces(token, {keyword: search.value.trim(), status: "all", page: placePage, page_size: 20});
        if (turn !== generation) return;
        if (controller.state.busy) return;
        const select = fields.related_place_id, current = select.value;
        select.replaceChildren(option("", "ไม่เชื่อมโยงสถานที่")); if (current) append(select, option(current, current + " (ค่าปัจจุบัน)"));
        result.items.filter(p => ["draft","published"].includes(p.status) && p.place_id !== current).forEach(p => append(select, option(p.place_id, `${p.name_th || p.place_id} · ${model.statuses[p.status]}`)));
        select.value = current; notice.textContent = `หน้าสถานที่ ${placePage} จาก ${result.total_pages} · เผยแพร่ได้เมื่อสถานที่ที่เชื่อมโยงเผยแพร่แล้วเท่านั้น`;
        more.disabled = placePage >= result.total_pages;
      } catch(error) { if(turn === generation) notice.textContent = safeReadMessage(error); }
      finally { busy = false; find.disabled = false; }
    }
    const find = button("ค้นหาสถานที่", () => load(true)), more = button("สถานที่หน้าถัดไป", () => { placePage++; return load(false); }); more.disabled = true;
    search.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault(); event.stopPropagation(); return load(true);
    });
    append(controls, find, more); append(parent, labelled("ค้นหาสถานที่ที่เชื่อมโยง", search, "content-place-search"), controls, notice);
  }

  function renderEditor() {
    const turn = generation, record = controller.state.record, content = record && record.content || {};
    fields = {}; fieldErrors = {}; editorButtons = []; host.replaceChildren();
    const heading = node("h2", record ? "รายละเอียด / แก้ไขรายการ" : "เพิ่มรายการฉบับร่าง"); heading.tabIndex = -1;
    const back = button("กลับรายการ", showList); editorButtons.push(back);
    append(host, heading, back);
    if (record) append(host, node("p", record[domain.id], "content-id"), badge(record.status));
    if(record && createUncertain) { const reconcileFound = button("ยืนยันว่าเป็นรายการที่สร้างไว้แล้ว", () => {
      if(controller.state.busy) return;
      if(global.confirm("ตรวจสอบรายละเอียดแล้วว่ารายการนี้คือผลการสร้างครั้งก่อนใช่หรือไม่?")) { marker(false); reconcileFound.hidden = true; }
    }); append(host, reconcileFound); }
    append(host, node("p", "ช่องที่มี * จำเป็นต้องกรอก · การแก้ไขรายการที่เผยแพร่แล้วมีผลต่อเว็บไซต์ทันที"));
    editorStatus = statusNode(); append(host, editorStatus);
    editorForm = node("form", undefined, "content-editor"); editorForm.noValidate = true;
    const grid = node("div", undefined, "content-grid");
    for (const field of domain.fields) {
      const input = inputFor(field, content), id = "content-field-" + field;
      const wrap = labelled((model.labels[field] || field) + (domain.required.includes(field) ? " *" : ""), input, id);
      const error = node("p", "", "content-field-error"); error.id = id + "-error"; input.setAttribute("aria-describedby", error.id); append(wrap, error); append(grid, wrap); fields[field] = input; fieldErrors[field] = error;
    }
    append(editorForm, grid);
    if (writer() && (!record || ["draft","published","hidden"].includes(record.status))) placePicker(editorForm, turn);
    const controls = node("div", undefined, "content-toolbar");
    if (writer() && (!record || ["draft","published","hidden"].includes(record.status))) {
      const save = node("button", record ? "บันทึกการแก้ไข" : "บันทึกฉบับร่าง", "button"); save.type = "submit"; editorButtons.push(save); append(controls, save);
    }
    if (writer() && record) for (const next of model.transitions[record.status]) {
      const action = button(model.actions[next], () => mutate(null, next)); editorButtons.push(action); append(controls, action);
    }
    if (record) { const reload = button("โหลดข้อมูลล่าสุด", async () => {
      if(controller.state.busy || dirty && !global.confirm("โหลดข้อมูลล่าสุดจะทิ้งค่าที่ยังไม่บันทึก ต้องการดำเนินการหรือไม่?")) return;
      const pending = controller.load(record[domain.id]); syncEditor(); const loaded = await pending;
      if (loaded) { dirty = false; renderEditor(); } else syncEditor();
    }); reload.setAttribute("data-reconcile", "true"); editorButtons.push(reload); append(controls,reload); }
    editorForm.addEventListener("submit", e => { e.preventDefault(); return mutate(readValues()); });
    append(editorForm, controls); append(host, editorForm); syncEditor(); heading.focus();
  }
  function readValues() { const values = {}; domain.fields.forEach(f => { values[f] = f === "is_featured" ? fields[f].checked : fields[f].value; }); return values; }
  function syncEditor() {
    const s = controller.state, editable = writer() && (!s.record || ["draft","published","hidden"].includes(s.record.status));
    Object.values(fields).forEach(e => { e.disabled = !editable || s.busy; });
    editorButtons.forEach(e => { e.disabled = s.busy || s.blocked && e.textContent !== "กลับรายการ" && e.getAttribute("data-reconcile") !== "true"; });
    editorForm.setAttribute("aria-busy", String(s.busy));
    editorStatus.textContent = s.busy ? "กำลังดำเนินการ กรุณารอ…" : s.message || (s.auditWarning ? "บันทึกข้อมูลแล้ว แต่ยังยืนยันประวัติการทำรายการไม่ได้ ไม่ต้องบันทึกซ้ำ" : "");
  }
  async function mutate(values, next) {
    if (controller.state.busy || controller.state.blocked || !writer()) return;
    let content = null;
    if (values) {
      const checked = model.validate(kind, values); let first;
      domain.fields.forEach(f => {
        const malformedNumber = fields[f].type === "number" && fields[f].validity && fields[f].validity.badInput;
        const error = malformedNumber ? "กรุณากรอกตัวเลขให้ถูกต้อง หรือเว้นว่าง" : checked.errors[f] || "";
        fieldErrors[f].textContent = error; fields[f].setAttribute("aria-invalid", String(!!error)); if(error && !first) first = fields[f];
      });
      if(first) { editorStatus.textContent = "กรุณาตรวจสอบช่องที่ระบุ"; first.focus(); return; } content = checked.content;
    } else {
      if(dirty) { editorStatus.textContent = "มีค่าที่ยังไม่บันทึก กรุณาบันทึกหรือโหลดข้อมูลล่าสุดก่อนเปลี่ยนสถานะ"; return; }
      if(!global.confirm(`ยืนยัน${model.actions[next]}รายการนี้? ข้อมูลจะยังคงเก็บไว้ในระบบ`)) return;
    }
    const creating = !controller.state.record;
    // Persist before dispatch: reload during an in-flight create must still require reconciliation.
    if(creating && !marker(true)) { editorStatus.textContent = "เบราว์เซอร์ไม่สามารถเก็บสถานะการสร้างได้ กรุณาเปิดใช้พื้นที่จัดเก็บก่อนสร้างรายการ"; return; }
    const pending = controller.mutate(content, next); syncEditor(); const succeeded = await pending;
    if(creating && !controller.state.unknown) marker(false);
    if(creating && controller.state.unknown) marker(true);
    if(succeeded) { dirty = false; renderEditor(); }
    syncEditor();
  }
  async function openEditor(id) {
    if(!mayLeave() || !id && createUncertain) return;
    const turn = ++generation; currentView = "editor"; listBusy = false; dirty = false; newController();
    if(id) {
      host.replaceChildren(statusNode()); host.children[0].textContent = "กำลังโหลดรายละเอียด…";
      await controller.load(id); if(turn !== generation) return;
      if(!controller.state.record) { host.replaceChildren(node("p", controller.state.message || "โหลดรายละเอียดไม่สำเร็จ"), button("กลับรายการ", showList), button("ลองโหลดใหม่", () => openEditor(id))); return; }
    }
    renderEditor(); if(controller.state.record) editorForm.setAttribute("data-revision", controller.state.record.revision);
  }
  async function complete(result) {
    if(bound) return; const session = global.TakhunAdminAuth.readSession(); if(!session || !session.token) return;
    bound = true; token = session.token; role = result.admin && result.admin.role || session.role; model = global.TakhunAdminContentModel;
    kind = global.document.body.dataset.adminPage; domain = model.domains[kind]; if(!domain) return;
    host = global.document.querySelector("[data-admin-content]"); host.className = "admin-content-manager";
    try { createUncertain = global.sessionStorage.getItem("takhun-content-uncertain-" + kind) === "1"; } catch(_storage) { /* No persisted guard available. */ }
    newController(); global.addEventListener("beforeunload", e => { if(dirty || controller.state.busy) { e.preventDefault(); e.returnValue = ""; } });
    return showList();
  }
  async function init() {
    const result = await global.TakhunAdminShell.init(); if(result && result.status === "authenticated") return complete(result);
    if(typeof global.MutationObserver === "function") { const observer = new global.MutationObserver(() => { if(global.document.body.classList.contains("admin-authenticated")) { observer.disconnect(); complete({admin:{}}); } }); observer.observe(global.document.body,{attributes:true,attributeFilter:["class"]}); }
  }
  global.TakhunAdminContentUI = Object.freeze({init});
})(window);
