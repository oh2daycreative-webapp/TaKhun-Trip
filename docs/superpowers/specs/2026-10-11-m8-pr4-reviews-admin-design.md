# M8 PR4 Reviews Admin CMS Design

## Scope

Add protected Reviews list/detail and moderation to the existing Admin CMS without changing the `reviews` Sheet schema, public submission UI, Script Properties, or runtime configuration. Public submission remains API-only in PR4.

## Stored contract

The existing fields remain authoritative: `review_id`, `place_id`, `reviewer_name`, `is_anonymous`, `rating`, `comment`, `admin_reply`, `status`, `created_at`, `updated_at`, `approved_at`, `approved_by`. Original reviewer, rating, comment, Place and creation time are immutable.

`admin_reply` is optional text with at most 2,000 Unicode code points and 8,000 UTF-8 bytes. NUL and malformed UTF-16 surrogate sequences are rejected. Formula-leading text is stored with the existing leading-apostrophe protection and returned byte-for-byte equivalent to the accepted input. Legacy stored text is readable only when it can be projected safely; malformed identifiers, enums, timestamps, booleans, ratings or Unicode fail closed.

## Actions and authorization

All actions are literal POST body actions with `{action, token, payload}`. Every action validates the authoritative session server-side.

| Action | super_admin | editor | reviewer | viewer |
|---|---:|---:|---:|---:|
| `adminGetReviews` | read | read | read | read |
| `adminGetReviewDetail` | read | read | read | read |
| `approveReview` | yes | yes | yes | no |
| `hideReview` | yes | yes | yes | no |
| `replyReview` | yes | yes | no | no |
| `clearReviewReply` | yes | yes | no | no |
| `deleteReview` | yes | no | no | no |

Reads support safe list/detail projections. List filters are `keyword`, `status`, `place_id`, `page`, and `page_size`; default page size is 20 and maximum is 100. Detail accepts exactly `review_id`.

Every mutation accepts exactly `review_id` and `expected_revision`, plus `admin_reply` for `replyReview`. Clear reply has its own endpoint and accepts no reply value.

## Lifecycle

- Approve: `pending` or `hidden` to `approved`; the related Place must currently be `published`.
- Hide: `pending` or `approved` to `hidden`.
- Reply or clear reply: `pending`, `approved`, or `hidden`; a no-op is rejected.
- Delete: any non-`deleted` status to `deleted`.
- `deleted` is readable and terminal.

Approval writes `approved_at` and `approved_by`. Leaving `approved` preserves the approval history. Re-approval replaces the approval timestamp and approver with the latest authoritative actor.

## Concurrency, persistence and cache

The service computes a deterministic `r1-<sha256>` revision from all public/business fields except `updated_at`. Mutations authenticate before lock acquisition, acquire the script lock, re-authenticate, reread the row, compare `expected_revision`, validate the transition, and perform one verified full-row replacement.

Before any mutation that changes an approved review's public projection, or makes a review approved, the service advances the existing Place public cache epoch. A failure before the entity write changes no entity or audit row. Once an entity write is attempted, an unverified result returns non-retryable `OUTCOME_UNKNOWN`; clients never retry automatically. An entity verified successfully remains success if the audit append cannot be confirmed and returns `audit_status: "unconfirmed"`.

Every mutation appends an uppercase action to `activity_logs` with entity type `review`. Server responses contain safe projections only.

## Admin UI

`public/admin/reviews.html` provides filters, responsive list/card views, semantic detail and role-specific moderation controls. User text is rendered only with text nodes/textContent. Requests are generation-guarded so stale list/detail responses cannot overwrite current state. A pending detail reload never overwrites a locally edited reply draft. Mutation controls are single-flight; conflict and uncertain outcomes require explicit reload/reconciliation.

## Tests

Focused service, Admin API and Admin UI suites cover permissions, lifecycle, strict envelopes, revision conflicts, locks/re-authentication, Unicode/NUL/size boundaries, formula round-trip, legacy rows, verified/uncertain/audit-only failures, cache freshness, response validation, safe rendering, stale responses and preserved reply drafts. The suites are mandatory in `scripts/test.ps1`.
