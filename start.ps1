$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $project 'src'
$launcher = Join-Path $app 'launch.ps1'
$desktopMain = Join-Path $app 'desktop\main.js'
$electronCandidates = @(
    (Join-Path $app 'node_modules\electron\dist\electron.exe'),
    (Join-Path (Split-Path -Parent $project) 'anygen-workbench\node_modules\electron\dist\electron.exe')
)
$electron = $electronCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if ($electron -and (Test-Path -LiteralPath $desktopMain)) {
    Start-Process -FilePath $electron -ArgumentList $desktopMain -WorkingDirectory $app
    exit
}

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Launcher not found: $launcher"
}

& $launcher
