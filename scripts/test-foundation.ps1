$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$main = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/main.css")
$components = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/components.css")
$mobile = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root "public/css/mobile.css")
$previewPath = Join-Path $root "public/foundation-preview.html"
$css = $main + "`n" + $components + "`n" + $mobile

function Assert-Contains {
  param([string]$Content, [string]$Pattern, [string]$Message)
  if ($Content -notmatch $Pattern) { throw $Message }
}

function Assert-Token {
  param([string]$Name)
  Assert-Contains $main ("--{0}\s*:" -f [regex]::Escape($Name)) "Missing foundation token --$Name."
}

foreach ($token in @(
  "color-divider", "color-success", "color-warning", "color-error", "color-info",
  "space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-8", "space-10", "space-12", "space-16",
  "radius-pill", "shadow-floating", "shadow-glow", "shadow-focus",
  "font-family-base", "font-size-xs", "font-size-sm", "font-size-base", "font-size-lg", "font-size-xl", "font-size-2xl", "font-size-3xl",
  "line-height-tight", "line-height-base", "line-height-relaxed",
  "transition-fast", "transition-base", "transition-slow", "ease-standard",
  "z-base", "z-sticky", "z-dropdown", "z-overlay", "z-modal", "z-toast",
  "container-max", "container-padding-mobile", "container-padding-desktop",
  "breakpoint-sm", "breakpoint-md", "breakpoint-lg", "breakpoint-xl"
)) { Assert-Token $token }

foreach ($selector in @(
  ".sr-only", ".visually-hidden", ".container", ".stack", ".cluster", ".grid",
  ".button--primary", ".button--secondary", ".button--ghost", ".button--danger", ".button--icon", ".button--link",
  ".badge", ".badge--success", ".badge--warning", ".badge--danger", ".badge--info",
  ".chip", ".chip.is-active", ".card", ".card__header", ".card__body", ".card__footer",
  ".loading-state", ".loading-spinner", ".skeleton", ".skeleton-card",
  ".empty-state__title", ".empty-state__description", ".empty-state__action",
  ".error-state", ".error-state__title", ".error-state__description", ".error-state__action",
  ".alert", ".alert--success", ".alert--warning", ".alert--error", ".alert--info",
  ".toast-container", ".toast-message", ".toast-message--success", ".toast-message--error", ".toast-message--warning", ".toast-message--info"
)) {
  Assert-Contains $css ([regex]::Escape($selector)) "Missing shared foundation selector $selector."
}

Assert-Contains $main 'textarea\s*,\s*select' "Base styles must cover textarea and select controls."
Assert-Contains $main 'img\s*,\s*svg\s*,\s*video' "Base media styles must cover video."
Assert-Contains $main 'table\s*\{' "Base styles must cover tables."
Assert-Contains $main ':focus-visible' "Keyboard focus must remain visible."
Assert-Contains $main '@media\s*\(prefers-reduced-motion:\s*reduce\)' "Reduced motion support is required."
Assert-Contains $components '\.button[^}]*min-height\s*:\s*(?:44|4[5-9]|[5-9][0-9])px' "Shared buttons must keep a mobile-friendly tap target."

if ($main -match '(?:html|body)\s*\{[^}]*overflow-x\s*:\s*hidden') {
  throw "Foundation CSS must not hide horizontal overflow on html or body."
}

foreach ($legacySelector in @(".page-container", ".page-shell", ".button", ".section-heading", ".empty-state", ".site-header", ".mobile-drawer", ".bottom-nav")) {
  Assert-Contains $css ([regex]::Escape($legacySelector)) "Existing Home selector $legacySelector must be preserved."
}

if (-not (Test-Path -LiteralPath $previewPath)) {
  throw "Missing public/foundation-preview.html visual QA page."
}

$preview = Get-Content -Raw -Encoding utf8 -LiteralPath $previewPath
Assert-Contains $preview '<meta\s+name="robots"\s+content="noindex,nofollow"' "Preview page must be noindex,nofollow."
Assert-Contains $preview '<link\s+rel="stylesheet"\s+href="css/main\.css"' "Preview page must load local main.css."
Assert-Contains $preview '<link\s+rel="stylesheet"\s+href="css/components\.css"' "Preview page must load local components.css."

if ($preview -match '(?:href|src)="(?:https?:)?//' -or $preview -match '<script\b' -or $preview -match '\sstyle="') {
  throw "Preview page must not use external URLs, scripts, or inline styles."
}

foreach ($example in @(
  "buttons", "button-disabled", "icon-button", "badges", "chips", "card",
  "loading-spinner", "skeleton", "empty-state", "error-state", "alerts",
  "toasts", "form-controls", "table", "focus-visible", "reduced-motion"
)) {
  Assert-Contains $preview ('data-preview="{0}"' -f [regex]::Escape($example)) "Preview page is missing the $example example."
}

foreach ($variant in @(
  "button--primary", "button--secondary", "button--ghost", "button--danger", "button--icon", "button--link",
  "badge--success", "badge--warning", "badge--danger", "badge--info", "badge--muted",
  "alert--success", "alert--warning", "alert--error", "alert--info",
  "toast-message--success", "toast-message--error", "toast-message--warning", "toast-message--info"
)) {
  Assert-Contains $preview ([regex]::Escape($variant)) "Preview page is missing component variant $variant."
}

if ($preview -match '(?i)(api[_-]?key|password|passwd|access[_-]?token|client[_-]?secret|private[_-]?key|TAKHUN_(?:LANG|FAVORITES|TRIP_PLAN|RECENT_PLACES|ADMIN_SESSION))') {
  throw "Preview page must not contain secrets, credentials, storage values, or production data keys."
}

Write-Host "CSS foundation verification passed."
