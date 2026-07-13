$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$list = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root "public/routes.html")
$detail = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root "public/route-detail.html")
$controllerPath = Join-Path $root "public/js/routes.js"

if (-not (Test-Path -LiteralPath $controllerPath)) { throw "Missing public/js/routes.js" }
$controller = Get-Content -Raw -Encoding UTF8 -LiteralPath $controllerPath
$i18n = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root "public/js/i18n.js")
$map = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root "public/js/map.js")

foreach ($mount in @("routes-loading", "routes-ready", "routes-empty", "routes-error", "routes-featured", "routes-grid")) {
  if ($list -notmatch "data-$mount") { throw "routes.html missing data-$mount" }
}
foreach ($mount in @("route-detail-loading", "route-detail-ready", "route-detail-invalid", "route-detail-not-found", "route-detail-error", "route-timeline")) {
  if ($detail -notmatch "data-$mount") { throw "route-detail.html missing data-$mount" }
}
foreach ($html in @($list, $detail)) {
  foreach ($script in @("js/config.js", "js/i18n.js", "js/api.js", "js/app.js", "js/routes.js")) {
    if ($html -notmatch [regex]::Escape("src=`"$script`"")) { throw "Route page missing $script" }
  }
  if ($html -notmatch 'data-public-shell') { throw "Route page must reuse the public shell" }
}

if ($controller -match 'fetch\s*\(') { throw "routes.js must use the central API client instead of fetch" }
foreach ($action in @("getRoutes", "getRouteDetail")) {
  if ($controller -notmatch $action) { throw "routes.js must use $action" }
}

foreach ($namespace in @("routes_page", "route_detail")) {
  $count = ([regex]::Matches($i18n, "(?m)^\s{6}${namespace}:\s*\{")).Count
  if ($count -ne 2) { throw "i18n namespace $namespace must appear exactly once in Thai and once in English" }
}
if ($map -notmatch 'params\.get\("focus"\)' -or $map -notmatch 'params\.get\("route"\)') {
  throw "Map focus and route query parsing must remain intact"
}
foreach ($forbidden in @("React", "Vue", "Tailwind", "Bootstrap", "jQuery")) {
  if ($list -match $forbidden -or $detail -match $forbidden -or $controller -match $forbidden) { throw "Forbidden dependency detected: $forbidden" }
}

& node --check (Join-Path $root "public/js/api.js")
if ($LASTEXITCODE -ne 0) { throw "api.js syntax check failed" }
& node --check $controllerPath
if ($LASTEXITCODE -ne 0) { throw "routes.js syntax check failed" }
& node --check (Join-Path $root "public/js/i18n.js")
if ($LASTEXITCODE -ne 0) { throw "i18n.js syntax check failed" }
foreach ($url in @("route-detail.html?id=", "map.html?route=", "trip-planner.html?from_route=", "place-detail.html?id=")) {
  if ($controller -notmatch [regex]::Escape($url)) { throw "routes.js missing URL contract $url" }
}

Write-Host "Routes page contract verification passed."
