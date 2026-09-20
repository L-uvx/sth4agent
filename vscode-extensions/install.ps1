#Requires -Version 5.1
<#
.SYNOPSIS
    Installs every VSCode extension stored in this folder into the local VSCode
    extensions directory.

.DESCRIPTION
    Junction mode (default) links each extension directory back to this
    repository, so the repository stays the single source of truth and
    `git pull` + "Developer: Reload Window" is enough to pick up changes.

    Stale links are removed with [System.IO.Directory]::Delete(path, $false)
    instead of Remove-Item -Recurse, because recursive removal follows a
    junction and would delete the contents of the link target, i.e. this
    repository.

.PARAMETER Mode
    Junction (default) links back to the repository. Copy duplicates the files
    instead, for machines where a junction is not workable.

.PARAMETER ExtensionsDir
    Target extensions directory. Defaults to %USERPROFILE%\.vscode\extensions.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Mode Copy
#>
[CmdletBinding()]
param(
    [ValidateSet('Junction', 'Copy')]
    [string]$Mode = 'Junction',

    [string]$ExtensionsDir = (Join-Path $env:USERPROFILE '.vscode\extensions')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ExtensionsDir)) {
    New-Item -ItemType Directory -Path $ExtensionsDir -Force | Out-Null
}

$sources = @(
    Get-ChildItem -Path $PSScriptRoot -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') }
)

if ($sources.Count -eq 0) {
    Write-Warning "No extension found next to $PSScriptRoot"
    exit 1
}

$installed = 0

foreach ($source in $sources) {
    $manifest = Get-Content -LiteralPath (Join-Path $source.FullName 'package.json') -Raw | ConvertFrom-Json

    if (-not $manifest.publisher -or -not $manifest.name -or -not $manifest.version) {
        Write-Warning "Skipping $($source.Name): package.json needs publisher, name and version."
        continue
    }

    $id = "$($manifest.publisher).$($manifest.name)"
    $target = Join-Path $ExtensionsDir "$id-$($manifest.version)"

    # Drop an earlier version or an earlier link of the same extension.
    Get-ChildItem -Path $ExtensionsDir -Directory -Filter "$id-*" -ErrorAction SilentlyContinue |
        ForEach-Object {
            if ($_.LinkType) {
                [System.IO.Directory]::Delete($_.FullName, $false)
            }
            else {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force
            }
        }

    if ($Mode -eq 'Junction') {
        New-Item -ItemType Junction -Path $target -Target $source.FullName | Out-Null
    }
    else {
        Copy-Item -LiteralPath $source.FullName -Destination $target -Recurse -Force

        # Build output lives in the source tree; an installed copy does not need it.
        Get-ChildItem -Path $target -Filter '*.vsix' -File -ErrorAction SilentlyContinue |
            Remove-Item -Force
    }

    Write-Host ("installed {0}  ->  {1}  [{2}]" -f "$id-$($manifest.version)", $source.Name, $Mode)
    $installed++
}

Write-Host ''
Write-Host "$installed extension(s) installed into $ExtensionsDir"
Write-Host 'Reload the VSCode window to pick them up: Ctrl+Shift+P -> Developer: Reload Window'
