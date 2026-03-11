# Report Ufficio Legale — 3 marzo 2026

**Leader:** leader
**Stack:** TypeScript / Next.js / 4+3 agenti AI

---

## STATO PIPELINE

| Agente | Modello | Stato |
|--------|---------|-------|
| Classifier | Haiku 4.5 → fallback | 🟢 Operativo |
| Analyzer | Sonnet 4.5 → fallback | 🟢 Operativo |
| Investigator | Sonnet 4.5 + web_search | 🟢 Operativo |
| Advisor | Sonnet 4.5 → fallback | 🟢 Operativo |
| Question-prep | Gemini Flash → Haiku | 🟢 Operativo |
| Corpus-agent | Gemini Flash → Haiku | 🟢 Operativo |
| Deep Search | Sonnet 4.5 | 🟢 Operativo |

---

## COSA È STATO FATTO

- ✅ Pipeline 4 agenti completa con RAG (5600+ articoli legislativi)
- ✅ Corpus agent Q&A legislativo operativo
- ✅ Deep search paywall implementato (gate per free/non-auth)
- ✅ Scoring multidimensionale: 3 score (legalCompliance, contractBalance, industryPractice)
- ✅ Auto-indexing knowledge base post-analisi

---

## GAP APERTI

### Deep Search Limit UI (TASK #7)
**Backend:** completamente implementato
- `/api/user/usage` esteso con `deepSearchUsed`, `deepSearchLimit`, `canDeepSearch`
- Gate paywall in `RiskCard.tsx` già attivo
**Frontend mancante:**
- Badge "X/Y ricerche usate" in `RiskCard.tsx`
- Messaggio differenziato: non-auth vs limite raggiunto
- Link a `/pricing` nell'upgrade prompt

### Scoring Multidimensionale UI (TASK #8 — competenza UX/UI)
- Backend pronto: 3 score in output Advisor
- Frontend: mostra solo `fairnessScore` — i 3 score non sono visibili all'utente

---

## TASK APERTI OGGI

| # | Task | Priorità | Effort |
|---|------|----------|--------|
| 7 | Deep Search Limit UI: badge + paywall message in RiskCard | MEDIUM | ~1h |

---

## FEATURE INCOMPLETE (CLAUDE.md backlog)

| Feature | Stato | Prossimo step |
|---------|-------|--------------|
| OCR immagini | ❌ tesseract.js rimosso | Reinstallare `npm install tesseract.js` quando si implementa |
| Dashboard analisi `/analysis/[id]` | ⚠️ Usa mock data | Servono `GET /api/analyses/[id]` con RLS |
| Sistema referral avvocati | ⚠️ DB pronto, no UI | Prerequisito: ADR GDPR sui dati da condividere |
| Statuto Lavoratori HR | ⚠️ Workaround pronto | Data Engineering ingest |
| Verticale HR completo | ❌ Non avviato | Corpus + prompt update |
