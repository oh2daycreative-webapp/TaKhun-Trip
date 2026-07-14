$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $root "public/about.html"
$jsPath = Join-Path $root "public/js/about.js"
$cssPath = Join-Path $root "public/css/components.css"
$i18nPath = Join-Path $root "public/js/i18n.js"

foreach ($path in @($htmlPath, $jsPath, $cssPath, $i18nPath)) { if (-not (Test-Path -LiteralPath $path)) { throw "Missing About file: $path" } }
$html = Get-Content -Raw -Encoding utf8 -LiteralPath $htmlPath
$js = Get-Content -Raw -Encoding utf8 -LiteralPath $jsPath
$css = Get-Content -Raw -Encoding utf8 -LiteralPath $cssPath
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath $i18nPath

foreach ($pattern in @(
  'class="public-page about-page"', 'data-public-shell', 'data-page="about.html"', '<main', 'aria-live="polite"',
  'data-about-state="loading"', 'data-about-state="ready"', 'data-about-state="empty"', 'data-about-state="error"',
  'href="map.html"', 'href="trip-planner.html"', 'href="places.html"', 'js/about.js'
)) { if ($html -notmatch [regex]::Escape($pattern)) { throw "About HTML missing contract: $pattern" } }
if ($html -match '\bfetch\s*\(|on(?:click|change|submit)=') { throw "About HTML contains forbidden inline behavior." }
if ($js -match '\bfetch\s*\(') { throw "About must use TakhunApi instead of fetch." }
if ($js -match '\.innerHTML\s*=') { throw "About must not assign innerHTML." }

$orderedScripts = @('js/config.js', 'js/i18n.js', 'js/api.js', 'js/app.js', 'js/about.js')
$lastIndex = -1
foreach ($script in $orderedScripts) {
  $index = $html.IndexOf($script)
  if ($index -lt 0 -or $index -le $lastIndex) { throw "About script order is invalid at $script" }
  $lastIndex = $index
}

foreach ($pattern in @('.about-page [hidden]', '.about-page', '@media (prefers-reduced-motion:reduce)')) { if ($css -notmatch [regex]::Escape($pattern)) { throw "Missing scoped About CSS: $pattern" } }
foreach ($pattern in @('about_page:', 'project_overview:', 'our_purpose:', 'discover_ban_ta_khun:', 'no_project_information:', 'load_failed:')) { if ($i18n -notmatch [regex]::Escape($pattern)) { throw "Missing About i18n contract: $pattern" } }
node --check $jsPath
if ($LASTEXITCODE -ne 0) { throw "About JavaScript syntax failed." }
Write-Host "About page contract verification passed."
