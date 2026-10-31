"use strict";
// Native browser check for public/admin/js/admin-image-resize.js (task 10): the real module in headless Chrome/Edge
// with the browser's own decoder (EXIF orientation), canvas and WebP/JPEG encoders. Every produced file is sent back
// to Node and checked with the real server rules (apps-script/MediaImageCheck.gs). The "no WebP encoder" (Safari)
// path is exercised by making toBlob answer PNG for WebP, exactly as Safari does.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");
const { pathToFileURL } = require("node:url");
const { withCdpBrowser } = require("./test-admin-reviews-cdp.js");

const root = path.join(__dirname, "..");
const moduleSource = fs.readFileSync(path.join(root, "public/admin/js/admin-image-resize.js"), "utf8");
const server = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "apps-script/MediaImageCheck.gs"), "utf8"), server);
const signed = (bytes) => Array.from(bytes, (b) => (b > 127 ? b - 256 : b));
const browsers = [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")
];
const browser = browsers.find((candidate) => candidate && fs.existsSync(candidate));
assert.ok(browser, "Chrome or Edge is required for the native image resize check");

// A camera-like picture: gradient + a red block in the top-left corner of the RAW pixels, so the rotation can be
// checked on the output (orientation 6 = turn 90° clockwise → the block must end up top-right).
async function cameraJpeg(width, height, orientation) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6f4f"/><stop offset="1" stop-color="#9cc3e6"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><rect x="0" y="0" width="${Math.round(width / 5)}" height="${Math.round(height / 5)}" fill="#ff0000"/></svg>`;
  let image = sharp(Buffer.from(svg)).jpeg({ quality: 88 });
  image = image.withExif({ IFD0: { Make: "QA Camera" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "9/1 8/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "99/1 19/1 0/1" } })
    .withMetadata({ orientation });
  const buffer = await image.toBuffer();
  assert.equal((await sharp(buffer).metadata()).orientation, orientation, "fixture carries the EXIF orientation");
  assert.ok(buffer.includes(Buffer.from("Exif\0\0")), "fixture carries EXIF (GPS)");
  return buffer;
}

async function fixtures() {
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic\0\0\0\0mif1heic", "latin1"), Buffer.alloc(256)]);
  return {
    camera: { bytes: await cameraJpeg(4032, 3024, 6), name: "IMG_0001.JPG", type: "image/jpeg" },
    png: { bytes: await sharp({ create: { width: 1234, height: 777, channels: 4, background: { r: 40, g: 120, b: 200, alpha: 0.6 } } }).png().toBuffer(), name: "shot.png", type: "image/png" },
    narrow: { bytes: await sharp({ create: { width: 900, height: 600, channels: 3, background: "#777777" } }).jpeg().toBuffer(), name: "small.jpg", type: "image/jpeg" },
    panorama: { bytes: await sharp({ create: { width: 5000, height: 1000, channels: 3, background: "#777777" } }).jpeg().toBuffer(), name: "pano.jpg", type: "image/jpeg" },
    heic: { bytes: heic, name: "IMG_0002.HEIC", type: "image/heic" }
  };
}

function page(files) {
  const embedded = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { b64: file.bytes.toString("base64"), name: file.name, type: file.type }]));
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
${moduleSource}
</script><script>
window.__resizeRun = (async () => {
  const api = window.TakhunImageResize;
  const files = ${JSON.stringify(embedded)};
  const fileOf = (key) => { const f = files[key]; const raw = atob(f.b64); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i); return new File([bytes], f.name, { type: f.type }); };
  const out = {};
  const run = async (key, file) => {
    const started = performance.now();
    try {
      const r = await api.prepare(file);
      out[key] = { ok: true, ms: Math.round(performance.now() - started), format: r.format, stripped: r.stripped, quality: r.quality, source: r.source,
        large: { width: r.large.width, height: r.large.height, b64: api.toBase64(r.large.bytes) },
        small: { width: r.small.width, height: r.small.height, b64: api.toBase64(r.small.bytes) } };
      // Where did the red block end up? Decode the produced large file and sample the four corners.
      const bitmap = await createImageBitmap(new Blob([r.large.bytes], { type: "image/" + r.format }));
      const c = document.createElement("canvas"); c.width = bitmap.width; c.height = bitmap.height;
      const g = c.getContext("2d"); g.drawImage(bitmap, 0, 0);
      const red = (x, y) => { const p = g.getImageData(x, y, 1, 1).data; return p[0] > 200 && p[1] < 60 && p[2] < 60; };
      const m = 10, w = bitmap.width - 1 - m, h = bitmap.height - 1 - m;
      out[key].red = { topLeft: red(m, m), topRight: red(w, m), bottomLeft: red(m, h), bottomRight: red(w, h) };
    } catch (error) {
      out[key] = { ok: false, code: error.code || "THREW", message: error.message };
    }
  };
  // Busy photo made in the page (noise), close to the real worst case for the 2 MB cap.
  const noisy = async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 4000;
    const g = c.getContext("2d"); const data = g.createImageData(3000, 4000);
    for (let i = 0; i < data.data.length; i += 4) { const v = (Math.random() * 256) | 0; data.data[i] = v; data.data[i + 1] = (v * 7) & 255; data.data[i + 2] = 255 - v; data.data[i + 3] = 255; }
    g.putImageData(data, 0, 0);
    const blob = await new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.95));
    c.width = 0; c.height = 0;
    return new File([blob], "busy.jpg", { type: "image/jpeg" });
  };
  out.encoderWebp = await new Promise((resolve) => { const c = document.createElement("canvas"); c.width = 2; c.height = 2; c.toBlob((b) => resolve(b && b.type), "image/webp", 0.8); });
  for (const key of Object.keys(files)) await run(key, fileOf(key));
  await run("busy", await noisy());
  // Safari path: no WebP encoder (toBlob answers PNG for WebP).
  const original = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) { return original.call(this, callback, type === "image/webp" ? "image/png" : type, quality); };
  await run("cameraNoWebp", fileOf("camera"));
  HTMLCanvasElement.prototype.toBlob = original;
  return JSON.stringify(out);
})().catch((error) => "FAIL " + error.message);
</script></body></html>`;
}

function serverCheck(entry) {
  const large = Buffer.from(entry.large.b64, "base64"), small = Buffer.from(entry.small.b64, "base64");
  const checked = server.MediaImageCheck_checkPair_(signed(large), signed(small), entry.format);
  assert.equal(large.includes(Buffer.from("Exif\0\0")), false, "no EXIF in the large file");
  assert.equal(small.includes(Buffer.from("Exif\0\0")), false, "no EXIF in the small file");
  return { checked, largeBytes: large.length, smallBytes: small.length };
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "takhun-image-resize-browser-"));
  const file = path.join(directory, "resize.html");
  fs.writeFileSync(file, page(await fixtures()));
  let raw;
  try {
    raw = await withCdpBrowser(browser, { timeoutMs: 20000, commandTimeoutMs: 120000 }, async (session) => {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      const loaded = session.waitForEvent("Page.loadEventFired");
      await session.send("Page.navigate", { url: pathToFileURL(file).href });
      await loaded;
      return session.evaluate("window.__resizeRun");
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(typeof raw, "string", "browser result missing");
  assert.ok(!raw.startsWith("FAIL"), raw.slice(0, 300));
  const out = JSON.parse(raw);
  assert.equal(out.encoderWebp, "image/webp", "Chrome encodes WebP");

  // Camera photo, orientation 6 + GPS → upright portrait WebP, red block top-right, accepted by the server.
  assert.equal(out.camera.ok, true, JSON.stringify(out.camera).slice(0, 300));
  assert.equal(out.camera.format, "webp");
  assert.deepEqual([out.camera.large.width, out.camera.large.height, out.camera.small.width, out.camera.small.height], [1600, 2133, 800, 1067]);
  assert.deepEqual(out.camera.red, { topLeft: false, topRight: true, bottomLeft: false, bottomRight: false }, "EXIF orientation applied");
  const camera = serverCheck(out.camera);

  // Same photo without a WebP encoder (Safari) → JPEG pair, no APP1 from Chrome's JPEG encoder, server accepts.
  assert.equal(out.cameraNoWebp.ok, true, JSON.stringify(out.cameraNoWebp).slice(0, 300));
  assert.equal(out.cameraNoWebp.format, "jpeg");
  assert.equal(out.cameraNoWebp.stripped, false, "Chrome's JPEG encoder adds no APP1");
  assert.deepEqual(out.cameraNoWebp.red, out.camera.red);
  serverCheck(out.cameraNoWebp);

  // PNG 1234 px keeps its width (D17).
  assert.equal(out.png.ok, true);
  assert.deepEqual([out.png.large.width, out.png.large.height, out.png.small.width, out.png.small.height], [1234, 777, 800, 504]);
  serverCheck(out.png);

  // Refusals with the Thai messages.
  assert.deepEqual([out.narrow.ok, out.narrow.code], [false, "WIDTH"]);
  assert.deepEqual([out.panorama.ok, out.panorama.code, out.panorama.message], [false, "ASPECT", "รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด"]);
  assert.deepEqual([out.heic.ok, out.heic.code], [false, "HEIC"]);

  // Busy photo: fits the caps (quality and/or width lowered as needed), server accepts.
  assert.equal(out.busy.ok, true, JSON.stringify(out.busy).slice(0, 300));
  const busy = serverCheck(out.busy);
  assert.ok(busy.largeBytes <= 2 * 1024 * 1024 && busy.smallBytes <= 600 * 1024);

  console.log(`Admin image resize native browser check passed: camera ${camera.largeBytes}/${camera.smallBytes} B in ${out.camera.ms} ms; ` +
    `busy ${out.busy.large.width}x${out.busy.large.height} q${out.busy.quality.large} ${busy.largeBytes}/${busy.smallBytes} B in ${out.busy.ms} ms.`);
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
