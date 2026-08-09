# Milestone 6 — Admin Foundation and Authentication Design

**Date:** 2026-08-08

**Branch:** `feature/admin-foundation-auth`

**Base:** `origin/main` at `c84a3e6`
**Status:** Design only; no production implementation or operator action is performed by this document.

## 1. Goal

Milestone 6 establishes the smallest secure Admin foundation that later Dashboard and CRUD milestones can reuse:

- a responsive shared Admin shell;
- username/password login;
- PBKDF2-HMAC-SHA256 password verification;
- server-side sessions whose source of truth is the `admin_sessions` Sheet;
- `sessionStorage` persistence under `TAKHUN_ADMIN_SESSION`;
- protected-page validation without protected-content flash;
- server-side logout revocation;
- a manually initiated, one-time first-admin bootstrap;
- focused backend/frontend tests and full public-site regression preservation.

This milestone is complete only when the browser token is treated as a bearer secret, the Sheet stores only its SHA-256 hash, every protected request is validated against the Sheet and the current Admin account, and the 8-hour absolute expiry is never extended.

## 2. Non-goals

The following remain outside Milestone 6:

- Dashboard statistics, widgets, or data aggregation;
- Places, Routes, Products, Events, Reviews, Gallery, or Settings CRUD;
- review moderation and activity-log UI;
- advanced role-management UI or additional-admin provisioning UI;
- public registration, password reset, account recovery, or tourist/customer accounts;
- media upload, drag/drop upload, or production media administration;
- public frontend redesign;
- booking, payment, live chat, or AI planning;
- external identity providers, paid authentication services, or a separate database;
- deployment execution, production credential creation, Google Sheets changes, or Script Properties changes during design or automated tests.

The existing Admin placeholder page content may remain. Milestone 6 wraps and guards it; it does not turn the placeholders into Dashboard or CRUD features.

## 3. Verified current-state findings

Repository verification before document creation found:

- repository root: `J:/wt/takhun-admin-auth`;
- current branch: `feature/admin-foundation-auth`;
- upstream shown by status: `origin/main`;
- `HEAD` and `origin/main`: `c84a3e6dff64182999628c766c4a16f8892088de`;
- ahead/behind count: `0/0`;
- baseline working tree: clean (`git status --short --branch` printed only the branch line);
- current runtime: Apps Script V8, timezone `Asia/Bangkok`, web app executes as the deploying user and permits anonymous requests;
- frontend: static HTML, CSS, and Vanilla JavaScript with no application framework;
- tests: PowerShell structural checks plus Node `assert`/`vm` behavior tests, orchestrated by `npm test`;
- build: `npm run build` runs the full test suite and checks the deployable `public/` directory;
- no implemented Admin authentication/session module, no `AuthService.gs`, no `public/admin/js/`, and no `admin_sessions` schema presently exist;
- no deployment workflow or `.clasp.json` is present in this worktree, so the exact external Apps Script/Cloudflare release mechanism cannot be inferred from repository files.

Relevant recent backend history adds one public service/action at a time and extends the central Router and Node VM tests. The latest relevant commits include `f2e18a9` (public search API), `11e4854` (home API), `b22ea91` (settings/categories), and `ebfc675` (reviews and the first Sheet write helper). Milestone 6 should follow that incremental pattern.

## 4. Existing Admin/frontend architecture

`public/admin/` contains `login.html`, `dashboard.html`, seven management placeholders, and `404.html`. The login page is a labeled Thai username/password form with a disabled placeholder button. Every other Admin page repeats the same header and horizontal navigation. There are no Admin scripts and no session guard.

`public/css/admin.css` contains only seven compact rules: Admin background/header/nav/main styles and the centered login shell/card. It has no desktop sidebar, mobile drawer, focus management, active-page state, guard state, or logout control.

The repository documentation already establishes these conventions:

- Admin files belong in `public/admin/`;
- Admin API calls go through `public/admin/js/admin-api.js`;
- authentication/session behavior belongs in `public/admin/js/admin-auth.js`;
- the documented storage key is `TAKHUN_ADMIN_SESSION`;
- Admin uses `username` and `password`, not email, as the login fields;
- protected Admin pages redirect to login, while an authenticated login page redirects to Dashboard;
- desktop uses a sidebar and mobile uses a drawer/dropdown;
- the shell contains Admin identity, public-site link, logout, active navigation, and a mobile menu button.

The current Admin copy and `<html lang="th">` are Thai. No Admin-specific bilingual flow or Admin language switch is documented. Milestone 6 therefore keeps Admin UI copy Thai-only while preserving the public TH/EN implementation unchanged.

`public/js/api.js` supplies the transport conventions to mirror: a 12-second timeout, `text/plain;charset=utf-8` POST bodies for Apps Script compatibility, strict JSON-envelope validation, normalized error codes, and no repeated page-level `fetch` code. Admin transport must be separate so a bearer token can never be accidentally attached to public GET URLs.

## 5. Existing Apps Script/backend architecture

`Code.gs` delegates `doGet` and `doPost` to `routeRequest_`. `Router.gs` dispatches public GET actions, parses POST JSON only for `submitReview`, returns the standard envelope, and replaces thrown details with the generic Thai `SERVER_ERROR`. Admin work therefore requires extending the existing router, not adding another web entry point.

`Config.gs` reads `SPREADSHEET_ID` from Script Properties. `SheetService.gs` opens that spreadsheet, maps rows by header names, validates required headers on append, and avoids fixed column numbers. `ReviewService.gs` demonstrates the current write conventions:

- normalize and bound inputs before Sheet access;
- acquire a script lock with `tryLock(10000)`;
- format timestamps using the project timezone;
- create prefixed IDs with `Utilities.getUuid()`;
- protect Sheet text beginning with `=`, `+`, `-`, or `@`;
- append by header name;
- release locks in `finally`;
- return an exact safe projection and a standard JSON envelope.

Read services use `CacheService` only as an optional public-data optimization and tolerate cache failure. Authentication sessions must not copy that pattern: the `admin_sessions` Sheet is authoritative, and a cache hit can never establish authentication.

Services use global top-level action functions ending in `_`, module-prefixed internal helpers, `var` for Apps Script compatibility, and no duplicate global function names. The backend tests load `.gs` files into Node VM contexts with mocked Apps Script services and assert exact envelopes and safe failure behavior.

## 6. Approaches considered

### 6.1 Password hashing implementation

| Approach | Benefits | Costs and risks | Decision |
|---|---|---|---|
| Standards-based pure-JavaScript PBKDF2/HMAC/SHA-256 in a focused `CryptoService.gs` | No external runtime dependency; avoids 120,000 cross-service calls; deterministic and testable against RFC/Node vectors | Security-sensitive code requires exact vector coverage and review | **Selected** |
| Call `Utilities.computeHmacSha256Signature` once for every PBKDF2 round | Uses Google's native HMAC primitive and is short to read | 120,000 Apps Script service-boundary calls create unacceptable timeout/concurrency uncertainty | Rejected |
| External hashing web service or authentication provider | Mature managed crypto | Adds network trust, secret handling, cost/availability, and violates milestone constraints | Rejected |

Apps Script currently documents a 6-minute execution ceiling and native SHA-256/HMAC helpers, but no native PBKDF2 function. RFC 8018 says the iteration count should be as large as the environment can accept. The selected implementation keeps the loop in V8 and includes both correctness vectors and an actual Apps Script performance gate. References: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Apps Script Utilities](https://developers.google.com/apps-script/reference/utilities/utilities), and [RFC 8018](https://datatracker.ietf.org/doc/html/rfc8018).

### 6.2 Session validation/storage

| Approach | Benefits | Costs and risks | Decision |
|---|---|---|---|
| Opaque browser token plus hashed token in `admin_sessions` | Immediate revocation, explicit expiry, auditable source of truth, fits Sheets | One Sheet read per protected request | **Selected** |
| Signed self-contained token | Avoids session lookup | Logout/revocation needs another denylist, recreating server state and increasing complexity | Rejected |
| CacheService-only sessions | Fast | Eviction and cache failure can change authorization; fails the locked source-of-truth requirement | Rejected |

Cache may only hold a negative/performance hint that is rechecked against the Sheet before authorization. The first implementation should omit session caching entirely.

### 6.3 Frontend module organization

| Approach | Benefits | Costs and risks | Decision |
|---|---|---|---|
| `admin-api.js`, `admin-auth.js`, `admin-shell.js` | Matches documented paths; clear transport/auth/UI boundaries; reusable by every Admin page | Three scripts must coordinate initialization | **Selected** |
| One `admin.js` file | Fewer files | Mixes bearer-token transport, storage, redirects, form behavior, and drawer UI | Rejected |
| Separate page script for every placeholder | Page-local simplicity | Duplicates the same shell and guard logic before any CRUD exists | Rejected |

## 7. Selected authentication architecture

The browser never authenticates itself. It stores a server-issued opaque token, performs a browser-expiry precheck, and calls the server to establish the protected state. The server hashes the submitted token, reads `admin_sessions`, validates exactly one well-formed unrevoked/unexpired row, then reads `admins` and requires the linked account to remain `active`.

Backend units are:

- `CryptoService.gs`: UTF-8/byte conversion, SHA-256, HMAC-SHA256, PBKDF2, base64url encoding/decoding, constant-time byte comparison, and domain-separated secret generation;
- `AuthService.gs`: login, session validation, logout, first-admin bootstrap, brute-force controls, safe projections, timestamp rules, and auth-specific validation;
- `SheetService.gs`: header-mapped find/update helpers used by authentication while preserving existing reads/appends;
- `Router.gs`: POST dispatch for `adminLogin`, `adminValidateSession`, and `adminLogout`;
- `admin-api.js`: strict POST transport and error mapping;
- `admin-auth.js`: storage contract, login controller, guard, safe redirects, and logout orchestration;
- `admin-shell.js`: shared shell markup and drawer/focus behavior.

`AuthService_requireAdmin_(token)` is the internal reusable authorization boundary for all future Admin APIs. Future actions call it before reading or mutating protected data and receive only `{admin_id, username, display_name, role}`. They do not parse or trust the browser's stored identity fields.

## 8. Admin/account data model

Milestone 6 extends the documented `admins` Sheet with the exact required unique header set below. The displayed order is the preferred order for a newly created empty Sheet, not a physical-order requirement for an existing populated Sheet:

```text
admin_id
username
display_name
email
password_algorithm
password_hash
password_salt
password_iterations
role
status
last_login_at
created_at
updated_at
```

All backend access resolves columns by normalized header name. A valid `admins` Sheet may keep any physical column order as long as every required header is present exactly once and no malformed/conflicting header exists. Setup may append missing required auth headers where safe, but it must never reorder or destructively rewrite populated Admin rows merely to match the presentation above.

Contracts:

- `username`: canonical lowercase identifier, 3–64 ASCII characters, regex `^[a-z0-9][a-z0-9._-]{2,63}$`, unique after trim/lowercase;
- `display_name`: 1–100 Unicode characters;
- `email`: optional, at most 254 characters, stored for profile/contact only and not accepted as a Milestone 6 login identifier;
- `password_algorithm`: exact value `pbkdf2_sha256`;
- `password_hash`: base64url without padding of a 32-byte derived key, exactly 43 characters;
- `password_salt`: base64url without padding of a 16-byte per-user pseudorandom salt, exactly 22 characters;
- `password_iterations`: integer `120000` for newly provisioned accounts; verification uses the validated stored value;
- `role`: one of the documented `super_admin`, `editor`, `reviewer`, `viewer`; bootstrap always creates `super_admin`;
- `status`: one of `active`, `inactive`, `deleted`; only `active` authenticates;
- timestamps: RFC 3339 UTC strings, such as `2026-08-08T04:30:00.000Z`, to avoid timezone ambiguity.

The safe Admin projection is exactly:

```json
{
  "admin_id": "ADM-…",
  "username": "operator",
  "display_name": "ผู้ดูแลระบบ",
  "role": "super_admin"
}
```

Email, status, hash, salt, iterations, algorithm, and verification details are not returned to the browser.

Malformed duplicate usernames, malformed crypto fields, duplicate matching session hashes, and missing required headers fail closed with a generic server error or authentication failure as appropriate. They are never repaired during login.

## 9. PBKDF2 contract

The exact new-account project constant is:

```javascript
var ADMIN_PBKDF2_ITERATIONS_ = 120000;
```

The complete contract is:

- algorithm: PBKDF2-HMAC-SHA256 per RFC 8018;
- password encoding: UTF-8, used exactly as entered; no case folding and no Unicode normalization;
- per-user salt: 16 bytes generated by `CryptoService_randomBytes_("admin-password-salt", 16)`;
- iteration count: 120,000 for bootstrap-created accounts;
- output length: 32 bytes;
- serialized algorithm: `pbkdf2_sha256`;
- serialized salt/hash: unpadded base64url;
- provisioning password policy: 14–128 Unicode code points and at most 256 UTF-8 bytes;
- login input ceiling: username 64 characters; password 128 code points and 256 UTF-8 bytes;
- stored iteration validation: integer from 100,000 through 1,000,000 inclusive, preventing malformed rows from forcing trivial or extreme computation;
- comparison: decode both expected and computed hashes to 32-byte arrays and XOR every byte into one accumulator; no early return on a matching prefix.

Why 120,000: it gives meaningful work-factor stretching above the historical 100,000 floor while retaining headroom for a pure-JavaScript SHA-256 implementation, Sheet access, locking, and concurrent web-app traffic within Apps Script's six-minute execution ceiling. It is intentionally below workstation-oriented recommendations because Apps Script has no native PBKDF2 and because a login endpoint that consumes tens of seconds per guess creates its own denial-of-service weakness. This is an Apps Script-constrained project constant, not a claim that 120,000 is universally sufficient.

Implementation cannot treat that reasoning as a substitute for measurement. `benchmarkAdminPbkdf2()` uses only a fixed non-secret test password/salt, performs one warm-up and five measured 120,000-round derivations in the deployed Apps Script V8 runtime, checks the expected derived key, and returns only durations plus pass/fail. It neither requires nor reads `ADMIN_AUTH_RANDOM_KEY`, `ADMIN_AUTH_RANDOM_COUNTER`, `ADMIN_AUTH_STATE_VERSION`, Sheets, bootstrap properties, or production credentials. Its sole responsibility is PBKDF2 correctness and runtime performance. Before any account is provisioned, all five derivations must be correct, median time must be at most 3,000 ms, and maximum time at most 5,000 ms. A failure stops provisioning/deployment; changing the constant requires explicit security review, updated test vectors, and a migration design. Automated Node tests also compare the implementation with `crypto.pbkdf2Sync` and published deterministic vectors at low and project counts.

Unknown, inactive, malformed, and wrong-password paths run one derivation using either the stored valid parameters or fixed valid dummy parameters before returning the same authentication error. No plaintext password, derived bytes, salt, hash, or timing diagnostic is logged.

## 10. Session/token contract

The new `admin_sessions` Sheet requires exactly this unique header set. Setup uses the displayed order when it creates an absent empty Sheet, while all access remains order-independent by header name:

```text
session_id
admin_id
token_hash
created_at
expires_at
revoked_at
last_seen_at
```

Contracts:

- `session_id`: non-secret `SES-` plus UUID, unique;
- raw token: 32 unpredictable bytes encoded as unpadded base64url, exactly 43 characters;
- `token_hash`: unpadded base64url SHA-256 of the raw token, exactly 43 characters;
- raw token: returned once by successful login and never written to Sheets, Script Properties, CacheService, logs, errors, or tests;
- timestamps: strict RFC 3339 UTC;
- `revoked_at`: empty while valid, set once during logout;
- `last_seen_at`: equal to `created_at` at issuance and not changed in Milestone 6; it never affects expiry.

The server validates these security fields against their strict grammars and writes them unchanged. In particular, an unpadded base64url `password_hash`, `password_salt`, or `token_hash` may validly begin with `-`; it must survive Sheet append/read exactly as generated and must not receive a formula-escape apostrophe.

Apps Script does not document `Math.random()` or `Utilities.getUuid()` as a cryptographic random-number generator. The design therefore requires a permanent 32-byte base64url secret Script Property named `ADMIN_AUTH_RANDOM_KEY`. The human supplies only that key. Reviewed setup code owns the non-secret but security-sensitive `ADMIN_AUTH_RANDOM_COUNTER` and `ADMIN_AUTH_STATE_VERSION` properties.

`setupAdminAuthSchema()` initializes the random state under the script lock. It validates the key without printing it. If the state-version and counter properties are both absent and there are no populated Admin credential fields or session data rows, it writes `ADMIN_AUTH_RANDOM_COUNTER=0` and `ADMIN_AUTH_STATE_VERSION=1` as the first-time initialization. If only one property is absent, a value is malformed, or auth data already exists while initialization state is absent, setup fails closed. It never repairs or resets an existing malformed/missing counter once state version 1 exists.

Every `CryptoService_randomBytesLocked_` call occurs inside the same script-lock critical section as its consuming bootstrap/login write. It requires state version 1, validates the counter as a canonical decimal non-negative safe integer strictly below `Number.MAX_SAFE_INTEGER`, increments and persists it first, and only then derives output. Persistence failure produces no random output. The function computes domain-separated HMAC-SHA256 over purpose, the incremented counter, two UUIDs, and current milliseconds. The HMAC key makes output unpredictable even if UUID/timestamp inputs are observable; the counter and purpose separation prevent input reuse. Skipped counter values after a later failure are safe and are never rolled back. Salt takes 16 output bytes; a session token takes all 32. The random key is never used as the session lookup hash key and is never returned or logged.

Validation does this on every protected request:

1. Require a 43-character base64url token; reject malformed input before Sheet work.
2. SHA-256 the raw token.
3. Read `admin_sessions` by header name and require exactly one constant-time hash match.
4. Strictly parse all required fields and timestamps.
5. Reject a non-empty `revoked_at`.
6. Reject `now >= expires_at`.
7. Read `admins`, require exactly one matching `admin_id`, valid crypto/account fields, and `status = active`.
8. Return only the safe Admin projection plus the original absolute `expires_at`.

Malformed, missing, expired, revoked, unknown, and duplicate sessions return the same `UNAUTHORIZED` envelope. Session reads do not rely on CacheService. Expired/revoked rows remain for audit; automatic retention/deletion is outside this milestone.

## 11. 8-hour expiry contract

`ADMIN_SESSION_LIFETIME_MS_` is exactly `8 * 60 * 60 * 1000` (28,800,000 ms).

At issuance:

```text
created_at = now in UTC
expires_at = created_at + 28,800,000 ms
```

`expires_at` is immutable. Validation and `last_seen_at` never renew or replace it. A request at the exact expiry instant fails. Login creates a new independent session rather than extending an old one. Closing a tab ends browser access because `sessionStorage` is tab-scoped, while the server row remains valid until logout, revocation, account deactivation, or absolute expiry.

## 12. Frontend sessionStorage contract

The key remains exactly:

```text
TAKHUN_ADMIN_SESSION
```

Only `window.sessionStorage` is permitted for Admin authentication. `localStorage`, cookies, URL parameters, and IndexedDB must not contain the token.

The stored JSON object is:

```json
{
  "admin_id": "ADM-…",
  "display_name": "ผู้ดูแลระบบ",
  "role": "super_admin",
  "token": "43-character-base64url-token",
  "expires_at": "2026-08-08T12:30:00.000Z"
}
```

This preserves the documented flat object and key. `username` may be returned by the server and displayed during the live page but is not added to the stored contract.

`AdminAuth.readSession()` catches storage/JSON errors and validates exact object type, allowed keys, string types, ID/token patterns, allowed role, a strictly parseable canonical UTC expiry, and `Date.now() < expires_at`. Any missing, extra, malformed, or expired value is removed and treated as no session. Storage unavailable means authentication cannot persist and protected navigation fails closed; no memory-only authenticated fallback is used.

The browser fields are display hints only. Server responses replace the live identity after every successful `adminValidateSession`; protected API authorization never trusts them.

## 13. Login flow

`adminLogin` is a POST body:

```json
{
  "action": "adminLogin",
  "payload": {
    "username": "operator",
    "password": "entered secret"
  }
}
```

Server behavior:

1. Accept only a plain-object payload and bounded string fields.
2. Canonicalize username with trim/lowercase and validate the username grammar.
3. Find an exact unique canonical username.
4. Validate account status and stored PBKDF2 metadata.
5. Perform exactly one real or dummy PBKDF2 derivation.
6. Compare in constant time.
7. For all unknown username, inactive/deleted account, malformed credential row, and wrong password cases, return exactly `{ok:false,error:{code:"UNAUTHORIZED",message:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"}}`.
8. Acquire the script lock, reread the Admin row, and require that the same unique account is still `active` with unchanged credential metadata.
9. Update the non-security-critical `last_login_at` and `updated_at` fields first by header name.
10. Generate the raw token through the locked counter path, construct the complete session record, and append that fully valid `admin_sessions` row as the final security-state write.
11. Return the safe projection, raw token, and absolute expiry only after the session append succeeds.

The lock is released in `finally`. A timestamp update failure creates no session. A counter/token-generation failure may leave the timestamp updated and the counter advanced, but creates no session and returns no token. A session append failure leaves the timestamp updated and counter advanced, but returns no token and leaves no newly usable session because the session row is the final security-state write. If the append succeeds but the HTTP response is lost, an unreachable valid session may remain; that token was never received, poses no bearer-token exposure, and expires naturally after eight hours. Authentication correctness therefore requires no rollback transaction or best-effort revocation of a partially created session.

Client behavior:

- keep the submit button disabled until both fields are non-empty and within client bounds;
- on submit, disable inputs/button, set `aria-busy="true"`, and show a live loading message;
- never log or retain the password after the request resolves;
- display the same generic Thai credential error for `UNAUTHORIZED`;
- store the exact session object only after strict response validation;
- redirect to a validated return path or `dashboard.html`;
- re-enable and focus the appropriate control after recoverable failure.

If the login page finds a syntactically valid unexpired browser session, it calls `adminValidateSession`. A valid server session redirects to the safe return target/Dashboard. A rejected session is removed and the login form remains. The login form is not hidden merely because browser JSON exists.

## 14. Protected-page guard flow

All Admin pages except `login.html` load `config.js`, `admin-api.js`, `admin-auth.js`, and `admin-shell.js` with `defer`. The initial body class is `admin-auth-pending`; protected main content is hidden and an accessible non-sensitive loading region is visible.

Guard behavior:

| Browser/server state | Result |
|---|---|
| Missing session | Redirect to `login.html` with a safe return value |
| Storage unavailable | Redirect; do not use an authenticated memory fallback |
| Malformed/corrupted JSON | Remove key and redirect |
| Browser expiry reached | Remove key and redirect |
| Server rejects unknown/expired/revoked/malformed session | Remove key and redirect |
| Linked Admin inactive/deleted | Remove key and redirect |
| Server/network unavailable | Keep protected content hidden, show retry and “กลับหน้าเข้าสู่ระบบ”; never reveal the page |
| Valid server session | Refresh live identity from server, initialize shell, then reveal protected content |

The return value is a relative target such as `places.html?edit=BTK-001`, never an absolute URL. `AdminAuth.safeReturnPath()` rejects control characters, backslashes, credentials, schemes, protocol-relative values, `login.html`, paths outside the current `/admin/` directory, and any basename outside the exact allowlist `dashboard.html`, `places.html`, `routes.html`, `products.html`, `events.html`, `reviews.html`, `gallery.html`, `settings.html`, `404.html`. It parses against `window.location.href`, requires identical origin and Admin directory, and returns only filename/query/hash. Rejection falls back to `dashboard.html`. This prevents open redirects.

## 15. Logout flow

`adminLogout` is a POST body with the current raw token at the top level to match the documented API shape:

```json
{
  "action": "adminLogout",
  "token": "43-character-base64url-token"
}
```

The server hashes the token, finds an exact matching session, and sets `revoked_at` under a script lock. It never deletes the row. A repeated logout for an already revoked, expired, or absent well-formed token returns the same success envelope, preventing a token-validity oracle. A missing/malformed token returns `VALIDATION_ERROR`; all thrown details remain hidden.

The client disables logout, calls the server, and clears `TAKHUN_ADMIN_SESSION` in `finally`. A transient failure receives one bounded automatic retry. Whether the server succeeds or both attempts fail, the local token is removed and the browser redirects to login. If revocation could not be confirmed, the login page shows a non-sensitive warning that local sign-out succeeded but the server session may remain until its 8-hour expiry; it never restores the token. Browser deletion alone is not represented as successful server logout.

## 16. Admin shell design

Protected pages provide a small static shell mount and a hidden existing `<main>`. `admin-shell.js` renders one shared, fixed navigation definition rather than maintaining eight copied menus.

Desktop:

- persistent left sidebar with Takhun Trip Admin brand and the eight existing Admin routes;
- top header with page title, Admin display name/role, “เปิดเว็บไซต์” link, and logout;
- active link identified by current filename with `aria-current="page"`;
- existing placeholder content remains in the content region without metrics or CRUD controls.

Mobile:

- compact top header and menu button;
- modal drawer with backdrop, same navigation, identity, public-site link, and logout;
- `aria-expanded`, `aria-controls`, and drawer hidden state synchronized;
- focus moves to the first drawer control on open, is trapped within the open drawer, closes on Escape/backdrop/close/link, and returns to the opener;
- background is non-interactive and body scrolling is locked while open.

The shell has a skip link, visible keyboard focus, 44px minimum touch targets, sufficient contrast, reduced-motion support, and no dependence on color alone for active state. Logout remains reachable by keyboard on every viewport.

## 17. First-admin bootstrap design

There is no registration endpoint and no default credential. A global editor-only function `bootstrapFirstAdmin()` exists in `AuthService.gs` but is never routed from `doGet`/`doPost`.

Temporary Script Properties:

```text
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_USERNAME=<3–64 character username>
ADMIN_BOOTSTRAP_DISPLAY_NAME=<1–100 character display name>
ADMIN_BOOTSTRAP_EMAIL=<optional email>
ADMIN_BOOTSTRAP_PASSWORD=<14–128 code point secret>
```

Permanent security properties:

```text
ADMIN_AUTH_RANDOM_KEY=<32 cryptographically random bytes, unpadded base64url>
ADMIN_AUTH_RANDOM_COUNTER=<non-negative integer managed only by code>
ADMIN_AUTH_STATE_VERSION=1 <managed only by code>
```

`bootstrapFirstAdmin()`:

1. Requires `ADMIN_BOOTSTRAP_ENABLED` to equal exact lowercase `true`.
2. Acquires the script lock.
3. Rechecks complete `admins`/`admin_sessions` schemas.
4. Fails closed if any active Admin exists or if the canonical username already exists in any status.
5. Requires the already initialized/validated auth random state; bootstrap never initializes or resets it.
6. Generates a fresh 16-byte salt and computes PBKDF2 itself; the operator never calculates a hash.
7. Appends one Admin row with formula-safe human-entered `display_name`/`email` and exact unmodified server-generated/strict fields: `admin_id`, algorithm, hash, salt, iterations, role, status, and timestamps.
8. Verifies by rereading that exactly one matching row exists and no plaintext password value appears in any written field.
9. Deletes `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, and `ADMIN_BOOTSTRAP_EMAIL`, then sets `ADMIN_BOOTSTRAP_ENABLED=false` only after verified success.
10. Returns a non-secret result containing only Admin ID, username, and cleanup status.

Automated tests cannot call the bootstrap with real Properties/Sheets and never contain a production-like credential. Unit fixtures use conspicuously synthetic fixed strings only inside isolated VM memory and assert that source/records/responses/log calls never contain the input password. A rerun after success fails closed because bootstrap is disabled and an active Admin exists.

`setupAdminAuthSchema()` is also editor-only and never routed. Under one script lock it has two explicit responsibilities: validate/initialize the auth random configuration described in Section 10, and non-destructively establish the required Sheet schemas. It can create an absent empty `admin_sessions` Sheet with the documented unique headers and append missing required auth headers to an existing valid `admins` header row. All later access is order-independent by header name. It refuses duplicate/malformed/conflicting headers, a missing `admins` Sheet, unexpected non-empty session headers, auth rows inconsistent with first-time random-state initialization, or any destructive rewrite. It does not create accounts, credentials, salts, tokens, or hashes. Its non-secret result reports required headers present/unique, key format valid, counter valid or initialized to zero, and state version 1; it never reports property values.

## 18. Router/service integration

`Router.gs` parses every POST body once, validates that it is a plain JSON object, and dispatches only allowed POST actions:

- `submitReview` → `submitReview_(body.payload)` (existing public behavior preserved);
- `adminLogin` → `adminLogin_(body.payload)`;
- `adminValidateSession` → `adminValidateSession_(body.token)`;
- `adminLogout` → `adminLogout_(body.token)`.

GET never accepts Admin tokens or Admin actions because query strings are more likely to enter browser/server logs. `adminValidateSession` returns:

```json
{
  "ok": true,
  "data": {
    "admin": {
      "admin_id": "ADM-…",
      "username": "operator",
      "display_name": "ผู้ดูแลระบบ",
      "role": "super_admin"
    },
    "expires_at": "2026-08-08T12:30:00.000Z"
  },
  "message": "success"
}
```

The login response contains the same `admin` projection, `token`, and `expires_at`. The client flattens only the documented stored fields. `AuthService_requireAdmin_` produces the same trusted server context for future actions. Dashboard/CRUD actions are not added.

## 19. Error/security behavior

The existing envelope remains authoritative. Milestone 6 uses:

- `VALIDATION_ERROR`: malformed non-credential request shape or malformed logout token;
- `UNAUTHORIZED`: every credential mismatch and every invalid session state;
- `RATE_LIMITED`: authentication attempt budget exceeded, with a generic retry-later message;
- `SERVER_ERROR`: configuration, schema, lock, crypto, or unexpected failure;
- `FORBIDDEN`: reserved for future valid-session role authorization, not used to reveal login state.

Security rules:

- never log request bodies, Authorization values, plaintext passwords, raw tokens, hashes, salts, PBKDF2 bytes, random keys, or Script Property values;
- exception handlers return fixed messages and never `_error.message`, stack traces, Spreadsheet IDs, row values, or field-specific verification details;
- no token in a GET URL;
- formula-injection escaping applies only to user/operator-controlled free text that could be interpreted as a formula, including `display_name`, optional `email`, and future user content;
- server-generated, numeric, canonical timestamp, strict-enum, and cryptographic fields are validated by their exact contracts and written/read byte-for-byte without formula escaping: `password_hash`, `password_salt`, `token_hash`, `admin_id`, `session_id`, `password_algorithm`, `role`, `status`, all canonical auth timestamps, and `password_iterations`;
- base64url legitimately permits `-` as its first character. Prefixing an apostrophe would change the serialized hash/salt/token-hash value, make decoded bytes differ, and corrupt authentication/session lookup rather than improve safety;
- all auth/session writes use `LockService.getScriptLock().tryLock(10000)` and release in `finally`;
- all auth timestamps use strict RFC 3339 UTC and are parsed by exact grammar plus round-trip validation;
- no session authorization uses CacheService alone or accepts client identity/role;
- server account deactivation invalidates all linked sessions immediately at their next validation;
- constant-time comparison is used for password hashes and candidate token hashes;
- malformed stored crypto/session data fails closed without silently falling back to weaker parameters;
- no raw secret is committed in source, fixtures, documentation examples, screenshots, or deployment logs.

## 20. Brute-force/rate-limit strategy

Apps Script does not expose a dependable requester IP in the current web-app event contract, so IP throttling is not designed. The smallest proportionate server control uses `CacheService` only for attempt throttling, never for authentication:

- per-identifier bucket key: SHA-256 of canonical username, maximum 5 failed attempts in 15 minutes;
- global bucket: maximum 100 failed attempts across the script in 10 minutes;
- counter updates occur under the script lock;
- a successful login clears the identifier bucket but not the global failed-attempt bucket;
- rejected/unknown/inactive users contribute identically;
- exceeding either budget returns `RATE_LIMITED` before PBKDF2 to protect Apps Script execution capacity;
- browser disables repeated submit while a request is outstanding and respects a fixed 60-second client cooldown after `RATE_LIMITED`.

Cache eviction can weaken attempt counting, so this is explicitly best-effort brute-force resistance for a small Admin surface, backed by a 14-character provisioning minimum, expensive password hashing, generic failures, and no public registration. A durable attempts Sheet would add personal/security-log retention and write amplification and is deferred unless production monitoring shows abuse. Cache failure does not authenticate anyone; it permits normal credential verification and is covered by tests.

## 21. Accessibility

- Login fields retain explicit labels and correct `autocomplete` values.
- Validation/error/loading regions use `aria-live` without repeatedly announcing passwords or technical details.
- Submit and logout expose disabled/busy states and retain visible focus.
- Guard loading has a textual status, not a spinner alone.
- The shell uses semantic header/nav/main landmarks and one page-level heading.
- Drawer behavior supports keyboard open, focus trap, Escape close, backdrop close, and focus restoration.
- Active navigation uses `aria-current="page"` plus shape/weight, not color alone.
- Motion honors `prefers-reduced-motion`.
- Protected content remains hidden from both sighted users and the accessibility tree until server validation succeeds.

## 22. Files expected to change

Implementation is expected to create or modify only these areas:

**Create**

- `apps-script/CryptoService.gs` — cryptographic primitives and random derivation;
- `apps-script/AuthService.gs` — auth/session/bootstrap behavior;
- `public/admin/js/admin-api.js` — Admin transport;
- `public/admin/js/admin-auth.js` — storage/login/guard/logout;
- `public/admin/js/admin-shell.js` — shared responsive shell;
- `scripts/test-crypto-service.js`;
- `scripts/test-auth-service.js`;
- `scripts/test-admin-api.js`;
- `scripts/test-admin-auth.js`;
- `scripts/test-admin-shell.js` and/or a focused PowerShell static-contract test.

**Modify**

- `apps-script/Router.gs` — parse/dispatch Admin POST actions;
- `apps-script/SheetService.gs` — safe header-mapped find/update/schema helpers;
- `apps-script/Config.gs` — validated auth random-key/counter access if kept in configuration boundary;
- `docs/DATA_SCHEMA.md` — `admins` auth fields, `admin_sessions`, UTC auth timestamps;
- `docs/API_SPEC.md` — final login/validation/logout contracts and `sessionStorage` requirement;
- `docs/ADMIN_CMS_SPEC.md` — locked session/bootstrap/security behavior;
- `docs/DEVELOPMENT_RULES.md` and `docs/TESTING_CHECKLIST.md` — precise Admin security/testing rules;
- `public/admin/login.html` and every protected `public/admin/*.html` page — script loading, shell mounts, guard state, page metadata/data attributes;
- `public/css/admin.css` — login, guard, shell, sidebar/drawer, responsive, focus, and reduced-motion styling;
- `scripts/test.ps1` — required files and focused test invocation;
- `scripts/test-apps-script.js` — expected router actions and safe dispatch/error assertions.

`public/js/config.js` is read by Admin pages and remains the single public API URL source. Its shape does not need an auth-specific change.

## 23. Files explicitly out of scope

- Public page HTML/CSS/controller behavior other than adding no changes at all;
- public data services such as `PlaceService.gs`, `RouteService.gs`, `ProductService.gs`, `EventService.gs`, `ReviewService.gs`, `GalleryService.gs`, `HomeService.gs`, `SearchService.gs`, `SettingsService.gs`, and `CategoryService.gs` except compatibility tests;
- new Dashboard/CRUD service or controller files;
- media pipeline and generated assets;
- production secrets, credentials, Sheet rows, Script Properties, deployments, commits, pushes, and pull requests during this design task.

## 24. Automated testing strategy

### Backend

`test-crypto-service.js` loads `CryptoService.gs` in a Node VM and checks:

- RFC/independent PBKDF2-HMAC-SHA256 vectors, including one published low-round vector and a deterministic 120,000-round value produced by Node `crypto.pbkdf2Sync`;
- UTF-8 passwords and salts;
- exact 32-byte output and base64url round trips;
- malformed encoding rejection;
- constant-time helper reads/compares all bytes for equal and unequal values;
- token/salt domain separation and deterministic generation with injected entropy/key;
- no `Math.random`, `eval`, secret logging, or plaintext serialization.

`test-auth-service.js` uses mocked Sheets, locks, Properties, Cache, clock, and crypto to check:

- correct password, wrong password, unknown Admin, inactive/deleted Admin;
- identical generic authentication failure for all mismatch cases;
- malformed hash/salt/algorithm/iteration values and duplicate usernames;
- input maximums and canonical username behavior;
- safe projection excludes email/status/hash/salt/iterations/algorithm;
- random 32-byte token generation and SHA-256-only Sheet storage;
- required unique Admin/session header sets with order-independent access and non-destructive migration;
- formula-safe human-entered text while a valid base64url hash/salt/token hash beginning with `-` survives Sheet write/read unchanged;
- creation expiry equals exactly 28,800,000 ms;
- no sliding renewal and immutable expiry;
- valid, expired, revoked, malformed, duplicate, unknown, and inactive-linked sessions;
- logout revocation, repeated logout, unknown well-formed token, and malformed token;
- lock acquisition failure, release in `finally`, and competing creation/revocation behavior;
- counter first-time initialization, state-version validation, atomic increment-before-derive, safe-integer ceiling, persistence failure, skipped-value behavior, and refusal to reset missing/malformed established state;
- benchmark isolation proves no Script Properties, random key/counter, Sheets, bootstrap input, or production credential is read;
- login write-order tests inject failure at timestamp update, counter persistence/token generation, and session append; each returns no token and leaves no newly usable session, while response loss after a successful final append leaves only an unreachable naturally expiring session;
- bootstrap disabled/missing properties, first active Admin rejection, duplicate username rejection, successful hash creation, source-of-truth reread, automatic temporary-property cleanup, and no credential creation in tests;
- rate-limit thresholds, cache failure, success reset, and generic responses.

`test-apps-script.js` checks unique functions, syntax, exact GET/POST action lists, `adminLogin`/`adminValidateSession`/`adminLogout` routing, submit-review regression, safe parse failures, no GET Admin action, and fixed server errors without secret detail.

### Frontend

`test-admin-api.js` checks timeout/network/HTTP/malformed-envelope behavior, exact `text/plain` POST bodies, no token in URLs, Admin error codes, and token redaction from thrown errors.

`test-admin-auth.js` uses fake DOM/storage/location/clock/API and checks:

- login field validation and loading/busy state;
- generic login error and password clearing;
- successful exact `sessionStorage` write;
- storage exceptions, missing/malformed/extra-field/expired session removal;
- protected redirect and encoded safe return path;
- absolute/protocol-relative/backslash/cross-directory/open-redirect rejection;
- login-page valid-session redirect and rejected-session cleanup;
- server-rejected/expired/revoked session cleanup;
- network failure keeps content hidden and exposes retry;
- zero protected-content flash before validation;
- logout server call, retry, local cleanup, success redirect, and unconfirmed-revocation warning.

`test-admin-shell.js`/static checks cover one shell mount per protected page, active route, identity/logout elements, desktop/mobile classes, ARIA contracts, Escape/backdrop behavior, focus trap/restoration, no Dashboard metrics, and no CRUD controls.

### Regression and verification commands

Implementation verification runs, in order:

```powershell
node scripts/test-crypto-service.js
node scripts/test-auth-service.js
node scripts/test-admin-api.js
node scripts/test-admin-auth.js
node scripts/test-admin-shell.js
npm test
npm run build
Get-ChildItem public\admin\js\*.js,public\js\*.js,scripts\*.js | ForEach-Object { node --check $_.FullName }
git diff --check
```

The full suite must prove existing public routes, API envelopes, `submitReview`, media, i18n, and public application behavior remain unchanged.

## 25. Manual QA matrix

Manual QA occurs only after implementation, schema setup, bootstrap, and a staging deployment.

| Area | Viewport/state | Expected result |
|---|---|---|
| Login | Desktop | Labeled form, keyboard submit, busy state, generic error, successful redirect |
| Login | 360px mobile | No horizontal overflow; controls and messages remain readable/tappable |
| Credentials | Wrong username/password/inactive | Same message; no account-existence detail |
| Credentials | Correct | One session row with hash only; browser stores exact object |
| Direct protected URL | No session | No protected flash; safe redirect with return path |
| Return path | External/protocol-relative input | Dashboard fallback; never leaves origin |
| Refresh | Logged in | Server revalidation succeeds and shell appears after guard |
| New tab via copied URL | Same browser, new tab | No session inherited; redirect to login |
| Close/reopen tab | Closed tab | `sessionStorage` behavior requires login again |
| Logout | Normal | Server row gets `revoked_at`; browser key removed; login shown |
| Logout | Repeat | Safe success without token-validity detail |
| Logout | Simulated network failure | Local key removed; unconfirmed-revocation warning shown |
| Expired session | Browser/server clock boundary | Rejected at exact expiry; key removed |
| Revoked session | Direct navigation/refresh | Server rejects and client redirects |
| Account deactivation | Existing session | Next validation fails |
| Mobile drawer | Touch/keyboard | Open/close/backdrop/Escape/focus restoration work |
| Keyboard | Entire login/shell | Logical order, visible focus, no trap outside open drawer |
| Language | Admin | Thai UI remains coherent; no unimplemented TH/EN switch appears |
| Public TH/EN | Public pages | Existing public language switch/fallback behavior is unchanged |

QA results are not claimed by this design.

## Manual Operator Steps Required After Implementation

These are future gates. None should be performed while reviewing this design.

1. **Install the reviewed code in a non-production Apps Script deployment.**
   - System/UI: repository review process, then Google Apps Script Editor or the project's approved sync mechanism.
   - When: after implementation tests/build pass and code review is complete; before any Sheet or credential operation.
   - Why: schema/bootstrap functions must come from the reviewed version.
   - Exact items: `CryptoService.gs`, `AuthService.gs`, Router/Sheet/Config changes.
   - Value entered: source files/version only; no credential.
   - Secret: no.
   - Never commit: nothing additional at this step.
   - Expected verification: Apps Script project saves/compiles with V8 and exposes editor-only `setupAdminAuthSchema`, `benchmarkAdminPbkdf2`, and `bootstrapFirstAdmin`; none appears as a Router action.
   - Cleanup: none.

2. **Create the permanent auth random key in Script Properties.**
   - System/UI: Google Apps Script Editor → Project Settings → Script Properties.
   - When: after reviewed code is installed and before auth setup/config validation.
   - Why: Apps Script lacks a documented CSPRNG contract; HMAC-based random derivation requires a server-only 256-bit key.
   - Exact property: `ADMIN_AUTH_RANDOM_KEY`.
   - Value type: exactly 32 bytes generated by a trusted password manager/OS cryptographic generator, encoded as 43-character unpadded base64url.
   - Secret: yes, permanent.
   - Never commit: the value, screenshots, exports, terminal history, test fixtures, or documentation examples containing it.
   - Expected verification: the property is present; its format is verified by `setupAdminAuthSchema()` in the next step without printing it.
   - Cleanup: do not remove while any account/session generation uses this deployment; rotate only through a separately reviewed procedure.

3. **Run reviewed auth setup and configuration validation.**
   - System/UI: Google Apps Script Editor → function selector → `setupAdminAuthSchema` → Run, then inspect the Google Spreadsheet referenced by existing `SPREADSHEET_ID`.
   - When: immediately after adding `ADMIN_AUTH_RANDOM_KEY`, before benchmark or bootstrap properties.
   - Why: validate the permanent key, safely initialize or validate code-owned random state under the script lock, and establish required Sheet headers non-destructively.
   - Exact function/properties/sheets: `setupAdminAuthSchema()` validates `ADMIN_AUTH_RANDOM_KEY`; initializes `ADMIN_AUTH_RANDOM_COUNTER=0` and `ADMIN_AUTH_STATE_VERSION=1` only for first-time empty auth state, otherwise validates established state; verifies/extends `admins`; creates or verifies `admin_sessions`.
   - Value entered: none. The human does not create, edit, reset, or increment the counter/state-version properties.
   - Secret: `ADMIN_AUTH_RANDOM_KEY` is secret; counter/state version and header names are non-secret but security-sensitive.
   - Never commit: key value, property export, Spreadsheet ID export, or Sheet contents.
   - Expected verification: result reports key format valid, state version 1, counter `initialized` at zero or `valid` without revealing its value, and every required header present exactly once. `admins` may retain its existing physical order; an absent empty `admin_sessions` uses the documented order and contains no rows.
   - Cleanup: none. Any missing/malformed established counter, partial state-property pair, duplicate/conflicting header, or existing auth data without initialization state must stop the workflow; never delete/reset the counter to retry.

4. **Run the non-secret PBKDF2 runtime benchmark.**
   - System/UI: Google Apps Script Editor → function selector → `benchmarkAdminPbkdf2` → Run; Executions panel for result.
   - When: after setup/config validation and before entering any username, password, or other bootstrap property.
   - Why: prove `120000` is correct and practical in the actual V8 runtime rather than relying on local timing.
   - Exact function: `benchmarkAdminPbkdf2()`.
   - Value entered: none; it uses fixed non-secret PBKDF2 vectors only.
   - Secret: no.
   - Never commit: no generated values; benchmark output may be retained because it contains only correctness status and durations.
   - Expected verification: five correct derivations, median ≤3,000 ms, maximum ≤5,000 ms, overall `passed: true`.
   - Cleanup: none. The benchmark must not read the random key/counter/state, Sheets, bootstrap properties, or production credentials. If it fails, stop before provisioning and request security review; do not lower the iteration count manually.

5. **Enter temporary first-admin bootstrap properties.**
   - System/UI: Google Apps Script Editor → Project Settings → Script Properties.
   - When: only after setup/config validation and the PBKDF2 benchmark both pass, immediately before running bootstrap.
   - Why: pass bootstrap input without source-code credentials or manual PBKDF2 work.
   - Exact properties: `ADMIN_BOOTSTRAP_ENABLED=true`, `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, optional `ADMIN_BOOTSTRAP_EMAIL`, and `ADMIN_BOOTSTRAP_PASSWORD`.
   - Value type: canonical username; display name; optional email; unique 14–128 code-point password from a password manager.
   - Secret: password is secret; username/email/display name may be sensitive operational data.
   - Never commit: every property value, especially the plaintext password.
   - Expected verification: properties save successfully; no values appear in source or logs.
   - Cleanup: code removes temporary values after successful bootstrap; the operator confirms this in Step 7.

6. **Run first-admin bootstrap exactly once.**
   - System/UI: Google Apps Script Editor → function selector → `bootstrapFirstAdmin` → Run; approve only the expected Spreadsheet/Properties scopes.
   - When: immediately after temporary properties are set.
   - Why: let reviewed code validate input, generate salt, calculate PBKDF2, and create the first active Admin.
   - Exact function: `bootstrapFirstAdmin()`.
   - Value entered: none during execution.
   - Secret: the function reads secret Script Properties but must not print them.
   - Never commit: execution inputs/output screenshots containing operational identity; no plaintext credential.
   - Expected verification: one non-secret success result with Admin ID/username/cleanup status; exactly one new active `super_admin` row; no session row yet.
   - Cleanup: automatic temporary-property deletion/disable on verified success.

7. **Verify the Admin row and bootstrap cleanup.**
   - System/UI: Google Sheets and Apps Script Project Settings.
   - When: immediately after successful bootstrap, before deployment.
   - Why: independently confirm no plaintext or lingering bootstrap secret.
   - Exact checks: required `admins` headers are present and unique in any physical order; the created row has `password_algorithm=pbkdf2_sha256`, an unmodified 43-character hash, an unmodified 22-character salt, `password_iterations=120000`, `role=super_admin`, `status=active`; `ADMIN_BOOTSTRAP_ENABLED=false`; the four temporary value properties are absent; permanent `ADMIN_AUTH_RANDOM_KEY`, code-managed `ADMIN_AUTH_STATE_VERSION=1`, and a valid incremented counter remain.
   - Value entered: none.
   - Secret: hash/salt/property values remain non-public security data.
   - Never commit: row exports, hash, salt, or any property.
   - Expected verification: no cell equals the entered plaintext password, no temporary plaintext property remains, crypto fields round-trip exactly without apostrophe prefixes/content mutation, and no raw token/session row exists before first login.
   - Cleanup: manually delete any temporary bootstrap property that remains and stop deployment as a failure; do not rerun bootstrap until reviewed.

8. **Create a new Apps Script web-app version/deployment.**
   - System/UI: Google Apps Script Editor → Deploy → Manage deployments.
   - When: only after benchmark, schema, bootstrap, and cleanup verification pass.
   - Why: publish the reviewed Router/Auth code used by the static Admin client.
   - Exact deployment: new version of the existing web app, retaining execute-as-deployer and the current access model unless a separate deployment-security review changes it.
   - Value entered: version description; no secret.
   - Secret: deployment URL should be treated as operational configuration but is not an authentication credential.
   - Never commit: no secret; if `public/js/config.js` is updated with the deployment URL, confirm repository policy before committing that non-secret URL.
   - Expected verification: POST `adminValidateSession` without a token returns JSON `UNAUTHORIZED`, not HTML or stack detail; public GET actions still work.
   - Cleanup: keep prior deployment version available for rollback according to the existing operator policy.

9. **Publish the static Admin frontend through the existing Cloudflare Pages process.**
   - System/UI: the repository's normal Git/Cloudflare Pages release path; the exact mechanism is not present in this worktree.
   - When: after the matching Apps Script deployment is healthy.
   - Why: release login/guard/shell code against the reviewed backend URL.
   - Exact files: deploy `public/`; confirm `APP_CONFIG.API_URL` targets the intended Apps Script deployment.
   - Value entered: deployment selection/configuration, no Admin password.
   - Secret: no credential.
   - Never commit: Admin password, random key, bootstrap properties, or raw session token.
   - Expected verification: production/staging Admin login page loads and the public site regression smoke test passes.
   - Cleanup: none; roll back through the established Pages workflow if smoke testing fails.

10. **Perform the authentication smoke test and server-revocation check.**
    - System/UI: desktop and mobile browsers, DevTools Application → Session Storage, and Google Sheets `admin_sessions`.
    - When: after both backend and frontend deployments.
    - Why: confirm the end-to-end bearer-token/hash boundary and logout revocation.
    - Exact actions: log in with the newly provisioned account, inspect `TAKHUN_ADMIN_SESSION`, open a protected page, refresh, log out, and retry the old protected URL.
    - Value entered: first-admin username/password in the login UI only.
    - Secret: password and raw browser token are secret.
    - Never commit: credentials, DevTools screenshots containing token, copied session JSON, or Sheet exports.
    - Expected verification: browser contains one raw token; Sheet contains a different 43-character SHA-256 hash only; expiry is exactly eight hours after creation; logout fills `revoked_at`; old token is rejected; closing/reopening the tab requires login.
    - Cleanup: clear browser session data after testing; keep the revoked Sheet row for audit.

## 27. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Pure-JS cryptography defect | Focused module, published/Node cross-vectors, exact encodings, no optimization before correctness, code review |
| PBKDF2 too slow in real Apps Script | Exact pre-provision benchmark gate; no production account before pass |
| Apps Script lacks documented CSPRNG | Permanent 256-bit operator-generated key plus domain-separated HMAC derivation; reviewed setup initializes code-owned state once, and every locked generation atomically persists the next validated counter before output |
| Sheet lookup latency grows | Admin/session population is small; correctness first; retention/indexing deferred with measurement |
| Cache-based throttle eviction | Cache never grants authorization; strong password/KDF/generic errors remain; persistent attempt storage can be separately approved if abuse appears |
| Logout network failure leaves server token valid | Retry once, clear local token, warn operator, absolute eight-hour expiry, server revocation on normal path |
| XSS steals bearer token | No `innerHTML` with user data, strict output escaping, minimal token lifetime/storage, future CSP hardening; XSS prevention remains critical |
| Copied shell markup drifts | One `admin-shell.js` navigation definition and static-contract tests |
| Open redirect | Same-origin Admin-directory parsing plus exact page allowlist |
| Auth schema edited incorrectly | Non-destructive schema helper, required unique-header-set validation, order-independent access, and operator verification before bootstrap |
| Accidental credential in tests/source | No default credential, synthetic fixtures, source scans, bootstrap only through temporary Script Properties |
| Deployment mismatch | Backend first, validation smoke test, then matching frontend publish and rollback path |

## 28. Acceptance criteria

Milestone 6 is acceptable when all of the following are demonstrated after implementation:

1. `adminLogin`, `adminValidateSession`, and `adminLogout` use the standard JSON envelope and POST body only.
2. Login identifier is canonical username; email is not silently accepted.
3. Every active account uses PBKDF2-HMAC-SHA256, unique 16-byte salt, stored explicit count, and 32-byte hash.
4. `ADMIN_PBKDF2_ITERATIONS_` is exactly 120,000 and passes correctness/performance gates in Apps Script V8.
5. `benchmarkAdminPbkdf2()` uses fixed non-secret PBKDF2 material only and has no dependency on the production random key, counter/state, Sheets, bootstrap input, or credentials.
6. The human supplies only `ADMIN_AUTH_RANDOM_KEY`; reviewed setup initializes counter zero/state version 1 only for first-time empty auth state, validates established non-negative safe-integer state, and never silently resets malformed/missing established state.
7. Every salt/token derivation runs under the script lock, persists the incremented counter before output, fails closed on persistence/format/ceiling errors, and never rolls the counter back.
8. Runtime plaintext passwords and crypto internals never enter Sheets, responses, browser storage, or logs; no production credential enters source or fixtures, and synthetic test secrets remain isolated to VM memory.
9. Raw session tokens are 32 unpredictable bytes and exist only in the successful response/browser session; Sheets store SHA-256 hashes only.
10. Human-entered free text is formula-safe, while server-generated/enum/numeric/timestamp/crypto fields are strictly validated and written unchanged; valid base64url values beginning with `-` round-trip exactly.
11. Required Admin/session headers are present exactly once, access is order-independent, and setup never reorders or destructively rewrites a populated `admins` Sheet.
12. Successful login updates Admin timestamps before generating/appending the session; the complete valid session row is the final security-state write, and no earlier failure leaves a newly usable session or returns a token.
13. `admin_sessions` is authoritative on every protected request; CacheService cannot authenticate.
14. Revoked, expired, malformed, duplicate, unknown, or inactive-linked sessions fail with `UNAUTHORIZED`.
15. Expiry is exactly eight hours absolute; no request or `last_seen_at` extends it.
16. Logout revokes server state; repeated logout is safe/idempotent; client clears session even on failure and reports unconfirmed revocation.
17. Only `sessionStorage` key `TAKHUN_ADMIN_SESSION` holds the browser session; malformed/expired data fails closed.
18. Protected content never flashes before successful server validation.
19. Return paths cannot redirect outside the exact Admin page allowlist.
20. Login and shared desktop/mobile shell meet keyboard, focus, ARIA, touch-target, and responsive contracts.
21. Bootstrap is editor-only, manually enabled, refuses an existing active Admin, hashes internally, and removes temporary material after success.
22. No public registration, default account, Dashboard metric, CRUD action, or production operation is introduced.
23. Focused tests, `npm test`, `npm run build`, JavaScript syntax checks, and `git diff --check` pass.
24. Existing public application behavior and TH/EN support remain unchanged.

## 29. Proposed implementation-task decomposition

1. **Crypto primitives (test-first):** add independent PBKDF2/SHA/HMAC/base64url/constant-time/random-derivation tests, then `CryptoService.gs`; run local vectors and syntax checks.
2. **Header-safe Sheet operations (test-first):** extend `SheetService.gs` with required-unique-header-set checks, order-independent find/append/update helpers, and field-aware writes that formula-escape human free text but preserve validated crypto/enums/numbers/timestamps byte-for-byte; do not change existing reads/review writes.
3. **Auth data/schema documentation:** update `DATA_SCHEMA.md` with required unique `admins`/`admin_sessions` fields, order-independent access, non-destructive migration, and UTC rules; add static schema assertions.
4. **Authentication service (test-first):** implement account parsing, generic login failure, rate limiting, token issuance/hash storage, eight-hour session validation, logout revocation, and safe projections in `AuthService.gs`.
5. **Setup, counter state, bootstrap, and benchmark (test-first):** implement editor-only non-destructive schema/config setup with first-time counter/state initialization, locked increment-before-derive behavior, an independently isolated fixed-vector PBKDF2 benchmark, temporary-property workflow, fail-closed/idempotent bootstrap, and cleanup tests.
6. **Router integration (test-first):** refactor one-time POST parsing, add only three Admin actions, preserve `submitReview`, and strengthen safe-error/static tests.
7. **Admin transport (test-first):** create `admin-api.js` with strict POST/envelope/timeout behavior and no URL tokens.
8. **Browser authentication (test-first):** create `admin-auth.js` with exact storage schema, login states, server guard, safe return parser, no-flash state, and logout retry/cleanup.
9. **Shared shell (test-first):** create `admin-shell.js`, update protected HTML mounts/data attributes, expand `admin.css`, and verify responsive/accessibility contracts without Dashboard/CRUD content.
10. **Login page integration (test-first):** enable the existing form, add accessible state regions/scripts, handle authenticated-login redirect, and preserve Thai copy.
11. **Regression/document synchronization:** update API/Admin/development/testing docs and the root test runner, then run focused tests, full test/build, syntax checks, secret/placeholder scans, and `git diff --check`.
12. **Human gates after implementation:** reviewed backend install → manually supply permanent random key only → run reviewed auth setup/config validation (counter/state plus schemas) → PBKDF2 benchmark → temporary bootstrap properties → one-time bootstrap → Admin/cleanup verification → backend deploy → frontend deploy → manual QA. No Admin/bootstrap credential is entered before the benchmark passes, and no human manages the counter.

Each implementation task should be independently reviewable and use failing-test → minimal implementation → passing-test discipline. Production operations remain outside the implementation agent's authority.

## 30. Unresolved issue requiring human approval

No unresolved security-design decision remains: the hashing algorithm/count, session source of truth, storage medium/key, absolute lifetime, bootstrap model, username identifier, module boundaries, and error behavior are explicit.

Two environmental facts require later verification rather than a design choice now:

1. The actual Apps Script V8 runtime must pass the 120,000-round benchmark thresholds before provisioning. Failure requires a new security review; it does not authorize silently lowering the count.
2. The repository does not contain the external Apps Script sync/deployment or Cloudflare Pages workflow. The operator must use the established project process and confirm it before the deployment steps; authentication design does not depend on choosing a new deployment tool.

Neither fact asks the operator to act during this design task.
