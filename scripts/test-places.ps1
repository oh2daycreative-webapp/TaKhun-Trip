$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$html = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/places.html")
$app = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/app.js")
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/i18n.js")
$components = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/components.css")
$mobile = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/mobile.css")
$placesJs = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/places.js")

function Assert-Match([string]$Content, [string]$Pattern, [string]$Message) {
  if ($Content -notmatch $Pattern) { throw $Message }
}

if ($html -match 'class="placeholder"') { throw "Places must not retain the placeholder page." }
Assert-Match $html 'class="[^\"]*places-page' "Places body must expose a scoped page class."
Assert-Match $html '<label[^>]*for="places-search"' "Search must have a semantic label."
Assert-Match $html 'id="places-search"' "Places must include search input."
Assert-Match $html 'data-i18n-attr="placeholder:places\.search_placeholder"' "Search placeholder must use the supported i18n attribute contract."
Assert-Match $html 'data-search-clear[^>]*aria-label=' "Search must include an accessible clear button."
foreach ($name in @("district", "category", "route_group")) {
  Assert-Match $html ('<fieldset[^>]*data-filter-group="{0}"' -f $name) "Missing $name filter group."
}
Assert-Match $html 'data-places-grid' "Places must provide a non-empty results mount."
Assert-Match $html 'data-places-state' "Places must provide a fallback state mount."
Assert-Match $html 'data-load-more' "Places must provide Load More."
Assert-Match $html 'src="js/places\.js"' "Places must load its isolated controller."
Assert-Match $html 'src="js/place-data\.js"' "Places must load the shared place data source."
if ($html.IndexOf('src="js/place-data.js"') -gt $html.IndexOf('src="js/places.js"')) { throw "Shared place data must load before the Places controller." }
Assert-Match $html 'data-i18n="places\.demo_notice"' "Places must visibly identify demo data."

$otherPages = Get-ChildItem -LiteralPath (Join-Path $root "public") -Filter "*.html" -File | Where-Object Name -ne "places.html"
foreach ($page in $otherPages) {
  $content = Get-Content -Raw -Encoding utf8 -LiteralPath $page.FullName
  if ($content -match 'src="js/places\.js"') { throw "places.js must load only on places.html; found in $($page.Name)." }
}

if ($app -match 'MOCK-PLACE-|function\s+(?:filterPlaces|loadPlaces|renderPlaces)') { throw "Places logic must remain outside app.js." }
foreach ($key in @("header_title", "search_placeholder", "clear_search", "filter_district", "filter_category", "filter_route_group", "results_summary", "loading", "empty_all", "empty_filtered", "error", "retry", "load_more", "favorite_add", "favorite_remove", "demo_notice")) {
  Assert-Match $i18n ("{0}:" -f $key) "Missing Places i18n key $key."
}
Assert-Match $components '\.places-page' "Places component styles must be page-scoped."
Assert-Match $components '\.place-card--listing' "Listing cards must use a dedicated variant."
Assert-Match $placesJs 'document\.addEventListener\("takhun:languagechange"' "Places must listen where i18n dispatches language changes."
foreach ($contract in @('URLSearchParams', 'history\?\.\[', 'popstate', 'setTimeout\([^,]+,\s*250\)', 'replaceChildren', 'places\.empty_all', 'places\.empty_filtered', 'places\.error', 'places\.retry', 'encodeURIComponent', 'TAKHUN_FAVORITES', 'aria-pressed')) {
  Assert-Match $placesJs $contract "Missing Places behavior contract: $contract"
}
if ($placesJs -match '\.innerHTML\s*=') { throw "Dynamic Places rendering must not assign innerHTML." }
if ($placesJs -match 'href\s*=\s*["'']#') { throw "Places actions must not use href=#." }
Assert-Match $placesJs 'if\s*\(canOpenMap\(place\)\)' "Map CTA must be conditional."
Assert-Match $placesJs 'if\s*\(place\.google_maps_url\)' "Navigation CTA must be conditional."
Assert-Match $mobile '\.home-page\s+\.place-card:last-child' "The last-card visibility exception must be scoped to Home."
if ($mobile -match '(?m)(?<!home-page[^\r\n]*)\.place-card:last-child\s*\{\s*display\s*:\s*none') { throw "Unscoped last-card hiding can remove Places results." }
if (($components + $mobile) -match '(?:html|body)\s*\{[^}]*overflow-x\s*:\s*hidden') { throw "Places must not hide horizontal overflow globally." }

& node (Join-Path $PSScriptRoot "test-places.js")
if ($LASTEXITCODE -ne 0) { throw "Places behavior verification failed." }

Write-Host "Places page contract verification passed."
