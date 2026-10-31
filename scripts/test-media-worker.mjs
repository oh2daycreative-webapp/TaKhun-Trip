// workers/takhun-media (task 14, spec T4, T12, D14, criterion 15): the read-only image server for uploaded place photos.
// Runs the real module against a fake R2 binding (no network, no Cloudflare) and checks the Wrangler config:
// production binds only takhun-media-prod, the staging copy only takhun-media-staging, and neither has routes or
// custom domains (workers.dev only).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../workers/takhun-media/src/index.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
async function test(name, body) {
  try { await body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

// Keys exactly as the backend writes them (MediaUploadService_keys_): lower-case place id, first 32 hex of the
// SHA-256 of the large file, -1600 or -800, .webp or .jpg.
const HEX = "86be52bdb7547413cafb3ed175a806a7";
const WEBP = `uploads/places/plc-6d706013-ce22-46a6-b2e1-061a8da902b7/${HEX}-1600.webp`;
const JPG = `uploads/places/btk-001/${HEX}-800.jpg`;
const BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const calls = [];
const stored = new Set([WEBP, JPG]);
const env = { MEDIA_BUCKET: {
  async get(key) { calls.push(["get", key]); return stored.has(key) ? { body: new Blob([BYTES]).stream(), httpEtag: "\"etag-1\"", size: BYTES.length } : null; },
  async head(key) { calls.push(["head", key]); return stored.has(key) ? { httpEtag: "\"etag-1\"", size: BYTES.length } : null; },
  async put() { throw new Error("must never write"); },
  async delete() { throw new Error("must never delete"); },
  async list() { throw new Error("must never list"); }
} };
const req = (pathname, init) => new Request(`https://takhun-media-staging.example.workers.dev/${pathname}`, init);

await test("GET .webp: 200, image/webp, 1-year immutable cache, ETag, nosniff, body", async () => {
  const res = await worker.fetch(req(WEBP), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/webp");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(res.headers.get("ETag"), "\"etag-1\"");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.get("Content-Length"), String(BYTES.length));
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), BYTES);
});

await test("GET .jpg: 200, image/jpeg (iPhone uploads, D9)", async () => {
  const res = await worker.fetch(req(JPG), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/jpeg");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

await test("HEAD uses bucket.head (no body); If-None-Match returns 304 with the cache headers", async () => {
  const head = await worker.fetch(req(JPG, { method: "HEAD" }), env);
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get("Content-Type"), "image/jpeg");
  assert.deepEqual(calls.at(-1), ["head", JPG]);
  const cached = await worker.fetch(req(WEBP, { headers: { "If-None-Match": "\"etag-1\"" } }), env);
  assert.equal(cached.status, 304);
  assert.equal(cached.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

await test("only the exact backend key shape is served; everything else is 404, no-store, never reaches the bucket", async () => {
  const before = calls.length;
  const refused = [
    [WEBP, { method: "PUT", body: "x" }], [WEBP, { method: "DELETE" }], [WEBP, { method: "POST", body: "x" }], [WEBP, { method: "OPTIONS" }], [WEBP, { method: "PATCH", body: "x" }],
    ["", {}], ["uploads/", {}], ["uploads/places/", {}], ["favicon.ico", {}], ["admin/login.html", {}],
    ["uploads/places/btk-001/0a1b2c3d4e5f-800.webp", {}], // 12 hex: the old draft pattern, never written by the backend
    [`uploads/places/btk-001/${HEX}0-800.webp`, {}], [`uploads/places/btk-001/${HEX.toUpperCase()}-800.webp`, {}],
    [`uploads/places/btk-001/${HEX}-900.webp`, {}], [`uploads/places/btk-001/${HEX}-800.png`, {}], [`uploads/places/btk-001/${HEX}-800.jpeg`, {}],
    [`uploads/places/btk-001/${HEX}-800.webp.jpg`, {}], [`uploads/places/BTK-001/${HEX}-800.webp`, {}], [`uploads/places/btk_001/${HEX}-800.webp`, {}],
    [`uploads/places/-btk/${HEX}-800.webp`, {}], [`uploads/places/btk-001/sub/${HEX}-800.webp`, {}], [`uploads/places/../secret/${HEX}-800.webp`, {}],
    [`uploads/places/%2e%2e/secret/${HEX}-800.webp`, {}], [`uploads/healthcheck/${"a".repeat(64)}.webp`, {}], [`uploads/routes/r1/${HEX}-800.webp`, {}],
    [`${WEBP}/`, {}], [`${WEBP}?list=1`, {}], [`${WEBP}?`, {}], [`uploads/places/${"a".repeat(65)}/${HEX}-800.webp`, {}]
  ];
  for (const [pathname, init] of refused) {
    const res = await worker.fetch(req(pathname, init), env);
    assert.equal(res.status, 404, `${init.method || "GET"} ${pathname}`);
    assert.equal(res.headers.get("Cache-Control"), "no-store", `${init.method || "GET"} ${pathname}`);
  }
  assert.equal(calls.length, before, "no bucket access for refused requests");
});

await test("allowlisted but missing key: 404, no-store (a deleted photo is never cached as found)", async () => {
  const res = await worker.fetch(req(`uploads/places/btk-001/${"f".repeat(32)}-1600.webp`), env);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

await test("a bucket error is a plain 503, not cached, with no details", async () => {
  const broken = { MEDIA_BUCKET: { async get() { throw new Error("R2 internal detail"); }, async head() { throw new Error("R2 internal detail"); } } };
  const res = await worker.fetch(req(WEBP), broken);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(await res.text(), /R2|internal|detail/);
});

await test("the Worker only reads: no put, delete or list call anywhere in the source", () => {
  const source = fs.readFileSync(path.join(root, "workers/takhun-media/src/index.mjs"), "utf8");
  const uses = [...source.matchAll(/MEDIA_BUCKET\s*\.\s*(\w+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0);
  assert.deepEqual([...new Set(uses)].sort(), ["get", "head"], "the bucket is only read: " + uses.join(","));
  assert.doesNotMatch(source, /\benv\s*\[|MEDIA_BUCKET\s*\[/, "no dynamic access to the binding");
});

await test("wrangler.jsonc: production = takhun-media-prod, env.staging = takhun-media-staging; workers.dev only, no routes", () => {
  const text = fs.readFileSync(path.join(root, "workers/takhun-media/wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const config = JSON.parse(text);
  assert.equal(config.name, "takhun-media");
  assert.equal(config.main, "src/index.mjs");
  assert.equal(config.workers_dev, true);
  assert.deepEqual(config.r2_buckets, [{ binding: "MEDIA_BUCKET", bucket_name: "takhun-media-prod" }]);
  assert.equal(config.env.staging.name, "takhun-media-staging");
  assert.equal(config.env.staging.workers_dev, true);
  assert.deepEqual(config.env.staging.r2_buckets, [{ binding: "MEDIA_BUCKET", bucket_name: "takhun-media-staging" }]);
  for (const scope of [config, config.env.staging]) {
    assert.equal(scope.routes, undefined);
    assert.equal(scope.route, undefined);
    assert.equal(JSON.stringify(scope).includes("custom_domain"), false);
  }
});

await test("the Worker lives outside public/ (Pages never builds or serves it)", () => {
  assert.equal(fs.existsSync(path.join(root, "public/workers")), false);
  assert.equal(fs.existsSync(path.join(root, "public/_worker.js")), false);
  assert.equal(fs.existsSync(path.join(root, "functions")), false);
});

if (!process.exitCode) process.stdout.write(`${passed} media Worker tests passed\n`);
