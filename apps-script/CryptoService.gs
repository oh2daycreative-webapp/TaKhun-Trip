var ADMIN_PBKDF2_ITERATIONS_ = 120000;

var CRYPTO_SERVICE_SHA256_CONSTANTS_ = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function CryptoService_utf8Bytes_(value) {
  if (typeof value !== "string") throw new TypeError("UTF-8 input must be a string.");
  var output = [];
  for (var index = 0; index < value.length; index += 1) {
    var codePoint = value.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      if (index + 1 >= value.length) throw new Error("UTF-8 input is malformed.");
      var low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) throw new Error("UTF-8 input is malformed.");
      codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
      index += 1;
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      throw new Error("UTF-8 input is malformed.");
    }

    if (codePoint <= 0x7f) {
      output.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      output.push(0xc0 | (codePoint >>> 6));
      output.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      output.push(0xe0 | (codePoint >>> 12));
      output.push(0x80 | ((codePoint >>> 6) & 0x3f));
      output.push(0x80 | (codePoint & 0x3f));
    } else {
      output.push(0xf0 | (codePoint >>> 18));
      output.push(0x80 | ((codePoint >>> 12) & 0x3f));
      output.push(0x80 | ((codePoint >>> 6) & 0x3f));
      output.push(0x80 | (codePoint & 0x3f));
    }
  }
  return output;
}

function CryptoService_copyBytes_(value) {
  if (!Array.isArray(value)) throw new TypeError("Expected a byte array.");
  var output = new Array(value.length);
  for (var index = 0; index < value.length; index += 1) {
    if (!Number.isInteger(value[index]) || value[index] < 0 || value[index] > 255) {
      throw new TypeError("Expected a byte array.");
    }
    output[index] = value[index];
  }
  return output;
}

function CryptoService_rotateRight_(value, count) {
  return (value >>> count) | (value << (32 - count));
}

function CryptoService_sha256InitialState_() {
  return [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
}

function CryptoService_sha256Compress_(hash, message, offset, words) {
  for (var wordIndex = 0; wordIndex < 16; wordIndex += 1) {
    var position = offset + wordIndex * 4;
    words[wordIndex] = (
      (message[position] << 24) |
      (message[position + 1] << 16) |
      (message[position + 2] << 8) |
      message[position + 3]
    ) >>> 0;
  }
  for (var scheduleIndex = 16; scheduleIndex < 64; scheduleIndex += 1) {
    var previous15 = words[scheduleIndex - 15];
    var previous2 = words[scheduleIndex - 2];
    var sigma0 = CryptoService_rotateRight_(previous15, 7) ^ CryptoService_rotateRight_(previous15, 18) ^ (previous15 >>> 3);
    var sigma1 = CryptoService_rotateRight_(previous2, 17) ^ CryptoService_rotateRight_(previous2, 19) ^ (previous2 >>> 10);
    words[scheduleIndex] = (words[scheduleIndex - 16] + sigma0 + words[scheduleIndex - 7] + sigma1) >>> 0;
  }

  var a = hash[0];
  var b = hash[1];
  var c = hash[2];
  var d = hash[3];
  var e = hash[4];
  var f = hash[5];
  var g = hash[6];
  var h = hash[7];

  for (var round = 0; round < 64; round += 1) {
    var upperSigma1 = CryptoService_rotateRight_(e, 6) ^ CryptoService_rotateRight_(e, 11) ^ CryptoService_rotateRight_(e, 25);
    var choice = (e & f) ^ (~e & g);
    var temporary1 = (h + upperSigma1 + choice + CRYPTO_SERVICE_SHA256_CONSTANTS_[round] + words[round]) >>> 0;
    var upperSigma0 = CryptoService_rotateRight_(a, 2) ^ CryptoService_rotateRight_(a, 13) ^ CryptoService_rotateRight_(a, 22);
    var majority = (a & b) ^ (a & c) ^ (b & c);
    var temporary2 = (upperSigma0 + majority) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + temporary1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temporary1 + temporary2) >>> 0;
  }

  hash[0] = (hash[0] + a) >>> 0;
  hash[1] = (hash[1] + b) >>> 0;
  hash[2] = (hash[2] + c) >>> 0;
  hash[3] = (hash[3] + d) >>> 0;
  hash[4] = (hash[4] + e) >>> 0;
  hash[5] = (hash[5] + f) >>> 0;
  hash[6] = (hash[6] + g) >>> 0;
  hash[7] = (hash[7] + h) >>> 0;
}

function CryptoService_sha256StateBytes_(hash, output) {
  var bytes = output || new Array(32);
  for (var hashIndex = 0; hashIndex < hash.length; hashIndex += 1) {
    var offset = hashIndex * 4;
    bytes[offset] = (hash[hashIndex] >>> 24) & 255;
    bytes[offset + 1] = (hash[hashIndex] >>> 16) & 255;
    bytes[offset + 2] = (hash[hashIndex] >>> 8) & 255;
    bytes[offset + 3] = hash[hashIndex] & 255;
  }
  return bytes;
}

function CryptoService_sha256_(inputBytes) {
  return CryptoService_sha256Prepared_(CryptoService_copyBytes_(inputBytes));
}

function CryptoService_sha256Prepared_(message) {
  var byteLength = message.length;
  var bitLengthLow = (byteLength << 3) >>> 0;
  var bitLengthHigh = Math.floor(byteLength / 0x20000000) >>> 0;
  message.push(0x80);
  while (message.length % 64 !== 56) message.push(0);
  message.push(
    (bitLengthHigh >>> 24) & 255,
    (bitLengthHigh >>> 16) & 255,
    (bitLengthHigh >>> 8) & 255,
    bitLengthHigh & 255,
    (bitLengthLow >>> 24) & 255,
    (bitLengthLow >>> 16) & 255,
    (bitLengthLow >>> 8) & 255,
    bitLengthLow & 255
  );

  var hash = CryptoService_sha256InitialState_();
  var words = new Array(64);
  for (var offset = 0; offset < message.length; offset += 64) {
    CryptoService_sha256Compress_(hash, message, offset, words);
  }
  return CryptoService_sha256StateBytes_(hash);
}

function CryptoService_hmacSha256_(keyBytes, messageBytes) {
  var key = CryptoService_copyBytes_(keyBytes);
  var message = CryptoService_copyBytes_(messageBytes);
  var pads = CryptoService_hmacSha256Pads_(key);
  return CryptoService_hmacSha256Prepared_(pads, message);
}

function CryptoService_hmacSha256Pads_(key) {
  if (key.length > 64) key = CryptoService_sha256Prepared_(key);
  while (key.length < 64) key.push(0);
  var innerPad = new Array(64);
  var outerPad = new Array(64);
  for (var index = 0; index < 64; index += 1) {
    innerPad[index] = key[index] ^ 0x36;
    outerPad[index] = key[index] ^ 0x5c;
  }
  var words = new Array(64);
  var innerState = CryptoService_sha256InitialState_();
  var outerState = CryptoService_sha256InitialState_();
  CryptoService_sha256Compress_(innerState, innerPad, 0, words);
  CryptoService_sha256Compress_(outerState, outerPad, 0, words);
  return { inner: innerPad, outer: outerPad, innerState: innerState, outerState: outerState };
}

function CryptoService_hmacWorkspace_() {
  return {
    block: new Array(64),
    words: new Array(64),
    innerState: new Array(8),
    outerState: new Array(8),
    innerHash: new Array(32)
  };
}

function CryptoService_sha256ContinueShort_(baseState, message, prefixLength, workspaceState, block, words) {
  for (var stateIndex = 0; stateIndex < 8; stateIndex += 1) workspaceState[stateIndex] = baseState[stateIndex];
  for (var blockIndex = 0; blockIndex < 64; blockIndex += 1) block[blockIndex] = 0;
  for (var messageIndex = 0; messageIndex < message.length; messageIndex += 1) block[messageIndex] = message[messageIndex];
  block[message.length] = 0x80;
  var bitLength = (prefixLength + message.length) * 8;
  block[60] = (bitLength >>> 24) & 255;
  block[61] = (bitLength >>> 16) & 255;
  block[62] = (bitLength >>> 8) & 255;
  block[63] = bitLength & 255;
  CryptoService_sha256Compress_(workspaceState, block, 0, words);
}

function CryptoService_hmacSha256Prepared_(pads, message, reusableWorkspace) {
  if (message.length > 55) {
    var innerHash = CryptoService_sha256Prepared_(pads.inner.concat(message));
    return CryptoService_sha256Prepared_(pads.outer.concat(innerHash));
  }
  var workspace = reusableWorkspace || CryptoService_hmacWorkspace_();
  CryptoService_sha256ContinueShort_(pads.innerState, message, 64, workspace.innerState, workspace.block, workspace.words);
  CryptoService_sha256StateBytes_(workspace.innerState, workspace.innerHash);
  CryptoService_sha256ContinueShort_(pads.outerState, workspace.innerHash, 64, workspace.outerState, workspace.block, workspace.words);
  return CryptoService_sha256StateBytes_(workspace.outerState);
}

function CryptoService_pbkdf2Sha256Core_(passwordBytes, saltBytes, iterations, outputLength) {
  var password = CryptoService_copyBytes_(passwordBytes);
  var salt = CryptoService_copyBytes_(saltBytes);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1000000) {
    throw new RangeError("PBKDF2 iteration count is invalid.");
  }
  if (outputLength !== 32) throw new RangeError("PBKDF2 output length is invalid.");
  var pads = CryptoService_hmacSha256Pads_(password);
  var workspace = CryptoService_hmacWorkspace_();
  var blockInput = salt.concat([0, 0, 0, 1]);
  var previous = CryptoService_hmacSha256Prepared_(pads, blockInput, workspace);
  var output = previous.slice();
  for (var iteration = 1; iteration < iterations; iteration += 1) {
    previous = CryptoService_hmacSha256Prepared_(pads, previous, workspace);
    for (var index = 0; index < output.length; index += 1) output[index] ^= previous[index];
  }
  return output;
}

function CryptoService_pbkdf2Sha256_(password, saltBytes, iterations) {
  if (typeof password !== "string") throw new TypeError("PBKDF2 password must be a string.");
  var salt = CryptoService_copyBytes_(saltBytes);
  if (salt.length !== 16) throw new RangeError("PBKDF2 salt must be exactly 16 bytes.");
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
    throw new RangeError("PBKDF2 iteration count must be from 100000 through 1000000.");
  }
  return CryptoService_pbkdf2Sha256Core_(CryptoService_utf8Bytes_(password), salt, iterations, 32);
}

function CryptoService_base64UrlEncode_(inputBytes) {
  var input = CryptoService_copyBytes_(inputBytes);
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var output = "";
  for (var index = 0; index < input.length; index += 3) {
    var first = input[index];
    var hasSecond = index + 1 < input.length;
    var hasThird = index + 2 < input.length;
    var second = hasSecond ? input[index + 1] : 0;
    var third = hasThird ? input[index + 2] : 0;
    output += alphabet.charAt(first >>> 2);
    output += alphabet.charAt(((first & 3) << 4) | (second >>> 4));
    if (hasSecond) output += alphabet.charAt(((second & 15) << 2) | (third >>> 6));
    if (hasThird) output += alphabet.charAt(third & 63);
  }
  return output;
}

function CryptoService_base64UrlDecode_(value) {
  if (typeof value !== "string") throw new TypeError("Invalid base64url value.");
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) throw new Error("Invalid base64url value.");
  var paddingIndex = value.indexOf("=");
  var unpadded = paddingIndex === -1 ? value : value.slice(0, paddingIndex);
  var paddingLength = value.length - unpadded.length;
  if (unpadded.length % 4 === 1) throw new Error("Invalid base64url value.");
  var requiredPadding = (4 - (unpadded.length % 4)) % 4;
  if (paddingLength !== 0 && (value.length % 4 !== 0 || paddingLength !== requiredPadding)) {
    throw new Error("Invalid base64url padding.");
  }
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var output = [];
  var accumulator = 0;
  var bits = 0;
  for (var index = 0; index < unpadded.length; index += 1) {
    var valueIndex = alphabet.indexOf(unpadded.charAt(index));
    if (valueIndex < 0) throw new Error("Invalid base64url value.");
    accumulator = (accumulator << 6) | valueIndex;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 255);
    }
  }
  if (CryptoService_base64UrlEncode_(output) !== unpadded) throw new Error("Invalid base64url value.");
  return output;
}

function CryptoService_constantTimeEqual_(leftBytes, rightBytes) {
  if (!Array.isArray(leftBytes) || !Array.isArray(rightBytes)) return false;
  var maximumLength = Math.max(leftBytes.length, rightBytes.length);
  var difference = leftBytes.length ^ rightBytes.length;
  for (var index = 0; index < maximumLength; index += 1) {
    var leftPresent = index < leftBytes.length;
    var rightPresent = index < rightBytes.length;
    var leftValid = leftPresent && Number.isInteger(leftBytes[index]) && leftBytes[index] >= 0 && leftBytes[index] <= 255;
    var rightValid = rightPresent && Number.isInteger(rightBytes[index]) && rightBytes[index] >= 0 && rightBytes[index] <= 255;
    if ((leftPresent && !leftValid) || (rightPresent && !rightValid)) difference |= 1;
    var left = leftValid ? leftBytes[index] : 0;
    var right = rightValid ? rightBytes[index] : 0;
    difference |= left ^ right;
  }
  return difference === 0;
}

function CryptoService_hashToken_(rawToken) {
  if (typeof rawToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
    throw new Error("Raw session token is invalid.");
  }
  var tokenBytes = CryptoService_base64UrlDecode_(rawToken);
  if (tokenBytes.length !== 32) throw new Error("Raw session token is invalid.");
  return CryptoService_base64UrlEncode_(CryptoService_sha256_(CryptoService_utf8Bytes_(rawToken)));
}

function CryptoService_randomBytesLocked_(purpose, outputLength) {
  var lock = LockService.getScriptLock();
  if (!lock || typeof lock.hasLock !== "function" || !lock.hasLock()) {
    throw new Error("CryptoService requires the caller-held script lock.");
  }
  if (typeof purpose !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(purpose)) {
    throw new Error("CryptoService random purpose is invalid.");
  }
  if (outputLength !== 16 && outputLength !== 32) {
    throw new Error("CryptoService random output length is invalid.");
  }

  var properties = PropertiesService.getScriptProperties();
  var encodedKey = properties.getProperty("ADMIN_AUTH_RANDOM_KEY");
  var keyBytes;
  try {
    keyBytes = CryptoService_base64UrlDecode_(encodedKey);
  } catch (error) {
    throw new Error("CryptoService random key is invalid.");
  }
  if (typeof encodedKey !== "string" || encodedKey.length !== 43 || keyBytes.length !== 32) {
    throw new Error("CryptoService random key is invalid.");
  }

  var version = properties.getProperty("ADMIN_AUTH_STATE_VERSION");
  var counterText = properties.getProperty("ADMIN_AUTH_RANDOM_COUNTER");
  if (version !== "1" || counterText === null || counterText === undefined) {
    throw new Error("CryptoService random state is not established.");
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(counterText)) {
    throw new Error("CryptoService random counter is invalid.");
  }
  var counter = Number(counterText);
  if (!Number.isSafeInteger(counter) || counter < 0 || counter >= Number.MAX_SAFE_INTEGER) {
    throw new Error("CryptoService random counter is invalid.");
  }
  var incrementedCounter = counter + 1;
  properties.setProperty("ADMIN_AUTH_RANDOM_COUNTER", String(incrementedCounter));

  var uuid1 = Utilities.getUuid();
  var uuid2 = Utilities.getUuid();
  var milliseconds = Date.now();
  var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(uuid1) || !uuidPattern.test(uuid2) || !Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new Error("CryptoService random runtime input is invalid.");
  }
  var message = [
    "takhun-admin-auth-random",
    "version=1",
    "purpose=" + purpose,
    "counter=" + incrementedCounter,
    "uuid1=" + uuid1,
    "uuid2=" + uuid2,
    "milliseconds=" + milliseconds
  ].join("\n");
  var derived = CryptoService_hmacSha256_(keyBytes, CryptoService_utf8Bytes_(message));
  return outputLength === 16 ? derived.slice(0, 16) : derived;
}
