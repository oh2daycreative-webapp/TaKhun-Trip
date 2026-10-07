"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "public/admin/js/admin-content-ui.js");
assert.ok(fs.existsSync(sourcePath), "Products/Events controller must exist");
function element(tag) {
  const events = {}, attrs = {};
  return { tagName: tag.toUpperCase(), children: [], value: "", textContent: "", hidden: false, disabled: false, checked: false,
    appendChild(e) { this.children.push(e); return e; }, replaceChildren(...e) { this.children = e; },
    setAttribute(k,v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k]; },
    addEventListener(k,f) { events[k] = f; }, async fire(k) { if(events[k]) return events[k]({preventDefault(){}}); }, focus() { this.focused = true; }
  };
}
function all(e) { return [e, ...e.children.flatMap(all)]; }
function byText(e,t) { return all(e).find(n => n.textContent === t); }
function harness(kind="products",role="editor") {
  const host = element("section"), calls=[], storage=new Map(); let response={items:[],total:0,page:1,page_size:20,total_pages:0};
  const window={document:{body:{dataset:{adminPage:kind}},querySelector:()=>host,createElement:element},confirm:()=>true,addEventListener(){},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    TakhunAdminShell:{init:async()=>({status:"authenticated",admin:{role}})},TakhunAdminAuth:{readSession:()=>({token:"TOKEN",role})},
    TakhunAdminApi:{getProducts:async(t,p)=>{calls.push(p);return response;},getEvents:async(t,p)=>{calls.push(p);return response;}}};
  const ctx=vm.createContext({window,console,URLSearchParams});
  vm.runInContext(fs.readFileSync(path.join(root,"public/admin/js/admin-content-model.js"),"utf8"),ctx);
  vm.runInContext(fs.readFileSync(sourcePath,"utf8"),ctx);
  return {window,host,calls,storage,setResponse:r=>response=r,api:window.TakhunAdminApi};
}
const field = (h, name) => all(h.host).find(n => n.id === 'content-field-' + name);
const editor = h => all(h.host).find(n => n.className === 'content-editor');
const click = async (h, text) => { const b = byText(h.host, text); assert.ok(b, 'Missing control: ' + text); return b.fire('click'); };
const texts = h => all(h.host).map(n => n.textContent).join('\n');
async function fill(h, values) { for (const [name, value] of Object.entries(values)) { const input = field(h, name); assert.ok(input, name); if (input.type === 'checkbox') input.checked = value; else input.value = String(value); await input.fire('input'); } }
function fixture(kind = 'products', role = 'editor', status = 'draft') {
  const h = harness(kind, role), model = h.window.TakhunAdminContentModel, d = model.domains[kind];
  const base = kind === 'products' ? { name_th: 'สินค้าทดสอบ', description_th: 'รายละเอียด', category: 'food' } : { title_th: 'กิจกรรมทดสอบ', description_th: 'รายละเอียด', location_th: 'บ้านตาขุน', event_type: 'festival', event_date: '2028-02-29', start_time: '09:00', end_time: '12:00' };
  let row = { [d.id]: kind === 'products' ? 'PROD-1' : 'EVT-1', status, revision: 'r1-' + 'a'.repeat(64), content: model.validate(kind, base).content }, failure = null, audit = 'recorded', deferred = null;
  const writes = [], reads = [];
  h.api[d.methods.detail] = async (token, payload) => { reads.push(payload); assert.equal(token, 'TOKEN'); return JSON.parse(JSON.stringify(row)); };
  for (const operation of ['create', 'update', 'delete']) h.api[d.methods[operation]] = async (token, payload) => {
    assert.equal(token, 'TOKEN'); writes.push({ operation, payload }); if (deferred) await deferred;
    if (failure) throw { code: failure, message: '<script>SERVER SECRET</script>' };
    row = { ...row, status: operation === 'create' ? 'draft' : operation === 'delete' ? 'deleted' : payload.status || row.status, revision: 'r1-' + 'b'.repeat(64), content: { ...row.content } };
    d.fields.forEach(f => { if (Object.hasOwn(payload, f)) row.content[f] = payload[f]; });
    return { [d.id]: row[d.id], revision: row.revision, status: row.status, audit_status: audit };
  };
  h.api.getPlaces = async () => ({ items: [], total_pages: 0 });
  const list = () => h.setResponse({ items: [{ [d.id]: row[d.id], [d.title]: row.content[d.title], [d.category]: row.content[d.category], status: row.status, revision: row.revision }], total: 1, page: 1, page_size: 20, total_pages: 1 });
  return Object.assign(h, { d, base, writes, reads, list, row: () => row, setFailure: v => { failure = v; }, setAudit: v => { audit = v; }, setDeferred: v => { deferred = v; }, setRow: v => { row = { ...row, ...v }; } });
}
(async()=>{
  for(const kind of ["products","events"]){
    const html=fs.readFileSync(path.join(root,`public/admin/${kind}.html`),"utf8");
    assert.doesNotMatch(html,/class="placeholder"/); assert.match(html,/TakhunAdminContentUI.init/);
    assert.match(html,/admin-content-model.js/); assert.match(html,/admin-content-ui.js/);
    for(const role of ["viewer","reviewer","editor","super_admin"]){
      const h=harness(kind,role);await h.window.TakhunAdminContentUI.init();
      assert.equal(h.calls.length,1);assert.equal(h.calls[0].page_size,20);
      const create=byText(h.host,"เพิ่มรายการ");assert.equal(!!create,role==="editor"||role==="super_admin");
      assert.ok(byText(h.host,"ไม่พบรายการตามเงื่อนไข"));
      assert.ok(all(h.host).some(n=>n.getAttribute("role")==="status"));
      if(create){await create.fire("click");assert.ok(byText(h.host,"บันทึกฉบับร่าง"));const fields=all(h.host).filter(n=>n.id&&n.id.startsWith("content-field-")); assert.ok(fields.length>=18);assert.ok(fields.some(n=>n.type==="checkbox"));}
    }
  }
  const css=fs.readFileSync(path.join(root,"public/css/admin-content.css"),"utf8");
  assert.match(css,/minmax\(0,\s*1fr\)/);assert.match(css,/overflow-wrap:\s*anywhere/);assert.match(css,/min-height:\s*44px/);assert.match(css,/:focus-visible/);
  assert.doesNotMatch(fs.readFileSync(sourcePath,"utf8"),/innerHTML|insertAdjacentHTML|\.fetch\(|setInterval/);
  for (const kind of ['products', 'events']) {
    const h = fixture(kind); await h.window.TakhunAdminContentUI.init(); await click(h, 'เพิ่มรายการ');
    await editor(h).fire('submit'); assert.equal(h.writes.length, 0, 'Invalid form cannot write');
    assert.equal(field(h, h.d.title).getAttribute('aria-invalid'), 'true');
    await fill(h, h.base); await fill(h, { latitude: '9.2', longitude: '99.1', is_featured: true });
    let release; h.setDeferred(new Promise(resolve => { release = resolve; }));
    const form = editor(h), pending = form.fire('submit'); await form.fire('submit');
    assert.equal(h.writes.length, 1, 'Double-submit performs one create');
    assert.equal(h.storage.get('takhun-content-uncertain-' + kind), '1', 'Create marker is persisted before mutation resolves');
    assert.equal(form.getAttribute('aria-busy'), 'true'); assert.equal(field(h, h.d.title).disabled, true);
    release(); await pending; h.setDeferred(null);
    assert.equal(h.storage.has('takhun-content-uncertain-' + kind), false, 'Known successful create clears pending marker');
    assert.equal(h.writes[0].operation, 'create'); assert.equal(h.writes[0].payload.latitude, 9.2); assert.equal(h.writes[0].payload.is_featured, true);
    assert.ok(byText(h.host, 'บันทึกการแก้ไข'), 'Successful create switches to existing-record form');
    await fill(h, { [h.d.title]: 'ชื่อแก้ไข' }); await editor(h).fire('submit');
    assert.equal(h.writes.at(-1).operation, 'update'); assert.equal(h.writes.at(-1).payload[h.d.id], h.row()[h.d.id]); assert.equal(h.writes.at(-1).payload.expected_revision, 'r1-' + 'b'.repeat(64));
    assert.equal(field(h, h.d.title).value, 'ชื่อแก้ไข');
    await click(h, 'เผยแพร่'); assert.equal(h.writes.at(-1).payload.status, 'published'); assert.equal(h.writes.at(-1).payload[h.d.title], undefined);
    assert.ok(byText(h.host, 'ซ่อน')); await click(h, 'เก็บถาวร'); assert.equal(h.row().status, 'archived'); assert.equal(field(h, h.d.title).disabled, true); assert.equal(byText(h.host, 'บันทึกการแก้ไข'), undefined);
    await click(h, 'คืนเป็นฉบับร่าง'); assert.equal(h.writes.at(-1).payload.status, 'draft'); assert.equal(field(h, h.d.title).disabled, false);
    await click(h, 'ลบ'); assert.equal(h.writes.at(-1).operation, 'delete'); assert.equal(h.writes.at(-1).payload.status, undefined); assert.equal(field(h, h.d.title).disabled, true);
    console.log('PASS ' + kind + ' create/update/lifecycle, typed payload, validation and double-submit');
  }
  {
    const h = fixture(); h.list(); await h.window.TakhunAdminContentUI.init(); await click(h, 'เปิด / จัดการ');
    await fill(h, { name_th: 'ค่าที่ยังไม่บันทึก' }); h.setFailure('CONFLICT'); await editor(h).fire('submit');
    assert.equal(field(h, 'name_th').value, 'ค่าที่ยังไม่บันทึก', 'Conflict preserves form'); assert.equal(byText(h.host, 'บันทึกการแก้ไข').disabled, true); assert.equal(byText(h.host, 'โหลดข้อมูลล่าสุด').disabled, false);
    await editor(h).fire('submit'); assert.equal(h.writes.length, 1); assert.doesNotMatch(texts(h), /SERVER SECRET/);
    h.setFailure(null); h.setRow({ content: { ...h.row().content, name_th: 'ข้อมูลล่าสุดจากเซิร์ฟเวอร์' } }); await click(h, 'โหลดข้อมูลล่าสุด');
    assert.equal(field(h, 'name_th').value, 'ข้อมูลล่าสุดจากเซิร์ฟเวอร์'); assert.equal(byText(h.host, 'บันทึกการแก้ไข').disabled, false);
    await fill(h, { name_th: 'ข้อมูลที่ไม่ผ่าน' }); h.setFailure('VALIDATION_ERROR'); await editor(h).fire('submit'); assert.equal(field(h, 'name_th').value, 'ข้อมูลที่ไม่ผ่าน', 'Rejected write preserves form even when revision unchanged');
    h.setFailure(null); h.setAudit('unconfirmed'); await editor(h).fire('submit'); assert.match(texts(h), /ยังยืนยัน/); assert.equal(h.writes.length, 3, 'Audit warning never retries');
    console.log('PASS conflict/reload, safe error, rejected form preservation and audit warning');
  }
  {
    const h = fixture(); await h.window.TakhunAdminContentUI.init(); await click(h, 'เพิ่มรายการ'); await fill(h, h.base); h.setFailure('TIMEOUT'); await editor(h).fire('submit');
    assert.equal(h.storage.get('takhun-content-uncertain-products'), '1'); assert.equal(byText(h.host, 'บันทึกฉบับร่าง').disabled, true); await editor(h).fire('submit'); assert.equal(h.writes.length, 1);
    await click(h, 'กลับรายการ'); await click(h, 'เพิ่มรายการ'); assert.equal(editor(h), undefined, 'Unknown create blocks a fresh form');
    assert.ok(byText(h.host, 'ตรวจสอบรายการแล้ว')); await click(h, 'ตรวจสอบรายการแล้ว'); assert.equal(h.storage.has('takhun-content-uncertain-products'), false); await click(h, 'เพิ่มรายการ'); assert.ok(editor(h));
    console.log('PASS unknown create is blocked until explicit list reconciliation');
  }
  for (const role of ['viewer', 'reviewer']) {
    const h = fixture('events', role); h.setRow({ content: { ...h.row().content, title_th: '<img src=x onerror=alert(1)>', is_featured: true } }); h.list(); await h.window.TakhunAdminContentUI.init(); await Promise.resolve();
    assert.ok(byText(h.host, '<img src=x onerror=alert(1)>')); assert.match(texts(h), /รายการแนะนำ.*2028-02-29.*09:00.*12:00/); assert.equal(h.reads.length, 1, 'List detail enrichment is bounded to listed items');
    await click(h, 'ดูรายละเอียด'); assert.equal(h.reads.length, 2); assert.equal(field(h, 'title_th').disabled, true); assert.equal(byText(h.host, 'เผยแพร่'), undefined); assert.equal(byText(h.host, 'บันทึกการแก้ไข'), undefined);
    await editor(h).fire('submit'); assert.equal(h.writes.length, 0); assert.equal(all(h.host).filter(n => n.tagName === 'IMG').length, 0);
  }
  console.log('PASS read-only details, detail enrichment and untrusted text rendering');
  for (const code of ['NETWORK_ERROR', 'HTTP_ERROR', 'MALFORMED_RESPONSE', 'OUTCOME_UNKNOWN', 'SERVER_ERROR']) {
    const h = fixture(); h.list(); await h.window.TakhunAdminContentUI.init(); await click(h, 'เปิด / จัดการ'); await fill(h, { name_th: 'ค่ารอการตรวจสอบ' });
    h.setFailure(code); await editor(h).fire('submit'); assert.equal(field(h, 'name_th').value, 'ค่ารอการตรวจสอบ'); assert.equal(byText(h.host, 'บันทึกการแก้ไข').disabled, true);
    await editor(h).fire('submit'); assert.equal(h.writes.length, 1); h.setFailure(null); await click(h, 'โหลดข้อมูลล่าสุด'); assert.equal(byText(h.host, 'บันทึกการแก้ไข').disabled, false);
  }
  {
    const h = fixture(); h.list(); await h.window.TakhunAdminContentUI.init(); await click(h, 'เปิด / จัดการ'); await fill(h, { name_th: 'ต้องเก็บค่าฟอร์มเมื่ออ่านล้มเหลว' });
    h.api.getProductDetail = async () => { throw { code: 'NETWORK_ERROR', message: 'SERVER SECRET' }; };
    await click(h, 'โหลดข้อมูลล่าสุด'); assert.equal(field(h, 'name_th').value, 'ต้องเก็บค่าฟอร์มเมื่ออ่านล้มเหลว'); assert.doesNotMatch(texts(h), /SERVER SECRET/);
    const count = h.writes.length; await click(h, 'เผยแพร่'); assert.equal(h.writes.length, count, 'Dirty form prevents status-only action');
  }
  {
    const h = fixture('events'); await h.window.TakhunAdminContentUI.init();
    const input = id => all(h.host).find(n => n.id === id);
    input('content-keyword').value = 'เทศกาล'; input('content-status').value = 'published'; input('content-category').value = 'festival';
    h.setResponse({ items: [], total: 21, page: 1, page_size: 20, total_pages: 2 });
    await all(h.host).find(n => n.className === 'content-filters').fire('submit');
    assert.equal(h.calls.at(-1).keyword, 'เทศกาล'); assert.equal(h.calls.at(-1).event_type, 'festival'); assert.equal(h.calls.at(-1).status, 'published');
    h.setResponse({ items: [], total: 21, page: 2, page_size: 20, total_pages: 2 }); await click(h, 'หน้าถัดไป'); assert.equal(h.calls.at(-1).page, 2); assert.equal(h.calls.at(-1).event_type, 'festival');
  }
  console.log('PASS unknown update reconciliation, failed reload preservation, dirty lifecycle guard and list filters/pagination');
  {
    const h = fixture(); await h.window.TakhunAdminContentUI.init(); await click(h, 'เพิ่มรายการ'); await fill(h, h.base); h.setFailure('VALIDATION_ERROR');
    await editor(h).fire('submit'); assert.equal(h.writes.length, 1); assert.equal(h.storage.has('takhun-content-uncertain-products'), false, 'Definitive create rejection clears pending marker');
    assert.equal(field(h, 'name_th').value, h.base.name_th); assert.equal(byText(h.host, 'บันทึกฉบับร่าง').disabled, false);
  }
  {
    const h = fixture(); h.storage.set('takhun-content-uncertain-products', '1'); h.list(); await h.window.TakhunAdminContentUI.init();
    await click(h, 'เพิ่มรายการ'); assert.equal(editor(h), undefined, 'Marker survives a new page initialization'); await click(h, 'เปิด / จัดการ');
    assert.ok(byText(h.host, 'ยืนยันว่าเป็นรายการที่สร้างไว้แล้ว')); h.window.confirm = () => false; await click(h, 'ยืนยันว่าเป็นรายการที่สร้างไว้แล้ว'); assert.equal(h.storage.get('takhun-content-uncertain-products'), '1');
    await fill(h, { name_th: 'Unsaved edit' }); h.window.confirm = () => true; await click(h, 'ยืนยันว่าเป็นรายการที่สร้างไว้แล้ว'); assert.equal(h.storage.has('takhun-content-uncertain-products'), false); assert.equal(byText(h.host, 'ยืนยันว่าเป็นรายการที่สร้างไว้แล้ว').hidden, true); assert.equal(field(h, 'name_th').value, 'Unsaved edit'); assert.equal(h.writes.length, 0, 'Confirming existing result never resubmits create');
    await click(h, 'กลับรายการ'); await click(h, 'เพิ่มรายการ'); assert.ok(editor(h));
  }
  console.log('PASS durable pending marker, definitive rejection cleanup and found-record reconciliation');
  console.log("Admin Product/Event UI role, page, editor and accessibility checks passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
