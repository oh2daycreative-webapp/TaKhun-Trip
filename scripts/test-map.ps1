$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$html = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/map.html")
$controllerPath = Join-Path $root "public/js/map.js"
if (-not (Test-Path -LiteralPath $controllerPath)) { throw "Map controller is missing." }
$controller = Get-Content -Raw -Encoding utf8 -LiteralPath $controllerPath
$css = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/map.css")
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/i18n.js")

function Assert-Match([string]$Content, [string]$Pattern, [string]$Message) {
  if ($Content -notmatch $Pattern) { throw $Message }
}

if ($html -match 'class="placeholder"') { throw "Map must not retain the placeholder." }
Assert-Match $html 'class="[^"]*map-page' "Map must expose a scoped body class."
Assert-Match $html 'data-map-canvas' "Map canvas is missing."
Assert-Match $html 'aria-label="[^"]+"' "Map needs accessible labels."
Assert-Match $html '<noscript>[\s\S]*places\.html[\s\S]*</noscript>' "Map needs a useful noscript fallback."
foreach ($mount in @('map-loading','map-ready','map-empty','map-error','map-leaflet-unavailable','map-tile-unavailable','map-focus-not-found','map-focus-no-coordinate','map-route-unavailable','map-results','map-fallback-list','map-preview')) {
  Assert-Match $html ("data-{0}" -f $mount) "Missing Map mount: $mount"
}
Assert-Match $html 'role="status"' "Map needs status semantics."
Assert-Match $html 'role="alert"' "Map errors need alert semantics."
Assert-Match $html 'aria-live="polite"' "Map result updates need a live region."
Assert-Match $html 'integrity="sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="' "Leaflet CSS SRI is missing."
Assert-Match $html 'integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM\+kNiyxNV1lvTlZBo="' "Leaflet JS SRI is missing."
Assert-Match $html 'crossorigin=""' "Leaflet CDN assets need crossorigin."
Assert-Match ($html + $controller) '© OpenStreetMap contributors|&copy; OpenStreetMap contributors' "OSM attribution is missing."

$scripts = @('js/config.js','js/i18n.js','js/api.js','js/place-data.js','js/app.js','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','js/map.js')
$last = -1
foreach ($script in $scripts) {
  $position = $html.IndexOf(('src="{0}"' -f $script))
  if ($position -lt 0) { throw "Missing Map script: $script" }
  if ($position -le $last) { throw "Map script order is incorrect at $script" }
  $last = $position
}

$otherPages = Get-ChildItem -LiteralPath (Join-Path $root "public") -Filter "*.html" -File | Where-Object Name -ne "map.html"
foreach ($page in $otherPages) {
  if ((Get-Content -Raw -Encoding utf8 -LiteralPath $page.FullName) -match 'src="js/map\.js"') { throw "map.js must load only on map.html; found in $($page.Name)." }
}

foreach ($contract in @('normalizeCoordinate','isValidCoordinatePair','getPublishedPlaces','getMarkerPlaces','filterPlaces','parseQuery','resolveFocus','reconcileFocusFilters','getActionModel','TAKHUN_FAVORITES','setPrimaryState','tileerror','takhun:languagechange','popstate','keydown','Escape','replaceChildren','textContent','aria-pressed','addEventListener\("error"')) {
  Assert-Match $controller $contract "Missing Map behavior contract: $contract"
}
if ($html -match 'role="application"') { throw "Leaflet canvas must not claim application semantics without a complete application keyboard model." }
if ($controller -match '\.innerHTML\s*=') { throw "Dynamic Map rendering must not assign innerHTML." }
if (($html + $controller) -match 'href\s*=\s*["'']#["'']') { throw "Map actions must not use href=#." }
Assert-Match $css '\.map-page' "Map CSS must be page-scoped."
Assert-Match $css '\.map-page\s+\[hidden\]\s*\{\s*display\s*:\s*none\s*!important' "Map must preserve the hidden contract."
Assert-Match $css 'prefers-reduced-motion' "Map must respect reduced motion."
if ($css -match '(?:html|body)\s*\{[^}]*overflow-x\s*:\s*hidden') { throw "Map CSS must not hide global horizontal overflow." }

# Responsive polish contracts: mobile owns horizontal scrolling; desktop wraps.
Assert-Match $css '@media\s*\(max-width:\s*899px\)[\s\S]*?\.map-page \.map-filter__chips\s*\{[^}]*overflow-x\s*:\s*auto' "Horizontal filter scrolling must be scoped to mobile/tablet."
Assert-Match $css '@media\s*\(min-width:\s*900px\)[\s\S]*?\.map-page \.map-filter__chips\s*\{[^}]*flex-wrap\s*:\s*wrap[^}]*overflow-x\s*:\s*visible' "Desktop filter chips must wrap without a horizontal scrollbar."
Assert-Match $css '\.map-page \.map-preview\s*\{[^}]*max-height\s*:\s*min\(7[0-5]dvh,' "Mobile Preview must be capped to roughly 70-75dvh."
Assert-Match $css '\.map-page \.map-preview__body\s*\{[^}]*overflow-y\s*:\s*auto' "Preview body must scroll internally."
Assert-Match $css '\.map-page \.map-preview__header\s*\{[^}]*position\s*:\s*sticky[^}]*top\s*:\s*0' "Preview header and close control must remain visible while scrolling."
Assert-Match $css '\.map-page \.map-preview__actions[^}]*position\s*:\s*sticky[^}]*bottom\s*:\s*0' "Preview primary actions must remain visible inside the sheet."
Assert-Match $css '\.map-page \.map-preview__actions\s*\{[^}]*padding-bottom\s*:\s*calc\([^;]*env\(safe-area-inset-bottom\)' "Preview actions need safe-area bottom clearance."

# Width and breakpoint contracts for the 768-1280px range.
Assert-Match $css '\.map-page \.map-page__main\s*\{[^}]*box-sizing\s*:\s*border-box[^}]*max-width\s*:\s*100%' "Map main container must include padding inside viewport width."
Assert-Match $css '\.map-page \.map-page__header,\.map-page \.map-controls,\.map-page \.map-search,\.map-page \.map-search__field,\.map-page \.map-filter,\.map-page \.map-filter__chips,\.map-page \.map-workspace,\.map-page \.map-results\s*\{[^}]*min-width\s*:\s*0[^}]*max-width\s*:\s*100%' "Map toolbar and workspace children need a shared shrink contract."
if ($css -match '@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.map-page \.map-controls\s*\{[^}]*grid-template-columns') { throw "The 768px breakpoint must not force the toolbar into desktop columns." }
Assert-Match $css '@media\s*\(min-width:\s*1024px\)[\s\S]*?\.map-page \.map-controls\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,' "The 1024px toolbar contract must use shrinkable columns."
Assert-Match $css '@media\s*\(min-width:\s*900px\)\s*and\s*\(max-width:\s*1199px\)[\s\S]*?\.map-page \.site-header__inner\s*\{[^}]*min-width\s*:\s*0' "Intermediate-width Map header needs an explicit shrink contract."
Assert-Match $css '@media\s*\(min-width:\s*1200px\)[\s\S]*?\.map-page \.site-header__inner' "The 1200px header breakpoint contract must be explicit."

# Preview must have three structural regions, with only the body scrolling.
Assert-Match $controller 'map-preview__body' "Preview must render a dedicated scrollable body."
Assert-Match $controller 'host\.replaceChildren\(header,\s*body,\s*actions\)' "Preview must render header, body, then action footer."
Assert-Match $css '\.map-page \.map-preview\s*\{[^}]*display\s*:\s*flex[^}]*flex-direction\s*:\s*column[^}]*overflow\s*:\s*hidden' "Preview container must be a bounded non-scrolling flex column."
Assert-Match $css '\.map-page \.map-preview__body\s*\{[^}]*min-height\s*:\s*0[^}]*overflow-y\s*:\s*auto' "Preview body must own internal scrolling."
Assert-Match $css '\.map-page \.map-preview__header[^}]*flex-shrink\s*:\s*0' "Preview header must not shrink."
Assert-Match $css '\.map-page \.map-preview__actions[^}]*flex-shrink\s*:\s*0' "Preview footer must not shrink."

foreach ($key in @('demo_notice','search_label','search_placeholder','clear_search','category_filters','district_filters','reset_view','legend','result_count','loading','empty','error','retry','leaflet_unavailable','tile_unavailable','focus_not_found','focus_no_coordinate','route_unavailable','view_details','navigate','call','close','fallback_title','map_label')) {
  Assert-Match $i18n ("{0}:" -f $key) "Missing Map i18n key: $key"
}

& node (Join-Path $PSScriptRoot "test-map.js")
if ($LASTEXITCODE -ne 0) { throw "Map behavior verification failed." }
Write-Host "Map page contract verification passed."
