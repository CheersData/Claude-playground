#!/bin/bash
# ============================================================
# 🛡️ okmom-qa v2.0 — Setup per Claude Code (CORRETTO)
#
# I comandi vanno in ~/.claude/commands/
# Il config va nella root di ogni progetto
#
# LANCIA DA Git Bash:
#   cd /c/Users/MarcoCristofori/Claude-playground
#   chmod +x setup-okmom-qa.sh
#   ./setup-okmom-qa.sh
# ============================================================

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo "🛡️  okmom-qa v2.0 — Setup per Claude Code"
echo "============================================"
echo ""

# ── PERCORSI ──
CLAUDE_DIR="$HOME/.claude"
CMD_DIR="$CLAUDE_DIR/commands"
PLAYGROUND="/c/Users/MarcoCristofori/Claude-playground"

if [ ! -d "/c/Users" ] && [ -d "/mnt/c/Users" ]; then
  PLAYGROUND="/mnt/c/Users/MarcoCristofori/Claude-playground"
fi

mkdir -p "$CMD_DIR"
echo -e "${GREEN}✓${NC} Cartella comandi: $CMD_DIR"

# ════════════════════════════════════════════════
# COMANDO: /guardian
# ════════════════════════════════════════════════
cat > "$CMD_DIR/guardian.md" << 'GUARDIAN'
---
description: "Loop test-fix automatico con handoff diagnostico. Testa, diagnostica, fixa, ritesta. Max 5 iterazioni."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# 🛡️ Guardian — okmom-qa

## PRIMA: Leggi config del progetto
1. Leggi `CLAUDE.md` nella root — stack, struttura, comandi
2. Leggi `qa.config.json` nella root — config QA specifica
3. Se manca qa.config.json, usa default: test=`npm test`, lint=`npm run lint`, typecheck=`npm run typecheck`

Inizia il loop. Tieni un contatore di iterazioni.

## STEP 1: Esegui test
Lancia il `test_command` dal config. Cattura TUTTO: stdout, stderr, exit code.

## STEP 2: Valuta
- **Tutti verdi** → vai a STEP FINALE (successo)
- **Fallimenti** → registra e vai a STEP 3
- **Errore ambiente** (runtime mancante, dipendenza, porta occupata) → FERMATI, segnala come problema di setup

## STEP 3: Diagnostica (per ogni test fallito)
1. Leggi messaggio errore completo + stack trace
2. Identifica file sorgente e riga esatta
3. Classifica il tipo:
   - `TYPE_ERROR` → errore di tipo (TypeScript, mypy)
   - `RUNTIME_ERROR` → null reference, timeout, import mancante
   - `LOGIC_ERROR` → output sbagliato
   - `API_ERROR` → servizi esterni
   - `TEST_ERROR` → il test stesso è sbagliato
   - `CONFIG_ERROR` → env var, path, settings
4. Root cause: bug nel codice o nel test?

## STEP 4: Fix
- Chirurgico: cambia il MINIMO indispensabile
- Max 3 file per iterazione (o `max_files_per_fix` dal config)
- Se stesso test fallisce 2x con STESSO errore → cambia completamente strategia
- Logga: file modificato, cosa, perché

## STEP 5: Ri-esegui → torna a STEP 1. Incrementa contatore.

---

## GUARDRAIL: MAX ITERAZIONI (default 5)

Al raggiungimento di `max_iterations`, genera `GUARDIAN-HANDOFF.md` nella ROOT del progetto:

```markdown
# 🚨 GUARDIAN HANDOFF — [data e ora]
## Stato: FALLITO dopo [N] iterazioni

## Come usare questo file
**Umano:** leggi la diagnosi per capire cosa non funziona.
**Claude Code:** esegui i fix in ordine, testa dopo ogni fix.

## Configurazione
- Test command: `[dal config]`
- Stack: [dal CLAUDE.md]

## Test ancora falliti

### ❌ [1] — [file test] → [nome test case]
**Tipo:** [TYPE_ERROR | RUNTIME_ERROR | LOGIC_ERROR | API_ERROR | TEST_ERROR | CONFIG_ERROR]

**Errore:**
\`\`\`
[messaggio completo + stack trace — NON troncato]
\`\`\`

**File:** `[path:riga]` — [contesto]

**Provato:**
1. Iterazione [N]: [cosa] → [risultato]
2. Iterazione [N]: [cosa] → [risultato]

**Diagnosi:** [causa radice VERA — non "il test fallisce" ma PERCHÉ]

**Fix:** [istruzione CONCRETA: quale file, quale riga, cosa cambiare e perché]

---

## Ordine di risoluzione
1. TYPE_ERROR (spesso radice di altri errori)
2. CONFIG_ERROR
3. RUNTIME_ERROR
4. API_ERROR
5. LOGIC_ERROR
6. TEST_ERROR (spesso si risolvono dopo i fix sopra)

## Istruzioni per Claude Code
Leggi tutto. Applica fix in ordine. Testa dopo ogni fix con `[test_command]`.
Hai [max_iterations] tentativi. Se fallisci, genera nuovo GUARDIAN-HANDOFF.md aggiornato.

## Contesto aggiuntivo
[Info scoperte: dipendenze circolari, pattern, convenzioni non documentate]
```

Dopo aver generato il file, stampa in chat:
1. Riassunto problemi (2-3 righe, in italiano)
2. Opinione: bug semplice o architetturale?
3. **"Ho scritto GUARDIAN-HANDOFF.md. Scrivi: `Leggi GUARDIAN-HANDOFF.md e risolvi tutti i problemi, poi lancia /guardian`"**

---

## STEP FINALE (successo)
1. Stampa: iterazioni, fix applicati, file modificati
2. Se hai fixato test (non solo codice), segnalalo
3. Cancella GUARDIAN-HANDOFF.md se esiste da un giro precedente
4. Suggerisci: "Vuoi lanciare /testbook per aggiornare il testbook?"
GUARDIAN
echo -e "${GREEN}✓${NC} /guardian"

# ════════════════════════════════════════════════
# COMANDO: /testbook
# ════════════════════════════════════════════════
cat > "$CMD_DIR/testbook.md" << 'TESTBOOK'
---
description: "Analizza coverage del progetto e genera docs/TESTBOOK.md con gap, priorità e stato dei test."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# 📋 Testbook — okmom-qa

## PRIMA: Leggi config
1. Leggi `CLAUDE.md` — stack, struttura
2. Leggi `qa.config.json` — source_dirs, test_dirs, coverage_threshold, critical_modules

## Fase 1 — Scan del codebase
Per ogni directory in `source_dirs`:
- Lista tutti i moduli/file sorgente
- Per ognuno, cerca il file test corrispondente in `test_dirs`
- Registra: modulo → file test (o "MANCANTE")

## Fase 2 — Coverage
Esegui `coverage_command` dal config. Analizza il report.
Per ogni modulo, registra la percentuale di coverage.

## Fase 3 — Genera docs/TESTBOOK.md

```markdown
# 📋 TESTBOOK — [nome progetto]
Ultimo aggiornamento: [data]

## Coverage Summary

| Modulo | File Test | Coverage | Stato |
|--------|-----------|----------|-------|
| [path/modulo] | [path/test] | [N%] | ✅ / 🟡 / 🔴 |

Legenda: ✅ >= [threshold]% | 🟡 50-[threshold]% | 🔴 < 50% o mancante

## 🔴 Moduli critici senza test (PRIORITÀ MASSIMA)
[lista numerata, con motivazione — prendi da critical_modules nel config]

## 🟡 Moduli sotto soglia (< [threshold]%)
[lista con cosa manca specificamente]

## Test di integrazione
| Pipeline/Flusso | File Test | Stato |
|-----------------|-----------|-------|

## Test e2e
| Flusso utente | File Test | Stato |
|---------------|-----------|-------|

## Ultimi aggiornamenti
- [data] — [cosa aggiunto/modificato]

## Pattern di regression
- [descrizione bug] → catturato da [file:riga]
```

## Fase 4 — Chiedi
Se ci sono gap 🔴:
- Mostra lista
- Chiedi: "Vuoi che scriva i test mancanti? Inizio da [modulo più critico]"
- Se confermato: scrivi i test, riesegui la suite, aggiorna TESTBOOK

## Regole per scrivere test
- NON modificare MAI file sorgente — solo test e docs
- Mock TUTTE le chiamate API esterne (Anthropic, Supabase, Stripe, qualsiasi)
- Ogni test deterministico: no random, no Date.now(), no rete
- Un test = un behavior
- Fixture in `fixtures_dir` dal config (default: tests/fixtures/)
- Segui naming e pattern esistenti nel progetto
TESTBOOK
echo -e "${GREEN}✓${NC} /testbook"

# ════════════════════════════════════════════════
# COMANDO: /beauty
# ════════════════════════════════════════════════
cat > "$CMD_DIR/beauty.md" << 'BEAUTY'
---
description: "Review estetica completa: palette, spacing, tipografia, componenti, responsive, accessibilità, micro-interazioni. Da lanciare PRIMA di deploy/demo."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# 💅 Beauty — okmom-qa

Review estetica completa. Da lanciare ALLA FINE, prima di un deploy o una demo.
Non rallenta lo sviluppo — gira solo quando lo chiedi tu.

## PRIMA: Leggi config
1. Leggi `CLAUDE.md` — stack, framework CSS
2. Leggi `qa.config.json` → sezione `beauty` (palette, fonts, spacing, breakpoints)
3. Se non c'è sezione beauty, deduci da:
   - `tailwind.config.js/ts` → palette, spacing, breakpoints
   - `globals.css` / CSS variables → colori, font
   - `theme.ts` o simili → design tokens

## Fase 1 — Inventario
Scansiona e mappa:
- File di stile e config (tailwind.config, globals.css, theme, CSS variables)
- Componenti UI (buttons, inputs, cards, modals, badges)
- Pagine/route principali
- Design tokens in uso

## Fase 2 — Scansione dei 7 canoni

### 1. 🎨 PALETTE & COLORI
- Colori solo dalla palette — no hex random hardcodati
- Contrasto >= 4.5:1 testo normale, >= 3:1 testo grande (WCAG AA)
- Max 5-6 primari + neutri
- Dark mode con palette corretta

Cerca:
```bash
grep -rn '#[0-9a-fA-F]\{3,8\}' --include='*.tsx' --include='*.jsx' --include='*.css' | head -50
```

### 2. 📐 SPACING & LAYOUT
- Scala coerente: 4, 8, 12, 16, 24, 32, 48, 64px
- No valori arbitrari (13px, 7px, 22px → red flag)
- Grid e container max-width consistenti

Cerca:
```bash
grep -rn 'margin:\|padding:\|gap:' --include='*.css' --include='*.tsx' | grep -vE '(0|4|8|12|16|20|24|32|48|64)px' | head -30
```

### 3. ✏️ TIPOGRAFIA
- Max 2 font family
- Scala coerente (no 14/15/16/17px caotici)
- Gerarchia: h1 > h2 > h3 > body > small
- Line-height: 1.4-1.6 body, 1.1-1.3 heading
- Max 3-4 font-weight

### 4. 🧩 COMPONENTI & CONSISTENZA
- Bottoni: stessa altezza, padding, border-radius ovunque
- Input: stessa altezza dei bottoni, stili focus/error/disabled
- Card: stesso radius, shadow, padding
- Icon: stessa dimensione, stessa libreria

### 5. 📱 RESPONSIVE
- Breakpoint coerenti
- Touch target >= 44x44px su mobile
- No horizontal scroll mobile
- Font >= 16px mobile (evita zoom iOS)

### 6. ♿ ACCESSIBILITÀ
- Ogni `<img>` ha `alt`
- Ogni input ha `<label>` (o aria-label)
- Focus visible su TUTTI gli interattivi
- Mai solo colore per comunicare stato

Cerca:
```bash
grep -rn '<img\|<Image' --include='*.tsx' --include='*.jsx' | grep -v 'alt=' | head -20
grep -rn 'outline.*none' --include='*.css' --include='*.tsx' | head -20
```

### 7. ✨ MICRO-INTERAZIONI & STATI
- Hover su tutti i cliccabili
- Transition 150-300ms ease-out
- Loading state per async
- Empty state per liste vuote
- Error/success/disabled state

## Severity
- 🔴 CRITICO — a11y rotta, contrasto illeggibile, layout broken mobile
- 🟡 IMPORTANTE — inconsistenza visiva, spacing caotico, font fuori scala
- 🟢 SUGGERIMENTO — polish, animazioni, micro-ottimizzazioni

## Fase 3 — Genera docs/BEAUTY-REPORT.md

```markdown
# 💅 BEAUTY REPORT — [nome progetto]
Data: [data]

## Score: [N]/10

## Riepilogo
| Canone | Stato | Violazioni |
|--------|-------|-----------|
| Palette & Colori | ✅/🟡/🔴 | [N] |
| Spacing & Layout | ✅/🟡/🔴 | [N] |
| Tipografia | ✅/🟡/🔴 | [N] |
| Componenti | ✅/🟡/🔴 | [N] |
| Responsive | ✅/🟡/🔴 | [N] |
| Accessibilità | ✅/🟡/🔴 | [N] |
| Micro-interazioni | ✅/🟡/🔴 | [N] |

## 🔴 Critici (da fixare prima del deploy)
### [1] [titolo]
- **Canone:** [quale]
- **File:** `[path:riga]`
- **Problema:** [cosa c'è di sbagliato]
- **Fix:** [cosa fare esattamente]

## 🟡 Importanti
[stesso formato]

## 🟢 Suggerimenti
[stesso formato]

## Design System estratto
[palette, font, spacing rilevati dal codice — reference utile]
```

## Fase 4 — Chiedi
Mostra riepilogo.
Se 🔴: "Fixo i [N] critici? Sono fix estetici (CSS/classi/attributi), non tocco la logica."
Se confermato: applica SOLO fix estetici — MAI logica applicativa.
BEAUTY
echo -e "${GREEN}✓${NC} /beauty"

# ════════════════════════════════════════════════
# TEMPLATES qa.config.json (nella playground)
# ════════════════════════════════════════════════
mkdir -p "$PLAYGROUND/okmom-qa/templates"

cat > "$PLAYGROUND/okmom-qa/templates/qa.config.controlla-me.json" << 'TPL1'
{
  "project": "controlla.me",
  "description": "AI Legal Document Analysis — Classifier → Analyzer → Investigator → Advisor",
  "test_command": "npm test",
  "lint_command": "npm run lint",
  "typecheck_command": "npm run typecheck",
  "coverage_command": "npm run test:coverage",
  "build_command": "npm run build",
  "source_dirs": ["lib/agents", "lib/prompts", "lib", "app/api", "components"],
  "test_dirs": ["tests/unit", "tests/integration", "tests/e2e"],
  "fixtures_dir": "tests/fixtures",
  "docs_dir": "docs",
  "coverage_threshold": 80,
  "max_files_per_fix": 3,
  "max_iterations": 5,
  "critical_modules": [
    {"path": "lib/agents/orchestrator.ts", "reason": "Coordina 4 agenti"},
    {"path": "lib/agents/investigator.ts", "reason": "Unico con web_search"},
    {"path": "lib/agents/analyzer.ts", "reason": "Core: identifica rischi legali"},
    {"path": "lib/extract-text.ts", "reason": "Entry point estrazione"},
    {"path": "app/api/analyze/route.ts", "reason": "Endpoint SSE principale"}
  ],
  "mock_rules": [
    "Mock Claude API con fixture JSON",
    "Mock Supabase client",
    "Mock Stripe webhook",
    "Mock web search Agent 3 con fixture sentenze",
    "Fixture PDF in tests/fixtures/"
  ],
  "beauty": {
    "palette": {
      "primary": "#FF6B35",
      "background": "#0A0A0B",
      "surface": "#141416",
      "text": "#FAFAFA",
      "text_secondary": "#A1A1AA",
      "success": "#22C55E",
      "warning": "#EAB308",
      "danger": "#EF4444",
      "border": "#27272A"
    },
    "fonts": {"heading": "Instrument Serif", "body": "DM Sans"},
    "spacing_scale": [0, 4, 8, 12, 16, 20, 24, 32, 48, 64],
    "border_radius": "8px",
    "breakpoints": {"sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px"}
  }
}
TPL1

cat > "$PLAYGROUND/okmom-qa/templates/qa.config.soldi-persi.json" << 'TPL2'
{
  "project": "Soldi Persi",
  "description": "Financial Document Analysis — identifica risparmi mancati",
  "test_command": "npm test",
  "lint_command": "npm run lint",
  "typecheck_command": "npm run typecheck",
  "coverage_command": "npm run test:coverage",
  "build_command": "npm run build",
  "source_dirs": ["lib/agents", "lib/prompts", "lib", "app/api", "components"],
  "test_dirs": ["tests/unit", "tests/integration", "tests/e2e"],
  "fixtures_dir": "tests/fixtures",
  "docs_dir": "docs",
  "coverage_threshold": 80,
  "max_files_per_fix": 3,
  "max_iterations": 5,
  "critical_modules": [
    {"path": "lib/agents/document-parser.ts", "reason": "Estrae dati finanziari"},
    {"path": "lib/agents/savings-analyzer.ts", "reason": "Core: identifica soldi persi"},
    {"path": "lib/agents/market-comparator.ts", "reason": "Confronto mercato"},
    {"path": "lib/agents/action-generator.ts", "reason": "Genera azioni recupero"}
  ],
  "mock_rules": [
    "Mock Claude API",
    "Mock comparatori tariffe",
    "Mock dati finanziari anonimi"
  ],
  "beauty": {
    "palette": {},
    "fonts": {},
    "spacing_scale": [0, 4, 8, 12, 16, 20, 24, 32, 48, 64],
    "border_radius": "8px",
    "breakpoints": {"sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px"}
  }
}
TPL2

cat > "$PLAYGROUND/okmom-qa/templates/qa.config.template.json" << 'TPL3'
{
  "project": "[NOME]",
  "description": "[Descrizione]",
  "test_command": "npm test",
  "lint_command": "npm run lint",
  "typecheck_command": "npm run typecheck",
  "coverage_command": "npm run test:coverage",
  "build_command": "npm run build",
  "source_dirs": ["src", "lib", "app"],
  "test_dirs": ["tests"],
  "fixtures_dir": "tests/fixtures",
  "docs_dir": "docs",
  "coverage_threshold": 80,
  "max_files_per_fix": 3,
  "max_iterations": 5,
  "critical_modules": [{"path": "[modulo]", "reason": "[perché critico]"}],
  "mock_rules": ["Mock tutte le API esterne"],
  "beauty": {
    "palette": {},
    "fonts": {"heading": "", "body": ""},
    "spacing_scale": [0, 4, 8, 12, 16, 20, 24, 32, 48, 64],
    "border_radius": "8px",
    "breakpoints": {"sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px"}
  }
}
TPL3
echo -e "${GREEN}✓${NC} Templates in $PLAYGROUND/okmom-qa/templates/"

# ════════════════════════════════════════════════
# COPIA CONFIG NEI PROGETTI (se esistono)
# ════════════════════════════════════════════════
echo ""
for PROJ in "controlla-me" "controlla.me"; do
  if [ -d "$PLAYGROUND/$PROJ" ]; then
    cp "$PLAYGROUND/okmom-qa/templates/qa.config.controlla-me.json" "$PLAYGROUND/$PROJ/qa.config.json"
    mkdir -p "$PLAYGROUND/$PROJ/docs" "$PLAYGROUND/$PROJ/tests/fixtures"
    echo -e "${GREEN}✓${NC} qa.config.json → $PLAYGROUND/$PROJ"
    break
  fi
done

for PROJ in "soldi-persi" "salva-me"; do
  if [ -d "$PLAYGROUND/$PROJ" ]; then
    cp "$PLAYGROUND/okmom-qa/templates/qa.config.soldi-persi.json" "$PLAYGROUND/$PROJ/qa.config.json"
    mkdir -p "$PLAYGROUND/$PROJ/docs" "$PLAYGROUND/$PROJ/tests/fixtures"
    echo -e "${GREEN}✓${NC} qa.config.json → $PLAYGROUND/$PROJ"
    break
  fi
done

# ════════════════════════════════════════════════
# RIEPILOGO
# ════════════════════════════════════════════════
echo ""
echo "============================================"
echo -e "${GREEN}✅ okmom-qa v2.0 installato!${NC}"
echo "============================================"
echo ""
echo "Comandi installati in: $CMD_DIR/"
ls -la "$CMD_DIR"/*.md 2>/dev/null | awk '{print "  " $NF}'
echo ""
echo "Templates in: $PLAYGROUND/okmom-qa/templates/"
echo ""
echo "───────────────────────────────────────────"
echo -e "${CYAN}⏱️  QUANDO GIRA COSA:${NC}"
echo ""
echo "  🔧 DURANTE SVILUPPO:"
echo "     /guardian   → loop test-fix + handoff"
echo ""
echo "  📋 PRIMA DI RELEASE:"
echo "     /testbook   → coverage + gap analysis"
echo ""
echo "  💅 PRIMA DI DEPLOY/DEMO:"
echo "     /beauty     → review estetica + a11y"
echo ""
echo "───────────────────────────────────────────"
echo -e "${YELLOW}COME USARLO:${NC}"
echo ""
echo "  cd C:\\Users\\MarcoCristofori\\Claude-playground\\controlla-me"
echo "  claude"
echo ""
echo "  Poi scrivi: /guardian"
echo "  Oppure:     /testbook"
echo "  Oppure:     /beauty"
echo ""
echo "  I comandi funzionano in QUALSIASI progetto."
echo "  Basta che ci sia un qa.config.json nella root."
echo ""
