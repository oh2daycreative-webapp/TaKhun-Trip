# M8 PR4 Independent Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair every confirmed M8 PR4 independent-review finding with behavioral regressions while preserving the existing Sheets schema, Script Properties, configuration, and single-request mutation semantics.

**Architecture:** Normalize the public writer and Admin reader around one stored-data policy, use strictly increasing canonical `updated_at` values for revisions, and serialize public cache fills with moderation through one non-nested script-lock boundary. Keep browser state review-owned and make the native browser runner bounded and process-scoped.

**Tech Stack:** Google Apps Script V8 JavaScript, browser JavaScript/HTML/CSS, Node `assert`/`vm` harnesses, PowerShell regression runner, native Edge/Chrome headless CLI.

**Spec:** `docs/superpowers/specs/2026-10-11-m8-pr4-independent-review-fixes-design.md`

## Global Constraints

- Work only in `J:\Projects\wt\takhun-m8-reviews` on `feature/m8-reviews`.
- Preserve the existing `reviews` and `activity_logs` schemas and existing Place cache epoch Script Property.
- Add no dependency, runtime configuration, telemetry system, Sheet migration, or automatic legacy-data repair.
- Use bounded script-lock waits and never reacquire the script lock from a helper called inside a locked section.
- Mutations remain one POST attempt with no automatic retry and truthful `OUTCOME_UNKNOWN` handling.
- Add local commits only; do not amend the five original M8 PR4 commits.
- Do not push, create a PR, merge, deploy, use clasp/import, access remote Sheets/Properties, change main, or clean worktrees.

## Review Focus

- A public submission containing NUL, lone surrogate, oversized text, or ambiguous apostrophe-formula text must be rejected before append, while an empty reviewer name remains readable in Admin.
- Invalid and duplicate legacy rows outside a requested target must not affect valid pagination/detail; the bad target itself must fail closed.
- Public read, public submission, and moderation contention must be bounded without nested lock acquisition or an unlocked cache-fill fallback.
- Multiple mutations in one wall-clock second and Date/string timestamp coercion must still change revisions monotonically and reject stale revisions.
- Dirty drafts, late detail responses, pending mutations, conflicts, and uncertain outcomes must never change the review target or silently lose/cross-apply text.

---

### Task 1: Stored-data compatibility and reply encoding

**Files:**
- Modify: `apps-script/ReviewService.gs`
- Modify: `apps-script/AdminReviewService.gs`
- Modify: `public/admin/js/admin-api.js`
- Modify: `scripts/test-review-service.js`
- Modify: `scripts/test-admin-review-service.js`
- Modify: `scripts/test-admin-reviews-api.js`

**Interfaces:**
- Produces: public validation helpers for Unicode/code-point/UTF-8 limits and ambiguous formula inputs; Admin raw-table classification returning valid unambiguous entries plus `skipped_count`.
- Consumes: existing `CryptoService_utf8Bytes_`, Sheet read/append helpers, and unchanged Review sheet headers.

- [ ] **Step 1: Add failing public-writer behavioral regressions**

Add tests proving empty `reviewer_name` is accepted, while NUL, lone surrogate, over-limit reviewer/comment values, and `'=`, `'+`, `'-`, `'@` inputs are rejected before lock/append.

- [ ] **Step 2: Run the public Review suite and verify RED**

Run: `node scripts/test-review-service.js`
Expected: FAIL because current normalization accepts unsafe values or uses incompatible limits.

- [ ] **Step 3: Implement compatible public validation**

Add explicit Unicode/code-point/UTF-8 validation to `ReviewService_normalizeSubmission_`; retain empty reviewer names and direct formula-prefix escaping, and reject ambiguous apostrophe-prefix inputs.

- [ ] **Step 4: Add failing Admin legacy-row regressions**

Add tests proving list skips invalid and every duplicate-ID row, computes pagination/total from valid unambiguous records, returns an exact safe `warning:{code:"SKIPPED_INVALID_REVIEWS",skipped_count:N}` or `null`, and permits unrelated valid detail/mutation while invalid or duplicate targets fail closed.

- [ ] **Step 5: Run Admin service/API suites and verify RED**

Run: `node scripts/test-admin-review-service.js` and `node scripts/test-admin-reviews-api.js`
Expected: FAIL because one invalid row currently poisons the table, list has no warning, empty reviewer names are rejected by the client, and ambiguous replies are accepted then transformed.

- [ ] **Step 6: Implement row classification and exact response validation**

Separate raw table reads from per-row validation, exclude every duplicate ID from lists, resolve detail/mutation targets against raw rows, add the safe warning field, allow empty reviewer names in API responses, and reject ambiguous replies before write.

- [ ] **Step 7: Run focused compatibility suites and verify GREEN**

Run: `node scripts/test-review-service.js; node scripts/test-admin-review-service.js; node scripts/test-admin-reviews-api.js`
Expected: all pass.

- [ ] **Step 8: Commit**

Commit message: `fix: harden review data compatibility`

---

### Task 2: Monotonic revisions and cache-lock protocol

**Files:**
- Modify: `apps-script/ReviewService.gs`
- Modify: `apps-script/AdminReviewService.gs`
- Modify: `scripts/test-review-service.js`
- Modify: `scripts/test-admin-review-service.js`

**Interfaces:**
- Produces: `ReviewService_withScriptLock_(operation)` as the only public Reviews lock boundary; canonical strictly increasing mutation timestamps included in `AdminReviewService_revision_`.
- Consumes: Task 1 raw-row classification and existing Place cache epoch functions.

- [ ] **Step 1: Add failing monotonic revision regressions**

Test hide→approve and reply→clear cycles, multiple mutations at a fixed wall clock, Date/string canonical equivalence, strictly increasing stored `updated_at`, and rejection of every prior revision.

- [ ] **Step 2: Run Admin service suite and verify RED**

Run: `node scripts/test-admin-review-service.js`
Expected: FAIL with ABA revision equality or non-increasing `updated_at`.

- [ ] **Step 3: Implement canonical monotonic timestamps and revisions**

Canonicalize Date/string timestamps, compute the next mutation timestamp as `max(current wall-clock second, stored updated_at + 1 second)` under lock, and include canonical `updated_at` in the revision hash.

- [ ] **Step 4: Add failing lock/cache interleaving regressions**

Exercise cache miss/fill versus moderation, public submission versus moderation, lock timeout, cache read/write failure, epoch failure before write, entity uncertainty after write attempt, and assert each call path acquires at most one script lock with no unlocked cache fallback.

- [ ] **Step 5: Run public/Admin service suites and verify RED**

Run: `node scripts/test-review-service.js; node scripts/test-admin-review-service.js`
Expected: FAIL because public cache fills and the Place publication check are currently outside the shared locked boundary.

- [ ] **Step 6: Implement the single lock-ownership protocol**

Wrap public cache epoch read/cache check/loader/cache put in one bounded lock owner; move public submission's authoritative Place check inside its existing lock; keep all called helpers lock-free. Preserve mutation bump-before-write semantics while preventing any public cache fill from interleaving.

- [ ] **Step 7: Run focused concurrency suites and verify GREEN**

Run: `node scripts/test-review-service.js; node scripts/test-admin-review-service.js; node scripts/test-place-service.js`
Expected: all pass.

- [ ] **Step 8: Commit**

Commit message: `fix: serialize review cache and revisions`

---

### Task 3: Admin API, draft ownership, and accessible interaction

**Files:**
- Modify: `public/admin/js/admin-api.js`
- Modify: `public/admin/js/admin-reviews.js`
- Modify: `public/admin/reviews.html`
- Modify: `public/css/admin.css`
- Modify: `scripts/test-admin-reviews-api.js`
- Modify: `scripts/test-admin-reviews-ui.js`

**Interfaces:**
- Produces: exact `CONTENT_LOCK` client error; review-keyed drafts; explicit dirty-selection confirmation; reload reconciliation; immediate pending render; detail/list focus transfer.
- Consumes: Task 1 list warning envelope and Task 2 fresh revision semantics.

- [ ] **Step 1: Add failing API/UI behavioral regressions**

Test exact `CONTENT_LOCK`, one fetch only, warning validation, A→B dirty-draft cancellation/discard, immutable mutation target during pending work, late detail suppression, same-review authoritative reload preserving its draft while clearing blocked, and controls disabled immediately.

- [ ] **Step 2: Add a behavioral DOM harness and focus/safe-render regressions**

Execute `initDom` against real test DOM objects and assert user HTML remains text, detail heading receives focus, Back restores the originating card, keyboard button activation remains native, and action targets retain the 44px CSS contract.

- [ ] **Step 3: Run Admin API/UI suites and verify RED**

Run: `node scripts/test-admin-reviews-api.js; node scripts/test-admin-reviews-ui.js`
Expected: FAIL on current global draft ownership, sticky blocked state, non-rendered pending state, missing focus behavior, and collapsed lock error.

- [ ] **Step 4: Implement API and controller/view state changes**

Map `CONTENT_LOCK`, retain single-request transport, store drafts by review ID, require explicit discard for dirty cross-selection, capture mutation target/revision/draft before dispatch, block selection while pending, reconcile same-review reloads, render pending controls, and implement focus transfer/restoration without unsafe DOM sinks.

- [ ] **Step 5: Run focused browser-client suites and verify GREEN**

Run: `node scripts/test-admin-reviews-api.js; node scripts/test-admin-reviews-ui.js; node scripts/test-admin-shell.js`
Expected: all pass.

- [ ] **Step 6: Commit**

Commit message: `fix: reconcile admin review interactions`

---

### Task 4: Bounded native runner and standalone contract documentation

**Files:**
- Modify: `scripts/test-admin-content-browser.js`
- Create: `scripts/test-admin-content-browser-runner.js`
- Create: `scripts/test-admin-content-browser-runner-tests.js`
- Modify: `scripts/test.ps1`
- Modify: `docs/API_SPEC.md`
- Modify: `docs/ADMIN_CMS_SPEC.md`
- Modify: `docs/DATA_SCHEMA.md`
- Modify: `docs/TESTING_CHECKLIST.md`
- Modify: `docs/superpowers/specs/2026-10-11-m8-pr4-reviews-admin-design.md`

**Interfaces:**
- Produces: bounded native-browser runner returning pass/failure/timeout and terminating only its spawned PID tree; standalone Reviews API/lifecycle/error/timestamp/warning contract.
- Consumes: Tasks 1–3 exact server and browser contracts.

- [ ] **Step 1: Add failing native-runner behavioral tests**

Use controlled child fixtures to prove success, nonzero failure, timeout failure, scoped tree termination, and temporary-profile cleanup without process enumeration or unrelated termination.

- [ ] **Step 2: Run runner tests and verify RED**

Run: `node scripts/test-admin-content-browser-runner-tests.js`
Expected: FAIL because the bounded runner module does not exist.

- [ ] **Step 3: Implement bounded scoped process execution**

Use asynchronous `spawn`, a fixed timeout, PID-specific Windows tree termination on timeout, and cleanup limited to the invocation's temporary directory. Keep timeout as a nonzero test failure.

- [ ] **Step 4: Run runner tests and bounded native suite**

Run: `node scripts/test-admin-content-browser-runner-tests.js; node scripts/test-admin-content-browser.js`
Expected: runner tests pass; native suite either passes within the bound or exits nonzero with an explicit timeout/failure message.

- [ ] **Step 5: Update exact standalone documentation**

Document request bodies, success/error envelopes, permissions, lifecycle, pagination, list warning, detail/mutation projections, `expected_revision`, monotonic `updated_at`, audit warning, `CONTENT_LOCK`, `OUTCOME_UNKNOWN`, reply limits/ambiguous rejection, and unchanged schema/config requirements.

- [ ] **Step 6: Run focused documentation/runner regressions and verify GREEN**

Run: `node scripts/test-admin-content-browser-runner-tests.js; node scripts/test-admin-reviews-api.js; node scripts/test-admin-review-service.js; node scripts/test-admin-reviews-ui.js`
Expected: all pass.

- [ ] **Step 7: Commit**

Commit message: `test: bound browser runner and document reviews`

---

### Task 5: Whole-branch verification and handoff

**Files:**
- Modify only if a new Critical/Important final-review finding requires a RED→GREEN fix.

**Interfaces:**
- Consumes: all prior tasks and commits.
- Produces: verified branch state and finding-to-commit evidence for independent re-review.

- [ ] **Step 1: Run focused and related regressions**

Run all Reviews backend/API/UI, public Review, Auth, Sheet, Place/cache, shell, Router, and integrated Admin Place suites.

- [ ] **Step 2: Run full validation**

Run: `npm test`, `npm run build`, JavaScript syntax checks, Apps Script static parser suite, and `git diff --check bd2cfa7c5580a148601c0d5ce73f4c6c2d2a75e3..HEAD`.

- [ ] **Step 3: Run bounded native browser validation once**

Run with the runner's own timeout. Record pass, explicit failure, or timeout truthfully; do not rerun a hang without a new hypothesis.

- [ ] **Step 4: Perform final whole-branch review**

Review source, tests, contracts, process behavior, commits, status, and every Review Focus item. Any Critical/Important finding receives one RED→GREEN fix pass and a local commit.

- [ ] **Step 5: Stop before independent re-review**

Report new HEAD, clean/dirty status, diff summary, finding→fix commit→regression mapping, commands and actual results, browser/full-runner gaps, and do not push/PR/merge/deploy.
