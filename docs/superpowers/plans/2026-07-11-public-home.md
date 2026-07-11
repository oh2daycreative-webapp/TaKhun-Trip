# Takhun Trip Public Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public home placeholder with a polished, accessible, mobile-first Takhun Trip landing page.

**Architecture:** Keep the existing static HTML/CSS/JavaScript structure. Semantic HTML supplies progressive content and mount points, `app.js` owns editable sample data and drawer/card behavior, and existing CSS files divide global tokens, components, and responsive rules.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript, PowerShell verification scripts, in-app browser QA.

## Global Constraints

- Work only on branch `feature/public-home-page` in the current isolated worktree.
- Do not switch branches, modify `main`, edit Apps Script, add a framework, add a CDN, rename important files, or commit before user review.
- Support widths from 360px upward with no horizontal overflow.
- Use local gradients and SVG only; make no external image request.
- Use the project design tokens and component naming guidance.
- Provide 44px minimum touch targets, accessible names, focus states, reduced-motion support, and mobile safe-area spacing.

---

### Task 1: Add Home Acceptance Checks

**Files:**
- Create: `scripts/test-home.ps1`
- Modify: `scripts/test.ps1`
- Test: `scripts/test-home.ps1`

**Interfaces:**
- Consumes: `public/index.html`, `public/js/app.js`, and the three public CSS files as UTF-8 text.
- Produces: a PowerShell check that exits non-zero when required Home semantics, links, data hooks, drawer accessibility, or mobile navigation rules are missing.

- [ ] **Step 1: Write the failing structural test**

Create `scripts/test-home.ps1` with assertions for `home-page`, `hero-section`, four quick actions, featured/routes/inspiration mount points, footer, accessible drawer controls, `aria-current="page"`, all required link targets, editable data arrays, `safe-area-inset-bottom`, and mobile-only bottom navigation.

- [ ] **Step 2: Wire it into the existing test runner**

Append this exact call before the success output in `scripts/test.ps1`:

```powershell
& (Join-Path $PSScriptRoot "test-home.ps1")
```

- [ ] **Step 3: Verify RED**

Run: `./scripts/test-home.ps1`

Expected: FAIL because the placeholder lacks `.home-page` and the required Home sections.

### Task 2: Build Semantic Home Markup

**Files:**
- Modify: `public/index.html`
- Test: `scripts/test-home.ps1`

**Interfaces:**
- Consumes: existing local page routes and shared script/style paths.
- Produces: navigation landmarks, `#mobile-menu`, `#featured-places`, `#recommended-routes`, and `#trip-inspiration` mounts used by CSS and JavaScript.

- [ ] **Step 1: Replace placeholder markup**

Add the approved sticky header, desktop navigation, hamburger button, secondary mobile drawer, hero, four quick actions, three data-driven sections with fallback cards, footer, drawer backdrop, and four-item mobile bottom navigation. Use inline SVG symbols/icons with decorative SVGs marked `aria-hidden="true"`.

- [ ] **Step 2: Verify the structural test still fails for missing behavior/styles**

Run: `./scripts/test-home.ps1`

Expected: FAIL on the first missing JavaScript data or responsive CSS assertion, proving the check covers more than markup.

### Task 3: Add Editable Home Data and Drawer Behavior

**Files:**
- Modify: `public/js/app.js`
- Test: `scripts/test-home.ps1`

**Interfaces:**
- Consumes: the three mount IDs and drawer controls from Task 2.
- Produces: `HOME_DATA`, safe card rendering, `openMobileMenu()`, and `closeMobileMenu({ restoreFocus })` behavior.

- [ ] **Step 1: Define sample data**

Add `HOME_DATA.featuredPlaces`, `HOME_DATA.recommendedRoutes`, and `HOME_DATA.tripInspiration` arrays using project destinations, valid local detail links, route stop counts, durations, and types.

- [ ] **Step 2: Render safe cards**

Implement DOM-node rendering with `textContent` and explicit attributes rather than interpolating untrusted HTML. Keep existing fallback content when a mount is absent or a collection is empty.

- [ ] **Step 3: Implement accessible drawer state**

Synchronize `aria-expanded`, `aria-hidden`, `hidden`, body scroll locking, Escape/backdrop/close-button behavior, and focus restoration. On open, focus the drawer close button.

- [ ] **Step 4: Verify JavaScript syntax**

Run: `node --check public/js/app.js`

Expected: exit code 0 with no output.

### Task 4: Apply Emerald Journey Presentation

**Files:**
- Modify: `public/css/main.css`
- Modify: `public/css/components.css`
- Modify: `public/css/mobile.css`
- Test: `scripts/test-home.ps1`

**Interfaces:**
- Consumes: component classes and state attributes from Tasks 2–3.
- Produces: scoped responsive Home UI with stable media placeholders and accessible interaction states.

- [ ] **Step 1: Extend global tokens and foundations**

Add the documented accent, water, sand, border, container, typography, focus ring, image/SVG, and overflow foundations without changing unrelated page layout behavior.

- [ ] **Step 2: Style Home components**

Implement sticky translucent header, brand mark, hero landscape gradient, buttons, quick-action tiles, place cards, route cards, inspiration cards, section headings, drawer, footer, and desktop grids in `components.css` under Home-specific selectors where practical.

- [ ] **Step 3: Add mobile behavior**

In `mobile.css`, show the hamburger and bottom navigation below the documented breakpoint, hide desktop navigation, present the side drawer, reserve safe-area-aware page padding, and collapse grids without overflow. Hide bottom navigation and mobile drawer controls on desktop.

- [ ] **Step 4: Respect reduced motion**

Disable transitions, smooth scrolling, and animated transforms inside `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Verify GREEN**

Run: `./scripts/test-home.ps1`

Expected: PASS with `Home page verification passed.`

### Task 5: Full Automated and Visual Verification

**Files:**
- Verify only; fix Tasks 2–4 files if a check exposes a defect.

**Interfaces:**
- Consumes: complete page and repository checks.
- Produces: evidence for handoff without committing.

- [ ] **Step 1: Run repository tests**

Run: `./scripts/test.ps1`

Expected: skeleton and Home verification both pass.

- [ ] **Step 2: Run build**

Run: `./scripts/build.ps1`

Expected: test output followed by `Static build check passed.`

- [ ] **Step 3: Run syntax and whitespace checks**

Run: `node --check public/js/app.js`

Expected: exit code 0.

Run: `git diff --check`

Expected: exit code 0 with no output.

- [ ] **Step 4: Inspect desktop in browser**

Open `http://localhost:5500`, use a desktop viewport, inspect all regions, activate navigation by keyboard, verify drawer controls are not shown, confirm no console error, and confirm `scrollWidth <= clientWidth`.

- [ ] **Step 5: Inspect 360px mobile in browser**

Use a 360px viewport, verify the four-item bottom navigation and active Home state, open and close the drawer by button/backdrop/Escape, verify focus restoration, scroll to the footer, confirm content is not obscured, and confirm `scrollWidth <= clientWidth`.

- [ ] **Step 6: Review the final diff without committing**

Run: `git status --short` and `git diff --stat`.

Expected: only the approved Home files, focused Home test, and the uncommitted design/plan documents are changed. Do not run `git commit`.
