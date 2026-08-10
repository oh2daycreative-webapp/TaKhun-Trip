$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root "public"

$required = @(
  "public/index.html",
  "public/foundation-preview.html",
  "public/map.html",
  "public/routes.html",
  "public/route-detail.html",
  "public/places.html",
  "public/place-detail.html",
  "public/trip-planner.html",
  "public/products.html",
  "public/product-detail.html",
  "public/events.html",
  "public/event-detail.html",
  "public/gallery.html",
  "public/favorites.html",
  "public/about.html",
  "public/search.html",
  "public/404.html",
  "public/admin/login.html",
  "public/admin/dashboard.html",
  "public/admin/places.html",
  "public/admin/routes.html",
  "public/admin/products.html",
  "public/admin/events.html",
  "public/admin/reviews.html",
  "public/admin/gallery.html",
  "public/admin/settings.html",
  "public/admin/404.html",
  "public/css/main.css",
  "public/css/components.css",
  "public/css/mobile.css",
  "public/css/admin.css",
  "public/css/map.css",
  "public/js/config.js",
  "public/js/api.js",
  "public/js/i18n.js",
  "public/js/app.js",
  "public/js/content-data.js",
  "public/js/media.js",
  "public/js/home.js",
  "public/js/search.js",
  "public/js/gallery.js",
  "public/js/favorites.js",
  "public/admin/js/admin-api.js",
  "public/admin/js/admin-auth.js",
  "public/admin/js/admin-shell.js",
  "public/favicon.svg",
  "public/assets/media/placeholders/hero.svg",
  "public/assets/media/placeholders/cover.svg",
  "public/assets/media/placeholders/product.svg",
  "public/assets/media/placeholders/gallery.svg",
  "public/assets/media/manifest/media-manifest.json",
  "apps-script/Code.gs",
  "apps-script/Config.gs",
  "apps-script/CryptoService.gs",
  "apps-script/AuthService.gs",
  "apps-script/Router.gs",
  "apps-script/ApiResponse.gs",
  "apps-script/SheetService.gs",
  "apps-script/AdminPlaceSchema.gs",
  "apps-script/AdminPlaceService.gs",
  "apps-script/SettingsService.gs",
  "apps-script/CategoryService.gs",
  "apps-script/PlaceService.gs",
  "apps-script/RouteService.gs",
  "apps-script/ProductService.gs",
  "apps-script/EventService.gs",
  "apps-script/GalleryService.gs"
  "apps-script/HomeService.gs"
  "apps-script/ReviewService.gs"
  "apps-script/SearchService.gs"
  "scripts/test-admin-place-schema.js",
  "scripts/test-admin-place-service.js"
)

$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
if ($missing.Count -gt 0) {
  throw "Missing required files: $($missing -join ', ')"
}

$htmlFiles = Get-ChildItem -LiteralPath $public -Filter "*.html" -File -Recurse
$allowedHtml = @($required | Where-Object { $_ -like "*.html" } | ForEach-Object {
  [IO.Path]::GetFullPath((Join-Path $root $_))
})
$unexpected = @($htmlFiles.FullName | Where-Object { $_ -notin $allowedHtml })
if ($unexpected.Count -gt 0) {
  throw "Unexpected HTML routes: $($unexpected -join ', ')"
}

foreach ($html in $htmlFiles) {
  $content = Get-Content -Raw -Encoding utf8 -LiteralPath $html.FullName
  foreach ($requirement in @(
    @{ Pattern = '<meta charset="UTF-8">'; Name = '<meta charset="UTF-8">' },
    @{ Pattern = 'name="viewport"'; Name = 'name="viewport"' },
    @{ Pattern = '<title(?:\s[^>]*)?>'; Name = '<title>' },
    @{ Pattern = '<main'; Name = '<main' }
  )) {
    if ($content -notmatch $requirement.Pattern) {
      throw "$($html.FullName) is missing $($requirement.Name)"
    }
  }

  $matches = [regex]::Matches($content, '(?:href|src)="([^"#?]+)"')
  foreach ($match in $matches) {
    $reference = $match.Groups[1].Value
    if ($reference -match '^(?:https?:|mailto:|tel:)') { continue }
    $target = [IO.Path]::GetFullPath((Join-Path $html.DirectoryName $reference))
    if (-not (Test-Path -LiteralPath $target)) {
      throw "$($html.FullName) has a broken local reference: $reference"
    }
  }
}

& (Join-Path $PSScriptRoot "test-home.ps1")
& (Join-Path $PSScriptRoot "test-content-safety.ps1")
& node (Join-Path $PSScriptRoot "test-media.js")
if ($LASTEXITCODE -ne 0) { throw "Media pipeline verification failed." }
& node (Join-Path $PSScriptRoot "test-content-data.js")
if ($LASTEXITCODE -ne 0) { throw "Canonical content data verification failed." }
& node (Join-Path $PSScriptRoot "test-content-integration.js")
if ($LASTEXITCODE -ne 0) { throw "Public content integration verification failed." }
& node (Join-Path $PSScriptRoot "test-home.js")
if ($LASTEXITCODE -ne 0) { throw "Home behavior verification failed." }
& (Join-Path $PSScriptRoot "test-public-shell.ps1")
& (Join-Path $PSScriptRoot "test-search.ps1")
& node (Join-Path $PSScriptRoot "test-search.js")
if ($LASTEXITCODE -ne 0) { throw "Search behavior verification failed." }
& (Join-Path $PSScriptRoot "test-foundation.ps1")
& (Join-Path $PSScriptRoot "test-places.ps1")
& node (Join-Path $PSScriptRoot "test-reviews.js")
if ($LASTEXITCODE -ne 0) { throw "Public Reviews behavior verification failed." }
& (Join-Path $PSScriptRoot "test-reviews.ps1")
& (Join-Path $PSScriptRoot "test-place-detail.ps1")
& (Join-Path $PSScriptRoot "test-map.ps1")
& (Join-Path $PSScriptRoot "test-routes.ps1")
& (Join-Path $PSScriptRoot "test-trip-planner.ps1")
& (Join-Path $PSScriptRoot "test-products.ps1")
& (Join-Path $PSScriptRoot "test-events.ps1")
& (Join-Path $PSScriptRoot "test-gallery.ps1")
& (Join-Path $PSScriptRoot "test-favorites.ps1")
& (Join-Path $PSScriptRoot "test-about.ps1")
& (Join-Path $PSScriptRoot "test-404.ps1")
& node (Join-Path $PSScriptRoot "test-i18n.js")
if ($LASTEXITCODE -ne 0) { throw "i18n behavior verification failed." }
& node (Join-Path $PSScriptRoot "test-api.js")
if ($LASTEXITCODE -ne 0) { throw "Public API client behavior verification failed." }
& node (Join-Path $PSScriptRoot "test-admin-api.js")
if ($LASTEXITCODE -ne 0) { throw "Admin API transport verification failed." }
& node (Join-Path $PSScriptRoot "test-admin-auth.js")
if ($LASTEXITCODE -ne 0) { throw "Admin browser auth verification failed." }
& node (Join-Path $PSScriptRoot "test-admin-shell.js")
if ($LASTEXITCODE -ne 0) { throw "Admin shell verification failed." }
& node (Join-Path $PSScriptRoot "test-crypto-service.js")
if ($LASTEXITCODE -ne 0) { throw "CryptoService verification failed." }
& node (Join-Path $PSScriptRoot "test-auth-service.js")
if ($LASTEXITCODE -ne 0) { throw "AuthService verification failed." }
& node (Join-Path $PSScriptRoot "test-sheet-service.js")
if ($LASTEXITCODE -ne 0) { throw "SheetService verification failed." }
& node (Join-Path $PSScriptRoot "test-admin-place-schema.js")
if ($LASTEXITCODE -ne 0) { throw "Admin Place schema verification failed." }
& node (Join-Path $PSScriptRoot "test-admin-place-service.js")
if ($LASTEXITCODE -ne 0) { throw "Admin Place service verification failed." }
& node (Join-Path $PSScriptRoot "test-admin-schema.js")
if ($LASTEXITCODE -ne 0) { throw "Admin auth schema verification failed." }
& node (Join-Path $PSScriptRoot "test-settings-service.js")
if ($LASTEXITCODE -ne 0) { throw "SettingsService verification failed." }
& node (Join-Path $PSScriptRoot "test-category-service.js")
if ($LASTEXITCODE -ne 0) { throw "CategoryService verification failed." }
& node (Join-Path $PSScriptRoot "test-place-service.js")
if ($LASTEXITCODE -ne 0) { throw "PlaceService and public place API verification failed." }
& node (Join-Path $PSScriptRoot "test-route-service.js")
if ($LASTEXITCODE -ne 0) { throw "RouteService and public route/trip API verification failed." }
& node (Join-Path $PSScriptRoot "test-product-service.js")
if ($LASTEXITCODE -ne 0) { throw "ProductService verification failed." }
& node (Join-Path $PSScriptRoot "test-event-service.js")
if ($LASTEXITCODE -ne 0) { throw "EventService verification failed." }
& node (Join-Path $PSScriptRoot "test-gallery-service.js")
if ($LASTEXITCODE -ne 0) { throw "GalleryService verification failed." }
& node (Join-Path $PSScriptRoot "test-review-service.js")
if ($LASTEXITCODE -ne 0) { throw "ReviewService verification failed." }
& node (Join-Path $PSScriptRoot "test-home-service.js")
if ($LASTEXITCODE -ne 0) { throw "HomeService verification failed." }
& node (Join-Path $PSScriptRoot "test-search-service.js")
if ($LASTEXITCODE -ne 0) { throw "SearchService verification failed." }
& node (Join-Path $PSScriptRoot "test-apps-script.js")
if ($LASTEXITCODE -ne 0) { throw "Apps Script static verification failed." }
& node (Join-Path $PSScriptRoot "test-routes.js")
if ($LASTEXITCODE -ne 0) { throw "Routes behavior verification failed." }
& node (Join-Path $PSScriptRoot "test-trip-planner.js")
if ($LASTEXITCODE -ne 0) { throw "Trip Planner behavior verification failed." }
& node (Join-Path $PSScriptRoot "test-gallery.js")
if ($LASTEXITCODE -ne 0) { throw "Gallery behavior verification failed." }
& node (Join-Path $PSScriptRoot "test-favorites.js")
if ($LASTEXITCODE -ne 0) { throw "Favorites behavior verification failed." }
& node (Join-Path $PSScriptRoot "test-about.js")
if ($LASTEXITCODE -ne 0) { throw "About behavior verification failed." }

Write-Host "Skeleton verification passed: $($required.Count) required files, $($htmlFiles.Count) HTML pages."
