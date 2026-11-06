"use strict";
// apps-script/MediaUploadService.gs (task 5): the upload action adminUploadPlaceImage_ and its helpers.
// Loads the real Config.gs, SheetService.gs, R2SigV4.gs, MediaImageCheck.gs, MediaUploadSchema.gs and
// MediaUploadService.gs in a vm. Fakes: the spreadsheet (records writes, enforces sheet bounds like Apps Script),
// UrlFetchApp (R2), LockService (records when the lock is held) and AuthService_requireAdmin_.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const FILES = ["Config.gs", "SheetService.gs", "R2SigV4.gs", "MediaImageCheck.gs", "MediaUploadSchema.gs", "MediaUploadService.gs", "MediaUploadPublicService.gs"];
const SOURCES = FILES.map((name) => [name, fs.readFileSync(path.join(ROOT, "apps-script", name), "utf8")]);
let passed = 0;
async function test(name, body) {
  try { await body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}
const code = (fn) => { try { fn(); return "OK"; } catch (error) { return error.message; } };
const toSigned = (buffer) => Array.from(buffer, (b) => (b > 127 ? b - 256 : b));
const toBuffer = (bytes) => Buffer.from(Array.from(bytes, (b) => b & 0xff));

const UPLOAD_HEADERS = [
  "upload_id", "entity_type", "entity_id", "status", "object_state", "is_cover", "sort_order", "format", "sha256",
  "key_large", "key_small", "width_large", "height_large", "bytes_large", "width_small", "height_small", "bytes_small",
  "caption_th", "caption_en", "created_at", "created_by", "updated_at", "updated_by", "deleted_at", "deleted_by"
];
const AUDIT_HEADERS = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];
const PLACE_HEADERS = ["place_id", "name_th", "status"];
const PROPS = {
  SPREADSHEET_ID: "staging-spreadsheet-id", MEDIA_UPLOAD_ENABLED: "true",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_BUCKET: "takhun-media-staging", R2_ACCESS_KEY_ID: "AKIDTEST", R2_SECRET_ACCESS_KEY: "sEcReT/test+key="
};

// Fake sheet with Apps Script bounds: rows past getMaxRows() do not exist until insertRowsAfter adds them.
// newRowFormat: number format of inserted rows (worst case "" = Automatic).
function fakeSheet(name, rows, log, { maxRows = 1000, format = "@", newRowFormat = "" } = {}) {
  const values = rows.map((row) => row.slice());
  const width = rows.length ? rows[0].length : 0;
  let max = maxRows;
  const formats = Array.from({ length: max }, () => Array(Math.max(width, 1)).fill(format));
  const inBounds = (r, nr) => { if (r < 1 || r + nr - 1 > max) throw new Error("Those rows are out of bounds."); };
  const cell = (r, c) => (values[r - 1] && values[r - 1][c - 1] !== undefined ? values[r - 1][c - 1] : "");
  const sheet = {
    name, values, formats,
    getName: () => name,
    getMaxRows: () => max,
    getLastRow: () => { let last = 0; values.forEach((row, i) => { if (row.some((v) => v !== "")) last = i + 1; }); return last; },
    getLastColumn: () => width,
    insertRowsAfter: (after, count) => {
      log.push(["insertRowsAfter", name, after, count]);
      assert.equal(after, max, "rows are only added at the end");
      for (let i = 0; i < count; i += 1) formats.push(Array(width).fill(newRowFormat));
      max += count;
    },
    getDataRange: () => sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), Math.max(width, 1)),
    getRange(r, c, nr = 1, nc = 1) {
      inBounds(r, nr);
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
        getNumberFormats: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => formats[r + i - 1][c + j - 1] ?? "")),
        getFormulas: () => Array.from({ length: nr }, () => Array(nc).fill("")),
        setNumberFormat: (f) => { log.push(["setNumberFormat", name, r, c, nr, nc, f]); for (let i = 0; i < nr; i += 1) for (let j = 0; j < nc; j += 1) formats[r + i - 1][c + j - 1] = f; },
        setValues: (grid) => {
          log.push(["setValues", name, r, nr]);
          grid.forEach((line, i) => line.forEach((v, j) => {
            // Apps Script: a leading apostrophe in a plain-text cell is consumed (spec T5, F-26).
            const stored = typeof v === "string" && v.startsWith("'") ? v.slice(1) : v;
            values[r + i - 1] = values[r + i - 1] || Array(width).fill(""); values[r + i - 1][c + j - 1] = stored;
          }));
        },
        clearContent: () => { log.push(["clearContent", name, r]); for (let i = 0; i < nr; i += 1) values[r + i - 1] = Array(width).fill(""); }
      };
    }
  };
  return sheet;
}

const PLACE_ID = "plc-6d706013-ce22-46a6-b2e1-061a8da902b7";
function load({ props = PROPS, admin = { admin_id: "ADM-editor", role: "editor" }, uploads = [], places, statuses = [], lock = true, uploadSheetOptions, now = "2026-10-30T14:00:00.000Z", onFetch, onUploadWrite, noUploadSheet = false } = {}) {
  const log = [], fetches = [], lockEvents = [], objects = new Set(), cacheStore = new Map(), cacheRemovals = [], sleeps = [], warnings = [];
  let lockHeld = false;
  const queue = statuses.slice();
  const store = Object.assign({}, props); // Script Properties of this run (R2 storage events are written here)
  const sheets = {
    places: fakeSheet("places", [PLACE_HEADERS, ...(places || [[PLACE_ID, "สถานที่ทดสอบ", "published"], ["BTK-001", "บ้าน", "draft"], ["plc_under", "x", "published"]])], log),
    media_uploads: fakeSheet("media_uploads", [UPLOAD_HEADERS, ...uploads], log, uploadSheetOptions),
    activity_logs: fakeSheet("activity_logs", [AUDIT_HEADERS], log)
  };
  if (noUploadSheet) delete sheets.media_uploads;
  if (onUploadWrite && sheets.media_uploads) {
    const original = sheets.media_uploads.getRange;
    sheets.media_uploads.getRange = (...args) => {
      const range = original(...args);
      const setValues = range.setValues;
      range.setValues = (grid) => { setValues(grid); onUploadWrite(sheets.media_uploads, args[0]); };
      return range;
    };
  }
  let uuid = 0;
  const context = {
    console: { log() {}, warn: (...parts) => warnings.push(parts.join(" ")) }, JSON, Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return Date.parse(now); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets[n] || null }), flush: () => log.push(["flush"]) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
      put: (k, v) => cacheStore.set(k, v),
      remove: (k) => { cacheRemovals.push({ key: k, lockHeld }); cacheStore.delete(k); }
    }) },
    LockService: { getScriptLock: () => ({
      tryLock: (ms) => { lockEvents.push(["tryLock", ms]); if (lock) lockHeld = true; return lock; },
      releaseLock: () => { lockEvents.push(["release"]); lockHeld = false; }
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      newBlob: (text) => ({ getBytes: () => toSigned(Buffer.from(String(text), "utf8")) }),
      base64Decode: (text) => { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4) throw new Error("Invalid argument: base64"); return toSigned(Buffer.from(text, "base64")); },
      computeDigest: (_a, bytes) => toSigned(crypto.createHash("sha256").update(toBuffer(bytes)).digest()),
      computeHmacSha256Signature: (value, key) => toSigned(crypto.createHmac("sha256", toBuffer(key)).update(toBuffer(value)).digest()),
      formatDate: (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
      getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
      sleep: (ms) => sleeps.push({ ms, lockHeld })
    },
    UrlFetchApp: { fetch: (url, options) => {
      const key = url.split("/takhun-media-staging/")[1];
      fetches.push({ url, method: options.method, lockHeld, bytes: options.payload ? options.payload.length : 0, key });
      if (onFetch) onFetch(sheets, fetches.length, objects, options.method, key);
      // Queued statuses first; otherwise a stateful bucket: PUT stores, DELETE removes, ranged GET = 206 / 404.
      const next = queue.length ? queue.shift() : null;
      if (next instanceof Error) throw next;
      let status = next;
      if (status === null) {
        if (options.method === "put") { objects.add(key); status = 200; }
        else if (options.method === "delete") { objects.delete(key); status = 204; }
        else status = objects.has(key) ? 206 : 404;
      } else if (options.method === "put" && status === 200) objects.add(key);
      return { getResponseCode: () => status, getHeaders: () => ({}) };
    } },
    AuthService_requireAdmin_: (token) => { if (token !== "good-token") throw new Error("UNAUTHORIZED"); return admin; }
  };
  vm.createContext(context);
  for (const [name, source] of SOURCES) vm.runInContext(source, context, { filename: `apps-script/${name}` });
  return { context, sheets, log, fetches, lockEvents, objects, cacheRemovals, sleeps, warnings, store };
}

(async () => {
  // ---- 5a: helpers ----
  await test("keys: lower-case place id, first 32 hex of the large file's SHA-256, .webp or .jpg (allowed by R2SigV4)", () => {
    const { context } = load();
    const sha = "86be52bdb7547413cafb3ed175a806a798c65de98b40849e0b974c47d187de65";
    const webp = context.MediaUploadService_keys_("BTK-001", sha, "webp");
    assert.deepEqual({ ...webp }, { large: "uploads/places/btk-001/86be52bdb7547413cafb3ed175a806a7-1600.webp", small: "uploads/places/btk-001/86be52bdb7547413cafb3ed175a806a7-800.webp" });
    const jpeg = context.MediaUploadService_keys_(PLACE_ID, sha, "jpeg");
    assert.equal(jpeg.large, `uploads/places/${PLACE_ID}/86be52bdb7547413cafb3ed175a806a7-1600.jpg`);
    for (const key of [webp.large, webp.small, jpeg.large, jpeg.small]) assert.equal(code(() => context.R2SigV4_assertKey_(key)), "OK");
    assert.equal(code(() => context.MediaUploadService_keys_("plc_under", sha, "webp")), "VALIDATION_ERROR", "underscore cannot be a key segment");
  });

  await test("Bangkok day of an ISO timestamp (UTC+7, no DST) for the daily cap", () => {
    const { context } = load();
    assert.equal(context.MediaUploadService_bangkokDay_("2026-10-30T16:59:59.999Z"), "2026-10-30");
    assert.equal(context.MediaUploadService_bangkokDay_("2026-10-30T17:00:00.000Z"), "2026-10-31");
    assert.equal(context.MediaUploadService_bangkokDay_("not a date"), "");
  });

  await test("payload: exact keys, place id, format, base64 strings, optional captions (TH/EN <= 200, D13)", () => {
    const { context } = load();
    const ok = { place_id: "BTK-001", format: "webp", large_b64: "AAAA", small_b64: "AAAA" };
    assert.equal(code(() => context.MediaUploadService_uploadPayload_(ok)), "OK");
    assert.equal(code(() => context.MediaUploadService_uploadPayload_({ ...ok, caption_th: "ทะเลสาบ", caption_en: "Lake" })), "OK");
    const parsed = context.MediaUploadService_uploadPayload_({ ...ok, caption_th: "  ทะเลสาบ  " });
    assert.equal(parsed.caption_th, "ทะเลสาบ");
    assert.equal(parsed.caption_en, "");
    for (const bad of [null, [], "x", {}, { ...ok, extra: 1 }, { ...ok, place_id: "" }, { ...ok, place_id: "a b" }, { ...ok, place_id: 5 },
      { ...ok, format: "png" }, { ...ok, format: "WEBP" }, { ...ok, large_b64: "" }, { ...ok, small_b64: 7 },
      { ...ok, caption_th: "ก".repeat(201) }, { ...ok, caption_en: 5 }, { ...ok, caption_en: "a\u0000b" }]) {
      assert.equal(code(() => context.MediaUploadService_uploadPayload_(bad)), "VALIDATION_ERROR", JSON.stringify(bad).slice(0, 80));
    }
    // A base64 string too long to be under the byte caps is refused before decoding (no large allocations).
    assert.equal(code(() => context.MediaUploadService_uploadPayload_({ ...ok, large_b64: "A".repeat(2796208) })), "IMAGE_SIZE");
    assert.equal(code(() => context.MediaUploadService_uploadPayload_({ ...ok, small_b64: "A".repeat(819204) })), "IMAGE_SIZE");
  });

  await test("captions: stored escaped when they start with = + - @, verify accepts the apostrophe being consumed (T5)", () => {
    const { context } = load();
    assert.equal(context.MediaUploadService_storedText_("=1+1"), "'=1+1");
    assert.equal(context.MediaUploadService_storedText_("@home"), "'@home");
    assert.equal(context.MediaUploadService_storedText_("ปกติ"), "ปกติ");
    assert.equal(context.MediaUploadService_sameText_("=1+1", "=1+1"), true);
    assert.equal(context.MediaUploadService_sameText_("'=1+1", "=1+1"), true);
    assert.equal(context.MediaUploadService_sameText_("=1+2", "=1+1"), false);
  });

  await test("row 1001+: the destination row is added and formatted plain text (@) before writing (D-task 5 check)", () => {
    const filled = Array.from({ length: 999 }, (_, i) => [`UPL-${i}`, "place", "BTK-001", "deleted", ...Array(21).fill("x")]);
    const env = load({ uploads: filled });
    const sheet = env.sheets.media_uploads;
    assert.equal(sheet.getLastRow(), 1000);
    assert.equal(sheet.getMaxRows(), 1000);
    // Before the fix the existing guard style read of row 1001 is out of bounds:
    assert.throws(() => sheet.getRange(1001, 1, 1, 25).getNumberFormats(), /out of bounds/);
    env.context.MediaUploadService_prepareRow_(sheet, 1001, 25);
    assert.equal(sheet.getMaxRows(), 1001);
    assert.deepEqual(sheet.getRange(1001, 1, 1, 25).getNumberFormats()[0], Array(25).fill("@"));
    assert.deepEqual(env.log.filter((e) => e[0] !== "flush").map((e) => e[0]), ["insertRowsAfter", "setNumberFormat"]);
  });

  await test("a row inside the sheet that is already plain text is not touched; a non-@ row inside is set to @", () => {
    const env = load();
    env.context.MediaUploadService_prepareRow_(env.sheets.media_uploads, 2, 25);
    assert.deepEqual(env.log, []);
    env.sheets.media_uploads.formats[2][4] = "0";
    env.context.MediaUploadService_prepareRow_(env.sheets.media_uploads, 3, 25);
    assert.deepEqual(env.log.map((e) => e[0]), ["setNumberFormat"]);
    assert.equal(env.sheets.media_uploads.formats[2][4], "@");
  });

  // ---- 5b: adminUploadPlaceImage_ ----
  const pic = (w, h, format) => sharp({ create: { width: w, height: h, channels: 3, background: "#2a7a50" } })[format === "jpeg" ? "jpeg" : "webp"]().toBuffer();
  const LARGE = await pic(1600, 1200, "webp"), SMALL = await pic(800, 600, "webp");
  const SHA = crypto.createHash("sha256").update(LARGE).digest("hex");
  const KEY_LARGE = `uploads/places/${PLACE_ID}/${SHA.slice(0, 32)}-1600.webp`, KEY_SMALL = `uploads/places/${PLACE_ID}/${SHA.slice(0, 32)}-800.webp`;
  const payload = (extra = {}) => ({ place_id: PLACE_ID, format: "webp", large_b64: LARGE.toString("base64"), small_b64: SMALL.toString("base64"), ...extra });
  const row = (values) => UPLOAD_HEADERS.map((h) => (values[h] !== undefined ? String(values[h]) : ""));
  const active = (n, extra = {}) => row({ upload_id: `UPL-old-${n}`, entity_type: "place", entity_id: PLACE_ID, status: "active", object_state: "stored", sort_order: n, sha256: String(n).padStart(64, "a"), created_at: "2026-10-01T00:00:00.000Z", ...extra });
  const rows = (env) => env.sheets.media_uploads.values.slice(1).filter((r) => r.some((v) => v !== ""));
  const audits = (env) => env.sheets.activity_logs.values.slice(1).filter((r) => r.some((v) => v !== ""));
  const writes = (env) => env.log.filter((e) => e[0] === "setValues" || e[0] === "clearContent");
  const upload = (env, extra, token = "good-token") => JSON.parse(JSON.stringify(env.context.adminUploadPlaceImage_(token, payload(extra))));

  await test("editor uploads one photo: 2 PUTs outside the lock, 1 verified row, 1 audit row MEDIA_UPLOAD (criteria 1, 11, 12)", () => {
    const env = load();
    const res = upload(env);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.data.duplicate, false);
    assert.equal(res.data.audit_status, "recorded");
    const item = res.data.item;
    assert.match(item.upload_id, /^UPL-[0-9a-f-]{36}$/);
    assert.deepEqual({ ...item, upload_id: "x" }, { upload_id: "x", place_id: PLACE_ID, sort_order: 1, is_cover: false, format: "webp",
      key_large: KEY_LARGE, key_small: KEY_SMALL, width_large: 1600, height_large: 1200, width_small: 800, height_small: 600,
      caption_th: "", caption_en: "", created_at: "2026-10-30T14:00:00.000Z" });
    // After the row is saved (lock released) both files are checked once more (T15 ranged GET).
    assert.deepEqual(env.fetches.map((f) => [f.method, f.key, f.lockHeld]), [["put", KEY_LARGE, false], ["put", KEY_SMALL, false], ["get", KEY_LARGE, false], ["get", KEY_SMALL, false]]);
    assert.equal(res.data.files_verified, true);
    assert.deepEqual([...env.objects].sort(), [KEY_LARGE, KEY_SMALL].sort());
    assert.deepEqual(env.lockEvents, [["tryLock", 10000], ["release"]]);
    const stored = Object.fromEntries(UPLOAD_HEADERS.map((h, i) => [h, rows(env)[0][i]]));
    assert.deepEqual(stored, { upload_id: item.upload_id, entity_type: "place", entity_id: PLACE_ID, status: "active", object_state: "stored",
      is_cover: "false", sort_order: "1", format: "webp", sha256: SHA, key_large: KEY_LARGE, key_small: KEY_SMALL,
      width_large: "1600", height_large: "1200", bytes_large: String(LARGE.length), width_small: "800", height_small: "600", bytes_small: String(SMALL.length),
      caption_th: "", caption_en: "", created_at: "2026-10-30T14:00:00.000Z", created_by: "ADM-editor", updated_at: "2026-10-30T14:00:00.000Z",
      updated_by: "ADM-editor", deleted_at: "", deleted_by: "" });
    const audit = Object.fromEntries(AUDIT_HEADERS.map((h, i) => [h, audits(env)[0][i]]));
    assert.equal(audit.action, "MEDIA_UPLOAD");
    assert.equal(audit.entity_type, "place");
    assert.equal(audit.entity_id, PLACE_ID);
    assert.equal(audit.description, item.upload_id);
    assert.equal(audit.admin_id, "ADM-editor");
    assert.equal(audit.actor_admin_id, "ADM-editor");
  });

  await test("super_admin may upload; reviewer and viewer get FORBIDDEN with nothing written (criterion 1, C5)", () => {
    assert.equal(upload(load({ admin: { admin_id: "ADM-root", role: "super_admin" } })).ok, true);
    for (const role of ["reviewer", "viewer"]) {
      const env = load({ admin: { admin_id: "ADM-r", role } });
      const res = upload(env);
      assert.equal(res.error.code, "FORBIDDEN");
      assert.equal(res.error.message, "คุณไม่มีสิทธิ์ดำเนินการนี้");
      assert.deepEqual([env.fetches.length, writes(env).length, env.lockEvents.length], [0, 0, 0]);
    }
    assert.equal(upload(load(), {}, "bad").error.code, "UNAUTHORIZED");
  });

  await test("switch off (MEDIA_UPLOAD_ENABLED not \"true\"): UPLOAD_DISABLED, no R2 call (T9, criterion 8)", () => {
    const env = load({ props: { ...PROPS, MEDIA_UPLOAD_ENABLED: "false" } });
    const res = upload(env);
    assert.equal(res.error.code, "UPLOAD_DISABLED");
    assert.equal(env.fetches.length, 0);
  });

  await test("bad files are IMAGE_REJECTED with a reason and a Thai message, before any R2 call (criteria 2, 4, D23)", async () => {
    const exif = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#123" } }).webp().withExif({ IFD3: { GPSLatitudeRef: "N" } }).toBuffer();
    const narrow = await pic(999, 750, "webp"), narrowSmall = await pic(800, 601, "webp");
    const wide = await pic(1600, 300, "webp"), wideSmall = await pic(800, 150, "webp");
    const png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#123" } }).png().toBuffer();
    for (const [extra, reason, message] of [
      [{ large_b64: exif.toString("base64") }, "exif", /EXIF/],
      [{ large_b64: narrow.toString("base64"), small_b64: narrowSmall.toString("base64") }, "width", /1000/],
      [{ large_b64: wide.toString("base64"), small_b64: wideSmall.toString("base64") }, "aspect", /ครอป/],
      [{ large_b64: png.toString("base64") }, "format", /WebP|JPEG/],
      [{ format: "jpeg" }, "mismatch", /.+/],
      [{ large_b64: "A".repeat(2796208) }, "size", /.+/]
    ]) {
      const env = load();
      const res = upload(env, extra);
      assert.equal(res.error.code, "IMAGE_REJECTED", reason);
      assert.equal(res.error.reason, reason);
      assert.match(res.error.message, message);
      assert.deepEqual([env.fetches.length, writes(env).length], [0, 0]);
    }
    assert.equal(upload(load(), { large_b64: "not base64!" }).error.code, "VALIDATION_ERROR");
  });

  await test("unknown or archived place: NOT_FOUND, no R2 call", () => {
    const env = load({ places: [[PLACE_ID, "x", "archived"]] });
    assert.equal(upload(env).error.code, "NOT_FOUND");
    assert.equal(upload(load(), { place_id: "PLC-NOPE" }).error.code, "NOT_FOUND");
    assert.equal(env.fetches.length, 0);
  });

  await test("photo 21: LIMIT_PLACE before any R2 call; deleted rows and other places do not count (D1, criterion 4)", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => active(i + 1));
    const env = load({ uploads: twenty });
    assert.equal(upload(env).error.code, "LIMIT_PLACE");
    assert.equal(env.fetches.length, 0);
    const mixed = [...Array.from({ length: 19 }, (_, i) => active(i + 1)), active(30, { status: "deleted" }), active(31, { entity_id: "BTK-001" })];
    assert.equal(upload(load({ uploads: mixed })).ok, true);
  });

  await test("daily cap counts every upload created today in Bangkok time, all places, any status (D10, criterion 4)", () => {
    const today = (n, extra) => active(100 + n, { entity_id: "BTK-001", status: n % 2 ? "deleted" : "active", created_at: "2026-10-29T17:30:00.000Z", ...extra });
    const env = load({ uploads: Array.from({ length: 100 }, (_, i) => today(i)) });
    assert.equal(upload(env).error.code, "LIMIT_DAILY");
    assert.equal(env.fetches.length, 0);
    const yesterday = Array.from({ length: 100 }, (_, i) => today(i, { created_at: "2026-10-29T16:59:59.000Z" }));
    assert.equal(upload(load({ uploads: yesterday })).ok, true);
    const small = load({ props: { ...PROPS, MEDIA_UPLOAD_DAILY_LIMIT: "2" }, uploads: [today(0), today(1)] });
    assert.equal(upload(small).error.code, "LIMIT_DAILY");
  });

  await test("R2 refuses (bad or revoked token): STORAGE_ERROR \"ไม่ได้บันทึกข้อมูล\", nothing written, lock never taken (criterion 9)", () => {
    const env = load({ statuses: [403] });
    const res = upload(env);
    assert.equal(res.error.code, "STORAGE_ERROR");
    assert.match(res.error.message, /^ไม่ได้บันทึกข้อมูล/);
    assert.deepEqual([writes(env).length, env.lockEvents.length], [0, 0]);
    assert.deepEqual([env.fetches.length, env.sleeps.length], [1, 0], "a wrong key (403) is never retried: refused at once");
    assert.deepEqual(env.warnings, ["R2 PUT 1600 failed: 403"]);
    const noConfig = load({ props: { SPREADSHEET_ID: "staging-spreadsheet-id", MEDIA_UPLOAD_ENABLED: "true" } });
    assert.equal(upload(noConfig).error.code, "STORAGE_ERROR");
    assert.equal(noConfig.fetches.length, 0);
  });

  await test("failure midway (large stored, small fails): no row, the stored file is deleted again outside the lock (criterion 10)", () => {
    const env = load({ statuses: [200, 500, 500, 500, 204] }); // the small file fails on every attempt (2 retries)
    const res = upload(env);
    assert.equal(res.error.code, "STORAGE_ERROR");
    assert.deepEqual(env.fetches.map((f) => [f.method, f.key, f.lockHeld]), [["put", KEY_LARGE, false], ["put", KEY_SMALL, false], ["put", KEY_SMALL, false], ["put", KEY_SMALL, false], ["delete", KEY_LARGE, false]]);
    assert.deepEqual(env.warnings, ["R2 PUT 800 failed: 500, 500, 500"]);
    assert.deepEqual(rows(env), []);
    const network = load({ statuses: [200, new Error("Address unavailable: https://0123.r2.cloudflarestorage.com/x"), new Error("Address unavailable: https://0123.r2.cloudflarestorage.com/x"), new Error("Address unavailable: https://0123.r2.cloudflarestorage.com/x")] });
    const failed = upload(network);
    assert.equal(failed.error.code, "STORAGE_ERROR");
    assert.equal(JSON.stringify(failed).includes("cloudflarestorage"), false);
  });

  await test("sending the same photo again: duplicate, no second row, no new R2 call (criterion 10)", () => {
    const env = load();
    const first = upload(env);
    const again = upload(env);
    assert.equal(again.ok, true);
    assert.equal(again.data.duplicate, true);
    assert.equal(again.data.item.upload_id, first.data.item.upload_id);
    assert.equal(rows(env).length, 1);
    assert.equal(audits(env).length, 1);
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "put", "get", "get"], "the resend makes no R2 call");
  });

  // ---- race fix (owner review of task 5): a cleanup must never remove a file an active row uses ----
  const rowA = () => row({ upload_id: "UPL-A", entity_type: "place", entity_id: PLACE_ID, status: "active", object_state: "stored", sort_order: 1,
    format: "webp", sha256: SHA, key_large: KEY_LARGE, key_small: KEY_SMALL, created_at: "2026-10-30T13:59:00.000Z" });

  await test("race 1: A's row is already saved when B (BUSY) cleans up: B re-reads media_uploads and skips both shared keys", () => {
    const env = load({ lock: false, onFetch: (sheets, n) => { if (n === 2) sheets.media_uploads.values.push(rowA()); } });
    assert.equal(upload(env).error.code, "BUSY");
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "put"], "no DELETE of a key an active row uses");
    assert.deepEqual([...env.objects].sort(), [KEY_LARGE, KEY_SMALL].sort());
  });

  await test("race 2: A saves its row while B is deleting: B re-reads after deleting and puts the files back", () => {
    const env = load({ lock: false, onFetch: (sheets, n, _objects, method) => {
      if (method === "delete" && n === 3) sheets.media_uploads.values.push(rowA()); // A commits between B's check and B's delete
    } });
    assert.equal(upload(env).error.code, "BUSY");
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "put", "delete", "delete", "put", "put"]);
    assert.deepEqual([...env.objects].sort(), [KEY_LARGE, KEY_SMALL].sort(), "A's files exist at the end");
  });

  await test("race 3: B deleted before A saved its row: A's post-save check finds the files missing and uploads them again", () => {
    const env = load({ onUploadWrite: (_sheet, rowNumber) => { if (rowNumber > 1) env.objects.clear(); } });
    const res = upload(env);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.data.files_verified, true);
    assert.deepEqual(env.fetches.map((f) => [f.method, f.key, f.lockHeld]), [["put", KEY_LARGE, false], ["put", KEY_SMALL, false],
      ["get", KEY_LARGE, false], ["put", KEY_LARGE, false], ["get", KEY_SMALL, false], ["put", KEY_SMALL, false]]);
    assert.deepEqual([...env.objects].sort(), [KEY_LARGE, KEY_SMALL].sort());
  });

  await test("post-save check failing does not undo the upload: ok, files_verified false", () => {
    const env = load({ statuses: [200, 200, 500, 500, 500] }); // the existence check fails on every attempt
    const res = upload(env);
    assert.equal(res.ok, true);
    assert.equal(res.data.files_verified, false);
    assert.equal(rows(env).length, 1);
  });

  // Task 15, 5 Nov: run7_03 / run7_13 got STORAGE_ERROR and a file delete failed on staging; R2 calls now retry.
  await test("a transient R2 failure during an upload is retried (1 s) outside the lock: the photo is saved, one log line", () => {
    const env = load({ statuses: [200, 503] }); // the small file's first attempt gets 503, the retry succeeds
    const res = upload(env);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.data.files_verified, true);
    assert.equal(rows(env).length, 1);
    assert.deepEqual(env.fetches.map((f) => [f.method, f.key, f.lockHeld]), [["put", KEY_LARGE, false], ["put", KEY_SMALL, false], ["put", KEY_SMALL, false], ["get", KEY_LARGE, false], ["get", KEY_SMALL, false]]);
    assert.deepEqual(env.sleeps, [{ ms: 1000, lockHeld: false }], "the wait never holds the script lock");
    assert.deepEqual(env.warnings, ["R2 PUT 800 ok after retry: 503, 200"]);
    const dropped = load({ statuses: [new Error("Address unavailable: https://0123.r2.cloudflarestorage.com/x")] }); // a dropped connection on the large file
    assert.equal(upload(dropped).ok, true);
    assert.deepEqual(dropped.warnings, ["R2 PUT 1600 ok after retry: network, 200"]);
  });

  await test("cleanup when media_uploads cannot be re-read: nothing is deleted (an unlinked file is accepted, D16)", () => {
    let reads = 0;
    const env = load({ lock: false });
    const original = env.context.SheetService_readTable_;
    env.context.SheetService_readTable_ = (name, headers) => {
      if (name === "media_uploads" && ++reads > 1) throw new Error("Sheet unavailable");
      return original(name, headers);
    };
    assert.equal(upload(env).error.code, "BUSY");
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "put"]);
  });

  await test("lock busy: BUSY, no row, the uploaded files are deleted again outside the lock", () => {
    const env = load({ lock: false });
    const res = upload(env);
    assert.equal(res.error.code, "BUSY");
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "put", "delete", "delete"]);
    assert.deepEqual(rows(env), []);
  });

  await test("limit reached by another admin while the files were uploading: LIMIT_PLACE under the lock, files deleted after", () => {
    const env = load({ uploads: Array.from({ length: 19 }, (_, i) => active(i + 1)), onFetch: (sheets, n) => {
      if (n === 2) sheets.media_uploads.values.push(active(40));
    } });
    assert.equal(upload(env).error.code, "LIMIT_PLACE");
    assert.deepEqual(env.fetches.map((f) => [f.method, f.lockHeld]), [["put", false], ["put", false], ["delete", false], ["delete", false]]);
    assert.equal(rows(env).length, 20);
  });

  await test("sort order: after the highest active photo of the place; captions starting with = are stored and verified (T5)", () => {
    const env = load({ uploads: [active(1), active(2), active(7, { status: "deleted" }), active(9, { entity_id: "BTK-001" })] });
    const res = upload(env, { caption_th: "=ทะเลสาบ", caption_en: "@lake" });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.data.item.sort_order, 3);
    assert.equal(res.data.item.caption_th, "=ทะเลสาบ");
    assert.equal(res.data.item.caption_en, "@lake");
  });

  await test("row cannot be verified after writing: OUTCOME_UNKNOWN, files are NOT deleted (the row may exist)", () => {
    const env = load({ onUploadWrite: (sheet, rowNumber) => { if (rowNumber > 1) sheet.values[rowNumber - 1][6] = "99"; } });
    const res = upload(env);
    assert.equal(res.error.code, "OUTCOME_UNKNOWN");
    assert.match(res.error.message, /ไม่แน่ใจผล/);
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "put"]);
    assert.deepEqual(env.lockEvents.at(-1), ["release"]);
  });

  await test("row 1001 end to end: the sheet grows by one plain-text row and the upload is verified", () => {
    const filled = Array.from({ length: 999 }, (_, i) => active(500 + i, { entity_id: "BTK-001", status: "deleted" }));
    const env = load({ uploads: filled, uploadSheetOptions: { newRowFormat: "" } });
    const res = upload(env);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(env.sheets.media_uploads.getMaxRows(), 1001);
    assert.equal(env.sheets.media_uploads.values[1000][0], res.data.item.upload_id);
  });

  await test("destination row cannot be made plain text: no row, SERVER_ERROR, files deleted again", () => {
    const env = load();
    const sheet = env.sheets.media_uploads;
    const original = sheet.getRange;
    sheet.getRange = (...args) => { const range = original(...args); if (args[0] === 2) { range.getNumberFormats = () => [Array(25).fill("0")]; } return range; };
    const res = upload(env);
    assert.equal(res.error.code, "SERVER_ERROR");
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "put", "delete", "delete"]);
    assert.deepEqual(rows(env), []);
  });

  await test("media_uploads sheet missing: SERVER_ERROR before any R2 call", () => {
    const env = load({ noUploadSheet: true });
    assert.equal(upload(env).error.code, "SERVER_ERROR");
    assert.equal(env.fetches.length, 0);
  });

  await test("Router: POST body adminUploadPlaceImage reaches the real action; GET and query tokens do not", () => {
    const env = load();
    env.context.ContentService = { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) };
    for (const name of ["ApiResponse.gs", "Router.gs"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "apps-script", name), "utf8"), env.context, { filename: name });
    const post = (body, parameter = {}) => JSON.parse(env.context.routeRequest_("POST", { parameter, postData: { contents: JSON.stringify(body) } }).text);
    const res = post({ action: "adminUploadPlaceImage", token: "good-token", payload: payload() }, { token: "query-token" });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(rows(env).length, 1);
    const viaGet = JSON.parse(env.context.routeRequest_("GET", { parameter: { action: "adminUploadPlaceImage", token: "good-token" } }).text);
    assert.equal(viaGet.error.code, "UNKNOWN_ACTION");
    assert.equal(post({ action: "adminUploadPlaceImage", token: "bad", payload: payload() }, { token: "good-token" }).error.code, "UNAUTHORIZED");
  });

  await test("responses never contain R2 config values, signatures or storage URLs", () => {
    for (const env of [load(), load({ statuses: [403] }), load({ lock: false })]) {
      const text = JSON.stringify(upload(env));
      for (const secret of [PROPS.R2_SECRET_ACCESS_KEY, PROPS.R2_ACCESS_KEY_ID, PROPS.R2_ACCOUNT_ID, "Signature", "r2.cloudflarestorage"]) assert.equal(text.includes(secret), false, secret);
    }
  });

  await test("owner rule (3): the activity_logs fix touches only the new audit row (rows added at the end, one row formatted)", () => {
    const env = load();
    const audit = env.sheets.activity_logs;
    for (let i = 0; i < 999; i += 1) audit.values.push(["L", "A", "X", "place", "P", "d", "t", `AU-${i}`, "A", "t"]);
    audit.formats[500][3] = "0"; // an existing row that is not plain text must stay as it is
    const res = upload(env);
    assert.equal(res.ok, true);
    assert.equal(res.data.audit_status, "recorded");
    const auditWrites = env.log.filter((e) => e[1] === "activity_logs");
    assert.deepEqual(auditWrites.map((e) => e[0]), ["insertRowsAfter", "setNumberFormat", "setValues"]);
    assert.deepEqual(auditWrites[1].slice(2), [1001, 1, 1, 10, "@"], "format only row 1001");
    assert.equal(audit.formats[500][3], "0");
  });

  // ---- task 6a: adminGetPlaceUploads (read) ----
  const read = (env, body = { place_id: PLACE_ID }, token = "good-token") => JSON.parse(JSON.stringify(env.context.adminGetPlaceUploads_(token, body)));

  await test("6a read: every admin role can read; items are the place's active photos in sort order; captions unescaped", () => {
    const uploads = [
      active(2, { upload_id: "UPL-b", caption_th: "'=ทะเล", is_cover: "true", key_large: "kL2", key_small: "kS2", format: "jpeg", width_large: 1000, height_large: 750, width_small: 800, height_small: 600 }),
      active(1, { upload_id: "UPL-a", is_cover: "false" }),
      active(3, { upload_id: "UPL-gone", status: "deleted", object_state: "delete_pending" }),
      active(4, { upload_id: "UPL-other", entity_id: "BTK-001" })
    ];
    for (const role of ["super_admin", "editor", "reviewer", "viewer"]) {
      const env = load({ admin: { admin_id: "ADM-x", role }, uploads });
      const res = read(env);
      assert.equal(res.ok, true, role);
      assert.deepEqual(res.data.items.map((i) => i.upload_id), ["UPL-a", "UPL-b"]);
      assert.equal(res.data.items[1].caption_th, "=ทะเล");
      assert.equal(res.data.items[1].is_cover, true);
      assert.equal(res.data.items[1].format, "jpeg");
      assert.equal(res.data.can_write, role === "super_admin" || role === "editor");
      assert.equal(res.data.delete_pending, 1);
      assert.deepEqual([env.fetches.length, writes(env).length, env.lockEvents.length], [0, 0, 0], "read is read-only, no R2");
    }
  });

  await test("6a read: switch state and limits (per place 20, daily left, byte caps)", () => {
    const todayRows = [active(1, { created_at: "2026-10-30T01:00:00.000Z" }), active(2, { entity_id: "BTK-001", created_at: "2026-10-30T02:00:00.000Z" })];
    const on = read(load({ uploads: todayRows, props: { ...PROPS, MEDIA_UPLOAD_DAILY_LIMIT: "5" } }));
    assert.equal(on.data.enabled, true);
    assert.deepEqual(on.data.limits, { per_place: 20, daily_left: 3, max_bytes_large: 2097152, max_bytes_small: 614400 });
    const off = read(load({ props: { ...PROPS, MEDIA_UPLOAD_ENABLED: "false" } }));
    assert.equal(off.data.enabled, false);
    assert.equal(off.data.limits.daily_left, 100);
  });

  await test("6a read: errors (bad payload, unknown place, no session, sheet missing); archived places can still be read", () => {
    for (const body of [null, {}, { place_id: "" }, { place_id: PLACE_ID, extra: 1 }]) assert.equal(read(load(), body).error.code, "VALIDATION_ERROR");
    assert.equal(read(load(), { place_id: "PLC-NOPE" }).error.code, "NOT_FOUND");
    assert.equal(read(load(), undefined, "bad").error.code, "UNAUTHORIZED");
    assert.equal(read(load({ noUploadSheet: true })).error.code, "SERVER_ERROR");
    assert.equal(read(load({ places: [[PLACE_ID, "x", "archived"]] })).ok, true);
  });

  // ---- task 6b: adminDeletePlaceUpload ----
  const photo = (id, n, extra = {}) => active(n, { upload_id: id, key_large: `uploads/places/${PLACE_ID}/${String(n).repeat(32).slice(0, 32)}-1600.webp`,
    key_small: `uploads/places/${PLACE_ID}/${String(n).repeat(32).slice(0, 32)}-800.webp`, ...extra });
  const del = (env, body, token = "good-token") => JSON.parse(JSON.stringify(env.context.adminDeletePlaceUpload_(token, body)));
  const field = (env, id, name) => { const r = rows(env).find((x) => x[0] === id); return r ? r[UPLOAD_HEADERS.indexOf(name)] : undefined; };

  await test("6b delete: row first (status deleted, delete_pending), files deleted outside the lock, then object_state deleted; audit MEDIA_DELETE", () => {
    const env = load({ uploads: [photo("UPL-a", 1), photo("UPL-b", 2, { is_cover: "true" })] });
    const keys = [field(env, "UPL-b", "key_large"), field(env, "UPL-b", "key_small")];
    keys.forEach((k) => env.objects.add(k));
    const res = del(env, { place_id: PLACE_ID, upload_id: "UPL-b", expected_ids: ["UPL-a", "UPL-b"] });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.data, { deleted: true, file_deleted: true, audit_status: "recorded" });
    assert.deepEqual(env.fetches.map((f) => [f.method, f.key, f.lockHeld]), [["delete", keys[0], false], ["delete", keys[1], false]]);
    assert.deepEqual([...env.objects], []);
    assert.equal(field(env, "UPL-b", "status"), "deleted");
    assert.equal(field(env, "UPL-b", "object_state"), "deleted");
    assert.equal(field(env, "UPL-b", "is_cover"), "false");
    assert.equal(field(env, "UPL-b", "deleted_by"), "ADM-editor");
    assert.equal(field(env, "UPL-b", "deleted_at"), "2026-10-30T14:00:00.000Z");
    assert.equal(field(env, "UPL-a", "status"), "active");
    assert.equal(env.lockEvents.filter((e) => e[0] === "tryLock").length, 2);
    const audit = Object.fromEntries(AUDIT_HEADERS.map((h, i) => [h, audits(env)[0][i]]));
    assert.deepEqual([audit.action, audit.entity_id, audit.description], ["MEDIA_DELETE", PLACE_ID, "UPL-b"]);
  });

  await test("6b delete: reviewer/viewer FORBIDDEN; works with the switch off (D11) and for an archived place (C4)", () => {
    for (const role of ["reviewer", "viewer"]) {
      const env = load({ admin: { admin_id: "ADM-r", role }, uploads: [photo("UPL-a", 1)] });
      assert.equal(del(env, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a"] }).error.code, "FORBIDDEN");
      assert.deepEqual([env.fetches.length, writes(env).length], [0, 0]);
    }
    const off = load({ props: { ...PROPS, MEDIA_UPLOAD_ENABLED: "false" }, uploads: [photo("UPL-a", 1)] });
    assert.equal(del(off, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a"] }).ok, true);
    const archived = load({ places: [[PLACE_ID, "x", "archived"]], uploads: [photo("UPL-a", 1)] });
    assert.equal(del(archived, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a"] }).ok, true);
  });

  await test("6b delete: list changed by someone else -> CONFLICT; unknown photo -> NOT_FOUND; bad payload -> VALIDATION_ERROR; nothing written", () => {
    const base = () => load({ uploads: [photo("UPL-a", 1), photo("UPL-b", 2), photo("UPL-x", 3, { entity_id: "BTK-001" })] });
    for (const [body, code] of [
      [{ place_id: PLACE_ID, upload_id: "UPL-b", expected_ids: ["UPL-b", "UPL-a"] }, "CONFLICT"],
      [{ place_id: PLACE_ID, upload_id: "UPL-b", expected_ids: ["UPL-a"] }, "CONFLICT"],
      [{ place_id: PLACE_ID, upload_id: "UPL-x", expected_ids: ["UPL-a", "UPL-b"] }, "NOT_FOUND"],
      [{ place_id: PLACE_ID, upload_id: "UPL-b" }, "VALIDATION_ERROR"],
      [{ place_id: PLACE_ID, upload_id: "x", expected_ids: [] }, "VALIDATION_ERROR"],
      [{ place_id: PLACE_ID, upload_id: "UPL-b", expected_ids: ["UPL-a", "UPL-a"] }, "VALIDATION_ERROR"],
      [{ place_id: PLACE_ID, upload_id: "UPL-b", expected_ids: "UPL-a" }, "VALIDATION_ERROR"]
    ]) {
      const env = base();
      assert.equal(del(env, body).error.code, code, JSON.stringify(body));
      assert.deepEqual([env.fetches.length, writes(env).length], [0, 0]);
    }
  });

  await test("6b delete: R2 fails -> the photo is still removed from the site, row stays delete_pending, file_deleted false", () => {
    const env = load({ uploads: [photo("UPL-a", 1)], statuses: [500, 500, 500] }); // every attempt fails
    const res = del(env, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a"] });
    assert.equal(res.ok, true);
    assert.equal(res.data.file_deleted, false);
    assert.ok(env.sleeps.every((s) => !s.lockHeld) && env.fetches.every((f) => !f.lockHeld));
    assert.equal(field(env, "UPL-a", "status"), "deleted");
    assert.equal(field(env, "UPL-a", "object_state"), "delete_pending");
  });

  await test("6b delete: a transient R2 failure on the file delete is retried: file_deleted true, row closed", () => {
    const env = load({ uploads: [photo("UPL-a", 1)], statuses: [500] }); // first DELETE 500, the retry 204
    const res = del(env, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a"] });
    assert.deepEqual([res.ok, res.data.file_deleted], [true, true]);
    assert.equal(field(env, "UPL-a", "object_state"), "deleted");
    assert.deepEqual(env.sleeps, [{ ms: 1000, lockHeld: false }]);
  });

  await test("6b delete: a key another active row still uses is never deleted; the row is closed as deleted", () => {
    const shared = { key_large: "uploads/places/x/shared-1600.webp", key_small: "uploads/places/x/shared-800.webp" };
    const env = load({ uploads: [photo("UPL-a", 1, shared), photo("UPL-b", 2, shared)] });
    const res = del(env, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a", "UPL-b"] });
    assert.equal(res.ok, true);
    assert.equal(res.data.file_deleted, true);
    assert.deepEqual(env.fetches, []);
    assert.equal(field(env, "UPL-a", "object_state"), "deleted");
  });

  await test("6b delete: the status change cannot be verified -> OUTCOME_UNKNOWN and no file is deleted", () => {
    const env = load({ uploads: [photo("UPL-a", 1)], onUploadWrite: (sheet, rowNumber) => { if (rowNumber === 2) sheet.values[1][3] = "active"; } });
    assert.equal(del(env, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a"] }).error.code, "OUTCOME_UNKNOWN");
    assert.deepEqual(env.fetches, []);
  });

  // ---- task 6b: adminRetryPlaceUploadDeletes ----
  const retry = (env, body = { place_id: PLACE_ID }, token = "good-token") => JSON.parse(JSON.stringify(env.context.adminRetryPlaceUploadDeletes_(token, body)));
  const pending = (id, n, extra = {}) => photo(id, n, { status: "deleted", object_state: "delete_pending", ...extra });

  await test("6b retry: deletes the files of this place's delete_pending rows outside the lock and closes them", () => {
    const env = load({ uploads: [pending("UPL-p1", 1), pending("UPL-p2", 2), pending("UPL-o", 3, { entity_id: "BTK-001" }), photo("UPL-a", 4)] });
    const res = retry(env);
    assert.deepEqual(res.data, { retried: 2, still_pending: 0 });
    assert.equal(env.fetches.length, 4);
    assert.ok(env.fetches.every((f) => f.method === "delete" && !f.lockHeld));
    assert.equal(field(env, "UPL-p1", "object_state"), "deleted");
    assert.equal(field(env, "UPL-p2", "object_state"), "deleted");
    assert.equal(field(env, "UPL-o", "object_state"), "delete_pending", "other place untouched");
  });

  await test("6b retry: an R2 failure keeps that row pending; a key a re-uploaded active photo uses is skipped, not deleted", () => {
    const failing = load({ uploads: [pending("UPL-p1", 1), pending("UPL-p2", 2)], statuses: [500, 500, 500] });
    assert.deepEqual(retry(failing).data, { retried: 2, still_pending: 1 });
    const reused = load({ uploads: [pending("UPL-old", 5), photo("UPL-new", 5, { upload_id: "UPL-new" })] });
    assert.deepEqual(retry(reused).data, { retried: 1, still_pending: 0 });
    assert.deepEqual(reused.fetches, [], "the active photo's files are not deleted");
    assert.equal(field(reused, "UPL-old", "object_state"), "deleted");
  });

  await test("6b retry: reviewer/viewer FORBIDDEN; allowed with the switch off; bad payload VALIDATION_ERROR; nothing pending = no R2 call", () => {
    for (const role of ["reviewer", "viewer"]) assert.equal(retry(load({ admin: { admin_id: "ADM-r", role }, uploads: [pending("UPL-p1", 1)] })).error.code, "FORBIDDEN");
    assert.equal(retry(load({ props: { ...PROPS, MEDIA_UPLOAD_ENABLED: "false" }, uploads: [pending("UPL-p1", 1)] })).ok, true);
    assert.equal(retry(load(), { place_id: PLACE_ID, x: 1 }).error.code, "VALIDATION_ERROR");
    const none = load({ uploads: [photo("UPL-a", 1)] });
    assert.deepEqual(retry(none).data, { retried: 0, still_pending: 0 });
    assert.deepEqual(none.fetches, []);
  });

  // ---- task 6c: adminSavePlaceUploads (order, cover, captions) ----
  const save = (env, body, token = "good-token") => JSON.parse(JSON.stringify(env.context.adminSavePlaceUploads_(token, body)));
  const three = () => load({ uploads: [photo("UPL-a", 1, { is_cover: "true" }), photo("UPL-b", 2), photo("UPL-c", 3), photo("UPL-x", 1, { entity_id: "BTK-001", is_cover: "true" })] });
  const body = (extra) => ({ place_id: PLACE_ID, expected_ids: ["UPL-a", "UPL-b", "UPL-c"], order: ["UPL-a", "UPL-b", "UPL-c"], cover_id: "UPL-a", captions: {}, ...extra });
  const actions = (env) => audits(env).map((r) => [r[AUDIT_HEADERS.indexOf("action")], r[AUDIT_HEADERS.indexOf("description")]]);

  await test("6c save: new order -> sort_order 1..n on the changed rows only, audit MEDIA_REORDER, no R2 (criterion 5)", () => {
    const env = three();
    const res = save(env, body({ order: ["UPL-c", "UPL-a", "UPL-b"] }));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.data.items.map((i) => [i.upload_id, i.sort_order]), [["UPL-c", 1], ["UPL-a", 2], ["UPL-b", 3]]);
    assert.deepEqual(res.data.changed, ["MEDIA_REORDER"]);
    assert.deepEqual(actions(env), [["MEDIA_REORDER", "UPL-c,UPL-a,UPL-b"]]);
    assert.equal(field(env, "UPL-x", "sort_order"), "1", "other place untouched");
    assert.deepEqual(env.fetches, []);
    assert.equal(env.lockEvents.filter((e) => e[0] === "tryLock").length, 1);
  });

  await test("6c save: cover -> exactly one is_cover per place; null clears it; audit MEDIA_SET_COVER (criterion 7)", () => {
    const env = three();
    assert.deepEqual(save(env, body({ cover_id: "UPL-b" })).data.changed, ["MEDIA_SET_COVER"]);
    const covers = () => ["UPL-a", "UPL-b", "UPL-c"].map((id) => field(env, id, "is_cover") === "true");
    assert.deepEqual(covers(), [false, true, false]);
    assert.equal(field(env, "UPL-a", "is_cover"), "false", "the old cover is written as false");
    assert.equal(field(env, "UPL-x", "is_cover"), "true", "other place's cover untouched");
    const cleared = save(env, body({ cover_id: null }));
    assert.deepEqual(cleared.data.changed, ["MEDIA_SET_COVER"]);
    assert.deepEqual(covers(), [false, false, false]);
    assert.deepEqual(actions(env), [["MEDIA_SET_COVER", "UPL-b"], ["MEDIA_SET_COVER", "none"]]);
  });

  await test("6c save: captions TH/EN (escaped when starting with = + - @), audit MEDIA_CAPTION; all three changes in one save", () => {
    const env = three();
    const res = save(env, body({ order: ["UPL-b", "UPL-a", "UPL-c"], cover_id: "UPL-c", captions: { "UPL-a": { th: "=ทะเลสาบ", en: "Lake" } } }));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.data.changed, ["MEDIA_REORDER", "MEDIA_SET_COVER", "MEDIA_CAPTION"]);
    assert.equal(res.data.items.find((i) => i.upload_id === "UPL-a").caption_th, "=ทะเลสาบ");
    assert.equal(field(env, "UPL-a", "caption_en"), "Lake");
    assert.deepEqual(actions(env).map((a) => a[0]), ["MEDIA_REORDER", "MEDIA_SET_COVER", "MEDIA_CAPTION"]);
    assert.equal(field(env, "UPL-a", "updated_by"), "ADM-editor");
  });

  await test("6c save: nothing changed -> no write, no audit", () => {
    const env = three();
    const res = save(env, body());
    assert.deepEqual(res.data.changed, []);
    assert.deepEqual([writes(env).length, audits(env).length], [0, 0]);
  });

  await test("6c save: CONFLICT on a stale list; VALIDATION_ERROR on bad order/cover/captions; FORBIDDEN for reviewer; nothing written", () => {
    for (const [extra, code] of [
      [{ expected_ids: ["UPL-a", "UPL-b"] , order: ["UPL-a", "UPL-b"] }, "CONFLICT"],
      [{ order: ["UPL-a", "UPL-b"] }, "VALIDATION_ERROR"],
      [{ order: ["UPL-a", "UPL-b", "UPL-b"] }, "VALIDATION_ERROR"],
      [{ order: ["UPL-a", "UPL-b", "UPL-x"] }, "VALIDATION_ERROR"],
      [{ cover_id: "UPL-x" }, "VALIDATION_ERROR"],
      [{ cover_id: 5 }, "VALIDATION_ERROR"],
      [{ captions: { "UPL-x": { th: "", en: "" } } }, "VALIDATION_ERROR"],
      [{ captions: { "UPL-a": { th: "ก".repeat(201), en: "" } } }, "VALIDATION_ERROR"],
      [{ captions: { "UPL-a": { th: "x" } } }, "VALIDATION_ERROR"],
      [{ captions: [] }, "VALIDATION_ERROR"],
      [{ extra: 1 }, "VALIDATION_ERROR"]
    ]) {
      const env = three();
      assert.equal(save(env, body(extra)).error.code, code, JSON.stringify(extra));
      assert.deepEqual([writes(env).length, env.fetches.length], [0, 0]);
    }
    const reviewer = load({ admin: { admin_id: "ADM-r", role: "reviewer" }, uploads: [photo("UPL-a", 1)] });
    assert.equal(save(reviewer, { place_id: PLACE_ID, expected_ids: ["UPL-a"], order: ["UPL-a"], cover_id: null, captions: {} }).error.code, "FORBIDDEN");
  });

  await test("6c save: allowed with the switch off (D11); archived place NOT_FOUND; unverifiable write OUTCOME_UNKNOWN", () => {
    const off = load({ props: { ...PROPS, MEDIA_UPLOAD_ENABLED: "false" }, uploads: [photo("UPL-a", 1), photo("UPL-b", 2)] });
    assert.equal(save(off, { place_id: PLACE_ID, expected_ids: ["UPL-a", "UPL-b"], order: ["UPL-b", "UPL-a"], cover_id: null, captions: {} }).ok, true);
    const archived = load({ places: [[PLACE_ID, "x", "archived"]], uploads: [photo("UPL-a", 1)] });
    assert.equal(save(archived, { place_id: PLACE_ID, expected_ids: ["UPL-a"], order: ["UPL-a"], cover_id: "UPL-a", captions: {} }).error.code, "NOT_FOUND");
    const broken = load({ uploads: [photo("UPL-a", 1), photo("UPL-b", 2)], onUploadWrite: (sheet, rowNumber) => { if (rowNumber === 2) sheet.values[1][6] = "9"; } });
    assert.equal(save(broken, { place_id: PLACE_ID, expected_ids: ["UPL-a", "UPL-b"], order: ["UPL-b", "UPL-a"], cover_id: null, captions: {} }).error.code, "OUTCOME_UNKNOWN");
  });

  // ---- task 7b: writers refresh the public cache under their lock (D6: live at once) ----
  const GEN = "media-uploads-public-generation-v1";
  const refreshes = (env) => env.cacheRemovals.filter((r) => r.key === GEN);

  await test("7b: upload, delete and a changing save refresh the public cache once, while holding the lock", () => {
    const up = load();
    assert.equal(upload(up).ok, true);
    assert.deepEqual(refreshes(up), [{ key: GEN, lockHeld: true }]);
    const gone = load({ uploads: [photo("UPL-a", 1)] });
    assert.equal(del(gone, { place_id: PLACE_ID, upload_id: "UPL-a", expected_ids: ["UPL-a"] }).ok, true);
    assert.deepEqual(refreshes(gone), [{ key: GEN, lockHeld: true }]);
    const saved = three();
    assert.equal(save(saved, body({ cover_id: "UPL-c" })).ok, true);
    assert.deepEqual(refreshes(saved), [{ key: GEN, lockHeld: true }]);
  });

  await test("7b: no refresh for a duplicate, a refused or failed upload, an unchanged save, a retry or a read", () => {
    const dup = load({ uploads: [rowA()] });
    assert.equal(upload(dup).data.duplicate, true);
    const refused = load({ statuses: [403] });
    upload(refused);
    const busy = load({ lock: false });
    upload(busy);
    const same = three();
    save(same, body());
    const retried = load({ uploads: [pending("UPL-p1", 1)] });
    retry(retried);
    const readOnly = load({ uploads: [photo("UPL-a", 1)] });
    read(readOnly);
    for (const env of [dup, refused, busy, same, retried, readOnly]) assert.deepEqual(refreshes(env), []);
  });

  await test("7b end to end: a cached public read shows the new cover right after the save (no 300 s wait)", () => {
    // Complete rows (format + pixel sizes): the public read refuses incomplete rows.
    const full = { format: "webp", width_large: 1600, height_large: 1200, width_small: 800, height_small: 600 };
    const env = load({ uploads: [photo("UPL-a", 1, { ...full, is_cover: "true" }), photo("UPL-b", 2, full), photo("UPL-c", 3, full)] });
    const publicCovers = () => JSON.parse(JSON.stringify(env.context.getPlaceUploads_({}))).data.covers;
    assert.match(publicCovers()[PLACE_ID].key_large, new RegExp(`${String(1).repeat(32)}-1600`));
    assert.match(publicCovers()[PLACE_ID].key_large, new RegExp(`${String(1).repeat(32)}-1600`), "second read from cache");
    assert.equal(save(env, body({ cover_id: "UPL-c" })).ok, true);
    assert.match(publicCovers()[PLACE_ID].key_large, new RegExp(`${String(3).repeat(32)}-1600`));
  });

  // ---- task 8: adminTestMediaStorage (T11, criterion 13) ----
  const probe = (env, body = {}, token = "good-token") => JSON.parse(JSON.stringify(env.context.adminTestMediaStorage_(token, body)));
  const ROOT_ADMIN = { admin_id: "ADM-root", role: "super_admin" };

  await test("8: super_admin connection test: PUT 200 -> exists 206 -> DELETE 204 -> gone 404 on a fresh health-check key, no lock, no sheet write", () => {
    const env = load({ admin: ROOT_ADMIN });
    const res = probe(env);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.data, { ok: true, steps: [{ step: "PUT", status: 200, ok: true }, { step: "EXISTS", status: 206, ok: true }, { step: "DELETE", status: 204, ok: true }, { step: "GONE", status: 404, ok: true }], events: [] });
    assert.deepEqual(env.fetches.map((f) => f.method), ["put", "get", "delete", "get"]);
    assert.ok(env.fetches.every((f) => /^uploads\/healthcheck\/[a-f0-9]{64}\.webp$/.test(f.key) && f.key === env.fetches[0].key && !f.lockHeld));
    assert.deepEqual([writes(env).length, env.lockEvents.length, env.objects.size], [0, 0, 0]);
    const again = load({ admin: ROOT_ADMIN });
    probe(again); probe(again);
    assert.notEqual(again.fetches[0].key, again.fetches[4].key, "each run uses its own key");
  });

  await test("8: editor, reviewer and viewer get FORBIDDEN with no R2 call; the upload switch is ignored", () => {
    for (const role of ["editor", "reviewer", "viewer"]) {
      const env = load({ admin: { admin_id: "ADM-x", role } });
      assert.equal(probe(env).error.code, "FORBIDDEN");
      assert.equal(env.fetches.length, 0);
    }
    assert.equal(probe(load({ admin: ROOT_ADMIN, props: { ...PROPS, MEDIA_UPLOAD_ENABLED: "false" } })).data.ok, true);
    assert.equal(probe(load(), {}, "bad").error.code, "UNAUTHORIZED");
  });

  await test("8: failures are reported per step (bad token 403, missing config, network) and the clean-up steps still run", () => {
    const denied = probe(load({ admin: ROOT_ADMIN, statuses: [403, 403, 403, 403] }));
    assert.equal(denied.data.ok, false);
    assert.deepEqual(denied.data.steps.map((s) => [s.step, s.status, s.ok]), [["PUT", 403, false], ["EXISTS", 403, false], ["DELETE", 403, false], ["GONE", 403, false]]);
    const noConfig = load({ admin: ROOT_ADMIN, props: { SPREADSHEET_ID: "x" } });
    assert.deepEqual(probe(noConfig).data.steps.map((s) => s.status), ["CONFIG", "CONFIG", "CONFIG", "CONFIG"]);
    assert.equal(noConfig.fetches.length, 0);
    const network = probe(load({ admin: ROOT_ADMIN, statuses: [new Error("Address unavailable: https://0123.r2.cloudflarestorage.com/x"), new Error("Address unavailable: https://0123.r2.cloudflarestorage.com/x"), new Error("Address unavailable: https://0123.r2.cloudflarestorage.com/x")] }));
    assert.equal(network.data.steps[0].status, "NETWORK");
    assert.equal(network.data.ok, false);
  });

  await test("8: the result lists the recent storage events (newest first, after its own steps): none yet, then a refused upload", () => {
    const env = load({ admin: ROOT_ADMIN });
    assert.deepEqual(probe(env).data.events, [], "nothing went wrong yet");
    env.context.R2SigV4_now_ = () => Date.parse("2026-11-05T07:36:46.000Z");
    const refused = load({ admin: ROOT_ADMIN, statuses: [403] });
    refused.context.R2SigV4_now_ = () => Date.parse("2026-11-05T07:36:46.000Z");
    assert.equal(upload(refused).error.code, "STORAGE_ERROR");
    const listed = probe(refused).data;
    assert.equal(listed.ok, true, "the probe itself passes");
    assert.deepEqual(listed.events, [{ at: "2026-11-05T07:36:46.000Z", step: "PUT 1600", attempts: "403", ok: false, ms: 0 }]);
    assert.deepEqual(Object.keys(listed).sort(), ["events", "ok", "steps"]);
  });

  await test("8: the result never shows keys, R2 settings, signatures or storage URLs; payload must be empty", () => {
    for (const env of [load({ admin: ROOT_ADMIN }), load({ admin: ROOT_ADMIN, statuses: [403] })]) {
      const text = JSON.stringify(probe(env));
      for (const secret of [PROPS.R2_SECRET_ACCESS_KEY, PROPS.R2_ACCESS_KEY_ID, PROPS.R2_ACCOUNT_ID, PROPS.R2_BUCKET, "healthcheck", "Signature", "cloudflarestorage"]) {
        assert.equal(text.includes(secret), false, secret);
      }
    }
    assert.equal(probe(load({ admin: ROOT_ADMIN }), undefined).ok, true);
    assert.equal(probe(load({ admin: ROOT_ADMIN }), { x: 1 }).error.code, "VALIDATION_ERROR");
    assert.equal(probe(load({ admin: ROOT_ADMIN }), []).error.code, "VALIDATION_ERROR");
  });

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write(`${passed} MediaUploadService tests passed\n`);
})();
