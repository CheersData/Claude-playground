# Ufficio Musica — Report di Fattibilita Tecnica

**Task**: #e95d2bc3 (parent: #697c2f5f)
**Dipartimento**: Architecture
**Data**: 2026-03-20
**Classificazione**: L2 CME — new_agent vertical

---

## 1. EXECUTIVE SUMMARY

L'Ufficio Musica e tecnicamente fattibile. L'ecosistema open-source per analisi audio e maturo (Essentia, librosa, Demucs, madmom, CREPE, Basic Pitch), e il pattern architetturale e identico a quello gia validato con l'Ufficio Trading: **servizio Python su stesso localhost, comunicazione via Supabase condiviso, orchestrazione da CME**.

Le API di trend musicali richiedono attenzione: Spotify Audio Features e deprecata dal Nov 2024. Alternative valide esistono (Tunebat API, Hooktheory Trends, Last.fm, Soundcharts). La parte piu innovativa — generare suggerimenti di riarrangiamento — si appoggia su LLM (nostro tier system) alimentati dai dati delle analisi audio, non su modelli generativi musicali.

**Effort MVP stimato**: 6-8 settimane per 1 sviluppatore Python + 2 settimane integrazione TypeScript.
**Costo infrastruttura**: ~$0/mese (librerie open-source) + costo LLM gia coperto dal tier system.

---

## 2. MODELLI AI PER ANALISI AUDIO (NON generazione)

### 2.1 Analisi Strutturale (verse, chorus, bridge)

| Tool/Modello | Tipo | Capacita | Note |
|---|---|---|---|
| **All-In-One Music Structure Analyzer** (mir-aidj) | Modello DL open-source | Beat tracking, downbeat, BPM, segmentazione funzionale (intro/verse/chorus/bridge/outro) | State-of-the-art su Harmonix Set. Output: timestamps + label per sezione. Disponibile su Replicate API. Basato su Neighborhood Attentions su audio demixato |
| **madmom** | Libreria Python | Beat tracking, onset detection, downbeat, chord recognition | Top rank MIREX. DeepChromaChordRecognitionProcessor per accordi maggiori/minori via CRF |
| **librosa** | Libreria Python | Recurrence matrix, time-lag representation, sequentially constrained clustering per segmentazione strutturale | Standard de facto per prototyping MIR. Funzioni per chromagram, MFCC, mel-spectrogram |
| **Essentia** | Libreria C++/Python | BPM, key, pitch, chromaprint fingerprint, mood/genre classification, real-time | Sviluppata dal Music Technology Group (UPF Barcelona). Anche in JavaScript (essentia.js) |

**Raccomandazione**: All-In-One come modello primario per segmentazione strutturale, con madmom per beat/chord tracking e librosa per feature extraction di supporto.

### 2.2 Analisi Armonica (key, chord progressions, modulazioni)

| Tool/Modello | Capacita | Dettagli |
|---|---|---|
| **Essentia** | Key detection, chord estimation | Algoritmi basati su profili tonali (Krumhansl-Kessler, Temperley) |
| **madmom DeepChromaChordRecognitionProcessor** | Riconoscimento accordi major/minor da deep chroma vectors + CRF | Pipeline: DeepChromaProcessor -> ChordRecognitionProcessor |
| **Basic Pitch** (Spotify, open-source) | Audio-to-MIDI polifonico con pitch bend detection | <20MB memoria, <17K parametri. Basato su CREPE. Rileva vibrato, glissando, bends. Output MIDI analizzabile per progressioni |
| **Hooktheory TheoryTab** | Database statistico: 40.000+ brani analizzati con probabilita di progressioni | API disponibile. Fornisce probabilita condizionate: "dato l'accordo X, il successivo e Y con probabilita Z%" |
| **Chordino** (VAMP plugin) | Chord recognition con tuning estimation | Integrabile in pipeline Python via librosa/vamp |

**Raccomandazione**: Pipeline combinata — Essentia per key detection, madmom per chord recognition frame-by-frame, Basic Pitch per MIDI extraction, Hooktheory per confronto statistico con hit.

### 2.3 Analisi Melodica (contour, range, hooks)

| Tool/Modello | Capacita | Dettagli |
|---|---|---|
| **CREPE** | Pitch tracking monofonico ad alta precisione | CNN su waveform 16kHz, hop 10ms, output: timestamp + F0 Hz + confidence. Superiore a pYIN e SWIPE |
| **Basic Pitch** (Spotify) | Pitch tracking polifonico + pitch bend | Estensione di CREPE per multi-strumento. Output MIDI con note-on/off + pitch bend |
| **librosa.piptrack** | Pitch tracking basato su spectral analysis | Meno preciso di CREPE ma integrato nativamente |
| **Melodia** (Salamon & Gomez) | Estrazione melodia predominante da audio polifonico | Algoritmo classico, integrabile via VAMP |

**Raccomandazione**: CREPE per analisi vocale (dopo stem separation), Basic Pitch per analisi melodica polifonica completa. Da MIDI si estraggono: range (nota min/max), contour (direzione intervalli), ripetizioni (hook detection via pattern matching).

### 2.4 Analisi Arrangiamento (strumentazione, layering, dinamiche)

| Tool/Modello | Capacita | Dettagli |
|---|---|---|
| **Demucs v4** (Meta, HTDemucs) | Stem separation: vocals, drums, bass, other (+ piano, guitar in 6-stem) | SDR 9.20 dB su MUSDB HQ. Hybrid Transformer. Modello default: htdemucs. Fine-tuned: htdemucs_ft (4x piu lento, qualita migliore) |
| **Essentia** | Energy, loudness, dynamic range, spectral complexity per frame | Estrazione low-level features su ogni stem separato |
| **librosa** | HPSS (harmonic-percussive separation), spectral contrast, bandwidth | Utile per analisi dinamiche post-stem separation |

**Raccomandazione**: Demucs v4 come primo step per separare gli stem, poi analisi individuale di ogni stem con Essentia/librosa. Questo rivela: quali strumenti sono presenti, il loro ruolo (melodico/ritmico/armonico), densita dell'arrangiamento per sezione, curve di energia/dinamica.

---

## 3. MODELLI AI PER TREND ANALYSIS

### 3.1 Stato delle API Dati Musicali (Marzo 2026)

| API/Database | Stato | Dati disponibili | Costo |
|---|---|---|---|
| **Spotify Audio Features** | DEPRECATA (Nov 2024) | BPM, key, energy, danceability, valence — solo per app con quota extension pre-Nov 2024 | N/A |
| **Tunebat Music Metadata API** | ATTIVA | 70M+ tracce: BPM, key, energy, danceability, happiness, popularity | Pricing non pubblico |
| **Hooktheory Trends API** | ATTIVA | 40K+ brani: probabilita progressioni accordali, statistiche per genere/epoca | API documentata |
| **Last.fm API** | ATTIVA | Metadata artisti/tracce, tag, scrobble data (popolarita reale) | Gratuita |
| **MusicBrainz API** | ATTIVA | Metadata strutturato: artisti, release, recording, ISRC, genere | Gratuita, rate-limited |
| **Soundcharts API** | ATTIVA | Chart rankings real-time, playlist monitoring, radio airplay 87 paesi, social media | Da $10/mese (entry) a $250+/mese (enterprise) |
| **Cyanite AI API** | ATTIVA | Auto-tagging AI (mood, genre, energy, instrumentazione) per cataloghi | 290 euro/mese + volume |
| **AcousticBrainz** | CHIUSO (2022) | Archivio storico ancora accessibile. Nessun nuovo dato | Gratuito (archivio) |

### 3.2 Strategia di Trend Analysis Raccomandata

**Approccio a 3 livelli:**

1. **Analisi locale** (zero costi): Essentia/librosa analizzano il brano dell'artista estraendo le feature audio (BPM, key, energy, loudness curve, chord progression, struttura)

2. **Confronto con mercato** (costi variabili):
   - Tunebat API per dati audio di riferimento su brani di successo nello stesso genere
   - Hooktheory Trends per statistiche sulle progressioni piu usate (es. "nel pop 2025, I-V-vi-IV compare nel 23% dei brani Top 100")
   - Last.fm + MusicBrainz per metadata e popolarita
   - Soundcharts per chart performance e trend playlist (se budget lo permette)

3. **Sintesi LLM** (costo gia coperto dal tier system): I dati di analisi locale + dati di mercato vengono passati a un LLM (via nostro agent-runner con fallback chain) che genera il report di direzione artistica

**Nota critica su Spotify**: L'API Audio Features e deprecata. Non progettare la pipeline attorno a Spotify. Tunebat e il sostituto naturale piu completo (70M+ tracce, stesse metriche).

---

## 4. ANALISI VOCALE

| Tool/Modello | Capacita | Uso nel nostro contesto |
|---|---|---|
| **CREPE** | F0 tracking ad alta precisione (CNN, 10ms hop) | Range vocale (nota piu bassa/alta), stabilita pitch, vibrato detection |
| **Demucs v4** | Isolamento stem vocale | Pre-processing obbligatorio prima di analisi vocale |
| **librosa** | MFCC, spectral centroid, spectral rolloff | Classificazione timbrica (bright/dark/nasal/breathy) via feature vector |
| **Essentia** | Pitch confidence, loudness curve | Potenza vocale per sezione, dinamica espressiva |
| **SonarWorks SoundID VoiceAI** | Match vocale con traccia di riferimento | Commerciale. Interessante per "la tua voce ricorda X, ottimizza per quel range" |

**Pipeline vocale raccomandata**:
```
Audio originale
  -> Demucs v4 (isolamento vocale)
  -> CREPE (pitch tracking: range, stabilita, vibrato rate)
  -> librosa MFCC (timbro: bright/warm/nasal)
  -> Essentia (loudness curve, dinamica)
  -> Output: profilo vocale strutturato JSON
```

---

## 5. PIPELINE TECNICA PROPOSTA

### 5.1 Architettura

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UFFICIO MUSICA — PIPELINE                         │
│                                                                      │
│  UPLOAD (MP3/WAV/FLAC)                                              │
│      |                                                               │
│  [1] STEM SEPARATION (Demucs v4 HTDemucs)                          │
│      -> vocals, drums, bass, other (+piano, +guitar se 6-stem)     │
│      |                                                               │
│  [2] MULTI-AGENT ANALYSIS (parallelo)                               │
│      |                                                               │
│      ├── [2a] STRUCTURE AGENT                                       │
│      │   All-In-One Analyzer: BPM, beat grid, sezioni              │
│      │   + madmom: chord progression per sezione                    │
│      │   + Essentia: key, mode (major/minor)                        │
│      │                                                               │
│      ├── [2b] MELODY/HARMONY AGENT                                  │
│      │   Basic Pitch: audio-to-MIDI polifonico                     │
│      │   + CREPE: pitch contour stem melodico principale            │
│      │   + Analisi progressioni: confronto con Hooktheory           │
│      │                                                               │
│      ├── [2c] VOCAL AGENT                                           │
│      │   CREPE su stem vocale: range, stabilita, vibrato           │
│      │   + librosa MFCC: timbro                                     │
│      │   + Essentia: dinamica vocale per sezione                    │
│      │                                                               │
│      └── [2d] ARRANGEMENT AGENT                                     │
│          Analisi per-stem: energy curve, spectral features          │
│          + Densita strumentale per sezione                           │
│          + Dynamic range e loudness war check                        │
│                                                                      │
│  [3] MARKET COMPARISON                                              │
│      Tunebat API: BPM/key/energy di brani simili in classifica     │
│      + Hooktheory: progressioni piu usate nel genere                │
│      + Last.fm/MusicBrainz: tag genere, artisti simili             │
│      + (opzionale) Soundcharts: chart + playlist placement          │
│                                                                      │
│  [4] DIRECTION AGENT (LLM via agent-runner)                        │
│      Input: analisi completa + dati mercato                         │
│      Output strutturato JSON:                                        │
│      {                                                               │
│        structureSuggestions: [...],   // riarrangiamento sezioni    │
│        harmonySuggestions: [...],     // cambi key, progressioni    │
│        tempoSuggestions: {...},       // BPM adjustments            │
│        arrangementSuggestions: [...], // strumentazione, layering   │
│        vocalSuggestions: [...],       // range, tecnica, effetti    │
│        marketFit: { score, analysis } // quanto e "chart-ready"    │
│      }                                                               │
│                                                                      │
│  [5] REPORT SSE STREAMING (riuso infra Controlla.me)                │
│      -> Progress real-time per ogni fase                             │
│      -> Report finale interattivo                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Stack Tecnologico

| Componente | Tecnologia | Motivazione |
|---|---|---|
| Audio processing | **Python 3.11+** (come Ufficio Trading) | Ecosistema MIR e esclusivamente Python (Demucs, librosa, Essentia, madmom, CREPE) |
| Web app / UI | **TypeScript/Next.js** (app esistente) | Riuso completo: upload, SSE streaming, auth, pagamenti, tier system |
| Agent orchestration | **agent-runner.ts** (esistente) | Riuso catene di fallback N-modelli per il Direction Agent |
| Database | **Supabase** (condiviso) | Tabelle `music_*` per analisi, profili artista, trend cache |
| Comunicazione Python-TS | **Supabase + subprocess** (pattern Trading) | Python scrive risultati su DB, TypeScript li legge e streamma via SSE |
| File processing | **FastAPI** (nuovo) o subprocess | Per stem separation pesante, serve un worker async |

### 5.3 Dipendenze Python (nuovo `music/pyproject.toml`)

```toml
[project]
dependencies = [
    # Stem separation
    "demucs>=4.0.0",          # Meta HTDemucs (richiede torch)
    "torch>=2.0.0",           # Backend Demucs + CREPE

    # Audio analysis
    "librosa>=0.10.0",        # Feature extraction, HPSS, chromagram
    "essentia>=2.1b6",        # Key, BPM, mood, energy, loudness
    "madmom>=0.16.1",         # Beat/chord tracking (top MIREX)
    "crepe>=0.0.16",          # Pitch tracking vocale ad alta precisione
    "basic-pitch>=0.3.0",     # Audio-to-MIDI polifonico (Spotify)
    "allin1>=1.0.0",          # All-In-One Structure Analyzer (mir-aidj)

    # Data
    "pandas>=2.2.0",
    "numpy>=1.26.0",

    # Database
    "supabase>=2.9.0",

    # Config
    "pydantic>=2.9.0",
    "pydantic-settings>=2.6.0",

    # API clients (trend data)
    "httpx>=0.27.0",          # Async HTTP per Tunebat, Hooktheory, Last.fm

    # Logging
    "structlog>=24.4.0",
]
```

**Nota su torch**: Demucs richiede PyTorch. Su macchina senza GPU, usa CPU (piu lento ma funziona). Per MVP e accettabile. Con GPU: stem separation in ~30s anziche ~3min per brano.

---

## 6. RIUSO INFRASTRUTTURA CONTROLLA.ME

### Componenti riusabili al 100%

| Componente | File | Riuso |
|---|---|---|
| Tier system + fallback chains | `lib/tiers.ts` | Direction Agent usa stessa catena degli agenti legali |
| Agent runner | `lib/ai-sdk/agent-runner.ts` | `runAgent("music-director", prompt)` — basta aggiungere "music-director" a AGENT_CHAINS |
| SSE streaming | Pattern da `app/api/analyze/route.ts` | Identica architettura: progress per fase, timing, complete |
| Auth + RLS | `lib/supabase/`, middleware | Stesso flusso utente, stesse protezioni |
| Upload | `components/UploadZone.tsx` | Adattare accept types per audio (MP3/WAV/FLAC) |
| Progress UI | `components/AnalysisProgress.tsx` | Ridisegnare fasi ma stessa logica (cerchio, timeline, ETA) |
| Cost tracking | `lib/company/cost-logger.ts` | Logging automatico chiamate LLM |
| Rate limiting | `lib/middleware/rate-limit.ts` | Stesso middleware |
| CSRF/Sanitize | `lib/middleware/` | Stesso stack security |

### Componenti da creare ex-novo

| Componente | Effort | Descrizione |
|---|---|---|
| Worker Python audio | 3-4 settimane | Pipeline Demucs + analisi multi-agente Python |
| API bridge TS-Python | 1 settimana | Route Next.js che invoca worker Python (subprocess o HTTP) |
| Agenti prompt musicali | 1-2 settimane | Prompt per Direction Agent (suggerimenti riarrangiamento) |
| UI risultati musicali | 2 settimane | Visualizzazione waveform, struttura, suggerimenti |
| Schema DB `music_*` | 2-3 giorni | Tabelle analisi, profili, trend cache |
| Integrazione API trend | 1 settimana | Client Tunebat + Hooktheory + Last.fm |

---

## 7. EFFORT E TIMELINE MVP

### Fase 0: Fondamenta (settimana 1-2)
- Setup `music/` directory (pattern Trading)
- `pyproject.toml` con dipendenze
- Schema DB migration `music_analyses`, `music_artist_profiles`, `music_trend_cache`
- Pipeline base: upload audio -> Demucs stem separation -> salva su filesystem

### Fase 1: Analisi Audio (settimana 3-5)
- Agente Structure: All-In-One + madmom + Essentia
- Agente Melody/Harmony: Basic Pitch + CREPE + Hooktheory lookup
- Agente Vocal: CREPE su stem vocale + MFCC timbro
- Agente Arrangement: analisi per-stem con Essentia/librosa
- Output: JSON strutturato completo del brano

### Fase 2: Market Comparison (settimana 5-6)
- Client Tunebat API (BPM/key/energy brani di riferimento)
- Client Hooktheory Trends (progressioni statistiche per genere)
- Client Last.fm (artisti simili, tag genere)
- Cache risultati in `music_trend_cache` (TTL 7 giorni)

### Fase 3: Direction Agent + UI (settimana 6-8)
- Prompt engineering per Music Direction Agent
- Aggiunta "music-director" a `AGENT_CHAINS` in `lib/tiers.ts`
- SSE streaming da `app/api/music/analyze/route.ts`
- UI: upload, progress, report interattivo
- Pagina `/music` con risultati

### Totale: ~8 settimane per MVP funzionante

---

## 8. RISCHI E MITIGAZIONI

| Rischio | Impatto | Probabilita | Mitigazione |
|---|---|---|---|
| **Demucs lento senza GPU** | Stem separation ~3min/brano su CPU | Alta (no GPU su VPS demo) | Accettabile per MVP. Queue async. Upgrade GPU quando necessario |
| **Tunebat API non pubblica** | Pricing sconosciuto, possibile chiusura | Media | Fallback: analisi locale con Essentia + database Hooktheory |
| **Qualita suggerimenti LLM** | Il Direction Agent potrebbe dare consigli generici | Media | Prompt engineering iterativo. Includere esempi concreti nel prompt. Feedback loop |
| **Dimensione dipendenze PyTorch** | ~2GB disk per torch + Demucs | Bassa (gia gestito in Trading) | torch CPU-only (`--index-url https://download.pytorch.org/whl/cpu`) riduce a ~800MB |
| **Copyright e fair use** | Analisi di brani di terzi per trend comparison | Bassa | Solo metadati/features, mai audio. Stesse protezioni di Shazam/Tunebat |
| **Complessita dominio musicale** | Validazione suggerimenti richiede expertise | Media | Beta con artisti reali. Feedback del boss (musicista?) per calibrare |

---

## 9. COSTI STIMATI

| Voce | Costo/mese | Note |
|---|---|---|
| Librerie audio (Essentia, librosa, Demucs, madmom, CREPE, Basic Pitch) | **$0** | Tutto open-source |
| LLM Direction Agent | **~$0.01-0.05/analisi** | Coperto dal tier system esistente |
| Tunebat API | **TBD** | Pricing da richiedere. Alternativa: solo Hooktheory (gratis) + analisi locale |
| Hooktheory API | **$0** (basic) | Free tier disponibile |
| Last.fm API | **$0** | Gratuita |
| MusicBrainz API | **$0** | Gratuita |
| Soundcharts | **$10-250/mese** | Solo se necessario per chart monitoring. Non critico per MVP |
| GPU (futuro) | **$20-50/mese** | Solo quando volume lo richiede. MVP su CPU |
| **TOTALE MVP** | **~$0-10/mese** | Prevalentemente gratis |

---

## 10. CONFRONTO CON CONCORRENTI

| Piattaforma | Cosa fa | Differenza dal nostro approccio |
|---|---|---|
| **Cyanite.ai** | Auto-tagging AI (mood, genre, energy) per cataloghi | Solo tagging/ricerca, nessun suggerimento di riarrangiamento. 290 euro/mese |
| **LANDR** | Mastering AI + chord suggestion (Composer plugin) | Focus su mastering/mixing, non direzione artistica. Il plugin Composer e limitato |
| **Hookpad** (Hooktheory) | Songwriting tool con AI chord suggestions | Tool di composizione, non analisi di brani esistenti |
| **Bridge.audio** | AI music analyzer per sync licensing | Tagging per placement, non riarrangiamento |
| **Soundverse** | AI music generation + structure detection | Focus su generazione, non analisi/consulenza |
| **Noi (Ufficio Musica)** | Analisi completa + confronto mercato + suggerimenti di riarrangiamento actionable | **Unico nel combinare analisi tecnica + trend data + suggerimenti LLM specifici** |

**Vantaggio competitivo**: nessuno dei competitor offre il ciclo completo "analisi del tuo brano -> confronto con hit dello stesso genere -> suggerimenti specifici di riarrangiamento". La maggior parte fa solo tagging o solo generazione.

---

## 11. DECISIONE ARCHITETTURALE

### Architettura raccomandata: "Music Office" come nuovo verticale

```
controlla-me/
├── music/                         # Nuovo — pattern identico a trading/
│   ├── pyproject.toml
│   ├── src/
│   │   ├── config/settings.py     # Pydantic settings
│   │   ├── agents/
│   │   │   ├── stem_separator.py  # Demucs v4
│   │   │   ├── structure_analyzer.py  # All-In-One + madmom
│   │   │   ├── melody_analyzer.py # Basic Pitch + CREPE
│   │   │   ├── vocal_analyzer.py  # CREPE + MFCC su stem vocale
│   │   │   └── arrangement_analyzer.py # Per-stem analysis
│   │   ├── market/
│   │   │   ├── tunebat_client.py
│   │   │   ├── hooktheory_client.py
│   │   │   └── lastfm_client.py
│   │   ├── pipeline.py            # Orchestratore analisi
│   │   └── utils/
│   │       ├── db.py              # CRUD Supabase music_*
│   │       └── logging.py
│   └── tests/
│
├── app/
│   ├── music/page.tsx             # Pagina UI
│   └── api/music/
│       └── analyze/route.ts       # SSE streaming (riuso pattern /api/analyze)
│
├── lib/
│   ├── tiers.ts                   # + "music-director" in AGENT_CHAINS
│   ├── prompts/
│   │   └── music-director.ts      # Prompt per suggerimenti riarrangiamento
│   └── agents/
│       └── music-director.ts      # Agente LLM direzione artistica
│
└── company/music/                 # Company structure
    ├── department.md
    ├── status.json
    ├── agents/
    └── runbooks/
```

### Motivazione

1. **Pattern provato**: identico a Ufficio Trading (Python su localhost, Supabase condiviso)
2. **Riuso massimo**: auth, pagamenti, tier system, SSE, upload, security middleware — tutto gia pronto
3. **Isolamento**: dipendenze Python pesanti (PyTorch/Demucs) non impattano l'app Next.js
4. **Scalabilita**: domani si puo spostare il worker Python su container dedicato senza cambiare l'API

---

## 12. FONTI E RIFERIMENTI

### Librerie e Modelli
- [Essentia — MTG/UPF Barcelona](https://essentia.upf.edu/)
- [librosa — Audio and Music Analysis in Python](https://github.com/librosa/librosa)
- [Demucs v4 — Meta/Facebook Research](https://github.com/facebookresearch/demucs)
- [madmom — CPJKU](https://github.com/CPJKU/madmom)
- [CREPE — MARL](https://github.com/marl/crepe)
- [Basic Pitch — Spotify](https://github.com/spotify/basic-pitch)
- [All-In-One Music Structure Analyzer — mir-aidj](https://github.com/mir-aidj/all-in-one)
- [Meta AudioCraft/EnCodec](https://github.com/facebookresearch/audiocraft)

### API Dati Musicali
- [Tunebat Music Metadata API](https://tunebat.com/API)
- [Hooktheory Trends API](https://www.hooktheory.com/api/trends/docs)
- [Last.fm API](https://www.last.fm/api)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Soundcharts API](https://soundcharts.com/en/api-data-for-music-industry)
- [Cyanite AI API](https://cyanite.ai/)

### Deprecazioni e Cambiamenti
- [Spotify Audio Features API — deprecata Nov 2024](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- [AcousticBrainz — chiuso 2022](https://acousticbrainz.org/)

### Ricerca Accademica
- [All-In-One Metrical And Functional Structure Analysis (arXiv 2307.16425)](https://arxiv.org/abs/2307.16425)
- [Q&A: Query-Based Multi-Track Music re-Arrangement](https://www.researchgate.net/publication/371291027)
- [AI Music Analysis 2026 — Soundcharts](https://soundcharts.com/en/blog/ai-music-analysis-2026)
- [SpecTTTra — Spectro-Temporal Tokens Transformer per audio](https://transactions.ismir.net/articles/10.5334/tismir.254)

---

## 13. VERDETTO

| Criterio | Valutazione |
|---|---|
| Fattibilita tecnica | **ALTA** — tutti i componenti esistono e sono maturi |
| Riuso infrastruttura | **MOLTO ALTO** — ~60% del codice e riusabile |
| Costo MVP | **BASSO** — ~$0-10/mese (tutto open-source + tier system) |
| Time to MVP | **MEDIO** — 6-8 settimane |
| Vantaggio competitivo | **ALTO** — nessun competitor offre il ciclo completo analisi+trend+suggerimenti |
| Rischio tecnico | **BASSO-MEDIO** — unico rischio significativo e la qualita dei suggerimenti LLM |

**Raccomandazione: PROCEDERE con MVP.** L'investimento e basso, il riuso e alto, e il posizionamento di mercato e unico.

Prossimo step: task Strategy (#4a65d87b) per mappare le professioni dell'etichetta e definire gli agenti necessari. Poi Architecture implementa le fondamenta (Fase 0).
