$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root "public"
$app = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "js/app.js")
$i18n = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "js/i18n.js")
$main = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "css/main.css")
$components = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "css/components.css")
$mobile = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "css/mobile.css")

function Assert-Match {
  param([string]$Content, [string]$Pattern, [string]$Message)
  if ($Content -notmatch $Pattern) { throw $Message }
}

$shellPages = @(
  "index.html", "map.html", "routes.html", "route-detail.html", "places.html",
  "place-detail.html", "trip-planner.html", "products.html", "product-detail.html",
  "events.html", "event-detail.html", "gallery.html", "favorites.html", "about.html"
)

foreach ($page in $shellPages) {
  $html = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public $page)
  Assert-Match $html 'name="viewport"[^>]*viewport-fit=cover' "$page must enable safe-area viewport fitting."
  Assert-Match $html 'class="[^"]*public-page' "$page must opt into public shell spacing."
  Assert-Match $html 'class="skip-link"\s+href="#main-content"' "$page must include a skip link."
  Assert-Match $html 'data-public-shell' "$page must include the shared shell mount."
  Assert-Match $html 'class="shell-fallback"[^>]*href="index\.html"' "$page must keep a usable Home fallback while JavaScript loads."
  Assert-Match $html '<title\s+data-i18n="pages\.[^"]+\.title"' "$page must expose a translated page title."
  Assert-Match $html 'meta\s+name="description"[^>]*data-i18n-attr="content:pages\.[^"]+\.description"' "$page must expose a translated meta description."
  Assert-Match $html '<main[^>]*id="main-content"' "$page must expose the main landmark target."
  Assert-Match $html 'class="[^"]*bottom-nav-space' "$page must reserve mobile bottom navigation space."
}

$notFound = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $public "404.html")
Assert-Match $notFound 'class="skip-link"\s+href="#main-content"' "404 must include a skip link."
Assert-Match $notFound '<main[^>]*id="main-content"' "404 must expose the main landmark target."
Assert-Match $notFound 'href="index\.html"' "404 must provide a clear Home link."
if ($notFound -match 'data-public-shell') { throw "404 must not render potentially misleading global navigation." }

foreach ($required in @(
  'PUBLIC_NAVIGATION', 'renderPublicShell', 'resolvePublicNavigation',
  'index\.html', 'map\.html', 'trip-planner\.html', 'favorites\.html',
  'routes\.html', 'places\.html', 'products\.html', 'events\.html',
  'gallery\.html', 'about\.html', 'aria-expanded', 'aria-current',
  'trapDrawerFocus', 'lastDrawerTrigger', 'Escape'
)) {
  Assert-Match $app $required "app.js is missing public shell behavior: $required"
}

if ($app -match 'search\.html') { throw "Prompt 1.2 must not create or link to search.html." }
if ($app -match 'localStorage') { throw "Prompt 1.2 shell must not write language state to Local Storage." }
if ($app -match 'TAKHUN_LANG') { throw "app.js must not own the language storage contract." }
Assert-Match $i18n 'LANG_STORAGE_KEY\s*=\s*"TAKHUN_LANG"' "i18n.js must own the TAKHUN_LANG contract."
Assert-Match $app 'TakhunI18n\?\.applyTranslations\(mount\)' "The rendered shell must be translated after mounting."
Assert-Match $app '<header[\s\S]*class="[^"]*language-switcher[^"]*"\s+role="group"[\s\S]*class="menu-toggle"' "The Header must expose the language group before the menu toggle."
if ($app -match '<aside[\s\S]*class="[^"]*language-switcher') { throw "The Drawer must not duplicate the language switcher." }
$languageSwitcherCount = [regex]::Matches($app, 'class="[^"]*language-switcher(?:\s|\")').Count
if ($languageSwitcherCount -ne 1) { throw "The shell must render exactly one language switcher; found $languageSwitcherCount." }
Assert-Match $app 'data-lang="th"[^>]*aria-pressed="true"' "The Thai language button must expose its initial active state."
Assert-Match $app 'data-lang="en"[^>]*aria-pressed="false"' "The English language button must expose its initial inactive state."
if ($app -match 'language-preview|data-lang="(?:th|en)"[^>]*disabled') { throw "Language controls must be enabled." }
Assert-Match $mobile '\.header-language-switcher' "Mobile CSS must provide a compact Header language switcher."
Assert-Match $mobile '\.hero-section__content\s*\{[^}]*display\s*:\s*(?:flex|grid)' "Mobile Hero text must use an explicit normal-flow layout."
Assert-Match $mobile '\.hero-section__eyebrow-text\s*\{[^}]*width\s*:\s*(?:fit-content|auto)' "The Hero eyebrow text must retain a readable width."
if ($mobile -match '\.hero-section__eyebrow\s+span\s*\{[^}]*width\s*:\s*30px') { throw "Hero eyebrow text must not inherit decorative line dimensions." }
if (($components + $mobile) -match '\.hero-section\s*\{[^}]*overflow\s*:\s*hidden') { throw "Hero text must not be hidden to mask overflow." }
if ($mobile -match '\.(?:hero-section__eyebrow|hero-section\s+h1|hero-section__description)\s*\{[^}]*position\s*:\s*absolute') { throw "Mobile Hero text must stay in normal document flow." }

Assert-Match $components '\.public-shell' "Shared component CSS must style the public shell mount."
Assert-Match $components '\.public-shell\.is-ready\s*\{[^}]*display\s*:\s*contents' "Rendered shell wrapper must not constrain the sticky header."
Assert-Match $mobile '\.mobile-drawer__nav>a\.is-active' "The active secondary destination must be visible in the drawer."
Assert-Match $mobile '\.bottom-nav-space' "Mobile CSS must reserve bottom navigation space on all shell pages."
Assert-Match $mobile 'safe-area-inset-bottom' "Mobile shell must account for the bottom safe area."
Assert-Match ($main + $components) ':focus-visible' "Shell controls must expose keyboard focus."

if (($main + $components + $mobile) -match '(?:html|body)\s*\{[^}]*overflow-x\s*:\s*hidden') {
  throw "Horizontal overflow must be fixed, not hidden globally."
}

Write-Host "Public shell contract verification passed for $($shellPages.Count) navigable pages plus 404."
