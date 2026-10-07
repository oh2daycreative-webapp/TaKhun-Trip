const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {} };
const file = path.join(__dirname, '../public/admin/js/admin-content-model.js');
if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
const model = context.window.TakhunAdminContentModel;
assert.ok(model, 'Content model must be exported');
const product = { name_th: 'สินค้า', description_th: 'รายละเอียด', category: 'food' };
const event = { title_th: 'งาน', description_th: 'รายละเอียด', location_th: 'สถานที่', event_type: 'festival', event_date: '2028-02-29' };
assert.equal(Object.keys(model.validate('products', product).errors).length, 0);
assert.equal(Object.keys(model.validate('events', event).errors).length, 0);
for (const [field, value] of [['name_th', '=SUM(A1)'], ['phone', '+661234'], ['name_th', '\ud800'], ['name_th', 'x\u0001'], ['category', 'FOOD'], ['district', 'bad'], ['is_featured', 'false'], ['sort_order', '1.2'], ['latitude', '91'], ['latitude', '0'], ['related_place_id', 'bad id'], ['tags', 'a|a']]) {
  assert.ok(model.validate('products', { ...product, [field]: value }).errors[field], field + ' rejects ' + value);
}
for (const url of ['javascript:alert(1)', 'https://user@example.com', 'https://127.1', 'https://01.2.3.4', 'https://example.123', 'https://example.com:65536', 'https://example.com/%0a']) assert.ok(model.validate('products', { ...product, image_url: url }).errors.image_url, url);
for (const url of ['https://example.com/path?q=1', 'http://127.0.0.1:8080']) assert.equal(model.validate('products', { ...product, image_url: url }).errors.image_url, undefined);
for (const fields of [{ event_date: '2027-02-29' }, { event_date: '0000-01-01' }, { start_time: '24:00' }, { end_time: '12:00' }, { start_time: '12:00', end_time: '12:00' }]) assert.ok(Object.keys(model.validate('events', { ...event, ...fields }).errors).length);
assert.equal(model.validate('products', { ...product, latitude: '9.5', longitude: '99', sort_order: '2' }).content.latitude, 9.5);
assert.equal(model.validate('products', { ...product, latitude: '1e-7', longitude: '-1e-7' }).content.latitude, 1e-7);
assert.ok(model.validate('products', { ...product, status: 'published' }).errors.status);
async function main() {
  const expectedTransitions = {
    draft: ['published', 'archived', 'deleted'],
    published: ['hidden', 'archived', 'deleted'],
    hidden: ['draft', 'published', 'archived', 'deleted'],
    archived: ['draft', 'deleted'],
    deleted: ['draft']
  };
  for (const kind of ['products', 'events']) {
    assert.ok(model.domains[kind], kind + ' domain exists');
    assert.deepEqual(JSON.parse(JSON.stringify(model.transitions)), expectedTransitions, kind + ' locked lifecycle matrix');
  }
  let calls = [], failure = null, status = 'draft', release;
  const revision = 'r1-' + 'a'.repeat(64);
  const api = {
    getProductDetail: async (token, payload) => { if (failure) throw { code: failure, message: 'SECRET' }; return { product_id: payload.product_id, revision, status, content: product }; },
    createProduct: async (token, payload) => { calls.push(['create', token, payload]); if (release) await new Promise(r => { release = r; }); if (failure) throw { code: failure, message: 'SECRET' }; return { product_id: 'PROD-1', revision, status: 'draft', audit_status: 'unconfirmed' }; },
    updateProduct: async (token, payload) => { calls.push(['update', token, payload]); if (failure) throw { code: failure, message: 'SECRET' }; return { product_id: 'PROD-1', revision, status: payload.status || status, audit_status: 'recorded' }; },
    deleteProduct: async (token, payload) => { calls.push(['delete', token, payload]); return { product_id: 'PROD-1', revision, status: 'deleted', audit_status: 'recorded' }; }
  };
  for (const role of ['viewer', 'reviewer', 'invalid']) { const c = model.createController('products', role, api, 'TOKEN'); await c.mutate(product); assert.equal(calls.length, 0); }
  const c = model.createController('products', 'editor', api, 'TOKEN');
  await c.mutate(product); assert.equal(c.state.record.product_id, 'PROD-1'); assert.equal(c.state.record.content.name_th, product.name_th); assert.equal(c.state.auditWarning, true);
  await c.mutate(null, 'published'); assert.equal(calls.at(-1)[2].expected_revision, revision); assert.equal(calls.at(-1)[2].name_th, undefined);
  await c.mutate(null, 'deleted'); assert.equal(calls.at(-1)[0], 'delete'); assert.equal(calls.at(-1)[2].status, undefined);
  const before = calls.length; await c.mutate(product); assert.equal(calls.length, before);
  for (const from of Object.keys(model.statuses)) for (const to of Object.keys(model.statuses)) {
    status = from; await c.load('PROD-1'); const count = calls.length; await c.mutate(null, to);
    assert.equal(calls.length - count, expectedTransitions[from].includes(to) ? 1 : 0, from + ' -> ' + to);
  }
  for (const code of ['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'MALFORMED_RESPONSE', 'OUTCOME_UNKNOWN', 'SERVER_ERROR', 'CONFLICT']) {
    status = 'draft'; await c.load('PROD-1'); failure = code; await c.mutate(product); assert.equal(c.state.blocked, true); assert.ok(!c.state.message.includes('SECRET'));
    const count = calls.length; await c.mutate(product); c.reset(); await c.mutate(product); assert.equal(calls.length, count);
    failure = null; await c.load('PROD-1'); assert.equal(c.state.blocked, false);
  }
  const fresh = model.createController('products', 'editor', api, 'TOKEN'); failure = 'TIMEOUT'; await fresh.mutate(product); fresh.reset(); assert.equal(fresh.state.blocked, true); failure = null;
  failure = 'SERVER_ERROR'; await fresh.load('PROD-1'); assert.equal(fresh.state.blocked, true); assert.equal(fresh.state.record, null); assert.ok(!fresh.state.message.includes('SECRET')); failure = null;
  status = 'draft'; await c.load('PROD-1'); const preserved = c.state.record;
  failure = 'VALIDATION_ERROR'; await c.mutate(product); assert.equal(c.state.blocked, false); assert.equal(c.state.record, preserved); failure = null;
  for (const from of ['draft', 'published', 'hidden']) {
    status = from; await c.load('PROD-1');
    for (const to of ['draft', 'archived', 'deleted']) { const count = calls.length; await c.mutate(product, to); assert.equal(calls.length, count); }
  }
  const eventCalls = [];
  const ec = model.createController('events', 'super_admin', {
    createEvent: async (token, payload) => { eventCalls.push(payload); return { event_id: 'EVT-1', revision, status: 'draft', audit_status: 'recorded' }; },
    updateEvent: async (token, payload) => { eventCalls.push(payload); return { event_id: 'EVT-1', revision, status: 'published', audit_status: 'recorded' }; }
  }, 'TOKEN');
  await ec.mutate(model.validate('events', event).content); await ec.mutate(null, 'published');
  assert.equal(eventCalls[1].event_id, 'EVT-1'); assert.equal(eventCalls[1].expected_revision, revision); assert.equal(ec.state.record.content.event_date, event.event_date);
  const concurrent = model.createController('products', 'editor', api, 'TOKEN'); release = true; const pending = concurrent.mutate(product); const count = calls.length; await concurrent.mutate(product); await concurrent.load('PROD-1'); assert.equal(calls.length, count); assert.equal(concurrent.state.record, null); release(); await pending; release = null;
  console.log('Admin content model tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
