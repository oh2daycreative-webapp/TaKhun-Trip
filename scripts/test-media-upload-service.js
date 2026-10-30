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
const FILES = ["Config.gs", "SheetService.gs", "R2SigV4.gs", "MediaImageCheck.gs", "MediaUploadSchema.gs", "MediaUploadService.gs"];
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
function load({ props = PROPS, admin = { admin_id: "ADM-editor", role: "editor" }, uploads = [], places, statuses = [], lock = true, uploadSheetOptions, now = "2026-10-30T14:00:00.000Z" } = {}) {
  const log = [], fetches = [], lockEvents = [];
  let lockHeld = false;
  const queue = statuses.slice();
  const sheets = {
    places: fakeSheet("places", [PLACE_HEADERS, ...(places || [[PLACE_ID, "สถานที่ทดสอบ", "published"], ["BTK-001", "บ้าน", "draft"], ["plc_under", "x", "published"]])], log),
    media_uploads: fakeSheet("media_uploads", [UPLOAD_HEADERS, ...uploads], log, uploadSheetOptions),
    activity_logs: fakeSheet("activity_logs", [AUDIT_HEADERS], log)
  };
  let uuid = 0;
  const context = {
    console: { log() {} }, JSON, Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return Date.parse(now); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null) }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets[n] || null }), flush: () => log.push(["flush"]) },
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
      getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`
    },
    UrlFetchApp: { fetch: (url, options) => {
      fetches.push({ url, method: options.method, lockHeld, bytes: options.payload ? options.payload.length : 0 });
      const next = queue.length ? queue.shift() : (options.method === "put" ? 200 : options.method === "delete" ? 204 : 404);
      if (next instanceof Error) throw next;
      return { getResponseCode: () => next, getHeaders: () => ({}) };
    } },
    AuthService_requireAdmin_: (token) => { if (token !== "good-token") throw new Error("UNAUTHORIZED"); return admin; }
  };
  vm.createContext(context);
  for (const [name, source] of SOURCES) vm.runInContext(source, context, { filename: `apps-script/${name}` });
  return { context, sheets, log, fetches, lockEvents };
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

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write(`${passed} MediaUploadService tests passed\n`);
})();
