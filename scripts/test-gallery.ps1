$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $root "public/gallery.html"
$jsPath = Join-Path $root "public/js/gallery.js"
$cssPath = Join-Path $root "public/css/components.css"
$i18nPath = Join-Path $root "public/js/i18n.js"

foreach ($path in @($htmlPath, $jsPath)) { if (-not (Test-Path -LiteralPath $path)) { throw "Missing Gallery file: $path" } }
$html = Get-Content -Raw -Encoding utf8 -LiteralPath $htmlPath
$js = Get-Content -Raw -Encoding utf8 -LiteralPath $jsPath
$css = Get-Content -Raw -Encoding utf8 -LiteralPath $cssPath
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath $i18nPath

foreach ($pattern in @('class="public-page gallery-page"', 'data-public-shell', 'data-gallery-grid', 'role="dialog"', 'aria-modal="true"', 'js/gallery.js')) { if ($html -notmatch [regex]::Escape($pattern)) { throw "Gallery HTML missing contract: $pattern" } }
if ($html -match '<iframe|<form[^>]+upload|on(?:click|change|submit)=') { throw "Gallery HTML contains a forbidden inline/upload/embed contract." }
if ($js -match '\bfetch\s*\(') { throw "Gallery must use TakhunApi instead of fetch." }
if ($js -match '\.innerHTML\s*=') { throw "Gallery must not assign innerHTML." }
if ($js -match 'createElement\s*\(\s*["'']iframe') { throw "Gallery must not create iframes." }
foreach ($pattern in @('.gallery-page [hidden]', '.gallery-page')) { if ($css -notmatch [regex]::Escape($pattern)) { throw "Missing scoped Gallery CSS: $pattern" } }
foreach ($pattern in @('gallery:', 'external_video', 'invalid_filter', 'close_viewer')) { if ($i18n -notmatch [regex]::Escape($pattern)) { throw "Missing Gallery i18n contract: $pattern" } }
node --check $jsPath
if ($LASTEXITCODE -ne 0) { throw "Gallery JavaScript syntax failed." }
Write-Host "Gallery page contract verification passed."
