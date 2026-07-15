var ReviewService_CACHE_SECONDS_ = 300;
var ReviewService_DEFAULT_PAGE_ = 1;
var ReviewService_DEFAULT_PAGE_SIZE_ = 20;
var ReviewService_MAX_PAGE_SIZE_ = 100;
var ReviewService_MAX_COMMENT_LENGTH_ = 1000;
var ReviewService_REQUIRED_HEADERS_ = [
  "review_id", "place_id", "reviewer_name", "is_anonymous", "rating", "comment",
  "admin_reply", "status", "created_at", "updated_at", "approved_at", "approved_by"
];

function getReviews_(parameters) {
  var normalized = ReviewService_normalizeListParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  return ReviewService_cached_(normalized.params, function () {
    return ReviewService_buildReviewsResponse_(
      readSheetObjects_("reviews"),
      readSheetObjects_("places"),
      normalized.params
    );
  });
}

function submitReview_(payload) {
  var normalized = ReviewService_normalizeSubmission_(payload);
  if (!normalized.ok) return normalized.response;
  var placeId = normalized.payload.place_id;
  var publishedPlace = (readSheetObjects_("places") || []).some(function (row) {
    return row && ReviewService_trim_(row.place_id) === placeId && ReviewService_trim_(row.status) === "published";
  });
  if (!publishedPlace) return ReviewService_error_("NOT_FOUND", "ไม่พบสถานที่นี้");

  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(10000);
  if (!acquired) throw new Error("Review write is temporarily unavailable.");
  try {
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    var reviewId = "REV-" + Utilities.getUuid();
    var record = {
      review_id: reviewId,
      place_id: placeId,
      reviewer_name: ReviewService_escapeSheetText_(normalized.payload.reviewer_name),
      is_anonymous: normalized.payload.is_anonymous,
      rating: normalized.payload.rating,
      comment: ReviewService_escapeSheetText_(normalized.payload.comment),
      admin_reply: "",
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
      approved_at: "",
      approved_by: ""
    };
    appendSheetObject_("reviews", ReviewService_REQUIRED_HEADERS_, record);
    return {
      ok: true,
      data: { review_id: reviewId, status: "pending" },
      message: "ส่งรีวิวแล้ว รอตรวจสอบก่อนเผยแพร่"
    };
  } finally {
    lock.releaseLock();
  }
}

function ReviewService_buildReviewsResponse_(reviewRows, placeRows, parameters) {
  var normalized = ReviewService_normalizeListParameters_(parameters);
  if (!normalized.ok) return normalized.response;
  var params = normalized.params;
  var publishedPlace = (Array.isArray(placeRows) ? placeRows : []).some(function (row) {
    return row && ReviewService_trim_(row.place_id) === params.place_id && ReviewService_trim_(row.status) === "published";
  });
  if (!publishedPlace) return ReviewService_error_("NOT_FOUND", "ไม่พบสถานที่นี้");

  var approved = (Array.isArray(reviewRows) ? reviewRows : []).map(function (row, index) {
    return { row: row, index: index };
  }).filter(function (entry) {
    if (!entry.row || ReviewService_trim_(entry.row.place_id) !== params.place_id || ReviewService_trim_(entry.row.status) !== "approved") return false;
    var rating = Number(entry.row.rating);
    return isFinite(rating) && Math.floor(rating) === rating && rating >= 1 && rating <= 5 && ReviewService_trim_(entry.row.comment) !== "";
  }).map(function (entry) {
    return { row: ReviewService_copy_(entry.row), index: entry.index, timestamp: ReviewService_timestampValue_(entry.row.created_at) };
  });

  approved.sort(function (left, right) {
    if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp;
    return left.index - right.index;
  });
  var total = approved.length;
  var ratingTotal = approved.reduce(function (sum, entry) {
    var rating = Number(entry.row.rating);
    return sum + (isFinite(rating) ? rating : 0);
  }, 0);
  var start = (params.page - 1) * params.page_size;
  var items = approved.slice(start, start + params.page_size).map(function (entry) {
    return ReviewService_publicProjection_(entry.row);
  });
  return ReviewService_success_({
    items: items,
    summary: { average_rating: total ? Math.round((ratingTotal / total) * 10) / 10 : 0, review_count: total },
    total: total
  });
}

function ReviewService_normalizeListParameters_(parameters) {
  var source = parameters || {};
  var placeId = ReviewService_trim_(source.place_id);
  if (!ReviewService_validId_(placeId)) return { ok: false, response: ReviewService_validationError_("กรุณาระบุ place_id ที่ถูกต้อง") };
  var page = ReviewService_positiveInteger_(source.page, ReviewService_DEFAULT_PAGE_, null);
  var pageSize = ReviewService_positiveInteger_(source.page_size, ReviewService_DEFAULT_PAGE_SIZE_, ReviewService_MAX_PAGE_SIZE_);
  if (!page.ok || !pageSize.ok) return { ok: false, response: ReviewService_validationError_("พารามิเตอร์ไม่ถูกต้อง") };
  return { ok: true, params: { place_id: placeId, page: page.value, page_size: pageSize.value } };
}

function ReviewService_normalizeSubmission_(payload) {
  var source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  var placeId = ReviewService_trim_(source.place_id);
  var reviewerName = ReviewService_trim_(source.reviewer_name);
  var comment = ReviewService_trim_(source.comment);
  var rating = source.rating;
  var anonymous = source.is_anonymous === undefined ? false : source.is_anonymous;
  if (!ReviewService_validId_(placeId) || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5 || !comment || comment.length > ReviewService_MAX_COMMENT_LENGTH_ || typeof anonymous !== "boolean") {
    return { ok: false, response: ReviewService_validationError_("ข้อมูลรีวิวไม่ถูกต้อง") };
  }
  return { ok: true, payload: { place_id: placeId, reviewer_name: reviewerName, is_anonymous: anonymous, rating: rating, comment: comment } };
}

function ReviewService_publicProjection_(row) {
  var anonymous = ReviewService_storedBoolean_(row.is_anonymous);
  return {
    review_id: ReviewService_trim_(row.review_id),
    place_id: ReviewService_trim_(row.place_id),
    reviewer_name: anonymous ? "นักท่องเที่ยว" : ReviewService_unescapeSheetText_(row.reviewer_name),
    is_anonymous: anonymous,
    rating: Number(row.rating),
    comment: ReviewService_unescapeSheetText_(row.comment),
    admin_reply: ReviewService_unescapeSheetText_(row.admin_reply),
    created_at: ReviewService_trim_(row.created_at)
  };
}

function ReviewService_cached_(parameters, loader) {
  var cache = null;
  var key = ReviewService_cacheKey_(parameters);
  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.ok === true && parsed.data && Array.isArray(parsed.data.items) && parsed.data.summary && typeof parsed.data.total === "number") return parsed;
    }
  } catch (_reviewCacheReadError) {
    // Review reads must continue when cache data is unavailable or malformed.
  }
  var response = loader();
  if (response && response.ok === true) {
    try { if (cache) cache.put(key, JSON.stringify(response), ReviewService_CACHE_SECONDS_); }
    catch (_reviewCacheWriteError) { /* Return the successful uncached response. */ }
  }
  return response;
}

function ReviewService_cacheKey_(parameters) {
  return ["public", "getReviews", "place_id=" + encodeURIComponent(parameters.place_id), "page=" + parameters.page, "page_size=" + parameters.page_size].join(":");
}

function ReviewService_timestampValue_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ReviewService_trim_(value));
  if (!match) return -Infinity;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var hour = Number(match[4]);
  var minute = Number(match[5]);
  var second = Number(match[6]);
  var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return -Infinity;
  var time = Date.UTC(year, month - 1, day, hour, minute, second);
  return isFinite(time) ? time : -Infinity;
}

function ReviewService_escapeSheetText_(value) {
  var text = ReviewService_trim_(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function ReviewService_unescapeSheetText_(value) {
  var text = ReviewService_trim_(value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function ReviewService_storedBoolean_(value) {
  if (value === true || value === 1) return true;
  var text = ReviewService_trim_(value).toLowerCase();
  return text === "true" || text === "1";
}

function ReviewService_positiveInteger_(value, fallback, maximum) {
  if (value === undefined || value === null || ReviewService_trim_(value) === "") return { ok: true, value: fallback };
  var text = ReviewService_trim_(value);
  if (!/^\d+$/.test(text)) return { ok: false };
  var number = Number(text);
  if (!isFinite(number) || number < 1 || Math.floor(number) !== number || (maximum !== null && number > maximum)) return { ok: false };
  return { ok: true, value: number };
}

function ReviewService_validId_(value) { return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value); }
function ReviewService_copy_(row) { var copy = {}; Object.keys(row || {}).forEach(function (key) { copy[key] = row[key]; }); return copy; }
function ReviewService_success_(data) { return { ok: true, data: data, message: "success" }; }
function ReviewService_validationError_(message) { return ReviewService_error_("VALIDATION_ERROR", message); }
function ReviewService_error_(code, message) { return { ok: false, error: { code: code, message: message } }; }
function ReviewService_trim_(value) { return value === null || value === undefined ? "" : String(value).trim(); }
