// R2 / S3 Signature Version 4 client for Apps Script (place photo uploads, spec v5.2 T3/T15).
// Signs PUT / DELETE / existence-check requests to Cloudflare R2's S3 API (region "auto", service "s3").
// Uses only Utilities.computeDigest (SHA-256) and Utilities.computeHmacSha256Signature with byte-array keys.
// Script Properties (values never logged, never returned): R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
// Errors carry fixed codes only (R2_CONFIG, R2_KEY, R2_METHOD, R2_BODY, R2_HTTP_<status>, R2_NETWORK), never credentials
// or URLs. Transient failures are retried (see R2SigV4_send_); log lines carry the step and status only.
// No top-level service calls: safe in any Apps Script file load order.

var R2SigV4_ALGORITHM_ = "AWS4-HMAC-SHA256";
var R2SigV4_EMPTY_SHA256_ = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
// Place photos: uploads/places/<lower-case place id>/<first 32 hex of the large file's SHA-256>-(800|1600).(webp|jpg).
// Health check (T11): uploads/healthcheck/<64 hex>.webp. Nothing else can be written or deleted.
var R2SigV4_PLACE_KEY_PATTERN_ = /^uploads\/places\/[a-z0-9][a-z0-9-]{0,63}\/[a-f0-9]{32}-(?:800|1600)\.(?:webp|jpg)$/;
var R2SigV4_HEALTH_KEY_PATTERN_ = /^uploads\/healthcheck\/[a-f0-9]{64}\.webp$/;

// ---- Pure signing functions (tested against the official AWS SigV4 test suite) ----

function R2SigV4_utf8Bytes_(text) {
  return Utilities.newBlob(String(text)).getBytes();
}

function R2SigV4_hex_(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; i += 1) out += ((bytes[i] & 0xff) + 0x100).toString(16).slice(1);
  return out;
}

function R2SigV4_sha256Hex_(input) {
  // input: string (hashed as UTF-8) or byte array.
  var bytes = typeof input === "string" ? R2SigV4_utf8Bytes_(input) : input;
  return R2SigV4_hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
}

function R2SigV4_hmac_(keyBytes, text) {
  return Utilities.computeHmacSha256Signature(R2SigV4_utf8Bytes_(text), keyBytes);
}

// RFC 3986 encoding as SigV4 requires: unreserved A-Z a-z 0-9 - . _ ~ kept, everything else %XX (uppercase), UTF-8.
function R2SigV4_encode_(text, keepSlash) {
  var bytes = R2SigV4_utf8Bytes_(text);
  var out = "";
  for (var i = 0; i < bytes.length; i += 1) {
    var b = bytes[i] & 0xff;
    var c = String.fromCharCode(b);
    if ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39) || c === "-" || c === "." || c === "_" || c === "~" || (keepSlash && c === "/")) out += c;
    else out += "%" + ((b + 0x100).toString(16).slice(1)).toUpperCase();
  }
  return out;
}

// S3 style: the path is encoded once, slashes kept, no dot-segment normalization.
function R2SigV4_canonicalPath_(path) {
  var value = String(path || "/");
  if (value.charAt(0) !== "/") value = "/" + value;
  return R2SigV4_encode_(value, true);
}

function R2SigV4_canonicalQuery_(pairs) {
  var encoded = (pairs || []).map(function (pair) { return [R2SigV4_encode_(pair[0], false), R2SigV4_encode_(pair[1] === undefined ? "" : pair[1], false)]; });
  encoded.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
  return encoded.map(function (pair) { return pair[0] + "=" + pair[1]; }).join("&");
}

// headers: object name -> value (or array of values). Names lowercased, values trimmed with inner spaces collapsed.
function R2SigV4_canonicalHeaders_(headers) {
  var map = Object.create(null);
  Object.keys(headers).forEach(function (name) {
    var key = name.toLowerCase().trim();
    var values = Array.isArray(headers[name]) ? headers[name] : [headers[name]];
    values.forEach(function (value) {
      var clean = String(value).trim().replace(/\s+/g, " ");
      map[key] = map[key] === undefined ? clean : map[key] + "," + clean;
    });
  });
  var names = Object.keys(map).sort();
  return { text: names.map(function (n) { return n + ":" + map[n] + "\n"; }).join(""), signed: names.join(";") };
}

// request: { method, path, query: [[k, v]...], headers: {name: value}, payloadHash }
// Returns canonicalRequest, stringToSign, signature, authorization. headers must already contain host and x-amz-date.
function R2SigV4_sign_(request, credentials, scope) {
  var canonical = R2SigV4_canonicalHeaders_(request.headers);
  var canonicalRequest = [
    String(request.method).toUpperCase(), R2SigV4_canonicalPath_(request.path), R2SigV4_canonicalQuery_(request.query),
    canonical.text, canonical.signed, request.payloadHash || R2SigV4_EMPTY_SHA256_
  ].join("\n");
  var amzDate = scope.amzDate;
  var dateStamp = amzDate.slice(0, 8);
  var credentialScope = [dateStamp, scope.region, scope.service, "aws4_request"].join("/");
  var stringToSign = [R2SigV4_ALGORITHM_, amzDate, credentialScope, R2SigV4_sha256Hex_(canonicalRequest)].join("\n");
  var kDate = R2SigV4_hmac_(R2SigV4_utf8Bytes_("AWS4" + credentials.secretAccessKey), dateStamp);
  var kRegion = R2SigV4_hmac_(kDate, scope.region);
  var kService = R2SigV4_hmac_(kRegion, scope.service);
  var kSigning = R2SigV4_hmac_(kService, "aws4_request");
  var signature = R2SigV4_hex_(R2SigV4_hmac_(kSigning, stringToSign));
  return {
    canonicalRequest: canonicalRequest,
    stringToSign: stringToSign,
    signature: signature,
    authorization: R2SigV4_ALGORITHM_ + " Credential=" + credentials.accessKeyId + "/" + credentialScope +
      ", SignedHeaders=" + canonical.signed + ", Signature=" + signature
  };
}

// ---- R2 client (UrlFetchApp); PUT / DELETE / existence check only ----

function R2SigV4_config_() {
  var props = PropertiesService.getScriptProperties();
  var config = {
    accountId: props.getProperty("R2_ACCOUNT_ID"),
    bucket: props.getProperty("R2_BUCKET"),
    accessKeyId: props.getProperty("R2_ACCESS_KEY_ID"),
    secretAccessKey: props.getProperty("R2_SECRET_ACCESS_KEY")
  };
  if (!/^[a-f0-9]{32}$/.test(String(config.accountId || "")) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(String(config.bucket || "")) ||
      !config.accessKeyId || !config.secretAccessKey) {
    throw new Error("R2_CONFIG");
  }
  return config;
}

function R2SigV4_assertKey_(key) {
  if (typeof key !== "string" || key.length > 200 || (!R2SigV4_PLACE_KEY_PATTERN_.test(key) && !R2SigV4_HEALTH_KEY_PATTERN_.test(key))) {
    throw new Error("R2_KEY");
  }
}

// The stored Content-Type always follows the key's extension (the allowlist admits only .webp and .jpg).
function R2SigV4_contentTypeForKey_(key) {
  R2SigV4_assertKey_(key);
  return /\.jpg$/.test(key) ? "image/jpeg" : "image/webp";
}

function R2SigV4_amzDate_(now) {
  return Utilities.formatDate(now || new Date(), "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

// Builds the signed request without sending it (pure apart from config + clock); used by R2SigV4_send_ and the tests.
// T15: UrlFetchApp supports only get/delete/patch/post/put (no HEAD), so the existence check ("HEAD") is sent as a
// signed GET with "Range: bytes=0-0": 206/200 = exists (at most 1 byte transferred), 404 = missing.
function R2SigV4_buildRequest_(method, key, body, config, now) {
  if (["PUT", "DELETE", "HEAD"].indexOf(method) === -1) throw new Error("R2_METHOD");
  var wire = method === "HEAD" ? "GET" : method;
  R2SigV4_assertKey_(key);
  if (method === "PUT" && (!body || !body.length)) throw new Error("R2_BODY");
  var host = config.accountId + ".r2.cloudflarestorage.com";
  var path = "/" + config.bucket + "/" + key;
  var payloadHash = method === "PUT" ? R2SigV4_sha256Hex_(body) : R2SigV4_EMPTY_SHA256_;
  var amzDate = R2SigV4_amzDate_(now);
  var headers = { host: host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (method === "PUT") headers["content-type"] = R2SigV4_contentTypeForKey_(key);
  if (method === "HEAD") headers.range = "bytes=0-0";
  var signed = R2SigV4_sign_({ method: wire, path: path, query: [], headers: headers, payloadHash: payloadHash },
    { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, { amzDate: amzDate, region: "auto", service: "s3" });
  var sendHeaders = { "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, Authorization: signed.authorization };
  if (method === "HEAD") sendHeaders.Range = headers.range;
  var options = { method: wire.toLowerCase(), headers: sendHeaders, muteHttpExceptions: true, followRedirects: false };
  if (method === "PUT") { options.payload = body; options.contentType = headers["content-type"]; }
  return { url: "https://" + host + R2SigV4_canonicalPath_(path), options: options, signed: signed };
}

// Retry (staging 5 Nov: R2 PUT and DELETE failed now and then, about 1 call in 60). A network error, 5xx or 429 is
// tried again up to twice, about 1 s and then 2 s later, each attempt signed afresh. A 4xx is an answer and is never
// retried, so a wrong key still fails at once. Time budget, well inside the client's 90 s upload timeout: only a
// quick failure (under 10 s) is retried, and retries stop 20 s after the first retry in this request. PUT, DELETE and
// the ranged GET are idempotent for content-hash keys. Callers never hold the script lock during R2 calls.
var R2SigV4_RETRY_DELAYS_MS_ = [1000, 2000];
var R2SigV4_RETRY_QUICK_MS_ = 10000;
var R2SigV4_RETRY_WINDOW_MS_ = 20000;
var R2SigV4_retryWindowStart_ = 0; // per request: Apps Script globals start fresh in every execution

function R2SigV4_now_() {
  return Date.now();
}

function R2SigV4_retryable_(status) {
  return status === 0 || status === 429 || (status >= 500 && status <= 599);
}

// "PUT 1600", "DELETE 800", "HEAD health": the step without the key, its hash or anything about the bucket.
function R2SigV4_step_(method, key) {
  var size = /-1600\.(?:webp|jpg)$/.test(key) ? "1600" : /-800\.(?:webp|jpg)$/.test(key) ? "800" : "health";
  return method + " " + size;
}

function R2SigV4_log_(text) {
  try { console.warn(text); } catch (_logError) { /* logging must never break a storage call */ }
}

// Returns { status, etag, attempts: ["503", "200"] }. Throws R2_NETWORK when the last attempt got no response.
function R2SigV4_send_(method, key, body) {
  var config = R2SigV4_config_();
  var attempts = [];
  for (var attempt = 0; ; attempt += 1) {
    var request = R2SigV4_buildRequest_(method, key, body, config, new Date(R2SigV4_now_()));
    var started = R2SigV4_now_();
    var status = 0, headers = {};
    try {
      var response = UrlFetchApp.fetch(request.url, request.options);
      status = response.getResponseCode();
      headers = response.getHeaders() || {};
    } catch (_fetchError) {
      status = 0; // no response: DNS, connection or timeout (the message may contain the URL, so it is dropped)
    }
    attempts.push(status ? String(status) : "network");
    if (!R2SigV4_retryable_(status)) return { status: status, etag: headers.ETag || headers.etag || "", attempts: attempts };
    var now = R2SigV4_now_();
    var delay = R2SigV4_RETRY_DELAYS_MS_[attempt];
    var windowStart = R2SigV4_retryWindowStart_ || now;
    if (delay === undefined || now - started >= R2SigV4_RETRY_QUICK_MS_ || now + delay - windowStart > R2SigV4_RETRY_WINDOW_MS_) {
      if (!status) {
        R2SigV4_log_("R2 " + R2SigV4_step_(method, key) + " failed: " + attempts.join(", "));
        throw new Error("R2_NETWORK");
      }
      return { status: status, etag: "", attempts: attempts };
    }
    R2SigV4_retryWindowStart_ = windowStart;
    Utilities.sleep(delay);
  }
}

// One log line per call that needed a retry or failed: "R2 PUT 800 ok after retry: 503, 200" / "... failed: 403".
function R2SigV4_result_(method, key, result, ok) {
  if (!ok) {
    R2SigV4_log_("R2 " + R2SigV4_step_(method, key) + " failed: " + result.attempts.join(", "));
    throw new Error("R2_HTTP_" + result.status);
  }
  if (result.attempts.length > 1) R2SigV4_log_("R2 " + R2SigV4_step_(method, key) + " ok after retry: " + result.attempts.join(", "));
  return result;
}

// Public helpers. PUT and DELETE are idempotent for content-hash keys; r2HeadObject_ reports existence (T15).
function r2PutObject_(key, bytes) {
  var result = R2SigV4_send_("PUT", key, bytes);
  return R2SigV4_result_("PUT", key, result, result.status === 200);
}

function r2DeleteObject_(key) {
  var result = R2SigV4_send_("DELETE", key, null);
  return R2SigV4_result_("DELETE", key, result, result.status === 204 || result.status === 200);
}

function r2HeadObject_(key) {
  var result = R2SigV4_send_("HEAD", key, null);
  R2SigV4_result_("HEAD", key, result, result.status === 404 || result.status === 206 || result.status === 200);
  return result.status === 404 ? { exists: false } : { exists: true, etag: result.etag };
}
