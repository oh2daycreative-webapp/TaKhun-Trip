"use strict";
// apps-script/R2SigV4.gs: signs PUT / DELETE / existence-check requests to Cloudflare R2 (S3 API, SigV4).
// 1) Official AWS SigV4 test suite (aws-c-auth, pinned commit; fixtures/aws-sigv4-vectors.json): canonical request,
//    string to sign and signature must match exactly.
// 2) R2 requests: URL, headers, scope (auto/s3), payload hash, existence check as a ranged GET (T15), key allowlist
//    (place photos .webp/.jpg + health check), content type from the key, config errors, status mapping.
//    The R2 signature is cross-checked with an independent Node crypto implementation.
// The .gs file runs unmodified in a vm with a strict Apps Script shim (signed Java bytes; byte-array-only HMAC/digest).
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "apps-script", "R2SigV4.gs"), "utf8");
const VECTORS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "aws-sigv4-vectors.json"), "utf8"));
let passed = 0;
function test(name, body) {
  try { body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

const toSigned = (buffer) => Array.from(buffer, (b) => (b > 127 ? b - 256 : b));
const toBuffer = (bytes) => { assert.ok(Array.isArray(bytes), "Apps Script byte arrays expected"); return Buffer.from(bytes.map((b) => b & 0xff)); };

function load({ props = {}, fetch } = {}) {
  const calls = [];
  const context = {
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      newBlob: (text) => ({ getBytes: () => toSigned(Buffer.from(String(text), "utf8")) }),
      computeDigest: (algorithm, bytes) => { assert.equal(algorithm, "SHA_256"); return toSigned(crypto.createHash("sha256").update(toBuffer(bytes)).digest()); },
      computeHmacSha256Signature: (value, key) => toSigned(crypto.createHmac("sha256", toBuffer(key)).update(toBuffer(value)).digest()),
      formatDate: (date, zone, pattern) => {
        assert.equal(zone, "UTC"); assert.equal(pattern, "yyyyMMdd'T'HHmmss'Z'");
        return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => (Object.prototype.hasOwnProperty.call(props, name) ? props[name] : null) }) },
    UrlFetchApp: { fetch: (url, options) => { calls.push({ url, options }); return fetch ? fetch(url, options) : { getResponseCode: () => 200, getHeaders: () => ({ ETag: "\"e\"" }) }; } }
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: "apps-script/R2SigV4.gs" });
  return { context, calls };
}

// Parses an aws-c-auth request.txt into method, path, query pairs, headers and body.
function parseRequest(text) {
  const [head, ...rest] = text.split("\n\n");
  const lines = head.split("\n");
  // The request target may contain spaces (get-space-unnormalized): take everything between the method and " HTTP/".
  const method = lines[0].slice(0, lines[0].indexOf(" "));
  const target = lines[0].slice(method.length + 1, lines[0].lastIndexOf(" HTTP/"));
  const [rawPath, rawQuery] = target.split("?");
  const query = rawQuery ? rawQuery.split("&").map((part) => { const i = part.indexOf("="); return i < 0 ? [part, ""] : [part.slice(0, i), part.slice(i + 1)]; }) : [];
  const headers = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const i = line.indexOf(":");
    const name = line.slice(0, i);
    headers[name] = headers[name] === undefined ? line.slice(i + 1) : [].concat(headers[name], line.slice(i + 1));
  }
  return { method, path: rawPath, query, headers, body: rest.join("\n\n") };
}

const { context } = load();
for (const [name, vector] of Object.entries(VECTORS.cases)) {
  test(`AWS SigV4 test suite: ${name}`, () => {
    const request = parseRequest(vector.request);
    const amzDate = vector.context.timestamp.replace(/[-:]/g, "");
    const headers = { ...request.headers, "X-Amz-Date": amzDate };
    const payloadHash = context.R2SigV4_sha256Hex_(request.body);
    if (vector.context.sign_body) headers["X-Amz-Content-Sha256"] = payloadHash;
    const result = context.R2SigV4_sign_(
      { method: request.method, path: request.path, query: request.query, headers, payloadHash },
      { accessKeyId: vector.context.credentials.access_key_id, secretAccessKey: vector.context.credentials.secret_access_key },
      { amzDate, region: vector.context.region, service: vector.context.service }
    );
    assert.equal(result.canonicalRequest, vector.canonicalRequest, "canonical request");
    assert.equal(result.stringToSign, vector.stringToSign, "string to sign");
    assert.equal(result.signature, vector.signature, "signature");
    assert.match(result.authorization, new RegExp(`^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=${vector.signature}$`));
  });
}

test("vector set is the pinned official suite and covers body signing, UTF-8, query order and unreserved characters", () => {
  assert.match(VECTORS.source, /^https:\/\/github\.com\/awslabs\/aws-c-auth\/tree\/[0-9a-f]{12}\/tests\/aws-signing-test-suite\/v4$/);
  assert.equal(Object.keys(VECTORS.cases).length, 11);
  for (const name of ["get-vanilla", "post-x-www-form-urlencoded", "get-utf8", "get-vanilla-query-order-key-case", "get-vanilla-query-unreserved", "get-space-unnormalized"]) assert.ok(VECTORS.cases[name], name);
  assert.equal(VECTORS.cases["post-x-www-form-urlencoded"].context.sign_body, true);
});

// Independent reference implementation (Node crypto only), used to cross-check the R2 request.
function referenceSign({ method, canonicalUri, headers, payloadHash, secret, amzDate, region, service }) {
  const names = Object.keys(headers).map((n) => n.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalRequest = [method, canonicalUri, "", names.map((n) => `${n}:${lower[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${amzDate.slice(0, 8)}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  let key = crypto.createHmac("sha256", `AWS4${secret}`).update(amzDate.slice(0, 8)).digest();
  for (const part of [region, service, "aws4_request"]) key = crypto.createHmac("sha256", key).update(part).digest();
  return crypto.createHmac("sha256", key).update(toSign).digest("hex");
}

const CONFIG = { accountId: "0123456789abcdef0123456789abcdef", bucket: "takhun-media-staging", accessKeyId: "AKIDTEST", secretAccessKey: "sEcReT/test+key=" };
const HASH32 = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const HASH64 = "86be52bdb7547413cafb3ed175a806a798c65de98b40849e0b974c47d187de65";
const PLACE = "uploads/places/plc-6d706013-ce22-46a6-b2e1-061a8da902b7";
const KEY_WEBP = `${PLACE}/${HASH32}-1600.webp`;
const KEY_JPG = `${PLACE}/${HASH32}-800.jpg`;
const KEY_HEALTH = `uploads/healthcheck/${HASH64}.webp`;
const NOW = new Date("2026-10-30T09:15:30.000Z");
const BODY = toSigned(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]));

for (const [key, type] of [[KEY_WEBP, "image/webp"], [KEY_JPG, "image/jpeg"]]) {
  test(`R2 PUT ${key.slice(-9)}: path-style URL, auto/s3 scope, payload hash, content type ${type} from the key; matches an independent signer`, () => {
    const request = context.R2SigV4_buildRequest_("PUT", key, BODY, CONFIG, NOW);
    assert.equal(request.url, `https://${CONFIG.accountId}.r2.cloudflarestorage.com/${CONFIG.bucket}/${key}`);
    assert.equal(request.options.method, "put");
    assert.equal(request.options.contentType, type);
    assert.equal(request.options.followRedirects, false);
    assert.equal(request.options.muteHttpExceptions, true);
    const bodyHash = crypto.createHash("sha256").update(toBuffer(BODY)).digest("hex");
    assert.equal(request.options.headers["x-amz-content-sha256"], bodyHash);
    assert.equal(request.options.headers["x-amz-date"], "20261030T091530Z");
    assert.match(request.options.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/20261030\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    const expected = referenceSign({ method: "PUT", canonicalUri: `/${CONFIG.bucket}/${key}`, payloadHash: bodyHash, secret: CONFIG.secretAccessKey, amzDate: "20261030T091530Z", region: "auto", service: "s3",
      headers: { "content-type": type, host: `${CONFIG.accountId}.r2.cloudflarestorage.com`, "x-amz-content-sha256": bodyHash, "x-amz-date": "20261030T091530Z" } });
    assert.equal(request.signed.signature, expected);
    assert.equal(JSON.stringify(request).includes(CONFIG.secretAccessKey), false, "secret never in the request");
  });
}

test("R2 DELETE signs the empty payload; the existence check (T15) is a signed 1-byte ranged GET", () => {
  const del = context.R2SigV4_buildRequest_("DELETE", KEY_JPG, null, CONFIG, NOW);
  assert.equal(del.options.method, "delete");
  assert.equal(del.options.headers["x-amz-content-sha256"], "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(del.options.payload, undefined);
  assert.equal(del.options.contentType, undefined);
  const head = context.R2SigV4_buildRequest_("HEAD", KEY_WEBP, null, CONFIG, NOW);
  assert.equal(head.options.method, "get");
  assert.equal(head.options.headers.Range, "bytes=0-0");
  assert.match(head.signed.canonicalRequest, /^GET\n/);
  assert.match(head.options.headers.Authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
});

test("key allowlist: place photos (800/1600, .webp/.jpg, 32-hex hash) and the health-check key only", () => {
  for (const key of [KEY_WEBP, KEY_JPG, `${PLACE}/${HASH32}-800.webp`, `${PLACE}/${HASH32}-1600.jpg`, "uploads/places/btk-001/" + HASH32 + "-800.webp", KEY_HEALTH]) {
    assert.doesNotThrow(() => context.R2SigV4_assertKey_(key), key);
  }
  for (const key of [
    `${PLACE}/${HASH32}-1600.png`, `${PLACE}/${HASH32}-1600.jpeg`, `${PLACE}/${HASH32}-900.webp`, `${PLACE}/${HASH32}.webp`,
    `${PLACE}/${HASH32.slice(1)}-800.webp`, `${PLACE}/${HASH32}0-800.webp`, `${PLACE}/${HASH32.toUpperCase()}-800.webp`,
    `uploads/places/BTK-001/${HASH32}-800.webp`, `uploads/places/-btk/${HASH32}-800.webp`, `uploads/places/${"a".repeat(65)}/${HASH32}-800.webp`,
    `uploads/places/btk-001/x/${HASH32}-800.webp`, `uploads/places/../${HASH32}-800.webp`, `uploads/routes/r-1/${HASH32}-800.webp`,
    `/${KEY_WEBP}`, `${KEY_WEBP}?x=1`, `uploads/phase0-test/${HASH64}.webp`, `uploads/healthcheck/${HASH32}.webp`,
    `uploads/healthcheck/${HASH64}.jpg`, "secret.txt", "", null, undefined, 42
  ]) {
    assert.throws(() => context.R2SigV4_assertKey_(key), (error) => error.message === "R2_KEY", String(key));
  }
});

test("content type comes from the key extension only", () => {
  assert.equal(context.R2SigV4_contentTypeForKey_(KEY_WEBP), "image/webp");
  assert.equal(context.R2SigV4_contentTypeForKey_(KEY_JPG), "image/jpeg");
  assert.equal(context.R2SigV4_contentTypeForKey_(KEY_HEALTH), "image/webp");
});

test("refuses unsafe keys, other methods and empty PUT bodies before any network call", () => {
  assert.throws(() => context.R2SigV4_buildRequest_("PUT", "../x.webp", BODY, CONFIG, NOW), /R2_KEY/);
  assert.throws(() => context.R2SigV4_buildRequest_("GET", KEY_WEBP, null, CONFIG, NOW), /R2_METHOD/);
  assert.throws(() => context.R2SigV4_buildRequest_("POST", KEY_WEBP, BODY, CONFIG, NOW), /R2_METHOD/);
  assert.throws(() => context.R2SigV4_buildRequest_("PUT", KEY_WEBP, [], CONFIG, NOW), /R2_BODY/);
  assert.throws(() => context.R2SigV4_buildRequest_("PUT", KEY_WEBP, null, CONFIG, NOW), /R2_BODY/);
});

const PROPS = { R2_ACCOUNT_ID: CONFIG.accountId, R2_BUCKET: CONFIG.bucket, R2_ACCESS_KEY_ID: CONFIG.accessKeyId, R2_SECRET_ACCESS_KEY: CONFIG.secretAccessKey };

test("missing or malformed Script Properties fail with R2_CONFIG, no fetch, no secret in the error", () => {
  for (const props of [{}, { ...PROPS, R2_ACCOUNT_ID: "nope" }, { ...PROPS, R2_ACCOUNT_ID: ` ${CONFIG.accountId}` }, { ...PROPS, R2_BUCKET: "Bad_Bucket" },
    { ...PROPS, R2_SECRET_ACCESS_KEY: "" }, { ...PROPS, R2_ACCESS_KEY_ID: null }]) {
    const env = load({ props });
    assert.throws(() => env.context.r2PutObject_(KEY_WEBP, BODY), (error) => error.message === "R2_CONFIG");
    assert.equal(env.calls.length, 0);
  }
});

test("send helpers map R2 status codes to results and fixed error codes only", () => {
  const status = (code) => load({ props: PROPS, fetch: () => ({ getResponseCode: () => code, getHeaders: () => ({ ETag: "\"abc\"" }) }) });
  assert.equal(status(200).context.r2PutObject_(KEY_WEBP, BODY).etag, "\"abc\"");
  assert.throws(() => status(403).context.r2PutObject_(KEY_WEBP, BODY), (error) => error.message === "R2_HTTP_403" && !error.message.includes(CONFIG.secretAccessKey));
  assert.equal(status(204).context.r2DeleteObject_(KEY_WEBP).status, 204);
  assert.equal(status(200).context.r2DeleteObject_(KEY_WEBP).status, 200);
  assert.throws(() => status(500).context.r2DeleteObject_(KEY_WEBP), /R2_HTTP_500/);
  assert.equal(status(206).context.r2HeadObject_(KEY_WEBP).exists, true);
  assert.equal(status(404).context.r2HeadObject_(KEY_WEBP).exists, false);
  assert.throws(() => status(403).context.r2HeadObject_(KEY_WEBP), /R2_HTTP_403/);
  const env = status(200);
  env.context.r2PutObject_(KEY_JPG, BODY);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].options.contentType, "image/jpeg");
  assert.equal(env.calls[0].url, `https://${CONFIG.accountId}.r2.cloudflarestorage.com/${CONFIG.bucket}/${KEY_JPG}`);
  assert.equal(JSON.stringify(env.calls[0]).includes(CONFIG.secretAccessKey), false);
});

test("no top-level calls to Apps Script services (safe in any file load order)", () => {
  const bare = vm.createContext({});
  assert.doesNotThrow(() => vm.runInContext(SOURCE, bare, { filename: "apps-script/R2SigV4.gs" }));
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`${passed} R2SigV4 tests passed\n`);
