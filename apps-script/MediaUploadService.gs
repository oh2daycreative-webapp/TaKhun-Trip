// Admin place photo uploads (spec v5.2): upload action and helpers. Later tasks add read / save / delete.
// R2 is never called while the script lock is held (T8). No top-level service calls: safe in any load order.

var MediaUploadService_WRITE_ROLES_ = ["super_admin", "editor"];
var MediaUploadService_PLACE_ID_PATTERN_ = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
var MediaUploadService_UPLOAD_KEYS_ = ["place_id", "format", "large_b64", "small_b64"];
var MediaUploadService_UPLOAD_OPTIONAL_KEYS_ = ["caption_th", "caption_en"];
var MediaUploadService_BANGKOK_OFFSET_MS_ = 7 * 60 * 60 * 1000;

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
