# Opreste toate serverele Integrame
Write-Host "Opresc toate procesele node..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$p3 = netstat -ano | findstr "LISTENING" | findstr ":3000"
$p4 = netstat -ano | findstr "LISTENING" | findstr ":4000"
if (-not $p3 -and -not $p4) {
    Write-Host "Toate serverele oprite." -ForegroundColor Green
} else {
    Write-Host "Unele procese mai ruleaza. Incearca din nou." -ForegroundColor Red
}
