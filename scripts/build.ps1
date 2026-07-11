$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "test.ps1")

$public = Join-Path (Split-Path -Parent $PSScriptRoot) "public"
if (-not (Test-Path -LiteralPath (Join-Path $public "index.html"))) {
  throw "Static output is missing public/index.html"
}

Write-Host "Static build check passed. Deploy the public directory directly to Cloudflare Pages."
