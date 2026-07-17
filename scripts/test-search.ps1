$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root "public"
$htmlPath = Join-Path $public "search.html"
$scriptPath = Join-Path $public "js/search.js"

if (-not (Test-Path -LiteralPath $htmlPath)) { throw "RED: missing public/search.html" }
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "RED: missing public/js/search.js" }

$html = Get-Content -Raw -Encoding utf8 -LiteralPath $htmlPath
$script = Get-Content -Raw -Encoding utf8 -LiteralPath $scriptPath
$app = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "js/app.js")
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "js/i18n.js")
$components = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "css/components.css")
$mobile = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "css/mobile.css")

function Assert-Match {
  param([string]$Content, [string]$Pattern, [string]$Message)
  if ($Content -notmatch $Pattern) { throw $Message }
}

foreach ($contract in @(
  @{ Pattern = '<body class="[^"]*search-page'; Name = 'search page body hook' },
  @{ Pattern = 'data-public-shell\s+data-page="search\.html"'; Name = 'search shell current-page hook' },
  @{ Pattern = '<main[^>]*id="main-content"'; Name = 'main landmark' },
  @{ Pattern = '<form[^>]*method="get"[^>]*action="search\.html"[^>]*role="search"'; Name = 'GET search form' },
  @{ Pattern = '<label[^>]*for="search-query"[^>]*>'; Name = 'visible query label' },
  @{ Pattern = '<input[^>]*id="search-query"[^>]*name="q"'; Name = 'q input' },
  @{ Pattern = 'data-search-results-heading[^>]*data-i18n="search\.results_heading"'; Name = 'dedicated result heading' },
  @{ Pattern = '<button[^>]*type="submit"[^>]*data-i18n="search\.submit"'; Name = 'text submit button' },
  @{ Pattern = 'data-search-state="idle"'; Name = 'idle state' },
  @{ Pattern = 'data-search-state="loading"[^>]*role="status"[^>]*aria-live="polite"'; Name = 'polite loading status' },
  @{ Pattern = 'data-search-state="ready"'; Name = 'ready state' },
  @{ Pattern = 'data-search-state="empty"'; Name = 'empty state' },
  @{ Pattern = 'data-search-state="validation-error"[^>]*role="alert"'; Name = 'validation alert' },
  @{ Pattern = 'data-search-state="request-error"[^>]*role="alert"'; Name = 'request alert' },
  @{ Pattern = 'data-search-summary[^>]*aria-live="polite"'; Name = 'live result summary' },
  @{ Pattern = '<script src="js/config\.js"></script>[\s\S]*<script src="js/i18n\.js"></script>[\s\S]*<script src="js/api\.js"></script>[\s\S]*<script src="js/app\.js"></script>[\s\S]*<script src="js/search\.js"></script>'; Name = 'approved script order' }
)) { Assert-Match $html $contract.Pattern "search.html is missing $($contract.Name)." }
if ($html -match '<input[^>]*name="q"[^>]*maxlength') { throw "The q input must not enforce UTF-16 maxlength; validation counts Unicode code points in search.js." }

# Shared state components use author-level display:grid, so Search needs a scoped
# hidden contract that wins without changing visible state or section-empty layout.
Assert-Match $components '\.loading-state\s*,\s*\.empty-state\s*,\s*\.error-state\s*\{[^}]*display\s*:\s*grid' "The regression fixture must include the shared state display rule."
Assert-Match $components '\.search-page\s+\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}' "Search hidden elements must compute to display:none despite shared state display rules."

$idleTag = [regex]::Match($html, '<section\b[^>]*data-search-state="idle"[^>]*>').Value
if (-not $idleTag -or $idleTag -match '\shidden(?:\s|>|=)') { throw "The initial idle state must remain visible." }
foreach ($state in @('loading', 'validation-error', 'request-error', 'empty', 'ready')) {
  $tag = [regex]::Match($html, "<section\b[^>]*data-search-state=`"$state`"[^>]*>").Value
  if (-not $tag -or $tag -notmatch '\shidden(?:\s|>|=)') { throw "The initial $state state must remain hidden." }
}
$sectionEmptyTags = [regex]::Matches($html, '<p\b[^>]*data-search-section-empty="(?:places|routes|products|events)"[^>]*>')
if ($sectionEmptyTags.Count -ne 4) { throw "All four section-level empty states must remain in the Search contract." }
foreach ($match in $sectionEmptyTags) {
  if ($match.Value -notmatch '\shidden(?:\s|>|=)') { throw "Section-level empty states must start hidden and rely on the same scoped hidden contract." }
}
if ($components -match '\.search-page__section-empty\s*\{[^}]*display\s*:') { throw "Visible section-level empty states must keep their native block layout." }

$sectionPositions = @('data-search-section="places"', 'data-search-section="routes"', 'data-search-section="products"', 'data-search-section="events"') | ForEach-Object { $html.IndexOf($_) }
if ($sectionPositions -contains -1 -or $sectionPositions[0] -ge $sectionPositions[1] -or $sectionPositions[1] -ge $sectionPositions[2] -or $sectionPositions[2] -ge $sectionPositions[3]) {
  throw "Search sections must be ordered Places, Routes, Products, Events."
}

foreach ($token in @('URLSearchParams', 'normalize\("NFC"\)', 'Array\.from', 'pushState', 'popstate', 'takhun:languagechange', 'inFlightKey', 'generation', 'encodeURIComponent', 'replaceChildren', 'textContent', 'once:\s*true')) {
  Assert-Match $script $token "search.js is missing required behavior: $token"
}
if ($script -match '(?:\.innerHTML|insertAdjacentHTML|document\.write)') { throw "search.js must not use HTML string injection." }
Assert-Match $script 'searchAll\(params,\s*\{\s*mock:' "Search must provide the approved local canonical fallback when API_URL is empty."
Assert-Match $script 'TakhunContentData\.searchAll' "Search fallback must use the canonical content repository."

Assert-Match $app 'search\.html' "The public shell must link to search.html."
Assert-Match $app '"search\.nav_label"' "Search navigation must use search.nav_label."
Assert-Match $app '"search\.html"\s*:\s*\{[^}]*secondary:\s*"search"' "Search must expose current-page state."
Assert-Match $app 'const desktopLinks = \[[\s\S]*PUBLIC_NAVIGATION\.secondary\.slice\(0, 1\)' "Desktop navigation must include Search."
Assert-Match $app '<nav class="site-nav"[\s\S]*\$\{desktopLinks\}</nav>[\s\S]*language-switcher' "Desktop navigation must appear before the language switcher."
Assert-Match $app 'secondary:\s*\[\s*\{\s*key:\s*"search"' "Search must be the first mobile drawer destination."

foreach ($key in @(
  'meta_title','meta_description','nav_label','heading','intro','label','placeholder','submit','idle_title','idle_description','loading',
  'results_exact','results_limited','empty_title','empty_description','error_title','error_description','retry','view_details','image_alt','image_fallback',
  'event_date','event_time','event_location','development_fallback'
)) { Assert-Match $i18n "${key}:" "i18n.js is missing search.$key." }
foreach ($section in @('places','routes','products','events')) {
  Assert-Match $i18n "${section}:" "i18n.js is missing search section copy for $section."
}

Assert-Match $components '\.search-page__grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3' "Desktop search results must use three columns."
Assert-Match $mobile '@media \(max-width: 899px\)[\s\S]*\.search-page__grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(2' "Tablet search results must use two columns."
Assert-Match $mobile '@media \(max-width: 599px\)[\s\S]*\.search-page__grid\s*\{[^}]*grid-template-columns\s*:\s*1fr' "Mobile search results must use one column."
Assert-Match ($components + $mobile) 'overflow-wrap\s*:\s*anywhere' "Search result content must wrap safely."
Assert-Match ($components + $mobile) 'aspect-ratio\s*:\s*16\s*/\s*10' "Search images must preserve a 16/10 ratio."
Assert-Match $mobile '@media \(prefers-reduced-motion: reduce\)[\s\S]*search' "Search motion must respect reduced-motion preferences."

Write-Host "Search page contract verification passed."
