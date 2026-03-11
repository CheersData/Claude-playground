# Report Dipartimentale Consolidato — Controlla.me
**Data:** 3 marzo 2026
**Prodotto da:** CME
**Scope:** Plenaria settimanale — stato operativo + piano crescita multi-verticale

---

## SINTESI ESECUTIVA

| Dipartimento | Task Done | Stato operativo | Priorità aperta |
|-------------|-----------|----------------|-----------------|
| Ufficio Legale | 8/8 | 🟢 Operativo | Deep Search Limit UI badge mancante |
| Ufficio Trading | 13/13 | 🟡 Attenzione | Sharpe -0.112 — grid search urgente |
| Data Engineering | 33/33 | 🟢 Operativo | D.Lgs. 276+23 da ingestire + censimento nuovi verticali |
| Quality Assurance | 47/47 | 🟢 Operativo | Gap: E2E paywall deep search, analysis-cache 0% |
| Architecture | 83/83 | 🟡 Attenzione | Build fallisce: useContext regressione /console |
| Security | 28/28 | 🟢 Verde | DPA provider AI blocca B2B — azione boss |
| Finance | 7/7 | 🟢 Operativo | Costi $0.42/7gg — sotto budget |
| Operations | 16/16 | 🟢 Operativo | Healthcheck OK, standup automatizzato |
| Strategy | 10/10 | 🟢 Operativo | OKR Q2 attivi, Poimandres in valutazione |
| Marketing | 9/9 | 🟡 Attenzione | Zero utenti beta — bloccante critico |
| UX/UI | 4/4 | 🟡 Attenzione | Scoring 3D pronto backend, non visibile in UI |
| Protocols | — | 🟢 Operativo | Decision trees attivi |

**Board complessivo:** 262/262 task completati. 0 open — nuovo ciclo parte oggi.

---

## STATO COMPETITIVO GLOBALE

**Posizione:** Leader assoluto nel segmento consumer B2C legale italiano. Vantaggio stimato 9-15 mesi.
**Moat reale:** knowledge base auto-accrescente + corpus 6731 articoli IT+EU + prospettiva parte debole.
**Opportunità immediata:** Multi-verticale (Lavoro, Tax, Commerciale B2B) — pipeline già parametrizzata.
**Rischio principale:** Zero beta user → zero feedback → zero revenue validation.

---

## PIANO OGGI — 14 TASK CREATI

### Blocco Trading (PRIORITÀ 1 — "Fai soldi")

| # | Task | Dept | Priorità | Effort |
|---|------|------|----------|--------|
| 1 | Grid search 96 combo TP/SL composito scoring | trading | CRITICAL | ~4h |
| 2 | Fetch SPY 5-min storici 6 mesi (prerequisito grid) | trading | HIGH | ~1h |
| 3 | Slope+volume backtest 5-min vs daily MACD | trading | HIGH | ~3h |

### Blocco Fix Immediati

| # | Task | Dept | Priorità | Effort |
|---|------|------|----------|--------|
| 4 | Fix useContext regressione /console + /_global-error | architecture | HIGH | ~30m |

### Blocco Prodotto

| # | Task | Dept | Priorità | Effort |
|---|------|------|----------|--------|
| 5 | Lead magnet PDF affitti + form email /resources | marketing | HIGH | ~3h |
| 6 | Outreach 20 avvocati referral (commission 20%) | marketing | HIGH | ~2h |
| 7 | Deep Search Limit UI: badge + paywall in RiskCard | ufficio-legale | MEDIUM | ~1h |
| 8 | UI scoring 3D: 3 pill badge in ResultsView | ux-ui | MEDIUM | ~2h |
| 9 | Ingest D.Lgs. 276/2003 + 23/2015 (HR vertical) | data-engineering | MEDIUM | ~1h |
| 10 | E2E test deep search paywall | quality-assurance | MEDIUM | ~2h |

### Blocco Nuovi Verticali (Censimento)

| # | Task | Dept | Priorità |
|---|------|------|----------|
| 11 | Censimento fonti verticale Consulente del Lavoro | data-engineering | HIGH |
| 12 | Censimento fonti verticale Commercialista/Tax | data-engineering | HIGH |
| 13 | Censimento fonti verticale Commerciale B2B | data-engineering | MEDIUM |
| 14 | Opportunity Brief: Commercialista vs Consulente del Lavoro | strategy | HIGH |

---

## DECISIONI IN SOSPESO (richiedono boss)

| # | Decisione | Urgenza | Impatto |
|---|-----------|---------|---------|
| D-01 | Firmare DPA Anthropic + Google + Mistral | 🔴 Alta — GDPR | Blocca lancio PMI |
| D-02 | Ingaggiare consulente EU AI Act | 🔴 Alta — scadenza agosto 2026 | Multa fino €15M |
| D-03 | Approvare lancio Poimandres Q2 | Media | Nuovo prodotto standalone |
| D-04 | Approvare schema DB contract monitoring | Media | Migrazione dolorosa post-utenti |
| D-05 | Decidere quale verticale aprire per primo (Lavoro vs Tax) | Alta | Roadmap Q2 corpus + agenti |

---

## INDICE REPORT

- [01 — Ufficio Trading](./01-trading.md)
- [02 — Architecture](./02-architecture.md)
- [03 — Data Engineering](./03-data-engineering.md)
- [04 — Quality Assurance](./04-quality-assurance.md)
- [05 — Security](./05-security.md)
- [06 — Finance](./06-finance.md)
- [07 — Operations](./07-operations.md)
- [08 — Strategy](./08-strategy.md)
- [09 — Marketing](./09-marketing.md)
- [10 — Ufficio Legale](./10-ufficio-legale.md)
- [11 — UX/UI](./11-ux-ui.md)
