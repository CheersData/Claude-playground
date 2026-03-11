#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Configura Windows Task Scheduler per lanciare CME Autorun ogni 60 minuti.

.DESCRIPTION
    Crea un task schedulato "Poimandres CME Autorun" che:
    - Si avvia ogni 60 minuti
    - Lancia AVVIA_CME.bat (sessione Claude Code CLI autonoma)
    - Si avvia anche al login dell'utente
    - Non si sovrappone (kill instance se gia in esecuzione dopo 15min)

.USAGE
    Tasto destro -> Esegui come amministratore
    Oppure da PowerShell elevato: .\SETUP_CME_SCHEDULER.ps1

.NOTES
    Per rimuovere: .\SETUP_CME_SCHEDULER.ps1 -Remove
    Per verificare: .\SETUP_CME_SCHEDULER.ps1 -Check
#>

param(
    [switch]$Remove,
    [switch]$Check,
    [int]$IntervalMinutes = 15
)

$TaskName = "Poimandres CME Autorun"
$ProjectDir = "C:\Users\crist\Claude-playground\controlla-me"
$BatFile = Join-Path $ProjectDir "AVVIA_CME.bat"

# ─── Colori output ───────────────────────────────────────────────────────────

function Write-OK($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Err($msg) { Write-Host "  [ERRORE] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  [INFO] $msg" -ForegroundColor Cyan }

# ─── Check mode ──────────────────────────────────────────────────────────────

if ($Check) {
    Write-Host "`n  === CME Scheduler Status ===" -ForegroundColor Yellow
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Write-OK "Task '$TaskName' trovato"
        Write-Info "Stato: $($task.State)"
        $trigger = $task.Triggers | Select-Object -First 1
        Write-Info "Prossima esecuzione: controllare Task Scheduler"

        $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($info) {
            Write-Info "Ultima esecuzione: $($info.LastRunTime)"
            Write-Info "Risultato ultimo run: $($info.LastTaskResult)"
            Write-Info "Prossimo run: $($info.NextRunTime)"
        }
    } else {
        Write-Err "Task '$TaskName' NON trovato. Esegui SETUP_CME_SCHEDULER.ps1 per crearlo."
    }
    Write-Host ""
    exit 0
}

# ─── Remove mode ─────────────────────────────────────────────────────────────

if ($Remove) {
    Write-Host "`n  === Rimozione CME Scheduler ===" -ForegroundColor Yellow
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-OK "Task '$TaskName' rimosso."
    } else {
        Write-Info "Task '$TaskName' non esisteva."
    }
    Write-Host ""
    exit 0
}

# ─── Setup ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Yellow
Write-Host "   Poimandres CME Autorun — Setup" -ForegroundColor Yellow
Write-Host "  ========================================" -ForegroundColor Yellow
Write-Host ""

# Verifica prerequisiti
if (-not (Test-Path $BatFile)) {
    Write-Err "File non trovato: $BatFile"
    Write-Err "Assicurati che AVVIA_CME.bat esista nella root del progetto."
    exit 1
}

# Verifica claude nel PATH
$claudePath = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudePath) {
    Write-Err "'claude' non trovato nel PATH."
    Write-Err "Installa Claude Code CLI prima di procedere."
    exit 1
}
Write-OK "claude CLI trovato: $($claudePath.Source)"

# Rimuovi task esistente se presente
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Info "Task esistente trovato, aggiorno..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Crea trigger: ogni N minuti + al login
$triggerRepeat = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 365)

$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Azione: lancia il bat con argomento "scheduled" (salta il pause finale)
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$BatFile`" scheduled" `
    -WorkingDirectory $ProjectDir

# Settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5)

# Registra
Register-ScheduledTask `
    -TaskName $TaskName `
    -Trigger $triggerRepeat, $triggerLogon `
    -Action $action `
    -Settings $settings `
    -Description "Lancia sessione CME autonoma via Claude Code CLI ogni $IntervalMinutes minuti. Legge board, esegue task, genera piani allineati alle visioni dipartimentali." `
    -RunLevel Highest `
    | Out-Null

Write-OK "Task '$TaskName' creato con successo!"
Write-Host ""
Write-Info "Intervallo: ogni $IntervalMinutes minuti"
Write-Info "Trigger aggiuntivo: al login di $env:USERNAME"
Write-Info "Timeout sessione: 15 minuti"
Write-Info "Sovrapposizione: ignorata (skip se gia in corso)"
Write-Info "Log sessioni: $ProjectDir\company\autorun-logs\"
Write-Host ""
Write-Host "  Comandi utili:" -ForegroundColor Gray
Write-Host "    .\SETUP_CME_SCHEDULER.ps1 -Check     # Verifica stato" -ForegroundColor Gray
Write-Host "    .\SETUP_CME_SCHEDULER.ps1 -Remove    # Rimuovi scheduler" -ForegroundColor Gray
Write-Host "    .\SETUP_CME_SCHEDULER.ps1 -IntervalMinutes 30  # Cambia intervallo" -ForegroundColor Gray
Write-Host ""
