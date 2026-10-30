// Server-side checks on the two resized photo files the Admin browser sends (spec v5.2 C4, D4, D9, D17, D18).
// Pure functions over byte arrays (Apps Script signed bytes or 0-255): no Apps Script services, safe in any load order.
// Reads the real format and pixel size from the bytes (never trusts the client) and refuses metadata that can
// carry personal data (EXIF incl. GPS, XMP, IPTC). Errors are fixed codes only:
//   IMAGE_FORMAT   not a single-frame WebP or JPEG, truncated, or extra bytes after the image
//   IMAGE_EXIF     EXIF / XMP / IPTC metadata present
//   IMAGE_WIDTH    large file not 1000-1600 px wide (D4, D17), small file not 800 px wide, or height > 4 x width
//   IMAGE_SIZE     large file > 2 MB or small file > 600 KB (D18)
//   IMAGE_MISMATCH files differ from the declared format, from each other, or in shape

var MediaImageCheck_MAX_LARGE_BYTES_ = 2 * 1024 * 1024;
var MediaImageCheck_MAX_SMALL_BYTES_ = 600 * 1024;
var MediaImageCheck_MIN_LARGE_WIDTH_ = 1000;
var MediaImageCheck_MAX_LARGE_WIDTH_ = 1600;
var MediaImageCheck_SMALL_WIDTH_ = 800;
var MediaImageCheck_MAX_ASPECT_ = 4;

function MediaImageCheck_isBytes_(bytes) {
  return !!bytes && typeof bytes === "object" && typeof bytes.length === "number" && bytes.length >= 0;
}

function MediaImageCheck_reader_(bytes) {
  var length = bytes.length;
  function u8(offset) {
    if (offset < 0 || offset >= length) throw new Error("IMAGE_FORMAT");
    return bytes[offset] & 0xff;
  }
  return {
    length: length,
    u8: u8,
    le16: function (offset) { return u8(offset) | (u8(offset + 1) << 8); },
    le24: function (offset) { return u8(offset) | (u8(offset + 1) << 8) | (u8(offset + 2) << 16); },
    le32: function (offset) { return (u8(offset) | (u8(offset + 1) << 8) | (u8(offset + 2) << 16)) + u8(offset + 3) * 16777216; },
    be16: function (offset) { return (u8(offset) << 8) | u8(offset + 1); },
    ascii: function (offset, count) {
      var text = "";
      for (var i = 0; i < count; i += 1) text += String.fromCharCode(u8(offset + i));
      return text;
    }
  };
}

// Returns { format: "webp" | "jpeg", width, height } or throws IMAGE_FORMAT / IMAGE_EXIF.
function MediaImageCheck_inspect_(bytes) {
  if (!MediaImageCheck_isBytes_(bytes) || bytes.length < 16) throw new Error("IMAGE_FORMAT");
  var reader = MediaImageCheck_reader_(bytes);
  if (reader.ascii(0, 4) === "RIFF" && reader.ascii(8, 4) === "WEBP") return MediaImageCheck_webp_(reader);
  if (reader.u8(0) === 0xff && reader.u8(1) === 0xd8) return MediaImageCheck_jpeg_(reader);
  throw new Error("IMAGE_FORMAT");
}

// WebP container: RIFF size must match the file exactly; chunks VP8X / ALPH / ICCP / VP8 / VP8L only.
function MediaImageCheck_webp_(reader) {
  if (reader.le32(4) + 8 !== reader.length) throw new Error("IMAGE_FORMAT");
  var offset = 12;
  var canvas = null;
  var bitstream = null;
  var first = true;
  while (offset < reader.length) {
    var fourcc = reader.ascii(offset, 4);
    var size = reader.le32(offset + 4);
    var data = offset + 8;
    var next = data + size + (size % 2);
    if (next > reader.length) throw new Error("IMAGE_FORMAT");
    if (fourcc === "EXIF" || fourcc === "XMP ") throw new Error("IMAGE_EXIF");
    if (fourcc === "VP8X") {
      if (!first || size < 10) throw new Error("IMAGE_FORMAT");
      var flags = reader.u8(data);
      if (flags & 0x08 || flags & 0x04) throw new Error("IMAGE_EXIF");
      if (flags & 0x02) throw new Error("IMAGE_FORMAT"); // animation
      canvas = { width: reader.le24(data + 4) + 1, height: reader.le24(data + 7) + 1 };
    } else if (fourcc === "VP8 ") {
      if (bitstream || size < 10 || reader.u8(data + 3) !== 0x9d || reader.u8(data + 4) !== 0x01 || reader.u8(data + 5) !== 0x2a) {
        throw new Error("IMAGE_FORMAT");
      }
      bitstream = { width: reader.le16(data + 6) & 0x3fff, height: reader.le16(data + 8) & 0x3fff };
    } else if (fourcc === "VP8L") {
      if (bitstream || size < 5 || reader.u8(data) !== 0x2f) throw new Error("IMAGE_FORMAT");
      var b1 = reader.u8(data + 1), b2 = reader.u8(data + 2), b3 = reader.u8(data + 3), b4 = reader.u8(data + 4);
      bitstream = { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
    } else if (fourcc === "ALPH" || fourcc === "ICCP") {
      if (!canvas) throw new Error("IMAGE_FORMAT");
    } else {
      throw new Error("IMAGE_FORMAT"); // ANIM, ANMF and unknown chunks
    }
    first = false;
    offset = next;
  }
  if (offset !== reader.length || !bitstream) throw new Error("IMAGE_FORMAT");
  var dims = canvas || bitstream;
  if (canvas && (canvas.width !== bitstream.width || canvas.height !== bitstream.height)) throw new Error("IMAGE_FORMAT");
  if (dims.width < 1 || dims.height < 1) throw new Error("IMAGE_FORMAT");
  return { format: "webp", width: dims.width, height: dims.height };
}

// JPEG: segments up to the first SOS are parsed; APP1 (EXIF/XMP) and APP13 (IPTC) are refused; the file must end
// with EOI and nothing after it. Width and height come from the SOF segment.
function MediaImageCheck_jpeg_(reader) {
  if (reader.u8(reader.length - 2) !== 0xff || reader.u8(reader.length - 1) !== 0xd9) throw new Error("IMAGE_FORMAT");
  var offset = 2;
  var frame = null;
  while (true) {
    if (reader.u8(offset) !== 0xff) throw new Error("IMAGE_FORMAT");
    var marker = reader.u8(offset + 1);
    while (marker === 0xff) { offset += 1; marker = reader.u8(offset + 1); }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) throw new Error("IMAGE_FORMAT");
    var length = reader.be16(offset + 2);
    if (length < 2 || offset + 2 + length > reader.length - 2) throw new Error("IMAGE_FORMAT");
    if (marker === 0xe1 || marker === 0xed) throw new Error("IMAGE_EXIF");
    var isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (frame || length < 8) throw new Error("IMAGE_FORMAT");
      frame = { height: reader.be16(offset + 5), width: reader.be16(offset + 7) };
    }
    if (marker === 0xda) break;
    offset += 2 + length;
  }
  if (!frame || frame.width < 1 || frame.height < 1) throw new Error("IMAGE_FORMAT");
  return { format: "jpeg", width: frame.width, height: frame.height };
}

// Checks the pair the browser made from one photo. declaredFormat: "webp" | "jpeg".
// Returns { format, large: { width, height, bytes }, small: { width, height, bytes } }.
function MediaImageCheck_checkPair_(largeBytes, smallBytes, declaredFormat) {
  if (declaredFormat !== "webp" && declaredFormat !== "jpeg") throw new Error("IMAGE_FORMAT");
  if (!MediaImageCheck_isBytes_(largeBytes) || !MediaImageCheck_isBytes_(smallBytes)) throw new Error("IMAGE_FORMAT");
  // Size caps first, so an oversized upload is never parsed.
  if (largeBytes.length > MediaImageCheck_MAX_LARGE_BYTES_ || smallBytes.length > MediaImageCheck_MAX_SMALL_BYTES_) {
    throw new Error("IMAGE_SIZE");
  }
  var large = MediaImageCheck_inspect_(largeBytes);
  var small = MediaImageCheck_inspect_(smallBytes);
  if (large.format !== declaredFormat || small.format !== declaredFormat) throw new Error("IMAGE_MISMATCH");
  if (large.width < MediaImageCheck_MIN_LARGE_WIDTH_ || large.width > MediaImageCheck_MAX_LARGE_WIDTH_ ||
      large.height > large.width * MediaImageCheck_MAX_ASPECT_ || large.width > large.height * MediaImageCheck_MAX_ASPECT_ ||
      small.width !== MediaImageCheck_SMALL_WIDTH_) {
    throw new Error("IMAGE_WIDTH");
  }
  var expectedSmallHeight = large.height * MediaImageCheck_SMALL_WIDTH_ / large.width;
  if (Math.abs(small.height - expectedSmallHeight) > 1) throw new Error("IMAGE_MISMATCH");
  return {
    format: declaredFormat,
    large: { width: large.width, height: large.height, bytes: largeBytes.length },
    small: { width: small.width, height: small.height, bytes: smallBytes.length }
  };
}
