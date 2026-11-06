// media_uploads sheet contract and upload settings for place photo uploads (spec v5.2 T5, T9, T10, D1, D10, D13).
// No top-level service calls: safe in any Apps Script file load order.
// setupMediaUploadsSheet() is the only writer here. The owner runs it once per environment from the Apps Script
// editor; it is not reachable from Router (enforced by scripts/test-media-upload-schema.js).

var MediaUploadSchema_SHEET_NAME_ = "media_uploads";
// All columns are plain text (@): values are written as strings and read back to verify (T5).
var MediaUploadSchema_HEADERS_ = [
  "upload_id", "entity_type", "entity_id", "status", "object_state", "is_cover", "sort_order", "format", "sha256",
  "key_large", "key_small", "width_large", "height_large", "bytes_large", "width_small", "height_small", "bytes_small",
  "caption_th", "caption_en", "created_at", "created_by", "updated_at", "updated_by", "deleted_at", "deleted_by"
];
var MediaUploadSchema_STATUSES_ = ["active", "deleted"];
var MediaUploadSchema_OBJECT_STATES_ = ["stored", "delete_pending", "deleted"];
var MediaUploadSchema_FORMATS_ = ["webp", "jpeg"];
var MediaUploadSchema_PER_PLACE_LIMIT_ = 20;          // D1: active uploads per place
var MediaUploadSchema_DAILY_LIMIT_DEFAULT_ = 100;     // D10: uploads per day, all admins together
var MediaUploadSchema_DAILY_LIMIT_MAX_ = 500;
var MediaUploadSchema_CAPTION_MAX_ = 200;             // D13: per language, optional
var MediaUploadSchema_LOCK_TIMEOUT_MS_ = 10000;
var MediaUploadSchema_ENABLED_PROPERTY_ = "MEDIA_UPLOAD_ENABLED";
var MediaUploadSchema_DAILY_LIMIT_PROPERTY_ = "MEDIA_UPLOAD_DAILY_LIMIT";

// T9: uploads are on only when MEDIA_UPLOAD_ENABLED is exactly "true" (default off).
// D10: MEDIA_UPLOAD_DAILY_LIMIT is a whole number 1-500; anything else means the default 100.
function MediaUploadSchema_settings_() {
  var properties = PropertiesService.getScriptProperties();
  var enabled = properties.getProperty(MediaUploadSchema_ENABLED_PROPERTY_) === "true";
  var raw = properties.getProperty(MediaUploadSchema_DAILY_LIMIT_PROPERTY_);
  var dailyLimit = MediaUploadSchema_DAILY_LIMIT_DEFAULT_;
  if (typeof raw === "string" && /^[1-9][0-9]{0,2}$/.test(raw) && Number(raw) <= MediaUploadSchema_DAILY_LIMIT_MAX_) {
    dailyLimit = Number(raw);
  }
  return { enabled: enabled, dailyLimit: dailyLimit };
}

// Owner-run, once per environment (Apps Script editor → Run). Creates media_uploads only when it is missing:
// every row of the 25 columns formatted plain text (@) first, then the header row, then row 1 frozen.
// An existing sheet is never changed: exact headers + plain text → ALREADY_OK; anything else → refused.
// Errors: MEDIA_UPLOADS_LOCK, MEDIA_UPLOADS_CONFIG, MEDIA_UPLOADS_HEADERS, MEDIA_UPLOADS_FORMAT, MEDIA_UPLOADS_VERIFY.
function setupMediaUploadsSheet() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MediaUploadSchema_LOCK_TIMEOUT_MS_)) throw new Error("MEDIA_UPLOADS_LOCK");
  try {
    var spreadsheetId = getAppConfig_().spreadsheetId;
    if (!spreadsheetId) throw new Error("MEDIA_UPLOADS_CONFIG");
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var columns = MediaUploadSchema_HEADERS_.length;
    var sheet = spreadsheet.getSheetByName(MediaUploadSchema_SHEET_NAME_);
    if (sheet) {
      MediaUploadSchema_assertSheet_(sheet, "MEDIA_UPLOADS_HEADERS", "MEDIA_UPLOADS_FORMAT");
      console.log("media_uploads setup: ALREADY_OK");
      return { status: "ALREADY_OK", sheet: MediaUploadSchema_SHEET_NAME_, columns: columns };
    }
    sheet = spreadsheet.insertSheet(MediaUploadSchema_SHEET_NAME_);
    sheet.getRange(1, 1, sheet.getMaxRows(), columns).setNumberFormat("@");
    sheet.getRange(1, 1, 1, columns).setValues([MediaUploadSchema_HEADERS_.slice()]);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
    MediaUploadSchema_assertSheet_(sheet, "MEDIA_UPLOADS_VERIFY", "MEDIA_UPLOADS_VERIFY");
    console.log("media_uploads setup: CREATED (" + columns + " columns)");
    return { status: "CREATED", sheet: MediaUploadSchema_SHEET_NAME_, columns: columns };
  } finally {
    lock.releaseLock();
  }
}

// Read-only check: row 1 holds exactly the 25 headers (no extra columns) and every row of those columns is "@".
function MediaUploadSchema_assertSheet_(sheet, headerError, formatError) {
  var columns = MediaUploadSchema_HEADERS_.length;
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() !== columns) throw new Error(headerError);
  var header = sheet.getRange(1, 1, 1, columns).getValues()[0];
  for (var index = 0; index < columns; index += 1) {
    if (header[index] !== MediaUploadSchema_HEADERS_[index]) throw new Error(headerError);
  }
  var formats = sheet.getRange(1, 1, sheet.getMaxRows(), columns).getNumberFormats();
  for (var row = 0; row < formats.length; row += 1) {
    for (var column = 0; column < columns; column += 1) {
      if (formats[row][column] !== "@") throw new Error(formatError);
    }
  }
}
