# Deploy Checklist — Vercel Production

**Data**: 2026-03-10
**Task**: 215845b0 — Deploy produzione Vercel + landing /affitti
**Autore**: ops-monitor (Operations dept)

---

## 1. Stato pre-deploy

### CI Pipeline
- [x] `.github/workflows/ci.yml` presente e configurato
- [ ] **Verificare che CI sia green su branch main** — la pipeline esegue: lint, type check, vitest, build, E2E Playwright

### Build
- [x] `npm run build` usa `cross-env NODE_ENV=production next build`
- [x] `next.config.ts` ha `serverExternalPackages: ["pdf-parse"]`
- [x] `experimental.prerenderEarlyExit: false` configurato (evita build failure su pagine client-only)
- [ ] **BLOCKER 2026-03-10**: build locale fallisce con errore Turbopack/PostCSS su Windows:
  ```
  Error: Cannot find module '.next\build\postcss.js'
  [project]/app/globals.css [app-client] (css) — node process exited with exit code: 1
  ```
  **Causa**: Turbopack (Next.js 16.1.6) ha un bug noto dove la cache `.next/` si corrompe su Windows e il file `postcss.js` non viene generato. Il `.next/` directory risulta bloccata dal processo Node e `rm -rf .next` non riesce a pulire completamente.
  **Workaround**:
  1. Chiudere tutte le istanze Node/Next.js
  2. Eliminare manualmente `.next/` (da Explorer o PowerShell `Remove-Item -Recurse -Force .next`)
  3. Rieseguire `npm run build`
  4. Se persiste: provare `npx next build --turbopack=false` (webpack fallback) oppure passare dalla CI (Ubuntu) che non ha il problema
  **Nota**: Vercel esegue il build su Linux — questo bug Windows non blocca il deploy, ma impedisce il test locale del build.

### Route /affitti
- [ ] **MANCANTE**: la route `/affitti` NON esiste. Non c'e' `app/affitti/` directory.
- Il contenuto blog sugli affitti esiste in `content/blog/contratto-affitto-clausole-vietate.md` (status: draft)
- Il lead magnet esiste in `public/downloads/checklist-clausole-affitto.md`
- La pagina `/resources` referenzia contenuti affitto ma non ha route `/affitti` dedicata
- **Azione richiesta**: decidere se (a) creare landing `/affitti` dedicata, (b) usare `/resources` come landing SEO, (c) creare sistema blog con route `/blog/[slug]`

---

## 2. Variabili d'ambiente Vercel

Configurare tutte nel dashboard Vercel: Settings > Environment Variables.
Sorgente: `.env.local.example` + `CLAUDE.md` sezione 2.

### Obbligatorie (app non funziona senza)

| Variabile | Tipo | Note |
|-----------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | JWT anon key Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Solo server-side, mai esporre |
| `ANTHROPIC_API_KEY` | Secret | `sk-ant-...` — core pipeline agenti |
| `STRIPE_SECRET_KEY` | Secret | `sk_live_...` per produzione |
| `STRIPE_WEBHOOK_SECRET` | Secret | `whsec_...` — deve corrispondere all'endpoint Vercel |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public | `pk_live_...` |
| `STRIPE_PRO_PRICE_ID` | Secret | Price ID piano Pro |
| `STRIPE_SINGLE_PRICE_ID` | Secret | Price ID piano Single |
| `NEXT_PUBLIC_APP_URL` | Public | **`https://controlla.me`** (dominio produzione) |
| `CONSOLE_JWT_SECRET` | Secret | Min 32 chars, generare random. Se assente: rischio sicurezza (fallback hardcoded) |
| `CRON_SECRET` | Secret | Se assente: cron endpoint restituisce 500 (fail-closed) |

### Obbligatorie per funzionalita' specifiche

| Variabile | Tipo | Funzionalita' |
|-----------|------|---------------|
| `VOYAGE_API_KEY` | Secret | Vector DB / RAG — senza di essa il RAG viene saltato silenziosamente |
| `UPSTASH_REDIS_REST_URL` | Secret | Rate limiting distribuito |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | Rate limiting distribuito |

### Raccomandate (fallback graceful se assenti)

| Variabile | Tipo | Funzionalita' |
|-----------|------|---------------|
| `GEMINI_API_KEY` | Secret | Corpus Agent, Question-Prep (fallback a Haiku) |
| `GROQ_API_KEY` | Secret | Tier Intern — Llama, 1000 req/giorno gratis |
| `CEREBRAS_API_KEY` | Secret | Tier Intern — Llama, 1M tok/giorno gratis |
| `MISTRAL_API_KEY` | Secret | Tier Intern — tutti modelli, 2 RPM gratis |
| `OPENAI_API_KEY` | Secret | GPT-4o/4.1 (richiede crediti API, ChatGPT Plus NON basta) |
| `DEEPSEEK_API_KEY` | Secret | DeepSeek V3/R1 — server in Cina, no dati sensibili |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Public | Google Analytics 4 (tracking) |

### Solo per Trading (NON necessarie per app legale)

| Variabile | Tipo | Note |
|-----------|------|------|
| `ALPACA_API_KEY` | Secret | Trading — paper/live |
| `ALPACA_SECRET_KEY` | Secret | Trading — paper/live |
| `ALPACA_BASE_URL` | Secret | `https://paper-api.alpaca.markets` |
| `ALPACA_CONV_API_KEY` | Secret | Account convenzionale (opzionale) |
| `ALPACA_CONV_SECRET_KEY` | Secret | Account convenzionale (opzionale) |
| `ALPACA_CONV_BASE_URL` | Secret | Account convenzionale (opzionale) |
| `ALPACA_CRYPTO_API_KEY` | Secret | Account crypto (opzionale) |
| `ALPACA_CRYPTO_SECRET_KEY` | Secret | Account crypto (opzionale) |
| `ALPACA_CRYPTO_BASE_URL` | Secret | Account crypto (opzionale) |
| `TIINGO_API_KEY` | Secret | Market data real-time |
| `USE_TIINGO_FOR_MARKET_DATA` | Secret | `true` |
| `TIINGO_REQUESTS_PER_HOUR` | Secret | 5000 (Power plan) |
| `TIINGO_NEWS_ENABLED` | Secret | `true` |
| `TIINGO_NEWS_MINUTES_BACK` | Secret | `30` |
| `TIINGO_NEWS_HIGH_IMPACT_ONLY` | Secret | `true` |
| `TRADING_MODE` | Secret | `paper` |
| `TRADING_ENABLED` | Secret | `true` |
| `TRADING_LOG_LEVEL` | Secret | `INFO` |
| `FRED_API_KEY` | Secret | FRED macro data |

### Per Company/CME (NON necessarie per utenti finali)

| Variabile | Tipo | Note |
|-----------|------|------|
| `TELEGRAM_BOT_TOKEN` | Secret | CME scheduler notifiche |
| `TELEGRAM_CHAT_ID` | Secret | Chat ID con il bot |

---

## 3. Stripe Webhook

### Setup obbligatorio

1. Vai su [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. **Crea nuovo endpoint** (o aggiorna esistente):
   - URL: `https://controlla.me/api/webhook`
   - Eventi da ascoltare:
     - `checkout.session.completed`
     - `customer.subscription.deleted`
     - `customer.subscription.updated`
3. Copia il `Signing secret` (`whsec_...`) e impostalo come `STRIPE_WEBHOOK_SECRET` su Vercel
4. **Verificare** che i Price ID (`STRIPE_PRO_PRICE_ID`, `STRIPE_SINGLE_PRICE_ID`) corrispondano ai prodotti live (non test)

### Test post-deploy

```bash
# Verifica webhook raggiungibile
curl -X POST https://controlla.me/api/webhook -H "Content-Type: application/json" -d '{}'
# Deve rispondere 400 (signature mancante), NON 404
```

---

## 4. DNS e HTTPS

### Domini da configurare su Vercel (Settings > Domains)

| Dominio | Tipo | Destinazione |
|---------|------|-------------|
| `controlla.me` | Primario | App principale (landing, analisi, corpus) |
| `www.controlla.me` | Redirect | Redirect 301 a `controlla.me` |
| `poimandres.work` | Secondario | Rewrite a `/console` (configurato in `next.config.ts`) |
| `www.poimandres.work` | Redirect | Rewrite a `/console` (configurato in `next.config.ts`) |

### DNS Records (dal registrar del dominio)

Per ogni dominio:
- **Opzione A (raccomandata)**: CNAME `@` -> `cname.vercel-dns.com`
- **Opzione B**: A record `@` -> IP fornito da Vercel

### HTTPS
- [x] Vercel gestisce automaticamente i certificati SSL/TLS (Let's Encrypt)
- [x] HSTS configurato in `next.config.ts` (`max-age=31536000; includeSubDomains`)
- [ ] **Verificare post-deploy**: `curl -I https://controlla.me` deve mostrare `strict-transport-security`

---

## 5. Supabase Auth — Redirect URL

1. Vai su Supabase Dashboard > Authentication > URL Configuration
2. **Site URL**: `https://controlla.me`
3. **Redirect URLs** (allowlist):
   - `https://controlla.me/api/auth/callback`
   - `https://controlla.me/**` (catch-all per deep links)
4. Rimuovere `http://localhost:3000` dalla lista redirect in produzione (o tenerlo per dev)

---

## 6. Cron Jobs (vercel.json)

`vercel.json` configura:
```json
{
  "crons": [
    {
      "path": "/api/platform/cron/data-connector",
      "schedule": "0 6 * * 0"
    }
  ]
}
```

- **Data Connector sync**: ogni domenica alle 06:00 UTC
- Protetto da `CRON_SECRET` (fail-closed se non configurato)
- Vercel Cron richiede piano **Pro** ($20/mese) per cron custom. Piano Hobby ha solo cron giornaliero.

### Cron aggiuntivi da considerare

| Cron | Funzione | Priorita' |
|------|----------|-----------|
| `reset_monthly_analyses()` | Reset contatore analisi utenti free | Alta — senza questo gli utenti free restano bloccati dopo 3 analisi |
| Trading scheduler | Pipeline intraday + daily | Solo se trading attivo |

---

## 7. Security Headers (gia' configurati)

Verificati in `next.config.ts`:
- [x] `Content-Security-Policy` (CSP) con `unsafe-eval` solo in dev
- [x] `Strict-Transport-Security` (HSTS 1 anno)
- [x] `X-Content-Type-Options: nosniff`
- [x] `X-Frame-Options: DENY`
- [x] `X-XSS-Protection: 1; mode=block`
- [x] `Referrer-Policy: strict-origin-when-cross-origin`
- [x] `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## 8. SEO e Analytics

### Gia' configurati
- [x] `app/sitemap.ts` — genera sitemap dinamico (usa `NEXT_PUBLIC_APP_URL`)
- [x] `app/robots.ts` — blocca `/api/`, `/ops/`, `/console/`
- [x] Meta tag Open Graph in `app/layout.tsx`
- [x] Google Analytics 4 condizionale (`NEXT_PUBLIC_GA_MEASUREMENT_ID`)
- [x] `lang="it"` su `<html>`
- [x] Skip-nav per accessibilita'

### Da fare post-deploy
- [ ] Registrare `https://controlla.me` su Google Search Console
- [ ] Inviare sitemap: `https://controlla.me/sitemap.xml`
- [ ] Verificare Open Graph con [opengraph.xyz](https://www.opengraph.xyz)
- [ ] Aggiungere `/resources` e `/blog/*` al sitemap quando le route esistono

---

## 9. Checklist finale pre-deploy

### Bloccanti

- [ ] **Build Turbopack/PostCSS**: verificare che il build passi su Vercel (Linux). Il bug Windows non impatta il deploy Vercel. Se Vercel fallisce: aggiungere `NEXT_BUILD_TURBOPACK=false` come env var per forzare webpack.
- [ ] Tutte le env vars obbligatorie configurate su Vercel
- [ ] `NEXT_PUBLIC_APP_URL` = `https://controlla.me`
- [ ] DNS configurato per `controlla.me` e `poimandres.work`
- [ ] Webhook Stripe con URL produzione (`https://controlla.me/api/webhook`)
- [ ] Stripe Price ID corrispondenti a prodotti live
- [ ] `CONSOLE_JWT_SECRET` e `CRON_SECRET` generati con valori random sicuri (min 32 chars)
- [ ] Supabase Auth redirect URL aggiornati
- [ ] CI green su main

### Raccomandati

- [ ] `UPSTASH_REDIS_REST_URL` + `TOKEN` per rate limiting distribuito
- [ ] `VOYAGE_API_KEY` per RAG/vector DB
- [ ] Almeno 2-3 provider LLM gratuiti configurati (Groq, Cerebras, Mistral)
- [ ] Google Analytics `NEXT_PUBLIC_GA_MEASUREMENT_ID`

### Post-deploy

- [ ] Verificare HTTPS attivo: `curl -I https://controlla.me`
- [ ] Verificare webhook Stripe raggiungibile
- [ ] Verificare OAuth login funzionante
- [ ] Verificare analisi documento end-to-end
- [ ] Verificare corpus search funzionante
- [ ] Verificare rate limiting attivo (tentare 20+ request rapide)
- [ ] Google Search Console + sitemap submit

---

## 10. Nota sulla landing /affitti

La route `/affitti` non esiste attualmente. Il contenuto e' presente in:
- `content/blog/contratto-affitto-clausole-vietate.md` (status: draft, 2000+ parole)
- `public/downloads/checklist-clausole-affitto.md` (lead magnet scaricabile)
- `app/resources/` (pagina risorse con referenze affitto)

**Opzioni**:
1. **Landing dedicata** (`app/affitti/page.tsx`): pagina SEO verticale per "clausole vietate affitto", con CTA a controlla.me. Richiede design e implementazione.
2. **Blog system** (`app/blog/[slug]/page.tsx`): sistema blog con MDX/markdown, pubblica tutti i contenuti in `content/blog/`. Scalabile.
3. **Redirect temporaneo**: `/affitti` -> `/resources` con contenuto affitto in evidenza.

Raccomandazione: opzione 2 (blog system) perche' ci sono gia' 6+ articoli in `content/blog/` pronti per la pubblicazione. Pero' questo richiede un task separato per il dipartimento UX/UI + Architecture.

---

## 11. Comandi deploy

```bash
# 1. Verifica build locale
npm run build

# 2. Deploy (se collegato a GitHub)
# Push su main → Vercel fa build+deploy automatico

# 3. Deploy manuale (se non collegato)
npx vercel deploy --prod

# 4. Verifica post-deploy
curl -I https://controlla.me
curl -X POST https://controlla.me/api/webhook -d '{}' -H "Content-Type: application/json"
```
