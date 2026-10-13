# Admin Settings Design

## Intent and authority

This specification records the approved Admin Settings design, including the three amendments approved on 2026-10-13. It supersedes the historical Admin Settings examples in `docs/API_SPEC.md`, `docs/ADMIN_CMS_SPEC.md`, and the `maintenance_mode` row in `docs/DATA_SCHEMA.md` wherever they conflict.

The feature manages exactly the twelve keys already exposed by the public Settings API:

1. `site_name`
2. `site_slogan_th`
3. `site_slogan_en`
4. `default_language`
5. `main_email`
6. `main_phone`
7. `facebook_url`
8. `line_url`
9. `logo_url`
10. `hero_image_url`
11. `reviews_enabled`
12. `events_enabled`

All authenticated roles (`super_admin`, `editor`, `reviewer`, `viewer`) may read. Only `super_admin` may write. There is no password step-up. The feature excludes `maintenance_mode`, Featured IDs, infrastructure settings, secrets, new public consumers, new configuration, new dependencies, new sheet columns, and new Script Properties.

## Exact transport and projections

Both Admin actions are POST-only, use JSON in the request body, and compare the untrimmed action value to the literal action. Query actions, aliases, extra object keys, missing keys, and coercible values are rejected.

`adminGetSettings` accepts exactly:

```json
{"action":"adminGetSettings","token":"session-token"}
```

`updateSettings` accepts exactly:

```json
{
  "action":"updateSettings",
  "token":"session-token",
  "payload":{
    "expected_revision":"r1-<64 lowercase hex>",
    "settings":{
      "site_name":"Takhun Trip",
      "site_slogan_th":"เที่ยวบ้านตาขุน",
      "site_slogan_en":"Discover Ban Ta Khun",
      "default_language":"th",
      "main_email":"hello@example.com",
      "main_phone":"+66 77 123 456",
      "facebook_url":"https://facebook.com/example",
      "line_url":"https://line.me/ti/p/example",
      "logo_url":"",
      "hero_image_url":"",
      "reviews_enabled":true,
      "events_enabled":true
    }
  }
}
```

Both successful actions return:

```json
{
  "ok":true,
  "data":{
    "settings":{"...":"all twelve canonical fields in canonical order"},
    "revision":"r1-<64 lowercase hex>"
  },
  "message":"success"
}
```

`updateSettings` additionally returns `changed` and `audit_status`. A changed save returns `changed: true` and `audit_status: "recorded"` or `"unconfirmed"`. A no-op returns `changed: false`, `audit_status: "not_applicable"`, the same revision, and performs no write, timestamp change, cache mutation, or audit append.

Errors use the established `{ok:false,error:{code,message}}` envelope. Supported Settings codes are `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `SETTINGS_SCHEMA`, `CONFLICT`, `CONTENT_LOCK`, `OUTCOME_UNKNOWN`, and `SERVER_ERROR`. `OUTCOME_UNKNOWN` includes `retryable:false`. The browser accepts only these known safe codes and never exposes response bodies or credentials.

## Validation and spreadsheet-safe round trips

Request strings must be valid UTF-16, contain no NUL or disallowed control character, be NFC-normalized, and have no leading or trailing whitespace. `site_name` is 1–120 code points and at most 480 UTF-8 bytes. `site_slogan_th` is 1–300 points and at most 1,200 bytes. `site_slogan_en` is optional with the same maximum. `default_language` is exactly `th` or `en`.

`main_email` is optional and, when present, is at most 254 ASCII characters, contains one `@`, has a 1–64 character local part, valid dot-separated DNS labels, and no whitespace or controls. The value is retained as submitted rather than case-folded.

`main_phone` is optional. It may contain spaces, dots, hyphens, and balanced display parentheses. After removing those separators it must match a Thai local number (`0[2-7]\d{7}` or `0[689]\d{8}`) or an international Thai number (`+66[2-7]\d{7}` or `+66[689]\d{8}`). The international form does not retain the trunk `0`; `+66 77 123 456` and `+66 81 234 5678` are valid while `+66077123456` is not. The trimmed, NFC display form is retained.

The four URL fields are optional absolute HTTP(S) URLs of at most 2,048 characters with a valid hostname and port, without credentials, backslashes, quotes, controls, or whitespace. The two flags are JSON booleans; strings and numbers are rejected.

The storage boundary, not an apostrophe heuristic, establishes spreadsheet safety:

- New logical text values beginning with `=`, `+`, `-`, or `@` (and apostrophe followed by one of those characters) are rejected before storage. The international-phone validator is the sole narrow exception for a leading `+` and validates the complete Thai `+66` grammar before writing.
- Admin and public reads inspect both `getValues()` and `getFormulas()` for canonical value cells. A non-empty formula in a canonical value cell is invalid persisted state and fails the Admin read closed; the public reader omits that unsafe canonical value while preserving its existing successful sparse response contract.
- A stored string beginning with an apostrophe is treated as historical user data unless the same request-local write/read-back operation recorded that it wrote an escaped value. Readers never strip an apostrophe merely because the following character is formula-like.
- Read-back after a write compares the raw `getValue()`/table value and formula state against the exact value written. A later independent read cannot infer escape provenance and therefore returns a stored apostrophe literally. Historical literal apostrophe values remain readable and are not repaired automatically.

This narrow reader adjustment retains public behavior for ordinary historical strings, booleans, whitespace trimming, missing keys, duplicates-first-wins, and sparse success. Tests exercise simulated Apps Script coercion boundaries explicitly: string versus formula cells, apostrophe literals, boolean representations, `+66` display values, stored whitespace, and read-back mismatches. These are VM fakes of the documented Apps Script `getValues`/`getFormulas`/`setValue` boundary; no claim is made that they are real Google Sheets integration evidence, because this work must not call or modify a real spreadsheet.

## Canonical rows and revision

An Admin read requires exactly one row for each canonical key, valid stored logical values, valid non-formula value cells, and valid `updated_at` values. Missing, duplicate, or invalid canonical state yields `SETTINGS_SCHEMA`. Unknown and legacy rows never cause repair, creation, deletion, projection, or failure merely by existing.

Revision is `r1-` plus SHA-256 over an ordered canonical structure containing the version tag and, for each of the twelve keys, its key, logical type, logical value, and normalized persisted timestamp. Date cells and equivalent schema strings hash identically.

Timestamps retain the existing schema form `yyyy-MM-dd HH:mm:ss` in the Script timezone. Under the script lock a changed save uses one timestamp for every changed canonical row: the later of the current wall-clock second and one second after the maximum persisted canonical timestamp. A → B → A therefore cannot recreate the first revision. A no-op does not advance time.

## Cache concurrency

Public Settings retains the fixed `public:getSettings` cache key and 600-second TTL. A valid cache hit may return without the script lock. A miss obtains the script lock, double-checks the cache, reads the sheet, and fills the cache while still holding the lock. If CacheService is unavailable, the reader reads under the lock and returns an uncached projection.

A write obtains the same lock, re-authorizes, validates, checks the revision and no-op state, prepares the audit destination, removes the fixed cache entry, and verifies it is absent before the first sheet write. It then performs the scoped writes, flushes, reads back, and only then reports the persisted projection. A cache entry cannot be refilled from an old read after a successful save because cache-miss reads and mutations serialize on the same lock.

A cache-hit request that began before invalidation may still return its already-read pre-save value. The design does not claim linearizability for pre-existing in-flight reads. It guarantees that a stale miss/fill cannot repopulate the cache after the successful mutation. Cache refill failure after a verified invalidation and verified save affects caching only; the next miss reads the sheet again.

Tests deterministically schedule hit, miss, double-check, fill, invalidation, save, and release interleavings, including a reader that began before the writer and a reader waiting behind the writer.

## Safe scattered writes and failure semantics

Rows may be interspersed with unknown rows and columns. The service records source row numbers under the lock and writes only `setting_value` and `updated_at` cells for canonical rows whose logical value changes. It never rewrites whole rows or a rectangle spanning unrelated cells. It preserves unknown rows and columns, descriptions, unrelated values, formulas, formats, validation, notes, and metadata. It does not reorder rows or create/repair missing canonical rows.

Google Sheets provides no transaction for these scattered writes through the existing mechanisms. Cache invalidation occurs before the first write. Each changed row's value and timestamp can fail independently. A failure after the first attempted cell write, a flush failure, formula coercion, source-row drift, or any read-back mismatch is `OUTCOME_UNKNOWN`; the service does not roll back and does not claim persistence. Tests inject failures after value writes and timestamp writes and verify that partial state is reported as uncertain, cache remains absent, unrelated cells are untouched, and invalid resulting canonical state fails closed.

Once the writer releases the lock, a public miss can observe and cache whatever partial state actually persisted. The UI and documentation state this non-atomic limitation. Failed or unverifiable persistence is never presented as a normal validation or conflict result.

## Audit

Changed saves append to the existing `activity_logs` schema with `entity_type:"settings"`, `entity_id:"global"`, `action:"UPDATE_SETTINGS"`, the authenticated actor, the monotonic mutation timestamp, and a description containing only the new revision and changed key names. No-op saves do not append.

Audit destination validation occurs before settings writes. If settings persistence and read-back are verified but audit append/verification fails, the mutation remains a known settings success with `audit_status:"unconfirmed"`; it does not imply that an audit row exists. No retry is automatic.

## UI, current effects, and deferred behavior

Every authenticated role sees the page. Non-`super_admin` roles see a read-only form and a clear permission note. Backend authorization remains authoritative. The page groups identity, contact, URLs/media references, language, and flags; it provides validation summaries, safe status regions, keyboard focus management, and responsive layouts at 1280×900, 390×844, and 360×800.

The UI states the actual effects:

- `site_name`, localized slogans, and contact values currently affect the About page.
- `default_language` does not currently change the public shell language.
- `logo_url` is not currently rendered.
- `hero_image_url` does not replace the approved local About media asset.
- `reviews_enabled` and `events_enabled` do not currently control public sections.

This feature does not change any public consumer for those deferred values.

## Conflict, uncertainty, and dirty drafts

The browser retains a baseline snapshot, the user's draft, and any separately fetched server snapshot. Dirty forms warn before refresh, close, normal Admin navigation, or logout. Saves are single-flight. Validation failures preserve every field and focus the first error.

On `CONFLICT`, the client fetches the latest Settings once, keeps the draft, shows fields changed from the baseline, and never merges or resubmits automatically. The user must explicitly choose to discard the draft or explicitly adopt the newly fetched revision before another save.

After a network timeout, malformed mutation response, or `OUTCOME_UNKNOWN`, the client may perform one read-only reconciliation fetch. A current value set equal to the submitted canonical values establishes only that the current state matches those values. It does not confirm that this request succeeded or that its audit was recorded. The UI remains in an uncertain state, retains the draft, and requires explicit user reconciliation before adopting the fetched revision. Mixed state, a different state, or a failed reconciliation read also preserves the draft and never triggers an automatic mutation.

## Verification boundary

Automated coverage includes exact router and client contracts, all roles, field validation, revision/timestamp ABA behavior, cache interleavings, scattered partial writes, audit/no-op behavior, dirty and uncertain reconciliation, public Settings and About regressions, static accessibility checks, and native browser runs at the three required viewport sizes. The full `npm.cmd test`, `npm.cmd run build`, syntax checks, and `git diff --check` complete local verification. Spreadsheet coercion tests remain simulated and are explicitly not production Google Sheets evidence.
