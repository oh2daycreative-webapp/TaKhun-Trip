"use strict";

(function createAdminPlaceMedia(global) {
  const MEDIA_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const MAX_SELECTED = 50;

  function make(tag, className, text) {
    const node = global.document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function validItem(item, placeId, role) {
    return item && typeof item === "object" && !Array.isArray(item) &&
      MEDIA_ID.test(item.media_id || "") && item.entity_type === "place" && item.entity_id === placeId && item.role === role &&
      /^assets\/media\/placeholders\/(?:hero|cover|product|gallery)\.svg$/.test(item.fallback || "") &&
      Array.isArray(item.outputs) && item.outputs.length > 0 && item.outputs.every((output) => output &&
        Number.isSafeInteger(output.width) && output.width > 0 && Number.isSafeInteger(output.height) && output.height > 0 &&
        /^assets\/media\/generated\/[a-z0-9\/_-]+\.webp$/.test(output.path || ""));
  }

  function preview(item, className) {
    const output = item.outputs[item.outputs.length - 1];
    const image = make("img", className);
    image.src = output.path;
    image.width = output.width;
    image.height = output.height;
    image.alt = item.alt_th || item.alt_en || item.media_id;
    image.loading = "lazy";
    return image;
  }

  async function init(options = {}) {
    const mounts = options.mounts || {};
    const root = mounts.root;
    const hero = mounts.hero;
    const availableMount = mounts.options;
    const selectedMount = mounts.selected;
    const status = mounts.status;
    if (!root || !hero || !availableMount || !selectedMount || !status) throw new Error("MEDIA_MOUNTS_REQUIRED");
    const generation = Number(root._takhunAdminPlaceMediaGeneration || 0) + 1;
    root._takhunAdminPlaceMediaGeneration = generation;
    const isCurrent = () => root._takhunAdminPlaceMediaGeneration === generation;
    const placeId = typeof options.placeId === "string" ? options.placeId : "";
    let selected = [];
    let gallery = [];
    let galleryById = Object.create(null);
    let page = 1;
    let totalPages = 0;
    let keyword = "";
    let ready = false;
    let requestGeneration = 0;

    function announce(value) { status.textContent = value; }
    function setSelectorAvailable(available) {
      for (const node of [mounts.searchForm, mounts.previous, mounts.next, mounts.page]) {
        if (node) node.hidden = !available;
      }
      for (const control of [mounts.searchInput, mounts.searchButton, mounts.previous, mounts.next]) {
        if (control) control.disabled = !available;
      }
    }
    function render(focusRequest, actionAnnouncement) {
      availableMount.replaceChildren();
      selectedMount.replaceChildren();
      let focusTarget = null;
      for (const item of gallery) {
        const label = selected.includes(item.media_id) ? `เลือกแล้ว: ${item.alt_th || item.alt_en || item.media_id}` : `เลือก: ${item.alt_th || item.alt_en || item.media_id}`;
        const button = make("button", "admin-place-media__option");
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.disabled = selected.includes(item.media_id) || selected.length >= MAX_SELECTED;
        button.setAttribute("aria-pressed", String(selected.includes(item.media_id)));
        button.addEventListener("click", () => add(item.media_id));
        button.append(preview(item, "admin-place-media__preview"), make("span", "admin-place-media__option-label", label));
        availableMount.append(button);
        if (focusRequest && focusRequest.surface === "options" && focusRequest.mediaId === item.media_id && !button.disabled) focusTarget = button;
      }
      selected.forEach((mediaId, index) => {
        const item = galleryById[mediaId];
        const row = make("li", "admin-place-media__selected-item");
        const label = make("span", "admin-place-media__label", `${index + 1}. ${item ? item.alt_th || item.alt_en || mediaId : mediaId}`);
        const up = make("button", "admin-place-media__move", "เลื่อนขึ้น"); up.type = "button"; up.disabled = index === 0;
        up.setAttribute("aria-label", `เลื่อน ${mediaId} ขึ้น`); up.addEventListener("click", () => move(mediaId, -1));
        const down = make("button", "admin-place-media__move", "เลื่อนลง"); down.type = "button"; down.disabled = index === selected.length - 1;
        down.setAttribute("aria-label", `เลื่อน ${mediaId} ลง`); down.addEventListener("click", () => move(mediaId, 1));
        const removeButton = make("button", "admin-place-media__remove", "นำออก"); removeButton.type = "button";
        removeButton.setAttribute("aria-label", `นำ ${mediaId} ออกจากแกลเลอรี`); removeButton.addEventListener("click", () => remove(mediaId));
        row.append(label, up, down, removeButton); selectedMount.append(row);
        if (focusRequest && focusRequest.surface === "selected" && focusRequest.mediaId === mediaId) focusTarget = [up, down, removeButton].find((button) => !button.disabled) || removeButton;
      });
      if (mounts.page) mounts.page.textContent = totalPages ? `หน้า ${page} จาก ${totalPages}` : "ไม่มีรายการ";
      if (mounts.previous) mounts.previous.disabled = page <= 1;
      if (mounts.next) mounts.next.disabled = !totalPages || page >= totalPages;
      announce(actionAnnouncement || `เลือกแล้ว ${selected.length} จากสูงสุด ${MAX_SELECTED} ภาพ`);
      if (focusRequest && !focusTarget) focusTarget = status;
      if (focusTarget && typeof focusTarget.focus === "function") focusTarget.focus();
    }
    function add(mediaId) {
      if (!galleryById[mediaId] || selected.includes(mediaId) || selected.length >= MAX_SELECTED) return false;
      selected = [...selected, mediaId]; render({ surface:"selected", mediaId }, `เลือก ${mediaId} แล้ว ${selected.length} จากสูงสุด ${MAX_SELECTED} ภาพ`); return true;
    }
    function remove(mediaId) {
      if (!selected.includes(mediaId)) return false;
      selected = selected.filter((id) => id !== mediaId); render({ surface:"options", mediaId }, `นำออก ${mediaId} แล้ว เลือก ${selected.length} จากสูงสุด ${MAX_SELECTED} ภาพ`); return true;
    }
    function move(mediaId, direction) {
      const index = selected.indexOf(mediaId);
      const target = index + direction;
      if (index < 0 || (direction !== -1 && direction !== 1) || target < 0 || target >= selected.length) return false;
      const next = selected.slice(); [next[index], next[target]] = [next[target], next[index]]; selected = next; render({ surface:"selected", mediaId }, `เลื่อน ${mediaId} ไปเป็นลำดับ ${target + 1} แล้ว เลือก ${selected.length} จากสูงสุด ${MAX_SELECTED} ภาพ`); return true;
    }

    if (options.mode !== "edit" || !placeId) {
      root.setAttribute("data-media-state", "create-unavailable");
      hero.textContent = "บันทึกสถานที่ก่อนเพื่อแสดงภาพ Hero ที่ระบบกำหนดจากรหัสสถานที่";
      availableMount.hidden = true;
      selectedMount.hidden = true;
      setSelectorAvailable(false);
      announce("การเลือก Gallery ยังไม่พร้อมจนกว่าจะสร้างสถานที่");
      return Object.freeze({ getSelected: () => [], add: () => false, remove: () => false, move: () => false });
    }
    if (typeof options.loadOptions !== "function") throw new Error("MEDIA_LOADER_REQUIRED");
    const cover = validItem(options.hero, placeId, "cover") && options.hero.media_id === `place-${placeId.toLowerCase()}-cover` ? options.hero : null;
    if (cover) hero.replaceChildren(make("p", "admin-place-media__hero-copy", `Hero ที่ระบบกำหนด: ${cover.alt_th || cover.alt_en || cover.media_id} (${cover.media_id})`), preview(cover, "admin-place-media__hero-preview"));
    else hero.textContent = "ไม่พบ Hero ที่อนุมัติ ระบบจะแสดงภาพสำรอง";
    const requested = Array.isArray(options.selectedIds) ? options.selectedIds : [];
    selected = requested.filter((id, index) => MEDIA_ID.test(id) && requested.indexOf(id) === index && index < MAX_SELECTED);
    availableMount.hidden = false;
    selectedMount.hidden = false;
    setSelectorAvailable(true);
    async function loadPage(nextPage, nextKeyword) {
      if (!isCurrent()) return false;
      const request = ++requestGeneration;
      const isLatest = () => isCurrent() && request === requestGeneration;
      root.setAttribute("aria-busy", "true");
      announce("กำลังโหลดสื่อที่อนุมัติ");
      try {
        const payload = { place_id: placeId, role: "gallery", page: nextPage, page_size: 20 };
        if (nextKeyword) payload.keyword = nextKeyword;
        const response = await options.loadOptions(payload);
        if (!isLatest()) return false;
        const items = Array.isArray(response && response.items) ? response.items : [];
        galleryById = Object.create(null);
        items.filter((item) => validItem(item, placeId, "gallery")).forEach((item) => {
          if (!galleryById[item.media_id]) galleryById[item.media_id] = item;
        });
        gallery = Object.keys(galleryById).map((id) => galleryById[id]);
        page = Number.isSafeInteger(response && response.page) ? response.page : nextPage;
        totalPages = Number.isSafeInteger(response && response.total_pages) ? response.total_pages : 0;
        keyword = nextKeyword;
        ready = true;
        root.setAttribute("data-media-state", gallery.length ? "ready" : "empty");
        render();
        if (!gallery.length) announce("ยังไม่มีภาพ Gallery ที่อนุมัติสำหรับสถานที่นี้");
        return true;
      } catch (_error) {
        if (!isLatest()) return false;
        ready = false;
        root.setAttribute("data-media-state", "error");
        announce("ไม่สามารถโหลดสื่อที่อนุมัติได้ กรุณาลองค้นหาหรือเปลี่ยนหน้าอีกครั้ง");
        return false;
      } finally {
        if (isLatest()) root.setAttribute("aria-busy", "false");
      }
    }
    async function search(value) {
      if (typeof value !== "string" || value !== value.trim() || value.length > 200) return false;
      return loadPage(1, value);
    }
    async function next() { return page < totalPages ? loadPage(page + 1, keyword) : false; }
    async function previous() { return page > 1 ? loadPage(page - 1, keyword) : false; }
    if (mounts.searchButton && mounts.searchInput) mounts.searchButton.addEventListener("click", () => isCurrent() && search(mounts.searchInput.value));
    mounts.previous?.addEventListener("click", () => isCurrent() && previous());
    mounts.next?.addEventListener("click", () => isCurrent() && next());
    await loadPage(1, "");
    return Object.freeze({ getSelected: () => { if (!ready) throw new Error("MEDIA_OPTIONS_UNAVAILABLE"); return selected.slice(); }, add, remove, move, search, next, previous });
  }

  global.TakhunAdminPlaceMedia = Object.freeze({ init });
})(window);
