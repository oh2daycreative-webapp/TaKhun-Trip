$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$contentPath = Join-Path $root "public/js/content-data.js"
$content = Get-Content -Raw -Encoding UTF8 -LiteralPath $contentPath

foreach ($forbidden in @("dateOffset(", "MOCK-EVT", "MOCK-PLACE", "MOCK-ROUTE", "unsplash.com", "example.com")) {
  if ($content.Contains($forbidden)) { throw "Canonical content contains forbidden value: $forbidden" }
}

foreach ($required in @(
  'event_id: "EVENT-HEART-OF-HILLS-2026"',
  'event_date: "2026-07-18"',
  'related_place_id: "BTK-004"',
  'contact_phone: "0848437924"',
  'end_time: ""',
  'latitude: null',
  'longitude: null',
  'function listGallery() { return []; }'
)) {
  if (-not $content.Contains($required)) { throw "Canonical content is missing safety contract: $required" }
}

if (([regex]::Matches($content, '250\s+\u0E1A\u0E32\u0E17')).Count -ne 1) {
  throw "The verified 250-baht price must occur exactly once in the canonical event description."
}
if ($content -match 'price_range:\s*"(?!")') { throw "Canonical products must not expose unverified prices." }
if ($content -match 'image_url:\s*"https?://' -or $content -match 'cover_image_url:\s*"https?://') {
  throw "Milestone 2 canonical content must not include external media."
}
if ($content -match '(?:latitude|longitude):\s*-?\d') { throw "Canonical content must not include unverified numeric coordinates." }

$publicHtml = Get-ChildItem -LiteralPath (Join-Path $root "public") -Filter "*.html" -File
foreach ($html in $publicHtml) {
  if ($html.Name -eq "foundation-preview.html") { continue }
  $source = Get-Content -Raw -Encoding UTF8 -LiteralPath $html.FullName
  foreach ($unsafeCopy in @('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07', '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E32\u0E18\u0E34\u0E15', 'Demo data', 'demo data')) {
    if ($source -match $unsafeCopy) { throw "$($html.Name) exposes stale demo copy matching $unsafeCopy" }
  }
}

Write-Host "Canonical content safety verification passed."
