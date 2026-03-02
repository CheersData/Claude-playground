<#
.SYNOPSIS
    CME Company Scheduler — PowerShell wrapper
    Esegue company-scheduler-daemon.ts --check-once ogni 5 minuti.

.DESCRIPTION
    Invoca 'npx tsx scripts/company-scheduler-daemon.ts --check-once' (esecuzione singola).
    Se il board ha task open → li reclama ed esegue.
    Se il board e' vuoto → genera piano e lo invia su Telegram.

    Per avviare in loop continuo (Ctrl+C per fermare):
        powershell -ExecutionPolicy Bypass -File AVVIA_SCHEDULER.ps1 -Loop

    Per eseguire una singola iterazione:
        powershell -ExecutionPolicy Bypass -File AVVIA_SCHEDULER.ps1

    Per avviare come Windows Task Scheduler (ogni 5 min):
        powershell -ExecutionPolicy Bypass -File AVVIA_SCHEDULER.ps1 -Register

.PARAMETER Loop
    Esegue in loop continuo: --check-once ogni 5 minuti. Interrompi con Ctrl+C.

.PARAMETER Register
    Registra il task su Windows Task Scheduler (richiede privilegi admin).

.PARAMETER Unregister
    Rimuove il task da Windows Task Scheduler.
#>

param(
    [switch]$Loop,
    [switch]$Register,
    [switch]$Unregister
)

# ─── Config ───────────────────────────────────────────────────────────────────

$TaskName    = "CME-Scheduler"
$ScriptPath  = $MyInvocation.MyCommand.Definition
$ProjectDir  = Split-Path -Parent $ScriptPath
$LogFile     = Join-Path $ProjectDir "company\scheduler-daemon.log"
$DaemonArgs  = "tsx scripts\company-scheduler-daemon.ts --check-once"

# ─── Logging ──────────────────────────────────────────────────────────────────

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    try {
        $logDir = Split-Path -Parent $LogFile
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    } catch {}
}

# ─── Register ─────────────────────────────────────────────────────────────────

if ($Register) {
    Write-Log "Registrazione '$TaskName' su Windows Task Scheduler..."

    # Verifica privilegi admin
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Log "ERRORE: Richiede privilegi amministratore. Riesegui come admin."
        exit 1
    }

    $psExe  = (Get-Command powershell.exe).Source
    $action = New-ScheduledTaskAction `
        -Execute $psExe `
        -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$ScriptPath`"" `
        -WorkingDirectory $ProjectDir

    # Trigger: ogni 5 minuti, indefinito
    $trigger  = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
    $settings = New-ScheduledTaskSettingsSet `
        -MultipleInstances IgnoreNew `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 4)

    Register-ScheduledTask `
        -TaskName    $TaskName `
        -Action      $action `
        -Trigger     $trigger `
        -Settings    $settings `
        -Description "CME Company Scheduler — check board ogni 5 minuti" `
        -Force | Out-Null

    Write-Log "Task '$TaskName' registrato. Intervallo: ogni 5 minuti."
    Write-Log "Per rimuoverlo: AVVIA_SCHEDULER.ps1 -Unregister"
    exit 0
}

# ─── Unregister ───────────────────────────────────────────────────────────────

if ($Unregister) {
    Write-Log "Rimozione '$TaskName' da Windows Task Scheduler..."
    try {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Log "Task '$TaskName' rimosso."
    } catch {
        Write-Log "Task '$TaskName' non trovato o errore: $_"
    }
    exit 0
}

# ─── Loop mode ────────────────────────────────────────────────────────────────

if ($Loop) {
    $Host.UI.RawUI.WindowTitle = "CME Company Scheduler"
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "    CME Company Scheduler — Loop mode" -ForegroundColor Cyan
    Write-Host "    controlla.me  |  check ogni 5 minuti" -ForegroundColor Cyan
    Write-Host "    Ctrl+C per fermare" -ForegroundColor DarkGray
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Log "=== CME Scheduler avviato in loop (ogni 5 min) ==="
    Push-Location $ProjectDir
    try {
        while ($true) {
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Write-Host "[$ts] Check board..." -ForegroundColor Yellow
            try {
                $output = & npx $DaemonArgs.Split(" ") 2>&1
                foreach ($line in $output) {
                    Write-Log $line
                }
            } catch {
                Write-Log "ERRORE: $_"
            }
            Write-Host "Attendo 5 minuti..." -ForegroundColor DarkGray
            Start-Sleep -Seconds 300
        }
    } finally {
        Pop-Location
        Write-Log "=== CME Scheduler loop terminato ==="
    }
}

# ─── Single check ─────────────────────────────────────────────────────────────

Write-Log "=== CME Scheduler check-once ==="

# Verifica che npx sia disponibile
try {
    $null = Get-Command npx -ErrorAction Stop
} catch {
    Write-Log "ERRORE: 'npx' non trovato nel PATH. Installare Node.js."
    exit 1
}

# Entra nella directory del progetto
Push-Location $ProjectDir

try {
    Write-Log "Eseguo: npx $DaemonArgs"
    $output = & npx $DaemonArgs.Split(" ") 2>&1
    foreach ($line in $output) {
        Write-Log $line
    }
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Write-Log "WARN: exit code $LASTEXITCODE"
    }
} catch {
    Write-Log "ERRORE durante l'esecuzione: $_"
} finally {
    Pop-Location
}

Write-Log "=== Check completato ==="
