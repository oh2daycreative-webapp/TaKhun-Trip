$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $root "public/404.html"
$cssPath = Join-Path $root "public/css/components.css"
$i18nPath = Join-Path $root "public/js/i18n.js"

foreach ($path in @($htmlPath, $cssPath, $i18nPath)) { if (-not (Test-Path -LiteralPath $path)) { throw "Missing 404 file: $path" } }
$html = Get-Content -Raw -Encoding utf8 -LiteralPath $htmlPath
$css = Get-Content -Raw -Encoding utf8 -LiteralPath $cssPath
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath $i18nPath

foreach ($pattern in @(
  'class="public-page not-found-page"', 'data-public-shell', 'data-page="404.html"', '<main', '<section', '<h1',
  'href="index.html"', 'href="places.html"', 'href="map.html"', 'data-i18n="not_found_page.heading"'
)) { if ($html -notmatch [regex]::Escape($pattern)) { throw "404 HTML missing contract: $pattern" } }
if ($html -match 'js/api\.js|js/about\.js|\bfetch\s*\(|http-equiv\s*=\s*["'']refresh|location\.(?:href|replace|assign)|window\.location') { throw "404 contains an API dependency or redirect." }
if ($html -match 'stack trace|internal api|request path|pathname') { throw "404 exposes technical details." }
foreach ($script in @('js/config.js', 'js/i18n.js', 'js/app.js')) { if ($html -notmatch [regex]::Escape($script)) { throw "404 missing shell script: $script" } }
foreach ($pattern in @('.not-found-page', '@media (prefers-reduced-motion:reduce)')) { if ($css -notmatch [regex]::Escape($pattern)) { throw "Missing scoped 404 CSS: $pattern" } }
foreach ($pattern in @('not_found_page:', 'page_may_have_moved:', 'open_map:')) { if ($i18n -notmatch [regex]::Escape($pattern)) { throw "Missing 404 i18n contract: $pattern" } }
Write-Host "404 page contract verification passed."
