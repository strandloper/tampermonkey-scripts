<#
.SYNOPSIS
    Replaces a Flickr alias across every userscript in this repo and bumps
    the @version of any file that changes.

.EXAMPLE
    .\Replace-FlickrAlias.ps1 strandloper sierrajulietcharlie
#>
param(
    [Parameter(Mandatory, Position = 0)]
    [string]$oldAlias,

    [Parameter(Mandatory, Position = 1)]
    [string]$newAlias
)

if ([string]::IsNullOrWhiteSpace($oldAlias) -or [string]::IsNullOrWhiteSpace($newAlias)) {
    Write-Error "Both oldAlias and newAlias must be non-empty."
    exit 1
}

if ($oldAlias -eq $newAlias) {
    Write-Error "oldAlias and newAlias are the same ('$oldAlias') - nothing to do."
    exit 1
}

$versionLinePattern = '(// @version\s+)(\d+(?:\.\d+)*)'

function Get-BumpedVersion([string]$version) {
    $parts = $version.Split('.')
    $parts[-1] = [string]([int]$parts[-1] + 1)
    return ($parts -join '.')
}

$updated = @()
$missingVersion = @()

Get-ChildItem -Path $PSScriptRoot -Filter *.js -File | ForEach-Object {
    $file = $_
    $content = Get-Content -Path $file.FullName -Raw
    $newContent = $content.Replace($oldAlias, $newAlias)

    if ($newContent -eq $content) {
        return
    }

    $versionMatch = [regex]::Match($newContent, $versionLinePattern)
    $oldVersion = $null
    $newVersion = $null

    if ($versionMatch.Success) {
        $oldVersion = $versionMatch.Groups[2].Value
        $newVersion = Get-BumpedVersion $oldVersion
        $newContent = [regex]::Replace($newContent, $versionLinePattern, { param($m) $m.Groups[1].Value + $newVersion }, 1)
    } else {
        $missingVersion += $file.Name
    }

    Set-Content -Path $file.FullName -Value $newContent -NoNewline

    $updated += [PSCustomObject]@{
        Name       = $file.Name
        OldVersion = $oldVersion
        NewVersion = $newVersion
    }
}

if ($updated.Count -eq 0) {
    Write-Host "No files contained '$oldAlias' - nothing updated."
    exit 0
}

Write-Host "Updated $($updated.Count) file(s):"
foreach ($u in $updated) {
    if ($u.NewVersion) {
        Write-Host "  $($u.Name) (@version $($u.OldVersion) -> $($u.NewVersion))"
    } else {
        Write-Host "  $($u.Name) (updated but no @version line found to bump)"
    }
}
Write-Host "Re-sync these files in the Tampermonkey dashboard."
