$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $root "public/favorites.html"
$jsPath = Join-Path $root "public/js/favorites.js"
$cssPath = Join-Path $root "public/css/components.css"
$i18nPath = Join-Path $root "public/js/i18n.js"

foreach ($path in @($htmlPath, $jsPath)) { if (-not (Test-Path -LiteralPath $path)) { throw "Missing Favorites file: $path" } }
$html = Get-Content -Raw -Encoding utf8 -LiteralPath $htmlPath
$js = Get-Content -Raw -Encoding utf8 -LiteralPath $jsPath
$css = Get-Content -Raw -Encoding utf8 -LiteralPath $cssPath
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath $i18nPath

foreach ($pattern in @('class="public-page favorites-page"', 'data-public-shell', 'data-favorites-grid', 'js/favorites.js')) { if ($html -notmatch [regex]::Escape($pattern)) { throw "Favorites HTML missing contract: $pattern" } }
if ($html -match '<form[^>]+upload|on(?:click|change|submit)=') { throw "Favorites HTML contains a forbidden inline/upload contract." }
if ($js -match '\bfetch\s*\(') { throw "Favorites must use TakhunApi instead of fetch." }
if ($js -match '\.innerHTML\s*=') { throw "Favorites must not assign innerHTML." }
if ($js -notmatch 'TAKHUN_FAVORITES') { throw "Favorites storage key is missing." }
if ($js -match 'TakhunApi\.(?:saveFavorite|createFavorite|updateFavorite)\s*\(') { throw "Favorites must not call a backend save action." }
foreach ($pattern in @('.favorites-page [hidden]', '.favorites-page')) { if ($css -notmatch [regex]::Escape($pattern)) { throw "Missing scoped Favorites CSS: $pattern" } }
foreach ($pattern in @('favorites:', 'storage_recovered', 'partial_error', 'remove_saved')) { if ($i18n -notmatch [regex]::Escape($pattern)) { throw "Missing Favorites i18n contract: $pattern" } }
node --check $jsPath
if ($LASTEXITCODE -ne 0) { throw "Favorites JavaScript syntax failed." }
Write-Host "Favorites page contract verification passed."
