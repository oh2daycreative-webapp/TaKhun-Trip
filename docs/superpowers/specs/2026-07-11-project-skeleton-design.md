# Takhun Trip Project Skeleton Design

## Objective

Create the documented Takhun Trip directory structure and the explicitly requested public, admin, CSS, JavaScript, and Google Apps Script files. The result is a static skeleton whose HTML pages can be opened for basic inspection without implementing application features or introducing mock tourism data.

## Scope

Create only the directories and files named in the approved request. Do not add `search.html`, page-specific JavaScript files, Admin JavaScript modules, service modules, frameworks, package managers, or build tooling during this task.

## Architecture

- `public/` contains directly deployable static HTML pages.
- `public/css/` contains small shared stylesheets separated by the responsibilities defined in `DEVELOPMENT_RULES.md`.
- `public/js/` contains safe configuration and minimal shared JavaScript placeholders.
- `public/admin/` contains directly accessible Admin skeleton pages without working authentication or CRUD behavior.
- `apps-script/` contains the five requested Google Apps Script source files with only minimal entry-point and response structure where useful.

## Public Pages

Every public page will include UTF-8 metadata, a viewport declaration, a meaningful page title and description, links to shared CSS, a simple navigation path, a semantic main section, and shared JavaScript references. Content will state that the page is being prepared; it will not contain place, route, product, event, gallery, or review records.

The public 404 page will provide a link back to `index.html`. Detail pages will remain non-functional skeletons and will not fabricate query data.

## Admin Pages

The login page will contain a non-functional accessible form skeleton. Other Admin pages will contain a simple Admin navigation, page heading, and placeholder content. The Admin 404 page will link to `dashboard.html` and `login.html`.

Authentication, session checks, API requests, forms, tables, dialogs, and CRUD actions are explicitly deferred.

## CSS and JavaScript

CSS will provide only enough base layout, typography, navigation, placeholder panels, responsive behavior, Admin distinction, and map placeholder sizing to make pages readable. It will use native CSS without dependencies.

`config.js` will expose the documented non-secret application configuration with an empty API URL. `api.js`, `i18n.js`, and `app.js` will avoid complex behavior and network calls. They must load without syntax errors.

## Google Apps Script

The requested `.gs` files will establish file responsibilities without Google Sheets integration. `Code.gs` may expose minimal `doGet` and `doPost` entry points routed through `Router.gs`; responses will use `ApiResponse.gs`. Configuration will avoid real spreadsheet IDs and secrets. `SheetService.gs` will not read or write data yet.

## Verification

Because the approved deliverable is scaffolding and configuration rather than application behavior, use structural verification instead of unit-test-first development:

1. Confirm every requested directory exists.
2. Confirm every requested file exists and no undocumented route was added.
3. Check that local CSS and JavaScript references resolve.
4. Parse/check JavaScript syntax where the installed runtime permits it.
5. Check HTML pages for UTF-8 charset, viewport metadata, title, and semantic main content.
6. Run `git diff --check` and inspect the final diff summary.

## Constraints

- No framework.
- No build system.
- No route outside the approved list.
- No substantial mock data.
- No secrets or real credentials.
- No complex functions.
- Preserve the documentation-first, mobile-first, and static Cloudflare Pages direction.
