$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$listPath = Join-Path $root "public/events.html"
$detailPath = Join-Path $root "public/event-detail.html"
$controllerPath = Join-Path $root "public/js/events.js"
$apiPath = Join-Path $root "public/js/api.js"
$i18nPath = Join-Path $root "public/js/i18n.js"
$componentsPath = Join-Path $root "public/css/components.css"

foreach ($path in @($listPath, $detailPath, $controllerPath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing required Events file: $path" }
}

$list = Get-Content -Raw -Encoding UTF8 -LiteralPath $listPath
$detail = Get-Content -Raw -Encoding UTF8 -LiteralPath $detailPath
$controller = Get-Content -Raw -Encoding UTF8 -LiteralPath $controllerPath
$api = Get-Content -Raw -Encoding UTF8 -LiteralPath $apiPath
$i18n = Get-Content -Raw -Encoding UTF8 -LiteralPath $i18nPath
$components = Get-Content -Raw -Encoding UTF8 -LiteralPath $componentsPath

if ($list -match 'class="placeholder"' -or $detail -match 'class="placeholder"') { throw "Events pages must not retain placeholders." }
if ($list -notmatch 'class="[^"]*events-page' -or $detail -notmatch 'class="[^"]*event-detail-page') { throw "Events pages need scoped body classes." }

foreach ($mount in @("events-loading", "events-ready", "events-empty", "events-filtered-empty", "events-invalid-filter", "events-error", "events-grid")) {
  if ($list -notmatch "data-$mount") { throw "events.html missing data-$mount" }
}
foreach ($mount in @("event-detail-loading", "event-detail-ready", "event-detail-missing", "event-detail-invalid", "event-detail-not-found", "event-detail-error")) {
  if ($detail -notmatch "data-$mount") { throw "event-detail.html missing data-$mount" }
}
foreach ($filter in @("type", "month")) {
  if ($list -notmatch ('data-event-filter="{0}"' -f $filter)) { throw "events.html missing $filter filter" }
}
foreach ($target in @("events-upcoming-count", "events-past-count")) {
  $targetCount = ([regex]::Matches($list, ('data-{0}\b' -f $target))).Count
  if ($targetCount -ne 1) { throw "events.html must contain exactly one distinct data-$target target; found $targetCount" }
}
if ($list -match 'data-events-summary\b') { throw "A total count must not be mounted inside either Events section heading." }
$ids = [regex]::Matches($list, '\bid="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$duplicateIds = @($ids | Group-Object | Where-Object Count -gt 1)
if ($duplicateIds.Count) { throw "events.html contains duplicate IDs: $($duplicateIds.Name -join ', ')" }

foreach ($html in @($list, $detail)) {
  foreach ($script in @("js/config.js", "js/i18n.js", "js/api.js", "js/app.js", "js/events.js")) {
    if ($html -notmatch [regex]::Escape("src=`"$script`"")) { throw "Events page missing $script" }
  }
  if ($html.IndexOf('src="js/config.js"') -gt $html.IndexOf('src="js/i18n.js"') -or
      $html.IndexOf('src="js/i18n.js"') -gt $html.IndexOf('src="js/api.js"') -or
      $html.IndexOf('src="js/api.js"') -gt $html.IndexOf('src="js/app.js"') -or
      $html.IndexOf('src="js/app.js"') -gt $html.IndexOf('src="js/events.js"')) {
    throw "Events page scripts are not in the established dependency order."
  }
  if ($html -notmatch 'data-public-shell') { throw "Events pages must reuse the public shell." }
  if ($html -match 'on(?:click|change|input)\s*=') { throw "Events pages must not use inline event handlers." }
  if ($html -notmatch 'data-i18n-attr="content:pages\.[^"]+\.description"') { throw "Events pages must use the shared translated page metadata contract." }
}

if ($controller -match 'fetch\s*\(') { throw "events.js must use TakhunApi instead of fetch." }
if ($controller -match '\.innerHTML\s*=') { throw "events.js must use safe DOM APIs." }
foreach ($contract in @("getEvents", "getEventDetail", "encodeURIComponent", "takhun:languagechange", "replaceChildren", "http:", "https:", "tel:")) {
  if ($controller -notmatch [regex]::Escape($contract)) { throw "events.js missing behavior contract $contract" }
}
foreach ($contract in @("createRequestGate", "filtersUrl", "partitionEvents", "callActionLabel")) {
  if ($controller -notmatch $contract) { throw "events.js missing orchestration contract $contract" }
}
foreach ($method in @("getEvents", "getEventDetail")) {
  if ($api -notmatch ('function\s+{0}\b' -f $method)) { throw "api.js missing $method" }
}
foreach ($namespace in @("events", "event_detail")) {
  $count = ([regex]::Matches($i18n, "(?m)^\s{6}${namespace}:\s*\{")).Count
  if ($count -ne 2) { throw "i18n namespace $namespace must appear exactly once in Thai and once in English" }
}
foreach ($selector in @(".events-page", ".event-detail-page", ".event-card")) {
  if ($components -notmatch [regex]::Escape($selector)) { throw "Missing scoped Events CSS $selector" }
}
foreach ($scope in @("events-page", "event-detail-page")) {
  if ($components -notmatch ("(?s)\.{0}\s+\[hidden\]\s*\{{[^}}]*display\s*:\s*none\s*!important" -f $scope)) {
    throw "$scope hidden elements need a page-scoped override."
  }
}
foreach ($forbidden in @("React", "Vue", "Tailwind", "Bootstrap", "jQuery")) {
  if ($list -match $forbidden -or $detail -match $forbidden -or $controller -match $forbidden) { throw "Forbidden dependency detected: $forbidden" }
}

& node (Join-Path $PSScriptRoot "test-events.js")
if ($LASTEXITCODE -ne 0) { throw "Events behavior verification failed." }
& node --check $controllerPath
if ($LASTEXITCODE -ne 0) { throw "events.js syntax check failed." }

Write-Host "Events page contract verification passed."
