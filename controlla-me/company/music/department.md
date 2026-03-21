# Ufficio Musica

## Tipo

Ufficio (Revenue) — Label virtuale AI-powered

## Missione

Aiutare artisti emergenti a trasformare i loro brani originali in hit, riarrangiandoli secondo i trend di mercato. NON generiamo musica da zero — prendiamo il demo dell'artista e lo guidiamo verso il successo commerciale.

**Claim: "Il tuo A&R personale, powered by AI."**

L'artista mantiene il 100% della proprieta intellettuale. Noi vendiamo il servizio di direzione artistica, non diritti.

## Vincolo Architetturale

- **Stesso localhost**: pattern identico a Ufficio Trading — servizio Python su stessa macchina, comunicazione via Supabase condiviso
- **Zero generazione musicale**: analizziamo e consigliamo, non creiamo audio
- **Riuso infrastruttura**: agent-runner, tier system, SSE streaming, auth, billing — tutto da Controlla.me
- **CME unico interlocutore**: nessun dipartimento parla direttamente con l'Ufficio Musica

## Stack

| Livello | Tecnologia |
|---------|-----------|
| Audio Processing | Python 3.11+ (Demucs v4, librosa, Essentia, madmom, CREPE, Basic Pitch) |
| Structure Analysis | All-In-One Music Structure Analyzer (mir-aidj) |
| Trend Data | Tunebat API, Hooktheory Trends, Last.fm, MusicBrainz |
| Direction Agent | LLM via agent-runner.ts (tier system + fallback chain) |
| Web App / UI | TypeScript/Next.js (app esistente) |
| Database | Supabase (tabelle music_*) |
| Comunicazione | Supabase + subprocess (pattern Trading) |

## Target

- **Primario**: Bedroom producer / artista indipendente (0-10K monthly listeners, 18-35 anni)
- **Secondario**: Songwriter senza produzione
- **Terziario**: Micro-label / Manager (5-20 artisti)

## Pipeline — 5 Fasi

```
FASE 1: INTAKE & ANALISI
=========================
[Demo Upload] Artista carica brano (WAV/MP3/FLAC)
     |
[Stem Separation] Demucs v4: voce, batteria, basso, armonia, FX
     |
[Audio DNA Analysis] 4 agenti in parallelo:
  - Structure Agent: BPM, beat grid, sezioni (intro/verso/chorus/bridge/outro)
  - Melody/Harmony Agent: key, progressioni, MIDI extraction, hook detection
  - Vocal Agent: range, timbro, stabilita, vibrato
  - Arrangement Agent: densita strumentale, energia per sezione, dynamic range
     |
[Commercial Viability Score] 1-10 su 5 dimensioni

FASE 2: DIAGNOSI & DIREZIONE ARTISTICA
=======================================
[Trend Analysis] Confronto con chart attuali via Tunebat + Hooktheory
     |
[Gap Analysis] Cosa funziona, cosa manca, reference track suggerite
     |
[Arrangement Prescription] Piano di riarrangiamento dettagliato e azionabile

FASE 3: ESECUZIONE GUIDATA
===========================
L'artista riarrangia nel suo DAW, guidato dal piano AI.
Review iterative: upload nuova versione -> ri-analisi -> feedback.

FASE 4: MASTERING & DISTRIBUZIONE
==================================
AI Mastering (LANDR/simili) + Metadata optimization + Distribution via DistroKid/TuneCore

FASE 5: LANCIO & CRESCITA
==========================
Release monitoring + Feedback loop + Career development
```

## Agenti (6 + 1 Orchestratore)

| # | Agente | Nome | Ruolo | Modello |
|---|--------|------|-------|---------|
| 0 | CMM | — | Chief Music Manager (orchestratore) | — |
| 1 | Audio Analyst | Luca | Stem separation + AudioDNA completo | Python (Demucs + Essentia + librosa) |
| 2 | Trend Scout | Sofia | Analisi trend mercato + reference matching | Sonnet/Gemini (analisi testuale + dati) |
| 3 | Arrangement Director | Marco | Piano riarrangiamento prescrittivo | Sonnet 4.5 (reasoning complesso) |
| 4 | Release Strategist | Elena | Metadata, pitching, timing release | Gemini Flash (veloce, dati strutturati) |
| 5 | Quality Reviewer | Dario | Review iterativa post-riarrangiamento | Sonnet 4.5 |
| 6 | Career Advisor | Rita | Analisi post-release + crescita artista | Sonnet/Gemini |

## Sinergie con Controlla.me

- **Ufficio Legale**: analisi contratti label, sync deals, publishing agreements
- **Video (Runway Gen 4.5)**: music video AI per artisti
- **Data Connector**: connettori a Spotify API, Chartmetric API
- **Billing (Stripe)**: stessa infrastruttura pagamenti

## Pricing (proposto)

| Piano | Prezzo | Include |
|-------|--------|---------|
| Free | $0 | 1 analisi demo/mese, report base |
| Artist | $9.99/mese | 5 analisi/mese, piano riarrangiamento, review iterative |
| Pro | $29.99/mese | Illimitato, release strategy, career advisor |
| Label | $99.99/mese | Multi-artista (20), dashboard, API access |

## Fasi di Deployment

| Fase | Descrizione | Effort |
|------|------------|--------|
| 0. Fondamenta | Schema DB, Demucs setup, pipeline base upload->stem | 2-3 settimane |
| 1. Core MVP | 4 agenti analisi + Direction Agent + UI /music | 3-4 settimane |
| 2. Release & Growth | Release Strategist, distribuzione, career advisor | 4-6 settimane |
| 3. Monetizzazione | Stripe billing, sync licensing, white-label | Ongoing |
