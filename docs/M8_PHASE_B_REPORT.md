# M8 PR1 Phase B handoff

2026-10-07. Local implementation only. M8 completion, PR merge and deployment are not claimed.

## A. Sources inspected
Phase A contract; Admin CMS/API/data schema/testing specifications; Product/Event domain services and shared projections; existing Admin API/auth/shell, Places list/editor patterns, Admin CSS and Node VM/PowerShell regression suites. Starting worktree was clean at `5934555`; no previously completed Phase B implementation existed.

## B–E. Product/Event list and editor
The existing `products.html` and `events.html` now initialize protected in-page lists/editors. Lists use 20-row server pagination, keyword, status and actual category/type filters, safe loading/error/empty states, refresh and previous/next navigation. Current-page protected detail reads provide featured and Event date/time summaries. Opening Manage always loads authoritative detail. Editors expose exactly their domain's editable fields; IDs, timestamps and revisions are not editable. Related Place selection reuses paginated Admin Places reads with current-reference retention and draft/published choices. No backend gap or new endpoint was needed.

## F. Roles
Viewer/reviewer have read-only detail; editor/super_admin have create/edit/lifecycle controls. The existing server remains authoritative. No role or token is added to payload fields or query parameters.

## G. Lifecycle
| Source | Targets |
|---|---|
| draft | published, archived, deleted |
| published | hidden, archived, deleted |
| hidden | draft, published, archived, deleted |
| archived | draft, deleted |
| deleted | draft |

Native Thai confirmations precede all lifecycle writes. Dirty forms require Save or deliberate Reload. Retirement/restoration sends only status and identity/revision; delete uses the soft-delete method. Archived/deleted fields are read-only. Returned status/revision determines subsequent controls.

## H–K. Mutation safety
- Updates/lifecycle send the current detail revision. Conflict preserves entered values, blocks writing and requires explicit reload; failed reload preserves form values.
- Indeterminate transport, malformed success or `OUTCOME_UNKNOWN` never retries. Update/lifecycle require authoritative reconciliation before continuing.
- Create persists a pending marker before dispatch, including protection against reload during the request. Unknown create blocks further creation until explicit list/detail reconciliation. A found result can be acknowledged without losing unsaved edits. Storage failure prevents create dispatch. This is session-scoped protection, not a backend exactly-once or cross-device guarantee.
- State and DOM controls block double submission while pending. Native before-unload protection covers pending/dirty editors.
- Audit-unconfirmed is successful data mutation with warning, retained identity/state/revision and no automatic resubmission.

## L–M. Validation
Thai field errors cover required values, exact enum selects, Boolean checkbox, paired finite coordinate bounds (including valid exponent-form values), nonnegative safe-integer sort order, tags, text/formula prefixes and HTTP(S) URL syntax. Events use Gregorian `YYYY-MM-DD`, optional `HH:mm`, start-only support and strictly later same-day end. No timezone conversion or multi-day fields. Server validation remains authoritative.

## N. API/auth
Ten explicit Product/Event methods extend the existing frozen Admin API facade. Request/response projections are domain-specific. Existing POST-body token transport, timeout handling and auth shell remain. No generic caller-selected action/table, GET mutation, query token, second auth system or mutation retry was introduced.

## O. Mobile/accessibility
Scoped CSS provides one-column mobile cards/forms, desktop two-column grids, wrapping actions/titles, 44px buttons, visible focus, labelled fields, associated errors, invalid-field focus and live status. Native confirmations use browser keyboard/focus handling. Offline Chrome fixtures at actual 375px and 1280px viewports covered Product/Event list and form layouts: no horizontal content overflow. Fixtures used stub reads and no configured remote API. Real screen-reader/native-dialog interaction and approved non-production integration remain on the manual checklist.

## P. Automated coverage
New `test-admin-content-api.js`, `test-admin-content-model.js`, `test-admin-content-ui.js` run in the mandatory suite. Behavioral tests cover transport/actions, typed payloads, role controls, real-model DOM flows, lifecycle, revisions, conflict/unknown outcomes, duplicate guards, pending marker persistence, audit warnings, failed-reload preservation, reconciliation, validation, filters/pagination and safe rendering. Existing API export/mutation assertions and shell placeholder scope were updated for the new explicit surface; Places tests remain intact.

## Q–R. QA and documentation
`M8_PHASE_B_QA.md` specifies later non-production Products/Events/roles/lifecycle/error/mobile/keyboard QA. Admin CMS and testing specifications record permanent UI behavior. Phase A contract and backend are unchanged. The implementation plan records scope and task completion.

## S–T. Executed verification
Focused API/model/UI suites: PASS. Full `cmd /c npm test`: PASS (exit 0), including Admin Places and public Product/Event/Home/Search regressions. Final `cmd /c npm run build`: PASS (exit 0), including its full-suite rerun. JavaScript syntax: PASS for all 80 files under scripts/public. Apps Script syntax/static: PASS for 23 files and 442 functions. `git diff --check`: PASS.

Test-first failures were observed before implementation and for the exponential-coordinate regression. Earlier integration runs stopped at obsolete API-export/mutation and shell expectations; those assertions were updated without removing their original safety coverage. Independent review's two frontend issues were corrected and rechecked; no remaining concrete finding was reported.

## U–X. Git evidence
The following snapshot contains the exact tracked diff stat and full changed-file list/status; untracked new files are not included in `git diff --stat`. HEAD must remain `5934555`.

```text
 docs/ADMIN_CMS_SPEC.md       |  14 +++++
 docs/TESTING_CHECKLIST.md    |   6 ++
 public/admin/events.html     |   9 ++-
 public/admin/js/admin-api.js | 145 ++++++++++++++++++++++++++++++++++++++++++-
 public/admin/products.html   |   9 ++-
 scripts/test-admin-api.js    |   4 +-
 scripts/test-admin-shell.js  |   9 +--
 scripts/test.ps1             |   6 ++
 8 files changed, 188 insertions(+), 14 deletions(-)
```

Full status (17 changed/new files):

```text
## feature/m8-products-events...origin/main [ahead 1]
 M docs/ADMIN_CMS_SPEC.md
 M docs/TESTING_CHECKLIST.md
 M public/admin/events.html
 M public/admin/js/admin-api.js
 M public/admin/products.html
 M scripts/test-admin-api.js
 M scripts/test-admin-shell.js
 M scripts/test.ps1
?? docs/M8_PHASE_B_QA.md
?? docs/M8_PHASE_B_REPORT.md
?? docs/superpowers/plans/2026-10-07-m8-phase-b.md
?? public/admin/js/admin-content-model.js
?? public/admin/js/admin-content-ui.js
?? public/css/admin-content.css
?? scripts/test-admin-content-api.js
?? scripts/test-admin-content-model.js
?? scripts/test-admin-content-ui.js
```

HEAD: `5934555`.

## Y. Backend contract gaps
None. Missing list summary fields are obtained through existing current-page detail reads. No Phase A backend file changed.

## Z. Explicit confirmations
No commit, push, merge, deployment, Production/remote Sheet access, credential/Script Property change, or Dashboard/Routes/Reviews/Gallery/Settings implementation. No unrelated public frontend redesign or discarded existing work.

## Phase B.1 remediation
Related-Place search now consumes Enter locally and performs one Place lookup without submitting Product/Event; Save remains the mutation path. Editors inspect native number-control `validity.badInput`, show Thai field feedback and focus malformed controls while preserving optional blank semantics. Product/Event response contracts accept exact valid legacy content metadata `YYYY-MM-DD HH:mm:ss` and canonical ISO without changing strict authentication timestamps. Contract tests cover both list/detail paths and malformed values; lifecycle tests use an independently declared literal matrix for both domains. Approval, merge and deployment are not claimed.