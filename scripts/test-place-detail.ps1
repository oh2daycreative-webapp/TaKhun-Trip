$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$html = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/place-detail.html")
$placesHtml = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/places.html")
$controller = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/place-detail.js")
$data = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/place-data.js")
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/i18n.js")
$components = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/components.css")
$mobile = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/mobile.css")

function Assert-Match([string]$Content, [string]$Pattern, [string]$Message) {
  if ($Content -notmatch $Pattern) { throw $Message }
}

if ($html -match 'class="placeholder"') { throw "Place Detail must not retain the placeholder." }
Assert-Match $html 'class="[^"]*place-detail-page' "Place Detail must expose its scoped body class."
Assert-Match $html 'data-i18n="place_detail\.demo_notice"' "Place Detail must identify demo data."
$loadingTag = [regex]::Match($html, '<section[^>]*data-detail-loading[^>]*>').Value
if (-not $loadingTag) { throw "Loading state markup is missing." }
if ($loadingTag -match '\shidden(?:\s|>)') { throw "Loading must be initially visible." }
Assert-Match $html 'data-detail-not-found[^>]*hidden' "Not Found must be initially hidden."
Assert-Match $html 'data-detail-error[^>]*hidden' "Error must be initially hidden."
Assert-Match $html 'data-detail-content[^>]*hidden' "Detail content must be initially hidden."
$primaryTags = @(
  $loadingTag,
  [regex]::Match($html, '<section[^>]*data-detail-not-found[^>]*>').Value,
  [regex]::Match($html, '<section[^>]*data-detail-error[^>]*>').Value,
  [regex]::Match($html, '<article[^>]*data-detail-content[^>]*>').Value
)
$initiallyVisible = @($primaryTags | Where-Object { $_ -notmatch '\shidden(?:\s|>)' })
if ($initiallyVisible.Count -ne 1) { throw "Initial markup must expose exactly one primary state; found $($initiallyVisible.Count)." }
foreach ($mount in @("detail-loading", "detail-not-found", "detail-error", "detail-content", "detail-hero", "detail-summary", "detail-description", "detail-activities", "detail-visitor", "detail-gallery", "detail-map", "detail-nearby", "detail-reviews", "detail-review-form")) {
  Assert-Match $html ("data-{0}" -f $mount) "Missing semantic detail mount: $mount"
}
Assert-Match $html 'role="dialog"' "Lightbox must use dialog semantics."
Assert-Match $html 'aria-modal="true"' "Lightbox must be modal."
Assert-Match $html 'data-lightbox-close' "Lightbox must have a close control."
foreach ($contract in @('data-review-form','data-review-name','data-review-anonymous','data-review-rating','data-review-comment','maxlength="1000"','data-review-submit','data-review-status','data-review-loading','data-review-empty','data-review-error','data-review-ready')) {
  Assert-Match $html $contract "Missing active review UI contract: $contract"
}

$scripts = @('js/config.js','js/i18n.js','js/api.js','js/place-data.js','js/app.js','js/place-detail.js')
$last = -1
foreach ($script in $scripts) {
  $position = $html.IndexOf(('src="{0}"' -f $script))
  if ($position -lt 0) { throw "Missing Place Detail script: $script" }
  if ($position -le $last) { throw "Place Detail script order is incorrect at $script" }
  $last = $position
}
Assert-Match $placesHtml 'src="js/place-data\.js"' "Places must share place-data.js."
if ($placesHtml -match 'src="js/place-detail\.js"') { throw "Place Detail controller must not load on Places List." }
$otherPages = Get-ChildItem -LiteralPath (Join-Path $root "public") -Filter "*.html" -File | Where-Object Name -ne "place-detail.html"
foreach ($page in $otherPages) {
  if ((Get-Content -Raw -Encoding utf8 -LiteralPath $page.FullName) -match 'src="js/place-detail\.js"') { throw "place-detail.js must load only on place-detail.html; found in $($page.Name)." }
}

foreach ($contract in @('parsePlaceId','validatePlaceId','findPublishedPlace','resolvePage','setPageState','encodeURIComponent','TAKHUN_FAVORITES','aria-pressed','navigator\.share','clipboard','AbortError','keydown','Escape','replaceChildren','textContent','takhun:languagechange','document\.title','place_detail\.image_alt')) {
  Assert-Match $controller $contract "Missing Place Detail behavior contract: $contract"
}
if ($controller -match '\.innerHTML\s*=') { throw "Dynamic Place Detail rendering must not assign innerHTML." }
if (($html + $controller) -match 'href\s*=\s*["'']#["'']') { throw "Place Detail actions must not use href=#." }
foreach ($contract in @('getReviews','submitReview','submitInFlight','setReviewState','validateReviewPayload','normalizeReviewResponse','data-review-submit','data-review-form')) {
  Assert-Match $controller $contract "Missing production review behavior contract: $contract"
}
if ($controller -match 'fetch\s*\(') { throw "Place Detail must call reviews through TakhunApi, not fetch directly." }
if ($controller -match 'localStorage[^\r\n]*(?:REVIEW|review)') { throw "Mock reviews must not persist to Local Storage." }
Assert-Match $controller 'data-detail-retry[^\r\n]*addEventListener\("click",\s*render\)' "Retry must restart the render cycle, which enters Loading first."
Assert-Match $controller 'setPageState\(mounts,\s*"loading"' "Every render cycle must enter Loading before resolving data."
Assert-Match $controller 'if\s*\(!currentPlace\)[^{]*\{[^}]*setPageState\(mounts,\s*"not-found"[^}]*return' "Invalid places must transition to Not Found and return before detail rendering."

foreach ($key in @('demo_notice','back','favorite_add','favorite_remove','share','copy_success','copy_failed','description','highlights','activities','visitor_information','opening_time','fee','duration','best_time','gallery','map','nearby','reviews','review_loading','review_empty','review_error','review_retry','write_review','review_name','review_anonymous','review_rating','review_comment','review_submit','review_submitting','review_success','review_submit_error','review_comment_required','review_rating_invalid','loading','not_found_title','not_found_text','error','retry','image_alt','image_fallback','close_gallery')) {
  Assert-Match $i18n ("{0}:" -f $key) "Missing Place Detail i18n key: $key"
}

Assert-Match $components '\.place-detail-page' "Place Detail component CSS must be scoped."
Assert-Match $components '\.place-detail-page\s+\[hidden\]\s*\{\s*display\s*:\s*none\s*!important' "Place Detail must preserve the native hidden display contract against component display rules."
Assert-Match $components '\.place-detail-page[^\r\n]*\.detail-hero' "Hero CSS must be scoped under Place Detail."
Assert-Match $components '\.place-detail-page[^\r\n]*\.detail-lightbox' "Lightbox CSS must be scoped under Place Detail."
Assert-Match ($components + $mobile) 'prefers-reduced-motion' "Place Detail must respect reduced motion."
if (($components + $mobile) -match '(?:html|body)\s*\{[^}]*overflow-x\s*:\s*hidden') { throw "Place Detail must not hide global horizontal overflow." }

Assert-Match $data 'is_demo:\s*true' "Shared records must be visibly marked as demo data."
Assert-Match $data 'MOCK-REVIEW-' "Mock reviews must use mock identifiers."

& node (Join-Path $PSScriptRoot "test-place-detail.js")
if ($LASTEXITCODE -ne 0) { throw "Place Detail behavior verification failed." }

Write-Host "Place Detail page contract verification passed."
