<#
.SYNOPSIS
    Installs prerequisites and prepares the MCA SaaS Hub License Manager package.

.DESCRIPTION
    This script is intended for customer workstation setup. It checks for Azure CLI,
    Node.js, and npm. If winget is available, it can install missing prerequisites.
    It then installs npm packages and builds the local UI/API.

    The PowerShell-only path still requires Azure CLI, because the standalone script
    uses az login and ARM tokens.
#>

param(
    [switch]$SkipWingetInstall
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WithWinget {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($SkipWingetInstall) {
        throw "$Name is missing. Install it manually or rerun without -SkipWingetInstall."
    }

    if (-not (Test-Command winget)) {
        throw "$Name is missing and winget is not available. Install $Name manually, then rerun this script."
    }

    Write-Host "Installing $Name with winget..."
    winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
}

Write-Host "MCA SaaS Hub License Manager setup"
Write-Host "Package: $Root"

if (-not (Test-Command az)) {
    Install-WithWinget -Id 'Microsoft.AzureCLI' -Name 'Azure CLI'
}

if (-not (Test-Command node)) {
    Install-WithWinget -Id 'OpenJS.NodeJS.LTS' -Name 'Node.js LTS'
}

if (-not (Test-Command npm)) {
    throw "npm is missing. Install Node.js LTS, close and reopen PowerShell, then rerun this script."
}

Push-Location $Root
try {
    Write-Host "Installing npm packages..."
    npm install

    Write-Host "Building local UI/API..."
    npm run build

    Write-Host ""
    Write-Host "Setup complete."
    Write-Host "Next steps:"
    Write-Host "  1. Run: az login"
    Write-Host "  2. Run: .\Start-McaSaasHub.ps1"
    Write-Host "  3. Open: http://localhost:3333"
    Write-Host ""
    Write-Host "Script-only usage:"
    Write-Host "  .\scripts\McaSaasHub.ps1 -Action ExportInventory -OutputPath .\inventory.csv"
}
finally {
    Pop-Location
}
