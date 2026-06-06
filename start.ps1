$serverDir = Join-Path $PSScriptRoot "server"
$clientDir = Join-Path $PSScriptRoot "client"

Write-Host "Starting AutoReview..." -ForegroundColor Cyan

$serverJob = Start-Job -ScriptBlock { param($d) Set-Location $d; npm run dev } -ArgumentList $serverDir
$clientJob = Start-Job -ScriptBlock { param($d) Set-Location $d; npm run dev } -ArgumentList $clientDir

Start-Sleep -Seconds 3

$serverRunning = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
$clientRunning = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue

if ($serverRunning) { Write-Host "  Server:  http://localhost:3001" -ForegroundColor Green }
else { Write-Host "  Server:  starting..." -ForegroundColor Yellow }

if ($clientRunning) { Write-Host "  Client:  http://localhost:5173" -ForegroundColor Green }
else { Write-Host "  Client:  starting..." -ForegroundColor Yellow }

Write-Host ""
Write-Host "Press Ctrl+C to stop both servers." -ForegroundColor DarkGray

try {
    while ($true) {
        Receive-Job $serverJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
        Receive-Job $clientJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }

        $sState = (Get-Job -Id $serverJob.Id).State
        $cState = (Get-Job -Id $clientJob.Id).State
        if ($sState -eq "Failed" -or $cState -eq "Failed") {
            Write-Host "A process failed. Check output above." -ForegroundColor Red
            break
        }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host "Stopping servers..." -ForegroundColor Yellow
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Stop-Job $clientJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -Force -ErrorAction SilentlyContinue
    Remove-Job $clientJob -Force -ErrorAction SilentlyContinue

    Get-NetTCPConnection -LocalPort 3001,5173 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

    Write-Host "Stopped." -ForegroundColor Green
}
