$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $project 'src'
$launcher = Join-Path $app 'launch.ps1'

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Launcher not found: $launcher"
}

& $launcher
