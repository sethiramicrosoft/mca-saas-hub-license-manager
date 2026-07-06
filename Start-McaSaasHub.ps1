<#
.SYNOPSIS
    Starts the local MCA SaaS Hub License Manager UI/API.
#>

param(
    [int]$Port = 3333,
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Run .\Install-McaSaasHub.ps1 first."
}

Push-Location $Root
try {
    $env:PORT = [string]$Port
    $url = "http://localhost:$Port"
    Write-Host "Starting MCA SaaS Hub License Manager on $url"
    if ($OpenBrowser) {
        Start-Process $url
    }
    npm start
}
finally {
    Pop-Location
}
