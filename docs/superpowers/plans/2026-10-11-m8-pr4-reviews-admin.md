# M8 PR4 Reviews Admin CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a protected, role-correct Reviews Admin CMS while preserving the public Reviews contract and existing Sheet schema.

**Architecture:** Add an isolated `AdminReviewService` following the verified-write patterns used by Gallery and Routes, expose literal Router actions and strict Admin API facades, then replace the Reviews placeholder with a Thai responsive list/detail controller. Public freshness continues to use the existing Place cache epoch.

**Tech Stack:** Google Apps Script V8 JavaScript, browser JavaScript/HTML/CSS, Node `assert`/`vm` test harnesses, PowerShell regression runner.

**Spec:** `docs/superpowers/specs/2026-10-11-m8-pr4-reviews-admin-design.md`

## Global Constraints

- Work only on `feature/m8-reviews` in `J:\Projects\wt\takhun-m8-reviews` from base `bd2cfa7c5580a148601c0d5ce73f4c6c2d2a75e3`.
- Keep the existing Reviews Sheet schema and existing Place public cache epoch; add no configuration or Script Property requirement.
- Do not add a public review form.
- Mutation calls are single POST attempts with no automatic retry.
- Do not access remote Apps Script, Sheets, Script Properties, deployments, push, PR or merge.

## Review Focus

- Malformed Unicode, NUL, formula prefixes and reply length boundaries preserve or reject text before writes.
- Stale revisions and post-lock role/session changes write nothing.
- Entity uncertainty and audit-only failure remain observably different.
- Approved visibility, summary and reply caches are fresh after moderation.
- Stale browser responses and detail reloads do not destroy a reply draft.

---

### Task 1: Contract and execution record

**Files:** Create the spec and this plan; update Reviews sections in `docs/DATA_SCHEMA.md`, `docs/API_SPEC.md`, `docs/ADMIN_CMS_SPEC.md`, and `docs/TESTING_CHECKLIST.md` with the approved contract.

- [ ] Commit the authoritative contract and implementation plan.

### Task 2: Backend service

**Files:** Create `scripts/test-admin-review-service.js`; create `apps-script/AdminReviewService.gs`.

**Interfaces:** Produces the seven protected functions named in the spec and safe list/detail/write projections containing deterministic revisions.

- [ ] Write service tests and run them to observe missing-service failures.
- [ ] Implement authorization, validation, reads, lifecycle, lock/re-auth, revision, verified writes, audit separation and cache freshness.
- [ ] Run the focused service suite green and commit.

### Task 3: Router and Admin API

**Files:** Modify `apps-script/Router.gs`, `public/admin/js/admin-api.js`, `scripts/test-apps-script.js`, `scripts/test-admin-api.js`; create `scripts/test-admin-reviews-api.js`.

**Interfaces:** Consumes Task 2 functions; produces strict `TakhunAdminApi` Reviews methods.

- [ ] Write failing Router/API contract tests.
- [ ] Add literal routes, request builders, strict response validators and frozen facade methods.
- [ ] Run focused Router/API suites green and commit.

### Task 4: Thai Admin Reviews UI

**Files:** Modify `public/admin/reviews.html` and Admin CSS; create `public/admin/js/admin-reviews.js` and `scripts/test-admin-reviews-ui.js`.

**Interfaces:** Consumes Task 3 facade methods and the established Admin shell/auth APIs.

- [ ] Write failing role, safe rendering, stale-response, single-flight and reply-draft tests.
- [ ] Implement responsive Thai list/detail moderation UI with accessible feedback and explicit reconciliation.
- [ ] Run the focused UI suite green and commit.

### Task 5: Documentation, runner and regression

**Files:** Modify `scripts/test.ps1` and the four contract documents named in Task 1 as required by the implemented exact contract.

- [ ] Add all focused suites and required files to the full runner; observe the runner contract fail before the change.
- [ ] Run all focused suites, `cmd /c npm test`, `cmd /c npm run build`, tracked JavaScript syntax checks and `git diff --check`.
- [ ] Use the available Windows browser tooling for a local Admin Reviews smoke check and record limitations truthfully.
- [ ] Commit final regression/documentation integration and stop for independent review.
