# Admin Dashboard Bounded Design

**Status:** Approved implementation scope supplied on 2026-10-12. This document is the exact contract checked against the repository at base `57d602cbc3b9e670d19a204a9142dd168d4a3c99`.

## Outcome and boundaries

Build the authenticated Admin Dashboard summary slice on the existing protected `public/admin/dashboard.html`. The slice consists only of six fresh counts and capability-aware links to the six existing CMS pages. It adds no mutation, cache, audit, schema, property, configuration, dependency, Settings, or Map behavior.

The older planning sections in `docs/ADMIN_CMS_SPEC.md` and `docs/ROUTES_AND_PAGES.md` also name recent pending reviews, upcoming events, and recently edited Places. Those sections remain future direction. This bounded slice explicitly defers them, along with charts, trends, activity feeds, time-series data, and new create workflows.

## Server contract

The only new routed action is the literal POST action `adminGetDashboard`. `Router.gs` dispatches it only by exact equality and passes `body.token` only:

```json
{
  "action": "adminGetDashboard",
  "token": "<session token>"
}
```

`payload`, query-string authority, headers, and alternate action aliases are not accepted or consulted. `adminGetDashboard_(token)` calls `AuthService_requireAdmin_(token)` before any Sheet read. Every authenticated role already recognized by Auth (`super_admin`, `editor`, `reviewer`, `viewer`) may read. Authentication remains server-authoritative; the client role affects only quick-link presentation.

Success uses the repository envelope and this exact data projection:

```json
{
  "ok": true,
  "data": {
    "total_places": 0,
    "total_routes": 0,
    "total_products": 0,
    "total_events": 0,
    "pending_reviews": 0,
    "total_gallery": 0,
    "warnings": []
  },
  "message": "success"
}
```

Every count is a non-negative safe integer. `warnings` is in the fixed domain order `places`, `routes`, `products`, `events`, `reviews`, `gallery` and contains only:

```json
{
  "domain": "reviews",
  "code": "SKIPPED_INVALID_OR_DUPLICATE_ROWS",
  "skipped_count": 2
}
```

No warning exposes IDs, cells, row numbers, statuses, source values, stack traces, or sheet metadata. A missing/malformed required table or authentication failure fails the entire request through the normal safe error envelope; no partial count response is returned.

## Fresh count and row-classification rules

The service performs exactly six fresh `SheetService_readTable_` reads per successful request, one each for `places`, `routes`, `products`, `events`, `reviews`, and `gallery`. It never reads or writes cache state. It never calls a Sheet write helper, `SpreadsheetApp.flush`, a lock, an audit helper, Properties Service, or a mutation service.

For every domain, duplicate means two or more rows with the same syntactically valid domain ID. All rows carrying that duplicate ID are skipped, so row order cannot decide the count. Blank/malformed IDs are skipped. Countability is intentionally limited to identity and lifecycle fields for Places, Routes, Products, Events, and Gallery; malformed unrelated content does not make an otherwise unambiguous entity disappear from a summary count.

| Response key / Thai UI label | Table and identity | Included lifecycle | Invalid handling |
|---|---|---|---|
| `total_places` / `สถานที่ทั้งหมด` | `places.place_id` | `draft`, `published`, `archived` | Skip malformed/duplicate IDs or status outside the actual Place enum. Places have no `deleted` state. `place_drafts` is never read or counted. |
| `total_routes` / `เส้นทางทั้งหมด` | `routes.route_id` | `draft`, `published`, `hidden`, `archived`; exclude `deleted` | Skip malformed/duplicate IDs or unknown status. `route_places` is never read or counted. |
| `total_products` / `สินค้าและบริการ` | `products.product_id` | `draft`, `published`, `hidden`, `archived`; exclude `deleted` | Skip malformed/duplicate IDs or unknown status. |
| `total_events` / `กิจกรรมทั้งหมด` | `events.event_id` | `draft`, `published`, `hidden`, `archived`; exclude `deleted` | Skip malformed/duplicate IDs or unknown status. Event date is irrelevant to the Admin total. |
| `pending_reviews` / `รีวิวรอตรวจสอบ` | `reviews.review_id` | exactly `pending` | Use the existing full stored Review validator. Count only a unique valid Review row whose complete stored projection is valid and status is `pending`. Skip every row for a duplicate valid ID and every row failing full Review validation. |
| `total_gallery` / `ภาพและวิดีโอ` | `gallery.media_id` | `draft`, `published`, `hidden`, `archived`; exclude `deleted` | Skip malformed/duplicate IDs or unknown status. Both images and videos count. |

The common content/route/gallery ID grammar follows their actual service grammar: `^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$`. Place IDs follow the stricter actual Place service bound: the same grammar with a maximum total length of 64. Review validity reuses the existing Review stored-row rules and therefore remains unambiguous.

## Browser facade contract

`TakhunAdminApi.getDashboard(token)` is the only new exported facade. It sends exactly one body-only POST `{action:"adminGetDashboard", token}` with no `payload`, uses the existing timeout/error normalization, never retries, and accepts only the exact success keys above.

The strict validator rejects unknown/missing keys, negative/fractional/unsafe counts, unknown/duplicate/out-of-order warning domains, unknown warning codes, zero/negative warning counts, and any extra warning fields. It returns a safe `MALFORMED_RESPONSE` without exposing response text.

## UI and capabilities

`admin-dashboard.js` owns Dashboard state after `TakhunAdminShell.init()` returns `authenticated`. It then reads the canonical session token through `TakhunAdminAuth.readSession()` and calls `getDashboard` once. Retry is explicit and single-flight. While loading, cards expose a non-numeric placeholder and the status region announces loading. Success renders all six counts with `textContent`; all-zero success is a valid empty state with Thai copy, not an error. Safe aggregate warnings produce one Thai advisory that some invalid/duplicate rows were excluded. Failure preserves no stale counts, shows safe Thai copy, and reveals a 44px retry control.

Quick links always point to the existing same-directory pages only: `places.html`, `routes.html`, `products.html`, `events.html`, `reviews.html`, and `gallery.html`. Every authenticated role can reach all six read-capable pages. Labels are capability-aware:

- `super_admin` and `editor`: `จัดการ…` for all six destinations.
- `reviewer`: `ดู…` for Places, Routes, Products, Events, and Gallery; `ตรวจรีวิว` for Reviews.
- `viewer`: `ดู…` for all six destinations.

No quick link invents a query parameter or opens a create flow. Link text and count output are static-label/validated-number only and are created without `innerHTML`, remote media, URL data, or raw server messages.

The page uses semantic headings, a labelled summary list, a polite atomic status region, and a retry button. Existing shell keyboard and focus behavior remains authoritative. New links and retry have visible focus and at least 44×44 CSS-pixel targets. The summary and links reflow without horizontal page overflow at desktop, 390px, and 360px viewports; long text wraps safely; reduced motion remains respected.

## Verification contract

Tests must prove authentication precedes reads; all roles read; exact counts/status rules; full pending-Review validation; deterministic duplicate/invalid skips and warnings; failure without partial data; exactly six reads; and armed failures for every entity/cache/audit/property/lock/write sink. API tests prove exact request/response and one-fetch/no-retry behavior. UI tests cover role labels, loading, all-zero empty, warning, error, explicit retry, stale-result suppression, safe DOM, focus, 44px targets, and narrow reflow.

Native Windows browser verification uses the repository real-shell/CDP tooling with mocked Auth/API boundaries at desktop and actual 390px/360px viewports. Full validation ends with `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.
