$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectsRoot = Split-Path -Parent $projectRoot
$integrationRoot = Join-Path $projectRoot "src\integrations"
$workPackageRoot = Join-Path $integrationRoot "work-package"

New-Item -ItemType Directory -Force -Path $integrationRoot, $workPackageRoot | Out-Null

$publicAssets = @(
  @{
    Source = Join-Path $projectsRoot "chatgpt-conversation-tree\src\chatgpt-conversation-tree.user.js"
    Target = Join-Path $integrationRoot "chatgpt-conversation-tree.user.js"
  },
  @{
    Source = "D:\Download\configure_work_package.ps1"
    Target = Join-Path $workPackageRoot "configure_work_package.ps1"
  },
  @{
    Source = "D:\Download\make_work_package.ps1"
    Target = Join-Path $workPackageRoot "make_work_package.ps1"
  }
)

foreach ($asset in $publicAssets) {
  if (Test-Path -LiteralPath $asset.Source) {
    Copy-Item -LiteralPath $asset.Source -Destination $asset.Target -Force
  }
}

# Preserve the existing VBS launchers as parallel fallbacks without depending on localized names.
Get-ChildItem -LiteralPath "D:\Download" -Filter "*.vbs" -File | ForEach-Object {
  $source = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
  if ($source -match "(configure|make)_work_package\.ps1") {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $workPackageRoot $_.Name) -Force
  }
}

Write-Output "Integration assets synchronized."
