# Admin Foundation and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the secure shared Admin shell, PBKDF2 login, server-side session validation/revocation, protected-page guard, and editor-only first-admin bootstrap required by later Admin milestones.

**Architecture:** Google Apps Script owns credentials, authentication, random-state progression, and an authoritative `admin_sessions` table; the static Admin frontend stores only a short session projection in `sessionStorage` and revalidates it with the backend before revealing protected content. Header-name-based Sheet access, generic public errors, lock-protected writes, and editor-only setup/bootstrap functions keep security state explicit without changing existing public behavior.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Google Apps Script V8, Google Sheets, Script Properties, Node VM tests, PowerShell test runner.

## Global Constraints

- Use PBKDF2-HMAC-SHA256 with `ADMIN_PBKDF2_ITERATIONS_ = 120000`, exact UTF-8 input bytes, a fresh 16-byte per-user salt, and a 32-byte derived key. Do not normalize usernames' passwords or password text.
- Encode security bytes as unpadded base64url: salts are 22 characters, password hashes are 43 characters, and stored iteration counts must be safe integers from 100000 through 1000000.
- Require `password_algorithm=pbkdf2_sha256`; roles are exactly `super_admin`, `editor`, `reviewer`, or `viewer`; statuses are exactly `active`, `inactive`, or `deleted`; and all auth timestamps use strict canonical RFC 3339 UTC with round-trip validation.
- Generate a 32-byte opaque raw session token and return it only to the authenticated browser. Store only its 43-character unpadded base64url SHA-256 hash in `admin_sessions`.
- Treat `admin_sessions` as authoritative on every protected request. A valid session must have one well-formed, unrevoked, unexpired row linked to one active Admin account.
- Sessions expire at the immutable `created_at + 28,800,000` milliseconds (8 hours). `last_seen_at` equals `created_at` at issuance and is not changed in Milestone 6; neither validation nor any request slides or renews expiry, and the exact expiry instant is invalid.
- Store browser auth in `sessionStorage` only, under `TAKHUN_ADMIN_SESSION`, with exactly `admin_id`, `display_name`, `role`, `token`, and `expires_at`.
- Accept username login only. After trim/lowercase, it must be 3–64 ASCII characters matching `^[a-z0-9][a-z0-9._-]{2,63}$`; email is never a login identifier. Password login input is at most 128 code points and 256 UTF-8 bytes with no Unicode normalization.
- Return generic `UNAUTHORIZED` for wrong passwords, unknown users, inactive/deleted users, malformed credentials, duplicate usernames, and other credential failures. Do not reveal account existence or internal error detail.
- Provide no public registration, no default credentials, and no Router route for provisioning. `bootstrapFirstAdmin()` is editor-only and may create only the first active `super_admin` after all gates pass.
- The operator supplies only the permanent `ADMIN_AUTH_RANDOM_KEY`, exactly 32 bytes encoded as 43-character unpadded base64url. Code exclusively owns `ADMIN_AUTH_RANDOM_COUNTER` and `ADMIN_AUTH_STATE_VERSION`; established malformed or partial state must fail closed and must never be silently reset.
- Advance and persist the counter under the same script lock before deriving domain-separated HMAC random output. Skipped counter values after later failures are acceptable; reused values are not.
- Never log, commit, echo, or persist raw passwords, raw session tokens, the random key, or temporary bootstrap secrets. Error objects and responses contain safe categories only.
- Preserve the login critical section exactly: acquire script lock; reread and validate active Admin plus unchanged credential metadata; update login timestamps; generate the token through locked counter state; append the complete session row as the final security-state write; return the token only after append succeeds; release the lock in `finally`.
- Formula-escape only human-controlled free text. Strictly validated, server-generated security fields are written unchanged, including valid base64url values beginning with `-`.
- `benchmarkAdminPbkdf2()` uses fixed non-secret vectors only and must not read random-state properties, Sheets, bootstrap properties, or credentials. Local Node timing does not establish Apps Script suitability.
- Public frontend behavior and existing public GET/API contracts must remain unchanged. Admin tokens are accepted only in POST bodies, never in GET parameters or URLs.
- Tasks 1–11 are local repository work only. They must not touch Apps Script environments, Sheets, Script Properties, credentials, deployments, pushes, pull requests, or any other external system.

## File Responsibility Map

| File | Change | Single responsibility |
|---|---|---|
| `apps-script/CryptoService.gs` | Create | UTF-8, hashes, HMAC, PBKDF2, base64url, constant-time comparison, token hashing, and lock-scoped domain-separated random bytes. |
| `apps-script/AuthService.gs` | Create | Login, authoritative session validation/revocation, rate limiting, setup, benchmark, and editor-only first-admin bootstrap. |
| `apps-script/SheetService.gs` | Modify | Add header-name-based reads/writes and explicit human-text versus security-field write policies while preserving review helpers. |
| `apps-script/Config.gs` | Modify | Declare fixed auth constants and property/header names without secrets or environment values. |
| `apps-script/Router.gs` | Modify | Add only the three Admin auth POST actions while retaining `submitReview` and all current public GET dispatch. |
| `public/admin/js/admin-api.js` | Create | Twelve-second, POST-only JSON-envelope transport for Admin authentication. |
| `public/admin/js/admin-auth.js` | Create | Exact session projection parsing, login/logout helpers, protected-page validation, and safe return paths. |
| `public/admin/js/admin-shell.js` | Create | Shared responsive shell, navigation state, identity rendering, drawer accessibility, and logout wiring. |
| `public/admin/login.html` | Modify | Thai username/password login UI and existing-session redirect behavior. |
| `public/admin/dashboard.html` | Modify | Adopt the protected shared shell without metrics or CRUD controls. |
| `public/admin/places.html` | Modify | Adopt the protected shared shell only. |
| `public/admin/routes.html` | Modify | Adopt the protected shared shell only. |
| `public/admin/products.html` | Modify | Adopt the protected shared shell only. |
| `public/admin/events.html` | Modify | Adopt the protected shared shell only. |
| `public/admin/reviews.html` | Modify | Adopt the protected shared shell only. |
| `public/admin/gallery.html` | Modify | Adopt the protected shared shell only. |
| `public/admin/settings.html` | Modify | Adopt the protected shared shell only. |
| `public/admin/404.html` | Modify | Adopt the guard and shared shell conventions for unknown Admin routes. |
| `public/css/admin.css` | Modify | Login and shared Admin shell layout, responsive drawer, focus, touch-target, and reduced-motion styles. |
| `scripts/test-crypto-service.js` | Create | Node/VM vectors and source-safety tests for cryptographic primitives. |
| `scripts/test-sheet-service.js` | Create | Isolated header-order and security-field round-trip tests; this small extra harness keeps Sheet changes independently reviewable. |
| `scripts/test-admin-schema.js` | Create | Static data/API/docs contract checks; this extra harness gives the documentation-first schema task an executable RED/GREEN cycle. |
| `scripts/test-auth-service.js` | Create | Node/VM fakes and failure injection for auth, sessions, state, setup, bootstrap, benchmark, locks, and logs. |
| `scripts/test-admin-api.js` | Create | DOM/fetch transport contract tests. |
| `scripts/test-admin-auth.js` | Create | Storage, guards, return parsing, login, logout, and fail-closed browser tests. |
| `scripts/test-admin-shell.js` | Create | Shell rendering, navigation, drawer keyboard/focus, accessibility, and logout tests. |
| `scripts/test-apps-script.js` | Modify | Load new Apps Script files and assert Router/public regressions. |
| `scripts/test-review-service.js` | Modify only if needed | Preserve human-text formula escaping regressions while security writes remain unchanged. |
| `scripts/test.ps1` | Modify | Add every new focused suite to the repository test runner. |
| `docs/DATA_SCHEMA.md` | Modify | Canonical Admin and `admin_sessions` headers, constraints, and ownership. |
| `docs/API_SPEC.md` | Modify | Exact Admin POST requests, safe projections, envelopes, and error codes. |
| `docs/ADMIN_CMS_SPEC.md` | Modify | Admin login/session/shell behavior and explicit non-goals. |
| `docs/DEVELOPMENT_RULES.md` | Modify | Security invariants, secret handling, setup/bootstrap restrictions, and write-order rules. |
| `docs/TESTING_CHECKLIST.md` | Modify | Automated checks and future manual gates, including bootstrap failure recovery. |

No other production, test, documentation, configuration, generated, or lock file belongs in this milestone. The two additional focused test files above follow the repository's existing standalone `scripts/test-*.js` Node/VM convention and prevent unrelated responsibilities from accumulating in the current broad Apps Script test.

## Fixed Interface Catalog

- `CryptoService.gs` provides `ADMIN_PBKDF2_ITERATIONS_`, `CryptoService_utf8Bytes_`, `CryptoService_sha256_`, `CryptoService_hmacSha256_`, `CryptoService_pbkdf2Sha256_`, `CryptoService_base64UrlEncode_`, `CryptoService_base64UrlDecode_`, `CryptoService_constantTimeEqual_`, `CryptoService_hashToken_`, and `CryptoService_randomBytesLocked_`.
- `SheetService.gs` preserves `readSheetObjects_` and `appendSheetObject_`, and adds `SheetService_readTable_`, `SheetService_assertUniqueHeaders_`, `SheetService_updateObjectAtRow_`, `SheetService_ensureHeaders_`, `SheetService_escapeHumanText_`, and `SheetService_writeValue_`.
- `AuthService.gs` provides Router-facing `adminLogin_`, `adminValidateSession_`, and `adminLogout_`; protected services consume `AuthService_requireAdmin_`; editor-only entry points are `setupAdminAuthSchema`, `benchmarkAdminPbkdf2`, and `bootstrapFirstAdmin`.
- `admin-api.js` exposes `window.TakhunAdminApi`; `admin-auth.js` consumes it and exposes `window.TakhunAdminAuth`; `admin-shell.js` consumes auth and exposes `window.TakhunAdminShell`.
- Router accepts POST actions `submitReview`, `adminLogin`, `adminValidateSession`, and `adminLogout` only. Existing public GET actions remain unchanged.

## Acceptance-Criteria Coverage

| Design area | Primary task(s) |
|---|---|
| Cryptographic formats, vectors, comparison, random derivation | 1, 5 |
| Header safety, formula policy, schemas | 2, 3 |
| Login, critical write order, sessions, rate limiting | 4 |
| Random state, setup, benchmark, bootstrap | 5, 12 |
| Router and public compatibility | 6, 11 |
| Admin transport and browser session lifecycle | 7, 8, 10 |
| Responsive accessible shell | 9 |
| Documentation, automated regression, scope/secret inspection | 11 |
| Real Apps Script timing, provisioning, deployment, staging QA | 12 (future human operations only) |

## Task 1: Crypto primitives

**Files:**
- Create: `apps-script/CryptoService.gs`
- Create: `scripts/test-crypto-service.js`
- Modify: `scripts/test.ps1`

**Interfaces:** Produces the `CryptoService_*_` functions in the fixed catalog. It consumes only Apps Script byte/utility primitives and Script Properties plus a caller-held script lock for `CryptoService_randomBytesLocked_`; it does not access Sheets, Router, bootstrap properties, or UI code.

- [ ] Write `scripts/test-crypto-service.js` first. Load the `.gs` file in a Node VM with deterministic Apps Script stubs and assert exact UTF-8 bytes for ASCII, Thai, emoji, and malformed-surrogate policy; SHA-256 and HMAC-SHA256 RFC/independent vectors; PBKDF2-HMAC-SHA256 independent vectors and a `node:crypto` cross-check; base64url padded/unpadded decoding and round trips; 16-byte salt and 32-byte key contracts; 22/43-character encodings; equal/unequal constant-time comparison; and malformed-input rejection.
- [ ] Add deterministic random-state tests proving the derivation input contains an explicit version/purpose/counter domain separator, the output is 32 bytes, counter persistence occurs before derivation, persistence failure yields no bytes, distinct counters/purposes differ, unsafe counters fail, and a caller-held lock is required.
- [ ] Add static source assertions rejecting `Math.random`, dynamic evaluation, raw-secret logging, and any direct random-key return. Stub logging methods to throw if invoked with sentinel passwords, tokens, or keys.
- [ ] Add the focused suite to `scripts/test.ps1`.
- [ ] Run RED:

```powershell
node scripts/test-crypto-service.js
```

Expected: failure because `apps-script/CryptoService.gs` and its interfaces do not exist.

- [ ] Implement the minimum pure helpers and `ADMIN_PBKDF2_ITERATIONS_ = 120000`. Require exact byte lengths, strict unpadded base64url output, bounded stored iterations, explicit UTF-8 behavior, and length-independent loop work for equal-length comparisons.
- [ ] Implement `CryptoService_randomBytesLocked_` against the permanent `ADMIN_AUTH_RANDOM_KEY` and code-owned state. Validate the caller's lock/state preconditions, persist `counter + 1` first, then derive domain-separated HMAC-SHA256 over purpose, the incremented counter, two UUIDs, and current milliseconds; take 16 bytes for a salt or all 32 for a token. Never reset state or expose key material, and never use the random key as the session lookup hash key.
- [ ] Run GREEN and focused regression:

```powershell
node scripts/test-crypto-service.js
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

Expected: crypto tests pass; existing public and review tests remain green. Do not interpret Node timing as an Apps Script performance result.

- [ ] Inspect only intended changes and whitespace:

```powershell
git diff -- apps-script/CryptoService.gs scripts/test-crypto-service.js scripts/test.ps1
git diff --name-only
git diff --check
```

- [ ] Commit the independently reviewable slice:

```powershell
git add apps-script/CryptoService.gs scripts/test-crypto-service.js scripts/test.ps1
git commit -m "feat: add admin cryptographic primitives"
```

## Task 2: Header-safe Sheet auth helpers

**Files:**
- Modify: `apps-script/SheetService.gs`
- Create: `scripts/test-sheet-service.js`
- Modify: `scripts/test-review-service.js` only if the existing escaping assertion must call the newly separated human-text policy
- Modify: `scripts/test.ps1`

**Interfaces:** Produces the fixed `SheetService_*_` helpers for Tasks 4–5 while preserving `readSheetObjects_` and `appendSheetObject_` for existing public/review consumers. Security callers explicitly select validated unchanged writes; review/human prose callers explicitly select formula-escaped writes.

- [ ] Write tests for shuffled headers, sparse rows, missing headers, duplicate headers, case-sensitive exact header names, non-destructive header append, row-number tracking, and updates by header name rather than column position.
- [ ] Test write policies separately: human-controlled values beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe, while strict security values are validated and written byte-for-byte. Include a valid 43-character base64url token hash beginning with `-` and prove it round-trips unchanged.
- [ ] Retain the current public/review read/append behavior with its formula-injection regression.
- [ ] Run RED:

```powershell
node scripts/test-sheet-service.js
```

Expected: failure because the header-safe interfaces are absent.

- [ ] Implement unique-header parsing, table projections carrying source row numbers, safe missing-header append rules, and header-name updates. Never reorder populated Admin columns or rows.
- [ ] Implement `SheetService_writeValue_` with explicit `human_text` and `security` policies. The security path accepts only a field-specific validated value and performs no formula escaping or implicit coercion.
- [ ] Run GREEN and relevant regressions:

```powershell
node scripts/test-sheet-service.js
node scripts/test-review-service.js
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

- [ ] Inspect and commit:

```powershell
git diff -- apps-script/SheetService.gs scripts/test-sheet-service.js scripts/test-review-service.js scripts/test.ps1
git diff --name-only
git diff --check
git add apps-script/SheetService.gs scripts/test-sheet-service.js scripts/test-review-service.js scripts/test.ps1
git commit -m "feat: add header-safe auth sheet helpers"
```

## Task 3: Auth schema and API contracts

**Files:**
- Modify: `apps-script/Config.gs`
- Modify: `docs/DATA_SCHEMA.md`
- Modify: `docs/API_SPEC.md`
- Create: `scripts/test-admin-schema.js`
- Modify: `scripts/test.ps1`

**Interfaces:** Produces fixed sheet names, exact headers, role/status values, limits, durations, property names, and POST request/response contracts consumed by Tasks 4–8. It introduces no credential, deployment value, or external state.

- [ ] Write static contract tests that load `Config.gs` and parse both documents. Assert `admins` headers exactly `admin_id`, `username`, `display_name`, `email`, `password_algorithm`, `password_hash`, `password_salt`, `password_iterations`, `role`, `status`, `last_login_at`, `created_at`, `updated_at`; `admin_sessions` headers exactly `session_id`, `admin_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at`, `last_seen_at`; 8-hour absolute lifetime; `120000`; property ownership; username-only login; safe Admin/session projections; POST-only token handling; and generic `UNAUTHORIZED` semantics.
- [ ] Assert the schema documents reject raw token/password storage, email login, public registration, default credentials, sliding expiry, and credential entry before the benchmark gate.
- [ ] Run RED:

```powershell
node scripts/test-admin-schema.js
```

Expected: failure because auth constants and contracts are not documented.

- [ ] Add secret-free constants to `Config.gs`, using repository naming conventions. Document order-independent Admin headers, uniqueness and status constraints, authoritative sessions, stored-field formats, property ownership, and the three Admin API envelopes without inventing implementation behavior beyond the approved design.
- [ ] Run GREEN and config/docs regression:

```powershell
node scripts/test-admin-schema.js
node scripts/test-apps-script.js
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

- [ ] Inspect and commit:

```powershell
git diff -- apps-script/Config.gs docs/DATA_SCHEMA.md docs/API_SPEC.md scripts/test-admin-schema.js scripts/test.ps1
git diff --name-only
git diff --check
git add apps-script/Config.gs docs/DATA_SCHEMA.md docs/API_SPEC.md scripts/test-admin-schema.js scripts/test.ps1
git commit -m "docs: define admin auth data contracts"
```

## Task 4: Authentication and authoritative session service

**Files:**
- Create: `apps-script/AuthService.gs`
- Create: `scripts/test-auth-service.js`
- Modify: `scripts/test.ps1`

**Interfaces:** Produces `adminLogin_`, `adminValidateSession_`, `adminLogout_`, and `AuthService_requireAdmin_`. It consumes Crypto, Config, header-safe Sheet helpers, Cache/Properties rate-limit state, and `LockService`; it does not expose editor-only setup/bootstrap functions through Router.

- [ ] Build reusable Node/VM fakes for Sheets, script lock, clock, Cache/Properties, crypto calls, and logging. Make the fake preserve rows by exact headers and allow each write to fail independently.
- [ ] Write RED tests for canonical valid username plus correct password; wrong password; unknown username; inactive/deleted Admin; malformed salt/hash/iterations; duplicate canonical username; input type/length ceilings; and exact generic `UNAUTHORIZED` equivalence. Assert both real and dummy credential paths invoke one 120000-round PBKDF2 call and do not reveal which path ran.
- [ ] Test the safe live Admin projection contains exactly `admin_id`, `username`, `display_name`, and `role`; the login response adds only raw `token` and `expires_at`. Assert the browser storage mapper deliberately omits `username`, the raw token never appears in Sheet cells, logs, thrown messages, or error envelopes, and only `CryptoService_hashToken_` output reaches `token_hash`.
- [ ] Test successful issuance creates one complete session with unique `session_id`, exact Admin linkage, `created_at`, `expires_at = created_at + 28,800,000`, empty `revoked_at`, and initial `last_seen_at`, then returns only after append success.
- [ ] Encode the critical section as an event-order assertion: lock acquired; Admin reread and active/unique checks; unchanged password salt/hash/iterations compared with the pre-lock snapshot; `last_login_at` and `updated_at` updated; locked counter persisted; token derived; full session appended as the final security-state write; response formed; lock released in `finally`.
- [ ] Inject failure at timestamp update, counter persistence, token generation, and session append. For every failure assert no raw token is returned and no newly usable session exists. For counter persistence failure assert no derivation; for token or append failure accept the persisted skipped counter; for append failure assert no partial row.
- [ ] Test lock timeout/failure, Admin changes between precheck and locked reread, and every exception path. Assert safe errors and `finally` lock release.
- [ ] Write validation tests for a correct token; malformed token before Sheet access; missing, duplicate, revoked, and expired session rows; malformed session fields; inactive/deleted/missing/duplicate linked Admin; and mismatched linkage. Assert the authoritative Sheet source is consulted on every protected request, only the safe projection is returned, `expires_at` is immutable, and `last_seen_at` remains equal to issuance time and unchanged.
- [ ] Write logout tests for first revocation, repeated logout idempotence, malformed/unknown token, duplicate session rows, and write failure. A successful logout leaves the stored token hash intact and sets only revocation metadata.
- [ ] Write deterministic rate-limit tests for the SHA-256 canonical-username bucket (maximum 5 failures in 15 minutes) and global bucket (maximum 100 failures in 10 minutes), boundary timing, lock-protected counter updates, identifier clearing after success, global retention after success, cache eviction, and cache failure. Assert rejected/unknown/inactive users count identically, limit rejection returns `RATE_LIMITED` before PBKDF2, cache failure permits normal credential verification but never authentication by itself, and no bucket stores passwords, raw tokens, or requester IP.
- [ ] Run RED:

```powershell
node scripts/test-auth-service.js
```

Expected: failure because `AuthService.gs` is absent.

- [ ] Implement bounded request parsing, username canonicalization, uniform real/dummy verification, safe projections, and rate limiting. Keep internal diagnostics category-only and never interpolate user input or security fields.
- [ ] Implement login with the exact tested lock/write order. Build the complete session row in memory before its single append and do not perform another security-state write after it.
- [ ] Implement hash-based authoritative validation, immutable expiry with unchanged `last_seen_at`, linked-account revalidation, and idempotent revocation. Make `AuthService_requireAdmin_` the only protected-service entry point.
- [ ] Run GREEN and backend regressions:

```powershell
node scripts/test-auth-service.js
node scripts/test-crypto-service.js
node scripts/test-sheet-service.js
node scripts/test-review-service.js
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

- [ ] Inspect and commit:

```powershell
git diff -- apps-script/AuthService.gs scripts/test-auth-service.js scripts/test.ps1
git diff --name-only
git diff --check
git add apps-script/AuthService.gs scripts/test-auth-service.js scripts/test.ps1
git commit -m "feat: add admin authentication sessions"
```

## Task 5: Setup, random state, benchmark, and first-admin bootstrap

**Files:**
- Modify: `apps-script/AuthService.gs`
- Modify: `scripts/test-auth-service.js`
- Modify: `docs/DEVELOPMENT_RULES.md`

**Interfaces:** Produces the editor-only functions `setupAdminAuthSchema()`, `benchmarkAdminPbkdf2()`, and `bootstrapFirstAdmin()`. They are callable only by a human editor in Apps Script and are never consumed by Router or public frontend code.

- [ ] Add RED state tests: genuinely empty auth data plus both state properties absent initializes counter `0` and version `1`; a valid existing pair is preserved; a missing half, malformed/negative/non-integer counter, counter at or above `Number.MAX_SAFE_INTEGER`, wrong version, or existing Admin/session data without state fails closed. Assert setup never resets established malformed state.
- [ ] Test setup under the script lock: random key is required and format-validated without being printed; state is initialized/validated; `admin_sessions` is created or checked non-destructively; missing Admin auth headers are appended only where safe; populated Admin rows/columns are never reordered; no credential fields or Admin rows are created.
- [ ] Add a concurrency/event test proving state increment is atomic and persisted before random derivation. Inject persistence failure and later login failure; assert no output on persistence failure and permitted skipped counters after later failure.
- [ ] Add benchmark isolation tests with getters for `ADMIN_AUTH_RANDOM_KEY`, `ADMIN_AUTH_RANDOM_COUNTER`, `ADMIN_AUTH_STATE_VERSION`, Sheets, bootstrap properties, and credential services that throw if read. Assert one warm-up plus five correct measured 120000-round fixed non-secret derivations, result fields for each measured duration/median/max/correctness/`passed`, and thresholds median at most 3000 ms and max at most 5000 ms.
- [ ] Assert the benchmark neither accepts nor silently chooses a lower iteration count. Keep performance assertions deterministic by injecting measured durations; do not claim local Node timing proves Apps Script suitability.
- [ ] Add bootstrap RED tests: enabled must be exactly string `true`; auth state must already be valid; no active Admin may exist; no duplicate canonical username may exist in any status; temporary username/display/email/password properties must satisfy exact constraints; and all validation happens before row creation.
- [ ] Test bootstrap generates a fresh salt and PBKDF2 hash internally, appends one active `super_admin`, never writes plaintext, rereads and verifies the source-of-truth row, then removes `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, `ADMIN_BOOTSTRAP_EMAIL`, and `ADMIN_BOOTSTRAP_PASSWORD` and finally sets `ADMIN_BOOTSTRAP_ENABLED=false`. The return contains only Admin ID, username, and cleanup status.
- [ ] Inject append failure, reread mismatch, individual cleanup failure, and enabled-disable failure. Assert safe failure categories, no secret output/logging, and no automatic retry. Cleanup must be best-effort without claiming success when verification is incomplete.
- [ ] Add static assertions proving none of the three editor functions is Router-dispatched and no default username/password/key exists in source or tests.
- [ ] Run RED:

```powershell
node scripts/test-auth-service.js
```

Expected: newly added setup, benchmark, and bootstrap cases fail.

- [ ] Implement `setupAdminAuthSchema()` exactly as tested, reusing Crypto and Sheet validation. It may initialize counter/version only when both are absent and all auth state is genuinely empty.
- [ ] Implement `benchmarkAdminPbkdf2()` as an isolated fixed-vector operation. It must perform five measured real derivations and report correctness plus thresholds without touching any secret or persistent source.
- [ ] Implement `bootstrapFirstAdmin()` as an editor-only one-shot function with post-append source-of-truth verification and explicit cleanup verification. Never make it reachable from `doGet`, `doPost`, or another remotely dispatched action.
- [ ] Add the permanent state-ownership, benchmark-before-credentials, setup, bootstrap, and failure-handling rules to `docs/DEVELOPMENT_RULES.md`.
- [ ] Run GREEN and backend regressions:

```powershell
node scripts/test-auth-service.js
node scripts/test-crypto-service.js
node scripts/test-sheet-service.js
node scripts/test-admin-schema.js
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

- [ ] Inspect and commit:

```powershell
git diff -- apps-script/AuthService.gs scripts/test-auth-service.js docs/DEVELOPMENT_RULES.md
git diff --name-only
git diff --check
git add apps-script/AuthService.gs scripts/test-auth-service.js docs/DEVELOPMENT_RULES.md
git commit -m "feat: add admin auth setup and bootstrap"
```

## Task 6: Router integration

**Files:**
- Modify: `apps-script/Router.gs`
- Modify: `scripts/test-apps-script.js`
- Modify: `scripts/test.ps1` only if ordering needs adjustment

**Interfaces:** Consumes `adminLogin_`, `adminValidateSession_`, and `adminLogout_`. Produces strict JSON-envelope POST dispatch for them beside existing `submitReview`; it preserves every approved public GET action and exposes no setup/bootstrap/benchmark action.

- [ ] Extend Router tests first. Assert POST accepts exactly `submitReview`, `adminLogin`, `adminValidateSession`, and `adminLogout`; unknown/missing actions fail safely; body parse errors use the envelope; and each action passes only its bounded body to the matching service.
- [ ] Assert every Admin action is rejected through GET and query parameters, tokens never enter URL handling, and `setupAdminAuthSchema`, `benchmarkAdminPbkdf2`, and `bootstrapFirstAdmin` cannot be resolved by any Router path.
- [ ] Snapshot current public GET dispatch and `submitReview` behavior to prove they remain unchanged.
- [ ] Run RED:

```powershell
node scripts/test-apps-script.js
```

Expected: Admin POST actions are not dispatched.

- [ ] Add only the three Admin POST branches, preserving the existing response wrapper, public GET routes, review path, and CORS/content conventions. Do not accept auth tokens from query parameters or GET payloads.
- [ ] Run GREEN and backend regression:

```powershell
node scripts/test-apps-script.js
node scripts/test-auth-service.js
node scripts/test-review-service.js
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

- [ ] Inspect and commit:

```powershell
git diff -- apps-script/Router.gs scripts/test-apps-script.js scripts/test.ps1
git diff --name-only
git diff --check
git add apps-script/Router.gs scripts/test-apps-script.js scripts/test.ps1
git commit -m "feat: route admin authentication actions"
```

## Task 7: Admin API transport

**Files:**
- Create: `public/admin/js/admin-api.js`
- Create: `scripts/test-admin-api.js`
- Modify: `scripts/test.ps1`

**Interfaces:** Produces `window.TakhunAdminApi.login`, `.validateSession`, and `.logout`. It consumes the configured Apps Script endpoint and returns normalized success values or safe error objects to `TakhunAdminAuth`.

- [ ] Build fake fetch/timer tests following `public/js/api.js` conventions. Assert a 12-second abort timeout, POST only, `Content-Type: text/plain;charset=utf-8`, exact login body `{action:"adminLogin",payload:{username,password}}`, exact validation/logout bodies `{action,token}`, and no token in endpoint/query/hash/referrer-visible URL.
- [ ] Test strict envelopes: HTTP failures, timeout, network failure, non-JSON, wrong top-level types, `ok:true` missing required data, and `ok:false` malformed error all normalize safely. Allow only documented auth codes and map credential failures to `UNAUTHORIZED`.
- [ ] Assert thrown error names/messages contain no password, raw token, request body, endpoint query data, or server internals.
- [ ] Run RED:

```powershell
node scripts/test-admin-api.js
```

Expected: failure because `admin-api.js` is absent.

- [ ] Implement a strict-mode IIFE consistent with the existing public client. Reuse its endpoint/timeout conventions without changing `public/js/api.js`; expose only the three auth calls and safe normalized errors.
- [ ] Run GREEN and public API regression:

```powershell
node scripts/test-admin-api.js
npm test
```

- [ ] Inspect and commit:

```powershell
git diff -- public/admin/js/admin-api.js scripts/test-admin-api.js scripts/test.ps1
git diff --name-only
git diff --check
git add public/admin/js/admin-api.js scripts/test-admin-api.js scripts/test.ps1
git commit -m "feat: add admin API client"
```

## Task 8: Browser authentication and protected-page guard

**Files:**
- Create: `public/admin/js/admin-auth.js`
- Create: `scripts/test-admin-auth.js`
- Modify: `scripts/test.ps1`

**Interfaces:** Produces `window.TakhunAdminAuth` session read/write/clear, `login`, `validateCurrentSession`, `guardProtectedPage`, `redirectAuthenticatedLogin`, `logout`, and safe-return helpers. It consumes `TakhunAdminApi` and browser location/storage primitives.

- [ ] Write storage tests for key `TAKHUN_ADMIN_SESSION` in `sessionStorage` only. Accept exactly `admin_id`, `display_name`, `role`, `token`, and `expires_at` with correct types/formats; reject nulls, arrays, malformed JSON, missing or extra fields, malformed tokens/roles/timestamps, and expired sessions; remove invalid state.
- [ ] Replace `sessionStorage` with throwing/unavailable fakes and assert fail-closed behavior. Add static checks forbidding `localStorage`, cookies, IndexedDB, URL tokens, and console logging of session material.
- [ ] Test a safe return parser against `window.location.href`: require identical origin/current Admin directory and return only filename/query/hash from the exact basename allowlist `dashboard.html`, `places.html`, `routes.html`, `products.html`, `events.html`, `reviews.html`, `gallery.html`, `settings.html`, and `404.html`. Reject credentials, schemes, protocol-relative values, backslashes, encoded bypasses, control characters, login loops, and outside paths; fall back to `dashboard.html`.
- [ ] Test protected-page startup keeps the document in its predeclared hidden/guarding state until server validation succeeds. Missing/local-invalid/server-invalid sessions clear storage and redirect to login; timeout/network/malformed responses leave protected content hidden and show a safe retry state.
- [ ] Test login-page startup validates an existing local session with the server before redirecting. An invalid session is cleared and the login form becomes available; a network error does not assume authentication.
- [ ] Test logout calls server revocation, retries once only for a transient transport failure, and clears local storage in `finally`. When revocation is unconfirmed, return a warning state without exposing token/error detail.
- [ ] Run RED:

```powershell
node scripts/test-admin-auth.js
```

Expected: failure because `admin-auth.js` is absent.

- [ ] Implement exact projection validation, fail-closed storage wrappers, the safe return parser, protected/login guards, and logout cleanup. Do not reveal protected DOM content before an authoritative success.
- [ ] Run GREEN and transport regressions:

```powershell
node scripts/test-admin-auth.js
node scripts/test-admin-api.js
npm test
```

- [ ] Inspect and commit:

```powershell
git diff -- public/admin/js/admin-auth.js scripts/test-admin-auth.js scripts/test.ps1
git diff --name-only
git diff --check
git add public/admin/js/admin-auth.js scripts/test-admin-auth.js scripts/test.ps1
git commit -m "feat: add admin browser session guard"
```

## Task 9: Shared responsive Admin shell

**Files:**
- Create: `public/admin/js/admin-shell.js`
- Modify: `public/css/admin.css`
- Modify: `public/admin/dashboard.html`
- Modify: `public/admin/places.html`
- Modify: `public/admin/routes.html`
- Modify: `public/admin/products.html`
- Modify: `public/admin/events.html`
- Modify: `public/admin/reviews.html`
- Modify: `public/admin/gallery.html`
- Modify: `public/admin/settings.html`
- Modify: `public/admin/404.html`
- Create: `scripts/test-admin-shell.js`
- Modify: `scripts/test.ps1`

**Interfaces:** Produces `window.TakhunAdminShell.init` and a consistent protected-page DOM contract. It consumes `TakhunAdminAuth.guardProtectedPage/logout`, the safe Admin projection, and per-page active-nav metadata.

- [ ] Write DOM tests for desktop sidebar, mobile drawer, header, identity display, public-site link, logout control, skip link, and active navigation. Assert one `aria-current="page"`, correct page metadata, and no Dashboard metrics, counts, forms, or CRUD controls.
- [ ] Write interaction tests for at least 44-by-44-pixel interactive targets, opener focus, focus trap cycling, Escape close, backdrop close, focus restoration, body scroll state, drawer ARIA state, and logout invocation.
- [ ] Add static/style tests for visible `:focus-visible`, reduced-motion handling, mobile/desktop breakpoints, overlay/backdrop, pre-auth content hiding from both visual rendering and the accessibility tree, and semantic landmarks.
- [ ] Run RED:

```powershell
node scripts/test-admin-shell.js
```

Expected: failure because the shared shell module and page contract are absent.

- [ ] Implement the smallest shared shell module and CSS. Keep page bodies as existing milestone placeholders within the authenticated layout; do not add analytics, metrics, CRUD controls, or a language switch.
- [ ] Apply the same early guard and shared script order to every protected Admin HTML page. The guarding class/attribute must exist in source before scripts execute, preventing protected-content flash.
- [ ] Run GREEN, browser auth, and build regressions:

```powershell
node scripts/test-admin-shell.js
node scripts/test-admin-auth.js
npm test
npm run build
```

- [ ] Inspect and commit exactly the shell slice:

```powershell
git diff -- public/admin/js/admin-shell.js public/css/admin.css public/admin/dashboard.html public/admin/places.html public/admin/routes.html public/admin/products.html public/admin/events.html public/admin/reviews.html public/admin/gallery.html public/admin/settings.html public/admin/404.html scripts/test-admin-shell.js scripts/test.ps1
git diff --name-only
git diff --check
git add public/admin/js/admin-shell.js public/css/admin.css public/admin/dashboard.html public/admin/places.html public/admin/routes.html public/admin/products.html public/admin/events.html public/admin/reviews.html public/admin/gallery.html public/admin/settings.html public/admin/404.html scripts/test-admin-shell.js scripts/test.ps1
git commit -m "feat: add shared responsive admin shell"
```

## Task 10: Login page integration

**Files:**
- Modify: `public/admin/login.html`
- Modify: `public/css/admin.css`
- Modify: `scripts/test-admin-auth.js`
- Modify: `scripts/test-admin-shell.js` only for shared visual-contract assertions

**Interfaces:** Consumes `TakhunAdminApi` and `TakhunAdminAuth`; produces the login form DOM contract and redirect behavior. Successful login persists only the exact session projection and navigates through the safe return parser.

- [ ] Add RED DOM tests for Thai Admin copy, username and password labels, username `autocomplete="username"`, password `autocomplete="current-password"`, required fields, submit disabled state, form `aria-busy`, and a live generic-error region.
- [ ] Test submit success, generic credential failure, input ceilings, double-submit prevention, password clearing after every completed attempt, a fixed 60-second disabled cooldown after `RATE_LIMITED`, and safe return-path navigation. Assert no password value or limiter bucket detail is copied into error text, logs, URL, or storage.
- [ ] Test existing-session validation: valid authoritative session redirects to the safe return target; invalid session clears and presents the form; network failure presents a safe retry state and does not redirect.
- [ ] Assert the page has no public registration, default credential hint, email-login option, Admin language switch, or protected-content flash.
- [ ] Run RED:

```powershell
node scripts/test-admin-auth.js
node scripts/test-admin-shell.js
```

Expected: new login integration assertions fail.

- [ ] Implement the semantic Thai login form and minimal styles. On submit set disabled/`aria-busy`, call username/password login, clear the password, display only generic live errors, store only the validated projection, and navigate only to a safe Admin return path. After `RATE_LIMITED`, enforce the fixed 60-second client cooldown without exposing bucket state.
- [ ] Run GREEN and frontend regressions:

```powershell
node scripts/test-admin-auth.js
node scripts/test-admin-shell.js
node scripts/test-admin-api.js
npm test
npm run build
```

- [ ] Inspect and commit:

```powershell
git diff -- public/admin/login.html public/css/admin.css scripts/test-admin-auth.js scripts/test-admin-shell.js
git diff --name-only
git diff --check
git add public/admin/login.html public/css/admin.css scripts/test-admin-auth.js scripts/test-admin-shell.js
git commit -m "feat: integrate admin login page"
```

## Task 11: Documentation synchronization and full regression

**Files:**
- Modify: `docs/DATA_SCHEMA.md`
- Modify: `docs/API_SPEC.md`
- Modify: `docs/ADMIN_CMS_SPEC.md`
- Modify: `docs/DEVELOPMENT_RULES.md`
- Modify: `docs/TESTING_CHECKLIST.md`
- Modify: `scripts/test-admin-schema.js`
- Modify: `scripts/test.ps1`

**Interfaces:** Finalizes the repository contract consumed by later Admin milestones and the local test runner. It changes no runtime interface and performs no external operation.

- [ ] Extend `scripts/test-admin-schema.js` before documentation changes to require every design acceptance area: credentials, sessions, critical write order, property ownership, setup, isolated benchmark, bootstrap, Router, API client, browser guard, shell accessibility, login behavior, public compatibility, and future human gates.
- [ ] Run RED:

```powershell
node scripts/test-admin-schema.js
```

Expected: missing synchronized contract sections fail.

- [ ] Synchronize all five documents with the implemented names and behavior. Keep schemas and API fields exact; document non-goals; state that benchmark and all provisioning/deployment steps are human-run in non-production first; include the complete failure procedure and manual gates in `TESTING_CHECKLIST.md`.
- [ ] Run the focused suites exactly:

```powershell
node scripts/test-crypto-service.js
node scripts/test-auth-service.js
node scripts/test-admin-api.js
node scripts/test-admin-auth.js
node scripts/test-admin-shell.js
```

- [ ] Run the two additional independent contract suites:

```powershell
node scripts/test-sheet-service.js
node scripts/test-admin-schema.js
```

- [ ] Run full public/backend regression and build exactly:

```powershell
npm test
npm run build
```

Expected: all tests and build pass, including existing public frontend behavior/API and review submission tests.

- [ ] Syntax-check every tracked JavaScript file with PowerShell:

```powershell
$jsFiles = @(git ls-files '*.js')
foreach ($jsFile in $jsFiles) {
  node --check $jsFile
  if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax failed: $jsFile" }
}
```

- [ ] Scan tracked source and pending changes for credential/property assignments, private keys, raw tokens, default passwords, and logging of sensitive names. Review every match; expected matches are names/contracts in tests and docs, never values or logging calls:

```powershell
git grep -n -I -E '(ADMIN_AUTH_RANDOM_KEY[[:space:]]*=|ADMIN_BOOTSTRAP_PASSWORD[[:space:]]*=|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|console\.(log|debug).*password|Logger\.log.*(password|token|key))'
git diff -- . ':!docs/superpowers/plans/2026-08-08-admin-foundation-auth.md' | Select-String -CaseSensitive -Pattern 'password\s*[:=]\s*["''][^"'']+["'']','token\s*[:=]\s*["''][A-Za-z0-9_-]{20,}["'']'
```

Expected: no embedded secret values or secret-bearing logs. Investigate rather than blanket-ignore any match.

- [ ] Compare all implementation changes with the exact allowlist from the File Responsibility Map. Fail review if any generated output, dependency file, public non-Admin production file, environment file, credential file, or unlisted path appears:

```powershell
$baseCommit = git merge-base origin/main HEAD
$changedFiles = @(git diff --name-only $baseCommit..HEAD; git diff --name-only; git ls-files --others --exclude-standard)
$changedFiles | Sort-Object -Unique
git status --short
```

- [ ] Inspect each file's final diff and check whitespace:

```powershell
$baseCommit = git merge-base origin/main HEAD
git diff --stat $baseCommit
git diff $baseCommit -- apps-script public/admin public/css/admin.css scripts docs/DATA_SCHEMA.md docs/API_SPEC.md docs/ADMIN_CMS_SPEC.md docs/DEVELOPMENT_RULES.md docs/TESTING_CHECKLIST.md
git diff --check $baseCommit
```

- [ ] Confirm the implementation contains no unresolved placeholder wording and that function/global names match the Fixed Interface Catalog. Confirm credentials are not requested anywhere before the Apps Script benchmark passes and Tasks 1–11 contain no external action.
- [ ] Commit documentation and final regression coverage:

```powershell
git add docs/DATA_SCHEMA.md docs/API_SPEC.md docs/ADMIN_CMS_SPEC.md docs/DEVELOPMENT_RULES.md docs/TESTING_CHECKLIST.md scripts/test-admin-schema.js scripts/test.ps1
git commit -m "docs: finalize admin auth contracts and regressions"
```

## Task 12: Human/manual operator gates and staging QA

**Files:** None. This task is an instruction-only handoff; all checklist text was committed in Task 11.

**Interfaces:** Human operators consume reviewed code and `docs/TESTING_CHECKLIST.md`. No agent receives authorization to touch Apps Script, Sheets, Script Properties, credentials, hosting, or deployment systems.

- [ ] **HARD STOP FOR THE IMPLEMENTATION AGENT.** After Tasks 1–11 and their review are complete, report the local commit/test evidence and hand control to the human. Do not install a backend, open or modify an Apps Script project, modify a Sheet, create/read properties or credentials, deploy/version either application, run staging requests, push, or create a pull request.

### Future human gate sequence

- [ ] **Gate A — Reviewed code/tests complete.** A human reviews the implementation, exact changed-file allowlist, secret scan, automated test results, and security-critical write order.
- [ ] **Gate B — Non-production backend installation.** The human installs the reviewed backend into a NON-PRODUCTION Apps Script environment.
- [ ] **Gate C — Random key creation.** The human manually creates only `ADMIN_AUTH_RANDOM_KEY`. The human does not create counter/version or bootstrap credential properties yet.
- [ ] **Gate D — Schema/state setup.** The human runs `setupAdminAuthSchema()` and verifies the key is valid without being printed, state version is `1`, counter is initialized/valid, required headers are unique, and no credentials were created.
- [ ] **Gate E — Real Apps Script PBKDF2 benchmark.** The human runs `benchmarkAdminPbkdf2()`. Require five correct measured 120000-round derivations, median `<= 3000 ms`, max `<= 5000 ms`, and `passed=true`. If any requirement fails: **STOP. No bootstrap. No manual iteration reduction.** Return to code/performance review.
- [ ] **Gate F — Temporary bootstrap properties.** Only after Gate E passes, the human sets the documented temporary bootstrap username, display name, optional email, password, and exact enabled flag.
- [ ] **Gate G — One bootstrap call.** The human runs `bootstrapFirstAdmin()` once and does not automate retries.
- [ ] **Gate H — Provisioning verification.** The human verifies exactly one active `super_admin`; valid PBKDF2 salt/hash/iteration fields; no plaintext password; temporary bootstrap properties removed; enabled is `false`; no session row exists yet; and auth random state remains valid.
- [ ] **Gate I — Backend version/deploy.** Only after Gate H succeeds, the human versions and deploys the Apps Script backend through the approved workflow.
- [ ] **Gate J — Backend staging checks.** The human verifies unauthenticated `adminValidateSession` returns a JSON `UNAUTHORIZED` envelope and the existing public GET regression remains healthy.
- [ ] **Gate K — Static frontend deploy.** Only after backend checks pass, the human deploys the reviewed static frontend through the approved workflow.
- [ ] **Gate L — Manual authentication QA.** The human tests desktop/mobile login, refresh, protected navigation, safe return behavior, drawer keyboard/focus behavior, expiry/error states, logout, and confirms the old token is rejected after server-side revocation.

### Bootstrap failure procedure

If `bootstrapFirstAdmin()` throws, returns failure, or cleanup cannot be verified:

- [ ] **STOP.** Do not rerun bootstrap automatically and do not deploy.
- [ ] Inspect the non-secret failure category only.
- [ ] Check whether an Admin row was created and whether temporary bootstrap properties remain.
- [ ] Manually remove any remaining `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, and `ADMIN_BOOTSTRAP_EMAIL`.
- [ ] Set `ADMIN_BOOTSTRAP_ENABLED=false` if it is still `true`.
- [ ] Do not edit `password_hash`, `password_salt`, or `password_iterations` manually.
- [ ] Return to code/security review before another provisioning attempt.

### Manual operator checklist copy

The operator must keep this recovery copy beside the Gate G runbook: If `bootstrapFirstAdmin()` throws, returns failure, or cleanup cannot be verified, **STOP**; do not rerun it automatically; do not deploy; inspect only the non-secret failure category; check whether an Admin row was created; check whether temporary bootstrap properties remain; manually remove any remaining `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, and `ADMIN_BOOTSTRAP_EMAIL`; set `ADMIN_BOOTSTRAP_ENABLED=false` if it is still `true`; do not manually edit `password_hash`, `password_salt`, or `password_iterations`; and return to code/security review before another provisioning attempt.

## Plan Review Checklist

- [ ] Every approved design acceptance criterion maps to at least one task in the coverage table and to an executable test, static contract, or future human gate.
- [ ] All cryptographic, storage, session, random-state, write-order, bootstrap, transport, guard, accessibility, and public-regression invariants appear with consistent names and values.
- [ ] Task dependencies flow from primitives and Sheet contracts through backend auth/setup/Router, frontend transport/guard/shell/login, final synchronization, then human operations.
- [ ] No step asks a human to enter bootstrap credentials before the real Apps Script benchmark passes.
- [ ] No external operation appears before Task 12, and Task 12 starts with an explicit handoff stop.
- [ ] Bootstrap failure cleanup and non-retry behavior appear both in Task 12 and the manual operator checklist copy.
- [ ] The final regression protects existing public GET, API, frontend, review, build, and syntax behavior.
- [ ] Final review finds no vague placeholder language, inconsistent interface name, secret value, or out-of-scope file.
- [ ] `git diff --check` passes before handoff.
