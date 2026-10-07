(function (global) {
  'use strict';
  const domains = {
    products: { id: 'product_id', title: 'name_th', category: 'category', fields: ['name_th', 'name_en', 'category', 'producer_name', 'related_place_id', 'district', 'description_th', 'description_en', 'price_range', 'phone', 'contact_url', 'google_maps_url', 'latitude', 'longitude', 'image_url', 'tags', 'is_featured', 'sort_order'], categories: ['food', 'souvenir', 'herbal', 'honey', 'handicraft', 'fruit', 'community_activity', 'tourism_service', 'accommodation', 'transport'], required: ['name_th', 'description_th', 'category'], methods: { list: 'getProducts', detail: 'getProductDetail', create: 'createProduct', update: 'updateProduct', delete: 'deleteProduct' } },
    events: { id: 'event_id', title: 'title_th', category: 'event_type', fields: ['title_th', 'title_en', 'event_type', 'event_date', 'start_time', 'end_time', 'location_th', 'location_en', 'related_place_id', 'description_th', 'description_en', 'image_url', 'contact_name', 'contact_phone', 'register_url', 'google_maps_url', 'latitude', 'longitude', 'is_featured'], categories: ['launch', 'festival', 'community_market', 'learning', 'seasonal', 'otop', 'tourism', 'other'], required: ['title_th', 'location_th', 'description_th', 'event_type', 'event_date'], methods: { list: 'getEvents', detail: 'getEventDetail', create: 'createEvent', update: 'updateEvent', delete: 'deleteEvent' } }
  };
  const statuses = { draft: 'ฉบับร่าง', published: 'เผยแพร่', hidden: 'ซ่อน', archived: 'เก็บถาวร', deleted: 'ลบแล้ว' };
  const transitions = { draft: ['published', 'archived', 'deleted'], published: ['hidden', 'archived', 'deleted'], hidden: ['draft', 'published', 'archived', 'deleted'], archived: ['draft', 'deleted'], deleted: ['draft'] };
  const actions = { draft: 'คืนเป็นฉบับร่าง', published: 'เผยแพร่', hidden: 'ซ่อน', archived: 'เก็บถาวร', deleted: 'ลบ' };
  const labels = { name_th: 'ชื่อสินค้า (ไทย)', name_en: 'ชื่อสินค้า (อังกฤษ)', title_th: 'ชื่อกิจกรรม (ไทย)', title_en: 'ชื่อกิจกรรม (อังกฤษ)', category: 'หมวดหมู่', event_type: 'ประเภทกิจกรรม', producer_name: 'ผู้ผลิต', related_place_id: 'รหัสสถานที่ที่เกี่ยวข้อง', district: 'อำเภอ', description_th: 'รายละเอียด (ไทย)', description_en: 'รายละเอียด (อังกฤษ)', price_range: 'ช่วงราคา', phone: 'โทรศัพท์', contact_url: 'ลิงก์ติดต่อ', google_maps_url: 'ลิงก์ Google Maps', latitude: 'ละติจูด', longitude: 'ลองจิจูด', image_url: 'ลิงก์รูปภาพ', tags: 'แท็ก (คั่นด้วย |)', is_featured: 'รายการแนะนำ', sort_order: 'ลำดับการแสดง', event_date: 'วันที่จัดกิจกรรม', start_time: 'เวลาเริ่ม', end_time: 'เวลาสิ้นสุด', location_th: 'สถานที่ (ไทย)', location_en: 'สถานที่ (อังกฤษ)', contact_name: 'ผู้ติดต่อ', contact_phone: 'โทรศัพท์ติดต่อ', register_url: 'ลิงก์ลงทะเบียน' };
  const categoryLabels = { food: 'อาหาร', souvenir: 'ของฝาก', herbal: 'สมุนไพร', honey: 'น้ำผึ้ง', handicraft: 'งานหัตถกรรม', fruit: 'ผลไม้', community_activity: 'กิจกรรมชุมชน', tourism_service: 'บริการท่องเที่ยว', accommodation: 'ที่พัก', transport: 'การเดินทาง', launch: 'เปิดตัว', festival: 'เทศกาล', community_market: 'ตลาดชุมชน', learning: 'การเรียนรู้', seasonal: 'ตามฤดูกาล', otop: 'โอทอป', tourism: 'การท่องเที่ยว', other: 'อื่น ๆ', ban_ta_khun: 'บ้านตาขุน', khiri_rat_nikhom: 'คีรีรัฐนิคม', phanom: 'พนม' };
  function domain(kind) { if (!Object.prototype.hasOwnProperty.call(domains, kind)) throw new Error('ประเภทข้อมูลไม่ถูกต้อง'); return domains[kind]; }
  function text(value, limit) {
    if (typeof value !== 'string' || value.length > (limit || 20000) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error();
    const result = value.trim();
    if (/^[=+@\-']/.test(result)) throw new Error();
    encodeURIComponent(result); // Reject unpaired UTF-16 surrogates, like the server UTF-8 boundary.
    return result;
  }
  function url(value) {
    const result = text(value, 2048);
    if (!result) return result;
    if (/[\s\\<>"']/.test(result) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(result)) throw new Error();
    const match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(result);
    if (!match || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?$/i.test(match[1])) throw new Error();
    const port = /:([0-9]+)$/.exec(match[1]);
    if (port && (+port[1] < 1 || +port[1] > 65535)) throw new Error();
    const host = match[1].replace(/:[0-9]+$/, ''), parts = host.split('.');
    if (/^[0-9.]+$/.test(host)) {
      if (parts.length !== 4 || parts.some(p => !/^(?:0|[1-9][0-9]{0,2})$/.test(p) || +p > 255)) throw new Error();
    } else if (!/^[a-z]/i.test(parts[parts.length - 1])) throw new Error();
    return result;
  }
  function validate(kind, values) {
    const d = domain(kind), content = {}, errors = {};
    values = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
    const bad = field => { errors[field] = 'กรุณาตรวจสอบ' + (labels[field] || 'ข้อมูลนี้') + 'ให้ถูกต้อง'; };
    Object.keys(values).forEach(field => { if (!d.fields.includes(field)) bad(field); });
    d.fields.forEach(field => {
      const value = Object.prototype.hasOwnProperty.call(values, field) ? values[field] : field === 'is_featured' ? false : '';
      try {
        if (field === 'is_featured') { if (typeof value !== 'boolean') throw new Error(); content[field] = value; }
        else if (['latitude', 'longitude', 'sort_order'].includes(field)) {
          if (typeof value !== 'string' || (value.trim() && !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) throw new Error();
          const n = value.trim() === '' ? '' : Number(value);
          if (n !== '' && (!Number.isFinite(n) || (field === 'sort_order' ? !Number.isSafeInteger(n) || n < 0 : Math.abs(n) > (field === 'latitude' ? 90 : 180)))) throw new Error();
          content[field] = n;
        } else content[field] = field.endsWith('_url') ? url(value) : text(value);
      } catch (_invalid) { bad(field); }
    });
    d.required.forEach(field => { if (!content[field]) bad(field); });
    if (!d.categories.includes(content[d.category])) bad(d.category);
    if (kind === 'products') {
      if (content.district && !['ban_ta_khun', 'khiri_rat_nikhom', 'phanom'].includes(content.district)) bad('district');
      if (content.tags) try {
        const tags = content.tags.split('|').map(v => text(v, 200));
        if (tags.length > 100 || tags.some((v, i) => !v || tags.indexOf(v) !== i)) throw new Error();
        content.tags = tags.join('|');
      } catch (_invalid) { bad('tags'); }
    } else {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(content.event_date || '');
      if (!match) bad('event_date');
      else {
        const y = +match[1], m = +match[2], day = +match[3], days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (y < 1 || m < 1 || m > 12 || day < 1 || day > days[m - 1]) bad('event_date');
      }
      ['start_time', 'end_time'].forEach(field => { if (content[field] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(content[field])) bad(field); });
      if (content.end_time && (!content.start_time || content.end_time <= content.start_time)) bad('end_time');
    }
    if (content.related_place_id && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(content.related_place_id)) bad('related_place_id');
    if ((content.latitude === '') !== (content.longitude === '')) { bad('latitude'); bad('longitude'); }
    return { content, errors };
  }
  function createController(kind, role, api, token) {
    const d = domain(kind);
    const state = { record: null, busy: false, blocked: false, unknown: false, conflict: false, message: '', auditWarning: false };
    const unknownCodes = ['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'MALFORMED_RESPONSE', 'OUTCOME_UNKNOWN', 'SERVER_ERROR'];
    function reset() { if (state.busy || state.blocked) return false; Object.assign(state, { record: null, unknown: false, conflict: false, message: '', auditWarning: false }); return true; }
    async function load(id) {
      if (state.busy) return false;
      state.busy = true;
      try {
        const record = await api[d.methods.detail](token, { [d.id]: id });
        Object.assign(state, { record, blocked: false, unknown: false, conflict: false, message: '', auditWarning: false });
        return true;
      } catch (_error) { state.message = 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองโหลดใหม่'; return false; }
      finally { state.busy = false; }
    }
    async function mutate(content, targetStatus) {
      if (state.busy || state.blocked) return false;
      if (!['editor', 'super_admin'].includes(role)) { state.message = 'บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูล'; return false; }
      const record = state.record, hasContent = content !== null && content !== undefined && Object.keys(content).length > 0;
      const hasStatus = targetStatus !== undefined;
      const invalidCreate = !record && (hasStatus || !hasContent);
      const invalidTransition = record && hasStatus && !(transitions[record.status] || []).includes(targetStatus);
      const invalidEdit = record && hasContent && (['archived', 'deleted'].includes(record.status) || (hasStatus && ['draft', 'archived', 'deleted'].includes(targetStatus)));
      if (invalidCreate || invalidTransition || invalidEdit || (record && !hasContent && !hasStatus)) {
        state.message = 'ไม่สามารถดำเนินการนี้ในสถานะปัจจุบัน'; return false;
      }
      const payload = Object.assign({}, hasContent ? content : {});
      let method = d.methods.create;
      if (record) { payload[d.id] = record[d.id]; payload.expected_revision = record.revision; method = d.methods.update; if (hasStatus) payload.status = targetStatus; if (targetStatus === 'deleted') { method = d.methods.delete; delete payload.status; } }
      state.busy = true; state.message = ''; state.auditWarning = false;
      try {
        const result = await api[method](token, payload);
        state.record = Object.assign({}, result, { content: Object.assign({}, record ? record.content : {}, hasContent ? content : {}) });
        state.auditWarning = result.audit_status === 'unconfirmed';
        state.message = state.auditWarning ? 'บันทึกข้อมูลแล้ว แต่ยังยืนยันบันทึกกิจกรรมไม่ได้ กรุณาตรวจสอบ ห้ามบันทึกซ้ำเพื่อแก้ปัญหานี้' : 'บันทึกข้อมูลแล้ว';
        return true;
      } catch (error) {
        const code = error && error.code;
        state.conflict = code === 'CONFLICT'; state.unknown = unknownCodes.includes(code) || !code;
        state.blocked = state.conflict || state.unknown;
        state.message = state.conflict ? 'ข้อมูลถูกเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขต่อ' : state.unknown ? 'ยังยืนยันผลการบันทึกไม่ได้ ห้ามส่งซ้ำ กรุณาตรวจสอบรายการและโหลดรายละเอียดเพื่อยืนยันผลก่อนดำเนินการต่อ' : 'ไม่สามารถบันทึกได้ กรุณาตรวจสอบข้อมูลและสิทธิ์ของบัญชี';
        return false;
      } finally { state.busy = false; }
    }
    return { state, load, mutate, reset };
  }
  global.TakhunAdminContentModel = Object.freeze({ domains, statuses, transitions, actions, labels, categoryLabels, validate, createController });
})(window);
