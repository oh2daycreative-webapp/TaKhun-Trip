"use strict";

// Place photo uploads (spec v5.2 T2, D4, D9, D17, D18, D22): turns one picked photo into the two files the server
// accepts: "large" (real width up to 1600 px) and "small" (800 px), WebP when the browser can encode it, otherwise
// JPEG for both. Re-drawing through a canvas drops EXIF/GPS; any APP1/APP13 block an encoder still adds is removed.
// Cheap checks run before decoding (type, 20 MB, width and 4:1 from the file header), and the photo is decoded
// straight to the large size where the browser allows it, to spare phone memory. No network, no storage.
(function createAdminImageResize(global) {
  const LIMITS = Object.freeze({
    MAX_SOURCE_BYTES: 20 * 1024 * 1024,
    MIN_WIDTH: 1000,
    LARGE_MAX_WIDTH: 1600,
    SMALL_WIDTH: 800,
    MAX_ASPECT: 4,
    MAX_LARGE_BYTES: 2 * 1024 * 1024,
    MAX_SMALL_BYTES: 600 * 1024
  });
  const QUALITIES = [0.82, 0.72, 0.62, 0.52];
  const HEADER_BYTES = 1024 * 1024;
  const MESSAGES = Object.freeze({
    FILE_TYPE: "ไฟล์นี้ไม่ใช่รูปภาพ กรุณาเลือกรูป JPEG, PNG หรือ WebP",
    FILE_SIZE: "ไฟล์รูปใหญ่เกิน 20 MB กรุณาเลือกรูปที่เล็กกว่านี้",
    HEIC: "เบราว์เซอร์นี้เปิดไฟล์ HEIC ไม่ได้ กรุณาเลือกรูปแบบ JPEG (iPhone: การตั้งค่า > กล้อง > รูปแบบ > ความเข้ากันได้มากที่สุด)",
    DECODE: "เปิดรูปนี้ไม่ได้ ไฟล์อาจเสียหรือเป็นรูปแบบที่เบราว์เซอร์ไม่รองรับ",
    WIDTH: "รูปต้องกว้างอย่างน้อย 1000 px",
    ASPECT: "รูปยาวหรือกว้างเกิน 4:1 กรุณาครอปรูปก่อนอัปโหลด",
    ENCODE: "ย่อรูปไม่สำเร็จ กรุณาลองใหม่หรือเลือกรูปอื่น",
    OUTPUT_SIZE: "ย่อรูปแล้วไฟล์ยังใหญ่เกินกำหนด กรุณาเลือกรูปอื่น"
  });
  const IMAGE_NAME = /\.(?:jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
  const HEIC_NAME = /\.(?:heic|heif)$/i;
  const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

  function failure(code) {
    const error = new Error(MESSAGES[code]);
    error.code = code;
    return error;
  }

  // ---- file header (no decoding) ----

  const ascii = (bytes, start, length) => String.fromCharCode.apply(null, Array.from(bytes.subarray(start, start + length)));
  const be16 = (bytes, at) => (bytes[at] << 8) | bytes[at + 1];
  const le16 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
  const le24 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);

  function exifOrientation(bytes, tiff, end) {
    if (tiff + 8 > end) return 1;
    const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
    if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return 1;
    const u16 = (at) => (little ? le16(bytes, at) : be16(bytes, at));
    const u32 = (at) => (little ? (le16(bytes, at) + le16(bytes, at + 2) * 65536) : (be16(bytes, at) * 65536 + be16(bytes, at + 2)));
    if (u16(tiff + 2) !== 42) return 1;
    const ifd = tiff + u32(tiff + 4);
    if (ifd + 2 > end) return 1;
    const count = u16(ifd);
    for (let index = 0; index < count; index += 1) {
      const entry = ifd + 2 + index * 12;
      if (entry + 12 > end) return 1;
      if (u16(entry) === 0x0112) {
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
    return 1;
  }

  function readJpeg(bytes) {
    let offset = 2, orientation = 1;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) break;
      const length = be16(bytes, offset + 2);
      if (length < 2) break;
      const data = offset + 4, end = Math.min(offset + 2 + length, bytes.length);
      if (marker === 0xe1 && ascii(bytes, data, 6) === "Exif\0\0") orientation = exifOrientation(bytes, data + 6, end);
      const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (frame && data + 5 <= bytes.length) return { format: "jpeg", width: be16(bytes, data + 3), height: be16(bytes, data + 1), orientation };
      offset += 2 + length;
    }
    return { format: "jpeg", width: 0, height: 0, orientation };
  }

  function readWebp(bytes) {
    const chunk = ascii(bytes, 12, 4), data = 20;
    if (chunk === "VP8X" && bytes.length >= data + 10) return { format: "webp", width: le24(bytes, data + 4) + 1, height: le24(bytes, data + 7) + 1, orientation: 1 };
    if (chunk === "VP8 " && bytes.length >= data + 10) return { format: "webp", width: le16(bytes, data + 6) & 0x3fff, height: le16(bytes, data + 8) & 0x3fff, orientation: 1 };
    if (chunk === "VP8L" && bytes.length >= data + 5) {
      const b1 = bytes[data + 1], b2 = bytes[data + 2], b3 = bytes[data + 3], b4 = bytes[data + 4];
      return { format: "webp", width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)), orientation: 1 };
    }
    return { format: "webp", width: 0, height: 0, orientation: 1 };
  }

  // { format: "jpeg"|"png"|"webp"|"gif"|"heic"|"avif"|null, width, height, orientation } (0 = unknown size).
  function readHeader(bytes) {
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
    if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") {
      return { format: "png", width: be16(bytes, 16) * 65536 + be16(bytes, 18), height: be16(bytes, 20) * 65536 + be16(bytes, 22), orientation: 1 };
    }
    if (bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return readWebp(bytes);
    if (bytes.length >= 10 && ascii(bytes, 0, 4) === "GIF8") return { format: "gif", width: le16(bytes, 6), height: le16(bytes, 8), orientation: 1 };
    if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
      const brand = ascii(bytes, 8, 4);
      if (HEIC_BRANDS.indexOf(brand) !== -1) return { format: "heic", width: 0, height: 0, orientation: 1 };
      if (brand === "avif" || brand === "avis") return { format: "avif", width: 0, height: 0, orientation: 1 };
    }
    return { format: null, width: 0, height: 0, orientation: 1 };
  }

  // ---- sizes ----

  function oriented(header) {
    return header.orientation >= 5 ? { width: header.height, height: header.width } : { width: header.width, height: header.height };
  }

  function checkShape(width, height) {
    if (width < LIMITS.MIN_WIDTH) throw failure("WIDTH");
    if (height > width * LIMITS.MAX_ASPECT || width > height * LIMITS.MAX_ASPECT) throw failure("ASPECT");
  }

  // D17: 1000-1599 px keeps its real width; both sizes follow the photo's own shape (the server allows ±1 px).
  // `largeWidth` is only given when a very busy photo must be made narrower to fit 2 MB.
  function targets(width, height, largeWidth) {
    const wide = largeWidth || Math.min(LIMITS.LARGE_MAX_WIDTH, width);
    return {
      large: { width: wide, height: Math.max(1, Math.round(height * wide / width)) },
      small: { width: LIMITS.SMALL_WIDTH, height: Math.max(1, Math.round(height * LIMITS.SMALL_WIDTH / width)) }
    };
  }

  // Large widths to try, widest first: the natural one, then narrower steps, never below the 1000 px minimum.
  function largeWidths(natural) {
    return [natural].concat([1400, 1200, LIMITS.MIN_WIDTH].filter((width) => width < natural));
  }

  // ---- decode ----

  function closeBitmap(bitmap) {
    if (bitmap && typeof bitmap.close === "function") { try { bitmap.close(); } catch (_closeError) { /* already closed */ } }
  }

  function picture(source, width, height, bitmap) {
    let open = true;
    return { source, width, height, close() { if (open) { open = false; closeBitmap(bitmap); } } };
  }

  function sameShape(bitmap, width, height) {
    return Math.abs(bitmap.width / bitmap.height - width / height) <= 0.01 * (width / height);
  }

  function decodeWithImage(file) {
    const ImageType = global.Image, url = global.URL;
    if (typeof ImageType !== "function" || !url || typeof url.createObjectURL !== "function") return Promise.reject(new Error("NO_DECODER"));
    return new Promise((resolve, reject) => {
      const image = new ImageType();
      const address = url.createObjectURL(file);
      const done = (ok) => {
        try { url.revokeObjectURL(address); } catch (_revokeError) { /* best effort */ }
        if (ok && image.naturalWidth > 0) resolve(picture(image, image.naturalWidth, image.naturalHeight, null));
        else reject(new Error("DECODE"));
      };
      image.onload = () => done(true);
      image.onerror = () => done(false);
      image.src = address;
    });
  }

  // Returns { source, width, height, close() } of the upright picture. `expected` = oriented header size when known.
  async function decode(file, expected) {
    if (typeof global.createImageBitmap === "function") {
      if (expected) {
        const target = targets(expected.width, expected.height).large;
        let bitmap = null;
        try {
          bitmap = await global.createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" });
        } catch (_resizeError) { bitmap = null; }
        // Some browsers resize before applying the EXIF rotation; the shape then comes out wrong, so decode again plainly.
        if (bitmap && sameShape(bitmap, expected.width, expected.height)) return picture(bitmap, bitmap.width, bitmap.height, bitmap);
        closeBitmap(bitmap);
      }
      try {
        const bitmap = await global.createImageBitmap(file, { imageOrientation: "from-image" });
        return picture(bitmap, bitmap.width, bitmap.height, bitmap);
      } catch (_decodeError) { /* fall back to <img> */ }
    }
    return decodeWithImage(file);
  }

  // ---- encode ----

  function canvas(width, height) {
    const element = global.document.createElement("canvas");
    element.width = width;
    element.height = height;
    return element;
  }

  function release(element) {
    if (element) { element.width = 0; element.height = 0; }
  }

  function draw(source, width, height) {
    const element = canvas(width, height);
    const context = element.getContext("2d");
    if (!context) throw failure("ENCODE");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff"; // transparent PNGs look the same in WebP and JPEG
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    return element;
  }

  function toBlob(element, type, quality) {
    return new Promise((resolve) => {
      try { element.toBlob((blob) => resolve(blob || null), type, quality); } catch (_blobError) { resolve(null); }
    });
  }

  // Removes APP1 (EXIF/XMP), APP13 (IPTC) and COM blocks before the image data; the server refuses APP1/APP13 (D22).
  function stripJpegMetadata(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
    const keep = [bytes.subarray(0, 2)];
    let offset = 2, removed = false;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda) break;
      const length = be16(bytes, offset + 2);
      const end = offset + 2 + length;
      if (length < 2 || end > bytes.length) return bytes;
      if (marker === 0xe1 || marker === 0xed || marker === 0xfe) removed = true;
      else keep.push(bytes.subarray(offset, end));
      offset = end;
    }
    if (!removed) return bytes;
    keep.push(bytes.subarray(offset));
    const total = keep.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let at = 0;
    keep.forEach((part) => { result.set(part, at); at += part.length; });
    return result;
  }

  // T2/D9: WebP when this browser can encode it. Safari has no WebP encoder and answers with PNG instead.
  async function encoderFormat() {
    const probe = canvas(2, 2);
    try {
      const blob = await toBlob(probe, "image/webp", 0.8);
      return blob && blob.type === "image/webp" ? "webp" : "jpeg";
    } finally {
      release(probe);
    }
  }

  // Encodes one canvas, lowering the quality until the file fits (OUTPUT_SIZE when none does).
  async function encode(element, format, maxBytes) {
    const type = format === "webp" ? "image/webp" : "image/jpeg";
    for (const quality of QUALITIES) {
      const blob = await toBlob(element, type, quality);
      if (!blob || blob.type !== type) throw failure("ENCODE");
      let bytes = new Uint8Array(await blob.arrayBuffer());
      let stripped = false;
      if (format === "jpeg") {
        const clean = stripJpegMetadata(bytes);
        stripped = clean !== bytes;
        bytes = clean;
      }
      const header = readHeader(bytes);
      if (header.format !== format || header.width !== element.width || header.height !== element.height) throw failure("ENCODE");
      if (bytes.length <= maxBytes) return { bytes, quality, stripped };
    }
    throw failure("OUTPUT_SIZE");
  }

  // ---- main ----

  function looksLikeImage(file) {
    const type = typeof file.type === "string" ? file.type : "";
    return type.indexOf("image/") === 0 || (!type && IMAGE_NAME.test(String(file.name || "")));
  }

  async function prepare(file) {
    if (!file || typeof file.size !== "number" || typeof file.slice !== "function" || !looksLikeImage(file)) throw failure("FILE_TYPE");
    if (file.size > LIMITS.MAX_SOURCE_BYTES) throw failure("FILE_SIZE");
    const header = readHeader(new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()));
    const heic = header.format === "heic" || /hei[cf]/i.test(String(file.type || "")) || HEIC_NAME.test(String(file.name || ""));
    const known = header.width > 0 && header.height > 0 ? oriented(header) : null;
    if (known) checkShape(known.width, known.height);

    let decoded;
    try { decoded = await decode(file, known); } catch (_decodeError) { throw failure(heic ? "HEIC" : "DECODE"); }
    const large = { canvas: null }, small = { canvas: null };
    try {
      checkShape(decoded.width, decoded.height);
      // The real shape comes from the header when known (the picture may have been decoded straight to the large
      // size), otherwise from the decoded picture.
      const shape = known || { width: decoded.width, height: decoded.height };
      const size = targets(shape.width, shape.height);
      const format = await encoderFormat();
      // Small first: if it cannot fit, say so at once instead of encoding the large file several times.
      small.canvas = draw(decoded.source, size.small.width, size.small.height);
      const smallOut = await encode(small.canvas, format, LIMITS.MAX_SMALL_BYTES);
      release(small.canvas);
      let largeOut = null, largeSize = null;
      const widths = largeWidths(size.large.width);
      for (let index = 0; index < widths.length && !largeOut; index += 1) {
        largeSize = targets(shape.width, shape.height, widths[index]).large;
        large.canvas = draw(decoded.source, largeSize.width, largeSize.height);
        try {
          largeOut = await encode(large.canvas, format, LIMITS.MAX_LARGE_BYTES);
        } catch (error) {
          if (error.code !== "OUTPUT_SIZE" || index === widths.length - 1) throw error;
        } finally {
          release(large.canvas);
        }
      }
      return {
        format,
        large: { bytes: largeOut.bytes, width: largeSize.width, height: largeSize.height },
        small: { bytes: smallOut.bytes, width: size.small.width, height: size.small.height },
        quality: { large: largeOut.quality, small: smallOut.quality },
        stripped: largeOut.stripped || smallOut.stripped,
        source: { format: header.format, width: known ? known.width : decoded.width, height: known ? known.height : decoded.height, orientation: header.orientation, bytes: file.size }
      };
    } finally {
      decoded.close();
      release(large.canvas);
      release(small.canvas);
    }
  }

  function toBase64(bytes) {
    let text = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      text += String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + 0x8000)));
    }
    return global.btoa(text);
  }

  global.TakhunImageResize = Object.freeze({
    prepare,
    toBase64,
    LIMITS,
    MESSAGES,
    _internal: Object.freeze({ readHeader, stripJpegMetadata, targets })
  });
})(typeof window !== "undefined" ? window : globalThis);
