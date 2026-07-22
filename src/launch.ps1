$ErrorActionPreference = 'Stop'

$app = Split-Path -Parent $MyInvocation.MyCommand.Path
$aicodeRoot = $app
1..4 | ForEach-Object { $aicodeRoot = Split-Path -Parent $aicodeRoot }

function Join-Chars([int[]]$codes) {
    return -join ($codes | ForEach-Object { [char]$_ })
}

$runtimeLayer = Join-Chars @(0x8FD0,0x884C,0x6570,0x636E)
$projectName = Join-Chars @(0x6C5F,0x6E56,0x6709,0x65C5,0x4EBA)
$appName = Join-Chars @(0x56FE,0x6587,0x751F,0x4EA7,0x63A7,0x5236,0x53F0)
$runtime = Join-Path $aicodeRoot (Join-Path $runtimeLayer (Join-Path $projectName $appName))
$port = 4327
$log = Join-Path $runtime 'dashboard-server.log'
$err = Join-Path $runtime 'dashboard-server.err.log'

New-Item -ItemType Directory -Path $runtime -Force | Out-Null

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
    Start-Process -FilePath 'node' `
        -ArgumentList 'server.js' `
        -WorkingDirectory $app `
        -WindowStyle Hidden `
        -RedirectStandardOutput $log `
        -RedirectStandardError $err
    Start-Sleep -Seconds 2
}

Start-Process "http://127.0.0.1:$port"
