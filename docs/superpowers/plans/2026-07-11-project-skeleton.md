# Takhun Trip Project Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the approved static Takhun Trip project skeleton so every requested HTML page can be opened and all requested source files exist without complex application behavior.

**Architecture:** Deployable files live directly under `public/`, with shared native CSS and JavaScript referenced by each HTML page. Admin pages live under `public/admin/` and Google Apps Script entry-point files live under `apps-script/`; no framework, dependency manager, build step, data records, or undocumented route is introduced.

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript, Google Apps Script

## Global Constraints

- Create only the directories and implementation files explicitly approved in the user request.
- Do not create `search.html` or any other undocumented route.
- Do not add a framework, package manager, dependency, or build system.
- Do not add substantial mock data, real credentials, or secrets.
- Keep JavaScript and Apps Script behavior minimal.
- Use structural verification as the user-approved exception to test-driven development for scaffolding/configuration.

---

### Task 1: Static Public and Admin Skeleton

**Files:**
- Create: all approved files below `public/`
- Create: `public/assets/icons/.gitkeep`
- Create: `public/assets/images/.gitkeep`
- Create: `public/assets/videos/.gitkeep`

**Interfaces:**
- Consumes: the paths and page titles defined by `docs/ROUTES_AND_PAGES.md`
- Produces: directly openable HTML pages referencing `css/main.css`, `css/components.css`, `css/mobile.css`, and shared JavaScript with correct relative paths

- [ ] **Step 1: Confirm the requested public paths are absent or safe to create**

Run:

```powershell
git status --short
rg --files public
```

Expected: no existing user implementation is overwritten without inspection.

- [ ] **Step 2: Create the public HTML skeletons**

Each public document must contain this minimum structure, with page-specific titles, headings, and relative links:

```html
<!doctype html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PAGE_TITLE</title>
  <meta name="description" content="Takhun Trip เว็บแอปแนะนำการท่องเที่ยวบ้านตาขุน">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/mobile.css">
</head>
<body>
  <header class="site-header"><a href="index.html">Takhun Trip</a></header>
  <main class="page-shell"><h1>PAGE_HEADING</h1><p class="placeholder">หน้านี้อยู่ระหว่างการจัดเตรียม</p></main>
  <script src="js/config.js"></script>
  <script src="js/i18n.js"></script>
  <script src="js/api.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

Admin pages use `../css/...` and a compact Admin navigation. The login page uses labeled username/password fields with a disabled submit button. The 404 pages contain only documented recovery links.

- [ ] **Step 3: Create minimal shared CSS and JavaScript**

Create CSS with design tokens, readable layout, placeholder panels, responsive rules, Admin layout distinction, and a map placeholder. Create `config.js` with an empty `API_URL`, production `SITE_URL`, and `DEFAULT_LANG: "th"`; create the other JavaScript files as strict-mode, syntax-valid namespaces or small initialization handlers without fetching data.

- [ ] **Step 4: Verify public structure and references**

Run a PowerShell structural check that compares the requested file list with the filesystem, checks every HTML file for charset, viewport, title, and `<main>`, and resolves every local CSS/JS `href`/`src` reference.

Expected: zero missing files and zero broken local asset references.

---

### Task 2: Google Apps Script Skeleton

**Files:**
- Create: `apps-script/Code.gs`
- Create: `apps-script/Config.gs`
- Create: `apps-script/Router.gs`
- Create: `apps-script/ApiResponse.gs`
- Create: `apps-script/SheetService.gs`

**Interfaces:**
- Consumes: Google Apps Script request objects passed to `doGet(e)` and `doPost(e)`
- Produces: JSON output using `{ ok, data, message }` or `{ ok, error }` without accessing Google Sheets

- [ ] **Step 1: Create minimal entry points and response helpers**

`Code.gs` delegates both entry points to `routeRequest_`. `Router.gs` returns a small service-ready response and does not implement actions. `ApiResponse.gs` creates JSON output. `Config.gs` reads configuration from Script Properties rather than embedding secrets. `SheetService.gs` contains only a documented empty boundary for later sheet access.

- [ ] **Step 2: Verify source constraints**

Search implementation files for framework/build-system markers, secrets, external data records, and undocumented HTML routes.

Expected: none found.

- [ ] **Step 3: Run final verification**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only the approved skeleton, asset placeholders, and Superpowers documents are new.
