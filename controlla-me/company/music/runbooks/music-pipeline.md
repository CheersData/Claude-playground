# Runbook: Music Analysis Pipeline

## Prerequisiti

- Python 3.11+ installato
- `music/` dependencies installate (`pip install -e .`)
- Demucs v4 scaricato (auto-download al primo run)
- Supabase con tabelle `music_*` migrate
- API keys: Tunebat (opzionale), Hooktheory (opzionale)

## Pipeline Completa

### Fase 1: Intake & Analisi

```bash
# 1. Upload audio (gestito da Next.js /api/music/upload)
# Il file viene salvato temporaneamente e passato al worker Python

# 2. Stem separation
cd music && python -m src.agents.stem_separator --input /path/to/track.mp3

# 3. Multi-agent analysis (parallelo)
python -m src.pipeline analyze /path/to/track.mp3
# Esegue in parallelo: structure, melody, vocal, arrangement
# Output: AudioDNA JSON salvato in music_analyses
```

### Fase 2: Market Comparison

```bash
# Automatico nella pipeline - query API trend
# Tunebat + Hooktheory + Last.fm
# Output: TrendReport JSON
```

### Fase 3: Direction Agent

```bash
# Invocato via agent-runner.ts (TypeScript)
# POST /api/music/analyze con AudioDNA + TrendReport
# Output: ArrangementPlan JSON via SSE streaming
```

### Fase 4: Review Iterativa

```bash
# Artista ricarica nuova versione
# POST /api/music/review con nuova versione + ArrangementPlan originale
# Quality Reviewer confronta e produce QualityReport
```

## Troubleshooting

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| Demucs lento (>5min) | CPU-only, brano lungo | Accettabile per MVP. Upgrade GPU quando necessario |
| Stem separation artefatti | Brano con mixing denso | Usare htdemucs_ft (4x piu lento, qualita migliore) |
| Tunebat API timeout | Rate limit o downtime | Fallback su Hooktheory + analisi locale Essentia |
| AudioDNA incompleto | Brano troppo corto (<30s) | Minimo 30 secondi richiesti. Errore user-friendly |
| Key detection errata | Brano modulante o atonale | Fallback: riportare "uncertain" e lasciare all'Arrangement Director |

## Metriche da Monitorare

- Tempo totale pipeline (target: < 5 min CPU, < 1 min GPU)
- Tasso errore per agente
- Costo LLM per analisi
- Queue depth (brani in attesa)
