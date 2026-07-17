$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$listPath = Join-Path $root "public/products.html"
$detailPath = Join-Path $root "public/product-detail.html"
$controllerPath = Join-Path $root "public/js/products.js"
$apiPath = Join-Path $root "public/js/api.js"
$i18nPath = Join-Path $root "public/js/i18n.js"
$componentsPath = Join-Path $root "public/css/components.css"

foreach ($path in @($listPath, $detailPath, $controllerPath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing required product page file: $path" }
}

$list = Get-Content -Raw -Encoding UTF8 -LiteralPath $listPath
$detail = Get-Content -Raw -Encoding UTF8 -LiteralPath $detailPath
$controller = Get-Content -Raw -Encoding UTF8 -LiteralPath $controllerPath
$api = Get-Content -Raw -Encoding UTF8 -LiteralPath $apiPath
$i18n = Get-Content -Raw -Encoding UTF8 -LiteralPath $i18nPath
$components = Get-Content -Raw -Encoding UTF8 -LiteralPath $componentsPath

if ($list -match 'class="placeholder"' -or $detail -match 'class="placeholder"') { throw "Product pages must not retain placeholders." }
if ($list -notmatch 'class="[^"]*products-page' -or $detail -notmatch 'class="[^"]*product-detail-page') { throw "Product pages need scoped body classes." }

foreach ($mount in @("products-loading", "products-ready", "products-empty", "products-filtered-empty", "products-error", "products-grid")) {
  if ($list -notmatch "data-$mount") { throw "products.html missing data-$mount" }
}
foreach ($hiddenMount in @("products-ready", "products-empty", "products-filtered-empty", "products-error")) {
  if ($list -notmatch ("data-{0}[^>]*\bhidden\b" -f $hiddenMount)) { throw "products.html must initially hide data-$hiddenMount" }
}
if ($list -match 'data-products-loading[^>]*\bhidden\b') { throw "products.html must initially show only the loading state" }
foreach ($filter in @("category", "district", "related_place_id")) {
  if ($list -notmatch ('data-product-filter="{0}"' -f $filter)) { throw "products.html missing $filter filter" }
}
foreach ($mount in @("product-detail-loading", "product-detail-ready", "product-detail-invalid", "product-detail-not-found", "product-detail-error")) {
  if ($detail -notmatch "data-$mount") { throw "product-detail.html missing data-$mount" }
}
foreach ($state in @("loading", "ready", "invalid", "not-found", "error")) {
  if ($detail -notmatch ("data-product-{0}" -f $state)) { throw "product-detail.html missing Browser QA state hook data-product-$state" }
}
if ($detail -notmatch 'data-product-contact[^>]*\bhidden\b') { throw "Product contact card must be hidden until a verified contact action is rendered." }

foreach ($html in @($list, $detail)) {
  foreach ($script in @("js/config.js", "js/i18n.js", "js/api.js", "js/app.js", "js/products.js")) {
    if ($html -notmatch [regex]::Escape("src=`"$script`"")) { throw "Product page missing $script" }
  }
  if ($html.IndexOf('src="js/config.js"') -gt $html.IndexOf('src="js/i18n.js"') -or
      $html.IndexOf('src="js/i18n.js"') -gt $html.IndexOf('src="js/api.js"') -or
      $html.IndexOf('src="js/api.js"') -gt $html.IndexOf('src="js/app.js"') -or
      $html.IndexOf('src="js/app.js"') -gt $html.IndexOf('src="js/products.js"')) {
    throw "Product page scripts are not in the established dependency order."
  }
  if ($html -notmatch 'data-public-shell') { throw "Product pages must reuse the public shell." }
  if ($html -match 'on(?:click|change|input)\s*=') { throw "Product pages must not use inline event handlers." }
}

if ($controller -match 'fetch\s*\(') { throw "products.js must use TakhunApi instead of fetch." }
if ($controller -match '\.innerHTML\s*=') { throw "products.js must render untrusted data without assigning innerHTML." }
foreach ($contract in @("getProducts", "getProductDetail", "encodeURIComponent", "takhun:languagechange", "replaceChildren", "http:", "https:", "tel:")) {
  if ($controller -notmatch [regex]::Escape($contract)) { throw "products.js missing behavior contract $contract" }
}
foreach ($method in @("getProducts", "getProductDetail")) {
  if ($api -notmatch ('function\s+{0}\b' -f $method)) { throw "api.js missing $method" }
}
foreach ($namespace in @("products", "product_detail")) {
  $count = ([regex]::Matches($i18n, "(?m)^\s{6}${namespace}:\s*\{")).Count
  if ($count -ne 2) { throw "i18n namespace $namespace must appear exactly once in Thai and once in English" }
}
foreach ($selector in @(".products-page", ".product-detail-page", ".product-card")) {
  if ($components -notmatch [regex]::Escape($selector)) { throw "Missing scoped product CSS $selector" }
}
foreach ($scope in @('products-page', 'product-detail-page')) {
  if ($components -notmatch ("(?s)\.{0}\s+\[hidden\]\s*\{{[^}}]*display\s*:\s*none\s*!important\s*;?[^}}]*\}}" -f $scope)) {
    throw "$scope hidden elements need a page-scoped !important display override so component display rules cannot reveal inactive states."
  }
}
if ($components -match '(?m)^\s*\[hidden\]\s*\{') { throw "Products visibility fix must not add a global hidden override." }
foreach ($forbidden in @("React", "Vue", "Tailwind", "Bootstrap", "jQuery")) {
  if ($list -match $forbidden -or $detail -match $forbidden -or $controller -match $forbidden) { throw "Forbidden dependency detected: $forbidden" }
}

& node (Join-Path $PSScriptRoot "test-products.js")
if ($LASTEXITCODE -ne 0) { throw "Products behavior verification failed." }
& node --check $controllerPath
if ($LASTEXITCODE -ne 0) { throw "products.js syntax check failed." }

Write-Host "Products page contract verification passed."
