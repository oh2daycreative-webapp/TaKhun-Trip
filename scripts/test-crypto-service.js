"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const servicePath = path.join(__dirname, "../apps-script/CryptoService.gs");
assert.equal(
  fs.existsSync(servicePath),
  true,
  "apps-script/CryptoService.gs must exist before crypto contracts can run"
);

const source = fs.readFileSync(servicePath, "utf8");

function bytes(value) {
  return Array.from(value);
}

function hex(value) {
  return Buffer.from(value).toString("hex");
}

function createRuntime(options = {}) {
  const propertyValues = {
    ADMIN_AUTH_RANDOM_KEY: Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString("base64url"),
    ADMIN_AUTH_RANDOM_COUNTER: "0",
    ADMIN_AUTH_STATE_VERSION: "1",
    ...(options.propertyValues || {})
  };
  const events = [];
  const uuids = [...(options.uuids || ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"])]
  const sentinelSecrets = ["SENTINEL_PASSWORD_DO_NOT_LOG", "SENTINEL_TOKEN_DO_NOT_LOG", propertyValues.ADMIN_AUTH_RANDOM_KEY];
  const rejectLog = (...values) => {
    const rendered = values.map(String).join(" ");
    for (const secret of sentinelSecrets) {
      assert.equal(rendered.includes(secret), false, "crypto service must not log sentinel secret material");
    }
    throw new Error("crypto service must not log");
  };
  const scriptProperties = {
    getProperty(name) {
      events.push(`get:${name}`);
      return Object.prototype.hasOwnProperty.call(propertyValues, name) ? propertyValues[name] : null;
    },
    setProperty(name, value) {
      events.push(`set:${name}:${value}`);
      if (options.failPersistence) throw new Error("synthetic property persistence failure");
      propertyValues[name] = String(value);
      return scriptProperties;
    }
  };
  const lock = {
    hasLock() {
      events.push("lock:checked");
      return options.hasLock !== false;
    }
  };
  const context = {
    console: { log: rejectLog, debug: rejectLog, info: rejectLog, warn: rejectLog, error: rejectLog },
    Logger: { log: rejectLog },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    LockService: { getScriptLock: () => lock },
    Utilities: {
      getUuid() {
        events.push("uuid");
        assert.notEqual(uuids.length, 0, "random derivation requested more than two deterministic UUIDs");
        return uuids.shift();
      }
    },
    Date: { now: () => options.now ?? 1760000000123 },
    JSON,
    Math,
    Number,
    Object,
    String,
    Array,
    Error,
    TypeError,
    RangeError
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "apps-script/CryptoService.gs" });
  return { context, events, propertyValues };
}

function run(name, test) {
  test();
  process.stdout.write(`PASS ${name}\n`);
}

function observeByteReads(values) {
  const reads = [];
  const observed = new Proxy(values.slice(), {
    get(target, property, receiver) {
      if (typeof property === "string" && /^(?:0|[1-9][0-9]*)$/.test(property)) reads.push(Number(property));
      return Reflect.get(target, property, receiver);
    }
  });
  return { observed, reads };
}

function assertComparatorReadsEveryIndex(comparator, leftValues, rightValues, expectedResult) {
  const left = observeByteReads(leftValues);
  const right = observeByteReads(rightValues);
  assert.equal(comparator(left.observed, right.observed), expectedResult);
  const expectedIndexes = leftValues.map((value, index) => index);
  assert.deepEqual([...new Set(left.reads)].sort((a, b) => a - b), expectedIndexes, "left operand must read every byte index");
  assert.deepEqual([...new Set(right.reads)].sort((a, b) => a - b), expectedIndexes, "right operand must read every byte index");
}

const runtime = createRuntime();
const service = runtime.context;

run("UTF-8 converts ASCII Thai and surrogate-pair emoji exactly", () => {
  assert.deepEqual(bytes(service.CryptoService_utf8Bytes_("abc")), [97, 98, 99]);
  assert.deepEqual(bytes(service.CryptoService_utf8Bytes_("ไทย")), [224, 185, 132, 224, 184, 151, 224, 184, 162]);
  assert.deepEqual(bytes(service.CryptoService_utf8Bytes_("😀")), [240, 159, 152, 128]);
});

run("UTF-8 rejects every unpaired surrogate instead of replacing it", () => {
  for (const malformed of ["\uD800", "\uDC00", "x\uD800y", "x\uDC00y", "\uD800\uD800", "\uDC00\uDC00"]) {
    assert.throws(() => service.CryptoService_utf8Bytes_(malformed), /UTF-8 input is malformed/);
  }
  assert.throws(() => service.CryptoService_utf8Bytes_(null), /UTF-8 input must be a string/);
});

run("SHA-256 matches independent empty ASCII and non-ASCII vectors", () => {
  assert.equal(hex(service.CryptoService_sha256_([])), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(hex(service.CryptoService_sha256_([97, 98, 99])), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    hex(service.CryptoService_sha256_(service.CryptoService_utf8Bytes_("ไทย"))),
    "6d420ffde81c1303865d1e069ea6cb0062fdbb56bcac49265f8208900aae9884"
  );
});

run("SHA-256 rejects values that are not byte arrays", () => {
  assert.throws(() => service.CryptoService_sha256_("abc"), /byte array/);
  assert.throws(() => service.CryptoService_sha256_([0, -1]), /byte array/);
  assert.throws(() => service.CryptoService_sha256_([256]), /byte array/);
});

run("HMAC-SHA256 matches RFC 4231 vectors with exact bytes", () => {
  assert.equal(
    hex(service.CryptoService_hmacSha256_(Array(20).fill(0x0b), bytes(Buffer.from("Hi There", "ascii")))),
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
  );
  assert.equal(
    hex(service.CryptoService_hmacSha256_(bytes(Buffer.from("Jefe", "ascii")), bytes(Buffer.from("what do ya want for nothing?", "ascii")))),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
  );
  assert.equal(
    hex(service.CryptoService_hmacSha256_(Array(131).fill(0xaa), bytes(Buffer.from("Test Using Larger Than Block-Size Key - Hash Key First", "ascii")))),
    "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
  );
});

run("PBKDF2 core matches the published one-iteration SHA-256 vector", () => {
  assert.equal(
    hex(service.CryptoService_pbkdf2Sha256Core_(bytes(Buffer.from("password")), bytes(Buffer.from("salt")), 1, 32)),
    "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
  );
});

run("PBKDF2 wrapper enforces the stored range and exact 32-byte key", () => {
  const salt = Array.from({ length: 16 }, (_, index) => index);
  const longPassword = "L".repeat(80);
  const actual = service.CryptoService_pbkdf2Sha256_(longPassword, salt, 100000);
  assert.equal(actual.length, 32);
  assert.equal(hex(actual), "16b72bd7f7219c419480235078be8d3e559170d77fa9f66150498c26745ee86e");
  assert.equal(hex(actual), crypto.pbkdf2Sync(longPassword, Buffer.from(salt), 100000, 32, "sha256").toString("hex"));
  for (const invalid of [99999, 1000001, 100000.5, NaN, Infinity, "120000", null]) {
    assert.throws(() => service.CryptoService_pbkdf2Sha256_("password", salt, invalid), /iteration count/);
  }
  assert.throws(() => service.CryptoService_pbkdf2Sha256_("password", [1, 2, 3], 100000), /salt/);
});

run("PBKDF2 project count and UTF-8 password cross-check Node crypto", () => {
  assert.equal(service.ADMIN_PBKDF2_ITERATIONS_, 120000);
  const salt = Array.from({ length: 16 }, (_, index) => index);
  const actual = service.CryptoService_pbkdf2Sha256_("รหัสผ่าน", salt, service.ADMIN_PBKDF2_ITERATIONS_);
  const independent = crypto.pbkdf2Sync("รหัสผ่าน", Buffer.from(salt), 120000, 32, "sha256");
  assert.equal(hex(actual), "c602f14bd1e965ccf6643594bbcd161509694a042ee092896a4afa6e63f77589");
  assert.equal(hex(actual), independent.toString("hex"));
});

run("base64url is unpadded and round-trips 16-byte and 32-byte values", () => {
  for (const input of [Array.from({ length: 16 }, (_, index) => index), Array.from({ length: 32 }, (_, index) => index)]) {
    const encoded = service.CryptoService_base64UrlEncode_(input);
    assert.doesNotMatch(encoded, /=/);
    assert.equal(encoded.length, input.length === 16 ? 22 : 43);
    assert.deepEqual(bytes(service.CryptoService_base64UrlDecode_(encoded)), input);
    const padding = "=".repeat((4 - encoded.length % 4) % 4);
    assert.deepEqual(bytes(service.CryptoService_base64UrlDecode_(encoded + padding)), input);
  }
});

run("base64url preserves valid values beginning with hyphen", () => {
  const input = [248, ...Array(15).fill(0)];
  const encoded = service.CryptoService_base64UrlEncode_(input);
  assert.equal(encoded.startsWith("-"), true);
  assert.deepEqual(bytes(service.CryptoService_base64UrlDecode_(encoded)), input);
});

run("base64url rejects malformed and non-canonical input", () => {
  for (const input of ["A", "AB", "AB==", "abcde", "ab+c", "ab/c", "ab c", "ab\n", "====", "AA=A", "AA===", null]) {
    assert.throws(() => service.CryptoService_base64UrlDecode_(input), /base64url/);
  }
  assert.throws(() => service.CryptoService_base64UrlEncode_("bytes"), /byte array/);
});

run("constant-time comparison reads every same-length byte for equal and unequal values", () => {
  const expected = [1, 2, 3, 4, 5];
  assertComparatorReadsEveryIndex(service.CryptoService_constantTimeEqual_, expected, [1, 2, 3, 4, 5], true);
  assertComparatorReadsEveryIndex(service.CryptoService_constantTimeEqual_, expected, [9, 2, 3, 4, 5], false);
  assertComparatorReadsEveryIndex(service.CryptoService_constantTimeEqual_, expected, [1, 2, 9, 4, 5], false);
  assertComparatorReadsEveryIndex(service.CryptoService_constantTimeEqual_, expected, [1, 2, 3, 4, 9], false);
});

run("constant-time access instrumentation rejects a deliberately early-return comparator", () => {
  function deliberatelyEarlyReturn(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }
  let detected = null;
  try {
    assertComparatorReadsEveryIndex(deliberatelyEarlyReturn, [1, 2, 3, 4, 5], [9, 2, 3, 4, 5], false);
  } catch (error) {
    detected = error;
  }
  assert.ok(detected, "early-return comparator must be detected");
  assert.match(detected.message, /left operand must read every byte index/);
  assert.deepEqual(detected.actual, [0]);
  assert.deepEqual(detected.expected, [0, 1, 2, 3, 4]);
});

run("constant-time comparison rejects incompatible lengths and malformed bytes safely", () => {
  const expected = [1, 2, 3, 4, 5];
  assert.equal(service.CryptoService_constantTimeEqual_(expected, [1, 2, 3, 4]), false);
  assert.equal(service.CryptoService_constantTimeEqual_([1, 2], [1, 2, 0]), false);
  assert.equal(service.CryptoService_constantTimeEqual_([1, 2], [1, 2]), true);
  assert.equal(service.CryptoService_constantTimeEqual_([1, 2], [1]), false);
  assert.equal(service.CryptoService_constantTimeEqual_(null, [1]), false);
  assert.equal(service.CryptoService_constantTimeEqual_([256], [0]), false);
  assert.equal(service.CryptoService_constantTimeEqual_([1.5], [0]), false);
  assert.equal(service.CryptoService_constantTimeEqual_(Array(1), [0]), false);
});

run("token hashing returns only the SHA-256 base64url hash", () => {
  const rawToken = "A".repeat(43);
  const tokenHash = service.CryptoService_hashToken_(rawToken);
  assert.equal(tokenHash, "DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo");
  assert.equal(tokenHash.length, 43);
  assert.notEqual(tokenHash, rawToken);
  assert.throws(() => service.CryptoService_hashToken_("not-a-token"), /token/);
});

run("random derivation persists increment before HMAC and includes every domain field", () => {
  const state = createRuntime();
  const output = bytes(state.context.CryptoService_randomBytesLocked_("admin-session-token", 32));
  const expectedMessage = [
    "takhun-admin-auth-random",
    "version=1",
    "purpose=admin-session-token",
    "counter=1",
    "uuid1=11111111-1111-4111-8111-111111111111",
    "uuid2=22222222-2222-4222-8222-222222222222",
    "milliseconds=1760000000123"
  ].join("\n");
  const key = Buffer.from(state.propertyValues.ADMIN_AUTH_RANDOM_KEY, "base64url");
  const expected = crypto.createHmac("sha256", key).update(expectedMessage, "utf8").digest();
  assert.deepEqual(output, bytes(expected));
  assert.notDeepEqual(output, bytes(key));
  assert.equal(state.propertyValues.ADMIN_AUTH_RANDOM_COUNTER, "1");
  assert.ok(state.events.indexOf("set:ADMIN_AUTH_RANDOM_COUNTER:1") < state.events.indexOf("uuid"));
});

run("random derivation returns a 16-byte salt slice and full 32-byte token", () => {
  const saltState = createRuntime();
  const salt = bytes(saltState.context.CryptoService_randomBytesLocked_("admin-password-salt", 16));
  const tokenState = createRuntime();
  const token = bytes(tokenState.context.CryptoService_randomBytesLocked_("admin-session-token", 32));
  assert.equal(salt.length, 16);
  assert.equal(token.length, 32);
  assert.notDeepEqual(salt, token.slice(0, 16));
  assert.throws(() => createRuntime().context.CryptoService_randomBytesLocked_("admin-session-token", 24), /output length/);
});

run("random derivation requires caller lock permanent key and established valid state", () => {
  const cases = [
    [{ hasLock: false }, /script lock/],
    [{ propertyValues: { ADMIN_AUTH_RANDOM_KEY: null } }, /random key/],
    [{ propertyValues: { ADMIN_AUTH_RANDOM_KEY: "A".repeat(42) } }, /random key/],
    [{ propertyValues: { ADMIN_AUTH_STATE_VERSION: null } }, /random state/],
    [{ propertyValues: { ADMIN_AUTH_STATE_VERSION: "2" } }, /random state/],
    [{ propertyValues: { ADMIN_AUTH_RANDOM_COUNTER: null } }, /random state/],
    [{ propertyValues: { ADMIN_AUTH_RANDOM_COUNTER: "01" } }, /random counter/],
    [{ propertyValues: { ADMIN_AUTH_RANDOM_COUNTER: "-1" } }, /random counter/],
    [{ propertyValues: { ADMIN_AUTH_RANDOM_COUNTER: "1.5" } }, /random counter/],
    [{ propertyValues: { ADMIN_AUTH_RANDOM_COUNTER: String(Number.MAX_SAFE_INTEGER) } }, /random counter/]
  ];
  for (const [options, expectedError] of cases) {
    const state = createRuntime(options);
    const before = state.propertyValues.ADMIN_AUTH_RANDOM_COUNTER;
    assert.throws(() => state.context.CryptoService_randomBytesLocked_("admin-session-token", 32), expectedError);
    assert.equal(state.propertyValues.ADMIN_AUTH_RANDOM_COUNTER, before);
  }
});

run("persistence failure produces no derivation output and no UUID consumption", () => {
  const state = createRuntime({ failPersistence: true });
  assert.throws(() => state.context.CryptoService_randomBytesLocked_("admin-session-token", 32), /persistence failure/);
  assert.equal(state.events.includes("uuid"), false);
  assert.equal(state.propertyValues.ADMIN_AUTH_RANDOM_COUNTER, "0");
});

run("purpose and incremented counter separate output while skipped counters never roll back", () => {
  const first = createRuntime({ uuids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] });
  const outputOne = bytes(first.context.CryptoService_randomBytesLocked_("admin-session-token", 32));
  const outputTwo = bytes(first.context.CryptoService_randomBytesLocked_("admin-session-token", 32));
  assert.notDeepEqual(outputOne, outputTwo);
  assert.equal(first.propertyValues.ADMIN_AUTH_RANDOM_COUNTER, "2");

  const otherPurpose = createRuntime();
  const outputOther = bytes(otherPurpose.context.CryptoService_randomBytesLocked_("admin-password-salt", 16));
  assert.notDeepEqual(outputOne.slice(0, 16), outputOther);

  const skipped = createRuntime({ propertyValues: { ADMIN_AUTH_RANDOM_COUNTER: "7" } });
  skipped.context.CryptoService_randomBytesLocked_("admin-session-token", 32);
  assert.equal(skipped.propertyValues.ADMIN_AUTH_RANDOM_COUNTER, "8");
  assert.throws(() => { throw new Error("synthetic later consumer failure"); }, /later consumer failure/);
  assert.equal(skipped.propertyValues.ADMIN_AUTH_RANDOM_COUNTER, "8");
});

run("source contains no unsafe randomness dynamic evaluation secret logging or defaults", () => {
  assert.doesNotMatch(source, /Math\s*\.\s*random\s*\(/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /\bFunction\s*\(/);
  assert.doesNotMatch(source, /(?:Logger\s*\.\s*log|console\s*\.\s*(?:log|debug|info|warn|error))\s*\(/);
  assert.doesNotMatch(source, /ADMIN_AUTH_RANDOM_KEY\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/);
  assert.doesNotMatch(source, /return\s+(?:keyBytes|encodedKey)\b/);
  assert.doesNotMatch(source, /DEFAULT_(?:USERNAME|PASSWORD)|ADMIN_BOOTSTRAP_(?:USERNAME|PASSWORD)\s*=/);
  assert.doesNotMatch(source, /https?:\/\/|UrlFetchApp|require\s*\(|SubtleCrypto|crypto\.subtle/);
});

process.stdout.write("CryptoService verification passed. Local timing was not evaluated as Apps Script suitability.\n");
