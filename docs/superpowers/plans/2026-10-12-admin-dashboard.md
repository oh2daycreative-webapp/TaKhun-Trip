# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the bounded authenticated Admin Dashboard with six fresh safe counts and capability-aware links.

**Architecture:** A new read-only Apps Script service classifies fresh Sheet rows and exposes one literal Router action. The strict browser facade validates the exact aggregate projection, while a small controller renders states and links inside the existing authenticated shell.

**Tech Stack:** Google Apps Script JavaScript, browser JavaScript, HTML/CSS, Node `vm`/DOM test harnesses, PowerShell test/build runners, Windows Chromium CDP.

**Spec:** `docs/superpowers/specs/2026-10-12-admin-dashboard-design.md`

## Global Constraints

- Work only in `J:\Projects\wt\takhun-admin-dashboard` on `feature/admin-dashboard`, based on `57d602cbc3b9e670d19a204a9142dd168d4a3c99`.
- Add only authenticated literal POST `adminGetDashboard`; every authenticated Admin role may read and server authentication is authoritative.
- Read fresh with no Dashboard cache and no entity, cache, audit, property, configuration, schema, dependency, Settings, Map, deploy, or remote Git changes.
- Counts exclude `deleted`; Places use only actual `draft/published/archived`; pending Reviews must be fully valid and unambiguous.
- UI must be safe, accessible, responsive at actual 390px/360px viewports, and reuse existing shell/pages.
- Execute tests before implementation changes for each task and watch the expected RED.

## Review Focus

- A duplicated ID with one deleted and one active row must exclude both rows and report both skipped rows, never count whichever appears first.
- A structurally invalid pending Review must not inflate moderation work while an invalid non-pending Review still contributes to the safe warning.
- A malformed response count or warning must fail closed before any numeric DOM rendering.
- An error arriving after a newer retry success must not replace the new counts or status.
- Viewer/reviewer quick links must never imply write/create capability while retaining access to all read-capable CMS pages.

---

### Task 1: Read-only Dashboard service and literal route

**Files:**
- Create: `apps-script/AdminDashboardService.gs`
- Create: `scripts/test-admin-dashboard-service.js`
- Modify: `apps-script/Router.gs`
- Modify: `scripts/test-apps-script.js`
- Modify: `scripts/test.ps1`

**Interfaces:**
- Consumes: `AuthService_requireAdmin_(token)`, `SheetService_readTable_(name, headers)`, actual domain constants/Review stored validator.
- Produces: `adminGetDashboard_(token) -> {ok,data,message}` with exact spec projection.

- [ ] **RED:** Add service tests for all four roles, auth-before-read, exact per-domain lifecycle counts, full pending-Review validation, malformed and duplicate rows, deterministic warning order, failed-read all-or-nothing behavior, exactly six reads, and armed failures for Sheet/entity/cache/audit/property/lock writes. Run `node scripts/test-admin-dashboard-service.js`; require failure because the service is absent.
- [ ] **RED:** Extend the exact Router allowlist/runtime tests with only `adminGetDashboard`, body token only and no payload. Run `node scripts/test-apps-script.js`; require failure because the literal branch is absent.
- [ ] **GREEN:** Implement focused row classification and safe response mapping in `AdminDashboardService.gs`; add the one literal Router branch. Do not acquire locks or call any write/cache/audit/property API.
- [ ] **VERIFY:** Run both focused tests and the Apps Script syntax/static suite; require zero failures.
- [ ] **COMMIT:** Commit the service, route, runner, and tests as `feat(admin): add read-only dashboard summary service`.

### Task 2: Strict Admin API facade

**Files:**
- Modify: `public/admin/js/admin-api.js`
- Create: `scripts/test-admin-dashboard-api.js`
- Modify: `scripts/test.ps1`

**Interfaces:**
- Consumes: existing `placeRequest` transport/error normalization.
- Produces: `TakhunAdminApi.getDashboard(token) -> Promise<DashboardSummary>`.

- [ ] **RED:** Test exact export/request `{action:"adminGetDashboard",token}`, absence of payload/query/header authority, exact safe projection, every malformed count/warning class, backend errors, timeout/network cases, and exactly one fetch without retry. Run `node scripts/test-admin-dashboard-api.js`; require failure because `getDashboard` is absent.
- [ ] **GREEN:** Add a dedicated strict validator and `getDashboard` facade without loosening existing validators or exports.
- [ ] **VERIFY:** Run `node scripts/test-admin-dashboard-api.js`, `node scripts/test-admin-api.js`, and `node scripts/test-admin-reviews-api.js`; require zero failures.
- [ ] **COMMIT:** Commit as `feat(admin): add strict dashboard API facade`.

### Task 3: Accessible Dashboard UI states and role links

**Files:**
- Create: `public/admin/js/admin-dashboard.js`
- Modify: `public/admin/dashboard.html`
- Modify: `public/css/admin.css`
- Create: `scripts/test-admin-dashboard-ui.js`
- Modify: `scripts/test-admin-shell.js`
- Modify: `scripts/test.ps1`

**Interfaces:**
- Consumes: `TakhunAdminShell.init()`, `TakhunAdminAuth.readSession()`, `TakhunAdminApi.getDashboard(token)`.
- Produces: frozen `TakhunAdminDashboard` with `quickLinks(role)`, `createController(api,view)`, and `init()` for testable capability/state behavior.

- [ ] **RED:** Add model/DOM tests for one post-auth load, loading/success/all-zero/warning/error/retry, single-flight retry, stale completion suppression, six exact Thai card labels, all role-specific link labels/destinations, text-only rendering, focus/status semantics, and no unsafe sink. Update the shell test so Dashboard is controller-owned instead of a placeholder. Run focused UI and shell tests; require failure on absent controller/markup.
- [ ] **GREEN:** Replace only the Dashboard placeholder with semantic summary/status/retry/links markup; implement the controller with safe text nodes and explicit retry; add scoped responsive/focus/target CSS.
- [ ] **VERIFY:** Run Dashboard UI, Admin shell, and existing Admin UI suites; require zero failures.
- [ ] **COMMIT:** Commit as `feat(admin): render accessible dashboard summary`.

### Task 4: Native browser regression and final validation

**Files:**
- Create: `scripts/test-admin-dashboard-browser.js`
- Reuse/modify only if required: `scripts/test-admin-reviews-cdp.js`, `scripts/test-admin-reviews-cdp-helper.js`
- Modify: `scripts/test.ps1`
- Modify: relevant current Dashboard documentation only if implementation evidence requires clarification.

**Interfaces:**
- Consumes: real Windows shell/CDP helper, local static server, mocked Auth/API boundaries.
- Produces: repeatable native Dashboard verification included in the full runner.

- [ ] **RED:** Add native browser scenarios for desktop plus actual 390px and 360px viewports: role links, loading/empty/error/retry, keyboard traversal/visible focus, safe hostile data rendering, no horizontal overflow, and 44px link/retry targets. Run the actual discovered test filename and require failure before the Dashboard browser wiring exists.
- [ ] **GREEN:** Make only evidence-driven Dashboard/browser-helper adjustments needed for deterministic coverage; do not broaden feature scope.
- [ ] **VERIFY:** Run focused service/API/UI/native browser tests, existing Admin regressions, then fresh `npm.cmd test`, `npm.cmd run build`, and `git diff --check`. Record the pre-existing baseline CDP timeout separately if it recurs; no success claim without a clean rerun or explicit failure report.
- [ ] **COMMIT:** Commit as `test(admin): verify dashboard in native browser`.
- [ ] **REVIEW:** Inspect the complete diff against every spec section and verify no entity/cache/audit writes or out-of-scope files. Stop for independent review; do not push, PR, merge, deploy, clasp, import, or clean worktrees.
