# Admin Places CMS Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the Milestone 7 Admin Places CMS with protected read/write APIs, a physically separate active Draft Revision, explicit publish/lifecycle operations, manifest-approved media, deterministic concurrency, fail-closed audit compensation, and unchanged Public visibility until Publish.

**Architecture:** Add a dedicated `AdminPlaceService.gs` beside the existing Public `PlaceService.gs`; keep the `places` sheet as identity/lifecycle plus the last Published Version and add one `place_drafts` row per active draft. Every protected action authenticates against the existing authoritative Admin session, writes only under a bounded Script Lock, compares server versions, verifies each write, appends one verified audit, and compensates on failure. The existing Admin browser transport is extended rather than replaced. Public consumers continue reading only `places` rows whose Place-specific status is `published`; only a committed transition that changes Public Place content or visibility advances a Place-only cache epoch. Gallery media is an explicit ordered-ID extension over the frozen production manifest, never a URL override.

**Tech Stack:** Google Apps Script V8, Google Sheets, Script Properties, LockService, CacheService, UrlFetchApp, static HTML/CSS/JavaScript, existing Admin shell/auth/client modules, Leaflet/OpenStreetMap, Node.js 20 `node:test`/`assert`/`vm`, PowerShell verification, Git.

## Working context and execution protocol

All implementation Tasks 1–19 are local-only unless a step is explicitly marked **HUMAN-ONLY**.

- Window: `TAKHUN-ADMIN-PLACES-CMS`
- Path: `J:/wt/takhun-admin-places-cms`
- Branch: `feature/admin-places-cms`

At the start of every task, in that window/path/branch, run `git branch --show-current` and `git status --short --branch`; stop unless the branch is exact and every pre-existing change is understood. Follow the task's exact file allowlist. For each implementation task: write the named failing test first, run the focused command and observe the stated contract failure, make only the named production changes, rerun focused and dependency regressions, run `git diff --check`, stage only the allowlist, inspect `git diff --cached --name-only` and `git diff --cached`, then commit with the exact message. Never stage unrelated user work.

Known local Git issue: Git may emit `fatal: '$GIT_DIR' too big` after an otherwise successful commit or during remote helpers because the canonical repository path is long/non-ASCII. Never retry a commit solely because of that trailing diagnostic. First run `git rev-parse HEAD`, `git log -1 --oneline`, and `git status --short --branch` in the task window/path/branch. Use the established short `T:` SUBST / `GIT_DIR` workaround only at the explicit remote-operation gate; it is never application code.

Every task ends at a **REVIEW GATE**. The reviewer classifies findings as `BLOCKER`, `IMPORTANT`, or `MINOR`. Do not begin the next task until all `BLOCKER` and `IMPORTANT` findings are resolved and the reviewer approves proceeding. A `MINOR` finding must be fixed in the current task or recorded in the review handoff with a named owner and target task.

## Global constraints

- M7 manages Places only. Its lifecycle is exactly `draft`, `published`, `archived`; it does not replace the common `draft/published/hidden/archived/deleted` vocabulary for other entities.
- Existing Place `hidden` rows map non-destructively to retained `draft`; existing Place `deleted` rows map non-destructively to retained `archived`. No ordinary request performs migration and no legacy row is silently deleted or overwritten without the human migration gate.
- Public reads never join or serialize `place_drafts`. Opening Edit is read-only; a draft row is created only by Create or the first successful Draft Save.
- `super_admin` and `editor` may write. `reviewer` and `viewer` are read-only. Every action authenticates and authorizes server-side; client controls are presentation only.
- Admin actions are POST-only over the existing `text/plain;charset=utf-8` body transport. The raw token stays only in the JSON body—never query, URL, `Authorization` header, cookie, storage outside the existing session object, or logs.
- The safe envelope remains exactly `{ok:true,data,message}` or `{ok:false,error:{code,message}}`. `NOT_FOUND` already exists globally; M7 only admits it through the Admin safe-code allowlist. `CONFLICT` is the new M7 concurrency outcome. Unknown codes normalize to `SERVER_ERROR`.
- All request objects have exact allowlisted keys. IDs, statuses, versions, actor fields, timestamps, audit IDs, and derived state are server-controlled. Raw rows, source row numbers, sheet names/IDs, exception text, stack traces, security fields, manifest hashes/bytes, and rollback internals never enter responses.
- Every write uses `LockService.getScriptLock().tryLock(10000)`, rereads authoritative state, compares the action-specific positive integer `expected_version`, writes, rereads/verifies, writes exactly one audit, rereads/verifies, and releases in `finally`. At every committed state, `working_version == entity_version`; when an active draft exists, `draft_version == entity_version`. There is no merge, force overwrite (including for `super_admin`), polling, or automatic write retry.
- Audit or verification failure cannot return success. Compensation restores the complete captured Place/draft state and the prior cache epoch when that action advanced it. Failed or unverifiable compensation returns only `SERVER_ERROR`.
- Draft validation permits incomplete Public content but enforces types, lengths, enums, safe URLs, paired/ranged coordinates, IDs, and approved media. Publish additionally requires `name_th`, `district`, `province`, `category`, `short_description_th`, `description_th`, and `coordinate_status`.
- Category is the existing fixed Place enum. M7 adds no category-management surface.
- Cover remains derived as `TakhunMedia.mediaIdFor("place", place_id)` and must match the same Place with role `cover`. Gallery is the deliberate M7 ordered `gallery_media_ids` extension, limited to the same Place with role `gallery`. External image URLs, data/blob URLs, uploads, media-source paths, cross-Place/cross-role IDs, and unapproved references are forbidden.
- Admin never obtains manifest URL/origin from a request. The backend uses server-owned HTTPS `ADMIN_PLACE_MEDIA_MANIFEST_URL` constrained to `ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN`; fetch/parse/schema/origin failure fails closed without retry.
- `place-edit.html` accepts either no query/fragment (Create) or exactly one `place_id` key/value matching `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` after normal URL decoding, with no duplicate/extra key or fragment. Auth return canonicalizes it. Any violation falls back to `places.html`; existing pages do not gain query acceptance.
- Archive dependency preview is advisory. Confirmation requires a fresh dependency inspection under the write lock; dependencies warn but do not block an explicitly confirmed authorized archive.
- Unpublish preserves/creates editable draft content; Archive never deletes identity, revisions, relationships, or `TAKHUN_FAVORITES`; Restore means `archived -> draft`, never direct publish.
- Formula-like human text is escaped through the existing Sheet safety boundary. Enums, IDs, booleans, numbers, canonical timestamps, and media IDs are not text-corrupted.
- Protected UI remains hidden from sighted users and the accessibility tree until authoritative session validation succeeds. Render content with DOM methods/`textContent`; validate outbound URLs and use `noopener noreferrer`.
- No Apps Script push/deploy, Sheet or Script Property mutation, staging bootstrap/QA, production deployment, push, PR, or merge occurs during normal task execution.

## Final physical schema and API contracts

### Chosen storage

This is the smallest safe design because it preserves the current Public read path: `places` remains the last Published snapshot and lifecycle authority, while one new sheet isolates mutable draft content. It avoids a generic revision engine and does not require Public services to understand Admin drafts.

`places` retains every current column in its current order. Append these columns only:

```text
address_th,address_en,facilities_th,facilities_en,gallery_media_ids,
entity_version,published_version,created_by,updated_by,published_at,published_by,
archived_at,archived_by
```

- Current content columns, including `cover_image_url`, `gallery_image_urls`, and `video_url`, remain present. URL-era image fields are preservation-only in M7 and are rejected as client-editable fields.
- `status` has Place-specific M7 values after migration. `entity_version` is a positive integer and advances for every successful Place write. `published_version` is `0` before first Publish and a positive integer afterward; Admin JSON projects `null` when stored value is `0`.
- `working_version` is projected, not stored separately: it equals active `draft_version` when a draft exists and otherwise equals `entity_version`. Create stores `entity_version=1/draft_version=1`; every Draft Save increments `entity_version` once and stores that new value as `draft_version`; lifecycle writes increment `entity_version` once. This makes every successful write produce a new concurrency token while keeping `published_version` independent.
- `created_at`/`updated_at` and new M7 timestamp writes use canonical RFC 3339 UTC. Legacy timestamp strings remain untouched unless the same row is successfully changed by an M7 action. `created_by`/`updated_by` and lifecycle actors come only from the authenticated Admin.
- `gallery_media_ids` is canonical Sheet text: empty selection stores `""`; otherwise store at most 50 manifest IDs joined by one literal `|`, with no surrounding whitespace. Each ID must match the deployed manifest's existing lowercase grammar `^[a-z0-9]+(?:-[a-z0-9]+)*$`, contain no `|`, appear once, and resolve under authoritative validation to the same `place_id` with role `gallery`. Parsing splits only on `|`, rejects empty segments/duplicates/non-canonical reserialization, preserves order, and never accepts escaping, URLs, paths, or media metadata.

Create `place_drafts` with this exact header order:

```text
place_id,name_th,name_en,slug,district,province,route_group,category,sub_category,
short_description_th,short_description_en,description_th,description_en,
activities_th,activities_en,highlight_th,highlight_en,address_th,address_en,
facilities_th,facilities_en,phone,line_url,facebook_url,website_url,google_maps_url,
latitude,longitude,coordinate_status,open_time_th,open_time_en,fee_th,fee_en,
cover_image_url,gallery_image_urls,video_url,tags,recommended_duration,best_time_th,
best_time_en,nearby_place_ids,is_featured,is_main_route_point,sort_order,
gallery_media_ids,draft_version,base_published_version,created_at,updated_at,
created_by,updated_by
```

- There is at most one nonblank row per `place_id`. Because Sheets has no unique constraint, every draft read/write under the Script Lock scans the authoritative `place_drafts` ID column and requires exactly zero or one matching row; duplicates are schema corruption and return `SERVER_ERROR` before mutation. Setup, migration, and verification reject duplicate IDs and any populated draft row with a blank ID; fully cleared compensation rows contain no nonblank cells and are ignored by `SheetService_readTable_`. `draft_version` is positive and equals the owning Place's current `entity_version` whenever the draft is active. `base_published_version` is the `published_version` from which the draft was created, including `0` for a never-published Place, and does not change on Draft Save.
- The three URL-era media fields are copied only by trusted server snapshot logic and never accepted from an Admin payload. They prevent promotion from erasing legacy data but never source new production media.
- Publish copies the complete verified draft snapshot to `places`, advances `entity_version` and `published_version`, sets status `published`, and clears the active draft row only after all compensation snapshots are captured.
- A never-published identity row contains authoritative values only for `place_id`, `status`, `entity_version`, `published_version`, `created_at`, `updated_at`, `created_by`, and `updated_by`. Its content columns are neutral storage values (`""` for text/list/number/timestamp cells and `FALSE` for the two boolean cells), `published_version=0`, and lifecycle publish/archive fields are empty. The complete content is authoritative only in `place_drafts`. Current Public readers first require `status == "published"`, so this identity row cannot be interpreted as Published content.

Current `places` access is header-keyed: `readSheetObjects_`/`SheetService_readTable_` derive an object from row 1, and `PlaceService.gs`, `HomeService.gs`, `SearchService.gs`, `RouteService.gs`, `ProductService.gs`, `EventService.gs`, and `ReviewService.gs` read named properties. There is no current positional Place reader or Place writer. Appending columns therefore does not shift a fixed Place index. Task 1 must nevertheless regression-test `SheetService.gs` and `scripts/test-sheet-service.js`; Tasks 6, 7, 14, and 18 must cover `scripts/test-place-service.js`, `scripts/test-home-service.js`, `scripts/test-search-service.js`, `scripts/test-route-service.js`, `scripts/test-product-service.js`, `scripts/test-event-service.js`, and `scripts/test-review-service.js`. Existing non-Place writers remain unchanged. New sheets use the exact header orders above; existing `places` and `activity_logs` retain their current order and receive missing M7 headers only at the end. Repeated setup performs zero writes after verification, preserves unknown extra columns, and fails before data mutation on duplicate required headers or incompatible schema.

Append to `activity_logs` without rewriting existing rows:

```text
audit_id,actor_admin_id,occurred_at
```

M7 appends the complete existing-plus-new shape `log_id,admin_id,action,entity_type,entity_id,description,created_at,audit_id,actor_admin_id,occurred_at`. For an M7 row, `log_id == audit_id`, `admin_id == actor_admin_id`, `created_at == occurred_at`, `entity_type == "place"`, and `action` is exactly `CREATE`, `UPDATE_DRAFT`, `PUBLISH`, `UNPUBLISH`, `ARCHIVE`, or `RESTORE`.

Server-owned Script Properties:

```text
PLACE_PUBLIC_CACHE_EPOCH
ADMIN_PLACE_MEDIA_MANIFEST_URL
ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN
ADMIN_PLACE_MIGRATION_ENABLED
ADMIN_PLACE_MIGRATION_BACKUP_REFERENCE




ADMIN_PLACE_MIGRATION_EXPECTED_ROW_COUNT
ADMIN_PLACE_MIGRATION_EXPECTED_IDS_SHA256
ADMIN_PLACE_MIGRATION_ACTOR_ADMIN_ID
```

`PLACE_PUBLIC_CACHE_EPOCH` is a decimal safe positive integer, initialized to `1` by the human schema gate. Publish and Unpublish always increment it; Archive increments it only when the authoritative source status is `published`. Create, Draft Save, Archive from `draft`, and Restore do not change it. The five migration controls are read only by the non-routed editor function and are disabled/cleared after verified migration. Media values are read only by the server media adapter.

New Place IDs are `PLC-` plus a lowercase UUID from `Utilities.getUuid()` (`PLC-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`). This is collision-checked under lock, fits the approved 64-character grammar, and does not guess a district before draft content exists. Existing `BTK-*`, `KRN-*`, and `PNM-*` IDs remain unchanged.

### Exact service interfaces

`AdminPlaceService.gs` exports only Router-facing functions with trailing underscores:

```javascript
adminGetPlaces_(token, payload)
adminGetPlaceDetail_(token, payload)
adminGetPlaceMediaOptions_(token, payload)
adminInspectPlaceDependencies_(token, payload)
adminCreatePlace_(token, payload)
adminSavePlaceDraft_(token, payload)
adminPublishPlace_(token, payload)
adminUnpublishPlace_(token, payload)
adminArchivePlace_(token, payload)
adminRestorePlace_(token, payload)
```

`adminGetPlaces` payload is exactly `{keyword?,category?,status?,page?,page_size?}`; `status` is `draft|published|archived|all`, while absent/empty excludes archived. Success data is:

```javascript
{
  items: [{
    place_id, name_th, name_en, category,
    area_summary: { district, province },
    status, has_active_draft, display_state,
    cover: null | SAFE_MEDIA_ITEM,
    created_at, updated_at
  }],
  page, page_size, total, total_pages
}
```

`adminGetPlaceDetail` payload is exactly `{place_id,view}` with `view` `working|published`. Success data is:

```javascript
{
  place_id, status, has_active_draft, display_state,
  entity_version, working_version, published_version,
  content: COMPLETE_EDITABLE_CONTENT,
  media: { cover: null | SAFE_MEDIA_ITEM, gallery: [SAFE_MEDIA_ITEM] },
  capabilities: {
    can_write, can_publish, can_unpublish, can_archive, can_restore,
    can_view_working, can_view_published
  },
  created_at, updated_at
}
```

`COMPLETE_EDITABLE_CONTENT` contains exactly the editable fields listed in `place_drafts`, excluding `place_id`, the three URL-era media fields, all version/actor/timestamp fields, and lifecycle status. `SAFE_MEDIA_ITEM` contains exactly `media_id,entity_type,entity_id,role,alt_th,alt_en,fallback,outputs`, where each output is exactly `{width,height,path}`.

`adminGetPlaceMediaOptions` payload is exactly `{place_id,keyword?,role?,page?,page_size?}`, with role absent/`all` or `cover|gallery`; success uses `{items:[SAFE_MEDIA_ITEM],page,page_size,total,total_pages}`. Every item matches the same Place and an allowed role.

`adminInspectPlaceDependencies` payload is exactly `{place_id}`; success is `{place_id,checked_at,groups}`, where `groups` has exact keys `routes,nearby_places,products,events,gallery,trip_templates,reviews`, each an array of `{entity_id,label}`. `route_places` is an internal authoritative join source, never a returned group. Arrays are deduplicated and sorted by `entity_id`; a group's count is exactly its array length and no separate count field is returned.

Write payloads and success are exact:

```javascript
adminCreatePlace:      { content: COMPLETE_EDITABLE_CONTENT }
adminSavePlaceDraft:   { place_id, expected_version, content: COMPLETE_EDITABLE_CONTENT }
adminPublishPlace:     { place_id, expected_version }
adminUnpublishPlace:   { place_id, expected_version }
adminArchivePlace:     { place_id, expected_version, confirmed: true }
adminRestorePlace:     { place_id, expected_version }

WRITE_SUCCESS = {
  place_id, status, entity_version, working_version, published_version,
  has_active_draft, created_at, updated_at
}
```

Create ignores and rejects system fields by requiring the exact outer/content keys, then generates the ID. `expected_version` is a positive safe integer: Save/Publish compare `working_version`; Unpublish/Archive/Restore compare `entity_version`. All writes also compare draft `base_published_version` to current `published_version`.

### Ownership traces for required lifecycle scenarios

In this table, `E` is the pre-action `entity_version` and `P` is the pre-action `published_version`. Whenever an active draft exists after an action, its `draft_version` is the new `entity_version`.

| Scenario | Authoritative `places` row after success | Active `place_drafts` row after success | Versions after success | Public visibility | Required audit |
| --- | --- | --- | --- | --- | --- |
| A. Brand-new Place -> Save Draft | Identity/lifecycle only: generated ID, `status=draft`, neutral content cells, authoritative create metadata | Complete submitted draft content | `entity_version=1`, `published_version=0`, `draft_version=1`, `base_published_version=0` | Hidden | `CREATE` |
| B. Brand-new Place -> Save and Publish | Phase 1 is scenario A. Phase 2 promotes complete draft content and sets `status=published` | None after verified promotion | After phase 2: `entity_version=2`, `published_version=1`; no draft/base version | Visible only after phase 2 commits | Exactly `CREATE`, then `PUBLISH` |
| C. Published Place -> Edit -> Save Draft | Existing Published content and `status=published` remain unchanged; only identity metadata/version advances | Complete working content based on Published plus edits | `entity_version=E+1`, `published_version=P`, `draft_version=E+1`, `base_published_version=P` | Prior Published content remains visible | `UPDATE_DRAFT` |
| D. Published Place with Draft -> Publish revision | Complete draft replaces Published content; `status=published` | None after verified promotion | `entity_version=E+1`, `published_version=P+1`; no draft/base version | New Published content visible | `PUBLISH` |
| E. Published Place -> Unpublish | Last Published content remains retained; `status=draft` | Preserve existing working content, or copy the retained Published snapshot when no draft exists | `entity_version=E+1`, `published_version=P`, `draft_version=E+1`, `base_published_version=P` | Hidden | `UNPUBLISH` |
| F. Archived Place -> Restore | Retained snapshot remains; `status=draft` | Preserve retained draft, or copy retained snapshot when no draft exists | `entity_version=E+1`, `published_version=P`, `draft_version=E+1`, `base_published_version=P` | Hidden; Restore never republishes | `RESTORE` |

`adminCreatePlace` is the first Save Draft operation for a brand-new Place; the client does not fabricate an ID or call `adminSavePlaceDraft` before Create succeeds. A later Draft Save follows the normal rule and advances both `entity_version` and `draft_version` from `1` to `2`. Browser input never supplies or overrides identity content defaults, lifecycle state, any version, base version, timestamp, actor, audit field, or cache epoch; exact-key validation rejects such fields rather than ignoring them.

### Final concurrency contract

The single `expected_version` is sufficient only because the service enforces the invariant `working_version == entity_version` and, when a draft exists, `draft_version == entity_version` at every committed state:

- Save Draft submits the last read `working_version`. Under lock the server requires it to equal current `entity_version` and, if a draft exists, current `draft_version`; it also requires draft `base_published_version == published_version`. The successful write increments `entity_version` once and stores that value as `draft_version`.
- Publish submits the active draft `working_version`. Under lock it must equal both current `entity_version` and `draft_version`, and the draft base must equal current `published_version` before promotion.
- Unpublish, Archive, and Restore submit the last read `entity_version`. Under lock it must equal current `entity_version`; if a draft exists, the service also requires `draft_version == entity_version` and `base_published_version == published_version`. A successful lifecycle action increments `entity_version` once and synchronizes any preserved/new draft to the new value.
- A client mismatch is `CONFLICT` before any mutation or success audit. A server-side invariant violation or duplicate draft row is `SERVER_ERROR` before mutation. Neither case has a `super_admin` bypass.

### Final write ordering and compensation model

This is compensated Google Sheets mutation, not database atomicity. The Script Lock covers authoritative reread, invariant/version checks, complete pre-state capture, data mutation, readback verification, conditional epoch mutation, audit append/readback, any compensation, compensation readback, and release in `finally`.

For every action the order is: capture the complete affected `places` row, active draft row or verified absence, prior epoch when applicable, and verified absence of the new audit ID; apply and verify the authoritative data write; apply and verify the epoch only when the cache rules below require it; append and verify exactly one audit; return success. If data, epoch, audit append, or audit verification fails, clear any just-appended audit row, compensate in reverse order, reread all captured state, and return only `SERVER_ERROR`. A compensation failure or unverifiable restored state also returns only `SERVER_ERROR` and never claims success.

| Audit/action | Pre-state captured | Compensation required before safe failure |
| --- | --- | --- |
| `CREATE` | Verified absence of ID in both sheets plus the exact rows allocated for the new identity/draft | Clear every cell in the just-appended identity and draft rows, clear any partial/new audit row, then verify the ID occurs zero times in both sheets and both allocated rows contain no nonblank cells. Blank compensated rows are ignored by header-keyed readers and do not constitute a Place. Existing rows are never shifted or deleted. |
| `UPDATE_DRAFT` | Complete identity row plus complete prior draft row, or verified draft absence | Restore the complete identity metadata/version row; restore the exact prior draft row or clear the newly appended draft row; clear new audit; verify exact values and single-draft cardinality. |
| `PUBLISH` | Complete prior Published/identity row, complete active draft row, and prior epoch | Restore the complete `places` row, restore the complete draft in its captured row, restore and reread-verify the prior epoch, clear new audit, then verify Published content/status/versions and draft/base/version exactly match the snapshot. |
| `UNPUBLISH` | Complete Published/identity row, complete prior draft or verified absence, and prior epoch | Restore complete `places`; restore the prior draft or clear the newly created draft; restore/verify epoch; clear audit; verify exact state and Public status. |
| `ARCHIVE` | Complete identity/Published row, complete draft or verified absence, dependencies used for the decision, and prior epoch only when source status was `published` | Restore complete Place/draft state; restore/verify epoch only if it advanced; clear audit; verify status/content/versions/draft cardinality. Dependencies are read-only and require no compensation. |
| `RESTORE` | Complete archived identity/Published row and complete draft or verified absence | Restore complete Place/draft state, clear audit, and verify exact status/content/versions/draft cardinality. Restore never changes the Public epoch. |

Compensation helpers accept only server-captured row numbers and full row snapshots. They are not routed and cannot accept browser row numbers. A partially appended audit is identified only by the server-generated audit ID and captured append row; cleanup never removes a pre-existing audit.

### Exact Public cache epoch scope

The current code inspection supports the epoch only on actions whose cached response reads or embeds Place rows:

- `PlaceService.gs`: `getPlaces`, `getPlaceDetail`, and `getMapPlaces`.
- `HomeService.gs`: `getHomeData`, because `featured_places` is built from `places`.
- `SearchService.gs`: `searchAll`, because its `places` section is built from `places`.
- `RouteService.gs`: `getRouteDetail` and `getTripTemplates`, because they embed filtered Published Place projections. `getRoutes` reads only `routes` and must keep its existing key.
- `ProductService.gs`: `getProductDetail` only, because it embeds a Published related-Place name. `getProducts` returns only product-row data and must keep its existing key.
- `EventService.gs`: `getEventDetail` only, because it embeds a Published related-Place name. `getEvents` returns only event-row data and must keep its existing key.

- `ReviewService.gs`: `getReviews`, because it reads `places` and a cached success would otherwise survive Unpublish/Archive even though the authoritative result must become `NOT_FOUND`. The uncached `submitReview` path already rereads Place status and has no cache key.
- `GalleryService.getGallery` exposes `related_place_id` from Gallery rows but never reads Place status/content, so its key does not receive the epoch. No Settings, Category, or unrelated cache changes.

Create and Draft Save cannot affect Public output and never advance the epoch. Publish advances it after verified promotion. Unpublish advances it after verified status/draft mutation. Archive advances it only for `published -> archived`; `draft -> archived` remains Public-hidden and does not. Restore is `archived -> draft`, remains Public-hidden, and does not. If a required epoch write/readback fails, compensation restores the data snapshot and prior epoch. If audit later fails, reverse compensation restores the prior epoch before failure is returned. No failed/rolled-back operation may leave a new epoch reachable.

This action-specific rule is the final targeted-review refinement of the approved design's broader sentence that named every lifecycle action, including Restore. The actual repository caches only Public projections, and both sides of Restore are non-Public; advancing the epoch there has no correctness consumer. Task 19 must document this narrower implemented rule explicitly rather than copying the broader historical wording.

## Task 1: Add M7 sheet primitives, physical schema, and human migration functions

**File allowlist**

- Create: `apps-script/AdminPlaceSchema.gs`, `scripts/test-admin-place-schema.js`
- Modify: `apps-script/SheetService.gs`, `scripts/test-sheet-service.js`, `scripts/test.ps1`
- Test: `scripts/test-admin-place-schema.js`, `scripts/test-sheet-service.js`

**Interfaces**

- Consumes: `getAppConfig_()`, existing `SheetService_readTable_`, `SheetService_ensureHeaders_`, SpreadsheetApp, LockService, PropertiesService, Utilities digest.
- Produces: `SheetService_appendObjectWithRow_`, `SheetService_replaceObjectAtRow_`, `SheetService_clearRow_`; non-routed `setupAdminPlaceSchema()`, `inspectAdminPlaceStatusMigration()`, `migrateAdminPlaceLegacyStatuses()`, `verifyAdminPlaceStatusMigration()`; exact schema constants from the preceding section.

- [ ] **RED:** Create virtual-sheet tests proving full-row append returns its source row, full-row replacement preserves unknown columns while writing one rectangular range, and clear removes every cell across the exact captured header width of only the targeted data row. Prove new-sheet exact header order; existing-sheet append-only behavior; preservation of unknown columns; duplicate-header failure; second setup performing zero writes; and header-keyed Place readers remaining unchanged after appended columns. Prove schema/migration functions are absent from Router, dry-run has no writes, hidden/deleted map deterministically, duplicate Place/draft IDs, populated rows with blank IDs, count/hash mismatch, and incompatible schema fail closed, while fully blank compensated rows are ignored. Prove ordinary API code cannot invoke migration. Run `node scripts/test-sheet-service.js` and `node scripts/test-admin-place-schema.js`; failure must be missing helpers/schema functions.
- [ ] **GREEN:** Implement only those primitives and editor-only schema/migration functions. Setup may create `place_drafts` and append headers but never rewrite Place data. Migration requires all five controls, script lock, prior backup reference, matching nonblank unique ID count/SHA-256, then applies this exact initialization: `published` becomes status `published`, `entity_version=1`, `published_version=1`, no draft; `draft` and `hidden` become status `draft`, `entity_version=1`, `published_version=0`, with a copied active draft at `draft_version=1/base_published_version=0`; `archived` and `deleted` become status `archived`, `entity_version=1`, `published_version=1`, no active draft, retaining all content as the non-visible last snapshot. Every migrated row receives migration-time `updated_at`; existing `created_at` is preserved; migration actor fields use `ADMIN_PLACE_MIGRATION_ACTOR_ADMIN_ID`, which must match the canonical Admin ID grammar. The digest is lowercase SHA-256 of UTF-8 unique nonblank IDs sorted ordinally and joined by `\n`. A mixed partly initialized dataset, duplicate/blank ID, mismatch, or unknown Place status stops before writes. After writes it verifies the same row count/ID digest, exact mapped statuses/versions/drafts, and disables migration. It never deletes a row. Add new files/tests to `test.ps1` required/invocation lists.
- [ ] Focused verification: `node scripts/test-sheet-service.js`; `node scripts/test-admin-place-schema.js`.

- [ ] Dependency regressions: `node scripts/test-auth-service.js`; `node scripts/test-apps-script.js`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`.

- [ ] Run `git diff --check`; stage only the five allowlisted files; verify `git diff --cached --name-only` exactly matches them and inspect the cached diff.

- [ ] Commit: `git commit -m "feat: add Admin Place schema foundations"`.

- [ ] **REVIEW GATE:** Require approval of schema ordering, non-destructive migration, remote isolation, row-compensation primitives, and mutation tests. Classify findings `BLOCKER`/`IMPORTANT`/`MINOR`; do not proceed before approval.

**MANUAL:** None. Do not run any schema/migration function against a Sheet in this task.

## Task 2: Security-lock the Place Edit authentication return grammar

**File allowlist**

- Create: none
- Modify: `public/admin/js/admin-auth.js`, `scripts/test-admin-auth.js`
- Test: `scripts/test-admin-auth.js`

**Interfaces**

- Consumes: existing `safeReturnPath(candidate)` and M6 same-origin/directory/traversal/auth-material protections.
- Produces: `place-edit.html` filename admission with canonical Create `place-edit.html` or Edit `place-edit.html?place_id=<encoded-id>` only; invalid Place Edit candidates return `places.html`. Existing invalid/non-Place behavior remains unchanged.

- [ ] **RED:** Add executable and mutation tests for valid IDs/bounds, duplicate/extra/empty keys, fragments, encoded/double-encoded traversal, control/backslash, credentials, external/protocol-relative origins, login loops, token/session/password-like material, historical `places.html?edit=...`, and query/fragment on every other allowlisted page. Mutate the page-specific validator to pass raw search text and prove tests fail. Run `node scripts/test-admin-auth.js`; failure must show Place Edit is not admitted/canonicalized.
- [ ] **GREEN:** Add `place-edit.html` and a dedicated strict parser. Rebuild the canonical return from the decoded validated ID; never return raw search text. Preserve every current global safety check and make invalid Place Edit fallback exactly `places.html`, not Create mode.
- [ ] Focused verification: `node scripts/test-admin-auth.js`.
- [ ] Dependency regressions: `node scripts/test-admin-api.js`; `node scripts/test-admin-shell.js`.
- [ ] Run `git diff --check`; stage only the two allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "security: constrain Admin Place edit returns"`.
- [ ] **REVIEW GATE:** Require security review of exact grammar and bypass mutations; resolve `BLOCKER`/`IMPORTANT` before approval.

**MANUAL:** None.

## Task 3: Add authenticated Admin Place list/detail read service and routes

**File allowlist**

- Create: `apps-script/AdminPlaceService.gs`, `scripts/test-admin-place-service.js`
- Modify: `apps-script/Router.gs`, `scripts/test.ps1`, `scripts/test-apps-script.js`
- Test: `scripts/test-admin-place-service.js`, `scripts/test-auth-service.js`, `scripts/test-apps-script.js`

**Interfaces**

- Consumes: `AuthService_requireAdmin_(token)`, schema constants, `SheetService_readTable_`, existing Place category/ID rules and safe envelopes.
- Produces: POST Router actions `adminGetPlaces` and `adminGetPlaceDetail`, with exact read contracts above; internal `AdminPlaceService_requireContext_`, `AdminPlaceService_buildList_`, `AdminPlaceService_buildDetail_`.

- [ ] **RED:** Build a VM harness and tests for POST-only routing, exact payload keys, authoritative auth on each request, all roles allowed to read, invalid/missing session `UNAUTHORIZED`, missing Place `NOT_FOUND`, safe pagination/filtering, default archived exclusion, working-vs-published selection, read-without-write, derived state/capabilities, no draft/raw/security/row leakage, and Public-unpublished hiding unchanged. Include mutation proof that bypassing `AuthService_requireAdmin_` or returning raw rows fails. Before changing the Router POST expectation, run `node scripts/test-apps-script.js` against the pre-Task-3 Router and prove its exact approved action set is `submitReview`, `adminLogin`, `adminValidateSession`, and `adminLogout`, with `adminGetPlaces` and `adminGetPlaceDetail` absent. Only after that proof, update `scripts/test-apps-script.js` to expect exactly those four existing actions plus `adminGetPlaces` and `adminGetPlaceDetail`; do not use a broad regex or permissive pattern, and do not admit any Task 4+ write action. Run `node scripts/test-admin-place-service.js` and `node scripts/test-apps-script.js`; both failures must be caused by the missing service/read routes.
- [ ] **GREEN:** Implement explicit safe projections and route dispatch, then make the strict six-action Router POST allowlist assertion pass without adding write actions. Detail reads `place_drafts` only for authorized Admin working view; published view reads only the retained snapshot. Before Task 14 the stable media keys are present as `cover:null` and `gallery:[]`; Task 14 populates them from the approved manifest without changing the detail shape. Catch internal auth/service failures into bounded safe codes/messages; never expose thrown text.
- [ ] Focused verification: `node scripts/test-admin-place-service.js`.
- [ ] Dependency regressions: `node scripts/test-auth-service.js`; `node scripts/test-place-service.js`; `node scripts/test-apps-script.js`.
- [ ] Run `git diff --check`; stage only the five allowlisted files, including `scripts/test-apps-script.js`; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: add Admin Place read API"`.
- [ ] **REVIEW GATE:** Require review of role/auth boundaries, projections, default filter semantics, no read writes, and Router safety.

**MANUAL:** None.

## Task 4: Add Place-specific version, audit, and compensation primitives

**File allowlist**

- Create: none
- Modify: `apps-script/AdminPlaceService.gs`, `scripts/test-admin-place-service.js`
- Test: `scripts/test-admin-place-service.js`

**Interfaces**

- Consumes: bounded Script Lock, new row primitives, `activity_logs`, authenticated Admin context.
- Produces: internal `AdminPlaceService_withWriteLock_`, `AdminPlaceService_requireExpectedVersion_`, `AdminPlaceService_appendVerifiedAudit_`, `AdminPlaceService_captureState_`, `AdminPlaceService_restoreState_`, and `AdminPlaceService_failClosed_` used by every later write.

- [ ] **RED:** Add injected-failure tests for lock timeout, stale version before writes, exact uppercase audit aliases, audit append/readback failure, partial Place/draft write, conditional epoch failure, rollback, and rollback-verification failure. Exercise synthetic `CREATE`, `UPDATE_DRAFT`, `PUBLISH`, `UNPUBLISH`, `ARCHIVE`, and `RESTORE` transactions against the exact compensation table. Assert CREATE leaves zero identity/draft matches and fully blank allocated rows; PUBLISH restores both full rows and the prior epoch; no failure returns success; conflict appends no success audit; success appends exactly one audit; lock releases only in `finally`; no client-visible internals or force path exists. Mutation tests remove pre-state capture, version comparison, audit verification, reverse compensation, full-row clear, or compensation verification and must fail. Run the focused suite; failure must identify the missing primitive/invariant.
- [ ] **GREEN:** Implement internal action-owned transaction helpers without routing a write. Snapshot complete rows plus verified absence/presence before mutation, retain the lock through compensation verification, clear every cell of only just-created rows, restore full captured rows and the prior epoch when applicable, verify exact intended/restored state and single-draft cardinality, and return only safe envelopes. Do not build a generic transaction framework or claim database atomicity.
- [ ] Focused verification: `node scripts/test-admin-place-service.js -- --focus=transaction` if the harness implements focus; otherwise run the full file.
- [ ] Dependency regressions: `node scripts/test-sheet-service.js`; `node scripts/test-auth-service.js`; `node scripts/test-apps-script.js`.
- [ ] Run `git diff --check`; stage only the two allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: add Place write safety primitives"`.
- [ ] **REVIEW GATE:** Require failure-path and compensation review; audit or rollback gaps are `BLOCKER`.

**MANUAL:** None.

## Task 5: Implement Create and Save Draft with server-enforced concurrency

**File allowlist**

- Create: none
- Modify: `apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `scripts/test-admin-place-service.js`, `scripts/test-apps-script.js`
- Test: `scripts/test-admin-place-service.js`

**Interfaces**

- Consumes: transaction primitives, exact content schema, Admin role/session, `Utilities.getUuid()`.
- Produces: `adminCreatePlace_` and `adminSavePlaceDraft_` plus Router actions `adminCreatePlace`, `adminSavePlaceDraft`; `WRITE_SUCCESS` contract.

- [ ] **RED:** Test exact-key rejection, system-field rejection, generated `PLC-UUID` collision check, neutral never-published identity content, useful-name rule remaining client-only, valid types/lengths/enums/IDs/URLs/coordinate pairs, formula escaping, full-sheet single active draft enforcement, positive synchronized entity/draft versions, immutable draft base version, and `CREATE`/`UPDATE_DRAFT` audit. Prove reviewer/viewer fabricated POSTs return `FORBIDDEN`; Draft Save on a published Place changes no Published content/status/published version and no Public response; only identity metadata/version and the draft may change. Stale entity/working/draft version, stale base-published version, duplicate draft row, audit failure, and compensation failure return no success; client staleness is `CONFLICT` with zero writes/audits and schema corruption is `SERVER_ERROR`. Prove CREATE audit failure clears both new records with zero ghost ID and no role can force overwrite. In `scripts/test-apps-script.js`, first prove the current exact static POST allowlist does not contain `adminCreatePlace` or `adminSavePlaceDraft`; then update the expected exact set and run it against the pre-GREEN Router so RED fails specifically because those two branches are missing. The post-Task-5 expectation must contain exactly `submitReview`, `adminLogin`, `adminValidateSession`, `adminLogout`, `adminGetPlaces`, `adminGetPlaceDetail`, `adminCreatePlace`, and `adminSavePlaceDraft`. It must reject `adminPublishPlace`, `adminUnpublishPlace`, `adminArchivePlace`, `adminRestorePlace`, dependency-inspection actions, every Task 6+ route, and any other extra POST action. Keep the assertion structural and exact: no wildcard, broad regex, dynamic pass-through, indirect routing, or permissive fallback. Run the suite; failure must be missing actions.
- [ ] **GREEN:** Authenticate and authorize before any protected read/write, reject every system-controlled browser field, normalize the complete content allowlist, lock/reread/verify uniqueness and versions, capture exact pre-state, create the neutral identity plus complete draft or update only identity metadata/version and the active draft, verify, audit, compensate, and return authoritative metadata. Add only the two static Router branches `adminCreatePlace` and `adminSavePlaceDraft`, and update `scripts/test-apps-script.js` so its exact approved POST set is the eight actions named in RED; retain the strict extra-action mutation checks and admit no Publish/Unpublish/Archive/Restore, dependency-inspection, or Task 6+ route. Until Task 14 installs authoritative manifest validation, the only accepted `gallery_media_ids` value is empty canonical text and cover is derived rather than submitted; non-empty or URL-era media input fails closed. The first save against an undrafted published Place copies the complete Published snapshot, overlays only normalized editable content, preserves URL-era media fields only from server state, records `base_published_version`, and synchronizes `draft_version` to the new `entity_version`.
- [ ] Focused verification: `node scripts/test-admin-place-service.js`.
- [ ] Dependency regressions: `node scripts/test-place-service.js`; `node scripts/test-auth-service.js`; `node scripts/test-apps-script.js`.
- [ ] Run `git diff --check`; stage only the four allowlisted files (`apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `scripts/test-admin-place-service.js`, and `scripts/test-apps-script.js`); run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: add Admin Place draft writes"`.
- [ ] **REVIEW GATE:** Server authorization, Published isolation, version mutations, field safety, and rollback are mandatory review points.



**MANUAL:** None.


## Task 6: Add the Place-specific Public cache epoch


**File allowlist**

- Create: none
- Modify: `apps-script/Config.gs`, `apps-script/PlaceService.gs`, `apps-script/HomeService.gs`, `apps-script/SearchService.gs`, `apps-script/RouteService.gs`, `apps-script/ProductService.gs`, `apps-script/EventService.gs`, `apps-script/ReviewService.gs`, `scripts/test-place-service.js`, `scripts/test-home-service.js`, `scripts/test-search-service.js`, `scripts/test-route-service.js`, `scripts/test-product-service.js`, `scripts/test-event-service.js`, `scripts/test-review-service.js`
- Test: the seven modified service tests

**Interfaces**

- Consumes: server-owned `PLACE_PUBLIC_CACHE_EPOCH` Script Property.
- Produces: `PlaceService_cacheEpoch_()` and `PlaceService_cacheEpochKey_()`; only the exact Place-bearing action keys listed in the cache-scope section include `:place-epoch:<n>:`. Missing property reads locally as epoch `1`; malformed/out-of-range values fail closed in Public-changing lifecycle writes and bypass cache safely in public reads.

- [ ] **RED:** For each affected service, seed the same Place-bearing query under epoch 1, change to epoch 2, and assert a fresh authoritative Sheet read. Cover all three Place actions, Home, Search, Route Detail, Trip Templates, Product Detail, Event Detail, and Reviews visibility. In the same tests assert `getRoutes`, `getProducts`, `getEvents`, Gallery, Settings, and Categories retain their current keys and reads. Assert Create, Draft Save, Draft-to-Archive, and Restore never change the property. Mutation proof removing the epoch from an affected key or adding it to an excluded key must fail. Run all seven modified Node suites plus the Gallery regression; failure must identify the exact wrong key scope.
- [ ] **GREEN:** Add only the Place epoch segment to the exact action keys enumerated above. Do not alter TTLs, list-action keys, Gallery keys, or create a general invalidation layer. Cache/property failure never exposes drafts and never turns an error into cached success.
- [ ] Focused verification: run `node` for each of the seven modified service test files.
- [ ] Dependency regressions: `node scripts/test-gallery-service.js`; `node scripts/test-apps-script.js`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`.
- [ ] Run `git diff --check`; stage only the fifteen allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: version Place-dependent public caches"`.
- [ ] **REVIEW GATE:** Review every Place-bearing cache consumer, malformed-property behavior, TTL preservation, and Draft non-invalidation.

**MANUAL:** None; do not set the property remotely.

## Task 7: Implement Publish promotion and Public-version isolation

**File allowlist**

- Create: none
- Modify: `apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `scripts/test-admin-place-service.js`, `scripts/test-place-service.js`, `scripts/test-apps-script.js`
- Test: `scripts/test-admin-place-service.js`, `scripts/test-place-service.js`, `scripts/test-apps-script.js`

**Interfaces**

- Consumes: active draft, working/base versions, publish-required content rules, the pre-Task-14 fail-closed media rule (gallery must be empty; cover is derived), Place cache epoch, transaction/audit primitives.
- Produces: `adminPublishPlace_` and Router action `adminPublishPlace`.

- [ ] **RED:** Test draft-only Publish, required Thai/Public fields, optional English empty, coordinate semantics, fixed category, URL/media-field rejection, complete snapshot promotion, draft consumption, synchronized current entity/draft version checks, base-published comparison, entity/published version increments, status `published`, epoch increment/verification, `PUBLISH` audit, and authoritative result reload. Prove Publish is the only path that changes Public content; archived direct Publish, stale entity/working/draft/base version, duplicate draft row, audit/epoch failure, or rollback failure cannot succeed or append a success audit. Inject failure after `places` replacement, after draft clear, after epoch write, and after audit append; each must restore the exact prior Published row, active draft row, and epoch. Assert old Public cache variants become unreachable only after committed success and Public response contains no draft/version/actor/audit fields. Mutation proof that Publish reads `places` rather than the active draft or omits either restored row must fail. In `scripts/test-apps-script.js`, first run the current assertion against the pre-Task-7 Router and prove its exact approved POST action set contains `submitReview`, `adminLogin`, `adminValidateSession`, `adminLogout`, `adminGetPlaces`, `adminGetPlaceDetail`, `adminCreatePlace`, and `adminSavePlaceDraft`, with `adminPublishPlace` absent. Only after that proof, update the expectation to exactly those eight existing actions plus `adminPublishPlace`, then run it against the still pre-GREEN Router so RED fails specifically because the Publish branch is missing. The assertion must reject `adminInspectPlaceDependencies`, `adminUnpublishPlace`, `adminArchivePlace`, `adminRestorePlace`, every Task 8+ routed action, and every other extra POST action. Keep the Router assertion structural and exact: no wildcard, broad regex, prefix match, substring match, helper-gated dynamic route, indirect dispatch, dynamic pass-through, or permissive fallback.
- [ ] **GREEN:** Under lock, reread and require exactly one draft plus the concurrency invariant/base match, capture complete `places`/draft rows and prior epoch, validate the complete draft, promote it to Published columns, preserve immutable/system fields, clear the draft only inside the compensable action, increment/verify epoch, append/verify audit, and compensate all three state surfaces in reverse order on any failure. Add only the static `adminPublishPlace` Router branch and make `scripts/test-apps-script.js` enforce exactly the nine POST actions named in RED; preserve its strict extra-action and dynamic-dispatch mutation checks, and admit no dependency-inspection, Unpublish, Archive, Restore, or other Task 8+ route.
- [ ] Focused verification: `node scripts/test-admin-place-service.js`; `node scripts/test-place-service.js`.
- [ ] Dependency regressions: `node scripts/test-home-service.js`; `node scripts/test-search-service.js`; `node scripts/test-route-service.js`; `node scripts/test-product-service.js`; `node scripts/test-event-service.js`; `node scripts/test-apps-script.js`.
- [ ] Run `git diff --check`; stage only the five allowlisted files (`apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `scripts/test-admin-place-service.js`, `scripts/test-place-service.js`, and `scripts/test-apps-script.js`); run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: publish isolated Place drafts"`.
- [ ] **REVIEW GATE:** Treat any alternate promotion path, Public draft exposure, epoch gap, or incomplete compensation as `BLOCKER`.

**MANUAL:** None.

## Task 8: Implement authoritative Place dependency inspection

**File allowlist**

- Create: none
- Modify: `apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `scripts/test-admin-place-service.js`, `scripts/test-apps-script.js`
- Test: `scripts/test-admin-place-service.js`, `scripts/test-apps-script.js`, plus current Route/Product/Event/Gallery/Review service suites as dependency regressions

**Interfaces**

- Consumes exactly these authoritative references: `route_places.place_id` joined through `route_places.route_id` to `routes.route_id`; other `places.nearby_place_ids`; `products.related_place_id`; `events.related_place_id`; `gallery.related_place_id`; `trip_templates.place_ids`; and `reviews.place_id`. `routes` has no `place_ids` field and Task 8 must never read, create, migrate, or imply one.
- Produces: `adminInspectPlaceDependencies_`, Router action `adminInspectPlaceDependencies`, and internal read-only `AdminPlaceService_inspectDependencies_` reusable by Task 9 only for an authoritative recheck. Success groups have exactly `routes,nearby_places,products,events,gallery,trip_templates,reviews`; `route_places` is not user-facing.

**Exact dependency model**

| Group | Authoritative membership and status rule | Safe item `{entity_id,label}` |
|---|---|---|
| `routes` | Select `route_places` rows whose normalized `place_id` exactly equals the inspected ID and whose status is `draft`, `published`, `hidden`, or `archived`; `deleted` relationship rows do not count. Collect their `route_id`, require each to resolve to exactly one `routes.route_id`, and include the Route only when its status is `draft`, `published`, `hidden`, or `archived`; a `deleted` Route does not count. An included relationship with a missing parent Route, duplicate parent Route identity, malformed ID, missing status, or unsupported status fails closed. Multiple relationship rows for the same Route produce one item. | `entity_id = route_id`; label is safe `name_th`, then safe `name_en`, then `route_id`. Relationship IDs, notes, order, rows, and Sheet metadata are never returned. |
| `nearby_places` | Inspect every other authoritative `places` row and parse its `nearby_place_ids`; include a referrer whose normalized membership contains the inspected ID. Referrer status counts only for the M7 Place statuses `draft`, `published`, or `archived`; legacy `hidden`/`deleted`, missing/unsupported status, malformed identity, or duplicate Place identity fails closed rather than being rewritten or silently hidden. | `entity_id = referrer place_id`; label is safe `name_th`, then safe `name_en`, then `place_id`. |
| `products` | Exact match on `products.related_place_id`. Product statuses `draft`, `published`, `hidden`, and `archived` count; `deleted` does not. Missing/unsupported status or malformed/duplicate Product identity fails closed. | `entity_id = product_id`; label is safe `name_th`, then safe `name_en`, then `product_id`. |
| `events` | Exact match on `events.related_place_id`. Event statuses `draft`, `published`, `hidden`, and `archived` count; `deleted` does not. Missing/unsupported status or malformed/duplicate Event identity fails closed. | `entity_id = event_id`; label is safe `title_th`, then safe `title_en`, then `event_id`. |
| `gallery` | Exact match on `gallery.related_place_id`; media manifest ownership, Place media roles, URLs, captions, and free text are not membership. Gallery statuses `draft`, `published`, `hidden`, and `archived` count; `deleted` does not. Missing/unsupported status or malformed/duplicate media identity fails closed. | `entity_id = media_id`; label is safe `title_th`, then safe `title_en`, then `media_id`. |
| `trip_templates` | Parse the stored text `trip_templates.place_ids` using the current literal-pipe grammar: require a string, split on `|`, trim each entry, discard blank entries, and retain only the first occurrence of each normalized ID in source order; every retained entry must satisfy the current safe ID grammar or inspection fails closed. Exact membership of the inspected ID counts. Template statuses `draft`, `published`, `hidden`, and `archived` count; `deleted` does not. Missing/unsupported status or malformed/duplicate Template identity fails closed. No alternate relationship model is inferred. | `entity_id = template_id`; label is safe `name_th`, then safe `name_en`, then `template_id`. |
| `reviews` | Exact match on `reviews.place_id`. Review statuses `pending`, `approved`, and `hidden` count because each remains an authoritative Admin record; `deleted` does not. Missing/unsupported status or malformed/duplicate Review identity fails closed. | `entity_id = review_id`; label is the existing safe Public reviewer label: `นักท่องเที่ยว` when `is_anonymous` is true under the current stored-boolean grammar, otherwise safe/formula-unescaped `reviewer_name`, with `review_id` as the blank-name fallback. Comment, rating, reply, actor, and moderation metadata are never returned. |

All scalar reference fields are strings and are trimmed before exact safe-ID comparison; blank optional scalar references mean no dependency, while a nonblank malformed reference on a non-deleted row fails closed. Pipe-list duplicates and duplicate Route relationship edges are normalized as specified above, but duplicate primary entity identities fail closed. Every returned group is deduplicated by `entity_id` and sorted by ascending code-unit `entity_id`; its count is `groups[key].length`, with no separate count or total field. Safe labels are trimmed, formula-unescaped human text bounded by the existing Admin safe-text rules; an invalid nonblank label fails closed and a blank label uses the stated ID fallback.

Products, Events, Gallery, and Reviews are authoritative dependencies because their current schemas and runtimes consume the stable fields named above. Explicit non-sources are Route/Place/Product/Event/Gallery/Review free text; Search/Home/Map projections and indexes; cache keys/entries; browser Favorites/localStorage; media-manifest ownership or media membership without `gallery.related_place_id`; `form_submissions.related_place_id` because it is historical intake data with no current Place-consuming runtime relationship; and activity/audit rows because they are immutable history rather than dependencies. None can create a group item.

Task 8 is advisory and read-only: it stores no preview, approval flag, nonce, bypass token, or dependency snapshot and performs no lock, write, audit, cache, epoch, property, migration, lifecycle, or version operation. Task 9 must call the same `AdminPlaceService_inspectDependencies_` model after its own authoritative lock/reread and must never accept the Task 8 browser response as Archive authority.

- [ ] **RED:** Seed all seven returned groups, both included and excluded statuses, pipe-delimited lists, duplicate edges/memberships, malformed/blank IDs, missing sheets, and duplicate identities. For Routes, prove a matching non-deleted `route_places.place_id` resolves through `route_places.route_id` to the parent `routes.route_id`, duplicate edges yield one Route, an orphan or duplicate/malformed parent fails closed, a deleted edge or parent is excluded, no denormalized Route membership field is read, and free-text Route fields cannot match. For Trip Templates, prove the exact literal-pipe trim/blank-discard/first-occurrence grammar, exact membership, all five common statuses, and malformed nonblank IDs/non-string storage fail closed. For nearby Places, Products, Events, and Gallery, exercise `draft`, `published`, `hidden`, `archived`, and `deleted` exactly as specified; legacy `hidden`/`deleted` Place referrers fail closed. For Reviews, exercise `pending`, `approved`, `hidden`, and `deleted`. Assert every primary/fallback label rule, anonymous Review labeling, invalid-label failure, exact group keys, `{entity_id,label}` only, array-length count semantics, deterministic dedupe/sort, bounded RFC 3339 `checked_at`, no raw rows/numbers, and `NOT_FOUND` for a missing Place. Prove the explicitly excluded sources cannot create dependencies, every write/lock/cache/property/migration sink remains armed to fail, repeated preview changes no source state, and a mutation that skips a consumer, Place existence check, or trusts client preview data fails. In `scripts/test-apps-script.js`, first run the current assertion against the pre-Task-8 Router and prove its exact approved POST action set contains `submitReview`, `adminLogin`, `adminValidateSession`, `adminLogout`, `adminGetPlaces`, `adminGetPlaceDetail`, `adminCreatePlace`, `adminSavePlaceDraft`, and `adminPublishPlace`, with `adminInspectPlaceDependencies` absent. Only after that proof, update the expectation to exactly those nine existing actions plus `adminInspectPlaceDependencies`, then run it against the still pre-GREEN Router so RED fails specifically because the inspection branch is missing. The assertion must reject `adminUnpublishPlace`, `adminArchivePlace`, `adminRestorePlace`, every other Task 9+ routed action, and every other extra POST action. Keep the Router assertion structural and exact: no wildcard, prefix match, substring match, broad regex, helper-gated dynamic route, indirect dispatch, dynamic pass-through, or permissive fallback. Run the focused suite and `node scripts/test-apps-script.js`; failures must be caused by the missing inspection behavior/group and Router branch.
- [ ] **GREEN:** Authenticate all four approved Admin roles, validate the exact `{place_id}` payload and unique authoritative Place identity, read each required authoritative Sheet once, and implement exactly the dependency model/table above using only the normalized `route_places` join and no Route schema extension. Return only the exact seven groups, safe items, and bounded server `checked_at`; keep the internal function pure and reusable for Task 9's locked authoritative recheck without storing preview state or altering relationships. Add only the static `adminInspectPlaceDependencies` Router branch and make `scripts/test-apps-script.js` enforce exactly the ten POST actions named in RED; preserve its strict extra-action and dynamic-dispatch mutation checks, and admit no Unpublish, Archive, Restore, or other Task 9+ route.
- [ ] Focused verification: `node scripts/test-admin-place-service.js`.
- [ ] Dependency regressions: `node scripts/test-route-service.js`; `node scripts/test-product-service.js`; `node scripts/test-event-service.js`; `node scripts/test-gallery-service.js`; `node scripts/test-review-service.js`; `node scripts/test-apps-script.js`.
- [ ] Run `git diff --check`; stage only the four allowlisted files (`apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `scripts/test-admin-place-service.js`, and `scripts/test-apps-script.js`); run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: inspect Admin Place dependencies"`.
- [ ] **REVIEW GATE:** Review source completeness, exact-ID matching, safe labels, and read-only behavior.

**MANUAL:** None.

## Task 9: Implement Unpublish, Archive, and Restore lifecycle actions

**File allowlist**

- Create: none
- Modify: `apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `scripts/test-admin-place-service.js`, `scripts/test-place-service.js`
- Test: `scripts/test-admin-place-service.js`, `scripts/test-place-service.js`

**Interfaces**

- Consumes: transaction/version/audit/epoch primitives and authoritative dependency inspector.
- Produces: `adminUnpublishPlace_`, `adminArchivePlace_`, `adminRestorePlace_` and corresponding Router actions.

- [ ] **RED:** Test the exact transition table and reject every other transition. Unpublish creates a draft from retained Published content only if none exists; Archive retains identity/published/draft/relationships and requires `confirmed:true`; Restore yields draft only. Assert all successful transitions increment `entity_version` and synchronize a retained/new `draft_version`; Unpublish and published-to-Archive advance/verify the epoch, while draft-to-Archive and Restore do not access or change it. Test `UNPUBLISH`/`ARCHIVE`/`RESTORE` audit. For Archive, change dependencies between preview and confirmation and assert the locked recheck is used; remove confirmation and assert no write. Prove stale versions, reviewer/viewer, direct archived Publish, audit/conditional-epoch failure, and rollback failure cannot succeed. Assert Favorites storage is never accessed or mutated and Public visibility follows status. Mutate away the confirmation-time dependency read, draft-version synchronization, or conditional epoch rule and prove failure.
- [ ] **GREEN:** For each action, authenticate/authorize, acquire the lock, reread the Place and zero-or-one draft, require submitted `expected_version == entity_version` plus the draft/version/base invariants when a draft exists, and stop stale requests before mutation/audit. Implement each action-owned compensated sequence and the exact conditional epoch rules above; synchronize any preserved/new draft version to the incremented entity version. Archive warning data may be summarized in the safe success message/data only from the fresh locked inspection; the operation remains allowed after explicit confirmation. Never delete rows or relationships.
- [ ] Focused verification: `node scripts/test-admin-place-service.js`; `node scripts/test-place-service.js`.
- [ ] Dependency regressions: `node scripts/test-route-service.js`; `node scripts/test-favorites.js`; `node scripts/test-apps-script.js`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`.
- [ ] Run `git diff --check`; stage only the four allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: add Admin Place lifecycle actions"`.
- [ ] **REVIEW GATE:** Transition matrix, dependency recheck, retained data, Favorites non-mutation, and compensation require explicit approval.

**MANUAL:** None.

## Task 10: Extend the existing Admin browser API for all Place actions

**File allowlist**


- Create: none


- Modify: `public/admin/js/admin-api.js`, `public/admin/js/admin-auth.js`, `scripts/test-admin-api.js`, `scripts/test-admin-auth.js`
- Test: `scripts/test-admin-api.js`, `scripts/test-admin-auth.js`


**Interfaces**

- Consumes: existing single-fetch `request(body)`, Admin token/session access, exact service contracts.
- Produces: on `TakhunAdminApi`, `getPlaces`, `getPlaceDetail`, `getPlaceMediaOptions`, `inspectPlaceDependencies`, `createPlace`, `savePlaceDraft`, `publishPlace`, `unpublishPlace`, `archivePlace`, `restorePlace`; safe-code allowlist adds existing `NOT_FOUND` and new `CONFLICT`.

- [ ] **RED:** Add exact response validators for list/detail/media/dependencies/write results, malformed-key/type/length/version/media projections, unknown backend code normalization, and every request body/action. Executably count fetch calls: each write invocation performs exactly one fetch and never retries timeout/network/HTTP/malformed/5xx outcomes. Assert token appears once in body and never URL/query/header/log/error; preserve `text/plain;charset=utf-8`, timeout/abort, safe messages, and no response echo. Mutation proof adding a retry or accepting arbitrary objects/codes must fail.
- [ ] **GREEN:** Extend the existing dispatcher/validator/export only. Do not add a second transport or expose generic `request`. Add `NOT_FOUND`/`CONFLICT` to auth-safe classification without treating them as session invalidation.
- [ ] Focused verification: `node scripts/test-admin-api.js`; `node scripts/test-admin-auth.js`.
- [ ] Dependency regressions: `node scripts/test-admin-shell.js`; `node scripts/test-api.js`.
- [ ] Run `git diff --check`; stage only the four allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: extend Admin API for Places"`.
- [ ] **REVIEW GATE:** Transport/token safety, exact validators, error vocabulary, and no-retry mutation proof must pass.

**MANUAL:** None.

## Task 11: Replace the Places shell stub with the responsive list controller

**File allowlist**

- Create: `public/admin/js/admin-places.js`, `public/css/admin-places.css`, `scripts/test-admin-places.js`
- Modify: `public/admin/places.html`, `scripts/test-admin-shell.js`, `scripts/test.ps1`
- Test: `scripts/test-admin-places.js`, `scripts/test-admin-shell.js`

**Interfaces**

- Consumes: `TakhunAdminShell.init()`, `TakhunAdminAuth.requireProtectedPage()`, `TakhunAdminApi.getPlaces`, exact list projection and fixed category/status filters.
- Produces: `TakhunAdminPlaces.init()`; semantic desktop table/mobile cards from one state model; Create/Edit links using exact Place Edit URLs.

- [ ] **RED:** Add DOM-harness tests for initial hidden guard, one read after auth, search/filter/page reset, archived-default behavior, pagination correction, loading/empty/error/retry, text-only rendering, status/draft badges, role-specific View/Edit/Create presentation, no polling, and no handling of historical `?edit=`. Assert valid Edit link encoding and 44px controls. Run the new test; failure must be absent controller/markup.
- [ ] **GREEN:** Replace only the stub content, load the scoped stylesheet/controller, render with created nodes and `textContent`, use submit/debounce without polling, and preserve shell landmarks/drawer behavior. Reviewer/viewer links open semantic read-only detail; no write button is authority.
- [ ] Focused verification: `node scripts/test-admin-places.js`; `node scripts/test-admin-shell.js`.
- [ ] Dependency regressions: `node scripts/test-admin-auth.js`; `node scripts/test-admin-api.js`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`.
- [ ] Run `git diff --check`; stage only the six allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: build Admin Places list"`.
- [ ] **REVIEW GATE:** Review shell preservation, safe rendering, roles, state transitions, pagination, and responsive semantics.

**MANUAL:** None.

## Task 12: Build Place Create/Edit form and bilingual content workflow

**File allowlist**

- Create: `public/admin/place-edit.html`, `public/admin/js/admin-place-edit.js`, `scripts/test-admin-place-edit.js`
- Modify: `public/css/admin-places.css`, `scripts/test-admin-shell.js`, `scripts/test.ps1`
- Test: `scripts/test-admin-place-edit.js`, `scripts/test-admin-shell.js`

**Interfaces**

- Consumes: strict URL grammar, Admin shell/auth, `getPlaceDetail`, `createPlace`, `savePlaceDraft`, `publishPlace`, `COMPLETE_EDITABLE_CONTENT`.
- Produces: `TakhunAdminPlaceEdit.init()`; exact Create/no-query and Edit/query modes; normalized form snapshot and two-phase Save-and-Publish orchestration.

- [ ] **RED:** Test independent strict query validation before API calls, no accidental Create on invalid context, fixed empty Create values, immutable ID, all exact content controls, labels, Thai/English ARIA tabs with Arrow/Home/End and retained values, draft vs publish requirements, exact normalized complete payload, Create redirect to canonical Edit, save-only vs save-then-publish, and “draft saved, publish failed” state. Assert no write retry and no invented optional/English content. Run the new test; failure must be missing page/controller.
- [ ] **GREEN:** Build one full-page form with identity/status, bilingual content, area/category, details, contact/opening, related/public behavior, and action sections. Implement structural client feedback while keeping server validation authoritative. On success replace baseline from server/detail; never assume submitted content is stored.
- [ ] Focused verification: `node scripts/test-admin-place-edit.js`; `node scripts/test-admin-shell.js`.
- [ ] Dependency regressions: `node scripts/test-admin-api.js`; `node scripts/test-admin-auth.js`; `node scripts/test-admin-places.js`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`.
- [ ] Run `git diff --check`; stage only the six allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: build Admin Place editor"`.
- [ ] **REVIEW GATE:** Review exact URL mode, full field mapping, bilingual tabs, two-phase action, safe DOM, and baseline handling.

**MANUAL:** None.

## Task 13: Add the accessible Admin Place map picker

**File allowlist**

- Create: `public/admin/js/admin-place-map.js`, `scripts/test-admin-place-map.js`
- Modify: `public/admin/place-edit.html`, `public/admin/js/admin-place-edit.js`, `public/css/admin-places.css`, `scripts/test.ps1`
- Test: `scripts/test-admin-place-map.js`, `scripts/test-admin-place-edit.js`

**Interfaces**

- Consumes: labeled latitude/longitude inputs, optional global Leaflet, existing `google_maps_url`.
- Produces: `TakhunAdminPlaceMap.init({mapElement,latitudeInput,longitudeInput,statusElement,openLink})`, with `getValue`, `setValue`, `destroy`.

- [ ] **RED:** Test complete valid pairs, empty pair, incomplete/non-numeric/out-of-range errors, click-to-set, drag-to-update, manual input moving marker, no movement on invalid data, no automatic `navigator.geolocation`, keyboard-usable fields/zoom, and validated HTTPS Google Maps link or encoded coordinate query with `_blank` and `noopener noreferrer`. Test graceful form-only behavior when Leaflet fails. Run the map/editor tests; failure must be missing module.
- [ ] **GREEN:** Integrate Leaflet/OpenStreetMap progressively; numeric inputs remain the source of editable state. Never parse shortened Maps URLs for coordinates and never request location.
- [ ] Focused verification: `node scripts/test-admin-place-map.js`; `node scripts/test-admin-place-edit.js`.
- [ ] Dependency regressions: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-map.ps1`; `node scripts/test-routes.js`; `node scripts/test-admin-shell.js`.
- [ ] Run `git diff --check`; stage only the six allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: add Admin Place map picker"`.
- [ ] **REVIEW GATE:** Review coordinate parity, non-pointer access, geolocation prohibition, link safety, and degraded mode.

**MANUAL:** None.

## Task 14: Implement approved media selection and the Public Place Gallery extension

**File allowlist**


- Create: `public/admin/js/admin-place-media.js`, `scripts/test-admin-place-media.js`
- Modify: `apps-script/Config.gs`, `apps-script/AdminPlaceService.gs`, `apps-script/Router.gs`, `public/admin/place-edit.html`, `public/admin/js/admin-place-edit.js`, `public/css/admin-places.css`, `public/js/media.js`, `public/js/place-detail.js`, `apps-script/PlaceService.gs`, `scripts/test-admin-place-service.js`, `scripts/test-place-service.js`, `scripts/test-media.js`, `scripts/test-place-detail.ps1`, `scripts/test.ps1`
- Test: all four named JavaScript suites plus `scripts/test-place-detail.ps1`


**Interfaces**

- Consumes: server properties `ADMIN_PLACE_MEDIA_MANIFEST_URL`/`ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN`, deployed manifest v1, `UrlFetchApp.fetch`, existing `TakhunMedia.normalizeManifest`, `pictureModel`, and cover `mediaIdFor` behavior.

- Produces: `adminGetPlaceMediaOptions_`; internal `AdminPlaceService_readApprovedMedia_`/`AdminPlaceService_validatePlaceMedia_`; `TakhunAdminPlaceMedia.init(...)`; Public `getPlaceDetail.data.gallery_media_ids`; `TakhunMedia.pictureModelForEntityRole(mediaId,entityType,entityId,role,lang)`.

- [ ] **RED:** Backend tests reject request-supplied manifest URL/origin, non-HTTPS/wrong-origin/fetch/parse/schema failure, arbitrary/cross-Place/cross-role/unapproved IDs, external/data/blob/source paths, URL-era image payloads, more than 50 gallery IDs, non-canonical ID grammar, whitespace/empty segments, duplicate IDs, non-canonical serialized text, and cover IDs other than the derived same-Place cover. Assert Sheet storage is exactly `""` or one `|`-joined ordered ID string and stores no preview/path/manifest metadata. Assert safe Admin projection strips bytes/SHA/source metadata and no fetch/write retry occurs. UI tests cover search/pagination/empty/error, derived same-Place cover display, ordered gallery add/remove/reorder, safe previews, and no URL/upload/cross-Place selection. Public tests assert only `gallery_media_ids` is added, ordered same-Place gallery rendering, Draft gallery edits remaining invisible until Publish, archived/unpublished detail returning `NOT_FOUND`, hidden empty/invalid gallery, role/entity mismatch rejection, fallback, unchanged cover derivation across Places/Map/Routes/Search/Favorites/nearby, reorder not affecting Hero, and no `gallery_image_urls` inference. Mutation tests loosen entity/role/path/serialization/status checks and must fail.
- [ ] **GREEN:** Fetch only the server configured origin and normalize it before enabling non-empty media writes. Implement one canonical serializer/parser shared by Admin Place validation: zero IDs -> `""`; otherwise validate 1–50 unique ordered IDs against the exact grammar and authoritative same-Place `gallery` entries, then join with `|`; parsing must round-trip to the identical string. Revalidate during both Draft Save and Publish and store only IDs. Add `gallery_media_ids` as the only new Gallery field in the Public detail projection; the Public projector returns the ordered ID array only when the stored string passes the same syntax/count/uniqueness/canonical-round-trip checks, otherwise it returns `[]`. Do not return Sheet-stored paths or Admin manifest metadata. Preserve the existing `gallery_image_urls` response key for frozen API compatibility, but keep it inert: M7 writes cannot change it and Place Detail never uses it as a production Gallery source. Extend the runtime with an entity/role-checked lookup without changing `mediaIdFor("place", id)`. Render each published ID only after same-Place role verification; skip invalid/missing entries safely, hide an empty gallery, and leave Hero derivation untouched. Land backend validation, write enablement, Public projection, and runtime/controller tests in this single reviewed task so Public Gallery behavior cannot exist before manifest validation. Do not edit the manifest or create media assets in this task; the current absence of compatible Place-gallery entries is a valid empty state.

- [ ] Focused verification: `node scripts/test-admin-place-service.js`; `node scripts/test-admin-place-media.js`; `node scripts/test-place-service.js`; `node scripts/test-media.js`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-place-detail.ps1`.
- [ ] Dependency regressions: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-places.ps1`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-map.ps1`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-routes.ps1`; `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-favorites.ps1`; `node scripts/test-search.js`; `node scripts/test-apps-script.js`.
- [ ] Run `git diff --check`; stage only the sixteen allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: add approved Place gallery media"`.
- [ ] **REVIEW GATE:** Manifest origin/path/schema safety, same-Place/role binding, ordered persistence, Public isolation, and cover regressions require independent approval.

**MANUAL:** None. Do not set media Script Properties or add production media here.

## Task 15: Add semantic read-only reviewer and viewer detail

**File allowlist**

- Create: none
- Modify: `public/admin/js/admin-place-edit.js`, `public/admin/place-edit.html`, `public/css/admin-places.css`, `scripts/test-admin-place-edit.js`, `scripts/test-admin-places.js`
- Test: `scripts/test-admin-place-edit.js`, `scripts/test-admin-places.js`

**Interfaces**

- Consumes: detail capabilities and current authoritative role.
- Produces: semantic definition/list content for read-only users; reviewer working/published view switch; zero write controls for reviewer/viewer.

- [ ] **RED:** Test reviewer can inspect working and separately request published when available; viewer receives normal read-only detail; neither gets disabled-form presentation or write controls. Fabricated client handler invocation must still reach server `FORBIDDEN` tests from Task 5. Test list labels are View rather than Edit. Run both UI suites; failure must show editable presentation remains.
- [ ] **GREEN:** Branch presentation from safe capabilities, not locally invented permissions. Render read-only semantic groups and safe media; keep comparison switching read-only and non-dirty.
- [ ] Focused verification: `node scripts/test-admin-place-edit.js`; `node scripts/test-admin-places.js`.
- [ ] Dependency regressions: `node scripts/test-admin-place-service.js`; `node scripts/test-admin-api.js`; `node scripts/test-admin-shell.js`.
- [ ] Run `git diff --check`; stage only the five allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: add read-only Place review views"`.
- [ ] **REVIEW GATE:** Review semantic output, role parity, no UI authority assumptions, and non-dirty comparisons.

**MANUAL:** None.

## Task 16: Harden conflict, unsaved-change, archive, and failure UX

**File allowlist**

- Create: none
- Modify: `public/admin/js/admin-place-edit.js`, `public/admin/js/admin-places.js`, `public/admin/place-edit.html`, `public/css/admin-places.css`, `scripts/test-admin-place-edit.js`, `scripts/test-admin-places.js`
- Test: `scripts/test-admin-place-edit.js`, `scripts/test-admin-places.js`

**Interfaces**

- Consumes: `CONFLICT`, dependency preview, write results, normalized baseline, browser `beforeunload`.
- Produces: accessible conflict/discard/archive dialogs and persistent safe failure states.

- [ ] **RED:** Test dirty only on normalized editable changes; tab/map-pan/media-filter/published comparison are clean. Same-origin navigation uses a dialog; close/reload uses `beforeunload`; failed writes retain data/dirty state. Conflict preserves form, offers confirmed latest reload, and never auto-retries/forces. Archive previews dependencies, requires explicit confirmation, submits only `confirmed:true`, and handles changed confirmation-time results. Save-then-Publish accurately distinguishes saved draft from failed Publish. Network/timeout/malformed/server errors remain bounded and allow only user-triggered actions. Mutation removing confirmation or adding retry must fail.
- [ ] **GREEN:** Centralize action busy state so double submission is blocked, use accessible focus-managed dialogs/status regions, and update baseline only after authoritative success/reload. Never put form content/token in logs or URLs.
- [ ] Focused verification: `node scripts/test-admin-place-edit.js`; `node scripts/test-admin-places.js`.
- [ ] Dependency regressions: `node scripts/test-admin-api.js`; `node scripts/test-admin-auth.js`; `node scripts/test-admin-place-service.js`.
- [ ] Run `git diff --check`; stage only the six allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "feat: harden Admin Place failure UX"`.
- [ ] **REVIEW GATE:** Conflict preservation, no retry/force, dirty baseline, archive confirmation, and focus management require approval.

**MANUAL:** None.

## Task 17: Complete Admin Place accessibility and responsive hardening

**File allowlist**

- Create: `scripts/test-admin-places-accessibility.js`
- Modify: `public/admin/places.html`, `public/admin/place-edit.html`, `public/admin/js/admin-places.js`, `public/admin/js/admin-place-edit.js`, `public/admin/js/admin-place-map.js`, `public/admin/js/admin-place-media.js`, `public/css/admin-places.css`, `scripts/test-admin-places.js`, `scripts/test-admin-place-edit.js`, `scripts/test.ps1`
- Test: all three Admin Place UI suites plus existing Admin shell suite

**Interfaces**

- Consumes: completed list/editor/map/media/dialog components and frozen shell behavior.
- Produces: WCAG-oriented keyboard/focus/status semantics and layouts at 360/768/1024/1440 CSS pixels.

- [ ] **RED:** Add static/DOM tests for one `h1`, landmarks, label/control association, grouped errors with focus to summary/first invalid field, `aria-live` non-duplication, tab semantics, modal focus trap/Escape/restore, keyboard media reorder alternative, 44px targets, no horizontal page overflow at 360px, desktop table/mobile cards, map form fallback, and shell content hidden until auth. Run tests; failure must identify exact missing semantic/style rule.
- [ ] **GREEN:** Make the smallest markup/controller/CSS corrections. Preserve shell skip link/drawer trap/backdrop/Escape/restore and reduced-motion/high-contrast behavior. Do not change business contracts.
- [ ] Focused verification: `node scripts/test-admin-places-accessibility.js`; `node scripts/test-admin-places.js`; `node scripts/test-admin-place-edit.js`; `node scripts/test-admin-shell.js`.
- [ ] Dependency regressions: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`.
- [ ] Run `git diff --check`; stage only the eleven allowlisted files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "fix: harden Admin Places accessibility"`.
- [ ] **REVIEW GATE:** Keyboard-only, screen-reader semantics, focus, auth hiding, target size, and breakpoint behavior require approval.

**MANUAL:** None; browser visual QA belongs to staging.

## Task 18: Prove cross-consumer Public and security regressions

**File allowlist**

- Create: `scripts/test-admin-place-regressions.js`
- Modify: `scripts/test-place-service.js`, `scripts/test-home-service.js`, `scripts/test-search-service.js`, `scripts/test-route-service.js`, `scripts/test-product-service.js`, `scripts/test-event-service.js`, `scripts/test-media.js`, `scripts/test-admin-api.js`, `scripts/test-admin-auth.js`, `scripts/test-apps-script.js`, `scripts/test.ps1`
- Test: all modified/new tests

**Interfaces**

- Consumes: completed M7 backend/browser/Public contracts.
- Produces: an integrated mutation/failure regression suite; no production interface.



- [ ] **RED:** Add cross-service scenarios that hold Published content, save a conflicting draft, exercise every Public consumer, then Publish and Unpublish across epoch changes, Archive from both published and draft states, and Restore without an epoch change. Assert no draft/status/version/actor/audit/media-internal leakage; stale cache cannot cross Draft/Public; only the exact Place-bearing action keys include the epoch; arbitrary media never publishes; cover derivation/favorites remain stable; token transport stays body-only; all six writes have no retry; safe-return bypasses fail. Introduce controlled mutations for each security/lifecycle proof required by the approved design and final targeted-review refinements and show at least one assertion fails for every mutant.
- [ ] **GREEN:** If a test exposes a production defect, stop and return to the owning earlier task/allowlist for a reviewed fix rather than modifying production under this test-only task. Keep this task test-only.
- [ ] Focused verification: `node scripts/test-admin-place-regressions.js` plus every modified Node suite.
- [ ] Dependency regressions: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`; `npm test`; `npm run build`.

- [ ] Run `git diff --check`; stage only the twelve allowlisted test/runner files; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "test: prove Admin Place contract boundaries"`.
- [ ] **REVIEW GATE:** Reviewer maps every required strong proof to an executable test/mutant; missing proof is `IMPORTANT` or `BLOCKER` for security/lifecycle boundaries.

**MANUAL:** None.


## Task 19: Synchronize M7 documentation and prepare final local review

**File allowlist**

- Create: none
- Modify: `docs/DATA_SCHEMA.md`, `docs/API_SPEC.md`, `docs/ADMIN_CMS_SPEC.md`, `docs/DEVELOPMENT_RULES.md`, `docs/TESTING_CHECKLIST.md`
- Test: documentation scans plus full repository test/build commands

**Interfaces**

- Consumes: the implemented schema/actions/projections/migration/cache/media/security behavior from Tasks 1–18.
- Produces: frozen documentation matching actual M7 behavior, with no unrelated historical rewrite.

- [ ] **RED:** Before edits, run targeted documentation searches and record each mismatch: common vs Place statuses, physical `place_drafts`/versions/lifecycle fields, audit aliases, exact ten Admin actions and shapes, existing `NOT_FOUND` vs new `CONFLICT`, safe Edit return grammar, media origin/same-Place roles/gallery extension, dependency consumers, cache epoch, roles/no retry/compensation, migration and QA gates. The mismatch list is the failing documentation test.
- [ ] **GREEN:** Update only the five named documents and make actual code the evidence. Preserve common statuses for non-Place entities and historical M6 contracts. Document every remote operation as human-controlled.
- [ ] Focused verification: in the task window/path/branch, use `rg -n "admin(GetPlaces|GetPlaceDetail|GetPlaceMediaOptions|InspectPlaceDependencies|CreatePlace|SavePlaceDraft|PublishPlace|UnpublishPlace|ArchivePlace|RestorePlace)|place_drafts|gallery_media_ids|PLACE_PUBLIC_CACHE_EPOCH|CONFLICT|NOT_FOUND" docs` and compare names with source/tests.
- [ ] Dependency regressions: `npm test`; `npm run build`; `Get-ChildItem -LiteralPath public,apps-script,scripts -Recurse -File -Include *.js,*.gs | ForEach-Object { node --check $_.FullName }` (Apps Script globals are syntax-checked only).
- [ ] Run `git diff --check`; stage only the five allowlisted docs; run and inspect `git diff --cached --name-only` and `git diff --cached`.
- [ ] Commit: `git commit -m "docs: document Admin Places CMS contracts"`.
- [ ] **REVIEW GATE:** Contract reviewer compares every approved design section 1–24 to code, tests, and one documentation location; any behavior/doc mismatch blocks final gates.

**MANUAL:** None.

## Mandatory execution order

The detailed task blocks are identified by number; execute strictly `1 -> 2 -> ... -> 19`, regardless of where a renderer places cross-references. In particular, no UI write control precedes Tasks 3–10, no lifecycle write precedes Task 4 transaction/audit enforcement, no Publish precedes Task 6 epoch keys, and no media UI precedes Task 14 server validation.

## Expected milestone file surface

No file outside this aggregate allowlist may change without stopping for a design amendment and reviewer approval.

**Create:**

```text
apps-script/AdminPlaceSchema.gs
apps-script/AdminPlaceService.gs
public/admin/place-edit.html
public/admin/js/admin-places.js
public/admin/js/admin-place-edit.js
public/admin/js/admin-place-map.js
public/admin/js/admin-place-media.js
public/css/admin-places.css
scripts/test-admin-place-schema.js
scripts/test-admin-place-service.js
scripts/test-admin-places.js
scripts/test-admin-place-edit.js
scripts/test-admin-place-map.js
scripts/test-admin-place-media.js
scripts/test-admin-places-accessibility.js
scripts/test-admin-place-regressions.js
```

**Modify:**

```text
apps-script/Config.gs
apps-script/SheetService.gs
apps-script/Router.gs
apps-script/PlaceService.gs
apps-script/HomeService.gs
apps-script/SearchService.gs
apps-script/RouteService.gs
apps-script/ProductService.gs
apps-script/EventService.gs
apps-script/ReviewService.gs
public/admin/places.html
public/admin/js/admin-api.js
public/admin/js/admin-auth.js
public/js/media.js
public/js/place-detail.js
docs/DATA_SCHEMA.md
docs/API_SPEC.md
docs/ADMIN_CMS_SPEC.md
docs/DEVELOPMENT_RULES.md
docs/TESTING_CHECKLIST.md
scripts/test.ps1
scripts/test-sheet-service.js
scripts/test-admin-api.js
scripts/test-admin-auth.js
scripts/test-admin-shell.js
scripts/test-place-service.js
scripts/test-home-service.js
scripts/test-search-service.js
scripts/test-route-service.js
scripts/test-product-service.js
scripts/test-event-service.js
scripts/test-review-service.js
scripts/test-media.js
scripts/test-place-detail.ps1
scripts/test-apps-script.js
```

The current `scripts/test.ps1` missing separators between some Apps Script filenames is pre-existing. Task 1 may correct only the separators needed to add the new required files and make the required-file list accurate; it must not broaden into unrelated runner cleanup.

## Final gates


### Gate A — Local final review

Window: `TAKHUN-ADMIN-PLACES-CMS`
Path: `J:/wt/takhun-admin-places-cms`
Branch: `feature/admin-places-cms`


- [ ] Verify `git branch --show-current` and `git status --short --branch`; stop on the wrong branch or unexplained changes.
- [ ] Run all focused M7 suites: `node scripts/test-admin-place-schema.js`; `node scripts/test-admin-place-service.js`; `node scripts/test-admin-places.js`; `node scripts/test-admin-place-edit.js`; `node scripts/test-admin-place-map.js`; `node scripts/test-admin-place-media.js`; `node scripts/test-admin-places-accessibility.js`; `node scripts/test-admin-place-regressions.js`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Syntax-check every tracked JavaScript file: `git ls-files "*.js" | ForEach-Object { node --check $_; if ($LASTEXITCODE -ne 0) { throw "Syntax failed: $_" } }`.

- [ ] Run `git diff --check`.
- [ ] Secret/transport scan tracked milestone files for private keys, committed credentials, token-like values, `Authorization`, query-token construction, `media-source`, source paths, non-production manifest configuration, and console logging of request/session/form data. Any hit is manually classified; unexplained hits stop the gate.
- [ ] Compare `git diff --name-only 59993aa...HEAD` plus current changes against the aggregate milestone allowlist above. Any extra file stops the gate.
- [ ] Run the prohibited-language/conflict scan without embedding the target words literally in this document:

```powershell
$terms = @('TO'+'DO','T'+'BD','place'+'holder','implement'+' later','similar'+' to','<'+'<'+'<'+'<'+'<'+'<'+'<','='+'='+'='+'='+'='+'='+'=','>'+ '>'+ '>'+ '>'+ '>'+ '>'+ '>')
Select-String -LiteralPath docs/superpowers/plans/2026-08-10-admin-places-cms-implementation-plan.md -Pattern $terms -SimpleMatch
```

  Stop on every semantic hit; media fallback terminology in source is not an exception inside this plan.
- [ ] Contract review: map approved design sections 1–24 to Tasks 1–19; verify all action/interface names, fields, status transitions, physical sheets, properties, media binding, return grammar, errors, roles, audit aliases, compensation, and cache consumers match code/tests/docs.
- [ ] Reviewer gives `APPROVED` or findings classified `BLOCKER`/`IMPORTANT`/`MINOR`; do not enter staging with any unresolved `BLOCKER` or `IMPORTANT`.

No commit, push, deployment, Sheet access, or property modification is part of this gate.

### Gate B — HUMAN-ONLY staging schema, migration, deployment, and QA

Every item in this gate is performed by a human in the named windows. Stop at the first failed verification; do not continue or improvise repair against staging/production.

1. **Backup and preflight**

   Window: `TAKHUN-ADMIN-PLACES-CMS` (VS Code + Terminal)
   Path: `J:/wt/takhun-admin-places-cms`
   Branch: `feature/admin-places-cms`

   - Human confirms local `npm test`, `npm run build`, syntax, and diff checks are green and records HEAD.
   - Human exports complete staging `places`, `activity_logs`, and all dependency sheets to timestamped recoverable files before any schema change; record backup location/reference and access test.
   - Human obtains a read-only staging snapshot and computes/records row count plus the exact sorted-ID SHA-256 defined in Task 1. Stop for duplicate/blank IDs, unknown statuses, unreadable backup, or mismatch.

2. **Apps Script code and properties**

   Window: `TAKHUN-ADMIN-PLACES-CMS` (Terminal + Apps Script editor)
   Path: `J:/wt/takhun-admin-places-cms`
   Branch: `feature/admin-places-cms`

   - Human runs the approved `clasp push` workflow and creates/updates a non-live staging Apps Script deployment only after reviewing the exact pushed diff/version. Keep the staging frontend pointed at the prior deployment until schema/migration verification completes. This is not automated by the plan.
   - Human sets staging-only `PLACE_PUBLIC_CACHE_EPOCH=1`, `ADMIN_PLACE_MEDIA_MANIFEST_URL` to the HTTPS deployed production-manifest URL for the staging frontend, and `ADMIN_PLACE_MEDIA_ALLOWED_ORIGIN` to that exact HTTPS origin. Do not commit these values.
   - Verify the deployed script reads the intended staging Spreadsheet ID and origin, and no secret appears in source/logs. Stop on wrong project, URL, origin, spreadsheet, deployment, or permissions.

3. **Schema and deterministic legacy migration**

   Window: `TAKHUN-ADMIN-PLACES-CMS` (Apps Script editor execution log)
   Path: `J:/wt/takhun-admin-places-cms`
   Branch: `feature/admin-places-cms`

   - Human runs `setupAdminPlaceSchema()` once; verify only appended `places`/`activity_logs` headers, exact new `place_drafts` header order, and epoch initialization. Stop on reordered/removed headers or any data rewrite.
   - Human runs `inspectAdminPlaceStatusMigration()` and compares dry-run counts, IDs digest, status mapping, and proposed draft count against backup. No writes are allowed in this step.
   - Human sets the five exact `ADMIN_PLACE_MIGRATION_*` controls listed in the physical schema section, then runs `migrateAdminPlaceLegacyStatuses()` once.
   - Human runs `verifyAdminPlaceStatusMigration()`. Verify identical row count/ID digest, exact deterministic mapping, exact draft rows, no content/ID loss, no remaining Place `hidden/deleted`, and migration disabled. Stop and do not serve M7 if any check differs.
   - Only after verification succeeds, human points the staging frontend config/deployment alias to the new Apps Script version and verifies the exact HTTPS API URL before QA.
   - Rollback procedure on failure: disable the deployment, preserve failed-state exports/logs, restore `places`, `place_drafts`, and `activity_logs` from the preflight backup as complete sheets, restore the prior epoch/property values, then recompute row count/ID digest and compare to preflight. Do not manually patch selected rows. Resume only after a new local fix/review/deployment cycle.

4. **Staging manual QA**

   Window: `TAKHUN-ADMIN-PLACES-CMS` (staging browser + DevTools)
   Path: `J:/wt/takhun-admin-places-cms`
   Branch: `feature/admin-places-cms`

   - Test `super_admin`, `editor`, `reviewer`, `viewer`, expired/revoked session, and fabricated write calls.
   - Test Create, Save Draft, two-phase Save/Publish, Unpublish, dependency preview plus changed dependency before confirmation, Archive, Restore, and invalid direct archived Publish.
   - Open the same Place in two tabs; save in tab A and prove stale tab B gets `CONFLICT`, preserves unsaved data, offers confirmed reload, and has no force/retry.
   - Prove Public remains byte-for-byte semantically unchanged after Draft Save, changes after Publish, disappears after Unpublish/Archive, and remains draft after Restore until separate Publish.
   - Test manifest empty/failure, same-Place cover, ordered Gallery where compatible staging items exist, and rejection of arbitrary/cross-role/cross-Place/source URL references.
   - Test safe login return for valid Edit and invalid duplicate/extra/fragment/external/traversal/auth-material inputs.
   - Test keyboard-only and screen-reader flows, focus/error/dialog behavior, no automatic location prompt, 360/768/1024/1440 layouts, desktop/mobile, reduced motion, and console/network safety.
   - Record evidence and reviewer decision. Any security, data-loss, rollback, draft-isolation, concurrency, auth, or accessibility failure stops the gate.

5. **Production release later**

   Window: `TAKHUN-ADMIN-PLACES-CMS` (release Terminal + production Apps Script/Sheets)
   Path: `J:/wt/takhun-admin-places-cms`
   Branch: `feature/admin-places-cms`

   - Production push/deploy, Script Properties, backup, dry-run, schema migration, data migration, verification, smoke test, and rollback use the same order and stop conditions only after staging and PR approval. They are not authorized by implementation Tasks 1–19.

### Gate C — Pre-PR

Window: `TAKHUN-ADMIN-PLACES-CMS`

Path: `J:/wt/takhun-admin-places-cms`
Branch: `feature/admin-places-cms`

- [ ] Restore any temporary staging frontend config to the approved committed non-secret value, then rerun `npm test`, `npm run build`, tracked-JS syntax, and `git diff --check`.
- [ ] Require `git status --short --branch` clean and verify no staging URL/property/credential/export/log is tracked.
- [ ] Run `git fetch` only when the human authorizes network Git; verify `git rev-list --left-right --count origin/feature/admin-places-cms...feature/admin-places-cms` and base divergence before push.
- [ ] For remote Git only, the human may use the already-established short `T:` SUBST / `GIT_DIR` workaround. Verify HEAD/status before and after; never retry a commit due only to the trailing `$GIT_DIR` diagnostic.

- [ ] Human pushes `feature/admin-places-cms`. Push is not implied by completing local tasks.

Stop if the tree is dirty, regressions fail, secrets/staging config remain, or divergence is unexplained.

### Gate D — PR review

Window: `TAKHUN-ADMIN-PLACES-CMS` (PR browser + review Terminal)

Path: `J:/wt/takhun-admin-places-cms`
Branch: `feature/admin-places-cms`

- [ ] Human opens the PR only after Gate C.
- [ ] Review schema/migration, authorization, exact API/envelope, concurrency, rollback/audit, dependency recheck, media origin/entity/role, safe return, UI/accessibility, Public caches/regressions, and documentation.
- [ ] Classify findings `BLOCKER`, `IMPORTANT`, `MINOR`; rerun affected focused/full gates after fixes. Do not merge with unresolved `BLOCKER` or `IMPORTANT`, failing checks, or missing staging evidence.


### Gate E — Post-merge main verification and cleanup

Window: `TAKHUN-TRIP (main)`
Path: the current canonical main repository
Branch: `main`

- [ ] Human updates `main` using the repository's approved non-destructive Git flow and verifies the merge commit is present.
- [ ] Run `npm test`, `npm run build`, tracked-JS syntax, and `git diff --check` on `main`; require `git status --short --branch` clean.
- [ ] Remove the `J:/wt/takhun-admin-places-cms` worktree only after confirming its absolute path is the intended worktree, it is clean, and all required commits are reachable from `main`. Use the repository's approved worktree removal command; never recursively delete it directly.
- [ ] Delete the local feature branch only after reachability verification. Delete the remote feature branch only by explicit human choice after merge.
- [ ] Finish with a clean, up-to-date `main`; stop cleanup if any commit is not reachable or any tree is dirty.

## Plan self-review checklist

- [ ] Approved design sections 1–5 map to goal, constraints, chosen storage, and Task 19 documentation.
- [ ] Sections 6–8 map to Tasks 1, 3–5, 7, and 9.
- [ ] Sections 9–10 map to Tasks 5, 7, 13, and 14.
- [ ] Section 11 maps to Tasks 2 and 11–17.
- [ ] Sections 12–13 map to Tasks 3, 5, 7, 9, and 10.
- [ ] Section 14 maps to Tasks 8–9 and Favorites regressions.
- [ ] Sections 15–17 map to Tasks 2, 4–10, 14, 16, and 18.
- [ ] Sections 18–20 map to Tasks 11–18 and Gate B QA.
- [ ] Sections 21–22 map to the aggregate file surface and global constraints.
- [ ] Sections 23–24 map to Tasks 18–19 and Gates A–E.
- [ ] Verify exact interface names are identical in schema, tasks, tests, browser client, Router, and docs.
- [ ] Verify numerical task order creates every consumed interface earlier; no production change appears before its named failing test.
- [ ] Verify every task has focused tests, dependency regressions, diff check, staged allowlist, exact commit, and review gate.
- [ ] Verify all remote operations are isolated in HUMAN-ONLY gates and cannot run during Tasks 1–19.
- [ ] Run the Gate A prohibited-language/conflict scan and resolve every hit.
