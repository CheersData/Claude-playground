# Normattiva — Research Report

## Fonte
- **URL ufficiale:** https://www.normattiva.it/
- **Open Data:** https://dati.normattiva.it/
- **Gestore:** DAGL (Presidenza del Consiglio dei Ministri) + Istituto Poligrafico e Zecca dello Stato

## Metodo di accesso

### API OpenData (NON funzionante da sandbox)
- Endpoint: `https://qas.api.normattiva.it/bff-opendata/v1/api/v1/`
- Stato: **bloccato** (TLS handshake failure, WAF protection)
- Documentazione: https://dati.normattiva.it/assets/come_fare_per/API_Normattiva_OpenData.pdf

### Export Akoma Ntoso XML (NON funzionante)
- Endpoint: `https://www.normattiva.it/export/retrieve?urn={URN}&formato=akn`
- Stato: **bloccato** (ERR_409 — WAF del Poligrafico)

### Accesso diretto URN (FUNZIONANTE)
- Pattern: `https://www.normattiva.it/uri-res/N2Ls?{URN}~art{NUM}`
- Formato URN: `urn:nir:stato:{tipo}:{data};{numero}`
- Risposta: HTML con struttura Akoma Ntoso (classi CSS: `article-heading-akn`, `art-commi-div-akn`)
- Stato: **funzionante**, affidabile, nessuna autenticazione richiesta

## Formato dati
- **Tipo:** HTML con classi Akoma Ntoso
- **Titolo articolo:** `<div class="article-heading-akn">{titolo}</div>`
- **Corpo articolo:** `<div class="art-commi-div-akn">{commi}</div>`
- **Encoding:** HTML entities (&agrave;, &egrave;, etc.)
- **Rate limit:** non documentato, si consiglia 300ms tra le richieste

## Field mapping → CorpusArticle
| Normattiva | CorpusArticle |
|---|---|
| `article-heading-akn` → text | `articleTitle` |
| `art-commi-div-akn` → text | `articleText` |
| URN | `sourceUrl` |
| Suffisso articolo (`art1`, `art1bis`) | `articleReference` ("Art. 1", "Art. 1-bis") |

## Volume stimato
| Fonte | Articoli stimati |
|---|---|
| D.Lgs. 206/2005 (Codice del Consumo) | ~146 |
| Codice di Procedura Civile | ~840 |
| L. 392/1978 (Equo Canone) | ~84 |
| D.Lgs. 209/2005 (Codice Assicurazioni) | ~355 |
| D.Lgs. 385/1993 (TU Bancario) | ~162 |
| D.Lgs. 14/2019 (Codice della Crisi) | ~391 |
| **Totale** | **~1978** |

## Confidenza: **Alta**
- Testato con successo su singoli articoli
- Lo stesso metodo è già stato usato per popolare le 3548 righe esistenti nel DB
