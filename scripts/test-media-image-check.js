"use strict";
// apps-script/MediaImageCheck.gs: server-side checks on the two resized files the browser sends (spec C4, D4, D9,
// D17, D18). Images are generated at test time with sharp (pinned dependency), so no binary fixtures are committed.
// The .gs file runs unmodified in a bare vm (it must not need any Apps Script service) and receives Apps Script
// style signed byte arrays.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "apps-script", "MediaImageCheck.gs"), "utf8");
const context = vm.createContext({});
vm.runInContext(SOURCE, context, { filename: "apps-script/MediaImageCheck.gs" });

let passed = 0;
async function test(name, body) {
  try { await body(); passed += 1; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}
const signed = (buffer) => Array.from(buffer, (b) => (b > 127 ? b - 256 : b));
const code = (fn) => { try { fn(); return "OK"; } catch (error) { return error.message; } };
const blank = (width, height, channels = 3) => sharp({ create: { width, height, channels, background: channels === 4 ? { r: 40, g: 120, b: 80, alpha: 0.5 } : "#2a7a50" } });
// Noise keeps encoded sizes realistic (a flat colour compresses to almost nothing).
const noisy = (width, height) => sharp(Buffer.from(Array.from({ length: width * height * 3 }, (_, i) => (i * 2654435761) >>> 24)), { raw: { width, height, channels: 3 } });
const GPS = { IFD0: { Make: "PhoneCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "13/1 45/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "100/1 30/1 0/1" } };

(async () => {
  const webpLarge = await blank(1600, 1200).webp({ quality: 82 }).toBuffer();
  const webpSmall = await blank(800, 600).webp({ quality: 82 }).toBuffer();
  const jpegLarge = await blank(1600, 1200).jpeg({ quality: 82 }).toBuffer();
  const jpegSmall = await blank(800, 600).jpeg({ quality: 82 }).toBuffer();

  await test("WebP lossy (VP8), lossless (VP8L) and alpha (VP8X + ALPH): format and size read from the bytes", async () => {
    assert.deepEqual({ ...context.MediaImageCheck_inspect_(signed(webpLarge)) }, { format: "webp", width: 1600, height: 1200 });
    const lossless = await blank(1000, 750).webp({ lossless: true }).toBuffer();
    assert.equal(lossless.toString("latin1", 12, 16), "VP8L");
    assert.deepEqual({ ...context.MediaImageCheck_inspect_(signed(lossless)) }, { format: "webp", width: 1000, height: 750 });
    const alpha = await blank(1200, 900, 4).webp({ quality: 80 }).toBuffer();
    assert.equal(alpha.toString("latin1", 12, 16), "VP8X");
    assert.deepEqual({ ...context.MediaImageCheck_inspect_(signed(alpha)) }, { format: "webp", width: 1200, height: 900 });
  });

  await test("JPEG (baseline and progressive): format and size read from the SOF segment", async () => {
    assert.deepEqual({ ...context.MediaImageCheck_inspect_(signed(jpegLarge)) }, { format: "jpeg", width: 1600, height: 1200 });
    const progressive = await blank(1000, 1500).jpeg({ quality: 80, progressive: true }).toBuffer();
    assert.deepEqual({ ...context.MediaImageCheck_inspect_(signed(progressive)) }, { format: "jpeg", width: 1000, height: 1500 });
  });

  await test("EXIF/GPS and XMP are refused (camera JPEG with GPS, WebP with EXIF or XMP)", async () => {
    const cameraJpeg = await blank(1600, 1200).jpeg().withExif(GPS).toBuffer();
    assert.ok(cameraJpeg.includes(Buffer.from("Exif\0\0")), "fixture really carries EXIF");
    assert.equal(code(() => context.MediaImageCheck_inspect_(signed(cameraJpeg))), "IMAGE_EXIF");
    const jpegXmp = await blank(1600, 1200).jpeg().withXmp("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"></x:xmpmeta>").toBuffer();
    assert.equal(code(() => context.MediaImageCheck_inspect_(signed(jpegXmp))), "IMAGE_EXIF");
    const webpExif = await blank(1600, 1200).webp().withExif(GPS).toBuffer();
    assert.equal(code(() => context.MediaImageCheck_inspect_(signed(webpExif))), "IMAGE_EXIF");
    const webpXmp = await blank(1600, 1200).webp().withXmp("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"></x:xmpmeta>").toBuffer();
    assert.equal(code(() => context.MediaImageCheck_inspect_(signed(webpXmp))), "IMAGE_EXIF");
  });

  await test("other formats, truncated, padded and empty files are refused as IMAGE_FORMAT", async () => {
    const png = await blank(1600, 1200).png().toBuffer();
    const gif = await blank(1600, 1200).gif().toBuffer();
    for (const [label, bytes] of [
      ["png", png], ["gif", gif], ["empty", Buffer.alloc(0)], ["text", Buffer.from("RIFF....WEBPhello")],
      ["webp truncated", webpLarge.subarray(0, webpLarge.length - 10)], ["webp extra bytes", Buffer.concat([webpLarge, Buffer.from([0, 0, 0, 0])])],
      ["jpeg truncated", jpegLarge.subarray(0, jpegLarge.length - 2)], ["jpeg head only", jpegLarge.subarray(0, 20)],
      ["jpeg trailing data", Buffer.concat([jpegLarge, Buffer.from("tail")])]
    ]) {
      assert.equal(code(() => context.MediaImageCheck_inspect_(signed(bytes))), "IMAGE_FORMAT", label);
    }
    assert.equal(code(() => context.MediaImageCheck_inspect_(null)), "IMAGE_FORMAT");
    assert.equal(code(() => context.MediaImageCheck_inspect_("RIFF")), "IMAGE_FORMAT");
  });

  await test("an animated WebP is refused", async () => {
    // Hand-built per the WebP container spec (sharp cannot write animation here): VP8X (animation flag) + ANIM +
    // ANMF wrapping a real VP8 frame from a still image.
    const still = await blank(1000, 750).webp().toBuffer();
    assert.equal(still.toString("latin1", 12, 16), "VP8 ");
    const frameChunk = still.subarray(12);
    const le24 = (value) => Buffer.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]);
    const chunk = (fourcc, data) => {
      const header = Buffer.alloc(8); header.write(fourcc, 0, "latin1"); header.writeUInt32LE(data.length, 4);
      return Buffer.concat([header, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
    };
    const vp8x = chunk("VP8X", Buffer.concat([Buffer.from([0x02, 0, 0, 0]), le24(999), le24(749)]));
    const anim = chunk("ANIM", Buffer.from([0, 0, 0, 0, 0, 0]));
    const anmf = chunk("ANMF", Buffer.concat([le24(0), le24(0), le24(999), le24(749), le24(100), Buffer.from([0]), frameChunk]));
    const body = Buffer.concat([Buffer.from("WEBP", "latin1"), vp8x, anim, anmf]);
    const riff = Buffer.alloc(8); riff.write("RIFF", 0, "latin1"); riff.writeUInt32LE(body.length, 4);
    const animated = Buffer.concat([riff, body]);
    assert.equal(code(() => context.MediaImageCheck_inspect_(signed(still))), "OK", "the still frame alone is accepted");
    assert.equal(code(() => context.MediaImageCheck_inspect_(signed(animated))), "IMAGE_FORMAT");
    // Same container with the animation flag cleared still holds ANIM/ANMF chunks: refused as well.
    const unflagged = Buffer.from(animated); unflagged[20] = 0x00;
    assert.equal(code(() => context.MediaImageCheck_inspect_(signed(unflagged))), "IMAGE_FORMAT");
  });

  await test("a valid pair: same format, large 1600 wide, small 800 wide, same shape", async () => {
    const result = context.MediaImageCheck_checkPair_(signed(webpLarge), signed(webpSmall), "webp");
    assert.equal(result.format, "webp");
    assert.deepEqual({ ...result.large }, { width: 1600, height: 1200, bytes: webpLarge.length });
    assert.deepEqual({ ...result.small }, { width: 800, height: 600, bytes: webpSmall.length });
    const jpeg = context.MediaImageCheck_checkPair_(signed(jpegLarge), signed(jpegSmall), "jpeg");
    assert.equal(jpeg.format, "jpeg");
  });

  await test("D17: a 1000-1599 px photo keeps its real width (no upscaling); D4: under 1000 px is refused", async () => {
    const large1000 = await blank(1000, 1333).jpeg().toBuffer();
    const small1000 = await blank(800, 1066).jpeg().toBuffer();
    const result = context.MediaImageCheck_checkPair_(signed(large1000), signed(small1000), "jpeg");
    assert.equal(result.large.width, 1000);
    assert.equal(result.large.height, 1333);
    const large999 = await blank(999, 750).webp().toBuffer();
    const small999 = await blank(800, 601).webp().toBuffer();
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(large999), signed(small999), "webp")), "IMAGE_WIDTH");
    const large1601 = await blank(1601, 1200).webp().toBuffer();
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(large1601), signed(webpSmall), "webp")), "IMAGE_WIDTH");
    const small801 = await blank(801, 601).webp().toBuffer();
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(webpLarge), signed(small801), "webp")), "IMAGE_WIDTH");
    const tall = await blank(1000, 4001).webp().toBuffer();
    const tallSmall = await blank(800, 3201).webp().toBuffer();
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(tall), signed(tallSmall), "webp")), "IMAGE_WIDTH", "height over 4 x width");
  });

  await test("pair mismatches are refused: format vs declared, mixed formats, different shape", async () => {
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(webpLarge), signed(webpSmall), "jpeg")), "IMAGE_MISMATCH");
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(webpLarge), signed(jpegSmall), "webp")), "IMAGE_MISMATCH");
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(webpLarge), signed(webpSmall), "png")), "IMAGE_FORMAT");
    const squareSmall = await blank(800, 800).webp().toBuffer();
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(webpLarge), signed(squareSmall), "webp")), "IMAGE_MISMATCH");
    const roundedSmall = await blank(800, 601).webp().toBuffer();
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(webpLarge), signed(roundedSmall), "webp")), "OK", "1 px rounding allowed");
  });

  await test("D18 byte caps: large <= 2 MB, small <= 600 KB (refused as IMAGE_SIZE)", async () => {
    assert.equal(context.MediaImageCheck_MAX_LARGE_BYTES_, 2 * 1024 * 1024);
    assert.equal(context.MediaImageCheck_MAX_SMALL_BYTES_, 600 * 1024);
    const bigLarge = await noisy(1600, 1600).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
    const bigSmall = await noisy(800, 800).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
    assert.ok(bigLarge.length > 2 * 1024 * 1024, `large fixture is ${bigLarge.length} bytes`);
    assert.ok(bigSmall.length > 600 * 1024, `small fixture is ${bigSmall.length} bytes`);
    const okSmall = await blank(800, 800).jpeg().toBuffer();
    const okLarge = await blank(1600, 1600).jpeg().toBuffer();
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(bigLarge), signed(okSmall), "jpeg")), "IMAGE_SIZE");
    assert.equal(code(() => context.MediaImageCheck_checkPair_(signed(okLarge), signed(bigSmall), "jpeg")), "IMAGE_SIZE");
    // The size cap is checked before parsing, so a huge non-image is IMAGE_SIZE, not a slow parse.
    assert.equal(code(() => context.MediaImageCheck_checkPair_(new Array(2 * 1024 * 1024 + 1).fill(0), signed(okSmall), "jpeg")), "IMAGE_SIZE");
  });

  await test("errors are fixed codes only", async () => {
    const codes = new Set();
    for (const bytes of [null, [], signed(Buffer.from("x".repeat(40)))]) codes.add(code(() => context.MediaImageCheck_inspect_(bytes)));
    for (const value of codes) assert.match(value, /^IMAGE_(?:FORMAT|EXIF|WIDTH|SIZE|MISMATCH)$/);
  });

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write(`${passed} MediaImageCheck tests passed\n`);
})();
