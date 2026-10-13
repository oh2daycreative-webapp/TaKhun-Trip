# Admin Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a strict, conflict-safe Admin Settings editor for the existing twelve public Settings keys without changing public consumers or unrelated spreadsheet data.

**Architecture:** A focused Apps Script Admin Settings service owns validation, canonical row discovery, ABA-resistant revisions, locked cache coordination, scattered writes, read-back, and audit. The existing browser API gains two exact methods, while a dedicated UI controller preserves dirty drafts and reconciles conflicts/uncertain outcomes without automatic resubmission.

**Tech Stack:** Google Apps Script JavaScript, browser JavaScript/HTML/CSS, Node.js VM tests, native Chromium CDP test harness, PowerShell verification.

**Spec:** `docs/superpowers/specs/2026-10-13-admin-settings-design.md`

## Global Constraints

- Manage exactly the existing twelve public Settings keys; exclude maintenance, Featured IDs, infrastructure, and secrets.
- All authenticated Admin roles read; only `super_admin` writes; no password step-up.
- Preserve unknown/legacy rows and unrelated cells, formulas, formats, and metadata; never create or repair canonical rows automatically.
- Use existing schema, CacheService, LockService, activity log, configuration, and dependencies only.
- Do not add or change public consumers for flags, default language, logo, or hero.
- No production calls, real spreadsheet/property mutation, deployment, push, PR, merge, import, or worktree cleanup.
- Spreadsheet coercion coverage is simulated and must be documented as such.

## Review Focus

- Historical apostrophe-prefixed strings must not be silently unescaped; tests pin Admin and public projections.
- A `+66` phone must round-trip without spreadsheet coercion while invalid trunk-zero international forms fail.
- A pre-save in-flight public read may finish stale, but no stale cache miss may refill after a successful save.
- Failure between a value cell and timestamp cell must remain `OUTCOME_UNKNOWN`, leave cache absent, and preserve unrelated cells.
- Equal values after uncertain reconciliation must not be described as confirmed request or audit success and must not adopt a revision implicitly.

---

### Task 1: Backend Settings model, validation, and safe reads

**Files:**
- Create: `apps-script/AdminSettingsService.gs`
- Modify: `apps-script/SettingsService.gs`
- Create: `scripts/test-admin-settings-service.js`
- Modify: `scripts/test-settings-service.js`

**Interfaces:**
- Produces: `adminGetSettings_(token)`, canonical validation/projection helpers, exact twelve-field logical Settings object, and `SettingsService_readRows_()` formula-aware rows used by public/Admin reads.
- Consumes: `AuthService_requireAdmin_`, `SheetService_getSheet_`, `CryptoService_*`, Apps Script `Utilities`, `Session`, `CacheService`, and `LockService`.

- [ ] Write failing backend tests for exact canonical row classification, all-role reads, missing/duplicate/formula/invalid timestamp fail-closed behavior, field validation, NFC/UTF-8 limits, URL/email/boolean rules, valid and invalid `+66` numbers, historical apostrophe preservation, and Date/string timestamp equivalence.
- [ ] Extend public Settings regression tests first for formula omission, literal apostrophe preservation, historical whitespace/boolean compatibility, and `+66` projection; run both files and confirm failures arise from missing formula-aware behavior/Admin service.
- [ ] Implement the minimal formula-aware row reader and Admin read/model helpers. Keep the public adjustment limited to unsafe formula detection and retain sparse first-valid-row behavior.
- [ ] Run `node scripts/test-settings-service.js` and `node scripts/test-admin-settings-service.js`; expected: both pass.
- [ ] Commit tests, service, and narrow public reader change with `feat(admin): add strict settings model`.

### Task 2: Revision, mutation, cache interleavings, scattered writes, and audit

**Files:**
- Modify: `apps-script/AdminSettingsService.gs`
- Modify: `apps-script/SettingsService.gs`
- Modify: `scripts/test-admin-settings-service.js`
- Modify: `scripts/test-settings-service.js`

**Interfaces:**
- Consumes: Task 1 canonical model and formula-aware rows.
- Produces: `updateSettings_(token,payload)`, revision/timestamp helpers, locked public cache miss/fill, `changed`/`audit_status` response, and safe failure codes.

- [ ] Add failing tests for exact full replacement payloads, super-admin-only writes, revision conflict, ABA timestamps, Date equivalence, no-op behavior, audit projection/status, and cache invalidation before writes.
- [ ] Add deterministic failing interleaving tests for hit/miss/double-check/fill, reader-before-writer, reader-waiting-behind-writer, cache failures, and prevention of post-save stale refill.
- [ ] Add failing storage-boundary tests for escaped writes/read-back provenance, formula coercion, source-row drift, failure after value and timestamp writes, flush/read-back failure, unknown interspersed rows/columns, and preservation of unrelated formulas/metadata. Assert `OUTCOME_UNKNOWN` for every attempted but unverifiable persistence.
- [ ] Implement locked mutation and public miss/fill paths with per-cell writes only, monotonic timestamps, verified read-back, and existing activity-log append/verification.
- [ ] Run both Settings service test files; expected: pass with explicit simulated-not-real-Sheets assertions/documentation.
- [ ] Commit with `feat(admin): save settings with conflict safety`.

### Task 3: Exact Router and Admin API contracts

**Files:**
- Modify: `apps-script/Router.gs`
- Modify: `public/admin/js/admin-api.js`
- Modify: `scripts/test-admin-api.js`
- Create: `scripts/test-admin-settings-api.js`
- Modify: `scripts/test-admin-content-api.js` or the router contract test owning exact action exposure.

**Interfaces:**
- Consumes: Task 1 `adminGetSettings_` and Task 2 `updateSettings_` exact response projections.
- Produces: `TakhunAdminApi.getSettings(token)` and `TakhunAdminApi.updateSettings(token,payload)` with single-POST strict validation and safe uncertain errors.

- [ ] Write failing Router tests proving literal untrimmed action matching, exact top-level keys, POST-only dispatch, and rejection of aliases/query transport.
- [ ] Write failing API tests for exact bodies, twelve-key payload validation, strict success/error projections, `OUTCOME_UNKNOWN`, timeout/malformed mutation uncertainty, and one fetch only.
- [ ] Implement the two literal Router branches and browser facade methods without broadening existing actions.
- [ ] Run focused Router/Admin API tests; expected: pass.
- [ ] Commit with `feat(admin): expose exact settings contracts`.

### Task 4: Admin Settings UI and dirty reconciliation

**Files:**
- Modify: `public/admin/settings.html`
- Create: `public/admin/js/admin-settings.js`
- Modify: `public/css/admin.css`
- Create: `scripts/test-admin-settings-ui.js`

**Interfaces:**
- Consumes: Task 3 Admin API methods and existing `TakhunAdminAuth`/`TakhunAdminShell` session projection.
- Produces: role-aware Settings form/controller with baseline, draft, latest-server snapshot, dirty navigation protection, and explicit reconciliation actions.

- [ ] Write failing controller tests for loading/read-only roles, editable super-admin state, validation/focus, single-flight save, no-op/success, conflict fetch without overwrite, uncertain equal/mixed/failed reconciliation, no automatic resubmit, and explicit revision adoption only.
- [ ] Write failing markup/CSS tests for exact twelve controls, current/deferred effect copy, accessible states, 44px targets, keyboard focus, responsive/no-overflow layout, and safe dependency order.
- [ ] Implement minimal semantic HTML, controller, and scoped responsive CSS. Preserve drafts on all conflict/uncertain paths and warn on refresh, Admin navigation, and logout.
- [ ] Run `node scripts/test-admin-settings-ui.js`; expected: pass.
- [ ] Commit with `feat(admin): build settings editor`.

### Task 5: Documentation and regression registration

**Files:**
- Modify: `docs/API_SPEC.md`
- Modify: `docs/ADMIN_CMS_SPEC.md`
- Modify: `docs/DATA_SCHEMA.md`
- Modify: `docs/TESTING_CHECKLIST.md`
- Modify: `scripts/test.ps1`

**Interfaces:**
- Consumes: Tasks 1–4 exact contracts and observed current public consumers.
- Produces: authoritative documented scope/effects/failure limits and full-suite registration.

- [ ] Add failing source/document contract assertions covering exclusion of `maintenance_mode`, exact actions, current/deferred effects, in-flight read limitation, non-atomic scattered writes, uncertain reconciliation, and simulated Sheets boundary.
- [ ] Update the four documents narrowly and register all focused tests in the full suite.
- [ ] Run focused Settings backend/API/UI and public Settings/About regressions; expected: pass.
- [ ] Commit with `docs(admin): specify settings boundaries`.

### Task 6: Native browser and final verification

**Files:**
- Create or modify: `scripts/test-admin-settings-browser.js`
- Reuse: existing native CDP helpers and real-shell fixtures.

**Interfaces:**
- Consumes: completed Settings page and registered test suite.
- Produces: native evidence at 1280×900, 390×844, and 360×800 without production calls.

- [ ] Write the native browser assertions before any browser-only fix: real shell reveal, all roles, keyboard operation, dirty navigation guard, validation focus, no horizontal overflow, touch targets, and safe mocked network outcomes at all three viewports.
- [ ] Run the new browser test and confirm RED for the missing registration/behavior under test; make only test-driven fixes, then rerun GREEN.
- [ ] Run focused backend/API/UI tests plus `node scripts/test-settings-service.js` and `node scripts/test-about.js`.
- [ ] Run `npm.cmd test`, `npm.cmd run build`, JavaScript syntax checks for changed `.js`/`.gs` files, and `git diff --check`.
- [ ] Review the diff against this spec, commit final browser/test-driven fixes, and stop for independent review without pushing or merging.
