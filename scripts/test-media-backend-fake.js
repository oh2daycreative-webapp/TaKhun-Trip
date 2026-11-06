"use strict";
// Test helper: the REAL Apps Script backend (apps-script/*.gs, entered through routeRequest_) in a Node vm, with fakes
// only at the platform edges: spreadsheet (Apps Script bounds), a stateful R2 bucket behind UrlFetchApp,
// Lock/Cache/Properties/ContentService, and the session check (token → admin). Used by browser tests so the page talks
// to the server's real response shapes instead of hand-written fixtures (task 11 bug: success envelopes have no
// "message" field).
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APPS_SCRIPT = path.join(__dirname, "..", "apps-script");
const toSigned = (buffer) => Array.from(buffer, (b) => (b > 127 ? b - 256 : b));
const toBuffer = (bytes) => Buffer.from(Array.from(bytes, (b) => b & 0xff));
const UPLOAD_HEADERS = ["upload_id", "entity_type", "entity_id", "status", "object_state", "is_cover", "sort_order", "format", "sha256",
  "key_large", "key_small", "width_large", "height_large", "bytes_large", "width_small", "height_small", "bytes_small",
  "caption_th", "caption_en", "created_at", "created_by", "updated_at", "updated_by", "deleted_at", "deleted_by"];
const AUDIT_HEADERS = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];

function fakeSheet(name, rows) {
  const values = rows.map((row) => row.slice());
  const width = rows.length ? rows[0].length : 0;
  let max = 1000;
  const formats = Array.from({ length: max }, () => Array(Math.max(width, 1)).fill("@"));
  const cell = (r, c) => (values[r - 1] && values[r - 1][c - 1] !== undefined ? values[r - 1][c - 1] : "");
  const sheet = {
    values,
    getName: () => name, getMaxRows: () => max, getLastColumn: () => width,
    getLastRow: () => { let last = 0; values.forEach((row, i) => { if (row.some((v) => v !== "")) last = i + 1; }); return last; },
    insertRowsAfter: (after, count) => { for (let i = 0; i < count; i += 1) formats.push(Array(width).fill("")); max += count; },
    getDataRange: () => sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), Math.max(width, 1)),
    getRange(r, c, nr = 1, nc = 1) {
      if (r < 1 || r + nr - 1 > max) throw new Error("Those rows are out of bounds.");
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
        getNumberFormats: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => formats[r + i - 1][c + j - 1] ?? "")),
        getFormulas: () => Array.from({ length: nr }, () => Array(nc).fill("")),
        setNumberFormat: (f) => { for (let i = 0; i < nr; i += 1) for (let j = 0; j < nc; j += 1) formats[r + i - 1][c + j - 1] = f; },
        setValues: (grid) => grid.forEach((line, i) => line.forEach((v, j) => {
          values[r + i - 1] = values[r + i - 1] || Array(width).fill("");
          values[r + i - 1][c + j - 1] = typeof v === "string" && v.startsWith("'") ? v.slice(1) : v; // T5: apostrophe consumed
        })),
        clearContent: () => { for (let i = 0; i < nr; i += 1) values[r + i - 1] = Array(width).fill(""); }
      };
    }
  };
  return sheet;
}

// admins: { token: { admin_id, role } }. Returns { handle(bodyText) → response text, table(name), objects, props }.
// places: optional extra [place_id, status] rows. objects: key -> Buffer of the stored file (served by browser tests).
function createBackend({ placeId, placeStatus = "published", places = [], admins, props: extraProps = {}, validAccessKeyId = "AKIDTEST" }) {
  const props = Object.assign({ SPREADSHEET_ID: "staging-spreadsheet-id", MEDIA_UPLOAD_ENABLED: "true",
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_BUCKET: "takhun-media-staging", R2_ACCESS_KEY_ID: "AKIDTEST", R2_SECRET_ACCESS_KEY: "sEcReT/test+key=" }, extraProps);
  const objects = new Map();
  const cache = new Map();
  const sheets = {
    places: fakeSheet("places", [["place_id", "name_th", "status"], [placeId, "QA", placeStatus], ...places.map(([id, status]) => [id, "QA", status])]),
    media_uploads: fakeSheet("media_uploads", [UPLOAD_HEADERS]),
    activity_logs: fakeSheet("activity_logs", [AUDIT_HEADERS])
  };
  const context = {
    console: { log() {} }, JSON, Date,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets[n] || null }), flush: () => {} },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ setMimeType: () => ({ text }) }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      newBlob: (text) => ({ getBytes: () => toSigned(Buffer.from(String(text), "utf8")) }),
      base64Decode: (text) => { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4) throw new Error("Invalid argument: base64"); return toSigned(Buffer.from(text, "base64")); },
      computeDigest: (_a, bytes) => toSigned(crypto.createHash("sha256").update(toBuffer(bytes)).digest()),
      computeHmacSha256Signature: (value, key) => toSigned(crypto.createHmac("sha256", toBuffer(key)).update(toBuffer(value)).digest()),
      formatDate: (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
      getUuid: () => crypto.randomUUID()
    },
    UrlFetchApp: { fetch: (url, options) => {
      const key = url.split("/takhun-media-staging/")[1];
      // R2 refuses a request signed with any other access key id (live staging answered 400 to a wrong key).
      const authorization = options.headers && (options.headers.Authorization || options.headers.authorization) || "";
      if (!authorization.includes("Credential=" + validAccessKeyId + "/")) return { getResponseCode: () => 400, getHeaders: () => ({}) };
      let status;
      if (options.method === "put") { objects.set(key, toBuffer(options.payload)); status = 200; }
      else if (options.method === "delete") { objects.delete(key); status = 204; }
      else status = objects.has(key) ? 206 : 404;
      return { getResponseCode: () => status, getHeaders: () => ({}) };
    } }
  };
  vm.createContext(context);
  for (const file of fs.readdirSync(APPS_SCRIPT).filter((name) => name.endsWith(".gs"))) vm.runInContext(fs.readFileSync(path.join(APPS_SCRIPT, file), "utf8"), context, { filename: file });
  context.AuthService_requireAdmin_ = (token) => { if (!admins[token]) throw new Error("UNAUTHORIZED"); return admins[token]; };
  const handle = (bodyText) => context.routeRequest_("POST", { parameter: {}, postData: { contents: bodyText } }).text;
  // Public GET (e.g. getPlaceUploads), exactly as the web app answers ?action=...&place_id=...
  const handleGet = (parameter) => context.routeRequest_("GET", { parameter }).text;
  const table = (name) => { const [h, ...r] = sheets[name].values; return r.filter((row) => row.some((v) => v !== "")).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i]]))); };
  return { handle, handleGet, table, objects, props };
}

module.exports = { createBackend };
