$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$html = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/index.html")
$app = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/app.js")
$homeController = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/home.js")
$main = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/main.css")
$components = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/components.css")
$mobile = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/mobile.css")

function Assert-Contains {
  param([string]$Content, [string]$Pattern, [string]$Message)
  if ($Content -notmatch $Pattern) { throw $Message }
}

Assert-Contains $html 'class="[^"]*home-page' "Home body must have the home-page class."
Assert-Contains $html 'class="[^"]*hero-section' "Home must include a hero section."
Assert-Contains $html 'id="featured-places"' "Home must include the featured places mount."
Assert-Contains $html 'id="recommended-routes"' "Home must include the recommended routes mount."
Assert-Contains $html 'id="trip-inspiration"' "Home must include the trip inspiration mount."
Assert-Contains $html 'class="[^"]*site-footer' "Home must include the project footer."
Assert-Contains $html 'data-public-shell[^>]*data-page="index\.html"' "Home must mount the shared public shell."
Assert-Contains $html 'class="shell-fallback"' "Home must provide navigation fallback while the shell loads."

foreach ($state in @("loading", "ready", "empty", "error")) {
  $matches = [regex]::Matches($html, ('data-home-state="{0}"' -f $state))
  if ($matches.Count -ne 2) { throw "Home must expose exactly two $state section state mounts." }
}
foreach ($state in @("ready", "empty", "error")) {
  Assert-Contains $html ('data-home-state="{0}"[^>]*\bhidden\b' -f $state) "Home $state state must be initially hidden."
}
if ($html -match 'data-home-state="loading"[^>]*\bhidden\b') { throw "Home loading state must be initially visible." }
Assert-Contains $html 'data-home-retry' "Home error state must provide Retry buttons."
Assert-Contains $html 'data-home-places-empty' "Home ready state must support an empty Places section."
Assert-Contains $html 'data-home-routes-empty' "Home ready state must support an empty Routes section."

$configIndex = $html.IndexOf('src="js/config.js"')
$i18nIndex = $html.IndexOf('src="js/i18n.js"')
$apiIndex = $html.IndexOf('src="js/api.js"')
$appIndex = $html.IndexOf('src="js/app.js"')
$homeIndex = $html.IndexOf('src="js/home.js"')
if (@($configIndex, $i18nIndex, $apiIndex, $appIndex, $homeIndex) | Where-Object { $_ -lt 0 }) { throw "Home must load config, i18n, api, app, and home scripts." }
if (-not ($configIndex -lt $i18nIndex -and $i18nIndex -lt $apiIndex -and $apiIndex -lt $appIndex -and $appIndex -lt $homeIndex)) { throw "Home script dependency order is invalid." }
Get-ChildItem -LiteralPath (Join-Path $root "public") -Filter "*.html" | Where-Object { $_.Name -ne "index.html" } | ForEach-Object {
  if ((Get-Content -Raw -Encoding utf8 -LiteralPath $_.FullName) -match 'src="js/home\.js"') { throw "home.js must load only on index.html; found in $($_.Name)." }
}

$quickActions = [regex]::Matches($html, 'class="[^"]*quick-action(?:\s|"|__)').Count
if ($quickActions -lt 4) { throw "Home must include at least four quick actions." }

foreach ($target in @('trip-planner.html', 'places.html', 'routes.html', 'map.html')) {
  Assert-Contains $html ([regex]::Escape(('href="{0}"' -f $target))) "Home is missing the required link to $target."
}

foreach ($homeOnly in @('HOME_DATA', 'featuredPlaces', 'recommendedRoutes', 'tripInspiration', 'renderFeaturedPlaces', 'renderRecommendedRoutes', 'renderTripInspiration')) {
  if ($app -match [regex]::Escape($homeOnly)) { throw "app.js must remain shared-shell only; found $homeOnly." }
}
Assert-Contains $app 'aria-expanded' "Drawer behavior must synchronize aria-expanded."
Assert-Contains $app 'aria-current' "Rendered Home navigation must expose its active state."
Assert-Contains $app 'id="mobile-menu"' "The public shell must include the mobile menu drawer."
Assert-Contains $app 'Escape' "Drawer must close with the Escape key."

foreach ($contract in @('normalizeHomeResponse', 'createHomeController', 'getHomeData', 'takhun:languagechange', 'replaceChildren', 'textContent', 'encodeURIComponent', 'http:', 'https:', 'data-home-retry')) {
  Assert-Contains $homeController ([regex]::Escape($contract)) "home.js missing behavior contract $contract."
}
if ($homeController -match '\.innerHTML\s*=') { throw "home.js must not assign innerHTML." }
if ($homeController -match '\beval\s*\(') { throw "home.js must not use eval." }
foreach ($forbidden in @('featured_products', 'upcoming_events', 'gallery_preview')) {
  if ($homeController -match ('render[A-Za-z]*' + $forbidden)) { throw "Home must not render $forbidden." }
}

Assert-Contains ($main + $components) ':focus-visible' "Interactive components must have a visible keyboard focus state."
Assert-Contains $mobile 'safe-area-inset-bottom' "Mobile navigation must support safe-area spacing."
Assert-Contains $mobile '\.bottom-nav' "Mobile stylesheet must define the bottom navigation."
Assert-Contains $mobile '@media\s*\(min-width:' "Mobile navigation must have a desktop visibility rule."

if ($main -match 'html\s*\{[^}]*overflow-x\s*:\s*hidden' -or $main -match 'body\s*\{[^}]*overflow-x\s*:\s*hidden') {
  throw "Horizontal overflow must not be hidden globally on html or body."
}
Assert-Contains $components '\.hero-mountain\s*\{[^}]*left\s*:\s*0[^}]*width\s*:\s*100%' "Hero mountains must stay within the landscape viewport."
foreach ($class in @('home-section-state', 'home-section-empty', 'home-section-error', 'home-card__image', 'home-card__image-fallback')) {
  Assert-Contains $components ([regex]::Escape(".$class")) "Home components stylesheet missing .$class."
}
Assert-Contains $components '\.home-route-styles[^}]*overflow-wrap\s*:\s*anywhere' "Unknown or long route style codes must not cause horizontal overflow."
if ($mobile -match '\.hero-mountain\s*\{[^}]*(?:width\s*:\s*(?:1(?:0[1-9]|[1-9][0-9])|[2-9][0-9]{2,})%|left\s*:\s*[1-9][0-9]*%)') {
  throw "Mobile hero mountains must not exceed or shift outside the viewport."
}
if ($mobile -match '\.home-page\s+\.place-card:last-child\s*\{[^}]*display\s*:\s*none') {
  throw "Responsive Home CSS must not hide the final API-provided Place card."
}

Write-Host "Home page verification passed."
