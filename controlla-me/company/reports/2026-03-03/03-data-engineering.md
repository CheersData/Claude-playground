# Report Data Engineering — 3 marzo 2026

**Leader:** data-connector
**Stack:** Normattiva API + EUR-Lex Cellar + Voyage AI embeddings + Supabase pgvector

---

## STATO CORPUS LEGISLATIVO

| Metrica | Valore |
|---------|--------|
| Articoli totali | ~6.731 |
| Fonti attive | 13 (IT + EU) |
| Embeddings | Voyage AI voyage-law-2 (1024d) |
| Vector DB | Supabase HNSW pgvector |
| Pipeline | CONNECT → MODEL → LOAD operativa |

---

## FONTI CARICATE (13)

**Italia (Normattiva):** Codice Civile (parziale), Codice del Consumo, Locazioni (L.431/1998 + L.392/1978), Privacy (GDPR + D.Lgs. 196/2003), D.Lgs. 81/2008 (Sicurezza Lavoro), Contratti Pubblici D.Lgs. 36/2023.

**Unione Europea (EUR-Lex):** GDPR, Direttiva Consumatori, Direttiva Clausole Abusive, AI Act.

---

## GAP IDENTIFICATI

### Verticale HR (parzialmente coperto)

| Fonte | Stato | Via |
|-------|-------|-----|
| Statuto Lavoratori L.300/1970 | ⚠️ Workaround pronto | Normattiva AKN |
| D.Lgs. 276/2003 (Biagi) | ❌ Non caricato | Normattiva |
| D.Lgs. 23/2015 (Jobs Act) | ❌ Non caricato | Normattiva |
| D.Lgs. 81/2015 (Codice contratti lavoro) | ❌ Non censito | Normattiva |
| D.Lgs. 148/2015 (CIG) | ❌ Non censito | Normattiva |

### Verticale Tax (non avviato)

| Fonte | Art. stimati | Stato |
|-------|-------------|-------|
| TUIR D.P.R. 917/1986 | ~180 | ❌ |
| IVA D.P.R. 633/1972 | ~90 | ❌ |
| Statuto Contribuente L.212/2000 | ~22 | ❌ |
| D.Lgs. 231/2001 (Resp. enti) | ~85 | ❌ |

### Verticale Commerciale B2B (non avviato)

| Fonte | Art. stimati | Stato |
|-------|-------------|-------|
| Codice Civile Libro IV (1321-2059) | ~340 | ❌ |
| D.Lgs. 231/2002 (ritardi pagamento) | ~15 | ❌ |
| D.Lgs. 70/2003 (commercio elettronico) | ~30 | ❌ |
| D.Lgs. 9/2024 (equo compenso) | ~18 | ❌ |

---

## TASK APERTI OGGI

| # | Task | Priorità | Effort |
|---|------|----------|--------|
| 9 | Ingest D.Lgs. 276/2003 + 23/2015 (HR vertical) | MEDIUM | ~1h |
| 11 | Censimento fonti verticale Consulente del Lavoro | HIGH | ~2h |
| 12 | Censimento fonti verticale Commercialista/Tax | HIGH | ~2h |
| 13 | Censimento fonti verticale Commerciale B2B | MEDIUM | ~2h |

---

## NOTE

- **Regola scraping:** API ufficiali → repo/dataset open → fonti alternative → scraping (solo con approvazione boss)
- D.Lgs. 276/2003 e 23/2015 disponibili via Normattiva standard — pipeline pronta, nessun blocco tecnico
- Codice Civile grande: ~900 art. totali, caricare SOLO Libro IV (contratti) per B2B — risparmio ~60% volume
