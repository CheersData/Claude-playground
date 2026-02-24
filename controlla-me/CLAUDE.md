# CLAUDE.md — Istruzioni per agenti AI

> Tutto ciò che un agente AI deve sapere per sviluppare, deployare e mantenere **controlla.me** — app di analisi legale AI con 4 agenti specializzati.

---

## 1. STACK TECNOLOGICO

| Livello | Tecnologia | Versione |
|---------|-----------|----------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Linguaggio | TypeScript (strict) | 5 |
| CSS | Tailwind CSS 4 + PostCSS | 4 |
| Animazioni | Framer Motion | 12.34.2 |
| Icone | Lucide React | 0.575.0 |
| AI/LLM | @anthropic-ai/sdk | 0.77.0 |
| Embeddings | Voyage AI (voyage-law-2) | API HTTP |
| Vector DB | Supabase pgvector (HNSW) | via PostgreSQL |
| Database | Supabase (PostgreSQL + RLS) | 2.97.0 |
| Auth | Supabase Auth (OAuth) | via @supabase/ssr |
| Pagamenti | Stripe | 20.3.1 |
| PDF | pdf-parse | 2.4.5 |
| DOCX | mammoth | 1.11.0 |
| OCR | tesseract.js (non ancora implementato) | 7.0.0 |
| Font | DM Sans + Instrument Serif | Google Fonts |

---

## 2. SETUP E INSTALLAZIONE

### Prerequisiti

- Node.js 18+
- Account Supabase (progetto creato)
- Account Stripe (products creati)
- API key Anthropic

### Installazione

```bash
cd controlla-me
npm install
cp .env.local.example .env.local
# Compila tutte le variabili in .env.local
```

### Variabili d'ambiente richieste

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # Solo server-side

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_SINGLE_PRICE_ID=price_...

# Voyage AI (embeddings per vector DB — opzionale)
VOYAGE_API_KEY=pa-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Database setup

```bash
# Esegui le migrazioni in ordine su Supabase SQL Editor:
# 1. supabase/migrations/001_initial.sql       -> Profili, analisi, deep_searches, lawyer_referrals + RLS
# 2. supabase/migrations/002_usage_tracking.sql -> Funzioni increment + reset mensile
```

### Avvio

```bash
npm run dev     # http://localhost:3000
npm run build   # Build produzione
npm run start   # Server produzione
```

### Config critica: next.config.ts

```typescript
// pdf-parse DEVE essere dichiarato come external package
serverExternalPackages: ["pdf-parse"]
```

---

## 3. ARCHITETTURA DIRECTORY

```
controlla-me/
├── app/
│   ├── layout.tsx                 # Root layout (font, metadata)
│   ├── page.tsx                   # Landing page + orchestratore analisi (~1160 righe)
│   ├── globals.css                # Tailwind + animazioni custom
│   ├── dashboard/page.tsx         # Storico analisi utente
│   ├── pricing/page.tsx           # Piani (Free/Pro/Single)
│   ├── analysis/[id]/page.tsx     # Dettaglio analisi
│   ├── corpus/page.tsx            # Navigazione corpus legislativo
│   └── api/
│       ├── analyze/route.ts       # CORE - SSE streaming analisi
│       ├── upload/route.ts        # Estrazione testo da file
│       ├── deep-search/route.ts   # Ricerca approfondita clausole
│       ├── vector-search/route.ts # Ricerca semantica vector DB
│       ├── corpus/route.ts           # Gestione corpus legislativo
│       ├── corpus/hierarchy/route.ts # Fonti e albero navigabile
│       ├── session/[sessionId]/route.ts  # Cache sessioni
│       ├── user/usage/route.ts    # Limiti utilizzo
│       ├── auth/callback/route.ts # OAuth Supabase
│       ├── stripe/checkout/route.ts
│       ├── stripe/portal/route.ts
│       └── webhook/route.ts       # Webhook Stripe
│
├── components/                    # 17 componenti React
│   ├── Navbar.tsx                # Nav + menu mobile
│   ├── HeroSection.tsx           # Typewriter hero + elementi flottanti
│   ├── MissionSection.tsx        # Come funziona (4 step)
│   ├── TeamSection.tsx           # 4 avatar agenti (SVG)
│   ├── VideoShowcase.tsx         # Player video con autoplay
│   ├── UseCasesSection.tsx       # Casi d'uso a tab
│   ├── TestimonialsSection.tsx   # Carosello testimonianze
│   ├── UploadZone.tsx            # Drag-drop upload
│   ├── AnalysisProgress.tsx      # Progress real-time (643 righe)
│   ├── ResultsView.tsx           # Vista risultati
│   ├── RiskCard.tsx              # Card rischio + deep search
│   ├── DeepSearchChat.tsx        # Chat Q&A su clausole
│   ├── FairnessScore.tsx         # Indicatore circolare 1-10
│   ├── LawyerCTA.tsx             # Raccomandazione avvocato
│   ├── PaywallBanner.tsx         # Banner limite utilizzo
│   ├── CTASection.tsx            # Call-to-action
│   └── Footer.tsx                # Footer
│
├── lib/
│   ├── anthropic.ts              # Client Claude + retry rate limit
│   ├── embeddings.ts             # Client Voyage AI per embeddings
│   ├── vector-store.ts           # RAG: chunk, index, search, buildRAGContext
│   ├── legal-corpus.ts           # Ingest e query corpus legislativo
│   ├── extract-text.ts           # Estrazione PDF/DOCX/TXT
│   ├── analysis-cache.ts         # Cache analisi su filesystem
│   ├── stripe.ts                 # Config Stripe + piani
│   ├── types.ts                  # Interfacce TypeScript
│   ├── agents/
│   │   ├── orchestrator.ts       # Pipeline 4 agenti
│   │   ├── classifier.ts         # Agente 1: classificazione
│   │   ├── analyzer.ts           # Agente 2: analisi rischi
│   │   ├── investigator.ts       # Agente 3: ricerca legale
│   │   └── advisor.ts            # Agente 4: consiglio finale
│   ├── prompts/
│   │   ├── classifier.ts         # Prompt classificatore
│   │   ├── analyzer.ts           # Prompt analista
│   │   ├── investigator.ts       # Prompt investigatore
│   │   └── advisor.ts            # Prompt consigliere
│   └── supabase/
│       ├── client.ts             # Client browser
│       ├── server.ts             # Client SSR
│       └── admin.ts              # Client admin (webhook)
│
├── supabase/migrations/           # SQL per setup DB
├── public/videos/                 # Video generati AI
└── .analysis-cache/               # Cache analisi (gitignored)
```

---

## 4. SISTEMA MULTI-AGENTE (IL CUORE)

### Pipeline con RAG

```
Documento
   |
[1] CLASSIFIER (Haiku 4.5, ~12s)
   -> Tipo, sotto-tipo, istituti giuridici, focus areas, leggi
   |
[1.5] RETRIEVAL (Vector DB, ~2s)
   -> Lookup diretto per leggi identificate
   -> Ricerca per istituti giuridici
   -> Ricerca semantica per clausole
   -> Contesto da analisi precedenti (knowledge base)
   |
[2] ANALYZER (Sonnet 4.5, ~25s) + contesto normativo verificato
   -> Clausole rischiose con framework normativo corretto
   |
[2.5] RETRIEVAL (Vector DB, ~1s)
   -> Ricerca semantica per clausole problematiche trovate
   |
[3] INVESTIGATOR (Sonnet 4.5 + web_search, ~30s) + contesto legale + RAG
   -> Copre TUTTE le clausole critical e high
   |
[4] ADVISOR (Sonnet 4.5, ~18s) + RAG per calibrazione mercato
   -> Scoring multidimensionale (4 dimensioni), max 3 rischi, max 3 azioni
   |
[5] AUTO-INDEX (background, ~5s)
   -> Salva conoscenza nel vector DB per analisi future
```

### Scelta dei modelli

| Agente | Modello | Perche |
|--------|---------|--------|
| Classifier | `claude-haiku-4-5-20251001` | Prompt profondo compensa, velocita |
| Analyzer | `claude-sonnet-4-5-20250929` | Analisi profonda con contesto normativo |
| Investigator | `claude-sonnet-4-5-20250929` | Upgrade da Haiku: query migliori, copertura completa |
| Advisor | `claude-sonnet-4-5-20250929` | Output finale + scoring multidimensionale |

### Regole dei prompt

1. **Output JSON puro** — Mai markdown, mai backtick, mai testo extra
2. **Inizia con `{` e finisci con `}`** — Esplicito in ogni prompt
3. **Agente analista: punto di vista parte debole** (consumatore/conduttore/lavoratore)
4. **Investigatore: NON inventare sentenze** — Scrivere "orientamento non verificato" se non trovato
5. **Consigliere: linguaggio da bar** — Zero legalese, frasi brevi, come spiegare a un amico
6. **Limiti output**: max 3 rischi, max 3 azioni (evita wall of text)
7. **Fairness score calibrato**: 9-10 equilibrato, 5-6 problemi, 1-2 gravemente squilibrato
8. **`needsLawyer: true` solo per problemi seri** — Non allarmismo gratuito

### Come scrivere un prompt agente efficace

```typescript
export const NOME_SYSTEM_PROMPT = `[Ruolo]. [Compito specifico].

IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. NON usare backtick, code fence, markdown.
La tua risposta deve iniziare con { e finire con }.

Formato richiesto:
{
  "campo1": "tipo",
  "campo2": [{ "nested": "valore" }]
}

Regole:
- [Vincolo 1]
- [Vincolo 2]
- Campi incerti = null. Non inventare dati assenti.`;
```

### Parsing JSON robusto

Il parser in `lib/anthropic.ts` gestisce risposte imperfette con fallback chain:

```
1. Parse diretto
2. Strip code fences
3. Regex estrazione { ... } o [ ... ]
4. Errore dettagliato con primi 200 char della risposta
```

---

## 5. EVITARE IL THROTTLING API (LEZIONE CRITICA)

### Problema

L'API Anthropic ha rate limit per minuto. Con 4 agenti sequenziali si rischia il 429.

### Soluzione implementata: lib/anthropic.ts

```typescript
const MAX_RETRIES = 6;

for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  try {
    response = await client.messages.create(params);
    break;
  } catch (err) {
    const isRateLimit = err.message.includes("rate_limit");
    const status = err.status;
    if ((status === 429 || isRateLimit) && attempt < MAX_RETRIES) {
      // Rate limit e' per minuto -> attendi 60s fissi
      await new Promise(r => setTimeout(r, 60_000));
      continue;
    }
    throw err;
  }
}
```

### Strategie anti-throttling (ordine di importanza)

1. **Retry 60s fisso su 429** — Il rate limit e' per minuto, aspetti 1 minuto esatto
2. **Distribuisci i modelli** — Haiku per task semplici (classifier, investigator), Sonnet per task complessi (analyzer, advisor). Riduce token consumati
3. **Cache aggressiva** — SHA256 del documento, se gia analizzato salta le fasi completate. Risparmio 50%+ chiamate API
4. **Limita le iterazioni** — Investigator: max 5 tool_use loop. Deep search: max 8 iterazioni
5. **Limita i token output** — Ogni agente ha max_tokens calibrato: 4096, 8192, 6144, 4096
6. **Usage limits per utente** — Free: 3 analisi/mese. Previene abuso
7. **Logging dettagliato** — Logga token in/out, tempo, stop_reason per ogni chiamata

### Pattern logging API

```
[API] -> CLASSIFIER | model: claude-haiku-4.5 | max_tokens: 4096 | input: ~5000 chars
[API] <- CLASSIFIER | 12.3s | tokens: 450 in / 1200 out | stop: end_turn | 5420 chars
```

---

## 6. SISTEMA DI CACHE

### Come funziona

```
Documento -> SHA256 hash (primi 16 char) -> sessionId = hash-timestamp
```

Cache su filesystem in `.analysis-cache/sessionId.json`:

```json
{
  "sessionId": "a1b2c3d4e5f6g7h8-lx3abc",
  "documentHash": "a1b2c3d4e5f6g7h8",
  "classification": null,
  "analysis": null,
  "investigation": null,
  "advice": null,
  "phaseTiming": {
    "classifier": { "startedAt": "...", "completedAt": "...", "durationMs": 12300 }
  }
}
```

### Logica di ripresa

1. Se `resumeSessionId` -> carica quella sessione
2. Altrimenti cerca per hash documento -> trova sessione incompleta
3. Salta fasi gia completate, esegui solo quelle mancanti
4. Se sessione completa (ha `advice`), crea nuova sessione

### Medie tempi

Calcola medie da ultime 30 sessioni per calibrare la progress bar lato client. Fallback su default: 12s, 25s, 22s, 18s.

---

## 7. STREAMING SSE (Server-Sent Events)

### Endpoint: POST /api/analyze

Timeout: 300 secondi (5 minuti)

### Formato eventi

```
event: timing
data: {"classifier": 12, "analyzer": 25, "investigator": 22, "advisor": 18}

event: session
data: {"sessionId": "abc123"}

event: progress
data: {"phase": "classifier", "status": "running"}

event: progress
data: {"phase": "classifier", "status": "done", "data": {...}}

event: error
data: {"phase": "analyzer", "error": "messaggio"}

event: complete
data: {"advice": {...}}
```

### Implementazione server

```typescript
return new Response(
  new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("timing", timings);
      send("session", { sessionId });
      await runOrchestrator(text, {
        onProgress: (phase, status, data) => send("progress", { phase, status, data }),
        onError: (phase, error) => send("error", { phase, error }),
        onComplete: (result) => send("complete", { advice: result }),
      });
      controller.close();
    },
  }),
  { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } }
);
```

---

## 8. COMPONENTI UI — PATTERN E CONVENZIONI

### Design system

```css
/* Colori */
--background: #0a0a0a       /* sfondo scuro */
--accent: #FF6B35            /* arancione primario */

/* Colori agenti */
Leo (Catalogatore):  #4ECDC4  /* teal */
Marta (Analista):    #FF6B6B  /* corallo */
Giulia (Giurista):   #A78BFA  /* viola */
Enzo (Consulente):   #FFC832  /* oro */

/* Font */
--font-sans: 'DM Sans'           /* testo, UI */
--font-serif: 'Instrument Serif'  /* heading, premium feel */
```

### Convenzioni componenti

- **Client components**: `"use client"` in cima, usano Framer Motion
- **Animazioni**: Sempre con `framer-motion` (motion.div, AnimatePresence)
- **Responsive**: Mobile-first, breakpoint `md:` per desktop
- **Icone**: Solo `lucide-react`, importare singole icone
- **Tailwind 4**: Niente config file separato, tema in globals.css
- **Classi custom**: `.floating-orb`, `.section-divider`, `.noise-overlay`, `.video-glow`

### Componente VideoShowcase

```tsx
<VideoShowcase
  src="/videos/nome-video.mp4"     // path in /public
  poster="/videos/poster.jpg"      // opzionale
  title="Titolo sezione"
  subtitle="Sottotitolo"
  accentColor="#FF6B35"            // default arancione
/>
```

Autoplay on scroll, mute/unmute toggle, play overlay, loop, 16:9.

### Componente AnalysisProgress

Il componente piu complesso (643 righe): cerchio progress con gradiente, timeline 4 fasi, ETA da dati storici, timer real-time, retry su errore.

---

## 9. ESTRAZIONE TESTO DA DOCUMENTI

| Formato | Libreria | Note |
|---------|----------|------|
| PDF | pdf-parse | Richiede serverExternalPackages in next.config |
| DOCX/DOC | mammoth | Estrazione raw text |
| TXT | Built-in | UTF-8 decode |
| Immagini | tesseract.js | NON ancora implementato |

Validazione: file max 20MB, testo estratto min 50 caratteri, messaggi errore in italiano.

---

## 10. AUTENTICAZIONE E PAGAMENTI

### Flusso auth

```
Click "Abbonati" -> OAuth redirect Supabase -> Callback /api/auth/callback -> Session cookie
```

### Piani

```typescript
free:   { price: 0,    analysesPerMonth: 3,        deepSearchLimit: 1 }
pro:    { price: 4.99, analysesPerMonth: Infinity,  deepSearchLimit: Infinity }
single: { price: 0.99 }  // one-shot
```

### Stripe webhook events

- `checkout.session.completed` -> Upgrade a pro
- `customer.subscription.deleted` -> Downgrade a free
- `customer.subscription.updated` -> Aggiorna stato

### RLS (Row-Level Security)

Ogni tabella ha policy: utenti vedono/modificano solo i propri dati.

---

## 11. DATABASE SCHEMA

```sql
profiles        -- id, email, full_name, plan, analyses_count, stripe_customer_id
analyses        -- id, user_id, file_name, status, classification/analysis/investigation/advice (JSONB)
deep_searches   -- id, analysis_id, user_question, agent_response, sources (JSONB)
lawyer_referrals -- id, analysis_id, user_id, lawyer_id, specialization, region, status
```

Funzioni SQL:
- `increment_analyses_count(uid)` — Incrementa contatore post-analisi
- `reset_monthly_analyses()` — Reset mensile (cron o manuale)

---

## 12. GENERAZIONE VIDEO CON AI

### Piattaforma: Runway Gen 4.5

### Regole fondamentali

1. **Frasi complete** — Mai keywords separate. Gen 4.5 capisce linguaggio naturale
2. **Mai negazioni** — "no text", "don't move" producono risultati imprevedibili
3. **Una scena per video** — 5-10 secondi, una sola azione principale
4. **Struttura prompt**: `[Camera] + [Soggetto/azione] + [Ambiente] + [Stile/luce]`
5. **Image-to-Video >> Text-to-Video** — Se hai un'immagine di riferimento, usala come primo frame e descrivi SOLO il movimento

### Terminologia camera

| Termine | Effetto |
|---------|---------|
| Pan | Rotazione orizzontale |
| Tilt | Rotazione verticale |
| Dolly | Camera avanti/indietro |
| Orbit | Camera gira intorno al soggetto (usare velocita bassa) |
| Truck | Movimento laterale |
| Push/Pull | Verso/lontano dal soggetto |

### Per loop

- Camera statica: "The locked-off camera remains perfectly still"
- Movimenti ciclici: fiamme, onde, particelle, respiro
- Post-produzione: clip + clip reversed = ping-pong loop

### Per risultati cinematografici

- Termini lens: "anamorphic", "85mm lens", "shallow depth of field"
- Luce specifica: "golden hour glow", "dramatic side lighting", "chiaroscuro"
- Stile: "cinematic", "photorealistic", "film grain"

### Image-to-Video: regole speciali

- NON ridescrivere l'immagine (composizione e stile sono gia definiti)
- Descrivi SOLO il movimento
- Riferisci soggetti genericamente ("the robot", "the hand")

### Prompt video del progetto (Image-to-Video)

**Video 1 Hero** — Robot umanoide di profilo con luci arancioni
```
The camera executes a very slow dolly forward toward the robot's face.
The small orange lights along the jaw and temple pulse gently in sequence,
as if processing data. The robot's eye glows slightly brighter for a moment.
Subtle volumetric haze drifts across the dark background.
Extremely slow, cinematic movement.
```

**Video 2 Come Funziona** — Statua della Giustizia
```
The scales of justice slowly tilt to the left, then gently swing back to
center in a smooth pendulum motion. A faint breeze causes the draped fabric
on the statue to shift subtly. Warm golden light gradually intensifies from
the upper left. The camera remains perfectly still. Elegant, slow, looping motion.
```

**Video 3 Team AI** — Mano robotica blu
```
The robotic fingers slowly curl inward one by one, as if grasping an invisible
document. Small particles of warm orange light begin to emanate from the
fingertips, drifting gently upward. The hand then slowly opens back to its
original position. Smooth, deliberate, cyclical motion.
```

**Video 5 CTA** — Uomo che firma contratto
```
The man's hand slowly lifts the pen away from the paper and pauses mid-air,
hesitating. A faint warm orange glow gradually appears beneath the document,
as if light is seeping through the pages from below, revealing hidden text.
The movement is slow and deliberate.
```

### Specifiche tecniche video

- Aspect ratio: 16:9
- Durata: 5-10 secondi
- Formato: MP4, H264, max 5MB
- Posizione: `/public/videos/`
- Poster: esporta primo frame come .jpg

---

## 13. DEPLOY

### Vercel (raccomandato)

```bash
npm run build
vercel deploy    # O collega repo GitHub a Vercel
```

### Checklist produzione

- [ ] Tutte le env vars settate su Vercel
- [ ] NEXT_PUBLIC_APP_URL = dominio produzione
- [ ] HTTPS attivo (obbligatorio per Stripe)
- [ ] Webhook Stripe con URL produzione
- [ ] Cron per reset_monthly_analyses() (pg_cron o Edge Function)
- [ ] .analysis-cache/ in .gitignore

---

## 14. ERRORI COMUNI E SOLUZIONI

| Errore | Causa | Soluzione |
|--------|-------|-----------|
| pdf-parse crash | Non in serverExternalPackages | Aggiungere a next.config.ts |
| 429 rate limit | Troppe chiamate/minuto | Retry 60s gestisce, ma riduci parallelismo |
| JSON parse error | Claude risponde con markdown | Parser ha fallback, rinforza "NO markdown" nel prompt |
| SSE timeout | Analisi > 5 minuti | Aumentare maxDuration o ottimizzare prompt |
| Cache stale | Documento modificato stesso hash | Improbabile (SHA256), cancella .analysis-cache/ |
| Investigator fallisce | Web search senza risultati | Non fatale: continua con findings vuoti |

---

## 15. DATABASE VETTORIALE E RAG

### Architettura a 3 layer

```
┌─────────────────────────────────────────────────────┐
│              SUPABASE pgvector                       │
│                                                      │
│  1. legal_articles    → Corpus legislativo italiano  │
│     - Codice Civile, D.Lgs., DPR, Leggi            │
│     - Ricerca semantica + lookup diretto            │
│     - Embedding: Voyage AI (voyage-law-2, 1024d)    │
│                                                      │
│  2. document_chunks   → Chunk documenti analizzati  │
│     - Ogni analisi spezza il doc in chunk           │
│     - Trova documenti simili a quelli passati       │
│                                                      │
│  3. legal_knowledge   → Intelligenza collettiva     │
│     - Norme, sentenze, pattern di clausole/rischi   │
│     - Arricchita da OGNI analisi completata         │
│     - Più usi l'app, più diventa intelligente       │
└─────────────────────────────────────────────────────┘
```

### Pipeline RAG nella pipeline agenti

```
[1] CLASSIFIER → identifica tipo, sotto-tipo, istituti giuridici
         ↓
[1.5] RETRIEVAL → query al vector DB:
      - Lookup diretto: leggi identificate dal Classifier
      - Per istituto: Art. collegati agli istituti giuridici
      - Semantico: norme simili alle clausole
         ↓
[2] ANALYZER → riceve il contesto normativo verificato
         ↓
[2.5] RETRIEVAL → ricerca semantica per clausole problematiche
         ↓
[3] INVESTIGATOR → riceve contesto legale + RAG da analisi precedenti
         ↓
[4] ADVISOR → riceve RAG per calibrare scoring sul mercato
         ↓
[5] AUTO-INDEX → salva conoscenza nel vector DB (background)
```

### Variabili d'ambiente aggiuntive

```env
# Voyage AI (per embeddings — raccomandato voyage-law-2 per testi legali)
VOYAGE_API_KEY=pa-...
```

Se `VOYAGE_API_KEY` non è configurata, tutte le feature vector DB vengono saltate silenziosamente. L'app funziona comunque.

### API Routes

- `POST /api/vector-search` — Ricerca semantica (query, type, category, limit)
- `GET /api/vector-search` — Statistiche vector DB
- `POST /api/corpus` — Caricamento articoli nel corpus
- `GET /api/corpus` — Statistiche corpus legislativo
- `GET /api/corpus/hierarchy` — Lista fonti o albero navigabile per fonte
- `GET /corpus` — Pagina UI navigazione corpus

### Migrazione database

```bash
# Esegui su Supabase SQL Editor:
# 3. supabase/migrations/003_vector_db.sql → pgvector, document_chunks, legal_knowledge, legal_articles
```

### File chiave

```
lib/
├── embeddings.ts        # Client Voyage AI per generare embeddings
├── vector-store.ts      # RAG pipeline: chunking, indexing, search, buildRAGContext
├── legal-corpus.ts      # Ingest e query corpus legislativo
```

### ClassificationResult arricchito

Il Classifier ora identifica:
- `documentSubType`: sotto-tipo specifico (es. "vendita_a_corpo", "locazione_4+4")
- `relevantInstitutes`: istituti giuridici nel documento (es. ["vendita_a_corpo", "caparra_confirmatoria"])
- `legalFocusAreas`: aree di diritto per guidare l'analisi

### Scoring multidimensionale (Advisor)

```typescript
scores: {
  contractEquity: number;      // Bilanciamento tra le parti
  legalCoherence: number;      // Coerenza interna clausole
  practicalCompliance: number;  // Aderenza alla prassi
  completeness: number;         // Copertura situazioni tipiche
}
```

### Limiti output Advisor enforced

Il codice tronca automaticamente a max 3 risks e max 3 actions anche se il modello ne produce di più.

---

## 16. FEATURE INCOMPLETE

1. OCR immagini — tesseract.js importato ma non implementato
2. Dashboard reale — Usa mock data, servono query Supabase
3. Pagina dettaglio analisi — Usa mock, serve fetch da Supabase
4. Deep search limit — Modello dati supporta, non enforced in UI
5. Sistema referral avvocati — Tabelle DB esistono, nessuna UI
6. Test — Nessun test unitario/integrazione/E2E
7. CI/CD — Nessuna GitHub Action
8. ~~Corpus legislativo~~ — **COMPLETATO**: 3548 articoli caricati (1000 Codice Civile), embeddings Voyage AI attivi, pagina UI `/corpus` operativa
9. UI scoring multidimensionale — Backend pronto, frontend mostra solo fairnessScore

---

## 16. CONVENZIONI DI CODICE

- **Lingua UI**: Italiano
- **Lingua codice**: Inglese (variabili, funzioni, commenti tecnici)
- **Lingua prompt AI**: Italiano
- **Formatting**: Prettier (default)
- **Linting**: ESLint 9 flat config, core-web-vitals + TypeScript
- **Path alias**: `@/*` -> root
- **Import**: Specifici (`import { X } from "lucide-react"`)
- **State**: React useState/useRef, nessun store globale
- **API routes**: App Router route handlers, FormData per upload
- **Error messages**: Sempre in italiano per l'utente
