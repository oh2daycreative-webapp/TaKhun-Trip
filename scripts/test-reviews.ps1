$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$controllerPath = Join-Path $root "public/js/reviews.js"
$htmlPath = Join-Path $root "public/place-detail.html"
$placeControllerPath = Join-Path $root "public/js/place-detail.js"
$i18nPath = Join-Path $root "public/js/i18n.js"
$componentsPath = Join-Path $root "public/css/components.css"
$mobilePath = Join-Path $root "public/css/mobile.css"
$runnerPath = Join-Path $root "scripts/test.ps1"

if (-not (Test-Path -LiteralPath $controllerPath)) {
  throw "Public Reviews must have an isolated public/js/reviews.js controller."
}

$controller = Get-Content -LiteralPath $controllerPath -Raw
$html = Get-Content -LiteralPath $htmlPath -Raw
$placeController = Get-Content -LiteralPath $placeControllerPath -Raw
$i18n = Get-Content -LiteralPath $i18nPath -Raw
$styles = (Get-Content -LiteralPath $componentsPath -Raw) + "`n" + (Get-Content -LiteralPath $mobilePath -Raw)
$runner = Get-Content -LiteralPath $runnerPath -Raw

function Assert-Match([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NoMatch([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -match $Pattern) { throw $Message }
}

foreach ($mount in @("review-idle", "review-loading", "review-ready", "review-empty", "review-error", "review-summary", "review-list", "review-pagination", "review-previous", "review-next", "review-page-indicator")) {
  Assert-Match $html ("data-{0}" -f $mount) "Missing Public Reviews mount: $mount"
}
Assert-Match $html '<section[^>]+data-detail-reviews[^>]+aria-labelledby="detail-reviews-title"' "Reviews must remain a labelled section."
Assert-Match $html 'data-review-loading[^>]+role="status"[^>]+aria-live="polite"' "Review loading must expose a polite status."
Assert-Match $html 'data-review-error[^>]+role="alert"' "Review errors must use role=alert."
Assert-Match $html 'data-review-previous[^>]+type="button"' "Previous pagination control must be a native button."
Assert-Match $html 'data-review-next[^>]+type="button"' "Next pagination control must be a native button."
Assert-NoMatch $html 'data-review-form|data-review-submit|data-detail-review-form' "Read-only milestone must not expose a review submission form."
Assert-NoMatch $placeController 'submitReview|createReviewSubmitHandler|validateReviewPayload' "Place Detail must not retain submit-review runtime behavior."
Assert-NoMatch $placeController 'normalizeReviewResponse|renderReviews|setReviewState|fetchReviews|mockReviewResponse' "Review rendering and lifecycle must be extracted from Place Detail."
Assert-Match $placeController 'TakhunReviews\.createController' "Place Detail must mount the isolated Reviews controller."
Assert-Match $html '<script src="js/reviews\.js"></script>\s*<script src="js/place-detail\.js"></script>' "Reviews controller must load before Place Detail."
Assert-NoMatch $controller '\.innerHTML\s*=' "Reviews must not render API content through innerHTML."
Assert-NoMatch $placeController '\.innerHTML\s*=' "Place Detail must not render API content through innerHTML."

foreach ($key in @("review_rating_label", "review_admin_reply", "review_summary_full", "review_page_indicator", "review_previous", "review_next", "review_previous_label", "review_next_label")) {
  Assert-Match $i18n ("{0}:" -f $key) "Missing Public Reviews i18n key: $key"
}

Assert-Match $styles 'review-card__comment[^}]*overflow-wrap\s*:\s*anywhere' "Long review text must wrap safely."
Assert-Match $styles 'review-pagination[^}]*min-width\s*:\s*0' "Review pagination must permit responsive shrinking."
Assert-Match $styles 'data-review-previous|review-pagination__button' "Review pagination controls need component styles."
Assert-Match $styles '@media\s*\(max-width:\s*599px\)' "Reviews need the approved mobile breakpoint."
Assert-Match $styles 'min-height\s*:\s*44px' "Review controls must meet the 44px touch target."
Assert-Match $runner 'test-reviews\.js' "Full regression runner must execute Reviews behavior tests."
Assert-Match $runner 'test-reviews\.ps1' "Full regression runner must execute Reviews static tests."

Write-Output "Public Reviews static contract verification passed."
