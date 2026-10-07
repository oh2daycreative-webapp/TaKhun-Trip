# M8 PR1 Phase B — non-production manual QA

Run only after an operator authorizes a non-production deployment and disposable test data. This checklist is prepared, not a record of remote testing. Phase A remains authoritative; no migration is part of Phase B.

## Setup
- Use separate viewer, reviewer, editor and super_admin sessions. Use two editor tabs for concurrency cases. Keep browser network tools open to count mutation requests.
- Seed at least 21 Products and Events, all five statuses, a draft Place and a published Place. Include long Thai/English names and featured/non-featured records. Verify destinations satisfy Phase A formats before writes.

## Lists (repeat for Products and Events)
- Sign in, open the page, observe loading then current-page records. Search Thai/English name or ID; combine status and category/type filters. Clear filters and reload.
- Move forward/back across pages; verify 20-row pagination and server source order. Test no matches and a page emptied by another editor; use Return to first page.
- Confirm featured labels; Event date and optional times are displayed without timezone conversion. Details are fetched only for current-page IDs. Block one detail read: show unavailable summary while other cards remain usable.
- Fail the list request and retry explicitly. Verify raw server text never appears.

## Product editor
- Create with Thai name/description/category, then reload and compare every optional field. Verify server draft status and generated identity.
- Exercise Boolean checkbox false/true, district/category enums, paired coordinates including 0 and 1e-7, sort order empty/0/integer, price display text and pipe-separated tags.
- Reject missing required fields, half coordinates, out-of-range/nonfinite numbers, fractional/negative sort order, duplicate tags, formula prefixes, malformed/unsafe URLs, userinfo, invalid IPv4 and numeric terminal domains.
- Search related Places and page results; choose draft/published or clear relation. Draft Place is allowed for draft content but publishing must reject it. Confirm existing references are retained until deliberately changed.

## Event editor
- Create/edit Thai title/location/description, event type, date, contact details, register/image/map URLs, coordinates, featured and related Place.
- Accept 2000-02-29 and 2400-02-29; reject 1900-02-29, 2100-02-29, invalid days/months and year 0000. Stored text must not shift under different browser timezones.
- Accept no times and start-only; accept later same-day end. Reject end-only, equal times, earlier end and 24:00. No invented multi-day fields.

## Lifecycle (repeat for both domains)
| From | Confirm permitted targets |
|---|---|
| draft | published, archived, deleted |
| published | hidden, archived, deleted |
| hidden | draft, published, archived, deleted |
| archived | draft, deleted |
| deleted | draft |

- Only these actions appear for writers; no same-state assignment. Cancel each native confirmation and verify zero writes.
- Archive/delete retain content. Restore is status-only draft. Archived/deleted fields cannot be edited. Dirty forms require Save or deliberate Reload before lifecycle actions.
- Verify returned revision/state drives subsequent actions; delete calls soft-delete endpoint only. Editing published content immediately affects public output.

## Safety and roles
- Viewer/reviewer can list/detail only; no create/save/lifecycle/Place-search controls. Editor/super_admin can write. Expire/revoke a session and confirm server refusal and safe feedback.
- Rapid double-click Save/lifecycle: exactly one POST. While pending, controls are disabled and navigation warns.
- Two tabs load a record; A saves, B saves: B gets conflict, keeps entered values, blocks writes, and offers deliberate Reload. A failed Reload must preserve B's edits and remain blocked.
- Lose create response after server writes: no retry, uncertain message, Save blocked. Reload the page while create is pending: session marker must still prevent Add. Search/open the created record and confirm it is the earlier result. If no record exists, explicitly acknowledge list reconciliation before another create.
- Deny sessionStorage: creation must not dispatch without its pending marker. Do not use another tab/device as a retry mechanism; there is no backend exactly-once ledger.
- Lose update/lifecycle response: no retry or stale-revision continuation; Reload authoritative detail before continuing. Preserve unsaved values until reload is confirmed.
- Return `audit_status:unconfirmed`: treat data as saved, display warning, retain identity/state/revision and do not retry.
- Exercise malformed response, HTTP failure, timeout and safe validation error. Indeterminate mutations block; definite validation rejection preserves values and allows correction.

## Mobile and accessibility
- At 320/375/768/1280px inspect lists, filters, all form fields, action rows and long unbroken titles. No page overflow; buttons wrap and remain reachable. Scroll to bottom of each editor.
- Keyboard-only: shell drawer, filter submit, record open, form order, checkbox/selects, Save and Reload. Focus is visible and editor heading receives focus on open; invalid field receives focus with associated error.
- Native confirmations: cancel/confirm using keyboard and touch, fit viewport, return to invoking control. Verify async status announcements with a screen reader.
- Confirm shell/logout/public link, existing Places editor and public Product/Event/Home/Search pages are unchanged.

## Local checks
`node scripts/test-admin-content-api.js`, `node scripts/test-admin-content-model.js`, `node scripts/test-admin-content-ui.js`, `cmd /c npm test`, `cmd /c npm run build`, JS syntax checks and `git diff --check`.

## Phase B.1 focused remediation QA
- In Product and Event related-Place search, press Enter: exactly one Place lookup occurs and no content write occurs. Then activate Save and verify exactly one content write.
- For optional number controls, verify an intentional blank remains allowed. Type an incomplete malformed value such as `e` and verify Thai field feedback, invalid-field focus, and zero writes. Then save valid Product sort order and Product/Event coordinate pairs and confirm numeric normalization.
- Seed one Product and Event whose `created_at`/`updated_at` use exact legacy `YYYY-MM-DD HH:mm:ss` text. Verify list/detail load without rewriting it. Malformed content dates must fail safely and session expiry must remain strict ISO.