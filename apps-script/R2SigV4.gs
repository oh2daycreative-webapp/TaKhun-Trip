// R2 / S3 Signature Version 4 client for Apps Script (place photo uploads, spec v5.2 T3/T15).
// Signs PUT / DELETE / existence-check requests to Cloudflare R2's S3 API (region "auto", service "s3").
// Uses only Utilities.computeDigest (SHA-256) and Utilities.computeHmacSha256Signature with byte-array keys.
// Script Properties (values never logged, never returned): R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
// Errors carry fixed codes only (R2_CONFIG, R2_KEY, R2_METHOD, R2_BODY, R2_HTTP_<status>), never credentials or URLs.
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

function R2SigV4_send_(method, key, body) {
  var request = R2SigV4_buildRequest_(method, key, body, R2SigV4_config_());
  var response = UrlFetchApp.fetch(request.url, request.options);
  var status = response.getResponseCode();
  var headers = response.getHeaders() || {};
  return { status: status, etag: headers.ETag || headers.etag || "" };
}

// Public helpers. PUT and DELETE are idempotent for content-hash keys; r2HeadObject_ reports existence (T15).
function r2PutObject_(key, bytes) {
  var result = R2SigV4_send_("PUT", key, bytes);
  if (result.status !== 200) throw new Error("R2_HTTP_" + result.status);
  return result;
}

function r2DeleteObject_(key) {
  var result = R2SigV4_send_("DELETE", key, null);
  if (result.status !== 204 && result.status !== 200) throw new Error("R2_HTTP_" + result.status);
  return result;
}

function r2HeadObject_(key) {
  var result = R2SigV4_send_("HEAD", key, null);
  if (result.status === 404) return { exists: false };
  if (result.status !== 206 && result.status !== 200) throw new Error("R2_HTTP_" + result.status);
  return { exists: true, etag: result.etag };
}
