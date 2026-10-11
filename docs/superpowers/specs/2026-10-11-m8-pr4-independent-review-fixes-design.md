# M8 PR4 Independent Review Fixes Design

## Scope and constraints

This change repairs the independently reviewed M8 PR4 Reviews Admin CMS on
`feature/m8-reviews`. It preserves the existing `reviews` and
`activity_logs` schemas, the existing Place cache epoch Script Property, and
all runtime configuration. It does not migrate, rewrite, delete, or repair
legacy Sheet rows automatically.

## Public and Admin data compatibility

The public review writer validates every value that the Admin projection must
later read. Reviewer names may be empty. Reviewer names and comments reject
NUL, malformed UTF-16, ambiguous apostrophe-plus-formula prefixes, and values
outside their documented code-point and UTF-8 byte limits before acquiring a
write lock or writing a row.

Admin list reads classify each physical row independently. Rows with invalid
stored fields are skipped. For a syntactically valid review ID that occurs
more than once, every row with that ID is skipped. Pagination, `total`, and
`total_pages` are computed only from valid, unambiguous rows. A list response
contains a safe warning count when rows were skipped and never exposes the
invalid data.

Detail and mutation resolve the requested ID against the raw authoritative
table. A missing ID returns `NOT_FOUND`; an invalid target or any target with
more than one physical match fails closed with `REVIEW_SCHEMA`. Other invalid
or duplicate rows do not prevent an unrelated valid detail or mutation.

## Revision and timestamp semantics

`updated_at` is the persisted mutation sequence value within the existing
schema. Under the script lock, every successful mutation sets it to the later
of the current wall-clock second and exactly one second after the canonical
stored `updated_at`. Therefore it increases strictly even for multiple writes
within one wall-clock second.

The revision includes canonicalized `updated_at` and every other persisted
business/public field. Date cells and equivalent timestamp strings produce
the same canonical revision. Hide-to-approve and reply-to-clear cycles cannot
restore an earlier revision, and any stale `expected_revision` fails.

## Cache and lock protocol

The Reviews subsystem has one script-lock ownership boundary. Public cached
reads acquire the script lock with a bounded wait before reading the cache
epoch, checking/filling the cache, and publishing a cache entry. Moderation
already owns the same lock across re-authentication, epoch advancement, entity
write, verification, and audit handling. Public submission uses that same
lock for its authoritative Place recheck and append.

No helper that may run inside one of these locked sections acquires the script
lock again. Lock acquisition failure returns a safe bounded failure; there is
no unlocked cache fallback. Consequently a public reader cannot publish old
row data under an epoch namespace that remains current after a successful
moderation mutation.

Failures before an entity write do not alter an entity or audit row. Once an
entity write is attempted, an unverified result remains non-retryable
`OUTCOME_UNKNOWN`. Clients make one request and do not retry mutations.

## Reply encoding

Inputs beginning directly with `=`, `+`, `-`, or `@` retain the established
Sheet apostrophe protection and round-trip exactly. Inputs beginning with an
apostrophe immediately followed by one of those characters are rejected
before write because the historical decoder cannot distinguish user content
from an existing escape marker without changing legacy interpretation.

## Admin API and UI

`CONTENT_LOCK` remains an exact safe API error and has a dedicated UI message.
Reply drafts are owned by `review_id`. Changing selection with a dirty draft
requires explicit discard confirmation; cancellation retains the current
selection and draft. A pending mutation prevents selection changes and
captures an immutable target payload. Late detail responses cannot replace a
newer selection. A successful authoritative reload of the same review updates
its revision, clears conflict/uncertain blocking, and preserves only that
review's draft.

Mutation controls become disabled immediately while a request is pending.
Opening detail moves focus to its heading; returning to the list restores
focus to the originating review control. User text is exercised through a
behavioral DOM harness and is rendered only through text nodes or
`textContent`. Review controls retain keyboard operation, responsive layout,
and at least 44-by-44 CSS-pixel targets.

## Native browser runner

The native Edge/Chrome regression runner uses a bounded child process. A
timeout is a test failure, never a pass or skip. Cleanup targets only the
spawned browser PID and its descendants plus the temporary profile directory
created by that invocation. It never enumerates or terminates unrelated
browser or Node processes.

## Verification strategy

Each implementation group begins with a behavioral regression that fails on
the starting commit, followed by the smallest implementation change and a
green focused suite. Local commits are additive and never amend the five M8
PR4 commits. Final verification runs the focused Reviews suites, relevant
public/Auth/Sheet/cache regressions, the bounded native browser suite, full
`npm test`, `npm run build`, syntax checks, and `git diff --check`. Any command
that does not finish successfully is reported as a verification gap.
