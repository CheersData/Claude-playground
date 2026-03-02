# COMMIT_PROGRESS.ps1 — CME Progressive Commit Tool
#
# Uso: .\COMMIT_PROGRESS.ps1 -Message "feat: descrizione" [-Push] [-Tag]
#
# Workflow CME progressive commits:
#   1. Dopo ogni task completato: .\COMMIT_PROGRESS.ps1 -Message "feat: task title"
#   2. Dopo ogni sprint (5+ task):  .\COMMIT_PROGRESS.ps1 -Message "release: sprint N" -Tag
#   3. In produzione: aggiungere -Push per push automatico
#
# Opzionale: registra come hook post-task nel company-tasks CLI
#   per commit automatico dopo ogni 'npx tsx scripts/company-tasks.ts done <id>'

param(
    [Parameter(Mandatory=$true)]
    [string]$Message,

    [switch]$Push,
    [switch]$Tag,
    [switch]$DryRun,
    [string]$TagName = ""
)

$ProjectDir = "C:\Users\crist\Claude-playground\controlla-me"
Set-Location $ProjectDir

$BranchColor = "`e[36m"
$GreenColor  = "`e[32m"
$YellowColor = "`e[33m"
$RedColor    = "`e[31m"
$ResetColor  = "`e[0m"

Write-Host ""
Write-Host "${BranchColor}CME Progressive Commit${ResetColor}"
Write-Host "─────────────────────"

# 1. Stato corrente
$status = git status --short 2>&1
$changedFiles = ($status | Measure-Object -Line).Lines
Write-Host "File modificati: ${YellowColor}$changedFiles${ResetColor}"

if ($changedFiles -eq 0) {
    Write-Host "${YellowColor}Nessuna modifica da committare.${ResetColor}"
    exit 0
}

# 2. Mostra files
Write-Host ""
git status --short | Select-Object -First 20
if ($changedFiles -gt 20) {
    Write-Host "  ... e altri $($changedFiles - 20) file"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "${YellowColor}[DRY RUN] Commit: $Message${ResetColor}"
    exit 0
}

# 3. Staging selettivo: escludi file sensibili e temporanei
$excludePatterns = @(
    ".env", ".env.local", "*.log",
    "company/scheduler-daemon-state.json",
    "scripts/adversarial-results-*.json",
    "scripts/testbook-results-*.json",
    ".analysis-cache/"
)

# Stage tutto escludendo i pattern
git add -A 2>&1 | Out-Null

# Rimuovi dal staging i file sensibili
foreach ($pattern in $excludePatterns) {
    $files = git diff --cached --name-only 2>&1 | Where-Object { $_ -like "*$pattern*" }
    foreach ($f in $files) {
        git reset HEAD $f 2>&1 | Out-Null
    }
}

$stagedCount = (git diff --cached --name-only 2>&1 | Measure-Object -Line).Lines
Write-Host ""
Write-Host "File in staging: ${GreenColor}$stagedCount${ResetColor}"

if ($stagedCount -eq 0) {
    Write-Host "${YellowColor}Nessun file in staging (tutti esclusi o già committati).${ResetColor}"
    exit 0
}

# 4. Commit
Write-Host ""
Write-Host "Commit: ${GreenColor}$Message${ResetColor}"

try {
    git commit -m $Message 2>&1
    Write-Host "${GreenColor}✓ Commit completato${ResetColor}"
} catch {
    Write-Host "${RedColor}✗ Errore commit: $_${ResetColor}"
    exit 1
}

# 5. Tag opzionale
if ($Tag) {
    if ($TagName -eq "") {
        $dateStr = Get-Date -Format "yyyy-MM-dd"
        $shortHash = (git rev-parse --short HEAD 2>&1).Trim()
        $TagName = "sprint-$dateStr-$shortHash"
    }
    git tag $TagName 2>&1
    Write-Host "${GreenColor}✓ Tag creato: $TagName${ResetColor}"
}

# 6. Push opzionale
if ($Push) {
    Write-Host "Push in corso..."
    git push 2>&1
    if ($Tag -and $TagName -ne "") {
        git push origin $TagName 2>&1
    }
    Write-Host "${GreenColor}✓ Push completato${ResetColor}"
}

Write-Host ""
$hash = (git rev-parse --short HEAD 2>&1).Trim()
Write-Host "Commit: ${BranchColor}$hash${ResetColor} — $Message"
Write-Host ""
