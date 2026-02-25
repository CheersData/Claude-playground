# Normattiva — Research Report

## Fonte
- **URL ufficiale:** https://www.normattiva.it/
- **Open Data Portal:** https://dati.normattiva.it/ (lanciato 24/02/2026)
- **Gestore:** DAGL (Presidenza del Consiglio dei Ministri) + Istituto Poligrafico e Zecca dello Stato
- **Licenza:** CC BY 4.0

## Metodo di accesso — Open Data API (ATTIVO dal Feb 2026)

### Base URL
- **Produzione:** `https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1/`
- **Documentazione:** https://dati.normattiva.it/assets/come_fare_per/API_Normattiva_OpenData.pdf (73 pagine)
- **Autenticazione:** Nessuna (API pubblica)

### Endpoint disponibili

| Metodo | Endpoint | Descrizione | Stato |
|--------|----------|-------------|-------|
| GET | `/tipologiche/estensioni` | Formati export (AKN, XML, JSON, etc.) | ✅ |
| GET | `/tipologiche/classe-provvedimento` | Classi atti (aggiornato, abrogato, etc.) | ✅ |
| GET | `/tipologiche/denominazione-atto` | Tipi atti (LEGGE, DL, D.Lgs., etc.) | ✅ |
| GET | `/collections/collection-predefinite` | Collezioni preconfezionate | ✅ |
| GET | `/ricerca/predefinita` | Ricerche predefinite salvate | ✅ |
| POST | `/ricerca/semplice` | Ricerca sincrona per testo | ✅ |
| POST | `/ricerca/avanzata` | Ricerca sincrona avanzata (tipo/anno/numero) | ✅ |
| POST | `/ricerca/aggiornati` | Atti aggiornati in un intervallo di date | ✅ |
| POST | `/ricerca-asincrona/nuova-ricerca` | Avvia export asincrono → token UUID | ✅ |
| PUT | `/ricerca-asincrona/conferma-ricerca` | Conferma con `{token, formato}` | ✅ |
| GET | `/ricerca-asincrona/check-status/{token}` | Poll status (303 quando pronto) | ✅ |
| GET | `/collections/download/collection-asincrona/{token}` | Scarica ZIP export asincrono | ✅ |
| GET | `/collections/download/collection-preconfezionata` | Scarica collezione preconfezionata (ZIP) | ✅ |
| POST | `/atto/dettaglio-atto` | Dettaglio singolo articolo (HTML) | ✅ |

### Workflow export asincrono

```
1. POST /ricerca-asincrona/nuova-ricerca  → token (UUID)    [202]
2. PUT  /ricerca-asincrona/conferma-ricerca {token}          [200]
3. GET  /ricerca-asincrona/check-status/{token}              [200→303]
   → Header x-ipzs-location contiene URL di download
4. GET  {download URL}                                       [200 → ZIP]
```

### Formato JSON (nei file ZIP)

```json
{
  "metadati": {
    "urn": "urn:nir:stato:decreto.legislativo:2005-09-06;206",
    "tipoDoc": "DECRETO LEGISLATIVO",
    "numDoc": "206",
    "titoloDoc": "Codice del consumo...",
    "dataDoc": "2005-09-06"
  },
  "articolato": {
    "elementi": [
      {
        "numNir": "PARTE I*desc*TITOLO I*desc*",
        "elementi": [
          {
            "nomeNir": "articolo",
            "numNir": "1",
            "rubricaNir": "Finalità ed oggetto",
            "testo": "Nel rispetto della Costituzione...",
            "dataVigoreVersione": [{"inizioVigore": "...", "fineVigore": "99999999"}]
          }
        ]
      }
    ]
  }
}
```

### Collezioni preconfezionate notevoli

| Collezione | Atti | Descrizione |
|------------|------|-------------|
| **Codici** | 40 | Tutti i codici italiani vigenti |
| Decreti Legislativi | 2890 | Tutti i D.Lgs. |
| Leggi finanziarie e di bilancio | 58 | Leggi finanziarie |
| Testi Unici | 255 | Tutti i TU |
| DL e leggi di conversione | 7423 | DL con leggi di conversione |

### Codici tipo atto principali

| Codice | Denominazione |
|--------|--------------|
| PLE | LEGGE |
| PLL | DECRETO LEGISLATIVO |
| PDL | DECRETO-LEGGE |
| PRD | REGIO DECRETO |
| PPR | DECRETO DEL PRESIDENTE DELLA REPUBBLICA |
| COS | COSTITUZIONE |

## Metodo legacy — Accesso diretto URN (DEPRECATO)

- Pattern: `https://www.normattiva.it/uri-res/N2Ls?{URN}~art{NUM}`
- Formato: HTML con classi Akoma Ntoso
- Stato: funzionante ma **deprecato** a favore dell'Open Data API

## Field mapping → CorpusArticle

| Open Data JSON | CorpusArticle |
|---|---|
| `articolo.rubricaNir` | `articleTitle` |
| `articolo.testo` | `articleText` |
| `metadati.urn` | `sourceUrl` (via normattiva.it URI) |
| `articolo.numNir` | `articleReference` ("Art. 1", "Art. 1-bis") |
| `sezione.numNir` | `hierarchy` (parsed PARTE/TITOLO/CAPO) |
| `articolo.dataVigoreVersione.fineVigore == "99999999"` | `isInForce` |

## Connettore

- **Nuovo:** `connectors/normattiva-opendata.ts` — Open Data REST API
- **Legacy:** `connectors/normattiva.ts` — HTML scraping (deprecato)
- **Seeder:** `scripts/seed-opendata.ts` (sostituisce `scripts/seed-normattiva.ts`)

## Volume

Con il nuovo connettore, la copertura potenziale è l'intero corpus normativo italiano (1861-oggi).
La sola collezione "Codici" contiene 40 codici vigenti con tutti gli articoli.

## Confidenza: **Molto Alta**
- API ufficiale, documentata, con licenza CC BY 4.0
- Testato con successo: search, async export, collection download, JSON parsing
- Dati strutturati (JSON) invece di HTML scraping fragile
