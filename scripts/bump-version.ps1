<#
.SYNOPSIS
  Bump the app version in every place it appears.

.DESCRIPTION
  Updates package.json + package-lock.json (via `npm version`) and the
  "Version X.Y.Z" footer in src/app/admin/page.tsx, all in one step.

.PARAMETER Version
  Either an explicit semver ("1.2.2") or a bump keyword: patch | minor | major.

.EXAMPLE
  .\scripts\bump-version.ps1 patch     # 1.2.1 -> 1.2.2
  .\scripts\bump-version.ps1 minor     # 1.2.1 -> 1.3.0
  .\scripts\bump-version.ps1 1.5.0     # set explicitly
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

# Repo root = parent of this script's folder
$root = Split-Path -Parent $PSScriptRoot
$pkgPath  = Join-Path $root "package.json"
$pagePath = Join-Path $root "src\app\admin\page.tsx"

# --- Resolve target version -------------------------------------------------
$current = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version
Write-Host "Current version: $current" -ForegroundColor DarkGray

if ($Version -in @("patch", "minor", "major")) {
    $parts = $current.Split(".")
    [int]$maj = $parts[0]; [int]$min = $parts[1]; [int]$pat = $parts[2]
    switch ($Version) {
        "major" { $maj++; $min = 0; $pat = 0 }
        "minor" { $min++; $pat = 0 }
        "patch" { $pat++ }
    }
    $target = "$maj.$min.$pat"
} else {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version must be 'patch', 'minor', 'major', or an explicit semver like 1.2.3 (got '$Version')."
    }
    $target = $Version
}

Write-Host "New version:     $target" -ForegroundColor Cyan

# --- package.json + package-lock.json --------------------------------------
# npm version updates both and refuses if they disagree; --no-git-tag-version
# skips the git commit/tag so this stays a plain file edit.
Push-Location $root
try {
    npm version $target --no-git-tag-version --allow-same-version | Out-Null
} finally {
    Pop-Location
}

# --- Admin footer -----------------------------------------------------------
$page = Get-Content $pagePath -Raw
$pattern = 'Version \d+\.\d+\.\d+'
if ($page -notmatch $pattern) {
    Write-Warning "No 'Version X.Y.Z' footer found in $pagePath - left unchanged."
} else {
    $updated = [regex]::Replace($page, $pattern, "Version $target")
    # Preserve the file's existing line endings (LF) instead of Set-Content's CRLF.
    [System.IO.File]::WriteAllText($pagePath, $updated)
    Write-Host "Updated admin footer." -ForegroundColor Green
}

Write-Host "Done. Bumped to $target." -ForegroundColor Green
