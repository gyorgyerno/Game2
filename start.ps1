# ─── Integrame Dev Starter ───────────────────────────────────────────────────
# Ruleaza: powershell -ExecutionPolicy Bypass -File G:\Integrame\start.ps1

$ROOT     = "G:\Integrame"
$BACKEND  = "$ROOT\backend"
$FRONTEND = "$ROOT\frontend-web"
$TSC      = "$ROOT\node_modules\.bin\tsc.cmd"
$NEXT     = "$ROOT\node_modules\next\dist\bin\next"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   INTEGRAME DEV STARTER" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Opreste TOATE procesele node existente
Write-Host "[1/4] Opresc procese node existente..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "      Gata." -ForegroundColor Green

# 2. Build backend TypeScript
Write-Host "`n[2/4] Build backend (TypeScript)..." -ForegroundColor Yellow
$buildOut = cmd /c "cd /d `"$BACKEND`" && `"$TSC`" -p tsconfig.json 2>&1 && echo BUILD_OK"
if ($buildOut -match "BUILD_OK") {
    Write-Host "      Build OK!" -ForegroundColor Green
} else {
    Write-Host "      EROARE la build! Output:" -ForegroundColor Red
    $buildOut | ForEach-Object { Write-Host "      $_" -ForegroundColor Red }
    exit 1
}

# 3. Porneste backend
Write-Host "`n[3/4] Pornesc backend pe :4000..." -ForegroundColor Yellow
$backProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" `
    -WorkingDirectory $BACKEND -NoNewWindow -PassThru
Start-Sleep -Seconds 2

$b = netstat -ano | findstr "LISTENING" | findstr ":4000"
if ($b) {
    Write-Host "      Backend pornit! (PID $($backProc.Id))" -ForegroundColor Green
} else {
    Write-Host "      EROARE: backend-ul nu asculta pe :4000!" -ForegroundColor Red
    exit 1
}

# 4. Porneste frontend Next.js
Write-Host "`n[4/4] Pornesc frontend pe :3000..." -ForegroundColor Yellow
$frontProc = Start-Process -FilePath "node" -ArgumentList "$NEXT dev" `
    -WorkingDirectory $FRONTEND -NoNewWindow -PassThru
Write-Host "      Compilare Next.js (astept 12s)..." -ForegroundColor Gray
Start-Sleep -Seconds 12

$f = netstat -ano | findstr "LISTENING" | findstr ":3000"
if ($f) {
    Write-Host "      Frontend pornit! (PID $($frontProc.Id))" -ForegroundColor Green
} else {
    Write-Host "      Frontend inca compileaza - va fi gata in cateva secunde." -ForegroundColor Yellow
    Write-Host "      (PID $($frontProc.Id))" -ForegroundColor Gray
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:4000" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "  Stop:  Stop-Process -Name node -Force" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan
