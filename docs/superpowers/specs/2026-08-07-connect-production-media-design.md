# Connect Production Media to Public Pages — Design

**Date:** 2026-08-07  
**Milestone:** Milestone 5 — Connect Production Media Assets  
**Base inspected:** `origin/main` at merge commit `4ecee1d`  
**Feature branch inspected:** `feature/connect-production-media`

## 1. Goal

Complete the connection between the existing approved local media pipeline and the public Takhun Trip pages. The implementation must keep the public API and content records focused on entity data, derive approved media IDs from stable entity IDs in the frontend, and render only generated local WebP variants or local placeholders through the shared media runtime.

Success means that covered entities display the approved responsive image, uncovered or invalid entities fail safely, Thai and English alt behavior is correct, each page has appropriate loading priority, and no public code can expose `media-source` or accept a remote image as a production fallback.

## 2. Non-goals

- Adding, replacing, regenerating, or editing source photographs, generated WebP files, the private media specification, or the public manifest.
- Changing Apps Script services, API response shapes, Google Sheets schemas or content, admin/CMS behavior, deployment configuration, or Cloudflare configuration.
- Adding media coverage for entities that are not among the 18 approved manifest items.
- Adding new Home sections. The existing Home implementation renders hero, featured places, featured routes, and upcoming events; it does not render the `featured_products` or `gallery_preview` response sections.
- Adding remote image fallbacks, a CDN, an image service, a framework, or a paid dependency.
- Changing the existing external-video policy in Gallery. This milestone governs production images; existing video URL validation remains separate.
- Refactoring unrelated page, state, API, storage, or content-controller logic.

## 3. Current-state findings

### Repository and baseline

- The inspected worktree is `J:/wt/takhun-connect-media` on `feature/connect-production-media`, tracking `origin/main`.
- The initial `git status --short --branch` contained only the branch header, so the worktree was clean before this document was created.
- `npm.cmd test` passed the complete baseline suite, including media, public page, API, Apps Script, content-safety, and i18n checks.
- Recent media work is in `ca0d470` (`feat: add media asset pipeline`), followed by `413d64b` (generated production images), `6325eab` (deterministic Home event date test), and `fcf741b` (populated manifest contract test).

### Existing connection is partial, not absent

All required public pages already load `public/js/media.js` before their controller, and all inspected controllers call `TakhunMedia.renderImage`. The remaining work is to make that integration complete and consistent:

- `renderImage` builds local `srcset`, but it has no `fetchpriority` option and does not set intrinsic `width`/`height`.
- Controllers usually pass generic translated alt text, which overrides the more specific `alt_th`/`alt_en` stored in the manifest.
- Hero/detail images are eager, but none receives `fetchpriority="high"`.
- Page-specific `sizes` values exist but are not consistently aligned with actual grid/container behavior.
- The runtime initially renders a role-based local SVG placeholder and asynchronously upgrades it after the manifest loads. A missing manifest item safely remains a local placeholder.
- The manifest-provided `fallback` field is not currently used by the runtime; fallback selection is derived from the requested role.
- Page controllers each create a semantic fallback panel, but repeated `role="img"` and generic labels can duplicate adjacent card text.
- Gallery cards use local manifest media, but the lightbox state still requires a safe remote `image_url`/`media_url` before it allows an image to open. A valid local `media_id` with an empty URL is therefore incorrectly treated as invalid.
- Place detail derives hypothetical gallery IDs from the length of `gallery_image_urls`; the repository contains no approved place-gallery manifest items and canonical content currently has empty gallery arrays.
- About ignores its API `hero_image_url` when rendering and already requests `shared-about-project`; its media wrapper is `aria-hidden="true"`, so the image is decorative despite the controller passing non-empty alt text.
- Home still validates and maps legacy URL fields, but its actual renderers use entity IDs and `TakhunMedia`; those URL values are not image sources.

### Approved coverage versus public content

The public manifest has exactly 18 items:

| Type | Approved coverage | Public content inventory | Gap behavior |
| --- | --- | --- | --- |
| Home | `home-hero-ratchaprapha`, `home-hero-heart-mountain` | One current rendered hero slot | Use the fixed approved Ratchaprapha ID; the second asset remains approved but unused by this milestone. |
| Place | `BTK-001` through `BTK-005`, `KRN-002`, `PNM-001` | 10 published places | `KRN-001`, `KRN-003`, and `PNM-002` use the local cover fallback. |
| Route | `ROUTE-BTK-CORE`, `ROUTE-BTK-HEART`, `ROUTE-KRN-NATURE` | 4 published routes | `ROUTE-PNM-NATURE` uses the local cover fallback. |
| Product | `PROD-BTK-DURIAN`, `PROD-BTK-HONEY`, `PROD-BTK-TEXTILE` | 7 published products | Herbal, rambutan, mangosteen, and khao-lam records use the local product fallback. |
| Event | `EVENT-HEART-OF-HILLS-2026` | 1 published event | Fully covered by ID. It is dated 2026-07-18, so it is no longer an upcoming mock Home event on 2026-08-07. |
| Gallery | `GALLERY-DAM-LAKE-001` | Canonical mock gallery is intentionally empty | The page can render the asset only when the public gallery response supplies a matching record. |
| Shared | `shared-about-project` for `ABOUT` | One About hero | Fully covered by the fixed shared ID. |

The current production Google Sheet contents are not present in the repository. Therefore the repository proves Gallery compatibility by ID but does not prove that `GALLERY-DAM-LAKE-001` is present in the live Gallery sheet.

## 4. Existing media architecture and exact helper interfaces

### Build-time pipeline

- Private inputs: `media/media-spec.json` describes media; ignored originals live under `media-source/<type>/`.
- Validation/build: `scripts/media-check.js` and `scripts/media-build.js` use `scripts/media-lib.js`.
- `validateSpec(spec, options = {})` checks IDs, source paths, profiles, ratios, dimensions, bilingual alt text, and source safety.
- `buildMedia({ spec, sourceRoot, outputRoot, manifestPath, publicPathPrefix })` creates deterministic stripped WebP outputs and atomically replaces the generated tree and public manifest.
- Public outputs: `public/assets/media/generated/**` and `public/assets/media/manifest/media-manifest.json` are tracked. Public manifest items contain `media_id`, `entity_type`, `entity_id`, `role`, `ratio`, `required`, `alt_th`, `alt_en`, `fallback`, and sorted `outputs` with `width`, `height`, `path`, `bytes`, and `sha256`. They contain no source filenames.

The exact output profiles are:

| Profile | Ratio | Widths |
| --- | --- | --- |
| `hero` | 16:9 | 640, 960, 1440, 1920 |
| `cover` | 3:2 | 480, 800, 1200, 1600 |
| `card` | 16:9 | 480, 800, 1200 |
| `product` | 1:1 | 400, 800, 1200 |
| `gallery` | 3:2 | 640, 1200, 1800 |

### Current browser runtime

`window.TakhunMedia` is frozen and exposes:

- `mediaIdFor(type, id) -> string`: lowercases/normalizes a stable entity ID and derives `place-<id>-cover`, `route-<id>-cover`, `product-<id>-cover`, or `event-<id>-cover`; Gallery and Shared IDs pass through lowercased; Home accepts a full `home-*` ID or prefixes `home-`.
- `placeholderPath(role) -> string`: returns a local SVG under `assets/media/placeholders/`; `card`, place, route, and event resolve to `cover.svg`.
- `isLocalGeneratedPath(value) -> boolean`: accepts only `assets/media/generated/.../*.webp` paths composed of safe characters.
- `normalizeManifest(value) -> { version, items }`: keeps valid media IDs, removes unsafe output paths, sorts outputs by numeric width, and freezes the top-level result.
- `loadManifest(fetcher = window.fetch) -> Promise<manifest>`: fetches `assets/media/manifest/media-manifest.json` with same-origin credentials, caches the promise, and fails closed to the current empty manifest.
- `pictureModel(mediaId, lang = "th") -> null | { alt, src, srcset, outputs }`: selects `alt_en` only for effective English, otherwise `alt_th`; uses the largest output as `src` and all outputs as a width-descriptor `srcset`.
- `renderImage(mount, options = {}) -> Node | null`: immediately inserts a local placeholder, loads the manifest, then replaces only its own prior runtime node with a `<picture><img></picture>`. Current options used by pages are `mediaId`, `type`, `role`, `className`, `alt`, `loading`, `sizes`, `lang`, and `fallbackFactory`.

The generation marker on each mount prevents a stale asynchronous render from replacing a newer language/page render. Replacement of only `[data-media-runtime]` preserves badges, favorites, and overlays appended to the media container.

## 5. Approaches considered

### A. Evolve the shared runtime and keep thin page adapters — recommended

Retain deterministic frontend ID mapping and enhance `TakhunMedia.renderImage` to own intrinsic dimensions, local path enforcement, language-specific manifest alt, decorative semantics, and loading priority. Controllers continue to decide which entity and visual context they are rendering, but do not implement image URL or responsive-source logic.

This is the smallest maintainable change because every target page already uses the runtime. It fixes behavior once, preserves API contracts, and extends existing tests instead of creating a parallel architecture.

### B. Add page-specific media implementations

Each controller could directly fetch the manifest and construct its own `<picture>`, alt, `sizes`, and fallback behavior. This would minimize changes to `media.js`, but it would duplicate asynchronous state, sanitization, and accessibility rules across at least eight controllers. It conflicts with the existing architecture and is rejected.

### C. Put generated URLs or media IDs into Apps Script/Sheets responses

The API could return local WebP URLs, `srcset`, or new media fields. This would make controllers consume data-provided media, but it would couple deploy-specific frontend assets to Sheets/Apps Script, retain legacy URL risk, and require contract/admin changes. Stable entity IDs already make this unnecessary, so it is rejected.

## 6. Media/entity mapping strategy

The frontend remains the mapping boundary:

| Surface | Input identifier | Media ID rule |
| --- | --- | --- |
| Place list/detail/nearby/route stop | `place_id` | `mediaIdFor("place", place_id)` |
| Route list/detail/Home route | `route_id` | `mediaIdFor("route", route_id)` |
| Product list/detail | `product_id` | `mediaIdFor("product", product_id)` |
| Event list/detail/Home event | `event_id` | `mediaIdFor("event", event_id)` |
| Gallery card/lightbox | API `media_id` | `mediaIdFor("gallery", media_id)` |
| Home primary hero | fixed presentation slot | `home-hero-ratchaprapha` |
| About hero | fixed presentation slot | `shared-about-project` |

No API image URL participates in production image selection or fallback. Unknown IDs are allowed to reach the runtime because its safe result is the role-specific local placeholder; pages must not maintain separate coverage allowlists. This makes manifest coverage the single source of truth.

The unused Home heart-mountain hero is not rotated or selected in this milestone because the existing page has one deterministic hero and the repository contains no approved carousel/rotation behavior.

## 7. Shared runtime design

Enhance the existing `renderImage` interface without adding a second renderer:

- Preserve all current options for compatibility.
- Add `fetchPriority: "high" | "low" | "auto"` and set the DOM `fetchPriority` property/attribute only when supplied.
- Add `decorative: boolean`. Decorative images always receive `alt=""`; semantic fallback nodes must also be hidden from assistive technology.
- Add `fallbackAlt: string` for an uncovered local placeholder when the visual is informative. `alt` remains an explicit exceptional override, but ordinary approved images omit it so `pictureModel` supplies manifest alt text.
- Extend `pictureModel` with the largest output's `width`, `height`, and the manifest `fallback` path. `renderImage` sets intrinsic dimensions from those values and continues to use CSS for the displayed crop/size.
- Use a manifest item's validated local fallback path when available; otherwise retain `placeholderPath(role)`. The runtime must accept only `assets/media/placeholders/<approved-name>.svg` for this field.
- Continue to reject all non-generated output paths, fetch the manifest same-origin, use DOM creation and attribute assignment, and never introduce `innerHTML`.
- Keep the per-mount generation guard and replacement behavior.

The placeholder-first behavior remains because it provides a safe render before or after manifest failure. The implementation plan should not add a remote URL branch.

## 8. Page-by-page integration design

### Home

- Hero: keep fixed `home-hero-ratchaprapha`; use manifest alt, `loading="eager"`, `fetchpriority="high"`, and `sizes="100vw"`. It is the only high-priority image on `index.html`.
- Featured place and route cards: derive IDs from entity IDs, render lazily, use grid-accurate `sizes`, and treat thumbnails as decorative because the same card already exposes the entity name and action.
- Upcoming event cards: use the event ID and the same lazy decorative-card policy when the API returns upcoming/current events. Preserve the current empty section when none qualify.
- Do not add featured products or gallery preview UI.

### Places listing

- Derive each cover from `place_id`; render lazily with 1/2/3-column `sizes` matching the current responsive grid.
- Keep favorite controls and badges as siblings; runtime replacement must not remove them.
- Covered and uncovered records remain in the same list and layout.

### Place detail

- Hero cover: derive from `place_id`, use manifest alt, eager loading, high priority, and `100vw`. It is the page's only high-priority image.
- Nearby cards: lazy, decorative, and derived from each nearby `place_id`.
- Place gallery: do not use remote values as sources. With the current manifest there are no approved `place-<id>-gallery-<nn>` entries, so canonical empty arrays keep the section hidden. If the API returns gallery URL strings for a place, the implementation must not display those remote URLs or infer that an unapproved local item exists merely from array length. Supporting place-gallery items requires a future approved manifest expansion.
- Lightbox behavior remains available for future approved place-gallery IDs but is not populated by this milestone.

### Routes listing and detail

- Listing covers derive from `route_id`, use the 16:9 card profile, and load lazily. Featured cards get a larger `sizes` value than standard cards.
- Detail cover: derive from `route_id`; use manifest alt, eager loading, high priority, and `100vw`.
- Route-stop covers derive from each stop's `place_id`, load lazily, and use a fixed/container-aware size near the current 20rem media column.
- The CSS decorative pseudo-landscape remains only as the fallback background and must sit behind real images.

### Products listing and detail

- Derive media from `product_id` and the approved 1:1 product profile.
- Listing images are lazy and decorative; align their visible container to 1:1 so approved products are not unnecessarily cropped to the current 4:3 card window.
- Detail media uses manifest alt, eager loading, high priority, and a responsive size matching the split layout rather than unconditional `100vw` on desktop.
- Uncovered products use `product.svg` without consulting `image_url`.

### Events listing and detail

- Derive media from `event_id` and the approved 3:2 cover profile.
- Listing images are lazy and decorative; align the visible card ratio to 3:2 rather than the current 16:10 approximation.
- Detail media uses manifest alt, eager loading, high priority, and split-layout-aware `sizes`.
- The current event date/state filtering remains unchanged.

### Gallery

- Cards continue to use the response `media_id`, local manifest media, lazy loading, and the manifest's bilingual alt when the image is informative.
- Change image lightbox state resolution so a syntactically valid image `media_id` selects local-image mode without requiring `image_url` or `media_url`. The runtime decides whether the ID is covered and falls back safely if it is not.
- Lightbox images are eager only after user activation, remain normal priority, and use viewport-aware `sizes`.
- Align cards to the approved 3:2 gallery ratio. Lightbox media remains `object-fit: contain`.
- Video records keep the existing validated video/external-link path; no remote image thumbnail may be used as an image fallback.
- The repository mock remains empty. The approved gallery asset becomes visible only if the live API returns a published image record with matching `media_id`; no Sheet seed is part of this change.

### About

- Always render `shared-about-project`; do not consult `hero_image_url` for the production image.
- The wrapper is intentionally `aria-hidden`, so render this background image with `decorative: true`, `alt=""`, eager loading, high priority, and `100vw`.
- Simplify the current static hidden `<img>`/runtime overlap so the runtime owns one media node and the existing local art fallback remains available.

### Listing-page header art

Routes, Products, Events, and Gallery listing headers currently use CSS artwork and have no corresponding approved manifest item. Do not repurpose entity images as page heroes. Leave those decorative headers unchanged.

## 9. Responsive image strategy

- Always emit the manifest's sorted width-descriptor `srcset`; use the largest local output as `src` for no-`srcset` fallback.
- Set intrinsic `width` and `height` from the largest output to provide an aspect-ratio hint and reduce layout shift.
- Keep CSS `object-fit: cover` for cards/heroes and `contain` for enlarged Gallery media.
- Align card containers with the pipeline profiles: place/event/gallery 3:2, route 16:9, product 1:1. Hero assets remain 16:9 but may crop responsively inside their existing tall presentation regions.
- Use mobile-first `sizes` declarations based on actual columns: full width by default, approximately half width at two-column breakpoints, and approximately one-third width at three-column breakpoints. Featured route cards and split detail layouts receive their actual larger fractions.
- Do not add browser format branches because the approved outputs are WebP only and placeholders are SVG.

Exact `sizes` strings are controller contracts and must be asserted in focused tests; CSS breakpoints and the strings must be changed together if visual QA requires adjustment.

## 10. Hero/LCP loading strategy

Each document may have at most one high-priority image:

- Home hero, Place detail hero, Route detail hero, Product detail primary media, Event detail primary media, and About hero: `loading="eager"` plus `fetchpriority="high"`.
- Listing cards, Home cards, nearby places, and route stops: `loading="lazy"` with default/auto fetch priority.
- Gallery lightbox: eager after an explicit user action but not high priority.

The runtime must apply the same attributes to the initial placeholder and the upgraded image where relevant, so replacing the node does not accidentally change loading semantics. No second image on a page receives high priority.

## 11. Localization and alt-text strategy

- Approved informative images use `manifest.alt_en` only when the effective language is exactly `en`; otherwise they use `manifest.alt_th`, with Thai as the fallback.
- Page controllers must stop overriding approved alt with generic strings such as “image of {name}”. Generic localized text is retained only as `fallbackAlt` for an uncovered informative placeholder.
- Detail primary images, Home hero, Gallery card/lightbox images, and any future non-redundant content image are informative.
- Card thumbnails whose entity name and action are already present in the same card are decorative and use `alt=""` to avoid repetitive announcements.
- About hero is decorative because its existing wrapper is hidden from the accessibility tree.
- Language-change rerenders continue to use the per-mount generation guard so a slower prior-language manifest promise cannot overwrite the current language.

## 12. Missing-media and fallback behavior

1. Render the approved local role placeholder immediately.
2. Load and normalize the same-origin manifest.
3. If a matching item has valid local outputs, replace only the runtime node with the responsive picture.
4. If the manifest is unavailable, the ID is unknown, outputs are invalid, or the generated image fails, keep or restore a local placeholder/fallback node.
5. If the local placeholder itself fails, use the controller's existing DOM fallback panel or remove only the broken media node. Never remove the surrounding card/page content.

Missing coverage is expected and is not a page error. Gallery's existing `media-load-error` state remains appropriate only when an activated media item cannot be presented, not merely because an entity elsewhere lacks approved media.

## 13. Security constraints

- Public image `src`/`srcset` values may come only from paths matching the existing generated-WebP allowlist or the tightened local-placeholder allowlist.
- Never read, fetch, interpolate, log, or expose `source_file` or `media-source` in browser code or the public manifest.
- Ignore API `cover_image_url`, `image_url`, `thumbnail_url`, and `hero_image_url` for production-image rendering. Retaining fields for existing response validation does not authorize their use as sources.
- Preserve same-origin manifest fetch credentials, DOM-only node construction, encoded navigation IDs, and all existing safe-link validation.
- Do not introduce `innerHTML`, unsafe URL assignment, remote fallback, data URL images, blob images, or user-controlled manifest paths.
- Continue validating Gallery video URLs separately and preserve `noopener noreferrer` on external links.

## 14. Accessibility considerations

- One meaningful, localized alt per informative image; empty alt for redundant/decorative imagery.
- Decorative DOM fallback artwork must be `aria-hidden="true"`; informative text fallback uses a localized accessible label.
- Preserve accessible names on image links, favorite buttons, Gallery controls, and lightbox navigation independently of image alt.
- Intrinsic dimensions and stable aspect-ratio containers reduce layout shifts that can disrupt keyboard and magnification users.
- Preserve Gallery focus transfer/restoration, Escape and arrow-key behavior, dialog semantics, and reduced-motion styles.
- Verify text/overlay contrast on every real hero at mobile and desktop sizes; approved images may expose contrast problems that CSS gradients previously hid.

## 15. Files expected to change in later implementation

- `public/js/media.js` — extend the one shared runtime and model.
- `public/js/home.js`
- `public/js/places.js`
- `public/js/place-detail.js`
- `public/js/routes.js`
- `public/js/products.js`
- `public/js/events.js`
- `public/js/gallery.js`
- `public/js/about.js`
- `public/about.html` — remove the redundant static image node while retaining the runtime mount and local decorative fallback.
- `public/css/components.css` — align media containers to approved ratios and preserve overlay stacking.
- `scripts/test-media.js` — shared runtime, security, dimensions, priority, fallback, and alt contracts.
- `scripts/test-home.js`, `scripts/test-place-detail.js`, `scripts/test-routes.js`, `scripts/test-products.js`, `scripts/test-events.js`, `scripts/test-gallery.js`, and `scripts/test-about.js` — focused page behavior and accessibility contracts where the controller behavior changes.

No new production helper file is expected.

## 16. Files explicitly out of scope

- `apps-script/**`
- `media/media-spec.json`
- `media-source/**`
- `public/assets/media/generated/**`
- `public/assets/media/manifest/media-manifest.json`
- `public/assets/media/placeholders/**`
- `public/admin/**`
- `public/js/api.js`
- `public/js/content-data.js`
- `public/js/place-data.js`
- `docs/API_SPEC.md`, `docs/DATA_SCHEMA.md`, and admin/CMS specifications
- Deployment, Cloudflare, package dependency, and lock files

## 17. Testing strategy

### Shared runtime tests

- Exact entity-to-media-ID mapping for all supported types and normalization cases.
- Reject remote, absolute, traversal, source, non-WebP, malformed-width, and malformed-fallback paths.
- Manifest language selection, Thai fallback, sorted `srcset`, largest `src`, intrinsic dimensions, and defensive behavior for empty outputs.
- `renderImage` behavior for informative versus decorative alt, `fallbackAlt`, eager/lazy loading, `fetchpriority`, `sizes`, image errors, manifest errors, stale generations, disconnected mounts, and preservation of sibling overlays/controls.
- Assert that no runtime or controller contains `media-source` or uses API image URL fields as an image source.

### Page tests

- Home: fixed hero ID, exactly one high-priority image, lazy entity cards, language rerender, and unchanged section/state behavior.
- Places: covered/uncovered IDs, lazy responsive list cards, and favorite overlay preservation.
- Place detail: eager/high primary cover, lazy nearby cards, no remote place gallery rendering, and safe hidden gallery with current data.
- Routes: route mapping, distinct featured/standard sizes, eager/high detail media, lazy stop media, and overlay preservation.
- Products and Events: correct mapping, profile-aligned card ratios, lazy cards, eager/high detail image, and local fallback for uncovered IDs.
- Gallery: an image record with valid `media_id` and empty URL opens local-image mode; unsafe/unknown records fail safely; cards/lightbox use manifest alt; videos retain existing validation.
- About: fixed shared ID, decorative empty alt, eager/high priority, one runtime-owned image node, and local art fallback.

### Regression commands

- `npm.cmd test`
- `npm.cmd run build`

`npm.cmd run media:check` and `npm.cmd run media:build` are not implementation acceptance commands for this milestone because private ignored source originals are outside the change and generated assets must not be rewritten.

## 18. Manual QA matrix

Use current Chrome plus one second modern browser where practical. Test with network cache disabled once to observe placeholder-to-picture upgrade, then with cache enabled.

| Viewport/language | Pages and checks |
| --- | --- |
| Mobile, Thai | Home hero and cards; all list/detail pages; Gallery dialog; About hero. Check correct crop, no horizontal overflow, one high-priority primary image per applicable page, Thai informative alt, touch targets, and local fallbacks for uncovered entities. |
| Mobile, English | Repeat key covered and uncovered records; verify English manifest alt, Thai fallback only when English is absent, language switching without duplicate images, and unchanged filter/state labels. |
| Desktop, Thai | Check multi-column `srcset` candidate behavior, featured route sizing, split product/event detail layouts, hero overlays/contrast, route-stop media, Gallery 3-column grid and contained lightbox. |
| Desktop, English | Repeat responsive and accessibility checks; keyboard through cards, favorite buttons, Gallery open/close/previous/next, and verify focus restoration and non-repetitive announcements. |

Cross-cutting checks for every matrix row:

- Covered IDs request only `assets/media/generated/**/*.webp` and the local manifest.
- Uncovered IDs request only local SVG placeholders and do not break cards or details.
- No request is made to an API image URL or any internet-hosted image.
- Slow/failed manifest and failed WebP requests preserve usable page content.
- There is no layout jump caused by the image upgrade beyond the established container crop.

## 19. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Existing controllers override manifest alt with generic text. | Separate approved-image alt from `fallbackAlt`; make manifest alt the normal semantic source. |
| Asynchronous language renders race. | Preserve the existing per-mount generation token and add a language-switch regression test. |
| Placeholder replacement removes badges or controls. | Continue replacing only `[data-media-runtime]`; test sibling preservation. |
| Partial manifest coverage is mistaken for an error. | Treat unknown IDs as expected local-placeholder cases and test known uncovered entities. |
| Gallery image records have empty URL fields. | Resolve image mode from valid `media_type` plus `media_id`, not a remote URL. |
| Live Gallery lacks the approved matching record. | Keep frontend behavior compatible and document the operational data gap; do not seed Sheets in this milestone. |
| Real images reduce text contrast or crop important content. | Preserve overlays, align card ratios to profiles, use existing focal-cropped outputs, and run the full visual matrix. |
| High priority is applied too broadly. | Permit it through the shared option but assert at most one high-priority image per document. |
| Runtime accepts malformed manifest dimensions/fallbacks. | Tighten normalization and add adversarial path/dimension tests before relying on those fields. |

## 20. Acceptance criteria

- All covered target-page entities resolve through `TakhunMedia` to tracked local WebP outputs; no page creates its own manifest fetch or picture builder.
- Entity mapping uses existing IDs and requires no Apps Script, API, Sheet, admin, or CMS change.
- No public production image uses `cover_image_url`, `image_url`, `thumbnail_url`, `hero_image_url`, a remote fallback, or a private source path.
- Responsive `srcset`, accurate `sizes`, and intrinsic dimensions are present for approved images.
- Each applicable page has no more than one eager high-priority primary image; non-critical images are lazy.
- Informative images use the correct manifest language; decorative/redundant images have empty alt; fallbacks remain accessible where informative.
- Unknown IDs, manifest failure, generated-image failure, and placeholder failure do not break surrounding page rendering.
- Gallery local images open from `media_id` even when image URL fields are empty.
- Approved media profiles and visible card ratios are aligned, with no broken overlays, controls, or mobile layout.
- Source originals stay ignored/private; generated assets and manifest are unchanged.
- `npm.cmd test` and `npm.cmd run build` pass after implementation.

## 21. Proposed task decomposition for the later implementation plan

1. Add failing shared-runtime tests for strict normalization, intrinsic dimensions, manifest fallback, semantic/decorative alt, priority, and stale-render behavior.
2. Extend `public/js/media.js` to satisfy those contracts without changing existing ID rules or path boundaries.
3. Update Home and its tests for manifest-owned alt, card decoration, responsive sizes, and the single LCP priority.
4. Update Places and Place Detail, including the explicit prohibition on URL-count-driven unapproved gallery rendering.
5. Update Routes list/detail and route stops with profile-aware sizing and priority.
6. Update Products and Events list/detail plus targeted ratio styles.
7. Fix Gallery local-image lightbox resolution and add empty-URL/valid-ID regression coverage.
8. Simplify About media ownership and apply decorative/LCP semantics.
9. Add/update static page and CSS contracts, then run the complete automated suite and manual TH/EN mobile/desktop matrix.

## 22. Pre-planning issue to resolve

Frontend implementation is not blocked. One operational ambiguity must be kept explicit: the repository cannot confirm whether the live Gallery sheet has a published image record whose `media_id` is `GALLERY-DAM-LAKE-001`. If it does not, the approved gallery asset will remain absent from the live Gallery even after the frontend lightbox fix. Creating or editing that Sheet record is out of scope and should be handled as a separately authorized content operation, not folded into the implementation plan.
