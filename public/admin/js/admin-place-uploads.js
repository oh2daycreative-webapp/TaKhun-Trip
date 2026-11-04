"use strict";

// Admin place edit page: uploaded photos (spec v5.2, task 11). Separate from the draft form: uploads, order, cover,
// captions and deletes are live at once (D6, D20). Shown only to super_admin/editor (server can_write). One action at a
// time; photos upload one by one with a status each. An unsure result ("ไม่แน่ใจผล") reloads the list and is never
// sent again automatically. Upload is hidden when the switch is off (D11) or the place is archived; delete stays.
(function createAdminPlaceUploads(global) {
  const IMAGE_REASON_MESSAGES = Object.freeze({
    format: "ไฟล์ต้องเป็นรูป WebP หรือ JPEG",
    exif: "รูปยังมีข้อมูลแฝง (EXIF/GPS) กรุณาเลือกรูปใหม่",
    width: "รูปต้องกว้างอย่างน้อย 1000 px",
    aspect: "รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด",
    size: "ไฟล์รูปใหญ่เกินกำหนด",
    mismatch: "ไฟล์รูปไม่ตรงกัน กรุณาเลือกรูปใหม่"
  });
  const ERROR_MESSAGES = Object.freeze({
    UPLOAD_DISABLED: "ปิดการอัปโหลดรูปอยู่ในขณะนี้",
    LIMIT_PLACE: "สถานที่นี้มีรูปครบ 20 รูปแล้ว ลบรูปเดิมก่อนจึงจะเพิ่มได้",
    LIMIT_DAILY: "วันนี้อัปโหลดรูปครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่พรุ่งนี้",
    STORAGE_ERROR: "ไม่ได้บันทึกข้อมูล: เชื่อมต่อที่เก็บรูปไม่สำเร็จ",
    BUSY: "ไม่ได้บันทึกข้อมูล: ระบบกำลังบันทึกงานอื่น กรุณาลองใหม่อีกครั้ง",
    CONFLICT: "รายการรูปถูกแก้ไขจากที่อื่น กรุณาโหลดรายการล่าสุด",
    NOT_FOUND: "ไม่พบสถานที่หรือรูปนี้ กรุณาโหลดรายการใหม่",
    FORBIDDEN: "คุณไม่มีสิทธิ์จัดการรูปของสถานที่นี้",
    UNAUTHORIZED: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง กรุณาโหลดหน้าใหม่"
  });
  const DEFAULT_ERROR = "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่";
  const UNCERTAIN = Object.freeze(["TIMEOUT", "NETWORK_ERROR", "HTTP_ERROR", "MALFORMED_RESPONSE", "REDIRECT_BOUNCE", "OUTCOME_UNKNOWN"]);
  const UNCERTAIN_UPLOAD = "ไม่แน่ใจผล · โหลดรายการรูปใหม่แล้ว ถ้ารูปยังไม่ขึ้นในรายการ เลือกรูปเดิมอีกครั้งได้ ระบบจะไม่สร้างรูปซ้ำ (ระบบไม่ส่งซ้ำเอง)";
  const UNCERTAIN_CHANGE = "ไม่แน่ใจผล · โหลดรายการรูปใหม่แล้ว กรุณาตรวจรายการก่อนทำต่อ (ระบบไม่ส่งซ้ำเอง)";
  const AUDIT_WARNING = "บันทึกแล้ว แต่ยืนยันบันทึกประวัติ (activity log) ไม่ได้ กรุณาแจ้งผู้ดูแลระบบ";
  const FILES_WARNING = "บันทึกรูปแล้ว แต่ตรวจยืนยันไฟล์ในที่เก็บรูปไม่ได้ กรุณาเปิดดูรูปนี้บนเว็บ";
  const STATUS = Object.freeze({
    queued: "รอคิว", resizing: "กำลังย่อรูป", uploading: "กำลังอัปโหลด", done: "อัปโหลดแล้ว", duplicate: "มีรูปนี้อยู่แล้ว",
    failed: "ไม่สำเร็จ", uncertain: "ไม่แน่ใจผล", skipped: "ยังไม่ได้ส่ง"
  });
  const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
  const KEY_PATTERN = /^uploads\/places\/[a-z0-9][a-z0-9-]{0,63}\/[a-f0-9]{32}-(?:800|1600)\.(?:webp|jpg)$/;

  function make(tag, className, text) {
    const node = global.document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, className, label) {
    const node = make("button", "button " + (className || ""), text);
    node.type = "button";
    if (label) node.setAttribute("aria-label", label);
    return node;
  }

  function safeOrigin(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : "";
    } catch (_error) { return ""; }
  }

  const errorMessage = (error) => error && error.code === "IMAGE_REJECTED"
    ? IMAGE_REASON_MESSAGES[error.reason] || IMAGE_REASON_MESSAGES.format
    : ERROR_MESSAGES[error && error.code] || DEFAULT_ERROR;
  const isUncertain = (error) => Boolean(error && UNCERTAIN.includes(error.code));
  const captionLength = (text) => Array.from(String(text)).length;
  // D24 condition 2 (spec v5.3): on a phone, a failed round also says to use a computer. Not for refusals a computer
  // would not change (file rules, limits, switch off, rights, conflict).
  const PHONE_HINT = "ถ้าอัปโหลดจากมือถือไม่ได้ ให้ใช้คอมพิวเตอร์";
  const NOT_DEVICE_CODES = Object.freeze(["FILE_TYPE", "FILE_SIZE", "WIDTH", "ASPECT", "ROOM", "LIMIT_PLACE", "LIMIT_DAILY", "UPLOAD_DISABLED", "FORBIDDEN", "UNAUTHORIZED", "CONFLICT"]);
  function isPhone() {
    const nav = global.navigator || {};
    if (nav.userAgentData && typeof nav.userAgentData.mobile === "boolean" && nav.userAgentData.mobile) return true;
    const ua = String(nav.userAgent || "");
    return /Android|iPhone|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1);
  }
  // Every caught error is logged with its code only (never the token or file contents), so a failure is visible in
  // the browser console (task 11 live bug: a valid response was shown as an error with nothing in the console).
  function logError(step, error) {
    const code = error && typeof error.code === "string" ? error.code : error && error.name ? error.name : "ERROR";
    const reason = error && typeof error.reason === "string" ? " (" + error.reason + ")" : "";
    if (global.console && typeof global.console.warn === "function") global.console.warn("[place uploads] " + step + ": " + code + reason);
  }

  function init(options) {
    const root = options.root;
    const api = options.api;
    const resize = options.resize;
    const token = options.token;
    const placeId = options.placeId;
    const confirmFn = options.confirm || ((text) => global.confirm(text));
    const mediaOrigin = safeOrigin(options.mediaOrigin);
    const state = {
      archived: options.archived === true, loaded: false, enabled: false, canWrite: false, limits: null,
      items: [], order: [], cover: null, captions: {}, deletePending: 0,
      busy: false, loading: false, conflict: false, queue: [], warnings: [], previews: {}, readError: false
    };

    // ---- DOM ----
    root.replaceChildren();
    root.classList.add("admin-uploads");
    const title = make("h2", "", "รูปภาพที่อัปโหลด");
    title.id = "admin-uploads-title";
    root.setAttribute("aria-labelledby", title.id);
    const help = make("p", "admin-uploads__help", "รูปขึ้นเว็บทันทีที่อัปโหลดหรือบันทึก (ไม่ผ่านแบบร่าง) · สูงสุด 20 รูป · กว้างอย่างน้อย 1000 px · ไฟล์ไม่เกิน 20 MB · ห้ามใส่ข้อมูลส่วนบุคคลในคำบรรยาย");
    // Result box (owner UX round): coloured box + icon (not colour alone), right above the photo list, kept until the
    // next action, announced to screen readers. Tones: ok ✓ / warn ⚠ / error ✕ / info ℹ (progress).
    const status = make("div", "admin-uploads__result");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.setAttribute("aria-atomic", "true");
    status.hidden = true;
    const statusIcon = make("span", "admin-uploads__result-icon");
    statusIcon.setAttribute("aria-hidden", "true");
    const statusText = make("span", "admin-uploads__result-text");
    const statusHint = make("span", "admin-uploads__result-hint", PHONE_HINT);
    statusHint.hidden = true;
    status.append(statusIcon, statusText, statusHint);
    const alert = make("div", "admin-uploads__alert");
    alert.setAttribute("role", "alert"); alert.hidden = true;
    const notice = make("p", "admin-uploads__notice"); notice.hidden = true;
    const uploadBox = make("div", "admin-uploads__picker");
    const pickLabel = make("label", "button admin-uploads__pick", "เลือกรูปเพื่ออัปโหลด");
    const input = make("input");
    input.type = "file"; input.multiple = true; input.accept = ACCEPT; input.className = "admin-uploads__input";
    pickLabel.append(input);
    const quota = make("p", "admin-uploads__quota");
    uploadBox.append(pickLabel, quota);
    const queueList = make("ol", "admin-uploads__queue");
    queueList.setAttribute("aria-label", "สถานะการอัปโหลด"); queueList.hidden = true;
    const pendingBox = make("div", "admin-uploads__pending"); pendingBox.hidden = true;
    const pendingText = make("p");
    const retryButton = button("ลองลบไฟล์อีกครั้ง", "admin-uploads__retry");
    pendingBox.append(pendingText, retryButton);
    const conflictBox = make("div", "admin-uploads__conflict"); conflictBox.hidden = true;
    conflictBox.setAttribute("role", "alert");
    const reloadButton = button("โหลดรายการล่าสุด", "admin-uploads__reload");
    conflictBox.append(make("p", "", ERROR_MESSAGES.CONFLICT), reloadButton);
    const readErrorBox = make("div", "admin-uploads__read-error"); readErrorBox.hidden = true;
    const readRetry = button("ลองโหลดอีกครั้ง");
    readErrorBox.append(readRetry);
    const noCover = make("label", "admin-uploads__no-cover");
    const noCoverInput = make("input"); noCoverInput.type = "radio"; noCoverInput.name = "admin-uploads-cover"; noCoverInput.value = "";
    noCover.append(noCoverInput, make("span", "", " ไม่ใช้รูปที่อัปโหลดเป็นรูปปก (ใช้รูปปกเดิม)"));
    const list = make("ol", "admin-uploads__list");
    list.setAttribute("aria-label", "รูปที่อัปโหลด ตามลำดับที่แสดงบนเว็บ");
    const empty = make("p", "admin-uploads__empty", "ยังไม่มีรูปที่อัปโหลด");
    const saveBar = make("div", "admin-uploads__savebar"); saveBar.hidden = true;
    const saveButton = button("บันทึกลำดับ รูปปก และคำบรรยาย", "admin-uploads__save");
    const discardButton = button("ยกเลิกการแก้ไข", "admin-uploads__discard");
    saveBar.append(make("p", "", "มีการแก้ไขลำดับ รูปปก หรือคำบรรยายที่ยังไม่บันทึก (อัปโหลดและลบได้หลังบันทึกหรือยกเลิก)"), saveButton, discardButton);
    root.append(title, help, notice, readErrorBox, uploadBox, status, alert, queueList, pendingBox, conflictBox, noCover, list, empty, saveBar);

    // ---- model helpers ----
    const serverIds = () => state.items.map((item) => item.upload_id);
    const byId = (id) => state.items.find((item) => item.upload_id === id);
    const serverCover = () => { const cover = state.items.find((item) => item.is_cover); return cover ? cover.upload_id : null; };
    function resetLocal() {
      state.order = serverIds();
      state.cover = serverCover();
      state.captions = {};
      state.items.forEach((item) => { state.captions[item.upload_id] = { th: item.caption_th, en: item.caption_en }; });
    }
    function dirty() {
      if (state.order.join(",") !== serverIds().join(",") || state.cover !== serverCover()) return true;
      return state.items.some((item) => { const c = state.captions[item.upload_id]; return c && (c.th !== item.caption_th || c.en !== item.caption_en); });
    }
    const canUpload = () => state.enabled && !state.archived && !state.conflict;
    const canEdit = () => !state.archived && !state.conflict;
    const ICONS = { ok: "✓", warn: "⚠", error: "✕", info: "ℹ" };
    function say(text, tone, hint) {
      const kind = ICONS[tone] ? tone : "info";
      statusText.textContent = text || "";
      statusHint.hidden = !(text && hint === true);
      statusIcon.textContent = text ? ICONS[kind] : "";
      status.dataset.tone = text ? kind : "";
      status.className = "admin-uploads__result" + (text ? " admin-uploads__result--" + kind : "");
      status.hidden = !text;
    }
    function warn(text) {
      if (!state.warnings.includes(text)) state.warnings.push(text);
      alert.replaceChildren(...state.warnings.map((entry) => make("p", "", entry)));
      alert.hidden = false;
    }
    // The per-photo lines belong to one upload round; any new action starts with an empty list (owner polish).
    function clearQueue() { state.queue = []; renderQueue(); }
    function clearWarnings() { state.warnings = []; alert.replaceChildren(); alert.hidden = true; }
    function applyList(data) {
      state.loaded = true; state.readError = false;
      state.enabled = data.enabled; state.canWrite = data.can_write; state.limits = data.limits;
      state.items = data.items.slice().sort((a, b) => a.sort_order - b.sort_order);
      state.deletePending = data.delete_pending; state.conflict = false;
      resetLocal();
    }
    function thumbnail(item) {
      if (state.previews[item.upload_id]) return state.previews[item.upload_id];
      return mediaOrigin && KEY_PATTERN.test(item.key_small) ? mediaOrigin + "/" + item.key_small : "";
    }

    // ---- rendering ----
    function renderQueue() {
      queueList.hidden = state.queue.length === 0;
      queueList.replaceChildren(...state.queue.map((entry) => {
        const li = make("li", "admin-uploads__queue-item admin-uploads__queue-item--" + entry.state);
        li.append(make("span", "admin-uploads__queue-name", entry.name), make("span", "admin-uploads__queue-state", STATUS[entry.state] + (entry.detail ? ": " + entry.detail : "")));
        return li;
      }));
    }
    function renderControls() {
      const isDirty = dirty();
      root.setAttribute("aria-busy", state.busy ? "true" : "false");
      readErrorBox.hidden = !state.readError;
      notice.hidden = !(state.archived || (state.loaded && !state.enabled));
      notice.textContent = state.archived ? "สถานที่นี้เก็บถาวรแล้ว อัปโหลดและแก้ลำดับไม่ได้ แต่ลบรูปได้" : "ปิดการอัปโหลดรูปอยู่ในขณะนี้ (ยังลบ เรียงลำดับ เปลี่ยนรูปปก และแก้คำบรรยายได้)";
      uploadBox.hidden = !state.loaded || !canUpload();
      input.disabled = state.busy || isDirty;
      pickLabel.classList.toggle("is-disabled", input.disabled);
      if (state.limits) {
        const left = Math.max(0, state.limits.per_place - state.items.length);
        quota.textContent = `เพิ่มได้อีก ${left} รูป · วันนี้อัปโหลดได้อีก ${state.limits.daily_left} รูป`;
      }
      pendingBox.hidden = state.deletePending === 0;
      pendingText.textContent = `ไฟล์ของรูปที่ลบแล้ว ${state.deletePending} รายการ ยังลบออกจากที่เก็บรูปไม่สำเร็จ (รูปไม่แสดงบนเว็บแล้ว)`;
      retryButton.disabled = state.busy;
      conflictBox.hidden = !state.conflict;
      reloadButton.disabled = state.busy;
      saveBar.hidden = !isDirty || state.conflict;
      saveButton.disabled = state.busy || !canEdit();
      discardButton.disabled = state.busy;
      noCover.hidden = !state.loaded || state.items.length === 0;
      noCoverInput.checked = state.cover === null;
      noCoverInput.disabled = state.busy || !canEdit();
      list.querySelectorAll("button, input").forEach((control) => {
        const role = control.dataset.role;
        if (role === "delete") control.disabled = state.busy || isDirty;
        else if (role === "up") control.disabled = state.busy || !canEdit() || control.dataset.first === "true";
        else if (role === "down") control.disabled = state.busy || !canEdit() || control.dataset.last === "true";
        else control.disabled = state.busy || !canEdit();
      });
    }
    function render(focus) {
      empty.hidden = !state.loaded || state.order.length > 0;
      list.replaceChildren(...state.order.map((id, index) => {
        const item = byId(id);
        const number = index + 1;
        const li = make("li", "admin-uploads__item");
        li.dataset.uploadId = id;
        const figure = make("figure", "admin-uploads__figure");
        const source = thumbnail(item);
        if (source) {
          const image = make("img", "admin-uploads__thumb");
          image.src = source; image.loading = "lazy"; image.decoding = "async";
          image.width = item.width_small; image.height = item.height_small;
          image.alt = (state.captions[id] && state.captions[id].th) || `รูปที่ ${number}`;
          figure.append(image);
        } else {
          figure.append(make("div", "admin-uploads__thumb admin-uploads__thumb--none", "ไม่มีตัวอย่างรูป"));
        }
        figure.append(make("figcaption", "", `รูปที่ ${number} · ${item.width_large}×${item.height_large} · ${item.format === "jpeg" ? "JPEG" : "WebP"}`));
        const coverLabel = make("label", "admin-uploads__cover");
        const coverInput = make("input");
        coverInput.type = "radio"; coverInput.name = "admin-uploads-cover"; coverInput.value = id; coverInput.checked = state.cover === id;
        coverInput.dataset.role = "cover";
        coverLabel.append(coverInput, make("span", "", " ใช้เป็นรูปปก"));
        const fields = make("div", "admin-uploads__captions");
        for (const [lang, labelText] of [["th", "คำบรรยาย (ไทย)"], ["en", "Caption (English)"]]) {
          const label = make("label", "", labelText);
          const field = make("input");
          field.type = "text"; field.maxLength = 200; field.value = state.captions[id] ? state.captions[id][lang] : "";
          field.dataset.role = "caption"; field.dataset.lang = lang;
          field.setAttribute("aria-label", `${labelText} รูปที่ ${number}`);
          field.addEventListener("input", () => { state.captions[id][lang] = field.value; renderControls(); });
          label.append(field);
          fields.append(label);
        }
        const actions = make("div", "admin-uploads__actions");
        const up = button("ขึ้น", "admin-uploads__up", `เลื่อนรูปที่ ${number} ขึ้น`);
        up.dataset.role = "up"; up.dataset.first = String(index === 0);
        const down = button("ลง", "admin-uploads__down", `เลื่อนรูปที่ ${number} ลง`);
        down.dataset.role = "down"; down.dataset.last = String(index === state.order.length - 1);
        const remove = button("ลบ", "admin-uploads__delete", `ลบรูปที่ ${number}`);
        remove.dataset.role = "delete";
        up.addEventListener("click", () => move(id, -1, "up"));
        down.addEventListener("click", () => move(id, 1, "down"));
        remove.addEventListener("click", () => removeItem(id));
        coverInput.addEventListener("change", () => { if (coverInput.checked) { state.cover = id; renderControls(); } });
        actions.append(up, down, remove);
        li.append(figure, coverLabel, fields, actions);
        return li;
      }));
      renderControls();
      if (focus) {
        const target = list.querySelector(`li[data-upload-id="${focus.id}"] [data-role="${focus.role}"]`);
        const fallback = list.querySelector(`li[data-upload-id="${focus.id}"] [data-role="${focus.role === "up" ? "down" : "up"}"]`);
        const node = target && !target.disabled ? target : fallback;
        if (node && typeof node.focus === "function") node.focus();
      }
    }

    // ---- actions ----
    async function load(message, tone, hint) {
      if (state.loading) return false;
      state.loading = true;
      readRetry.disabled = true;
      say("กำลังโหลดรายการรูป", "info");
      try {
        const data = await api.getPlaceUploads(token, { place_id: placeId });
        if (!data.can_write) { root.hidden = true; return false; }
        applyList(data);
        root.hidden = false;
        if (message) say(message, tone || "ok", hint);
      } catch (error) {
        logError("load", error);
        state.readError = true;
        root.hidden = false;
        say("โหลดรายการรูปไม่สำเร็จ · " + errorMessage(error), "error");
      } finally {
        state.loading = false;
        readRetry.disabled = false;
      }
      if (state.loaded && !state.readError && !message) say("");
      render();
      return state.loaded && !state.readError;
    }

    async function reloadAfterUncertain(text, hint) {
      warn(text);
      await load(STATUS.uncertain, "warn", hint);
    }

    function move(id, step, role) {
      if (state.busy || !canEdit()) return;
      const index = state.order.indexOf(id);
      const target = index + step;
      if (index < 0 || target < 0 || target >= state.order.length) return;
      state.order.splice(index, 1);
      state.order.splice(target, 0, id);
      say(`ย้ายรูปไปเป็นลำดับที่ ${target + 1} แล้ว (ยังไม่บันทึก)`, "info");
      render({ id, role });
    }

    function captionsPayload() {
      const result = {};
      for (const id of state.order) {
        const caption = state.captions[id];
        const th = caption.th.trim(), en = caption.en.trim();
        if (captionLength(th) > 200 || captionLength(en) > 200) return null;
        result[id] = { th, en };
      }
      return result;
    }

    async function save() {
      if (state.busy || !canEdit() || !dirty()) return;
      const captions = captionsPayload();
      if (!captions) { say("คำบรรยายยาวเกิน 200 ตัวอักษร", "error"); return; }
      state.busy = true; clearWarnings(); clearQueue(); say("กำลังบันทึก", "info"); renderControls();
      try {
        const result = await api.savePlaceUploads(token, { place_id: placeId, expected_ids: serverIds(), order: state.order.slice(), cover_id: state.cover, captions });
        state.items = result.items.slice().sort((a, b) => a.sort_order - b.sort_order);
        resetLocal();
        say("บันทึกลำดับ รูปปก และคำบรรยายแล้ว", "ok");
        if (result.audit_status === "unconfirmed") warn(AUDIT_WARNING);
        state.busy = false; render();
      } catch (error) {
        logError("save", error);
        state.busy = false;
        if (error && error.code === "CONFLICT") { state.conflict = true; say(ERROR_MESSAGES.CONFLICT, "warn"); render(); }
        else if (isUncertain(error)) { say(STATUS.uncertain, "warn"); await reloadAfterUncertain(UNCERTAIN_CHANGE); }
        else { say(errorMessage(error), "error"); renderControls(); }
      }
    }

    function discard() {
      if (state.busy) return;
      resetLocal();
      clearQueue();
      say("ยกเลิกการแก้ไขแล้ว", "info");
      render();
    }

    async function removeItem(id) {
      if (state.busy || dirty()) return;
      const index = state.order.indexOf(id);
      if (index < 0 || !confirmFn(`ลบรูปที่ ${index + 1} ออกจากเว็บไซต์และที่เก็บรูป? การลบย้อนกลับไม่ได้`)) return;
      state.busy = true; clearWarnings(); clearQueue(); say("กำลังลบรูป", "info"); renderControls();
      try {
        const result = await api.deletePlaceUpload(token, { place_id: placeId, upload_id: id, expected_ids: serverIds() });
        state.items = state.items.filter((item) => item.upload_id !== id);
        if (state.previews[id] && global.URL && global.URL.revokeObjectURL) global.URL.revokeObjectURL(state.previews[id]);
        delete state.previews[id];
        resetLocal();
        if (!result.file_deleted) { state.deletePending += 1; say("ลบรูปออกจากเว็บแล้ว แต่ลบไฟล์ในที่เก็บรูปยังไม่สำเร็จ · กดลองลบไฟล์อีกครั้งได้", "warn"); }
        else say("ลบรูปแล้ว", "ok");
        if (result.audit_status === "unconfirmed") warn(AUDIT_WARNING);
        state.busy = false; render();
      } catch (error) {
        logError("delete", error);
        state.busy = false;
        if (error && error.code === "CONFLICT") { state.conflict = true; say(ERROR_MESSAGES.CONFLICT, "warn"); render(); }
        else if (isUncertain(error)) { say(STATUS.uncertain, "warn"); await reloadAfterUncertain(UNCERTAIN_CHANGE); }
        else { say(errorMessage(error), "error"); renderControls(); }
      }
    }

    async function retryDeletes() {
      if (state.busy) return;
      state.busy = true; clearQueue(); say("กำลังลองลบไฟล์อีกครั้ง", "info"); renderControls();
      try {
        const result = await api.retryPlaceUploadDeletes(token, { place_id: placeId });
        state.deletePending = result.still_pending;
        say(result.still_pending ? `ยังลบไฟล์ไม่สำเร็จ ${result.still_pending} รายการ กรุณาลองใหม่ภายหลัง` : "ลบไฟล์ที่ค้างอยู่ครบแล้ว", result.still_pending ? "warn" : "ok");
      } catch (error) {
        logError("retry deletes", error);
        say(isUncertain(error) ? "ไม่แน่ใจผล กรุณาโหลดรายการใหม่" : errorMessage(error), isUncertain(error) ? "warn" : "error");
      }
      state.busy = false; renderControls();
    }

    async function uploadOne(entry) {
      entry.state = "resizing"; entry.detail = ""; renderQueue();
      let prepared;
      try { prepared = await resize.prepare(entry.file); }
      catch (error) { logError("resize", error); entry.state = "failed"; entry.code = error && error.code || "DECODE"; entry.detail = error && error.message || resize.MESSAGES.DECODE; renderQueue(); return "next"; }
      const megabytes = ((prepared.large.bytes.length + prepared.small.bytes.length) / 1048576).toFixed(1);
      entry.state = "uploading"; entry.detail = `${megabytes} MB อาจใช้เวลาถึง 1 นาที`; renderQueue();
      say(`กำลังอัปโหลด ${entry.name}`, "info");
      try {
        const result = await api.uploadPlaceImage(token, { place_id: placeId, format: prepared.format, large_b64: resize.toBase64(prepared.large.bytes), small_b64: resize.toBase64(prepared.small.bytes) });
        const item = result.item;
        if (!byId(item.upload_id)) {
          state.items.push(item);
          state.order.push(item.upload_id);
          state.captions[item.upload_id] = { th: item.caption_th, en: item.caption_en };
          if (global.URL && typeof global.URL.createObjectURL === "function" && global.Blob) {
            state.previews[item.upload_id] = global.URL.createObjectURL(new global.Blob([prepared.small.bytes], { type: "image/" + prepared.format }));
          }
        }
        if (!result.duplicate && state.limits) state.limits.daily_left = Math.max(0, state.limits.daily_left - 1);
        entry.state = result.duplicate ? "duplicate" : "done"; entry.detail = "";
        if (result.audit_status === "unconfirmed") warn(AUDIT_WARNING);
        if (result.files_verified === false) warn(FILES_WARNING);
        renderQueue(); render();
        return "next";
      } catch (error) {
        logError("upload", error);
        if (isUncertain(error)) { entry.state = "uncertain"; entry.code = error.code; entry.detail = ""; renderQueue(); return "uncertain"; }
        entry.state = "failed"; entry.code = error && error.code || "SERVER_ERROR"; entry.detail = errorMessage(error); renderQueue();
        return error && error.code === "IMAGE_REJECTED" ? "next" : error && error.code === "CONFLICT" ? "conflict" : "stop";
      }
    }

    // Duplicates are counted apart from uploads (owner: "0 จาก 1" read like a failure).
    function uploadSummary(queue) {
      const count = (name) => queue.filter((entry) => entry.state === name).length;
      const done = count("done"), duplicate = count("duplicate"), failed = count("failed"), skipped = count("skipped");
      const extras = (duplicate ? ` · มีอยู่แล้ว ${duplicate} รูป` : "") + (skipped ? ` · ยังไม่ได้ส่ง ${skipped} รูป` : "");
      if (!failed && !skipped) return { text: `อัปโหลดเสร็จ ${done} รูป` + extras, tone: duplicate ? "warn" : "ok" };
      if (!done && !duplicate) {
        const first = queue.find((entry) => entry.state === "failed");
        const reason = failed === 1 && first && first.detail ? `: ${first.detail}` : " (ดูรายการด้านล่าง)";
        return { text: `อัปโหลดไม่สำเร็จ ${failed} รูป${reason}` + (skipped ? ` · ยังไม่ได้ส่ง ${skipped} รูป` : ""), tone: "error" };
      }
      return { text: `อัปโหลดเสร็จ ${done} จาก ${queue.length} รูป` + (failed ? ` · ไม่สำเร็จ ${failed} รูป (ดูรายการด้านล่าง)` : "") + extras, tone: "warn" };
    }

    async function pick(files) {
      if (state.busy || !canUpload() || dirty()) return;
      const picked = Array.from(files || []);
      if (!picked.length) return;
      const room = Math.max(0, state.limits.per_place - state.items.length);
      state.queue = picked.map((file, index) => ({ file, name: String(file.name || `รูปที่ ${index + 1}`), state: index < room ? "queued" : "failed", code: index < room ? "" : "ROOM", detail: index < room ? "" : "เกินจำนวนสูงสุด 20 รูปต่อสถานที่" }));
      state.busy = true; clearWarnings(); renderQueue(); renderControls();
      let outcome = "next";
      for (const entry of state.queue) {
        if (entry.state !== "queued") continue;
        if (outcome !== "next") { entry.state = "skipped"; continue; }
        outcome = await uploadOne(entry);
      }
      state.busy = false;
      renderQueue();
      const hint = isPhone() && state.queue.some((entry) => entry.state === "uncertain" || entry.state === "failed" && !NOT_DEVICE_CODES.includes(entry.code));
      if (outcome === "uncertain") { say(STATUS.uncertain, "warn", hint); await reloadAfterUncertain(UNCERTAIN_UPLOAD, hint); }
      else if (outcome === "conflict") { state.conflict = true; say(ERROR_MESSAGES.CONFLICT, "warn"); render(); }
      else { const summary = uploadSummary(state.queue); say(summary.text, summary.tone, hint); render(); }
      return outcome;
    }

    input.addEventListener("change", () => { const files = input.files; const copy = Array.from(files || []); input.value = ""; pick(copy); });
    saveButton.addEventListener("click", save);
    discardButton.addEventListener("click", discard);
    retryButton.addEventListener("click", retryDeletes);
    reloadButton.addEventListener("click", () => { clearWarnings(); load("โหลดรายการล่าสุดแล้ว", "ok"); });
    readRetry.addEventListener("click", () => load());
    noCoverInput.addEventListener("change", () => { if (noCoverInput.checked) { state.cover = null; renderControls(); } });
    const beforeUnload = (event) => { if (state.busy || dirty()) { event.preventDefault(); event.returnValue = ""; } };
    if (global.addEventListener) global.addEventListener("beforeunload", beforeUnload);

    const controller = {
      load, pick, save, discard, retryDeletes,
      remove: removeItem,
      move: (id, step) => move(id, step, step < 0 ? "up" : "down"),
      setCover: (id) => { if (state.busy || !canEdit()) return; state.cover = id; render(); },
      setCaption: (id, lang, text) => { if (state.captions[id]) { state.captions[id][lang] = text; render(); } },
      snapshot: () => JSON.parse(JSON.stringify({ loaded: state.loaded, enabled: state.enabled, archived: state.archived, items: serverIds(), order: state.order, cover: state.cover,
        dirty: dirty(), busy: state.busy, conflict: state.conflict, deletePending: state.deletePending, warnings: state.warnings, status: statusText.textContent, tone: status.dataset.tone || "",
        queue: state.queue.map((entry) => ({ name: entry.name, state: entry.state, detail: entry.detail })), limits: state.limits }))
    };
    return load().then(() => controller);
  }

  global.TakhunAdminPlaceUploads = Object.freeze({ init, IMAGE_REASON_MESSAGES, ERROR_MESSAGES });
})(typeof window !== "undefined" ? window : globalThis);
