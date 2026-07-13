$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $root "public/trip-planner.html"
$controllerPath = Join-Path $root "public/js/trip-planner.js"
if (-not (Test-Path -LiteralPath $controllerPath)) { throw "Missing public/js/trip-planner.js" }
$html = Get-Content -Raw -Encoding UTF8 -LiteralPath $htmlPath
$controller = Get-Content -Raw -Encoding UTF8 -LiteralPath $controllerPath
$api = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root "public/js/api.js")
$i18n = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root "public/js/i18n.js")
if ($html -notmatch 'data-public-shell') { throw "Trip Planner must reuse the public shell" }
foreach ($mount in @("planner-duration", "planner-styles", "planner-templates", "planner-places", "planner-status", "planner-clear", "planner-share", "planner-map")) {
  if ($html -notmatch "data-$mount") { throw "trip-planner.html missing data-$mount" }
}
foreach ($script in @("js/config.js", "js/i18n.js", "js/api.js", "js/place-data.js", "js/app.js", "js/routes.js", "js/trip-planner.js")) {
  if ($html -notmatch [regex]::Escape("src=`"$script`"")) { throw "Trip Planner missing $script" }
}
if ($controller -match 'fetch\s*\(') { throw "trip-planner.js must use the central API client" }
foreach ($contract in @("getTripTemplates", "getRouteDetail", "getPlaceDetail", "from_route", "TAKHUN_TRIP_PLAN", "map.html?focus=", "map.html?route=", "place-detail.html?id=")) {
  if (($controller + $api) -notmatch [regex]::Escape($contract)) { throw "Missing Trip Planner contract: $contract" }
}
$count = ([regex]::Matches($i18n, "(?m)^\s{6}trip_planner:\s*\{")).Count
if ($count -ne 2) { throw "i18n namespace trip_planner must appear exactly once in Thai and English" }
foreach ($forbidden in @("React", "Vue", "Tailwind", "Bootstrap", "jQuery")) {
  if ($html -match $forbidden -or $controller -match $forbidden) { throw "Forbidden dependency detected: $forbidden" }
}
if ($html -match '<style\b' -or $html -match 'style=') { throw "Trip Planner must not use inline styles" }
& node --check $controllerPath
if ($LASTEXITCODE -ne 0) { throw "trip-planner.js syntax check failed" }
Write-Host "Trip Planner page contract verification passed."
