# Public Place Detail Page Implementation Plan

> **For agentic workers:** Execute inline with `superpowers:executing-plans`. Do not commit or push before the user's Visual QA.

**Goal:** Build a mock-only, bilingual Public Place Detail page that shares one immutable data source with Places List and preserves every existing public-page behavior.

**Architecture:** Add `place-data.js` as the single normalized mock repository. Keep list behavior in `places.js` and add an isolated `place-detail.js` controller that renders safe DOM nodes, validates `id`, and owns detail-only interactions. All new styles remain scoped below `.place-detail-page`.

**Tech Stack:** Static HTML, CSS, Vanilla JavaScript, Node.js assertions, PowerShell contract tests.

## Global Constraints

- Work only on `feature/public-place-detail-page`; do not switch branches.
- Do not modify Apps Script, backend, APIs, Cloudflare configuration, Home, or Global Shell.
- Do not add dependencies or frameworks.
- Every record remains visibly mock/demo and unverified.
- Reviews are approved mock display plus a disabled/read-only form; never submit or persist reviews.
- Do not commit or push before user Visual QA.

---

### Task 1: Shared Place Data

**Files:**
- Create: `public/js/place-data.js`
- Modify: `public/js/places.js`
- Modify: `public/places.html`
- Test: `scripts/test-place-detail.js`
- Test: `scripts/test-places.js`

**Interfaces:**
- Produces: `TakhunPlaceData.listPlaces()`, `getPlaceById(id)`, `getNearbyPlaces(ids, currentId)`
- Preserves: 14 IDs in original order, 13 published and 1 draft

- [ ] Write failing assertions that the shared API exists, returns defensive copies, normalizes detail fields, preserves counts/order, and filters/deduplicates nearby records.
- [ ] Run `node scripts/test-place-detail.js`; expect failure because `place-data.js` does not exist.
- [ ] Add the immutable mock repository and move the existing records into it without changing list fields.
- [ ] Change `places.js::loadPlaces()` to call `TakhunPlaceData.listPlaces()`; load the shared script before `places.js`.
- [ ] Run Places and shared-data tests; expect all assertions to pass.

### Task 2: Query Validation and Detail State

**Files:**
- Create: `public/js/place-detail.js`
- Test: `scripts/test-place-detail.js`

**Interfaces:**
- Produces: `TakhunPlaceDetail.parsePlaceId(search)`, `validatePlaceId(id)`, `findPublishedPlace(id)`

- [ ] Add failing tests for missing, whitespace, invalid, over-64, encoded, published, draft, and unknown IDs.
- [ ] Run the focused Node test and confirm failures are caused by missing detail API.
- [ ] Implement exact-match validation with `/^[A-Za-z0-9_-]+$/`, no fallback, and published-only lookup.
- [ ] Re-run the focused tests and confirm green.

### Task 3: Semantic Detail Markup and Safe Rendering

**Files:**
- Modify: `public/place-detail.html`
- Modify: `public/js/place-detail.js`
- Create: `scripts/test-place-detail.ps1`
- Test: `scripts/test-place-detail.js`

**Interfaces:**
- Consumes shared normalized place records.
- Produces loading, ready, not-found, and error rendering without dynamic `innerHTML`.

- [ ] Add failing HTML/controller contracts for page class, demo notice, semantic mounts, script order, safe DOM APIs, and state handling.
- [ ] Replace the placeholder with accessible fallback markup and detail section mounts.
- [ ] Implement localized safe rendering, conditional sections, dynamic title, image fallbacks, and language-change re-render.
- [ ] Run Node and PowerShell detail tests until green.

### Task 4: Actions, Gallery, Nearby, and Reviews

**Files:**
- Modify: `public/js/place-detail.js`
- Test: `scripts/test-place-detail.js`
- Test: `scripts/test-place-detail.ps1`

**Interfaces:**
- Reuses `TAKHUN_FAVORITES`.
- Provides conditional map, Google Maps, phone, planner, favorite, share, gallery dialog, nearby cards, approved reviews, and disabled review form.

- [ ] Add failing tests for conditional CTA URLs, favorites/storage failure, share/copy/cancel, gallery dialog contracts, nearby filtering, and approved-only reviews.
- [ ] Implement minimal behavior using safe DOM creation, encoded IDs, Web Share/clipboard fallbacks, focus-restoring lightbox, and no review submission.
- [ ] Re-run focused tests and confirm green.

### Task 5: i18n and Scoped Responsive Styling

**Files:**
- Modify: `public/js/i18n.js`
- Modify: `public/css/components.css`
- Modify: `public/css/mobile.css`
- Test: `scripts/test-place-detail.ps1`
- Test: `scripts/test-i18n.js`

- [ ] Add failing contracts for all Thai/English detail labels and `.place-detail-page` scoped selectors.
- [ ] Add detail translation keys without changing the central i18n API.
- [ ] Add mobile-first scoped hero, sections, CTA, gallery, nearby, reviews, visible focus, 200% zoom resilience, and reduced-motion rules.
- [ ] Run detail, i18n, foundation, Home, and Places tests.

### Task 6: Aggregate Verification

**Files:**
- Modify: `scripts/test.ps1`

- [ ] Add `test-place-detail.ps1` to the aggregate runner.
- [ ] Run `powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1`.
- [ ] Run `powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1`.
- [ ] Run `node --check` for every `public/js/*.js` and test JS file.
- [ ] Run `git diff --check`, forbidden-scope checks, and inspect final `git status`.
- [ ] Stop before commit/push and hand off the Visual QA checklist.
