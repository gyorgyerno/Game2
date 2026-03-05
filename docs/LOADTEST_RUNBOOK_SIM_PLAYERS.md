# Load Test Runbook – Simulated Players

## Scop
Runbook operațional pentru validarea sănătății subsistemului de simulated players (orchestrator + generators + runtime metrics).

## Preconditions
- backend pornit pe `http://localhost:4000`
- credentiale admin valide
- script disponibil: `backend/scripts/loadtest-simulated-metrics.js`

## Comenzi uzuale
### Smoke (1 minut)
```powershell
Set-Location g:\Integrame\backend
node .\scripts\loadtest-simulated-metrics.js --durationSec 60 --intervalMs 2000 --username admin --password "<PAROLA>"
```

### Stability (10 minute)
```powershell
Set-Location g:\Integrame
node .\backend\scripts\loadtest-simulated-metrics.js --durationSec 600 --intervalMs 2000 --username admin --password "<PAROLA>"
```

## Praguri interpretare
### Latency (`latencyP95Ms`)
- OK: `< 100ms`
- WARN: `100–250ms`
- CRIT: `> 250ms`

### Event loop (`eventLoopLagP95Ms`)
- OK: `< 40ms`
- WARN: `40–100ms`
- CRIT: `> 100ms`

### Decision CPU (`activityDecisionP95Ms`, `botChatDecisionP95Ms`)
- OK: `< 15ms`
- WARN: `15–40ms`
- CRIT: `> 40ms`

### Erori (`errorCount`)
- OK: `0`
- WARN: `<= 2%` din total probe
- CRIT: `> 2%` din total probe

## Troubleshooting rapid
1. `401 Credentiale invalide`
   - verifică username/parolă exact pe `/api/admin/login`
2. `404 Route not found` pe health
   - verifică backend-ul pornit pe build curent (`backend/dist` actualizat)
3. `429 Too many requests`
   - pentru acest flow, endpoint-ul `/api/admin/simulated-players/health` este exceptat din limiter-ul global
4. `P6001 prisma://`
   - regenerează clientul Prisma local și repornește backend-ul

## Rezultat validat (2026-03-05)
- raport: `backend/logs/loadtest-simulated-2026-03-05T10-55-44-149Z.json`
- durată: `600s`, interval: `2000ms`
- `sampleCount=297`, `errorCount=0`
- `latencyP95Ms=34`, `eventLoopLagP95Ms=15`
- `activityDecisionP95Ms=4`, `botChatDecisionP95Ms=5`
