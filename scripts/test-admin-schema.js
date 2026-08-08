"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const configSource = read("apps-script/Config.gs");
const cryptoSource = read("apps-script/CryptoService.gs");
const routerSource = read("apps-script/Router.gs");
const appsScriptSources = fs.readdirSync(path.join(root, "apps-script"))
  .filter((name) => name.endsWith(".gs"))
  .map((name) => read(`apps-script/${name}`));
const schema = read("docs/DATA_SCHEMA.md");
const api = read("docs/API_SPEC.md");
const plain = (value) => JSON.parse(JSON.stringify(value));

const ADMIN_HEADERS = [
  "admin_id", "username", "display_name", "email", "password_algorithm",
  "password_hash", "password_salt", "password_iterations", "role", "status",
  "last_login_at", "created_at", "updated_at"
];
const SESSION_HEADERS = [
  "session_id", "admin_id", "token_hash", "created_at", "expires_at",
  "revoked_at", "last_seen_at"
];

function loadConfig() {
  const context = {
    Array, JSON, Math, Number, Object, RegExp, String,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
  };
  vm.createContext(context);
  vm.runInContext(configSource, context, { filename: "apps-script/Config.gs" });
  return context;
}

function section(markdown, heading) {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const restStart = start + heading.length;
  const nextHeading = new RegExp(`\\n#{1,${level}}\\s`, "g");
  nextHeading.lastIndex = restStart;
  const match = nextHeading.exec(markdown);
  return markdown.slice(start, match ? match.index : markdown.length);
}

function textBlockAfter(markdown, label) {
  const start = markdown.indexOf(label);
  assert.notEqual(start, -1, `missing label ${label}`);
  const match = /```text\s*\r?\n([\s\S]*?)\r?\n```/.exec(markdown.slice(start));
  assert.ok(match, `missing text block after ${label}`);
  return match[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function jsonBlocks(markdown) {
  return [...markdown.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/g)].map((match) => JSON.parse(match[1]));
}

function tableFieldNames(markdown) {
  return [...markdown.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((match) => match[1]);
}

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test("Config exposes exact secret-free Admin auth constants", () => {
  const context = loadConfig();
  assert.equal(context.ADMIN_SHEET_NAME_, "admins");
  assert.equal(context.ADMIN_SESSION_SHEET_NAME_, "admin_sessions");
  assert.deepEqual(plain(context.ADMIN_REQUIRED_HEADERS_), ADMIN_HEADERS);
  assert.deepEqual(plain(context.ADMIN_SESSION_REQUIRED_HEADERS_), SESSION_HEADERS);
  assert.deepEqual(plain(context.ADMIN_ALLOWED_ROLES_), ["super_admin", "editor", "reviewer", "viewer"]);
  assert.deepEqual(plain(context.ADMIN_ALLOWED_STATUSES_), ["active", "inactive", "deleted"]);
  assert.equal(context.ADMIN_PASSWORD_ALGORITHM_, "pbkdf2_sha256");
  assert.equal(context.ADMIN_STORED_ITERATIONS_MIN_, 100000);
  assert.equal(context.ADMIN_STORED_ITERATIONS_MAX_, 1000000);
  assert.equal(context.ADMIN_PASSWORD_SALT_BYTES_, 16);
  assert.equal(context.ADMIN_PASSWORD_HASH_BYTES_, 32);
  assert.equal(context.ADMIN_SESSION_TOKEN_BYTES_, 32);
  assert.equal(context.ADMIN_SESSION_LIFETIME_MS_, 28800000);
  assert.equal(context.ADMIN_USERNAME_PATTERN_, "^[a-z0-9][a-z0-9._-]{2,63}$");
  assert.equal(context.ADMIN_USERNAME_MIN_CHARACTERS_, 3);
  assert.equal(context.ADMIN_USERNAME_MAX_CHARACTERS_, 64);
  assert.equal(context.ADMIN_DISPLAY_NAME_MIN_CODE_POINTS_, 1);
  assert.equal(context.ADMIN_DISPLAY_NAME_MAX_CODE_POINTS_, 100);
  assert.equal(context.ADMIN_EMAIL_MAX_CHARACTERS_, 254);
  assert.equal(context.ADMIN_PASSWORD_PROVISIONING_MIN_CODE_POINTS_, 14);
  assert.equal(context.ADMIN_PASSWORD_MAX_CODE_POINTS_, 128);
  assert.equal(context.ADMIN_PASSWORD_MAX_UTF8_BYTES_, 256);
});

test("Config declares exact property ownership names without values or duplicate PBKDF2 globals", () => {
  const context = loadConfig();
  assert.deepEqual(plain({
    key: context.ADMIN_AUTH_RANDOM_KEY_PROPERTY_,
    counter: context.ADMIN_AUTH_RANDOM_COUNTER_PROPERTY_,
    stateVersion: context.ADMIN_AUTH_STATE_VERSION_PROPERTY_
  }), {
    key: "ADMIN_AUTH_RANDOM_KEY",
    counter: "ADMIN_AUTH_RANDOM_COUNTER",
    stateVersion: "ADMIN_AUTH_STATE_VERSION"
  });
  assert.deepEqual(plain([
    context.ADMIN_BOOTSTRAP_ENABLED_PROPERTY_,
    context.ADMIN_BOOTSTRAP_USERNAME_PROPERTY_,
    context.ADMIN_BOOTSTRAP_DISPLAY_NAME_PROPERTY_,
    context.ADMIN_BOOTSTRAP_EMAIL_PROPERTY_,
    context.ADMIN_BOOTSTRAP_PASSWORD_PROPERTY_
  ]), [
    "ADMIN_BOOTSTRAP_ENABLED", "ADMIN_BOOTSTRAP_USERNAME",
    "ADMIN_BOOTSTRAP_DISPLAY_NAME", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"
  ]);
  assert.equal(context.ADMIN_AUTH_STATE_VERSION_VALUE_, 1);
  const definitionCount = (sources) => sources.reduce((total, source) => (
    total + (source.match(/^var ADMIN_PBKDF2_ITERATIONS_\s*=/gm) || []).length
  ), 0);
  assert.equal(definitionCount(appsScriptSources), 1);
  assert.equal(definitionCount(appsScriptSources.concat("var ADMIN_PBKDF2_ITERATIONS_ = 1;")), 2);
  assert.match(cryptoSource, /^var ADMIN_PBKDF2_ITERATIONS_\s*=\s*120000\s*;/m);
  assert.doesNotMatch(configSource, /ADMIN_AUTH_RANDOM_KEY\s*=|default.{0,20}(?:username|password)|(?:username|password).{0,20}default/i);
});

test("admins schema defines the exact unique order-independent header set", () => {
  const admins = section(schema, "## 14. Sheet: `admins`");
  assert.deepEqual(textBlockAfter(admins, "Required headers"), ADMIN_HEADERS);
  assert.deepEqual(tableFieldNames(section(admins, "### 14.2 Fields")), ADMIN_HEADERS);
  assert.match(admins, /present exactly once/i);
  assert.match(admins, /order-independent/i);
  assert.match(admins, /preferred order/i);
  assert.match(admins, /never reorder/i);
  assert.match(admins, /non-destructive/i);
});

test("admins credential and password contracts are exact", () => {
  const admins = section(schema, "## 14. Sheet: `admins`");
  for (const literal of [
    "pbkdf2_sha256", "120000", "100000", "1000000", "16 bytes", "22-character",
    "32 bytes", "43-character", "14-128 Unicode code points", "256 UTF-8 bytes",
    "^[a-z0-9][a-z0-9._-]{2,63}$", "super_admin", "editor", "reviewer", "viewer",
    "active", "inactive", "deleted", "RFC 3339 UTC"
  ]) assert.ok(admins.includes(literal), `admins schema must include ${literal}`);
  assert.match(admins, /trim and lowercase/i);
  assert.match(admins, /unique after trim and lowercase/i);
  assert.match(admins, /display_name[^\n]+1-100 Unicode code points/i);
  assert.match(admins, /email[^\n]+optional[^\n]+at most 254 characters/i);
  assert.match(admins, /username-only login/i);
  assert.match(admins, /email[^\n]+not[^\n]+login identifier/i);
  assert.match(admins, /no Unicode normalization/i);
  assert.match(admins, /no case folding/i);
  assert.match(admins, /raw password[^\n]+never[^\n]+stored/i);
  assert.match(admins, /human[^\n]+formula-safe/i);
  assert.match(admins, /security[^\n]+unchanged/i);
  const projection = jsonBlocks(admins).find((value) => value.admin_id && value.username);
  assert.deepEqual(Object.keys(projection), ["admin_id", "username", "display_name", "role"]);
});

test("admin_sessions schema is authoritative and stores only token hashes", () => {
  const sessions = section(schema, "## 14A. Sheet: `admin_sessions`");
  assert.deepEqual(textBlockAfter(sessions, "Required headers"), SESSION_HEADERS);
  assert.deepEqual(tableFieldNames(sessions), SESSION_HEADERS);
  assert.match(sessions, /present exactly once/i);
  assert.match(sessions, /order-independent/i);
  assert.match(sessions, /authoritative/i);
  assert.match(sessions, /every protected request/i);
  assert.match(sessions, /raw token[^\n]+never[^\n]+(?:Sheet|stored)/i);
  assert.match(sessions, /SHA-256/i);
  assert.match(sessions, /32 bytes/i);
  assert.match(sessions, /43-character/i);
  assert.match(sessions, /28,800,000/i);
  assert.match(sessions, /absolute 8-hour/i);
  assert.match(sessions, /no sliding renewal/i);
  assert.match(sessions, /last_seen_at[^\n]+does not extend/i);
  assert.match(sessions, /RFC 3339 UTC/i);
  assert.equal(SESSION_HEADERS.includes("raw_token"), false);
});

test("Script Property ownership and bootstrap boundaries are explicit", () => {
  const properties = section(schema, "## 14B. Admin authentication property ownership");
  for (const name of [
    "ADMIN_AUTH_RANDOM_KEY", "ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION",
    "ADMIN_BOOTSTRAP_ENABLED", "ADMIN_BOOTSTRAP_USERNAME", "ADMIN_BOOTSTRAP_DISPLAY_NAME",
    "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"
  ]) assert.ok(properties.includes(name), `property section must include ${name}`);
  assert.match(properties, /operator supplies only `ADMIN_AUTH_RANDOM_KEY`/i);
  assert.match(properties, /code owns `ADMIN_AUTH_RANDOM_COUNTER` and `ADMIN_AUTH_STATE_VERSION`/i);
  assert.match(properties, /`ADMIN_AUTH_STATE_VERSION`[^\n]+exact value `1`/i);
  assert.match(properties, /temporary bootstrap/i);
  assert.match(properties, /no default credentials/i);
  assert.match(properties, /no production random key/i);
  assert.match(properties, /not human-managed/i);
});

test("browser auth storage is sessionStorage-only with an exact projection", () => {
  const storage = section(schema, "### 22.5 `TAKHUN_ADMIN_SESSION`");
  assert.match(storage, /sessionStorage only/i);
  assert.match(storage, /no localStorage/i);
  assert.match(storage, /no cookie/i);
  assert.match(storage, /never[^\n]+URL|no URL/i);
  const stored = jsonBlocks(storage)[0];
  assert.deepEqual(Object.keys(stored), ["admin_id", "display_name", "role", "token", "expires_at"]);
  assert.match(stored.expires_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("adminLogin documents exact POST request, safe projection, and one-time raw token response", () => {
  const login = section(api, "## 7.1 `adminLogin`");
  const blocks = jsonBlocks(login);
  assert.deepEqual(Object.keys(blocks[0]), ["action", "payload"]);
  assert.equal(blocks[0].action, "adminLogin");
  assert.deepEqual(Object.keys(blocks[0].payload), ["username", "password"]);
  assert.deepEqual(Object.keys(blocks[1].data), ["admin", "token", "expires_at"]);
  assert.deepEqual(Object.keys(blocks[1].data.admin), ["admin_id", "username", "display_name", "role"]);
  for (const forbidden of ["email", "status", "password_algorithm", "password_hash", "password_salt", "password_iterations"]) {
    assert.equal(Object.hasOwn(blocks[1].data.admin, forbidden), false);
  }
  assert.match(login, /POST only/i);
  assert.match(login, /username-only/i);
  assert.match(login, /raw token[^\n]+successful response/i);
  assert.deepEqual(blocks[2], {
    ok: false,
    error: { code: "UNAUTHORIZED", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }
  });
});

test("session validation and logout document immutable and idempotent contracts", () => {
  const validate = section(api, "## 7.2A `adminValidateSession`");
  const validateBlocks = jsonBlocks(validate);
  assert.deepEqual(validateBlocks[0], { action: "adminValidateSession", token: "<43-character-base64url-token>" });
  assert.deepEqual(Object.keys(validateBlocks[1].data), ["admin", "expires_at"]);
  assert.deepEqual(Object.keys(validateBlocks[1].data.admin), ["admin_id", "username", "display_name", "role"]);
  assert.match(validate, /original `expires_at`/i);
  assert.match(validate, /no renewed expiry/i);
  assert.match(validate, /authoritative `admin_sessions`/i);

  const logout = section(api, "## 7.2 `adminLogout`");
  const logoutBlocks = jsonBlocks(logout);
  assert.deepEqual(logoutBlocks[0], { action: "adminLogout", token: "<43-character-base64url-token>" });
  assert.equal(logoutBlocks[1].ok, true);
  assert.deepEqual(logoutBlocks[1].data, {});
  assert.match(logout, /POST only/i);
  assert.match(logout, /idempotent/i);
  assert.match(logout, /repeated/i);
});

test("admin session retention preserves audit rows without an automatic Milestone 6 purge", () => {
  const sessions = section(schema, "## 14A. Sheet: `admin_sessions`");
  const lifecycle = section(sessions, "### 14A.2 Lifecycle and retention contract");
  const logout = section(api, "## 7.2 `adminLogout`");

  assert.match(lifecycle, /^`admin_sessions` is append-and-revoke for Milestone 6\./mi);
  assert.match(lifecycle, /Logout updates only `revoked_at` as revocation metadata; the session row is not deleted on logout\./i);
  assert.match(lifecycle, /`token_hash` remains stored after revocation for lookup and audit/i);
  assert.match(lifecycle, /`session_id`, `admin_id`, `created_at`, `expires_at`, and `last_seen_at` are not removed merely because logout occurs\./i);
  assert.match(lifecycle, /Expired session rows remain stored and revoked session rows remain stored for audit\./i);
  assert.match(lifecycle, /Validation rejects revoked and expired rows but does not remove them\./i);
  assert.match(lifecycle, /Automatic cleanup or retention deletion of session rows is outside Milestone 6/i);
  assert.match(lifecycle, /any later purge or retention policy requires separate reviewed design and implementation\./i);

  assert.match(logout, /hash(?:es)? the submitted raw token/i);
  assert.match(logout, /matching session row remains in `admin_sessions`/i);
  assert.match(logout, /logout sets `revoked_at`, does not delete the row/i);
  assert.match(logout, /does not clear `token_hash`/i);
  assert.match(logout, /already revoked, expired, or absent well-formed token remains safe and idempotent\./i);
  assert.match(logout, /Expired and revoked row retention is audit behavior, not authorization behavior\./i);
  assert.match(logout, /Authorization rejects revoked and expired rows\./i);
});

test("Admin errors are generic and token transport is POST-body-only", () => {
  const admin = section(api, "## 7. Admin API");
  for (const code of ["VALIDATION_ERROR", "UNAUTHORIZED", "RATE_LIMITED", "SERVER_ERROR", "FORBIDDEN"]) {
    assert.ok(admin.includes(code), `Admin API must document ${code}`);
  }
  for (const mismatch of [
    "unknown username", "wrong password", "inactive Admin", "deleted Admin",
    "malformed stored credential state", "duplicate matching username"
  ]) assert.ok(admin.includes(mismatch), `generic auth list must include ${mismatch}`);
  assert.match(admin, /same generic `UNAUTHORIZED`/i);
  assert.match(admin, /no account-existence detail/i);
  assert.match(admin, /POST body only/i);
  assert.match(admin, /never accepted[^\n]+GET|GET[^\n]+never accepts/i);
  assert.match(admin, /no Authorization/i);
  assert.match(admin, /no[^\n]+query/i);
});

test("global API security rules preserve tokenless login and fixed PBKDF2", () => {
  const security = section(api, "## 16. Security Rules");
  assert.match(security, /`adminLogin` is the only Admin auth action without a token/i);
  assert.match(security, /every protected Admin action[^\n]+token/i);
  assert.match(security, /PBKDF2-HMAC-SHA256/);
  assert.match(security, /`ADMIN_PBKDF2_ITERATIONS_ = 120000`/);
  assert.match(security, /no Unicode normalization/i);
});

test("all global API guidance exempts adminLogin from protected-token rules", () => {
  for (const heading of ["## 2. API Design Principles", "## 19. API Acceptance Criteria", "## 20. Codex Instructions for API"]) {
    const guidance = section(api, heading);
    assert.match(guidance, /protected Admin[^\n]+token[^\n]+except `adminLogin`/i, `${heading} must preserve tokenless login`);
  }
});

test("bootstrap and benchmark remain editor-only non-routed gates", () => {
  const auth = section(api, "## 11. Authentication and Session");
  assert.match(auth, /bootstrapFirstAdmin\(\)[^\n]+editor-only/i);
  assert.match(auth, /no Router or public action/i);
  assert.match(auth, /no public registration/i);
  assert.match(auth, /setup[^\n]+benchmark[^\n]+bootstrap/i);
  assert.match(auth, /no credential[^\n]+benchmark[^\n]+passes/i);
  assert.match(auth, /first account[^\n]+super_admin/i);
  assert.match(auth, /operator never calculates[^\n]+(?:PBKDF2|hash)/i);
  assert.match(auth, /`ADMIN_BOOTSTRAP_ENABLED=true`/);
  assert.match(auth, /active Admin[^\n]+fail closed/i);
  assert.match(auth, /canonical username[^\n]+any status[^\n]+fail closed/i);
  assert.match(auth, /already initialized and validated auth random state/i);
  assert.match(auth, /delete[^\n]+`ADMIN_BOOTSTRAP_USERNAME`[^\n]+`ADMIN_BOOTSTRAP_DISPLAY_NAME`[^\n]+`ADMIN_BOOTSTRAP_EMAIL`[^\n]+`ADMIN_BOOTSTRAP_PASSWORD`/i);
  assert.match(auth, /then set `ADMIN_BOOTSTRAP_ENABLED=false`/i);
  assert.match(auth, /benchmarkAdminPbkdf2\(\)/);
  assert.match(auth, /fixed non-secret/i);
  assert.match(auth, /one warm-up plus five measured derivations/i);
  assert.match(auth, /five correct derivations/i);
  assert.match(auth, /median[^\n]+3,000 ms/i);
  assert.match(auth, /maximum[^\n]+5,000 ms/i);
  assert.match(auth, /`passed=true`/i);
  assert.match(auth, /no silent iteration reduction/i);
  assert.match(auth, /does not depend[^\n]+random key[^\n]+Sheets[^\n]+bootstrap credentials/i);
  assert.doesNotMatch(routerSource, /bootstrapFirstAdmin|setupAdminAuthSchema|benchmarkAdminPbkdf2/);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin auth schema and API contract verification passed.\n");
