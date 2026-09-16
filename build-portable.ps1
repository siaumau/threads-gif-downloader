# 建置免安裝版：把 node.exe + 精簡過的 node_modules + 程式碼打包成一個資料夾與 zip
# 用法：右鍵「用 PowerShell 執行」，或 pwsh -File build-portable.ps1
#
# 產出：
#   dist\ThreadsGIF-Downloader-portable\       解壓後的樣子
#   dist\ThreadsGIF-Downloader-portable.zip    要上傳到 GitHub Release 的檔案

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist 'ThreadsGIF-Downloader-portable'
$zip = Join-Path $dist 'ThreadsGIF-Downloader-portable.zip'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

Write-Host '== 1/6 檢查環境' -ForegroundColor Cyan
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw '找不到 node.exe，請先安裝 Node.js' }
if (-not (Test-Path $csc)) { throw "找不到 C# 編譯器：$csc" }
if (-not (Test-Path (Join-Path $root 'app\node_modules'))) {
  throw '找不到 app\node_modules，請先在 app 資料夾執行 npm install'
}
Write-Host "   node: $node"

Write-Host '== 2/6 編譯啟動程式' -ForegroundColor Cyan
$exe = Join-Path $root 'Threads GIF 下載器.exe'
& $csc -nologo -target:winexe -optimize+ `
  -r:System.Drawing.dll -r:System.Windows.Forms.dll `
  -out:$exe (Join-Path $root 'app\launcher\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw '編譯失敗' }

Write-Host '== 3/6 準備輸出資料夾' -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'app\runtime') | Out-Null

Write-Host '== 4/6 複製檔案' -ForegroundColor Cyan
Copy-Item $exe $stage
foreach ($f in 'server.js', 'lib.js', 'postprocess.js', 'get-thread-gif.js', 'package.json') {
  Copy-Item (Join-Path $root "app\$f") (Join-Path $stage 'app')
}
Copy-Item (Join-Path $root 'app\public') (Join-Path $stage 'app') -Recurse
Copy-Item (Join-Path $root 'app\node_modules') (Join-Path $stage 'app') -Recurse
Copy-Item $node (Join-Path $stage 'app\runtime\node.exe')

Write-Host '== 5/6 精簡 sharp 的跨平台二進位檔（只留 win32-x64）' -ForegroundColor Cyan
# @img\colour 是必要相依，不能刪；其餘非 win32-x64 的平台套件全部移除
Get-ChildItem (Join-Path $stage 'app\node_modules\@img') -Directory |
  Where-Object { $_.Name -ne 'colour' -and $_.Name -notlike '*win32-x64*' } |
  Remove-Item -Recurse -Force

Write-Host '== 6/6 壓縮' -ForegroundColor Cyan
Compress-Archive -Path "$stage\*" -DestinationPath $zip -CompressionLevel Optimal

$rawMB = '{0:N0}' -f ((Get-ChildItem $stage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
$zipMB = '{0:N1}' -f ((Get-Item $zip).Length / 1MB)
Write-Host ''
Write-Host "完成：解壓後 $rawMB MB，壓縮後 $zipMB MB" -ForegroundColor Green
Write-Host "  $stage"
Write-Host "  $zip"
Write-Host ''
Write-Host '上傳到 Release：' -ForegroundColor Yellow
Write-Host "  gh release create vX.Y.Z `"$zip`" --title `"vX.Y.Z`""
