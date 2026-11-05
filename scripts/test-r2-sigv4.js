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

function load({ props = {}, fetch, start = Date.parse("2026-11-05T06:00:00.000Z") } = {}) {
  const calls = [], sleeps = [], logs = [], clock = { t: start };
  const context = {
    console: { warn: (...parts) => logs.push(parts.join(" ")) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      newBlob: (text) => ({ getBytes: () => toSigned(Buffer.from(String(text), "utf8")) }),
      computeDigest: (algorithm, bytes) => { assert.equal(algorithm, "SHA_256"); return toSigned(crypto.createHash("sha256").update(toBuffer(bytes)).digest()); },
      computeHmacSha256Signature: (value, key) => toSigned(crypto.createHmac("sha256", toBuffer(key)).update(toBuffer(value)).digest()),
      formatDate: (date, zone, pattern) => {
        assert.equal(zone, "UTC"); assert.equal(pattern, "yyyyMMdd'T'HHmmss'Z'");
        return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      },
      sleep: (ms) => { sleeps.push(ms); clock.t += ms; }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => (Object.prototype.hasOwnProperty.call(props, name) ? props[name] : null) }) },
    UrlFetchApp: { fetch: (url, options) => { calls.push({ url, options }); return fetch ? fetch(url, options) : { getResponseCode: () => 200, getHeaders: () => ({ ETag: "\"e\"" }) }; } }
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: "apps-script/R2SigV4.gs" });
  context.R2SigV4_now_ = () => clock.t; // a controllable clock (the real one is Date.now)
  return { context, calls, sleeps, logs, clock };
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

// ---- Retry of transient R2 failures (task 15, 5 Nov: STORAGE_ERROR on run7_03 and run7_13, a failed DELETE) ----
// A fetch plan: a number is the status, an Error is a network failure, { status, ms } also takes that long.
function plan(steps) {
  return (env) => () => {
    const step = steps.shift();
    if (step === undefined) throw new Error("unexpected extra R2 call");
    const value = step && typeof step === "object" && !(step instanceof Error) ? step : { status: step };
    if (value.ms) env.clock.t += value.ms;
    if (value.status instanceof Error) throw value.status;
    return { getResponseCode: () => value.status, getHeaders: () => ({ ETag: "\"r\"" }) };
  };
}
function retryEnv(steps) {
  const env = load({ props: PROPS, fetch: (...args) => env.fetchImpl(...args) });
  env.fetchImpl = plan(steps)(env);
  return env;
}
const KEY_SMALL = KEY_WEBP.replace("-1600.", "-800.");
const outcome = (fn) => { try { const value = fn(); return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; } catch (error) { return "throws " + error.message; } };
const allLogs = [];

test("transient failures (5xx, 429, network) are retried up to twice, 1 s then 2 s, each attempt signed again", () => {
  const ok = retryEnv([503, 200]);
  assert.equal(outcome(() => ok.context.r2PutObject_(KEY_WEBP, BODY)).status, 200);
  assert.deepEqual([ok.calls.length, ok.sleeps], [2, [1000]]);
  assert.deepEqual(ok.logs, ["R2 PUT 1600 ok after retry: 503, 200"]);
  const dates = ok.calls.map((call) => call.options.headers["x-amz-date"]);
  assert.notEqual(dates[0], dates[1], "the retry is signed with a fresh date");
  assert.ok(ok.calls.every((call) => /^AWS4-HMAC-SHA256 Credential=/.test(call.options.headers.Authorization)));

  const exhausted = retryEnv([500, 502, 500]);
  assert.equal(outcome(() => exhausted.context.r2PutObject_(KEY_SMALL, BODY)), "throws R2_HTTP_500");
  assert.deepEqual([exhausted.calls.length, exhausted.sleeps], [3, [1000, 2000]]);
  assert.deepEqual(exhausted.logs, ["R2 PUT 800 failed: 500, 502, 500"]);

  const limited = retryEnv([429, 204]);
  assert.equal(outcome(() => limited.context.r2DeleteObject_(KEY_WEBP)).status, 204);
  assert.deepEqual([limited.calls.length, limited.logs], [2, ["R2 DELETE 1600 ok after retry: 429, 204"]]);

  const dropped = retryEnv([new Error("Address unavailable: https://x.r2.cloudflarestorage.com/b/k"), 206]);
  assert.equal(outcome(() => dropped.context.r2HeadObject_(KEY_SMALL)).exists, true);
  assert.deepEqual(dropped.logs, ["R2 HEAD 800 ok after retry: network, 206"]);

  const offline = retryEnv([new Error("DNS error"), new Error("DNS error"), new Error("DNS error")]);
  assert.equal(outcome(() => offline.context.r2PutObject_(KEY_WEBP, BODY)), "throws R2_NETWORK");
  assert.deepEqual([offline.calls.length, offline.sleeps, offline.logs], [3, [1000, 2000], ["R2 PUT 1600 failed: network, network, network"]]);
  allLogs.push(...ok.logs, ...exhausted.logs, ...limited.logs, ...dropped.logs, ...offline.logs);
});

test("never retried: 4xx (a wrong key fails at once), and 404 on the existence check is an answer, not a failure", () => {
  const denied = retryEnv([403]);
  assert.equal(outcome(() => denied.context.r2PutObject_(KEY_WEBP, BODY)), "throws R2_HTTP_403");
  assert.deepEqual([denied.calls.length, denied.sleeps, denied.logs], [1, [], ["R2 PUT 1600 failed: 403"]]);
  for (const status of [400, 401, 404, 409]) {
    const env = retryEnv([status]);
    assert.equal(outcome(() => env.context.r2DeleteObject_(KEY_WEBP)), "throws R2_HTTP_" + status);
    assert.deepEqual([env.calls.length, env.sleeps], [1, []], String(status));
  }
  const missing = retryEnv([404]);
  assert.equal(outcome(() => missing.context.r2HeadObject_(KEY_WEBP)).exists, false);
  assert.deepEqual([missing.calls.length, missing.logs], [1, []]);
  const fine = retryEnv([200]);
  fine.context.r2PutObject_(KEY_WEBP, BODY);
  assert.deepEqual([fine.calls.length, fine.sleeps, fine.logs], [1, [], []]);
  const health = retryEnv([503, 200]);
  assert.equal(health.context.R2SigV4_send_("PUT", "uploads/healthcheck/" + "a".repeat(64) + ".webp", BODY).status, 200, "the connection test uses the same retry");
  allLogs.push(...denied.logs);
});

test("time budget: a slow failure is not retried, and retries stop 20 s after the first retry of the request", () => {
  const slow = retryEnv([{ status: 504, ms: 12000 }]);
  assert.equal(outcome(() => slow.context.r2PutObject_(KEY_WEBP, BODY)), "throws R2_HTTP_504");
  assert.deepEqual([slow.calls.length, slow.sleeps, slow.logs], [1, [], ["R2 PUT 1600 failed: 504"]]);
  // Ten calls in one request, every attempt a quick 503: the retries (and their waits) end within the 20 s window.
  const steps = Array.from({ length: 30 }, () => ({ status: 503, ms: 200 }));
  const busy = retryEnv(steps);
  for (let i = 0; i < 10; i += 1) assert.equal(outcome(() => busy.context.r2PutObject_(KEY_WEBP, BODY)), "throws R2_HTTP_503");
  const waited = busy.sleeps.reduce((a, b) => a + b, 0);
  assert.ok(waited <= 20000, "total wait " + waited);
  assert.ok(busy.calls.length < 30, "later calls are not retried any more: " + busy.calls.length);
  assert.equal(busy.logs.length, 10, "one line per failed call");
});

test("log lines carry the step and status only: never the key, account, bucket, access key, secret, URL or signature", () => {
  assert.ok(allLogs.length >= 6);
  const hash = KEY_WEBP.match(/[a-f0-9]{32}/)[0];
  for (const line of allLogs) {
    assert.match(line, /^R2 (PUT|DELETE|HEAD) (1600|800|health) (ok after retry|failed): [a-z0-9, ]+$/, line);
    for (const secret of [CONFIG.secretAccessKey, CONFIG.accessKeyId, CONFIG.accountId, CONFIG.bucket, hash, "http", "Signature", "cloudflarestorage", "uploads/"]) {
      assert.equal(line.includes(secret), false, secret + " in " + line);
    }
  }
});

test("no top-level calls to Apps Script services (safe in any file load order)", () => {
  const bare = vm.createContext({});
  assert.doesNotThrow(() => vm.runInContext(SOURCE, bare, { filename: "apps-script/R2SigV4.gs" }));
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`${passed} R2SigV4 tests passed\n`);
