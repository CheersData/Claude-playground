# Stato Corpus Legislativo — controlla.me

> Censimento di ogni fonte normativa: modalità di integrazione, stato attuale, problemi noti.

Ultimo aggiornamento: 2026-02-23

---

## Riepilogo

| # | Fonte | Articoli attesi | In DB | Metodo | Stato |
|---|-------|-----------------|-------|--------|-------|
| 1 | Codice Civile | ~3.150 | 3.018 | HuggingFace dataset | OK |
| 2 | Codice Penale | ~734 | 2 | Normattiva AJAX | DA RIFARE |
| 3 | Codice del Consumo (D.Lgs. 206/2005) | ~170 | 2 (duplicati) | Normattiva Export | DA CARICARE (fetcher OK: 202 art.) |
| 4 | Codice di Procedura Civile | ~831 | 0 | Normattiva AJAX | DA FARE |
| 5 | D.Lgs. 231/2001 (Resp. enti) | ~85 | 1 | Normattiva AJAX | DA RIFARE |
| 6 | D.Lgs. 122/2005 (Tutela acquirenti) | ~21 | 1 | Normattiva AJAX | DA RIFARE |
| 7 | Statuto dei Lavoratori (L. 300/1970) | ~41 | 1 | Normattiva AJAX | DA RIFARE |
| 8 | TU Edilizia (DPR 380/2001) | ~138 | 1 | Normattiva AJAX | DA RIFARE |
| 9 | GDPR (Reg. UE 2016/679) | 99 | 99 | EUR-Lex CELLAR | OK |
| 10 | Dir. 93/13/CEE (Clausole abusive) | 11 | 0 | EUR-Lex CELLAR | DA FARE |
| 11 | Dir. 2011/83/UE (Diritti consumatori) | 35 | 35 | EUR-Lex CELLAR | OK |
| 12 | Dir. 2019/771/UE (Vendita beni) | 28 | 27 | EUR-Lex CELLAR | OK |
| 13 | Reg. CE 593/2008 (Roma I) | 29 | 29 | EUR-Lex CELLAR | OK |
| 14 | Reg. UE 2022/2065 (DSA) | 93 | 93 | EUR-Lex CELLAR | OK |

**Totale in DB: 3.310 | Con embedding: 3.305**

---

## Dettaglio per fonte

### 1. Codice Civile — OK

- **Metodo**: HuggingFace dataset `AndreaSimeri/Italian_Civil_Code`
- **Articoli**: 3.018 caricati (su ~3.150 vigenti)
- **Qualità**: Buona. Testo pulito, gerarchia Libri/Titoli/Capi mappata manualmente, istituti giuridici associati per range articoli.
- **law_source**: `"Codice Civile"`
- **Problemi noti**: Nessuno
- **Path noto**: `scripts/fetchers/huggingface.ts` → Paginazione 100/pagina, retry HTML, transformRow con gerarchia

### 2. Codice Penale — DA RIFARE

- **Metodo attuale**: Normattiva OpenData API (fallback HTML) — restituisce solo 2 articoli
- **Problema**: L'API OpenData (`pre.api.normattiva.it`) non risponde (connection refused). Il fallback HTML scraper (`normattiva-html.ts`) parsa solo 1-2 articoli perché il testo è caricato via AJAX.
- **law_source**: `"Codice Penale"`
- **Soluzione**: Riscrivere fetcher con pattern AJAX a 2-step (vedi sotto)
- **URN**: `urn:nir:stato:regio.decreto:1930-10-19;1398`
- **Codice redazionale**: `030U1398`

### 3. Codice del Consumo — FETCHER PRONTO (202 art.)

- **Metodo nuovo**: Normattiva Export Completo (`/esporta/attoCompleto`) — **202 articoli in ~3 secondi**
- **Articoli attesi**: ~170 (originariamente 146, aumentati post-2007 con bis/ter/quater)
- **Risultato test**: 202 articoli, 201 con rubrica, 202 con gerarchia, lunghezza media 2342 chars
- **law_source** (corretto): `"D.Lgs. 206/2005"`
- **Da fare**: Pulizia duplicati in DB (`"Codice del Consumo"` va rimosso, solo `"D.Lgs. 206/2005"` resta). Poi run loader.
- **URN**: `urn:nir:stato:decreto.legislativo:2005-09-06;206`
- **Codice redazionale**: `005G0232`
- **Struttura**: 6 Parti, Titoli, Capi, Sezioni

### 4-8. Altre fonti Normattiva — DA RIFARE

Stesso problema del Codice Penale e Consumo. Tutte necessitano del fetcher AJAX 2-step.

### 9-14. Fonti EUR-Lex — OK

Le fonti europee funzionano bene via CELLAR REST API (XML Formex). Unica mancante: Dir. 93/13/CEE (Clausole abusive) — probabilmente il CELEX non è corretto o il formato è diverso.

---

## Pattern di scraping Normattiva — Export Completo (Metodo migliore)

Scoperto il 2026-02-23. Due richieste HTTP per l'intero atto:

### Step 1: Fetch pagina atto → cookie sessione

```
GET https://www.normattiva.it/uri-res/N2Ls?{URN}!vig=
→ Salva cookie JSESSIONID
```

### Step 2: Export completo con cookie

```
GET https://www.normattiva.it/esporta/attoCompleto?atto.dataPubblicazioneGazzetta={DATA}&atto.codiceRedazionale={CODICE}
Cookie: JSESSIONID=...; TS01...=...
→ HTML completo (~900 KB per Codice Consumo) con TUTTI gli articoli
```

### Step 3: Parsing HTML AKN

Classi CSS nell'export:
- `article-num-akn` + `id="art_N"` → Numero articolo + ID unico
- `article-heading-akn` → Rubrica
- `art-commi-div-akn` → Container commi
- `art_text_in_comma` → Testo singolo comma
- `<span class="dentro">` → Sezioni gerarchia (Parti/Titoli/Capi separati da `<br/>`)

### Vantaggi vs AJAX articolo per articolo

- **2 richieste** vs ~250 (per Codice del Consumo)
- **~3 secondi** vs ~2 minuti
- **Nessun problema sessione** (cookie usato solo 1 volta)
- **Rubrica presente** per quasi tutti gli articoli (201/202)
- **Gerarchia completa** (Parti/Titoli/Capi/Sezioni)

### Nota: normattiva_2_md

Il tool open source https://github.com/ondata/normattiva_2_md converte Akoma Ntoso XML in markdown.
Usa un approccio simile (download XML da normattiva.it). Potrebbe essere utile come alternativa futura.

---

## Problemi di consistenza DB noti

1. **Duplicati law_source**: `"Codice del Consumo"` vs `"D.Lgs. 206/2005"` — stesso atto, nomi diversi
2. **HTML entities**: Alcuni testi hanno `&agrave;` invece di `à` (da vecchio scraper)
3. **Articoli mancanti**: Fonti Normattiva con 1-2 articoli su centinaia attesi
4. **source_type hardcoded**: `embeddings-batch.ts` scrive `source_type: "normattiva"` per tutte le fonti (anche EUR-Lex/HF)

---

## TODO

- [ ] Riscrivere `normattiva-html.ts` con pattern AJAX 2-step
- [ ] Caricare Codice del Consumo completo (~146 art.)
- [ ] Caricare Codice Penale completo (~734 art.)
- [ ] Caricare Codice di Procedura Civile (~831 art.)
- [ ] Caricare fonti minori (D.Lgs. 231, 122, L. 300, DPR 380)
- [ ] Pulire duplicati DB (law_source inconsistenti)
- [ ] Fixare HTML entities nei testi esistenti
- [ ] Fixare source_type in embeddings-batch.ts
- [ ] Investigare Dir. 93/13/CEE mancante da EUR-Lex
