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
const cms = read("docs/ADMIN_CMS_SPEC.md");
const development = read("docs/DEVELOPMENT_RULES.md");
const testing = read("docs/TESTING_CHECKLIST.md");
const runner = read("scripts/test.ps1");
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

function assertNoAdminSessionLifecycleContradictions(lifecycle, logout) {
  const scopedContract = `${lifecycle}\n${logout}`
    .replace(/`/g, "")
    .replace(/Automatic cleanup or retention deletion of session rows is outside Milestone 6/gi, "")
    .replace(/the session row is not deleted on logout/gi, "")
    .replace(/does not delete the row/gi, "")
    .replace(/does not clear token_hash/gi, "")
    .replace(/does not remove them/gi, "")
    .replace(/are not removed merely because logout occurs/gi, "");
  const contradictions = [
    [
      "define a scheduled, daily, background, automatic, or session cleanup job",
      /\b(?:(?:scheduled|daily|background|automatic|session)\s+(?:admin_sessions?\s+)?(?:cleanup|purge)(?:\s+jobs?)?|admin_sessions?\s+(?:cleanup|purge)(?:\s+jobs?)?|(?:cleanup|purge)\s+jobs?)\b/i
    ],
    [
      "clear, remove, or delete token_hash during logout",
      /(?:\btoken_hash\b[^.\n]{0,80}\b(?:clear|remov|delet)\w*\b|\b(?:clear|remov|delet)\w*\b[^.\n]{0,80}\btoken_hash\b)/i
    ],
    [
      "delete expired or revoked session rows",
      /\b(?:expired|revoked)\s+(?:admin_sessions?\s+rows?|session(?:\s+rows)?s?|rows?)\b[^.\n]{0,120}\b(?:automatic(?:ally)?\s+)?(?:delet|remov|purg)\w*\b/i
    ],
    [
      "delete expired or revoked session rows",
      /\b(?:delet|remov|purg)\w*\b[^.\n]{0,80}\b(?:expired|revoked)\s+(?:admin_sessions?\s+rows?|session(?:\s+rows)?s?|rows?)\b/i
    ],
    [
      "automatically delete, remove, purge, or clean up session rows",
      /\b(?:automatic(?:ally)?\b[^.\n]{0,80}\b(?:cleanup|delet|remov|purg)|(?:cleanup|delet|remov|purg)\w*\b[^.\n]{0,80}\bautomatic(?:ally)?)\b/i
    ],
    [
      "remove a session row during logout",
      /\blogout\b[^.\n]{0,120}\b(?:delet|remov|purg)\w*\b/i
    ],
    [
      "define a fixed retention duration",
      /\b(?:delet|retain|purg|cleanup)\w*\b[^.\n]{0,60}\b(?:after|for)\s+\d+\s+(?:hours?|days?|weeks?|months?|years?)\b/i
    ],
    [
      "define a fixed retention duration",
      /\bretention\s+(?:period|duration)\b[^.\n]{0,60}\b\d+\s+(?:hours?|days?|weeks?|months?|years?)\b/i
    ]
  ];

  for (const [description, pattern] of contradictions) {
    assert.doesNotMatch(scopedContract, pattern, `Admin session lifecycle must not ${description}`);
  }
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

  assertNoAdminSessionLifecycleContradictions(lifecycle, logout);

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

test("admin session lifecycle mutation detector rejects cleanup purge hash clearing and retention durations", () => {
  const sessions = section(schema, "## 14A. Sheet: `admin_sessions`");
  const lifecycle = section(sessions, "### 14A.2 Lifecycle and retention contract");
  const logout = section(api, "## 7.2 `adminLogout`");
  const mutations = [
    ["A", `${lifecycle}\nExpired sessions are automatically deleted after 30 days.`, logout, /delete expired or revoked session rows/],
    ["B", `${lifecycle}\nA daily cleanup job purges revoked sessions.`, logout, /cleanup job/],
    ["C", lifecycle, `${logout}\nRevoked session token_hash is cleared during logout.`, /token_hash during logout/],
    ["D", `${lifecycle}\nSession rows are retained for 90 days and then deleted.`, logout, /fixed retention duration/]
  ];

  for (const [name, mutatedLifecycle, mutatedLogout, expected] of mutations) {
    assert.throws(
      () => assertNoAdminSessionLifecycleContradictions(mutatedLifecycle, mutatedLogout),
      expected,
      `mutation ${name} must be rejected`
    );
  }
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

test("final data contract records random state and the security-critical login write order", () => {
  const lifecycle = section(schema, "## 14C. Milestone 6 authentication lifecycle");
  for (const literal of [
    "ADMIN_AUTH_RANDOM_KEY", "ADMIN_AUTH_RANDOM_COUNTER", "ADMIN_AUTH_STATE_VERSION=1",
    "setupAdminAuthSchema()", "last_login_at", "updated_at", "admin-session-token",
    "admin_sessions", "token_hash"
  ]) assert.ok(lifecycle.includes(literal), `final lifecycle must include ${literal}`);
  assert.match(lifecycle, /incremented counter[\s\S]+persisted before[\s\S]+derived bytes/i);
  assert.match(lifecycle, /update `last_login_at` and `updated_at`[\s\S]+derive[\s\S]+append the complete `admin_sessions` row/i);
  assert.match(lifecycle, /session append is the final security-state write/i);
  assert.match(lifecycle, /raw token[\s\S]+returned only after[\s\S]+append succeeds/i);
  assert.match(lifecycle, /no rollback[\s\S]+skipped counter/i);
});

test("final API transport and Router contract expose exactly the implemented Milestone 6 actions", () => {
  const transport = section(api, "## 7A. Milestone 6 transport and Router contract");
  assert.deepEqual(textBlockAfter(transport, "Exact POST action allowlist"), [
    "submitReview", "adminLogin", "adminValidateSession", "adminLogout"
  ]);
  for (const literal of [
    "text/plain;charset=utf-8", "12,000 ms", "POST body only", "no cookies",
    "no Authorization header", "no query token", "no automatic transport retry",
    "VALIDATION_ERROR", "UNAUTHORIZED", "RATE_LIMITED", "SERVER_ERROR", "FORBIDDEN",
    "NETWORK_ERROR", "TIMEOUT", "HTTP_ERROR", "MALFORMED_RESPONSE"
  ]) assert.ok(transport.includes(literal), `transport contract must include ${literal}`);
  assert.match(transport, /unknown backend code[\s\S]+SERVER_ERROR/i);
  assert.match(transport, /public GET[\s\S]+unchanged/i);
  assert.doesNotMatch(routerSource, /adminGetDashboard|createPlace|updatePlace|deletePlace/);
});

test("final Admin CMS section separates the implemented foundation from future CMS work", () => {
  const milestone = section(cms, "## 2A. Milestone 6 implemented Admin foundation");
  for (const literal of [
    "no public Admin registration", "no default credentials", "Thai-only Admin UI",
    "sessionStorage", "TAKHUN_ADMIN_SESSION", "absolute 8-hour", "no sliding renewal",
    "server-authoritative", "dashboard.html", "places.html", "routes.html", "products.html",
    "events.html", "reviews.html", "gallery.html", "settings.html", "404.html"
  ]) assert.ok(milestone.includes(literal), `Admin foundation must include ${literal}`);
  const projection = jsonBlocks(milestone)[0];
  assert.deepEqual(Object.keys(projection), ["admin_id", "display_name", "role", "token", "expires_at"]);
  assert.match(milestone, /protected content[\s\S]+hidden[\s\S]+server validation succeeds/i);
  assert.match(milestone, /desktop[\s\S]+sidebar/i);
  assert.match(milestone, /mobile[\s\S]+modal drawer/i);
  assert.match(milestone, /focus trap[\s\S]+Escape[\s\S]+backdrop[\s\S]+focus restoration/i);
  assert.match(milestone, /visible focus[\s\S]+reduced motion/i);
  assert.match(milestone, /60-second[\s\S]+RATE_LIMITED/i);
  assert.match(milestone, /safe return allowlist/i);
  assert.match(milestone, /logout[\s\S]+one bounded retry[\s\S]+finally/i);
  for (const nonGoal of [
    "Dashboard metrics", "CRUD", "moderation", "upload CMS", "role-management UI",
    "Admin language switch", "production deployment"
  ]) assert.ok(milestone.includes(nonGoal), `Milestone 6 non-goals must include ${nonGoal}`);
  assert.match(milestone, /future Admin CMS direction[\s\S]+not implemented/i);
});

test("final development rules lock the implemented authentication boundaries", () => {
  const rules = section(development, "## 30B. Milestone 6 Admin authentication engineering rules");
  for (const literal of [
    "ADMIN_PBKDF2_ITERATIONS_ = 120000", "AuthService_requireAdmin_", "TAKHUN_ADMIN_SESSION",
    "setupAdminAuthSchema()", "benchmarkAdminPbkdf2()", "bootstrapFirstAdmin()",
    "submitReview", "adminLogin", "adminValidateSession", "adminLogout"
  ]) assert.ok(rules.includes(literal), `engineering rules must include ${literal}`);
  assert.match(rules, /never commit[\s\S]+credential[\s\S]+secret/i);
  assert.match(rules, /never log[\s\S]+password[\s\S]+raw token/i);
  assert.match(rules, /must not lower[\s\S]+PBKDF2/i);
  assert.match(rules, /every protected request[\s\S]+server-authoritative/i);
  assert.match(rules, /exactly `admin_id`, `display_name`, `role`, `token`, and `expires_at`/i);
  assert.match(rules, /header name[\s\S]+order-independent/i);
  assert.match(rules, /human[\s\S]+display_name[\s\S]+email[\s\S]+formula-escaped/i);
  assert.match(rules, /security fields[\s\S]+unchanged/i);
  assert.match(rules, /session append[\s\S]+final security-state write/i);
  assert.match(rules, /token[\s\S]+only after[\s\S]+append succeeds/i);
  assert.match(rules, /benchmark[\s\S]+isolated[\s\S]+Sheets[\s\S]+Properties[\s\S]+random state/i);
});

test("Task 11 automated checklist names every focused and full local verification surface", () => {
  const automated = section(testing, "## 24. Milestone 6 automated local verification");
  for (const item of [
    "CryptoService", "SheetService", "Admin schema/docs", "AuthService", "Router",
    "Admin API", "browser auth", "Admin shell/accessibility", "Admin login",
    "public regressions", "npm test", "npm run build", "JavaScript syntax",
    "secret scan", "changed-file allowlist", "git diff --check"
  ]) assert.ok(automated.includes(item), `automated checklist must include ${item}`);
  for (const suite of [
    "test-crypto-service.js", "test-sheet-service.js", "test-admin-schema.js",
    "test-auth-service.js", "test-admin-api.js", "test-admin-auth.js", "test-admin-shell.js"
  ]) {
    assert.ok(runner.includes(suite), `repository runner must include ${suite}`);
  }
  assert.ok(runner.includes("test-review-service.js"), "repository runner must preserve review regression coverage");
});

test("future human Gates A through L are complete and ordered", () => {
  const gates = section(testing, "## 25. Future human-only Milestone 6 gates");
  assert.match(gates, /DO NOT PERFORM THESE MANUAL GATES UNTIL TASKS 1(?:-|â€“)11 ARE REVIEWED AND COMPLETE\./i);
  const gateMatches = [...gates.matchAll(/^### Gate ([A-L]) (?:-|â€”)/gm)].map((match) => match[1]);
  assert.deepEqual(gateMatches, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);
  const required = {
    A: /reviewed code[\s\S]+tests[\s\S]+complete/i,
    B: /NON-PRODUCTION Apps Script environment/,
    C: /manually creates only `ADMIN_AUTH_RANDOM_KEY`[\s\S]+must not create[\s\S]+`ADMIN_AUTH_RANDOM_COUNTER`[\s\S]+`ADMIN_AUTH_STATE_VERSION`[\s\S]+bootstrap/i,
    D: /runs `setupAdminAuthSchema\(\)`[\s\S]+key[\s\S]+without printing[\s\S]+state version[\s\S]+`1`[\s\S]+counter[\s\S]+headers[\s\S]+no credentials/i,
    E: /runs `benchmarkAdminPbkdf2\(\)`[\s\S]+one warm-up[\s\S]+five measured[\s\S]+120000[\s\S]+correctness[\s\S]+median[\s\S]+3000 ms[\s\S]+max[\s\S]+5000 ms[\s\S]+passed=true/i,
    F: /only after[\s\S]+benchmark[\s\S]+PASS[\s\S]+`ADMIN_BOOTSTRAP_ENABLED=true`[\s\S]+`ADMIN_BOOTSTRAP_USERNAME`[\s\S]+`ADMIN_BOOTSTRAP_DISPLAY_NAME`[\s\S]+`ADMIN_BOOTSTRAP_EMAIL`[\s\S]+`ADMIN_BOOTSTRAP_PASSWORD`/i,
    G: /runs `bootstrapFirstAdmin\(\)` once[\s\S]+no automated retry/i,
    H: /exactly one active `super_admin`[\s\S]+PBKDF2[\s\S]+no plaintext password[\s\S]+temporary[\s\S]+removed[\s\S]+`ADMIN_BOOTSTRAP_ENABLED=false`[\s\S]+no session row[\s\S]+random state remains valid/i,
    I: /deploys[\s\S]+Apps Script backend/i,
    J: /unauthenticated `adminValidateSession`[\s\S]+`UNAUTHORIZED`[\s\S]+public GET[\s\S]+healthy/i,
    K: /deploys[\s\S]+static frontend/i,
    L: /desktop[\s\S]+mobile[\s\S]+login[\s\S]+session[\s\S]+logout[\s\S]+revocation/i
  };
  for (const letter of Object.keys(required)) {
    assert.match(section(gates, `### Gate ${letter}`), required[letter], `Gate ${letter} contract is incomplete`);
  }
  const benchmark = section(gates, "### Gate E");
  assert.match(benchmark, /If ANY benchmark requirement fails:[\s\S]+STOP[\s\S]+NO bootstrap[\s\S]+NO manual iteration reduction[\s\S]+code\/performance review/i);
});

test("bootstrap failure recovery is complete and does not expose credential values", () => {
  const recovery = section(testing, "## 26. Bootstrap failure recovery procedure");
  for (const literal of [
    "ADMIN_BOOTSTRAP_USERNAME", "ADMIN_BOOTSTRAP_DISPLAY_NAME", "ADMIN_BOOTSTRAP_EMAIL",
    "ADMIN_BOOTSTRAP_PASSWORD", "ADMIN_BOOTSTRAP_ENABLED=false", "password_hash",
    "password_salt", "password_iterations"
  ]) assert.ok(recovery.includes(literal), `bootstrap recovery must include ${literal}`);
  assert.match(recovery, /STOP/i);
  assert.match(recovery, /Do NOT[\s\S]+blindly rerun `bootstrapFirstAdmin\(\)`/i);
  assert.match(recovery, /Do NOT[\s\S]+deploy/i);
  assert.match(recovery, /whether (?:an )?Admin row exists[\s\S]+temporary bootstrap properties remain[\s\S]+enabled flag remains true[\s\S]+random state[\s\S]+counter[\s\S]+version remain valid/i);
  assert.match(recovery, /never edit generated `password_hash`, `password_salt`, or `password_iterations`/i);
  assert.match(recovery, /return to security\/code review before any rerun/i);
  assert.doesNotMatch(recovery, /(?:print|display|log)[^\n]+(?:password|credential|random key)[^\n]+value/i);
});

test("Tasks 1 through 11 prohibit external operations and Task 12 is human-only", () => {
  const boundary = section(testing, "## 27. Agent operation boundary");
  assert.match(boundary, /Tasks 1(?:-|â€“)11[\s\S]+agent[\s\S]+must not/i);
  for (const operation of [
    "Apps Script", "Google Sheets", "Script Properties", "credentials", "ADMIN_AUTH_RANDOM_KEY",
    "setupAdminAuthSchema()", "benchmarkAdminPbkdf2()", "bootstrapFirstAdmin()",
    "deploy", "staging requests", "push", "pull request"
  ]) assert.ok(boundary.includes(operation), `agent boundary must include ${operation}`);
  assert.match(boundary, /Task 12[\s\S]+HUMAN-ONLY/i);
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write("Admin auth schema and API contract verification passed: 23 tests.\n");
