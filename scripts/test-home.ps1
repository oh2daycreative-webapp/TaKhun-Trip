$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$html = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/index.html")
$app = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/js/app.js")
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

$quickActions = [regex]::Matches($html, 'class="[^"]*quick-action(?:\s|"|__)').Count
if ($quickActions -lt 4) { throw "Home must include at least four quick actions." }

foreach ($target in @('trip-planner.html', 'places.html', 'routes.html', 'map.html')) {
  Assert-Contains $html ([regex]::Escape(('href="{0}"' -f $target))) "Home is missing the required link to $target."
}

Assert-Contains $app 'HOME_DATA' "Home data must be easy to edit in app.js."
Assert-Contains $app 'featuredPlaces' "Home data must define featured places."
Assert-Contains $app 'recommendedRoutes' "Home data must define recommended routes."
Assert-Contains $app 'tripInspiration' "Home data must define trip inspiration."
Assert-Contains $app 'aria-expanded' "Drawer behavior must synchronize aria-expanded."
Assert-Contains $app 'aria-current' "Rendered Home navigation must expose its active state."
Assert-Contains $app 'id="mobile-menu"' "The public shell must include the mobile menu drawer."
Assert-Contains $app 'Escape' "Drawer must close with the Escape key."

Assert-Contains ($main + $components) ':focus-visible' "Interactive components must have a visible keyboard focus state."
Assert-Contains $mobile 'safe-area-inset-bottom' "Mobile navigation must support safe-area spacing."
Assert-Contains $mobile '\.bottom-nav' "Mobile stylesheet must define the bottom navigation."
Assert-Contains $mobile '@media\s*\(min-width:' "Mobile navigation must have a desktop visibility rule."

if ($main -match 'html\s*\{[^}]*overflow-x\s*:\s*hidden' -or $main -match 'body\s*\{[^}]*overflow-x\s*:\s*hidden') {
  throw "Horizontal overflow must not be hidden globally on html or body."
}
Assert-Contains $components '\.hero-mountain\s*\{[^}]*left\s*:\s*0[^}]*width\s*:\s*100%' "Hero mountains must stay within the landscape viewport."
if ($mobile -match '\.hero-mountain\s*\{[^}]*(?:width\s*:\s*(?:1(?:0[1-9]|[1-9][0-9])|[2-9][0-9]{2,})%|left\s*:\s*[1-9][0-9]*%)') {
  throw "Mobile hero mountains must not exceed or shift outside the viewport."
}

Write-Host "Home page verification passed."
