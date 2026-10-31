"use strict";
// public/admin/js/admin-image-resize.js (task 10): browser resize + encode for place photo uploads.
// Runs the real module in a vm with fakes only at the browser edges: createImageBitmap (decodes with sharp, honours
// imageOrientation / resize options) and a canvas whose toBlob returns REAL image bytes made by sharp. Every output
// is then checked with the real server rules (apps-script/MediaImageCheck.gs), so "the server would accept it" is
// tested, not assumed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const MODULE_PATH = path.join(ROOT, "public", "admin", "js", "admin-image-resize.js");
const SOURCE = fs.readFileSync(MODULE_PATH, "utf8");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "apps-script", "MediaImageCheck.gs"), "utf8");
const SERVICE_SOURCE = fs.readFileSync(path.join(ROOT, "apps-script", "MediaUploadService.gs"), "utf8");
const MB = 1024 * 1024;
let passed = 0;
async function test(name, body) {
  try { await body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

// ---- real server check ----
const server = vm.createContext({});
vm.runInContext(SERVER_SOURCE, server, { filename: "MediaImageCheck.gs" });
const signed = (bytes) => Array.from(bytes, (b) => (b > 127 ? b - 256 : b));
function serverCheck(result) {
  return server.MediaImageCheck_checkPair_(signed(result.large.bytes), signed(result.small.bytes), result.format);
}

// ---- test images ----
const solid = (width, height, color = "#3a7d44") => sharp({ create: { width, height, channels: 3, background: color } });
async function jpegFile(width, height, { orientation, gps = false, name = "photo.jpg", type = "image/jpeg" } = {}) {
  let image = solid(width, height).jpeg({ quality: 80 });
  if (orientation) image = image.withMetadata({ orientation });
  if (gps) image = image.withExif({ IFD0: { Make: "QA Camera" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "9/1 8/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "99/1 19/1 0/1" } });
  return new File([await image.toBuffer()], name, { type });
}
async function pngFile(width, height, alpha = false) {
  const image = alpha ? sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }) : solid(width, height);
  return new File([await image.png().toBuffer()], "image.png", { type: "image/png" });
}

// ---- fake browser ----
function insertApp1(bytes) {
  const payload = Buffer.from("Exif\0\0MM\0\x2a\0\0\0\x08\0\0", "latin1");
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  return Buffer.concat([bytes.subarray(0, 2), segment, bytes.subarray(2)]);
}

function browser({ encoder = "chrome", decode = "sharp", noise = false } = {}) {
  const stats = { decodes: [], canvases: [], blobs: [], slices: 0, closed: 0 };
  class FakeCanvas {
    constructor() { this.width = 300; this.height = 150; this.ops = []; this.source = null; stats.canvases.push(this); }
    getContext(kind) {
      assert.equal(kind, "2d");
      const canvas = this;
      return {
        set imageSmoothingEnabled(v) { canvas.ops.push(["smoothing", v]); },
        set imageSmoothingQuality(v) { canvas.ops.push(["quality", v]); },
        set fillStyle(v) { canvas.ops.push(["fillStyle", v]); },
        fillRect: (...a) => canvas.ops.push(["fillRect", ...a]),
        drawImage: (source, ...a) => { canvas.ops.push(["drawImage", ...a]); canvas.source = source; canvas.drawnWidth = canvas.width; }
      };
    }
    toBlob(callback, type, quality) {
      const canvas = this;
      const width = canvas.width, height = canvas.height;
      (async () => {
        if (encoder === "null") return callback(null);
        let base = (noise === true || (noise === "large" && width > 800)) ? sharp(require("node:crypto").randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }) : solid(width, height, "#5a8dc4");
        const q = Math.round((quality || 0.92) * 100);
        let bytes, blobType = type;
        if (type === "image/webp" && encoder !== "chrome") { bytes = await base.png().toBuffer(); blobType = "image/png"; } // Safari: no WebP encoder
        else if (type === "image/webp") bytes = await base.webp({ quality: q }).toBuffer();
        else { bytes = await base.jpeg({ quality: q }).toBuffer(); if (encoder === "safari-app1") bytes = insertApp1(bytes); }
        const blob = new Blob([bytes], { type: blobType });
        stats.blobs.push({ type: blobType, quality, width, height, size: bytes.length });
        callback(blob);
      })().catch((error) => { stats.error = error; callback(null); });
    }
  }
  async function createImageBitmap(file, options = {}) {
    stats.decodes.push(options);
    if (decode === "fail") throw new Error("InvalidStateError");
    const buffer = Buffer.from(await file.arrayBuffer());
    let meta;
    try { meta = await sharp(buffer).metadata(); } catch (_error) { throw new Error("InvalidStateError: The source image could not be decoded."); }
    let width = meta.width, height = meta.height;
    const rotate = (meta.orientation || 1) >= 5 && options.imageOrientation !== "none";
    if (decode === "resize-before-orientation" && options.resizeWidth) {
      // A browser that resizes the raw (un-rotated) pixels to the requested box, then rotates: aspect comes out wrong.
      width = options.resizeWidth; height = options.resizeHeight;
      if (rotate) [width, height] = [height, width];
    } else {
      if (rotate) [width, height] = [height, width];
      if (options.resizeWidth) { width = options.resizeWidth; height = options.resizeHeight; }
    }
    return { width, height, close() { stats.closed += 1; } };
  }
  const context = {
    console, Promise, Uint8Array, ArrayBuffer, DataView, Math, Number, String, Object, Array, Error, JSON, Blob, File,
    btoa: (s) => Buffer.from(s, "latin1").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("latin1"),
    performance: { now: () => Date.now() },
    document: { createElement: (tag) => { assert.equal(tag, "canvas"); return new FakeCanvas(); } },
    createImageBitmap
  };
  context.window = context; context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: "admin-image-resize.js" });
  const api = context.TakhunImageResize;
  const wrapped = (file) => {
    if (file && typeof file.slice === "function") { const slice = file.slice.bind(file); file.slice = (...a) => { stats.slices += 1; return slice(...a); }; }
    return api.prepare(file);
  };
  return { api, prepare: wrapped, stats };
}
async function codeOf(promise) { try { await promise; return "OK"; } catch (error) { return error.code || ("THREW " + error.message); } }

(async () => {
  await test("static: one global, no network, no storage, no eval", () => {
    assert.match(SOURCE, /global\.TakhunImageResize = Object\.freeze\(/);
    assert.doesNotMatch(SOURCE, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|\beval\s*\(|new Function/);
  });

  await test("limits mirror the server (20 MB source, >= 1000 px, large <= 1600 px / 2 MB, small 800 px / 600 KB, 4:1)", () => {
    const { api } = browser();
    assert.equal(api.LIMITS.MAX_SOURCE_BYTES, 20 * MB);
    assert.equal(api.LIMITS.MIN_WIDTH, server.MediaImageCheck_MIN_LARGE_WIDTH_);
    assert.equal(api.LIMITS.LARGE_MAX_WIDTH, server.MediaImageCheck_MAX_LARGE_WIDTH_);
    assert.equal(api.LIMITS.SMALL_WIDTH, server.MediaImageCheck_SMALL_WIDTH_);
    assert.equal(api.LIMITS.MAX_ASPECT, server.MediaImageCheck_MAX_ASPECT_);
    assert.equal(api.LIMITS.MAX_LARGE_BYTES, server.MediaImageCheck_MAX_LARGE_BYTES_);
    assert.equal(api.LIMITS.MAX_SMALL_BYTES, server.MediaImageCheck_MAX_SMALL_BYTES_);
  });

  await test("Thai messages: width and 4:1 texts are the server's own (one wording everywhere)", () => {
    const { api } = browser();
    assert.ok(SERVICE_SOURCE.includes(`IMAGE_ASPECT: ["aspect", "${api.MESSAGES.ASPECT}"]`));
    assert.ok(SERVICE_SOURCE.includes(`IMAGE_WIDTH: ["width", "${api.MESSAGES.WIDTH}"]`));
    for (const code of ["FILE_TYPE", "FILE_SIZE", "HEIC", "DECODE", "WIDTH", "ASPECT", "ENCODE", "OUTPUT_SIZE"]) assert.match(api.MESSAGES[code], /[฀-๿]/, code);
  });

  await test("not an image (PDF, missing file) → FILE_TYPE with nothing read or decoded", async () => {
    const env = browser();
    assert.equal(await codeOf(env.prepare(new File([Buffer.from("%PDF-1.7")], "doc.pdf", { type: "application/pdf" }))), "FILE_TYPE");
    assert.equal(await codeOf(env.prepare(null)), "FILE_TYPE");
    assert.equal(env.stats.slices + env.stats.decodes.length, 0);
  });

  await test("> 20 MB → FILE_SIZE before reading or decoding (D4, D18); exactly 20 MB is allowed past this check", async () => {
    const env = browser();
    const big = new File([new Uint8Array(20 * MB + 1)], "big.jpg", { type: "image/jpeg" });
    const error = await env.prepare(big).catch((e) => e);
    assert.equal(error.code, "FILE_SIZE");
    assert.equal(error.message, env.api.MESSAGES.FILE_SIZE);
    assert.equal(env.stats.slices, 0);
    assert.equal(env.stats.decodes.length, 0);
    const edge = new File([new Uint8Array(20 * MB)], "edge.jpg", { type: "image/jpeg" });
    assert.notEqual(await codeOf(env.prepare(edge)), "FILE_SIZE");
  });

  await test("< 1000 px wide → WIDTH from the header, before decoding", async () => {
    const env = browser();
    assert.equal(await codeOf(env.prepare(await jpegFile(999, 700))), "WIDTH");
    assert.equal(await codeOf(env.prepare(await pngFile(900, 600))), "WIDTH");
    assert.equal(env.stats.decodes.length, 0);
  });

  await test("wider or taller than 4:1 → ASPECT before decoding, with the server's crop message", async () => {
    const env = browser();
    const error = await env.prepare(await jpegFile(4200, 1000)).catch((e) => e);
    assert.equal(error.code, "ASPECT");
    assert.equal(error.message, "รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด");
    assert.equal(await codeOf(env.prepare(await jpegFile(1000, 4001))), "ASPECT");
    assert.equal(env.stats.decodes.length, 0);
    assert.equal(await codeOf(env.prepare(await jpegFile(4000, 1000))), "OK", "exactly 4:1 is allowed (server: > 4 is refused)");
  });

  await test("EXIF orientation is applied: a sideways 4032x3024 camera JPEG (orientation 6) becomes portrait 1600x2133 / 800x1067", async () => {
    const env = browser();
    const result = await env.prepare(await jpegFile(4032, 3024, { orientation: 6, gps: true }));
    assert.deepEqual([result.large.width, result.large.height, result.small.width, result.small.height], [1600, 2133, 800, 1067]);
    assert.equal(result.source.orientation, 6);
    assert.deepEqual([result.source.width, result.source.height], [3024, 4032]);
    assert.deepEqual(JSON.parse(JSON.stringify(env.stats.decodes[0])), { imageOrientation: "from-image", resizeWidth: 1600, resizeHeight: 2133, resizeQuality: "high" }, "decoded straight to the large size (iOS memory)");
    const checked = serverCheck(result);
    assert.equal(checked.large.width, 1600);
  });

  await test("orientation decides the width rule: raw 1200x900 turned sideways (900 wide) → WIDTH; raw 900x1200 turned → OK", async () => {
    const env = browser();
    assert.equal(await codeOf(env.prepare(await jpegFile(1200, 900, { orientation: 6 }))), "WIDTH");
    const result = await env.prepare(await jpegFile(900, 1200, { orientation: 8 }));
    assert.deepEqual([result.large.width, result.large.height], [1200, 900]);
  });

  await test("1000-1599 px wide keeps its real width (D17); small is always 800 wide with the same shape (server ±1 px)", async () => {
    const env = browser();
    const result = await env.prepare(await jpegFile(1234, 777));
    assert.deepEqual([result.large.width, result.large.height, result.small.width, result.small.height], [1234, 777, 800, 504]);
    serverCheck(result);
  });

  await test("Chrome (WebP encoder): both sizes WebP, no EXIF/GPS, accepted by the real server check", async () => {
    const env = browser({ encoder: "chrome" });
    const result = await env.prepare(await jpegFile(3000, 2000, { gps: true }));
    assert.equal(result.format, "webp");
    assert.ok(env.stats.blobs.every((blob) => blob.type === "image/webp"));
    const checked = serverCheck(result);
    assert.deepEqual([checked.large.width, checked.large.height, checked.small.width, checked.small.height], [1600, 1067, 800, 533]);
    assert.equal(result.stripped, false);
  });

  await test("Safari (no WebP encoder: toBlob returns PNG) → both sizes JPEG; server accepts", async () => {
    const env = browser({ encoder: "safari" });
    const result = await env.prepare(await jpegFile(3000, 2000));
    assert.equal(result.format, "jpeg");
    assert.deepEqual(env.stats.blobs.map((blob) => blob.type), ["image/png", "image/jpeg", "image/jpeg"], "WebP probe (tiny canvas) answered PNG; then small and large as JPEG");
    assert.equal(env.stats.blobs[0].width, 2);
    serverCheck(result);
  });

  await test("JPEG with an APP1 (EXIF) block from the encoder → stripped before sending (D22 risk); server accepts", async () => {
    const env = browser({ encoder: "safari-app1" });
    const result = await env.prepare(await jpegFile(3000, 2000));
    assert.equal(result.format, "jpeg");
    assert.equal(result.stripped, true);
    for (const output of [result.large, result.small]) assert.equal(Buffer.from(output.bytes).includes(Buffer.from("Exif\0\0")), false);
    serverCheck(result);
    const withApp1 = insertApp1(await solid(10, 10).jpeg().toBuffer());
    const raw = env.api._internal.stripJpegMetadata(new Uint8Array(withApp1));
    assert.throws(() => server.MediaImageCheck_inspect_(signed(withApp1)), /IMAGE_EXIF/);
    assert.equal(server.MediaImageCheck_inspect_(signed(raw)).width, 10);
  });

  await test("PNG with transparency is drawn on white (same look in WebP and JPEG)", async () => {
    const env = browser({ encoder: "safari" });
    await env.prepare(await pngFile(1200, 800, true));
    const large = env.stats.canvases.find((canvas) => canvas.drawnWidth === 1200);
    const fill = large.ops.findIndex((op) => op[0] === "fillRect");
    const draw = large.ops.findIndex((op) => op[0] === "drawImage");
    assert.ok(fill !== -1 && fill < draw);
    assert.deepEqual(large.ops.find((op) => op[0] === "fillStyle"), ["fillStyle", "#ffffff"]);
  });

  await test("busy portrait photo: quality steps down until large <= 2 MB (width kept at 1600); server accepts", async () => {
    const env = browser({ encoder: "chrome", noise: "large" });
    const result = await env.prepare(await jpegFile(3000, 4000));
    assert.deepEqual([result.large.width, result.large.height], [1600, 2133]);
    assert.ok(result.large.bytes.length <= 2 * MB && result.small.bytes.length <= 600 * 1024);
    assert.ok(result.quality.large < 0.82, "at least one lower-quality retry");
    serverCheck(result);
  });

  await test("very busy tall photo that no quality fits at 1600 px → large width lowered (never below 1000); server accepts", async () => {
    const env = browser({ encoder: "safari", noise: "large" });
    const result = await env.prepare(await jpegFile(1600, 6400));
    assert.equal(result.format, "jpeg");
    assert.ok(result.large.width < 1600 && result.large.width >= 1000, String(result.large.width));
    assert.equal(result.large.height, Math.round(6400 * result.large.width / 1600));
    assert.ok(result.large.bytes.length <= 2 * MB);
    assert.equal(result.small.width, 800);
    serverCheck(result);
  });

  await test("small file that cannot fit 600 KB at any quality → OUTPUT_SIZE at once, the large file is never tried", async () => {
    const env = browser({ encoder: "safari", noise: true });
    const error = await env.prepare(await jpegFile(1000, 4000)).catch((e) => e);
    assert.equal(error.code, "OUTPUT_SIZE");
    assert.ok(env.stats.blobs.slice(1).every((blob) => blob.width === 800), "only the small canvas was encoded");
    assert.ok(env.stats.canvases.every((canvas) => canvas.width === 0), "canvases released on failure too");
  });

  await test("small size follows the photo's own shape (not the rounded large size)", () => {
    const { api } = browser();
    const size = JSON.parse(JSON.stringify(api._internal.targets(3000, 2000)));
    assert.deepEqual(size, { large: { width: 1600, height: 1067 }, small: { width: 800, height: 533 } });
  });

  await test("encoder gives nothing (toBlob null) → ENCODE", async () => {
    const env = browser({ encoder: "null" });
    assert.equal(await codeOf(env.prepare(await jpegFile(1600, 1000))), "ENCODE");
  });

  await test("HEIC the browser cannot open → HEIC message; other undecodable bytes → DECODE", async () => {
    const env = browser();
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic\0\0\0\0mif1heic", "latin1"), Buffer.alloc(64)]);
    const error = await env.prepare(new File([heic], "IMG_0001.HEIC", { type: "image/heic" })).catch((e) => e);
    assert.equal(error.code, "HEIC");
    assert.match(error.message, /HEIC/);
    assert.equal(await codeOf(env.prepare(new File([heic], "IMG_0002.heic", { type: "" }))), "HEIC", "iOS sometimes gives no type");
    assert.equal(await codeOf(env.prepare(new File([Buffer.from("not really a jpeg at all, just text")], "x.jpg", { type: "image/jpeg" }))), "DECODE");
  });

  await test("a browser whose resize ignores orientation is detected and decoded again without resize options", async () => {
    const env = browser({ decode: "resize-before-orientation" });
    const result = await env.prepare(await jpegFile(4032, 3024, { orientation: 6 }));
    assert.deepEqual([result.large.width, result.large.height], [1600, 2133]);
    assert.equal(env.stats.decodes.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(env.stats.decodes[1])), { imageOrientation: "from-image" });
    serverCheck(result);
  });

  await test("memory: every decoded bitmap is closed and every canvas released (width/height 0)", async () => {
    const env = browser({ decode: "resize-before-orientation" });
    await env.prepare(await jpegFile(4032, 3024, { orientation: 6 }));
    assert.equal(env.stats.closed, env.stats.decodes.length);
    assert.ok(env.stats.canvases.length >= 2 && env.stats.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  });

  await test("header reader: JPEG (with EXIF orientation), PNG, WebP (VP8 / VP8L / VP8X), HEIC brand", async () => {
    const { api } = browser();
    const read = (buffer) => JSON.parse(JSON.stringify(api._internal.readHeader(new Uint8Array(buffer))));
    assert.deepEqual(read(await solid(1500, 1000).jpeg().withMetadata({ orientation: 6 }).toBuffer()), { format: "jpeg", width: 1500, height: 1000, orientation: 6 });
    assert.deepEqual(read(await solid(1500, 1000).png().toBuffer()), { format: "png", width: 1500, height: 1000, orientation: 1 });
    assert.deepEqual(read(await solid(1500, 1000).webp({ quality: 80 }).toBuffer()), { format: "webp", width: 1500, height: 1000, orientation: 1 });
    assert.deepEqual(read(await solid(1500, 1000).webp({ lossless: true }).toBuffer()), { format: "webp", width: 1500, height: 1000, orientation: 1 });
    assert.deepEqual(read(await sharp({ create: { width: 1500, height: 1000, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).webp({ quality: 80 }).toBuffer()), { format: "webp", width: 1500, height: 1000, orientation: 1 });
    assert.equal(read(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(16)])).format, "heic");
    assert.equal(read(Buffer.from("garbage bytes here")).format, null);
  });

  await test("toBase64 matches Node's base64 for any byte (chunked, no stack overflow on 2 MB)", async () => {
    const { api } = browser();
    const bytes = new Uint8Array(2 * MB + 7).map((_, i) => (i * 31 + 7) & 0xff);
    assert.equal(api.toBase64(bytes), Buffer.from(bytes).toString("base64"));
    assert.equal(api.toBase64(new Uint8Array(0)), "");
  });

  if (!process.exitCode) process.stdout.write(`${passed} admin image resize tests passed\n`);
})();
