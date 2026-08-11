# Milestone 7 — Admin Places CMS Design

**Date:** 2026-08-10

**Status:** Approved design baseline for implementation planning

**Scope:** Admin Places CMS only; this document changes no runtime behavior

## 1. Goal

Milestone 7 adds an authenticated, role-authorized Admin Places content-management module that can list, create, edit, publish, unpublish, archive, and restore Places without weakening the existing Public Place, Admin authentication, Admin shell, or production-media contracts.

The implementation must keep a published Place snapshot logically separate from its one active Draft Revision. Saving edits to a published Place must never alter what Public consumers receive. Only an explicit Publish operation may promote the Draft Revision to the new Published Version.

## 2. Approved Decisions

- Add a dedicated Admin Places UI, Admin Place API, and Admin Place Service boundary. Do not convert Public Place APIs into CRUD endpoints and do not create a generic CMS framework.
- Use `admin/places.html` for the responsive list and `admin/place-edit.html` for one full-page Create/Edit experience.
- Reuse the implemented Admin authentication and shell. Preserve POST-body bearer-token transport, `sessionStorage`, the eight-hour absolute session lifetime, and protected-content no-flash behavior.
- `super_admin` and `editor` may read and perform every M7 Place write. `reviewer` may read published and draft data for review. `viewer` may read. `reviewer` and `viewer` may not write.
- Use exactly three authoritative statuses for the M7 Place lifecycle: `draft`, `published`, and `archived`. This is Place-specific and does not replace status vocabularies for Routes, Reviews, Gallery, Admin accounts, or any other entity.
- Treat “Published + Draft Revision” as derived UI state, never as a persisted status.
- Generate and control immutable Place IDs on the server.
- Thai is required for Publish; English is optional and continues to use the existing Public Thai fallback behavior.
- Use the existing fixed Place category enum. Category management is outside M7.
- Use latitude/longitude inputs plus an interactive Leaflet/OpenStreetMap picker. Never request browser location automatically.
- Select only approved production media references. M7 performs no uploads and accepts no arbitrary external image URL as a media selection.
- Use optimistic concurrency with server-controlled versions, a server-side script lock around write critical sections, no automatic merge, and no force overwrite.
- Archive is reversible soft archive. Dependency preview informs the user, but the server repeats the dependency check inside the authoritative archive write.
- Every successful lifecycle write has a required audit record. Audit failure is fail-closed with compensating rollback and verification.
- Place writes have no automatic retries. Reads may expose an explicit “ลองใหม่” control and do not poll.

## 3. Verified Current Contracts

This design was reconciled against `ADMIN_CMS_SPEC.md`, `API_SPEC.md`, `DATA_SCHEMA.md`, `DEVELOPMENT_RULES.md`, `TESTING_CHECKLIST.md`, the Milestone 6 Admin design, the production-media design, and the current source.

### 3.1 Implemented Admin foundation

- The current Router POST allowlist contains `submitReview`, `adminLogin`, `adminValidateSession`, and `adminLogout`; no Admin CMS action is implemented.
- Admin authentication accepts the raw token only in a JSON POST body sent as `text/plain;charset=utf-8`. It uses no GET authentication, query token, cookie, or `Authorization` header.
- `AuthService_requireAdmin_` validates the authoritative session and returns the safe Admin projection. It authenticates but does not yet implement Place-specific role authorization.
- The browser stores exactly `admin_id`, `display_name`, `role`, `token`, and `expires_at` in `sessionStorage` under `TAKHUN_ADMIN_SESSION`.
- The current Admin API client validates exact auth response shapes and performs one request with a 12-second timeout and no automatic retry.
- `API_SPEC.md` already defines `NOT_FOUND` as a standard error code. The implemented Admin browser allowlist does not yet accept it, and neither the current API nor source implements `CONFLICT`.
- `public/admin/places.html` is a protected shell placeholder. The shell owns navigation, responsive drawer behavior, focus management, identity, logout, retry, and protected-content reveal.
- The current safe return-page allowlist does not include `place-edit.html`. For an allowlisted filename it currently preserves the candidate search/hash after its global origin, directory, credential, traversal, and auth-material checks; M7 therefore needs a stricter page-specific query rule for the new edit page rather than a generic query pass-through.

### 3.2 Implemented Public Place contract

- `getPlaces`, `getPlaceDetail`, and `getMapPlaces` are public GET actions and project safe response objects rather than raw Sheet rows.
- All three public Place builders filter source rows to `status === "published"`.
- Public localization selects English only when requested and present, otherwise falls back to Thai.
- Coordinate validation already enforces a complete pair and numeric latitude `-90..90` and longitude `-180..180` for map inclusion.
- Routes and `route_places`, nearby Place IDs, products, events, reviews, gallery items, trip templates, search, map, trip planning, and browser favorites can refer to immutable `place_id` values.
- Favorites contain Place IDs in browser storage and normalize/load those IDs against currently available Place data; the server has no favorite-cleanup endpoint.

### 3.3 Implemented data and media contracts

- `DATA_SCHEMA.md` currently defines one `places` row shape with bilingual content, district/province/route/category, descriptions, activities, highlight, contact links, coordinates, opening time, fee, URL-era image fields, tags, nearby IDs, feature flags, sort order, status, and timestamps.
- The current Place category enum is: `main_point`, `community_tourism`, `nature`, `viewpoint`, `lake`, `activity`, `food_cafe`, `accommodation`, `temple_culture`, `product_shop`, `waterfall`, `cave`, and `service`.
- The current common status enum also contains `hidden` and `deleted`; that broad enum predates the approved M7 Place lifecycle.
- The current `activity_logs` contract uses `log_id`, `admin_id`, `action`, `entity_type`, `entity_id`, `description`, and `created_at`, with lower-case legacy action values.
- The production media manifest exposes safe public metadata and generated local WebP outputs, never source filenames. Place cover media currently uses `entity_type: "place"`, matching `entity_id`, and `role: "cover"`; Gallery media uses `role: "gallery"`. The runtime selects Place cover media deterministically from stable Place IDs and rejects unsafe output paths.
- The repository does not contain live production Sheet contents. Deployment must therefore audit live rows before applying any M7 schema migration.

## 4. Existing-Contract Reconciliation and M7 Extensions

The following are approved M7 extensions. They do not describe currently implemented behavior and must be added only during later implementation.

| Existing contract | Approved M7 extension | Compatibility rule |
| --- | --- | --- |
| Router has auth actions only | Add dedicated `admin*Place*` POST actions | Public GET actions and auth transport remain unchanged. |
| Future API prose names `createPlace`, `updatePlace`, and `deletePlace` | Use the canonical M7 action names in section 12 | Do not expose the older future CRUD names as aliases. |
| Common content statuses include `hidden` and `deleted` | M7 Places use exactly `draft`, `published`, `archived` | This is a Place-only lifecycle. Other entity modules keep their existing status vocabularies unchanged. Live legacy Place rows pass the explicit compatibility migration below before M7 activation. |
| One `places` shape has no revision boundary | Add a logically separate active Draft Revision representation and server versions | A normal Draft Save never overwrites the Published Version. Do not add a large `draft_*` column family to the published row. |
| No version field | Add server-controlled published/entity and active-draft version semantics | Exact Sheet headers and migration mechanics are fixed during implementation planning after live header inspection. |
| `activity_logs` uses older field/action names | Non-destructively extend `activity_logs` with `audit_id`, `actor_admin_id`, and `occurred_at`, and add the six M7 actions | Existing rows and columns remain unchanged. M7 rows populate both the new authoritative fields and the legacy aliases for compatibility. |
| `NOT_FOUND` is globally documented, but the implemented Admin browser allowlist omits it; `CONFLICT` is not implemented | Extend the Admin safe-code allowlist to accept existing `NOT_FOUND`; add `CONFLICT` as the M7 concurrency outcome | Preserve the existing safe envelope. Unknown backend codes still normalize to `SERVER_ERROR`; no internal detail is exposed. |
| Protected return allowlist omits `place-edit.html`, while generic allowlisted targets retain search/hash | Add `place-edit.html` with the exact M7 query contract in section 11.4 | Do not generally loosen or reinterpret existing safe-return targets. Invalid edit context falls back to `places.html`. |
| Place schema has no address or facilities field | Add localized address and facilities capabilities required by the approved M7 content scope | Their exact physical Sheet representation is decided during schema reconciliation; do not pretend existing headers provide them. District, province, and route group remain the existing area/location fields. |
| URL-era image fields exist while Public production rendering is manifest-driven | Hero selection is restricted to the existing same-Place canonical cover; Place Gallery requires the explicit M7 manifest/schema/runtime extension in section 10.3 | Never reactivate arbitrary remote URL rendering or allow cross-Place/cross-role selection. |

Legacy Place compatibility is deterministic and non-destructive. No normal M7 read or write silently rewrites a legacy row. Before M7 actions are enabled, an explicit operator migration must:

1. make and verify a recoverable backup of the complete Place source;
2. validate headers, unique Place IDs, and every source status, then produce a dry-run count and ID report;
3. abort without changing live data on an unknown status, duplicate ID, invalid row, missing backup, or failed verification;
4. copy every legacy row's complete content into the appropriate new Place/version representation before changing its lifecycle value;
5. map `published` to a Published Version with Place status `published`, map `draft` to an active Draft Revision with Place status `draft`, retain `archived` content with Place status `archived`, map `hidden` to a retained active Draft Revision with Place status `draft`, and map `deleted` to retained archived content with Place status `archived`;
6. preserve the original immutable `place_id`, content, relationships, timestamps where semantically valid, and backup evidence; and
7. reread-verify every migrated record and status count before activation.

The `hidden -> draft` and `deleted -> archived` mappings preserve their previous non-public visibility. They do not delete rows or content, republish anything, mutate other entity statuses, or perform an unannounced in-request migration. If any mutation or verification fails after migration begins, the operator restores the complete backup, reread-verifies the restored source, and leaves M7 disabled; a partially migrated source is never activated.

## 5. Approaches Considered

### 5.1 Dedicated Admin Places module — selected

The UI calls Admin-only actions; the Router authenticates and authorizes; an Admin Place Service owns projections, validation, lifecycle, dependency checks, concurrency, audit, and data-layer calls. This follows existing file separation, prevents Public API privilege expansion, and provides a concrete pattern later CMS modules may copy without creating a framework.

### 5.2 Add writes to Public Place services — rejected

Combining public reads and privileged writes would blur authentication boundaries, increase exposure risk, and make it easier to return draft or internal data to Public consumers.

### 5.3 Build a generic CMS/revision/transaction engine — rejected

A framework would expand scope across unrelated entity types before their workflows are known. M7 needs Place-specific lifecycle, revision, dependency, and rollback behavior only.

## 6. Architecture and Module Boundaries

```text
Admin Places UI
  -> existing Admin API transport
  -> Router POST action allowlist
  -> existing authoritative Admin session validation
  -> Place-specific role authorization
  -> Admin Place Service
       -> safe Admin projections
       -> draft/publish validation
       -> lifecycle state machine
       -> dependency inspection
       -> optimistic concurrency
       -> audit and compensating rollback
       -> existing Sheet/data utilities
  -> authoritative Google Sheets data

Public UI
  -> existing Public Place GET actions
  -> Published Version projection only
```

The Admin Place Service is Place-specific. It may use small helpers for validation, projection, media lookup, dependency lookup, and audit ordering, but M7 must not introduce a registry, plugin system, generic entity workflow, generic transaction abstraction, or generic recovery engine.

Read-only list/detail calls do not acquire the write lock. Each write acquires one script-scoped server lock for the critical section described in section 15.

## 7. Roles and Server Authorization

| Capability | `super_admin` | `editor` | `reviewer` | `viewer` |
| --- | :---: | :---: | :---: | :---: |
| List and detail | Yes | Yes | Yes | Yes |
| Inspect active Draft Revision | Yes | Yes | Yes | No privileged review annotation; ordinary read-only detail only |
| View current Published Version separately | Yes | Yes | Yes | Yes |
| Create | Yes | Yes | No | No |
| Save Draft | Yes | Yes | No | No |
| Publish | Yes | Yes | No | No |
| Unpublish | Yes | Yes | No | No |
| Archive | Yes | Yes | No | No |
| Restore | Yes | Yes | No | No |

Every Admin action first validates the session authoritatively. Every write action then checks that the returned authoritative role is `super_admin` or `editor`. The server ignores any client-supplied actor, role, status transition, timestamp, version increment, or audit identity.

An absent, malformed, expired, revoked, or inactive-linked session returns `UNAUTHORIZED`. A valid session lacking the capability returns `FORBIDDEN`. The same rule applies even if a client calls a hidden button or fabricates a POST request. M7 adds no reviewer approve/reject workflow.

## 8. Place-Specific Lifecycle and Revision Model

### 8.1 Authoritative status transitions

The transition table applies only to Place records managed by M7. It does not narrow or replace the global/common status list used by other entity types.

| From | Action | To | Result |
| --- | --- | --- | --- |
| New | Create | `draft` | System creates immutable Place identity and active Draft Revision. |
| `draft` | Publish | `published` | Validated draft becomes Published Version; active draft is consumed. |
| `draft` | Archive | `archived` | Draft is retained for possible restoration; no Public record is visible. |
| `published` | Unpublish | `draft` | Public visibility ends; an editable draft is initialized from the last Published Version if no active draft exists. |
| `published` | Archive | `archived` | Public visibility ends; retained content and any active draft are not destroyed. |
| `archived` | Restore | `draft` | Restores for editing only; never republishes. |

Direct `archived -> published` is invalid. Restore must return `draft`, after which a separate Publish request and full validation are required.

### 8.2 Logical records

- **Place Identity/Lifecycle:** immutable `place_id`, authoritative status, server timestamps/actors, and server-controlled entity version.
- **Published Version:** the last promoted Public content snapshot and its published version. It may exist while status is `published`, `draft` after Unpublish, or `archived`, but Public can read it only while lifecycle status is `published`.
- **Active Draft Revision:** at most one mutable working snapshot per Place, with its own draft version and base published version. It is logically and physically separated from ordinary Published Version writes.

For a new Place, the system creates an identity in `draft` and one active Draft Revision. There is no Published Version until Publish succeeds.

Opening Edit on a published Place is read-only at the server until the user saves. If an active Draft Revision exists, Admin Detail returns it as the working version. Otherwise it returns an editable projection based on the current Published Version without creating a row during the read. The first successful Draft Save creates the active revision under lock. This avoids writes caused merely by viewing a page.

Publishing promotes the complete active draft to the new Published Version, increments server-controlled versions, sets status to `published`, and removes or marks the active revision as consumed so no active draft remains. Historical revision browsing is not required.

The list derives display state as follows:

| Authoritative status | Active draft exists | UI state |
| --- | --- | --- |
| `draft` | Yes | Draft |
| `published` | No | Published |
| `published` | Yes | Published + Draft Revision (`มีฉบับร่าง`) |
| `archived` | Either retained state | Archived |

`published_with_draft` is never accepted, stored, returned as authoritative `status`, or used as a filter value. A safe response may include `has_active_draft: true` and a derived `display_state` for rendering.

## 9. Editable Content and Validation

The working projection covers the verified Public Place data contract and the approved M7 extensions:

- immutable, server-controlled `place_id`;
- `name_th`, `name_en`;
- `short_description_th`, `short_description_en`;
- `description_th`, `description_en`;
- `activities_th`, `activities_en`;
- `highlight_th`, `highlight_en`;
- localized address and facilities values as M7 schema/API extensions;
- `district`, `province`, `route_group`, `sub_category`;
- fixed `category`;
- `latitude`, `longitude`, `coordinate_status`, and `google_maps_url`;
- `open_time_th`, `open_time_en`, `fee_th`, `fee_en`;
- `phone`, `line_url`, `facebook_url`, `website_url`;
- `tags`, `recommended_duration`, `best_time_th`, `best_time_en`;
- `nearby_place_ids`, `is_featured`, `is_main_route_point`, and `sort_order` required by Map, Route, Search, Home, and related-Place consumers;
- approved canonical Place-cover coverage and ordered Place-gallery media references;
- lifecycle and concurrency metadata as safe read-only projections.

The UI does not populate absent optional fields with sample or placeholder data. Empty optional values remain empty.

### 9.1 Draft validation

Draft Save validates structure and safety but allows incomplete Publish-required content. It requires a valid server-known Place identity for updates, valid types and bounded lengths, enum membership for any supplied enum, paired coordinates when either is supplied, coordinate ranges, safe URL schemes for verified contact/navigation links, valid related IDs, fixed categories, and approved media references. It rejects unknown/system fields rather than trusting them.

For Create, an otherwise empty draft is permitted only after the server can generate an immutable ID and store a structurally valid revision. The UI should require a useful Thai name before enabling Create to avoid anonymous list rows, but Publish completeness remains the authoritative server gate.

### 9.2 Publish validation

Publish repeats all Draft validation and additionally requires the existing Thai/public essentials: `name_th`, `district`, `province`, `category`, `short_description_th`, `description_th`, and a valid `coordinate_status`. Any approved address/facilities field may remain empty unless the Public contract makes it essential. Coordinates may both be empty for a Place that should appear in lists but not on the map; if either is present, both and their ranges are required.

English is optional. Missing English values are stored as empty values and remain compatible with Public Thai fallback. Publish never fabricates English text.

## 10. Category, Map, and Media Contracts

### 10.1 Category

The form uses a fixed dropdown containing exactly the canonical Place category enum listed in section 3.3. Both client and server reject any other value. M7 cannot add, rename, delete, reorder authoritatively, or archive categories and does not create a category-management UI.

### 10.2 Map picker

The Admin map uses the existing Leaflet.js/OpenStreetMap direction and is progressively enhanced:

- latitude and longitude are labeled text/number inputs that remain usable without the map;
- clicking the map sets both inputs and places/moves the marker;
- dragging the marker updates both inputs;
- manually entering a complete valid pair moves the marker;
- incomplete, non-numeric, out-of-range values show accessible inline validation and do not move the marker;
- latitude must be `-90..90`; longitude must be `-180..180`;
- keyboard users can edit the coordinate fields and activate zoom controls without requiring pointer-only map interaction;
- the page never calls `navigator.geolocation` automatically or provides a current-location action in M7;
- “เปิด/ตรวจสอบใน Google Maps” opens a validated existing `google_maps_url`, or a safely generated HTTPS Google Maps query from a valid coordinate pair, in a new tab with `noopener noreferrer`.

Task 13 uses the viewport-only default center `8.900000, 98.800000` at zoom `10` whenever no complete valid pair exists. The default is not Place data: it does not populate the inputs, create a marker, mutate form content, or enter the Save payload. Map clicks and marker drag completion validate finite in-range numbers and serialize both fields with the single canonical rule equivalent to `Number(value).toFixed(6)`. Valid manual input remains textually unchanged (for example, `"8.9"` and `"98.8001"`) while its numeric values position the one permitted marker; invalid or incomplete input never moves that marker and blank input never becomes zero. Save continues to derive from the validated current inputs, so blank/incomplete coordinates remain empty and no viewport default is persisted. A later deliberate map click or drag may replace preserved manual text with canonical six-decimal strings.

### 10.3 Approved media selector

The frozen Public media model remains authoritative: local production images come from the validated public manifest, and ordinary Place cover IDs are derived from stable entity IDs and roles. M7 does not replace this with client-supplied URLs or a general media-ID picker.

The selector consumes a server-produced safe projection of the deployed public production manifest. The backend obtains that manifest from a server-owned HTTPS production-manifest URL configured in Script Properties and constrained to the approved production frontend origin; neither the URL nor origin can come from a request. A fetch, parse, origin, or schema failure fails closed, and Place writes do not retry it automatically. Admin responses never expose `media/media-spec.json`, `source_file`, `media-source`, private paths, or raw manifest objects.

Each selectable item contains only the public `media_id`, compatible entity/role metadata, localized alt text, and validated generated/fallback preview paths. The server revalidates every submitted ID against its authoritative approved manifest view during Draft Save and Publish.

- **Hero/cover, no runtime replacement:** “Hero” is the CMS presentation label for the existing Place `cover` role. Admin may select only the one manifest entry whose `media_id` equals the current `TakhunMedia.mediaIdFor("place", place_id)` result, whose `entity_type` is `place`, whose `entity_id` exactly equals the immutable Place ID, whose `role` is `cover`, and whose outputs pass the existing local-path validation. Admin cannot choose another Place's cover, a Home hero, a Gallery item, or any other role. Public Places, Place Detail, Map, Routes, Search, Favorites, and nearby cards continue deriving the cover from `place_id`; no arbitrary hero reference overrides that derivation.
- **Place Gallery, explicit M7 extension:** the current manifest contains no approved Place-gallery entries and `place-detail.js` intentionally keeps the Place gallery hidden. M7 Gallery selection therefore requires deliberate work: approved manifest items must use the existing manifest schema with `entity_type = place`, `entity_id = place_id`, `role = gallery`, and valid generated local outputs; the published/draft Place contract must store an ordered `gallery_media_ids` list; `getPlaceDetail` must add that safe ordered ID projection; and Place Detail must render only those IDs after matching the same Place and `gallery` role in the normalized manifest. Existing `gallery_image_urls` never supplies production sources and array length never generates media IDs.
- The Gallery extension adds no upload path and does not change `TakhunMedia.mediaIdFor("place", place_id)` cover behavior. New Place-gallery manifest entries still enter through the existing approved build-time media process; until compatible entries exist, the selector shows an empty Gallery state and Public Place Gallery remains hidden.
- Exact physical Sheet placement for ordered `gallery_media_ids` is resolved during the approved M7 schema reconciliation; its API meaning and validation above are fixed.
- If no compatible approved media exists, the selector shows an empty state and the existing local fallback remains valid. It does not invent a URL or expose private media.

M7 does not upload, approve, or redesign media. The required Place-gallery manifest expansion and Public projection/controller support are explicit M7 work, not a silent change to the frozen runtime. Existing URL-era fields may be preserved for backward compatibility but are not editable as arbitrary production image sources and are never used to bypass manifest validation. External image URLs, data/blob URLs, source-media paths, cross-Place references, cross-role references, and unapproved IDs are forbidden.

## 11. Admin Pages and UX

### 11.1 `admin/places.html`

The authenticated list page reuses the existing shell and contains:

- one page heading and an “เพิ่มสถานที่” action visible only to `super_admin`/`editor`;
- debounced or submit-driven search without polling;
- fixed category filter;
- status filter for `draft`, `published`, and `archived` plus an all option;
- pagination with bounded page size;
- desktop semantic table and mobile card list driven by the same response;
- archived items excluded by default and included only when explicitly filtered or when “all including archived” is selected;
- main status badge plus secondary `มีฉบับร่าง` badge when `has_active_draft` is true;
- loading, empty, safe error, and explicit “ลองใหม่” read states;
- role-appropriate View/Edit actions.

Search, category, status, page, and page size are server parameters. Changing search or filters resets to page 1. Empty pages caused by stale page numbers are corrected by using the returned pagination metadata, not by polling.

### 11.2 `admin/place-edit.html`

One full-page detail surface handles Create and Edit; there is no wizard. It uses clear sections for identity/status, Thai/English content, area/category, details, contact/opening information, map, media, related/public behavior, and publishing controls.

Thai and English content use accessible tabs. Tabs follow keyboard tab semantics, retain entered values when switching, and do not act as an Admin interface-language switch. The surrounding Admin shell stays Thai-only unless the frozen shell gains a separate approved language feature later.

For `super_admin` and `editor`, the page renders editable controls and separate primary actions:

- `บันทึกแบบร่าง` saves only the active draft;
- `บันทึกและเผยแพร่` performs the user-initiated create/save followed by explicit Publish validation and promotion.

If the first phase of “บันทึกและเผยแพร่” creates or updates a draft but Publish fails validation or encounters a safe server error, the UI states clearly that the draft was saved but not published. The client does not retry either phase automatically.

For `reviewer` and `viewer`, the primary presentation is semantic read-only detail, not a form filled with disabled controls. `reviewer` can inspect the active Draft Revision and separately switch to the current Published Version when present. `viewer` receives a normal read-only detail projection. Neither role receives write controls.

The immutable Place ID appears as read-only text after creation. It is never a mutable form field.

### 11.3 Unsaved changes

The edit controller keeps a normalized snapshot of the last server-confirmed working data. It marks the page dirty only when normalized editable values differ. Internal tab changes, map pan/zoom, filtering a media dialog, or loading Published Version for comparison do not mark content dirty.

When dirty, same-origin navigation controlled by the page uses an accessible confirmation dialog, and browser close/reload uses `beforeunload`. After a confirmed successful save, publish, or intentional discard/reload, the dirty baseline updates or clears. A failed write retains all entered data and keeps the warning active.

### 11.4 Edit URL and safe authentication return

Create uses exactly `place-edit.html` with no query or fragment. Edit links use exactly:

```text
place-edit.html?place_id={percent-encoded-place-id}
```

After one standard URL query decode, `place_id` must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`. The query must contain exactly one key named `place_id`, exactly one non-empty value, no duplicate key, and no other key; the fragment must be empty. The safe canonical return is rebuilt as `place-edit.html?place_id=${encodeURIComponent(place_id)}` rather than returning the candidate search text verbatim.

M7 adds `place-edit.html` to the filename allowlist but gives it this page-specific validator. The existing same-origin, same-Admin-directory, HTTP(S), no-credentials, no-traversal, no-control-character, no-backslash, no-auth-material, and no-`login.html` checks remain mandatory. M7 does not broaden query acceptance for any existing page. A malformed/extra/duplicate edit query, fragment, external origin, traversal attempt, encoded or double-encoded bypass, credential, token/session/password-like material, or login loop resolves to `places.html`, losing edit context safely. No edit context is stored in auth/session storage or a fragment.

The Milestone 6 prose example `places.html?edit=BTK-001` is not an M7 Edit route or compatibility alias. The M7 list controller ignores that historical `edit` parameter; all M7 Edit navigation and authentication returns use only the `place-edit.html?place_id=...` contract above.

After authentication, `place-edit.html` independently applies the same exact query grammar before calling any Place API. Invalid context shows a safe error and link to `places.html`; it does not guess an ID, call detail with unvalidated input, or enter Create mode accidentally.

## 12. Admin API Contract

All M7 actions are POST-only and use the existing envelope and transport:

```json
{
  "action": "adminGetPlaces",
  "token": "<raw session token>",
  "payload": {}
}
```

The canonical M7 action names are:

- `adminGetPlaces`
- `adminGetPlaceDetail`
- `adminGetPlaceMediaOptions`
- `adminInspectPlaceDependencies`
- `adminCreatePlace`
- `adminSavePlaceDraft`
- `adminPublishPlace`
- `adminUnpublishPlace`
- `adminArchivePlace`
- `adminRestorePlace`

No compatibility alias is added for the older future names `createPlace`, `updatePlace`, or `deletePlace`.

### 12.1 Read requests and projections

`adminGetPlaces` accepts `keyword`, `category`, `status`, `page`, and `page_size`. Empty `status` means non-archived results by default. Its safe items include only list data: `place_id`, localized/list name fields needed by the Admin, category, area summary, authoritative status, `has_active_draft`, derived display state, safe media thumbnail model, timestamps needed for display, and pagination metadata. It never returns a raw row or row number.

`adminGetPlaceDetail` accepts `place_id` and `view: "working" | "published"`. It returns a safe content projection, permissions/capabilities, authoritative status, `has_active_draft`, `entity_version`, `working_version`, `published_version`, and safe media models. `working_version` represents the editable concurrency target: the active-draft version when a draft exists, otherwise a server token derived from the current entity and Published Version. Create mode does not call detail and uses fixed client presentation defaults containing no fabricated content.

`adminGetPlaceMediaOptions` accepts the Place ID and optional safe search/pagination values. It returns only compatible approved items described in section 10.3.

`adminInspectPlaceDependencies` accepts `place_id`. It returns safe result data, not an error, containing a dependency check timestamp and references grouped by consumer type with safe identifiers and labels. This response is advisory and is not accepted as authority by Archive.

### 12.2 Write requests

- `adminCreatePlace`: content draft payload; the server ignores any submitted ID/status/version/actor/timestamps, generates the immutable Place ID, creates status `draft`, and returns the ID plus authoritative versions.
- `adminSavePlaceDraft`: `place_id`, `expected_version` equal to the latest `working_version`, and complete normalized draft content. For published Places, this creates or updates only the active Draft Revision.
- `adminPublishPlace`: `place_id` and `expected_version` equal to the latest active-draft `working_version`. It rereads and fully validates the active draft before promotion.
- `adminUnpublishPlace`: `place_id` and `expected_version` equal to the latest `entity_version`. It changes `published -> draft` and preserves an editable content snapshot.
- `adminArchivePlace`: `place_id`, `expected_version` equal to the latest `entity_version`, and explicit confirmation. The server repeats dependency inspection under lock and archives despite dependencies only when the authorized user explicitly confirms the current warning result.
- `adminRestorePlace`: `place_id` and `expected_version` equal to the latest `entity_version`. It changes `archived -> draft` only.

Every write returns the immutable `place_id`, resulting authoritative status, current `entity_version`, `working_version`, `published_version`, `has_active_draft`, and safe timestamps needed to refresh the UI. It does not echo arbitrary client fields. In addition to comparing the submitted target version, the server compares the active draft’s stored base-published version with the current Published Version; a mismatch is a `CONFLICT` even when the draft version itself was not changed.

### 12.3 Errors

The response envelope remains exactly `{ "ok": true, "data": ..., "message": "..." }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`. `NOT_FOUND` is an existing globally documented API code; M7 extends the current Admin browser/API safe-code allowlist so Admin Place responses can preserve it. `CONFLICT` is the new M7 concurrency outcome and is added to that same allowlist. Neither change permits arbitrary codes: unknown backend codes continue to normalize to `SERVER_ERROR`.

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | Malformed request, invalid transition, failed content validation, invalid media/category/coordinates, or incomplete Publish data. |
| `UNAUTHORIZED` | Missing or invalid authoritative session. |
| `FORBIDDEN` | Valid session lacks the requested Place capability. |
| `NOT_FOUND` | Place or required authoritative revision does not exist. |
| `CONFLICT` | Expected version is stale; no write and no success audit occurred. |
| `SERVER_ERROR` | Safe internal failure, including lock, schema, audit, verification, rollback, or unexpected failure. |

Messages are bounded and user-safe. Responses never include stack traces, exception text, raw rows, row numbers, Sheet names/IDs beyond intentional public entity labels, token hashes, session internals, audit internals, or rollback details.

## 13. Create, Save, and Publish Flows

### 13.1 Create Draft

1. Client submits `adminCreatePlace` once.
2. Server authenticates, authorizes, structurally validates, locks, generates an immutable unique ID, creates the identity and active Draft Revision, verifies, writes `CREATE` audit, verifies audit, and returns success.
3. UI moves to Edit using the returned ID/version and resets its dirty baseline.

### 13.2 Save a published Place edit

1. Admin Detail returns an existing draft or a working copy based on Published Version.
2. Client submits `adminSavePlaceDraft` with `expected_version` equal to the latest `working_version`.
3. Server locks and rereads. If stale, it returns `CONFLICT` without writing.
4. Server writes only the active Draft Revision and `UPDATE_DRAFT` audit.
5. Public continues serving the prior Published Version.

### 13.3 Publish

1. Client submits `adminPublishPlace` with `expected_version` equal to the current active-draft `working_version`.
2. Server locks, rereads, checks versions and allowed transition, validates complete Thai/public data and media references, promotes the draft, verifies authoritative state, writes and verifies `PUBLISH` audit, then returns success.
3. Public Place cache keys include a Place-specific server cache epoch stored in a server-controlled Script Property. Publish, Unpublish, Archive, and Restore increment and reread-verify that epoch inside the same compensated critical section so old query variants immediately become unreachable. Draft saves do not change the epoch. This is a Place-specific invalidation mechanism, not a generic cache framework.
4. The client reloads authoritative detail; it does not assume its submitted payload is the stored result.

## 14. Archive, Restore, Dependencies, and Favorites

Dependency inspection includes at least authoritative `route_places`, Routes, nearby Place references, products, events, gallery relationships, trip templates, and any other source that stores Place IDs. It returns stable IDs and safe labels sufficient for a warning; it does not expose raw rows.

Archive UX is two-stage:

1. The client requests advisory dependency inspection and displays the relevant references in an accessible confirmation dialog.
2. After explicit confirmation, `adminArchivePlace` reacquires authority, locks, rereads the Place/version, repeats dependency inspection, and uses the fresh result for the decision and audit. A stale entity version returns `CONFLICT`. New or changed dependencies are reflected in the response; the operation proceeds only under the explicit confirmed-archive contract.

Dependencies warn but do not permanently block `super_admin`/`editor`. Archive sets status to `archived`; it never deletes the Place identity, versions, draft, relationships, or browser data. Public published queries exclude it through lifecycle visibility rules.

Restore wording means “restore for editing.” `adminRestorePlace` changes `archived -> draft`, preserves immutable identity/references, and requires a later explicit Publish.

Archive and Restore never mutate `TAKHUN_FAVORITES`. There is no favorite cleanup API. Public Favorites continue resolving saved IDs against currently published data, so an archived/unpublished ID may remain stored while no public detail is available and can become visible again after a later Publish.

## 15. Concurrency, Locking, and Retry Policy

Every editable identity/revision has a positive, server-controlled version. Clients send the action-specific `expected_version` defined in section 12.2 from their latest successful read/write. Published, entity, and draft versions remain semantically distinct. The server performs this sequence under the script lock:

1. Acquire the bounded lock; failure returns `SERVER_ERROR`.
2. Reread authoritative identity, Published Version, active draft, dependencies when required, and relevant audit/schema state.
3. Verify identity, current lifecycle, permission, and expected versions.
4. On mismatch, return `CONFLICT`; do not write and do not append a success audit.
5. Validate the requested transition and payload against current authoritative data.
6. Capture the complete prior authoritative state required for compensation.
7. Apply the Place/revision write and reread-verify the exact intended state.
8. For a lifecycle change affecting Public visibility/content, increment and reread-verify the Place cache epoch.
9. Append the required audit record and reread-verify it.
10. If steps 7, 8, or 9 fail, remove any unverified just-appended audit row, run action-specific compensating rollback including the prior cache epoch, reread-verify the restored state, and return `SERVER_ERROR`.
11. Release the lock in `finally`.

There is no automatic merge and no force-overwrite option for any role. On `CONFLICT`, the UI preserves the unsaved form, explains that the data changed, and offers “โหลดข้อมูลล่าสุด”. It tells the Admin they may manually copy their unsaved text before reloading. Reloading discards the local form only after confirmation.

The client never automatically retries Create, Draft Save, Publish, Unpublish, Archive, or Restore. A user may press the action again after reading the result and, for a conflict, after loading the latest version. Reads may have an explicit “ลองใหม่” button. No Place screen polls.

## 16. Audit and Fail-Closed Recovery

Each successful write produces exactly one required M7 lifecycle audit record:

| Operation | Audit action |
| --- | --- |
| Create identity/draft | `CREATE` |
| Create or change active draft | `UPDATE_DRAFT` |
| Promote draft | `PUBLISH` |
| Published to draft | `UNPUBLISH` |
| Soft archive | `ARCHIVE` |
| Archived to draft | `RESTORE` |

The existing `activity_logs` sheet remains the audit store and is extended non-destructively with the missing authoritative headers `audit_id`, `actor_admin_id`, and `occurred_at`. The authoritative M7 audit record contains at minimum `audit_id`, `actor_admin_id`, `action`, `entity_type`, `entity_id`, and `occurred_at`. For compatibility with existing readers, the same M7 append also sets `log_id = audit_id`, `admin_id = actor_admin_id`, and `created_at = occurred_at`; existing rows are not rewritten. `actor_admin_id` comes only from the validated session, `entity_type` is `place`, and the action is one of the six uppercase values above. Field-level old/new diffs are not required.

Google Sheets provides no database transaction spanning Place, draft, and audit writes. M7 therefore uses the lock, deterministic ordering, reread verification, and action-specific compensating rollback described above.

Rollback behavior is explicit:

- failed `CREATE` audit removes the just-created identity/draft and verifies their absence;
- failed `UPDATE_DRAFT` audit restores the prior active draft or removes the newly created draft and verifies it;
- failed `PUBLISH` audit restores the prior Published Version, lifecycle/version metadata, active draft, and cache epoch and verifies all of them;
- failed `UNPUBLISH`, `ARCHIVE`, or `RESTORE` audit restores the complete prior lifecycle/revision state and cache epoch and verifies them.

If rollback fails or cannot be verified, the operation still returns only `SERVER_ERROR`, never success. It records no client-visible internal details. M7 does not build a generic transaction or recovery framework; each Place action owns the minimum compensation it needs.

## 17. Security and Response Safety

- Preserve POST-only Admin transport with bearer token in the JSON body and `text/plain;charset=utf-8`.
- Add no Admin GET action, query authentication, cookie authentication, or `Authorization` header.
- Validate the session and role on every protected action; UI visibility is never authority.
- Accept only allowlisted payload keys and normalize/validate every value server-side.
- Treat `place_id`, status, versions, timestamps, actors, derived states, and audit fields as system-controlled.
- Escape formula-like user text before Sheet writes according to existing data rules without corrupting enums, IDs, booleans, numbers, or canonical timestamps.
- Build safe projections explicitly. Never serialize a raw Sheet row.
- Use DOM construction and `textContent` for Admin rendering; do not render arbitrary HTML from Place content.
- Validate external contact/navigation links and use `noopener noreferrer` for new tabs.
- Validate media exclusively against approved public manifest/runtime data and never return source media metadata.
- Apply the exact `place-edit.html` return-query grammar in section 11.4 without loosening the existing origin, directory, traversal, credential, login-loop, or auth-material checks.
- Keep protected content hidden from sighted users and the accessibility tree until server validation succeeds.
- Run secret and transport scans that reject committed credentials, token-like fixtures, alternate auth transport, private media paths, and staging configuration.

## 18. Accessibility and Responsive Requirements

- Preserve the Admin shell’s semantic header/navigation/main landmarks, skip link, mobile modal drawer, focus trap, Escape close, backdrop close, and focus restoration.
- All controls have visible labels; placeholders never replace labels.
- All interactive targets are at least 44 by 44 CSS pixels where applicable.
- Desktop uses a readable table; mobile uses cards without forced horizontal page scrolling.
- Status is communicated by text and shape/weight as well as color.
- Form errors associate with fields and a summary; async status/errors use appropriate polite/assertive live regions without repeated announcements.
- Confirmations use proper dialog semantics, initial focus, focus containment, Escape/cancel behavior where safe, and focus restoration.
- TH/EN tabs implement tablist/tab/tabpanel semantics and keyboard navigation.
- Map editing is possible through coordinate fields; pointer use is not the only path.
- Media selector controls, pagination, filters, and conflict actions are keyboard operable.
- Loading/busy controls expose `aria-busy` and prevent duplicate submission.
- Motion respects `prefers-reduced-motion`.
- Minimum verification viewports remain 360×800, 390×844, 768×1024, 1366×768, and 1920×1080.

## 19. Automated Testing Design

### 19.1 Backend/service coverage

- Admin list/detail safe projections, filters, search, pagination, and archived-default behavior.
- Authentication and all four role boundaries for every read/write action; reviewer/viewer fabricated writes return `FORBIDDEN`.
- Create Draft, Save Draft, Publish, Unpublish, Archive, and Restore happy paths and invalid transitions.
- Immutable generated IDs and rejection/ignoring of client-controlled IDs/system fields.
- Exactly three M7 Place statuses, deterministic legacy Place migration/rollback gates, unchanged status vocabularies for other entities, and absence of persisted `published_with_draft`.
- Fixed category enum rejection.
- Draft weaker completeness and full Thai-required Publish validation.
- English optional values and Public Thai fallback compatibility.
- Coordinate pair/type/range validation and valid boundary values.
- Canonical same-Place `cover` selection, rejection of cross-Place/cross-role/unknown/private/external references, and safe media projections.
- M7 Place-gallery extension coverage for manifest `entity_type/place_id/role` matching, ordered `gallery_media_ids`, Public Place Detail rendering, hidden empty state, and continued rejection of URL-count-derived media.
- Server media-manifest URL/origin ownership, rejection of client overrides, and fail-closed manifest fetch/origin/schema validation without write retry.
- Published Place edit creates/updates only the active Draft Revision; Public list/detail/map/search/route consumers retain the prior Published Version until Publish.
- At most one active draft and correct draft/published version semantics.
- Stale expected version returns `CONFLICT`, writes nothing, and creates no success audit.
- Lock acquisition/release and authoritative reread inside the critical section.
- Dependency preview result safety and authoritative dependency recheck during Archive.
- Audit creation for all six actions with immutable `admin_id` actor.
- Forced audit append/verification failures trigger correct rollback; forced rollback failure never returns success or internal detail.
- Exact safe envelopes for `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, and `SERVER_ERROR`.
- Existing `NOT_FOUND` passes through the extended Admin allowlist, new `CONFLICT` passes through, and unknown codes still normalize to `SERVER_ERROR`.
- `safeReturnPath` accepts Create without query and Edit with exactly one bounded `place_id`; rejects extra/duplicate/empty/overlong/malformed/double-encoded parameters, fragments, traversal, external origins, credentials, auth material, and login loops; and falls back to `places.html` for invalid edit context.
- No automatic write retries, polling, alternate auth transport, raw rows, row numbers, stack traces, token hashes, private media, or secrets.

### 19.2 Admin UI coverage

- Desktop table and mobile cards render from one list result.
- Search, category/status filters, pagination, archived default exclusion, and explicit archived filtering.
- Draft, Published, Published + Draft Revision, and Archived badges.
- Create/Edit full-page form, Thai/English tabs, section navigation, and immutable ID display.
- Coordinate input/map click/marker drag synchronization and non-pointer coordinate editing.
- Safe Google Maps action and absence of automatic geolocation calls.
- Manifest-backed media selector and empty/failure states.
- Create/Edit URL generation and the exact safe authentication-return behavior from section 11.4.
- Separate Draft and Publish controls, duplicate-submit prevention, and no automatic retry.
- Published/working-version comparison and Public-unchanged messaging.
- Semantic reviewer/viewer read-only detail rather than disabled-form presentation.
- Dependency confirmation with listed references and explicit confirmation.
- Conflict UI preserving unsaved input and offering latest-version reload.
- Unsaved-change warning and clearing only after confirmed save/discard.
- Loading/empty/error/retry live states, dialog semantics, keyboard behavior, visible focus, 44px targets, reduced motion, mobile/desktop layout, and protected-content no-flash behavior.

### 19.3 Public regression coverage

The full suite must prove that only Published Version data reaches:

- Places;
- Place Detail;
- Map;
- Routes and route Place projections;
- Trip Planner;
- Search;
- Favorites;
- Home/featured Place consumers where applicable;
- i18n and Thai fallback;
- production media runtime.

It must also prove that draft, unpublished, and archived content is absent from Public results while stable Place IDs and non-destructive favorite storage remain intact.

Production-media regression must additionally prove that existing Place list/detail/nearby/route/search/favorite covers still derive from immutable `place_id`; a selected cover cannot override that derivation or reference another Place/role; Place Detail renders `gallery_media_ids` only when each normalized manifest item matches the same Place and `role = gallery`; missing/unknown/mismatched IDs retain the safe local fallback or hidden gallery state; and `gallery_image_urls`, external URLs, data/blob URLs, source paths, or array length never become production image sources.

### 19.4 Verification commands

Later implementation must run focused M7 tests first, then the repository’s complete `npm test`, `npm run build`, JavaScript syntax checks used by the project, secret/security scans, `git diff --check`, and the relevant manual QA. Exact focused filenames and commands belong in the implementation plan after file decomposition is fixed.

## 20. Manual QA Matrix

Manual QA must verify all of the following against representative roles and real responsive layouts:

1. Create a new Draft and confirm immutable ID/read-back.
2. Publish a new Place and confirm Public Places, Detail, Map eligibility, Search, and related consumers.
3. Edit Published, Save Draft, and confirm Public remains unchanged.
4. Publish that Draft Revision and confirm Public changes only afterward.
5. Synchronize coordinates by inputs, map click, and marker drag; verify invalid ranges.
6. Select approved hero/gallery media and verify private/arbitrary media cannot be selected.
7. Unpublish and confirm status becomes Draft and Public visibility ends.
8. Archive with dependency warning and inspect the listed authoritative references.
9. Restore and confirm status is Draft, not Published.
10. Open the same Place in two tabs, save in one, and verify the stale tab receives conflict UX without overwriting.
11. Verify reviewer working/published read-only views and absence of write controls.
12. Verify viewer semantic read-only detail and absence of write controls.
13. Verify mobile cards/form/dialog/map/media selector at 360 and 390 widths.
14. Verify desktop table/form at 1366 and 1920 widths.
15. Verify keyboard-only operation, focus order/restoration, live announcements, reduced motion, and no protected-content flash.

## 21. Expected Implementation Surface

The later implementation plan is expected to add or modify only Place CMS and directly required shared contracts, including:

- `public/admin/places.html`;
- new `public/admin/place-edit.html`;
- Place-specific Admin JavaScript and styles following existing project organization;
- minimal extensions to `public/admin/js/admin-api.js`, `admin-auth.js`, and `admin-shell.js` required for M7 actions, safe return handling, and reuse;
- a dedicated Apps Script Admin Place service plus minimal Router/Auth/data-layer integration;
- non-destructive schema/audit documentation and setup/migration support required by M7;
- focused automated tests and updates to frozen docs after implementation contracts are proven;
- the explicit M7 `gallery_media_ids` Public Place Detail projection and controller/media regressions required for approved Place-gallery items, while preserving stable-ID cover derivation and existing action semantics.

This list is a boundary, not authorization to modify files during this design-only task. The implementation plan must name exact files and keep shared changes minimal.

## 22. Non-Goals

- Permanent Place deletion
- Media upload or media-pipeline redesign
- Arbitrary external image URLs
- Category management
- A generic CMS framework
- Reviewer approval/rejection workflow
- Field-level audit diffs
- Auto-save
- Automatic write retry
- Polling
- Force overwrite
- Automatic merge
- Generic transaction/recovery engine
- Historical revision browser or multiple active drafts
- Redesign of Public Places
- Unrelated Admin modules
- Admin interface-language switch unless it is separately added to the frozen shell contract
- Automatic or user-triggered current browser location in the Admin map

## 23. Acceptance Criteria

M7 design implementation is acceptable only when:

1. Admin Places uses a dedicated Admin boundary and Public Place actions remain read-only.
2. Both Admin pages reuse the protected M6 shell/auth behavior, including no-flash and safe token transport.
3. Server authorization enforces the complete role matrix on every action.
4. The M7 Place lifecycle uses only `draft`, `published`, and `archived`; Restore always returns Draft; legacy Place migration is verified and non-destructive; other entity status vocabularies are unchanged.
5. A published Place can have at most one separate active Draft Revision, and Draft Save never alters Public data.
6. Published + Draft Revision is derived, not persisted.
7. Place IDs are server-generated, immutable, and stable across Route/Map/Favorite/related references.
8. Draft and Publish validation, fixed categories, coordinates, Thai requirement, optional English fallback, canonical same-Place cover selection, and the explicit Place-gallery manifest/schema/runtime extension match this design.
9. Optimistic concurrency prevents every stale write without merge or force overwrite.
10. Archive repeats dependencies authoritatively under lock and remains reversible without touching browser favorites.
11. Every successful write has the required verified audit; audit failure rolls back when possible and never reports success.
12. Admin responses are explicit safe projections and errors expose no internals.
13. No Place write automatically retries and no Place page polls.
14. Create/Edit URLs and authentication returns enforce the exact bounded `place_id` query contract without loosening existing safe-return protection.
15. Automated, public regression, accessibility, responsive, security, and manual QA coverage in sections 19–20 passes.

## 24. Definition of Done

Milestone 7 is complete only after all of the following occur:

- focused automated tests pass;
- full regression passes;
- build passes;
- JavaScript syntax checks pass;
- `git diff --check` passes;
- manual QA passes;
- security/review reports no BLOCKER or IMPORTANT findings;
- no staging credentials or configuration are committed;
- the pull request is merged into `main`;
- post-merge regression passes;
- the feature worktree and feature branch are cleaned up.

This design document alone does not complete Milestone 7 and does not authorize production implementation in the current task.
