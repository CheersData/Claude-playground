# 🚀 ISTRUZIONI RAPIDE — Soldi Persi

## Hai 3 cose da fare:

### 1️⃣ Copia questa cartella nel tuo progetto

Copia TUTTO il contenuto di questa cartella dentro:
```
C:\Users\MarcoCristofori\Claude-playground\
```

Dopo la copia, la struttura deve essere:
```
Claude-playground/
├── SETUP.bat              ← Doppio click per setup
├── LAUNCH.bat             ← Doppio click per lanciare Claude Code
├── setup.ps1              ← Alternativa PowerShell
├── launch.ps1             ← Alternativa PowerShell
├── LEGGIMI.md             ← Questo file
└── soldi-persi/           ← Il progetto
    ├── CLAUDE.md          ← Claude Code legge questo automaticamente
    ├── README.md
    ├── requirements.txt
    ├── .env.example
    ├── .gitignore
    ├── docs/
    │   ├── ARCHITECTURE.md
    │   └── CLAUDE_CODE_BOOTSTRAP.md
    ├── prompts/
    │   └── agent_prompts.py
    ├── knowledge/
    │   ├── benchmark_ranges.json
    │   └── bonus_catalog_2025.json
    ├── app/
    │   ├── models/
    │   ├── agents/
    │   ├── prompts/
    │   └── utils/
    └── tests/
```

### 2️⃣ Doppio click su SETUP.bat

Questo:
- Crea il virtual environment Python
- Installa tutte le dipendenze
- Ti apre il file .env dove DEVI mettere la tua ANTHROPIC_API_KEY

**Dove trovi la API key?**
→ https://console.anthropic.com/ → API Keys → Create Key

### 3️⃣ Doppio click su LAUNCH.bat

Si apre Claude Code. Digli:

```
Leggi docs/ARCHITECTURE.md e docs/CLAUDE_CODE_BOOTSTRAP.md e costruisci tutto il progetto step by step. Parti dal punto 2 (config.py) dato che requirements.txt è già presente.
```

Claude Code costruirà TUTTO il progetto automaticamente:
- 15+ file Python
- Tutti i modelli Pydantic
- Tutti gli agenti AI
- La CLI per testare
- Il server FastAPI
- I test

### 🎯 Quando ha finito

Digli:
```
Esegui python cli.py demo e mostrami il report
```

---

## ⚠️ Prerequisiti

| Software | Come verificare | Come installare |
|----------|----------------|-----------------|
| Python 3.12+ | `python --version` | https://python.org |
| Node.js 18+ | `node --version` | https://nodejs.org |
| Claude Code | `claude --version` | `npm install -g @anthropic-ai/claude-code` |
| Git | `git --version` | https://git-scm.com |

## 💡 Tips

- Se Claude Code si ferma a metà, digli: "Continua da dove ti sei fermato"
- Se vuoi vedere cosa ha fatto: guarda nella cartella `soldi-persi/app/`
- Per committare su Git dopo che ha finito: `git add . && git commit -m "feat: Soldi Persi MVP"`
- I file in `knowledge/` contengono i dati di benchmark e il catalogo bonus — puoi aggiornarli
