# M8 PR1 Phase A implementation handoff

Date: 2026-10-07 (Asia/Bangkok). Backend implementation and local verification complete. No UI implementation or release operations.

## Review remediation (A–T)

- **A–B — MEDIUM fix and boundary:** `AdminContentService_table_` changes only stored `is_featured === ""` to `false` in the read snapshot, shared by Product/Event detail, list revisions and mutation merging. This single boundary keeps revision and validation consistent. Reads do not write; ordinary verified mutations may persist false. Explicit request validation stays Boolean-only. Other malformed stored values are not normalized.
- **C–D — Product/Event tests:** each domain covers blank detail/list/revision, equivalence to stored false, zero read writes, unrelated partial edits, draft publish/archive/delete, strict create/update requests (`true`/`false` accepted; empty string, string false, 0, 1, null rejected), existing stored booleans and malformed stored values.
- **E–G — LOW fix, URL contract and tests:** shared offline validation keeps HTTP(S), dotted ASCII DNS and ports 1–65535. DNS terminal labels begin with an ASCII letter; numeric hosts require four canonical decimal IPv4 octets 0–255 without leading zeros. Tests exercise every delivered URL field in both domains, ordinary domains/subdomains, HTTP/HTTPS, IPv4 limits, numeric-terminal domains, abbreviated/octal/hex forms, malformed labels, userinfo, unsafe schemes, IPv6 rejection and port boundaries. This is syntax validation, not DNS/reachability validation; no runtime URL parser or network lookup is used.
- **H — Persisted probes:** both domains cover old-reader generation interleaving, silent remove failure with no writes, entity/audit flush exceptions without retries, and published content/featured/date freshness through actual list/detail/Home/Search readers. Shared tests cover cache get/put failure fallback, leap-century dates (1900/2100 invalid; 2000/2400 valid) and equal-time Event rejection. No cache production behavior changed.
- **I — New defects:** none discovered by the persisted probes. A freshness fixture initially searched an unchanged category; a unique title corrected the test. Numeric-format/real-Sheets coercion remains an integration limitation, with no migration or production change.
- **J — Documentation:** only this report and `M8_PHASE_A_CONTRACT.md` were updated during remediation, documenting the exact Boolean and URL boundaries.
- **K — Focused:** 115 checks passed (20 aggregate checks added to the previous 95, with nested case matrices). Both findings were observed failing before their production fixes.
- **Independent remediation review:** a fresh read-only reviewer found no concrete defects or material test gaps within the two-fix scope. That review was static; execution evidence comes from the command runs below.
- **L–O — Verification:** see command results below for the full test/build, syntax/static and whitespace checks.
- **P–S — Git evidence:** the exact diff stat, full status and HEAD remain recorded below. This remediation changes exactly four files: `apps-script/AdminContentService.gs`, `scripts/test-admin-content-service.js`, `docs/M8_PHASE_A_CONTRACT.md`, `docs/M8_PHASE_A_REPORT.md`. They were already untracked Phase A files, so the tracked diff stat is unchanged. The complete accumulated Phase A working tree contains 23 changed/new files; HEAD remains `7af03b9`.
- **T — Scope/operations:** no commit, push, deployment, Production/remote Sheet access, credential/Script Property change or Phase B UI implementation. Admin placeholders, authorization, generic write surface, lifecycle rules, public Boolean semantics and cache architecture are unchanged; no physical deletion or unrelated refactor.

## A. Material source/spec findings

- `DATA_SCHEMA.md` and implemented public services confirm five Product/Event statuses, unlike Places' three-state lifecycle.
- Products use `price_range` display text and `sort_order`; Events have one `event_date`, optional same-day times, no end-date and no sort-order column.
- Existing public services expose published records only. Product/Event Detail joins only published Places.
- Historical action names are retained; two detail actions are added. Historical create-as-published examples are superseded by safe draft creation and revision-checked lifecycle changes.
- Admin Places establishes all-four-role reads and editor/super_admin writes through `AuthService_requireAdmin_`.
- M7 audit columns/aliases and uppercase action conventions are reused. No columns/tables added.
- Existing cache keys covered Product/Event responses and Home/Search separately. A shared content generation now reaches those actual consumers while retaining Place epoch dependencies.
- M7's recorded Sheets probe shows `@` can coerce booleans to strings. Boolean destinations therefore require the proven numeric formats; nonempty text uses plain-text destinations. No remote format changes were made.

## B. Product actions

`adminGetProducts`, `adminGetProductDetail`, `createProduct`, `updateProduct`, `deleteProduct`.

## C. Event actions

`adminGetEvents`, `adminGetEventDetail`, `createEvent`, `updateEvent`, `deleteEvent`.

## D. Lifecycle transition matrix

| Current | Allowed destinations |
|---|---|
| draft | published, archived, deleted |
| published | hidden, archived, deleted |
| hidden | draft, published, archived, deleted |
| archived | draft, deleted |
| deleted | draft |

All other pairs, including same-state assignment, are rejected. Create always produces draft. Update carries explicit validated status transitions; delete actions only soft-delete. Archived/deleted rows retain content. Restore-to-draft, archive and delete cannot be combined with content edits. Published/hidden transitions can include validated edits. Content edits are permitted only from draft/published/hidden. No physical deletion exists.

## E. Authorization matrix

| Role/session | List/detail | Mutations |
|---|---|---|
| viewer | yes | no |
| reviewer | yes | no |
| editor | yes | yes |
| super_admin | yes | yes |
| missing/invalid/expired/revoked/inactive | no | no |

Canonical server authentication runs before writes and again after obtaining the script lock. Client role/permissions cannot grant authority.

## F. Product payload contract

Editable fields: `name_th`, `name_en`, `category`, `producer_name`, `related_place_id`, `district`, `description_th`, `description_en`, `price_range`, `phone`, `contact_url`, `google_maps_url`, `latitude`, `longitude`, `image_url`, `tags`, `is_featured`, `sort_order`.

Create requires nonempty Thai name/description and a valid category; optional fields default empty, featured defaults false. Update is ID + `expected_revision` + partial editable fields and/or status. Delete is exactly ID + expected revision. IDs/timestamps are server-managed. Details, enums, limits, URL/formula rules and list filters are specified in [the permanent contract](M8_PHASE_A_CONTRACT.md#editable-payloads).

## G. Event payload contract

Editable fields: `title_th`, `title_en`, `event_type`, `event_date`, `start_time`, `end_time`, `location_th`, `location_en`, `related_place_id`, `description_th`, `description_en`, `image_url`, `contact_name`, `contact_phone`, `register_url`, `google_maps_url`, `latitude`, `longitude`, `is_featured`.

Create requires Thai title/location/description, valid type and real Gregorian date. End time requires a start and must be strictly later on the same day. Updates/deletes use the same ID/revision pattern as Products. No invented end-date/order fields. See [the permanent contract](M8_PHASE_A_CONTRACT.md#editable-payloads) for exact types/enums.

## H. Revision/concurrency

Opaque `r1-<SHA-256>` over a fixed-order, typed, UTF-8 canonical representation of identity, every editable field and status. Dates use ISO UTC; no locale serialization. Timestamps/unrelated columns are deliberately excluded. Fresh revision comparison occurs under the same script lock used for mutations; stale writes return `CONFLICT` without writes/audit. No version/draft table or force overwrite.

## I. Write verification/failures

Preflight payload, schema, identity, reference, revision, destination formats, absence of formulas, audit destination and verified cache invalidation. Write one row via one `setValues`, retain unrelated columns, flush and verify the entire intended row. An attempted entity write with uncertain/unverified result returns `OUTCOME_UNKNOWN`, the entity ID and `retryable:false`. No rollback deletion or automatic retry. A lock-release exception preserves the known result. Fixed error messages omit internal details.

## J. Audit

Actions: `CREATE`, `UPDATE`, `PUBLISH`, `HIDE`, `ARCHIVE`, `DELETE`, `RESTORE`; entity type product/event. Actor, ID, timestamp, compatibility aliases and safe status/revision metadata use existing M7 columns. No secrets/payloads. Validation/auth/conflict failures produce no mutation audit. Append and verify once after entity verification. Audit failure after verified entity success returns `audit_status:"unconfirmed"`, not clean mutation failure; successful verified audit returns `recorded`.

## K. Cache invalidation

Script Cache generation added to Product/Event list/detail, Home and Search keys. Writer removes and verifies generation absence under lock before entity mutation. Readers initialize a missing generation with a fresh UUID under the same lock or bypass caching. Eviction cannot reuse a default/old namespace; old in-flight cache writes become unreachable. Existing Place epochs remain. No Script Property changes. Both domains and both aggregates deliberately share invalidation.

## L. Router/transport

Ten explicit literal POST branches using body `{action, token, payload}`. No query-token fallback, GET mutation/protected read, arbitrary dispatch, diagnostics, or retry path. Existing auth and Place transport behavior remain.

## M. Tests

Added `scripts/test-admin-content-service.js`: 115 aggregate checks, including all 50 domain/status pairs and nested role/input/failure matrices. Real services run against in-memory Sheets/cache/lock fixtures; real AuthService validates session cases. Tests cover domain fields, exact payloads, revisions, duplicates/references, retention, complete row verification, create/update/delete uncertainty, audit failure, lost-response reconciliation, actual public consumers, eviction/in-flight cache behavior and Router restrictions.

Updated the mandatory runner, global Router allowlists and four public service cache-key fixtures. The latter isolate their unchanged service assertions with a stable content generation; the new integration suite tests the real generation helper. Existing Admin Places suites remain mandatory. An earlier review found a combined lifecycle/edit retention gap, fixed with regression tests. Subsequent independent review classified stored blank featured values and invalid numeric URL hosts; the remediation below addresses those two findings.

## N. Commands and actual results

| Command | Result |
|---|---|
| `node scripts/test-admin-content-service.js` | PASS, 115 checks |
| `node scripts/test-admin-place-regressions.js` | PASS, includes existing M7 component proofs |
| `node scripts/test-product-service.js` | PASS |
| `node scripts/test-event-service.js` | PASS |
| `node scripts/test-home-service.js` | PASS |
| `node scripts/test-search-service.js` | PASS |
| `cmd /c npm test` | PASS, exit 0, full repository suite |
| `cmd /c npm run build` | PASS, exit 0; reruns full suite and static build check |
| `node --check scripts/test-admin-content-service.js` | PASS |
| `node --check` on all JavaScript files under `scripts` and `public` | PASS, 75 files |
| `node scripts/test-apps-script.js` | PASS, 23 Apps Script files and 442 unique functions |
| `git diff --check` | PASS |

The first full test attempt stopped at missing installed `sharp`. `cmd /c npm ci --offline --ignore-scripts --no-audit --no-fund --logs-dir .tmp/npm-logs` installed the existing lockfile's dependencies from local cache; subsequent full test/build passed. No dependency/lockfile changes. Temporary logs were removed. Initial test-first failures were observed before endpoint, routing and lifecycle-fix implementation.

## O. Documentation changes

`M8_PHASE_A_CONTRACT.md` contains the exact permanent contract. API, data schema, Admin CMS and testing documents link/describe the implemented behavior without rewriting historical release records or claiming UI completion. This report is the requested handoff.

## P. Exact git diff --stat

```text
 apps-script/EventService.gs             |  2 +-
 apps-script/HomeService.gs              |  2 +-
 apps-script/ProductService.gs           |  1 +
 apps-script/Router.gs                   | 10 ++++++++++
 apps-script/SearchService.gs            |  2 +-
 docs/ADMIN_CMS_SPEC.md                  |  6 ++++++
 docs/API_SPEC.md                        |  6 ++++++
 docs/DATA_SCHEMA.md                     |  6 ++++++
 docs/TESTING_CHECKLIST.md               | 13 +++++++++++++
 scripts/test-admin-place-regressions.js |  2 ++
 scripts/test-apps-script.js             |  2 ++
 scripts/test-event-service.js           |  2 ++
 scripts/test-home-service.js            | 18 ++++++++++--------
 scripts/test-product-service.js         |  2 ++
 scripts/test-search-service.js          |  8 +++++---
 scripts/test.ps1                        |  2 ++
 16 files changed, 70 insertions(+), 14 deletions(-)
```

Git diff excludes seven new untracked files; they are included in Q/R. Nothing was staged.

## Q. Exact changed files

All 23 files are listed in the Git status below: 16 modified tracked files and seven new files. No public HTML/CSS/JS, package manifest/lockfile, credentials, or deployment configuration changed.

## R. git status --short --branch

```text
## feature/m8-products-events...origin/main
 M apps-script/EventService.gs
 M apps-script/HomeService.gs
 M apps-script/ProductService.gs
 M apps-script/Router.gs
 M apps-script/SearchService.gs
 M docs/ADMIN_CMS_SPEC.md
 M docs/API_SPEC.md
 M docs/DATA_SCHEMA.md
 M docs/TESTING_CHECKLIST.md
 M scripts/test-admin-place-regressions.js
 M scripts/test-apps-script.js
 M scripts/test-event-service.js
 M scripts/test-home-service.js
 M scripts/test-product-service.js
 M scripts/test-search-service.js
 M scripts/test.ps1
?? apps-script/AdminContentService.gs
?? apps-script/AdminEventService.gs
?? apps-script/AdminProductService.gs
?? apps-script/ContentCacheService.gs
?? docs/M8_PHASE_A_CONTRACT.md
?? docs/M8_PHASE_A_REPORT.md
?? scripts/test-admin-content-service.js
```

## S. git rev-parse --short HEAD

```text
7af03b9
```

## T. Intentional limitations / Phase B

- Products/Events editors, scripts, controls, conflict UX, audit-warning UX and uncertain-response reconciliation remain deferred. Preparation messages remain untouched.
- No request ledger/exactly-once create guarantee. Lost create responses require name/title search and candidate inspection; automatic resubmission is unsafe.
- Content hashes permit ABA and do not encode edit history. Manual Sheet changes are outside cooperative locking.
- Existing schema has no overnight/multi-day Event representation. No schema extension was invented.
- Strict formula-prefix rejection also restricts some phone/display-text inputs; Phase B must show validation errors.
- Destination formats/schema and real Sheets behavior still require human remote readiness/QA before release. Local mocks do not prove remote state. Audit reconciliation/repair is an operator responsibility, not a retry of the content action.

## U. Explicit operational confirmation

- No commit.
- No push.
- No deployment, clasp push or version creation.
- No Production or remote Google Sheet access.
- No credentials or Script Properties changed.
- No framework/database migration, new infrastructure or paid service.
- No Products/Events UI implementation or unrelated Public UI changes.
