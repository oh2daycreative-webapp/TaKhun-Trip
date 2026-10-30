// Admin place photo uploads (spec v5.2): upload action and helpers. Later tasks add read / save / delete.
// R2 is never called while the script lock is held (T8). No top-level service calls: safe in any load order.

var MediaUploadService_WRITE_ROLES_ = ["super_admin", "editor"];
var MediaUploadService_PLACE_ID_PATTERN_ = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
var MediaUploadService_UPLOAD_KEYS_ = ["place_id", "format", "large_b64", "small_b64"];
var MediaUploadService_UPLOAD_OPTIONAL_KEYS_ = ["caption_th", "caption_en"];
var MediaUploadService_BANGKOK_OFFSET_MS_ = 7 * 60 * 60 * 1000;
var MediaUploadService_AUDIT_HEADERS_ = ["log_id", "admin_id", "action", "entity_type", "entity_id", "description", "created_at", "audit_id", "actor_admin_id", "occurred_at"];
var MediaUploadService_MESSAGES_ = {
  UNAUTHORIZED: "กรุณาเข้าสู่ระบบ",
  FORBIDDEN: "คุณไม่มีสิทธิ์ดำเนินการนี้",
  VALIDATION_ERROR: "ข้อมูลคำขอไม่ถูกต้อง",
  NOT_FOUND: "ไม่พบสถานที่หรือรูปนี้",
  CONFLICT: "รายการรูปถูกแก้ไขแล้ว กรุณาโหลดรายการล่าสุด",
  UPLOAD_DISABLED: "ปิดการอัปโหลดรูปอยู่ในขณะนี้",
  LIMIT_PLACE: "สถานที่นี้มีรูปครบ 20 รูปแล้ว ลบรูปเดิมก่อนจึงจะเพิ่มได้",
  LIMIT_DAILY: "วันนี้อัปโหลดรูปครบจำนวนที่กำหนดแล้ว กรุณาลองใหม่พรุ่งนี้",
  STORAGE_ERROR: "ไม่ได้บันทึกข้อมูล: เชื่อมต่อที่เก็บรูปไม่สำเร็จ",
  BUSY: "ไม่ได้บันทึกข้อมูล: ระบบกำลังบันทึกงานอื่น กรุณาลองใหม่อีกครั้ง",
  OUTCOME_UNKNOWN: "ไม่แน่ใจผล · กรุณาโหลดรายการรูปใหม่เพื่อตรวจ ไม่ต้องส่งซ้ำ",
  SERVER_ERROR: "เกิดข้อผิดพลาดของระบบ"
};
var MediaUploadService_IMAGE_REASONS_ = {
  IMAGE_FORMAT: ["format", "ไฟล์ต้องเป็นรูป WebP หรือ JPEG"],
  IMAGE_EXIF: ["exif", "รูปยังมีข้อมูลแฝง (EXIF/GPS) กรุณาเลือกรูปใหม่"],
  IMAGE_WIDTH: ["width", "รูปต้องกว้างอย่างน้อย 1000 px"],
  IMAGE_ASPECT: ["aspect", "รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด"],
  IMAGE_SIZE: ["size", "ไฟล์รูปใหญ่เกินกำหนด"],
  IMAGE_MISMATCH: ["mismatch", "ไฟล์รูปไม่ตรงกัน กรุณาเลือกรูปใหม่"]
};

// ---- 5a helpers ----

// Keys for one photo: uploads/places/<lower-case place id>/<first 32 hex of SHA-256 of the large file>-(1600|800).<ext>.
function MediaUploadService_keys_(placeId, sha256, format) {
  var segment = String(placeId).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(segment) || !/^[a-f0-9]{64}$/.test(sha256) || (format !== "webp" && format !== "jpeg")) {
    throw new Error("VALIDATION_ERROR");
  }
  var stem = "uploads/places/" + segment + "/" + sha256.slice(0, 32);
  var ext = format === "jpeg" ? "jpg" : "webp";
  return { large: stem + "-1600." + ext, small: stem + "-800." + ext };
}

// Thailand has no daylight saving time: Bangkok day = UTC + 7 h.
function MediaUploadService_bangkokDay_(iso) {
  var time = Date.parse(iso);
  if (typeof iso !== "string" || !isFinite(time)) return "";
  return new Date(time + MediaUploadService_BANGKOK_OFFSET_MS_).toISOString().slice(0, 10);
}

function MediaUploadService_caption_(value) {
  if (value === undefined) return "";
  if (typeof value !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw new Error("VALIDATION_ERROR");
  var text = value.trim();
  if (Array.from(text).length > MediaUploadSchema_CAPTION_MAX_) throw new Error("VALIDATION_ERROR");
  return text;
}

// Validates the upload payload shape. Base64 strings longer than the byte caps allow are refused here (IMAGE_SIZE),
// before any decoding.
function MediaUploadService_uploadPayload_(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("VALIDATION_ERROR");
  var keys = Object.keys(payload);
  var allowed = MediaUploadService_UPLOAD_KEYS_.concat(MediaUploadService_UPLOAD_OPTIONAL_KEYS_);
  if (keys.some(function (key) { return allowed.indexOf(key) === -1; }) ||
      MediaUploadService_UPLOAD_KEYS_.some(function (key) { return keys.indexOf(key) === -1; })) {
    throw new Error("VALIDATION_ERROR");
  }
  if (typeof payload.place_id !== "string" || !MediaUploadService_PLACE_ID_PATTERN_.test(payload.place_id) ||
      MediaUploadSchema_FORMATS_.indexOf(payload.format) === -1 ||
      typeof payload.large_b64 !== "string" || !payload.large_b64 || typeof payload.small_b64 !== "string" || !payload.small_b64) {
    throw new Error("VALIDATION_ERROR");
  }
  var captionTh = MediaUploadService_caption_(payload.caption_th);
  var captionEn = MediaUploadService_caption_(payload.caption_en);
  if (payload.large_b64.length > Math.ceil(MediaImageCheck_MAX_LARGE_BYTES_ / 3) * 4 ||
      payload.small_b64.length > Math.ceil(MediaImageCheck_MAX_SMALL_BYTES_ / 3) * 4) {
    throw new Error("IMAGE_SIZE");
  }
  return {
    place_id: payload.place_id, format: payload.format, large_b64: payload.large_b64, small_b64: payload.small_b64,
    caption_th: captionTh, caption_en: captionEn
  };
}

// T5: text starting with = + - @ is written with a leading apostrophe; the sheet may consume it, so verification
// accepts either form.
function MediaUploadService_storedText_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function MediaUploadService_sameText_(actual, intended) {
  return actual === intended || (typeof actual === "string" && actual === "'" + intended && /^[=+\-@]/.test(intended));
}

// Makes sure the destination row exists and is plain text before a write. The owner-run sheet setup formats the
// sheet's initial 1000 rows @; row 1001+ does not exist until added, and added rows may not be @.
function MediaUploadService_prepareRow_(sheet, rowNumber, columns) {
  var maxRows = sheet.getMaxRows();
  if (rowNumber > maxRows) sheet.insertRowsAfter(maxRows, rowNumber - maxRows);
  var range = sheet.getRange(rowNumber, 1, 1, columns);
  var formats = range.getNumberFormats()[0];
  if (formats.some(function (format) { return format !== "@"; })) {
    range.setNumberFormat("@");
    if (range.getNumberFormats()[0].some(function (format) { return format !== "@"; })) throw new Error("MEDIA_UPLOADS_FORMAT");
  }
}

// ---- 5b: upload action ----

function MediaUploadService_response_(code, reason) {
  if (reason) {
    var image = MediaUploadService_IMAGE_REASONS_[reason];
    return { ok: false, error: { code: "IMAGE_REJECTED", reason: image[0], message: image[1] } };
  }
  var known = Object.prototype.hasOwnProperty.call(MediaUploadService_MESSAGES_, code) ? code : "SERVER_ERROR";
  return { ok: false, error: { code: known, message: MediaUploadService_MESSAGES_[known] } };
}

// Auth + write role, then the operation. Errors become fixed codes with Thai messages; nothing else leaks.
function MediaUploadService_executeWrite_(token, operation) {
  return MediaUploadService_execute_(token, MediaUploadService_WRITE_ROLES_, operation);
}

function MediaUploadService_execute_(token, roles, operation) {
  try {
    var admin = AuthService_requireAdmin_(token);
    if (!admin || roles.indexOf(admin.role) === -1) throw new Error("FORBIDDEN");
    return { ok: true, data: operation(admin) };
  } catch (error) {
    var code = error && typeof error.message === "string" ? error.message : "";
    if (Object.prototype.hasOwnProperty.call(MediaUploadService_IMAGE_REASONS_, code)) return MediaUploadService_response_("", code);
    return MediaUploadService_response_(code);
  }
}

function MediaUploadService_decode_(text) {
  try { return Utilities.base64Decode(text); } catch (_decodeError) { throw new Error("VALIDATION_ERROR"); }
}

function MediaUploadService_uploadTable_() {
  var table;
  try { table = SheetService_readTable_(MediaUploadSchema_SHEET_NAME_, MediaUploadSchema_HEADERS_); } catch (_tableError) { throw new Error("SERVER_ERROR"); }
  if (table.headers.length !== MediaUploadSchema_HEADERS_.length ||
      table.headers.some(function (header, index) { return header !== MediaUploadSchema_HEADERS_[index]; })) {
    throw new Error("SERVER_ERROR");
  }
  return table;
}

// Writes need a place that exists and is not archived; reads (allowArchived) only need it to exist.
function MediaUploadService_requirePlace_(placeId, allowArchived) {
  var table;
  try { table = SheetService_readTable_("places", ["place_id", "status"]); } catch (_placesError) { throw new Error("SERVER_ERROR"); }
  var match = table.rows.filter(function (entry) { return entry.values.place_id === placeId; });
  if (match.length !== 1 || (!allowArchived && String(match[0].values.status) === "archived")) throw new Error("NOT_FOUND");
}

// {place_id} with exactly that key.
function MediaUploadService_placePayload_(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 1 ||
      typeof payload.place_id !== "string" || !MediaUploadService_PLACE_ID_PATTERN_.test(payload.place_id)) {
    throw new Error("VALIDATION_ERROR");
  }
  return payload.place_id;
}

function MediaUploadService_activeForPlace_(table, placeId) {
  return table.rows.filter(function (entry) {
    return entry.values.entity_type === "place" && entry.values.entity_id === placeId && entry.values.status === "active";
  });
}

// Returns the existing active row for the same photo (duplicate), or throws LIMIT_PLACE / LIMIT_DAILY.
function MediaUploadService_checkLimits_(table, placeId, sha256, dailyLimit, nowIso) {
  var activeRows = MediaUploadService_activeForPlace_(table, placeId);
  var duplicate = activeRows.filter(function (entry) { return entry.values.sha256 === sha256; })[0];
  if (duplicate) return duplicate;
  if (activeRows.length >= MediaUploadSchema_PER_PLACE_LIMIT_) throw new Error("LIMIT_PLACE");
  var today = MediaUploadService_bangkokDay_(nowIso);
  var todayCount = table.rows.filter(function (entry) { return MediaUploadService_bangkokDay_(String(entry.values.created_at)) === today; }).length;
  if (todayCount >= dailyLimit) throw new Error("LIMIT_DAILY");
  return null;
}

function MediaUploadService_plainText_(value) {
  return String(value).replace(/^'(?=[=+\-@])/, "");
}

function MediaUploadService_item_(values) {
  return {
    upload_id: values.upload_id, place_id: values.entity_id, sort_order: Number(values.sort_order), is_cover: values.is_cover === "true",
    format: values.format, key_large: values.key_large, key_small: values.key_small,
    width_large: Number(values.width_large), height_large: Number(values.height_large),
    width_small: Number(values.width_small), height_small: Number(values.height_small),
    caption_th: MediaUploadService_plainText_(values.caption_th), caption_en: MediaUploadService_plainText_(values.caption_en),
    created_at: values.created_at
  };
}

// Keys used by any active row (both sizes). Throws when media_uploads cannot be read.
function MediaUploadService_referencedKeys_() {
  var referenced = Object.create(null);
  MediaUploadService_uploadTable_().rows.forEach(function (entry) {
    if (entry.values.status !== "active") return;
    referenced[entry.values.key_large] = true;
    referenced[entry.values.key_small] = true;
  });
  return referenced;
}

// The ONLY way this service deletes files (cleanup, delete, retry). Outside the lock:
// 1) re-read media_uploads and skip every key an active row uses (if the sheet can't be read, delete nothing: D16);
// 2) delete the rest;
// 3) re-read again: if an active row now uses a deleted key and the caller still has its bytes, put the file back.
// Together with the writer's post-save check (MediaUploadService_ensureStored_) a racing upload never ends up
// pointing at a deleted file. Returns { deleted, skipped (still in use), failed }. Errors are swallowed (best effort).
function MediaUploadService_deleteUnreferenced_(keys, bytesByKey) {
  var referenced;
  try { referenced = MediaUploadService_referencedKeys_(); } catch (_readError) { return { deleted: [], skipped: [], failed: keys.slice() }; }
  var deleted = [], skipped = [], failed = [];
  keys.forEach(function (key) {
    if (referenced[key]) { skipped.push(key); return; }
    try { r2DeleteObject_(key); deleted.push(key); } catch (_deleteError) { failed.push(key); }
  });
  if (deleted.length && bytesByKey) {
    try {
      var after = MediaUploadService_referencedKeys_();
      deleted.forEach(function (key) {
        if (after[key] && bytesByKey[key]) {
          try { r2PutObject_(key, bytesByKey[key]); } catch (_restoreError) { /* the writer's post-save check also restores */ }
        }
      });
    } catch (_rereadError) { /* the writer's post-save check also restores */ }
  }
  return { deleted: deleted, skipped: skipped, failed: failed };
}

// Writer side, after its row is saved and the lock released: both files must exist (T15 check); a missing one
// (deleted by a racing cleanup) is uploaded again. Returns true when both are confirmed present.
function MediaUploadService_ensureStored_(bytesByKey) {
  try {
    Object.keys(bytesByKey).forEach(function (key) {
      if (!r2HeadObject_(key).exists) r2PutObject_(key, bytesByKey[key]);
    });
    return true;
  } catch (_checkError) {
    return false;
  }
}

function MediaUploadService_withLock_(operation) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MediaUploadSchema_LOCK_TIMEOUT_MS_)) throw new Error("BUSY");
  try { return operation(); } finally { lock.releaseLock(); }
}

// Appends one row and verifies it by reading back (apostrophe-tolerant, T5). Any failure after the write attempt
// is OUTCOME_UNKNOWN.
function MediaUploadService_appendVerified_(sheetName, headers, record, idField) {
  var sheet = SheetService_getSheet_(sheetName);
  var rowNumber = sheet.getLastRow() + 1;
  MediaUploadService_prepareRow_(sheet, rowNumber, headers.length);
  var prepared = SheetService_prepareAppendDestination_(sheet, headers, headers);
  try {
    SheetService_appendObjectWithRow_(sheetName, headers, record, prepared);
    SpreadsheetApp.flush();
    var matches = SheetService_readTable_(sheetName, headers).rows.filter(function (entry) { return entry.values[idField] === record[idField]; });
    if (matches.length !== 1 || matches[0].sourceRowNumber !== rowNumber) throw new Error("VERIFY");
    headers.forEach(function (field) {
      var intended = Object.prototype.hasOwnProperty.call(record, field) ? MediaUploadService_plainText_(record[field]) : "";
      if (!MediaUploadService_sameText_(String(matches[0].values[field]), intended)) throw new Error("VERIFY");
    });
  } catch (_writeError) {
    throw new Error("OUTCOME_UNKNOWN");
  }
  return rowNumber;
}

function MediaUploadService_audit_(admin, action, placeId, description, occurredAt) {
  try {
    var table = SheetService_readTable_("activity_logs", MediaUploadService_AUDIT_HEADERS_);
    var auditId = Utilities.getUuid();
    if (table.rows.some(function (entry) { return entry.values.audit_id === auditId || entry.values.log_id === auditId; })) return "unconfirmed";
    var record = {
      log_id: auditId, admin_id: admin.admin_id, action: action, entity_type: "place", entity_id: placeId,
      description: description, created_at: occurredAt, audit_id: auditId, actor_admin_id: admin.admin_id, occurred_at: occurredAt
    };
    MediaUploadService_appendVerified_("activity_logs", table.headers, record, "audit_id");
    return "recorded";
  } catch (_auditError) {
    return "unconfirmed";
  }
}

// adminUploadPlaceImage_: one photo (two sizes) per request (spec T2, T3, T8, D1, D6, D9-D13, D16-D18, D23).
// Order: checks -> PUT both files (no lock) -> lock: re-check, append + verify row, audit -> unlock.
function adminUploadPlaceImage_(token, payload) {
  return MediaUploadService_executeWrite_(token, function (admin) {
    var input = MediaUploadService_uploadPayload_(payload);
    var settings = MediaUploadSchema_settings_();
    if (!settings.enabled) throw new Error("UPLOAD_DISABLED");
    var largeBytes = MediaUploadService_decode_(input.large_b64);
    var smallBytes = MediaUploadService_decode_(input.small_b64);
    var checked = MediaImageCheck_checkPair_(largeBytes, smallBytes, input.format);
    MediaUploadService_requirePlace_(input.place_id);
    var sha256 = R2SigV4_sha256Hex_(largeBytes);
    var keys = MediaUploadService_keys_(input.place_id, sha256, input.format);
    var nowIso = new Date().toISOString();
    var duplicate = MediaUploadService_checkLimits_(MediaUploadService_uploadTable_(), input.place_id, sha256, settings.dailyLimit, nowIso);
    if (duplicate) return { item: MediaUploadService_item_(duplicate.values), duplicate: true, audit_status: "not_needed" };

    var bytesByKey = {};
    bytesByKey[keys.large] = largeBytes;
    bytesByKey[keys.small] = smallBytes;
    var stored = [];
    try {
      r2PutObject_(keys.large, largeBytes);
      stored.push(keys.large);
      r2PutObject_(keys.small, smallBytes);
      stored.push(keys.small);
    } catch (_storageError) {
      MediaUploadService_deleteUnreferenced_(stored, bytesByKey);
      throw new Error("STORAGE_ERROR");
    }

    var result;
    try {
      result = MediaUploadService_withLock_(function () {
        var table = MediaUploadService_uploadTable_();
        var raced = MediaUploadService_checkLimits_(table, input.place_id, sha256, settings.dailyLimit, nowIso);
        if (raced) return { item: MediaUploadService_item_(raced.values), duplicate: true, audit_status: "not_needed" };
        var sortOrder = MediaUploadService_activeForPlace_(table, input.place_id).reduce(function (max, entry) {
          return Math.max(max, Number(entry.values.sort_order) || 0);
        }, 0) + 1;
        var record = {
          upload_id: "UPL-" + Utilities.getUuid(), entity_type: "place", entity_id: input.place_id, status: "active", object_state: "stored",
          is_cover: "false", sort_order: String(sortOrder), format: input.format, sha256: sha256, key_large: keys.large, key_small: keys.small,
          width_large: String(checked.large.width), height_large: String(checked.large.height), bytes_large: String(checked.large.bytes),
          width_small: String(checked.small.width), height_small: String(checked.small.height), bytes_small: String(checked.small.bytes),
          caption_th: MediaUploadService_storedText_(input.caption_th), caption_en: MediaUploadService_storedText_(input.caption_en),
          created_at: nowIso, created_by: admin.admin_id, updated_at: nowIso, updated_by: admin.admin_id, deleted_at: "", deleted_by: ""
        };
        MediaUploadService_appendVerified_(MediaUploadSchema_SHEET_NAME_, MediaUploadSchema_HEADERS_, record, "upload_id");
        var auditStatus = MediaUploadService_audit_(admin, "MEDIA_UPLOAD", input.place_id, record.upload_id, nowIso);
        return { item: MediaUploadService_item_(record), duplicate: false, audit_status: auditStatus };
      });
    } catch (error) {
      // Only OUTCOME_UNKNOWN can mean a row was written; in every other case remove this request's files again
      // (outside the lock, skipping keys an active row uses).
      if (!error || error.message !== "OUTCOME_UNKNOWN") MediaUploadService_deleteUnreferenced_(stored, bytesByKey);
      throw error;
    }
    if (!result.duplicate) result.files_verified = MediaUploadService_ensureStored_(bytesByKey);
    return result;
  });
}

// ---- task 6a: read ----

var MediaUploadService_READ_ROLES_ = ["super_admin", "editor", "reviewer", "viewer"];

function MediaUploadService_sortedActive_(table, placeId) {
  return MediaUploadService_activeForPlace_(table, placeId).slice().sort(function (left, right) {
    return (Number(left.values.sort_order) || 0) - (Number(right.values.sort_order) || 0) || left.sourceRowNumber - right.sourceRowNumber;
  });
}

// adminGetPlaceUploads_: the place's active photos in order, the switch state and the limits. Read-only, no R2.
function adminGetPlaceUploads_(token, payload) {
  return MediaUploadService_execute_(token, MediaUploadService_READ_ROLES_, function (admin) {
    var placeId = MediaUploadService_placePayload_(payload);
    MediaUploadService_requirePlace_(placeId, true);
    var table = MediaUploadService_uploadTable_();
    var settings = MediaUploadSchema_settings_();
    var today = MediaUploadService_bangkokDay_(new Date().toISOString());
    var todayCount = table.rows.filter(function (entry) { return MediaUploadService_bangkokDay_(String(entry.values.created_at)) === today; }).length;
    return {
      enabled: settings.enabled,
      can_write: MediaUploadService_WRITE_ROLES_.indexOf(admin.role) !== -1,
      limits: {
        per_place: MediaUploadSchema_PER_PLACE_LIMIT_, daily_left: Math.max(0, settings.dailyLimit - todayCount),
        max_bytes_large: MediaImageCheck_MAX_LARGE_BYTES_, max_bytes_small: MediaImageCheck_MAX_SMALL_BYTES_
      },
      items: MediaUploadService_sortedActive_(table, placeId).map(function (entry) { return MediaUploadService_item_(entry.values); }),
      delete_pending: table.rows.filter(function (entry) {
        return entry.values.entity_type === "place" && entry.values.entity_id === placeId && entry.values.object_state === "delete_pending";
      }).length
    };
  });
}

// ---- task 6b: delete ----

var MediaUploadService_UPLOAD_ID_PATTERN_ = /^UPL-[A-Za-z0-9-]{1,64}$/;

// expected_ids: the active photo ids (in order) the admin was looking at; any difference is CONFLICT.
function MediaUploadService_expectedIds_(value) {
  if (!Array.isArray(value) || value.length > MediaUploadSchema_PER_PLACE_LIMIT_) throw new Error("VALIDATION_ERROR");
  var seen = Object.create(null);
  value.forEach(function (id) {
    if (typeof id !== "string" || !MediaUploadService_UPLOAD_ID_PATTERN_.test(id) || seen[id]) throw new Error("VALIDATION_ERROR");
    seen[id] = true;
  });
  return value.slice();
}

function MediaUploadService_assertExpected_(activeRows, expectedIds) {
  var current = activeRows.map(function (entry) { return entry.values.upload_id; });
  if (current.length !== expectedIds.length || current.some(function (id, index) { return id !== expectedIds[index]; })) {
    throw new Error("CONFLICT");
  }
}

// Changes some fields of one media_uploads row (only that row) and verifies by reading back. Any failure once the
// write has started is OUTCOME_UNKNOWN.
function MediaUploadService_updateVerified_(rowNumber, uploadId, patch) {
  var sheet = SheetService_getSheet_(MediaUploadSchema_SHEET_NAME_);
  MediaUploadService_prepareRow_(sheet, rowNumber, MediaUploadSchema_HEADERS_.length);
  try {
    SheetService_replaceObjectAtRow_(MediaUploadSchema_SHEET_NAME_, rowNumber, patch);
    SpreadsheetApp.flush();
    var matches = MediaUploadService_uploadTable_().rows.filter(function (entry) { return entry.values.upload_id === uploadId; });
    if (matches.length !== 1 || matches[0].sourceRowNumber !== rowNumber) throw new Error("VERIFY");
    Object.keys(patch).forEach(function (field) {
      if (!MediaUploadService_sameText_(String(matches[0].values[field]), MediaUploadService_plainText_(patch[field]))) throw new Error("VERIFY");
    });
  } catch (_updateError) {
    throw new Error("OUTCOME_UNKNOWN");
  }
}

// After a delete: removes the row's files (safe helper) and, when both are gone or still used by another active
// row, marks object_state "deleted" under the lock. Returns true when the file part is finished.
function MediaUploadService_finishFileDelete_(uploadId, keys) {
  var outcome = MediaUploadService_deleteUnreferenced_(keys, null);
  if (outcome.failed.length) return false;
  try {
    MediaUploadService_withLock_(function () {
      var match = MediaUploadService_uploadTable_().rows.filter(function (entry) { return entry.values.upload_id === uploadId; })[0];
      if (!match || match.values.status !== "deleted" || match.values.object_state !== "delete_pending") throw new Error("STATE");
      MediaUploadService_updateVerified_(match.sourceRowNumber, uploadId, { object_state: "deleted" });
    });
    return true;
  } catch (_finishError) {
    return false;
  }
}

// adminDeletePlaceUpload_: removes a photo from the site at once (row first, D3/T8), then its files.
// Allowed with the upload switch off (D11) and for archived places (C4: removal requests must always work).
function adminDeletePlaceUpload_(token, payload) {
  return MediaUploadService_executeWrite_(token, function (admin) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).sort().join(",") !== "expected_ids,place_id,upload_id" ||
        typeof payload.place_id !== "string" || !MediaUploadService_PLACE_ID_PATTERN_.test(payload.place_id) ||
        typeof payload.upload_id !== "string" || !MediaUploadService_UPLOAD_ID_PATTERN_.test(payload.upload_id)) {
      throw new Error("VALIDATION_ERROR");
    }
    var placeId = payload.place_id;
    var uploadId = payload.upload_id;
    var expectedIds = MediaUploadService_expectedIds_(payload.expected_ids);
    MediaUploadService_requirePlace_(placeId, true);
    var nowIso = new Date().toISOString();
    var keys = MediaUploadService_withLock_(function () {
      var activeRows = MediaUploadService_sortedActive_(MediaUploadService_uploadTable_(), placeId);
      MediaUploadService_assertExpected_(activeRows, expectedIds);
      var target = activeRows.filter(function (entry) { return entry.values.upload_id === uploadId; })[0];
      if (!target) throw new Error("NOT_FOUND");
      MediaUploadService_updateVerified_(target.sourceRowNumber, uploadId, {
        status: "deleted", object_state: "delete_pending", is_cover: "false",
        deleted_at: nowIso, deleted_by: admin.admin_id, updated_at: nowIso, updated_by: admin.admin_id
      });
      return { large: target.values.key_large, small: target.values.key_small, audit: MediaUploadService_audit_(admin, "MEDIA_DELETE", placeId, uploadId, nowIso) };
    });
    var fileDeleted = MediaUploadService_finishFileDelete_(uploadId, [keys.large, keys.small]);
    return { deleted: true, file_deleted: fileDeleted, audit_status: keys.audit };
  });
}

// adminRetryPlaceUploadDeletes_: finishes the file part of this place's delete_pending rows (no scheduled job, C7).
// The photos already left the site and their deletes were audited, so no new audit row is written here.
function adminRetryPlaceUploadDeletes_(token, payload) {
  return MediaUploadService_executeWrite_(token, function () {
    var placeId = MediaUploadService_placePayload_(payload);
    MediaUploadService_requirePlace_(placeId, true);
    var pendingRows = MediaUploadService_uploadTable_().rows.filter(function (entry) {
      return entry.values.entity_type === "place" && entry.values.entity_id === placeId &&
        entry.values.status === "deleted" && entry.values.object_state === "delete_pending";
    });
    var stillPending = 0;
    pendingRows.forEach(function (entry) {
      if (!MediaUploadService_finishFileDelete_(entry.values.upload_id, [entry.values.key_large, entry.values.key_small])) stillPending += 1;
    });
    return { retried: pendingRows.length, still_pending: stillPending };
  });
}

// ---- task 6c: save order, cover and captions ----

// payload: { place_id, expected_ids, order (a permutation of expected_ids), cover_id (one of order, or null),
//            captions: { <upload_id in order>: { th, en } } }.
function MediaUploadService_savePayload_(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).sort().join(",") !== "captions,cover_id,expected_ids,order,place_id" ||
      typeof payload.place_id !== "string" || !MediaUploadService_PLACE_ID_PATTERN_.test(payload.place_id)) {
    throw new Error("VALIDATION_ERROR");
  }
  var expectedIds = MediaUploadService_expectedIds_(payload.expected_ids);
  var order = MediaUploadService_expectedIds_(payload.order);
  if (order.length !== expectedIds.length || order.some(function (id) { return expectedIds.indexOf(id) === -1; })) throw new Error("VALIDATION_ERROR");
  if (payload.cover_id !== null && (typeof payload.cover_id !== "string" || order.indexOf(payload.cover_id) === -1)) throw new Error("VALIDATION_ERROR");
  var source = payload.captions;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("VALIDATION_ERROR");
  var captions = {};
  Object.keys(source).forEach(function (id) {
    var entry = source[id];
    if (order.indexOf(id) === -1 || !entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "en,th") {
      throw new Error("VALIDATION_ERROR");
    }
    captions[id] = { th: MediaUploadService_caption_(entry.th), en: MediaUploadService_caption_(entry.en) };
  });
  return { place_id: payload.place_id, expected_ids: expectedIds, order: order, cover_id: payload.cover_id, captions: captions };
}

// adminSavePlaceUploads_: one save for order (D6: live at once), cover (T6) and captions (D13). Allowed with the
// upload switch off (D11). Only rows that change are written (each verified); one audit row per kind of change.
function adminSavePlaceUploads_(token, payload) {
  return MediaUploadService_executeWrite_(token, function (admin) {
    var input = MediaUploadService_savePayload_(payload);
    MediaUploadService_requirePlace_(input.place_id, false);
    var nowIso = new Date().toISOString();
    return MediaUploadService_withLock_(function () {
      var activeRows = MediaUploadService_sortedActive_(MediaUploadService_uploadTable_(), input.place_id);
      MediaUploadService_assertExpected_(activeRows, input.expected_ids);
      var byId = {};
      activeRows.forEach(function (entry) { byId[entry.values.upload_id] = entry; });
      var oldCover = activeRows.filter(function (entry) { return entry.values.is_cover === "true"; }).map(function (entry) { return entry.values.upload_id; });
      var reordered = false, coverChanged = false, captioned = false;
      input.order.forEach(function (id, index) {
        var values = byId[id].values;
        var patch = {};
        if (String(values.sort_order) !== String(index + 1)) { patch.sort_order = String(index + 1); reordered = true; }
        var isCover = id === input.cover_id ? "true" : "false";
        if ((values.is_cover === "true") !== (isCover === "true")) { patch.is_cover = isCover; coverChanged = true; }
        var caption = input.captions[id];
        if (caption) {
          if (MediaUploadService_plainText_(values.caption_th) !== caption.th) { patch.caption_th = MediaUploadService_storedText_(caption.th); captioned = true; }
          if (MediaUploadService_plainText_(values.caption_en) !== caption.en) { patch.caption_en = MediaUploadService_storedText_(caption.en); captioned = true; }
        }
        if (!Object.keys(patch).length) return;
        patch.updated_at = nowIso;
        patch.updated_by = admin.admin_id;
        MediaUploadService_updateVerified_(byId[id].sourceRowNumber, id, patch);
      });
      var changed = [], auditStatus = "not_needed";
      var record = function (action, description) {
        changed.push(action);
        var status = MediaUploadService_audit_(admin, action, input.place_id, description, nowIso);
        auditStatus = auditStatus === "unconfirmed" || status === "unconfirmed" ? "unconfirmed" : "recorded";
      };
      if (reordered) record("MEDIA_REORDER", input.order.join(","));
      if (coverChanged || (oldCover.length > 1)) record("MEDIA_SET_COVER", input.cover_id || "none");
      if (captioned) record("MEDIA_CAPTION", Object.keys(input.captions).join(","));
      var items = MediaUploadService_sortedActive_(MediaUploadService_uploadTable_(), input.place_id).map(function (entry) { return MediaUploadService_item_(entry.values); });
      return { items: items, changed: changed, audit_status: auditStatus };
    });
  });
}
