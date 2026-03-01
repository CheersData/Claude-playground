/**
 * Normattiva Connector — Connettore per Normattiva Open Data API.
 *
 * Base URL: https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1/
 *
 * Endpoint usati:
 * - GET  tipologiche/estensioni             → formati disponibili (test API)
 * - POST ricerca/semplice                   → ricerca per keyword (trova atto)
 * - POST ricerca/aggiornati                 → atti modificati tra date (delta)
 * - POST ricerca-asincrona/nuova-ricerca    → bulk async (step 1: richiedi)
 * - PUT  ricerca-asincrona/conferma-ricerca → bulk async (step 2: conferma)
 * - GET  ricerca-asincrona/check-status/:t  → bulk async (step 3: poll)
 * - GET  collections/download/collection-asincrona/:t   → download ZIP async
 * - GET  collections/download/collection-preconfezionata → download ZIP Codici
 *
 * NOTA: User-Agent browser obbligatorio (WAF Poligrafico blocca curl/fetch default).
 * Licenza: CC BY 4.0, nessuna autenticazione.
 */

import AdmZip from "adm-zip";
import { BaseConnector } from "./base";
import { parseAkn } from "../parsers/akn-parser";
import type {
  ConnectResult,
  FetchResult,
  ParsedArticle,
  DataSource,
} from "../types";

const API_BASE =
  "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1";

/** Mapping normattivaActType → codice denominazioneAtto API */
const ACT_TYPE_MAP: Record<string, string> = {
  "regio.decreto": "PRD",
  "decreto.legislativo": "PLL",
  "legge": "PLE",
  "decreto.del.presidente.della.repubblica": "PPR",
  "decreto.legge": "PDL",
  "decreto": "DCT",
};

/**
 * Mappa source_id → collezione preconfezionata da cui scaricare.
 * L'API async di Normattiva produce ZIP vuoti, quindi usiamo le collezioni.
 */
const SOURCE_COLLECTION_MAP: Record<string, string> = {
  codice_civile: "Codici",
  codice_penale: "Codici",
  codice_consumo: "Codici",
  codice_proc_civile: "Codici",
  tu_edilizia: "Testi Unici",
  dlgs_231_2001: "Decreti Legislativi",
  dlgs_122_2005: "Decreti Legislativi",
};

// ─── Tipi risposta API ───

interface RicercaAtto {
  codiceRedazionale: string;
  denominazioneAtto: string;
  annoProvvedimento: string;
  numeroProvvedimento: string;
  titoloAtto: string;
  dataUltimaModifica: string | null;
}

interface RicercaResponse {
  listaAtti?: RicercaAtto[];
  numeroAttiTrovati?: number;
  numeroPagine?: number;
}

interface TipologicaDto {
  label: string;
  value: string;
}

export class NormattivaConnector extends BaseConnector<ParsedArticle> {
  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);
  }

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;

    try {
      // 1. Test API: formati disponibili
      this.log(`[NORMATTIVA] Test API formati...`);
      const formats = await this.fetchJSON<TipologicaDto[]>(
        `${API_BASE}/tipologiche/estensioni`
      );
      const availableFormats = formats.map((f) => f.label);
      this.log(`[NORMATTIVA] Formati: ${availableFormats.join(", ")}`);

      // 2. Cerca l'atto per ottenere codiceRedazionale (prova tutti i search terms)
      const searchTerms =
        (this.source.config.normattivaSearchTerms as string[]) ?? [];
      let codiceRed = "";
      let actTitle = "";
      let estimatedItems = this.source.estimatedItems;

      for (const term of searchTerms) {
        this.log(`[NORMATTIVA] Ricerca: "${term}"...`);
        const result = await this.searchSemplice(term);
        const atto = this.findMatchingAtto(result);

        if (atto) {
          codiceRed = atto.codiceRedazionale;
          actTitle = atto.titoloAtto?.replace(/[\r\n]/g, " ").trim() ?? "";
          this.log(
            `[NORMATTIVA] Trovato: ${codiceRed} | ${atto.denominazioneAtto} ${atto.annoProvvedimento}/${atto.numeroProvvedimento}`
          );
          break;
        }
        await this.rateLimitPause();
      }

      // 3. Se la fonte ha una collezione, prova a parsare un sample
      const sampleData: ParsedArticle[] = [];
      const collectionName = SOURCE_COLLECTION_MAP[sourceId];
      if (collectionName && codiceRed) {
        try {
          this.log(`[NORMATTIVA] Download sample da "${collectionName}"...`);
          const articles = await this.fetchFromCollection(
            collectionName,
            codiceRed
          );
          estimatedItems = articles.length;
          sampleData.push(...articles.slice(0, 3));
          this.log(
            `[NORMATTIVA] Parsati ${articles.length} articoli da ${collectionName}`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`[NORMATTIVA] Sample Codici fallito (non bloccante): ${msg}`);
        }
      } else if (this.source.config.directAkn) {
        // Strategia 3: caricaAKN diretto — testa il sample scaricando l'atto completo
        const hardcodedCodice = this.source.config.codiceRedazionale as string | undefined;
        try {
          this.log(`[NORMATTIVA] Sample via caricaAKN diretto (${hardcodedCodice ?? codiceRed})...`);
          const articles = await this.fetchViaDirectAkn(hardcodedCodice ?? codiceRed);
          estimatedItems = articles.length;
          sampleData.push(...articles.slice(0, 3));
          this.log(`[NORMATTIVA] Parsati ${articles.length} articoli via caricaAKN`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`[NORMATTIVA] Sample caricaAKN fallito (non bloccante): ${msg}`);
        }
      }

      return {
        sourceId,
        ok: true,
        message: `API OK | ${codiceRed || "atto non trovato"} | ${actTitle.slice(0, 60)} | ~${estimatedItems} art.`,
        census: {
          estimatedItems,
          availableFormats,
          sampleFields: [
            "articleNumber",
            "articleTitle",
            "articleText",
            "hierarchy",
          ],
          sampleData: sampleData.length > 0 ? sampleData : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `Errore connessione Normattiva: ${msg}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    this.log(`[NORMATTIVA] Fetch completo per ${this.source.id}`);

    // 1. Trova codiceRedazionale
    const codiceRed = await this.findCodiceRedazionale();
    this.log(`[NORMATTIVA] codiceRedazionale: ${codiceRed}`);

    // 2. Scarica AKN
    let articles: ParsedArticle[];

    const collectionName = SOURCE_COLLECTION_MAP[this.source.id];
    const directAkn = this.source.config.directAkn as boolean | undefined;
    const hardcodedCodice = this.source.config.codiceRedazionale as string | undefined;

    if (collectionName) {
      // Strategia 1: Collezione preconfezionata
      this.log(`[NORMATTIVA] Download da "${collectionName}"...`);
      articles = await this.fetchFromCollection(collectionName, codiceRed);
    } else if (directAkn) {
      // Strategia 3: caricaAKN diretto (per leggi con ZIP asincroni vuoti)
      this.log(`[NORMATTIVA] Download via caricaAKN diretto...`);
      articles = await this.fetchViaDirectAkn(hardcodedCodice ?? codiceRed);
    } else {
      // Strategia 2: Ricerca asincrona
      this.log(`[NORMATTIVA] Download via ricerca asincrona...`);
      articles = await this.fetchViaAsyncSearch();
    }

    this.log(`[NORMATTIVA] Parsati ${articles.length} articoli`);

    if (options?.limit && articles.length > options.limit) {
      articles = articles.slice(0, options.limit);
    }

    return {
      sourceId: this.source.id,
      items: articles,
      fetchedAt: new Date().toISOString(),
      metadata: { codiceRedazionale: codiceRed, format: "akn" },
    };
  }

  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    this.log(`[NORMATTIVA] Delta dal ${since} per ${this.source.id}`);

    try {
      const updates = await this.searchAggiornati(since);

      if (updates.length === 0) {
        this.log(`[NORMATTIVA] Nessun aggiornamento dal ${since}`);
        return {
          sourceId: this.source.id,
          items: [],
          fetchedAt: new Date().toISOString(),
          metadata: { since, updatesFound: 0 },
        };
      }

      // Filtra per il nostro atto
      const urnInfo = this.parseUrn();
      const matching = updates.filter((a) => {
        if (!urnInfo) return false;
        return (
          a.annoProvvedimento === String(urnInfo.anno) &&
          a.numeroProvvedimento === String(urnInfo.numero)
        );
      });

      if (matching.length === 0) {
        this.log(`[NORMATTIVA] Nessun aggiornamento per questo atto`);
        return {
          sourceId: this.source.id,
          items: [],
          fetchedAt: new Date().toISOString(),
          metadata: { since, updatesFound: 0 },
        };
      }

      this.log(
        `[NORMATTIVA] ${matching.length} aggiornamenti trovati, re-fetch...`
      );
      return this.fetchAll(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[NORMATTIVA] Delta fallito: ${msg}`);
      return {
        sourceId: this.source.id,
        items: [],
        fetchedAt: new Date().toISOString(),
        metadata: { since, error: msg },
      };
    }
  }

  // ─── Metodi interni ───

  /**
   * Cerca l'atto con ricerca/semplice e ritorna il codiceRedazionale.
   */
  private async findCodiceRedazionale(): Promise<string> {
    const searchTerms =
      (this.source.config.normattivaSearchTerms as string[]) ?? [];

    for (const term of searchTerms) {
      const result = await this.searchSemplice(term);
      const atto = this.findMatchingAtto(result);
      if (atto?.codiceRedazionale) return atto.codiceRedazionale;
      await this.rateLimitPause();
    }

    throw new Error(
      `Atto non trovato per "${this.source.id}". Verificare normattivaSearchTerms.`
    );
  }

  /**
   * Filtra i risultati di ricerca per trovare il nostro atto specifico.
   * Usa anno e numero provvedimento dall'URN per il match esatto.
   */
  private findMatchingAtto(response: RicercaResponse): RicercaAtto | null {
    const atti = response.listaAtti ?? [];
    if (atti.length === 0) return null;

    const urnInfo = this.parseUrn();
    if (!urnInfo) return atti[0]; // fallback al primo risultato

    // Match esatto per anno + numero + tipo atto
    const actCode = ACT_TYPE_MAP[urnInfo.type] ?? "";
    const exact = atti.find(
      (a) =>
        a.annoProvvedimento === String(urnInfo.anno) &&
        a.numeroProvvedimento === String(urnInfo.numero) &&
        (!actCode || a.denominazioneAtto === actCode)
    );
    if (exact) return exact;

    // Match parziale: solo anno + numero (tipo atto potrebbe differire)
    const partial = atti.find(
      (a) =>
        a.annoProvvedimento === String(urnInfo.anno) &&
        a.numeroProvvedimento === String(urnInfo.numero)
    );
    if (partial) return partial;

    // Nessun match con URN — NON fare fallback su atti[0]
    // (sarebbe un atto diverso, es. legge delega anziché decreto attuativo)
    return null;
  }

  /**
   * Parsing URN per estrarre tipo, anno, numero.
   * Es: "urn:nir:stato:decreto.legislativo:2005-09-06;206"
   *   → { type: "decreto.legislativo", anno: 2005, numero: 206 }
   */
  private parseUrn(): { type: string; anno: number; numero: number } | null {
    const urn = this.source.config.urn as string | undefined;
    if (!urn) return null;

    const match = urn.match(
      /urn:nir:\w+:([^:]+):(\d{4})-\d{2}-\d{2};(\d+)/
    );
    if (!match) return null;

    return {
      type: match[1],
      anno: parseInt(match[2]),
      numero: parseInt(match[3]),
    };
  }

  /**
   * Ricerca semplice con lo schema corretto dall'OpenAPI spec.
   */
  private async searchSemplice(keyword: string): Promise<RicercaResponse> {
    return this.fetchJSON<RicercaResponse>(`${API_BASE}/ricerca/semplice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testoRicerca: keyword,
        paginazione: {
          paginaCorrente: 1,
          numeroElementiPerPagina: 10,
        },
      }),
    });
  }

  /**
   * Atti aggiornati tra due date (per delta updates).
   */
  private async searchAggiornati(since: string): Promise<RicercaAtto[]> {
    const now = new Date().toISOString();
    const response = await this.fetchJSON<RicercaResponse>(
      `${API_BASE}/ricerca/aggiornati`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataInizioAggiornamento: since,
          dataFineAggiornamento: now,
        }),
      }
    );
    return response.listaAtti ?? [];
  }

  // ─── Strategia 1: Collezione preconfezionata ───

  /**
   * Scarica una collezione preconfezionata ed estrae l'atto per codiceRedazionale.
   * Collezioni usate: Codici (~10 MB), Testi Unici (~8 MB), Decreti Legislativi (~62 MB).
   */
  private async fetchFromCollection(
    collectionName: string,
    codiceRedazionale: string
  ): Promise<ParsedArticle[]> {
    const url = `${API_BASE}/collections/download/collection-preconfezionata?nome=${encodeURIComponent(collectionName)}&formato=AKN&formatoRichiesta=V`;

    this.log(`[NORMATTIVA] Download "${collectionName}" (AKN vigente)...`);
    const response = await this.fetchWithRetry(url, { redirect: "follow" });

    if (!response.ok) {
      throw new Error(`Download "${collectionName}" HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    this.log(
      `[NORMATTIVA] ZIP scaricato: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`
    );

    return this.extractAknFromZip(buffer, codiceRedazionale);
  }

  // ─── Strategia 2: Ricerca asincrona ───

  /**
   * Scarica un atto specifico via ricerca asincrona (3 step).
   * Flusso: nuova-ricerca → conferma → poll → download ZIP → parse AKN
   */
  private async fetchViaAsyncSearch(): Promise<ParsedArticle[]> {
    const urnInfo = this.parseUrn();
    if (!urnInfo) {
      throw new Error(`URN mancante per "${this.source.id}"`);
    }

    const denomCode = ACT_TYPE_MAP[urnInfo.type];
    if (!denomCode) {
      throw new Error(
        `Tipo atto "${urnInfo.type}" non mappato. Aggiungere a ACT_TYPE_MAP.`
      );
    }

    // Step 1: Nuova ricerca
    this.log(`[NORMATTIVA] Async step 1: nuova-ricerca...`);
    const tokenResponse = await this.fetchWithRetry(
      `${API_BASE}/ricerca-asincrona/nuova-ricerca`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formato: "AKN",
          tipoRicerca: "A",
          richiestaExport: "V",
          parametriRicerca: {
            denominazioneAtto: denomCode,
            numeroProvvedimento: urnInfo.numero,
            annoProvvedimento: urnInfo.anno,
          },
        }),
      }
    );

    const token = await tokenResponse.text();
    if (!token || token.length < 10) {
      throw new Error(`Token non valido: "${token}"`);
    }
    this.log(`[NORMATTIVA] Token: ${token}`);

    await this.rateLimitPause();

    // Step 2: Conferma
    this.log(`[NORMATTIVA] Async step 2: conferma...`);
    await this.fetchWithRetry(
      `${API_BASE}/ricerca-asincrona/conferma-ricerca`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }
    );

    await this.rateLimitPause();

    // Step 3: Poll fino a completamento
    // L'endpoint ritorna 200 con JSON durante l'elaborazione,
    // poi 303 (redirect) quando completata. Il Location header contiene l'URL di download.
    this.log(`[NORMATTIVA] Async step 3: poll status...`);
    let downloadUrl = `${API_BASE}/collections/download/collection-asincrona/${token}`;
    const maxPolls = 30;
    for (let i = 0; i < maxPolls; i++) {
      const statusResp = await this.fetchWithRetry(
        `${API_BASE}/ricerca-asincrona/check-status/${token}`,
        { redirect: "manual" } // Non seguire il redirect 303
      );

      // 303 = completata (redirect al download)
      if (statusResp.status === 303) {
        const location = statusResp.headers.get("location");
        if (location) {
          downloadUrl = location.startsWith("http")
            ? location
            : `${API_BASE}${location}`;
          this.log(
            `[NORMATTIVA] Stato: completata (303 → ${location.slice(0, 80)})`
          );
        } else {
          this.log(`[NORMATTIVA] Stato: completata (303 redirect)`);
        }
        break;
      }

      if (statusResp.ok) {
        const statusData = (await statusResp.json()) as {
          stato: number;
          descrizioneStato: string;
          percentuale: number;
        };
        this.log(
          `[NORMATTIVA] Stato: ${statusData.stato} (${statusData.descrizioneStato}) ${statusData.percentuale}%`
        );

        if (statusData.stato === 3) break; // Completata
        if (statusData.stato === 4) {
          throw new Error(
            `Ricerca asincrona fallita: ${statusData.descrizioneStato}`
          );
        }
      }

      await this.sleep(3000); // Poll ogni 3s
    }

    // Step 4: Download ZIP
    this.log(`[NORMATTIVA] Async step 4: download da ${downloadUrl.slice(0, 80)}...`);
    const dlResponse = await this.fetchWithRetry(downloadUrl, {
      redirect: "follow",
    });

    if (!dlResponse.ok) {
      throw new Error(`Download async HTTP ${dlResponse.status}`);
    }

    const arrayBuffer = await dlResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    this.log(
      `[NORMATTIVA] ZIP scaricato: ${(buffer.length / 1024).toFixed(0)} KB`
    );

    if (buffer.length < 100) {
      throw new Error(
        `ZIP troppo piccolo (${buffer.length} bytes), probabilmente vuoto`
      );
    }

    return this.extractAknFromZip(buffer);
  }

  // ─── Strategia 3: caricaAKN diretto ───

  /**
   * Scarica un atto direttamente via caricaAKN (senza ricerca asincrona).
   * Usato per leggi che producono ZIP vuoti con la ricerca asincrona (es. L. 300/1970).
   *
   * Due modalità:
   * - normattivaDataGU presente → usa portale web www.normattiva.it/do/atto/caricaAKN
   *   (confermato funzionante per leggi storiche, richiede session cookie + Referer)
   * - altrimenti → usa Open Data API (per leggi più recenti)
   */
  private async fetchViaDirectAkn(codiceRedazionale: string): Promise<ParsedArticle[]> {
    const dataGU = this.source.config.normattivaDataGU as string | undefined;

    if (dataGU) {
      return this.fetchViaWebCaricaAKN(codiceRedazionale, dataGU);
    }

    // Open Data API endpoint (leggi più recenti)
    const url = `${API_BASE}/atto/caricaAKN?codiceRedazionale=${encodeURIComponent(codiceRedazionale)}&formatoRichiesta=V`;
    this.log(`[NORMATTIVA] Download via caricaAKN API: ${codiceRedazionale}...`);
    const response = await this.fetchWithRetry(url, { redirect: "follow" });

    if (!response.ok) {
      throw new Error(`caricaAKN API HTTP ${response.status} per "${codiceRedazionale}"`);
    }

    const xml = await response.text();
    if (!xml.trim().startsWith("<") || xml.length < 100) {
      throw new Error(`caricaAKN API risposta non XML: "${xml.slice(0, 100)}"`);
    }
    this.log(`[NORMATTIVA] AKN ricevuto: ${xml.length} chars`);

    return parseAkn(xml, this.source.shortName);
  }

  /**
   * Scarica AKN dal portale web www.normattiva.it tramite l'endpoint /do/atto/caricaAKN.
   * Usato per leggi storiche dove l'API Open Data asincrona produce ZIP vuoti.
   *
   * Flusso:
   * 1. Carica la pagina principale dell'atto per ottenere il session cookie dal WAF.
   * 2. Chiama caricaAKN con Referer + Cookie per ricevere l'XML AKN consolidato.
   *
   * URL confermato funzionante (2026-03-01, CC BY 4.0):
   *   https://www.normattiva.it/do/atto/caricaAKN?dataGU=19700527&codiceRedaz=070U0300&dataVigenza=20260301
   *
   * @param codiceRedazionale - es. "070U0300" per L. 300/1970
   * @param dataGU - data pubblicazione GU in formato YYYYMMDD (es. "19700527")
   */
  private async fetchViaWebCaricaAKN(
    codiceRedazionale: string,
    dataGU: string
  ): Promise<ParsedArticle[]> {
    const urn = this.source.config.urn as string | undefined;
    const pageUrl = urn
      ? `https://www.normattiva.it/uri-res/N2Ls?${urn}`
      : `https://www.normattiva.it`;

    // Step 1: carica pagina dell'atto per il session cookie del WAF
    this.log(`[NORMATTIVA-WEB] Carico pagina per session cookie: ${pageUrl}`);
    const pageResp = await this.fetchWithRetry(pageUrl, { redirect: "follow" });

    // Estrai cookie: ogni Set-Cookie è separato da "," a livello di header multipli,
    // ma headers.get() li restituisce come stringa singola. Prendiamo solo nome=valore
    // (prima del primo ";") per ciascun cookie.
    const rawCookie = pageResp.headers.get("set-cookie") ?? "";
    const cookieValue = rawCookie
      .split(/,(?=[^;]+=[^;]*)/) // split su virgole tra cookie distinti
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");

    // Step 2: chiama caricaAKN con cookie e Referer
    const dataVigenza = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const aknUrl =
      `https://www.normattiva.it/do/atto/caricaAKN` +
      `?dataGU=${encodeURIComponent(dataGU)}` +
      `&codiceRedaz=${encodeURIComponent(codiceRedazionale)}` +
      `&dataVigenza=${dataVigenza}`;

    this.log(`[NORMATTIVA-WEB] Fetch AKN: ${aknUrl}`);
    const aknResp = await this.fetchWithRetry(aknUrl, {
      redirect: "follow",
      headers: {
        Referer: pageUrl,
        ...(cookieValue ? { Cookie: cookieValue } : {}),
      },
    });

    if (!aknResp.ok) {
      throw new Error(
        `caricaAKN web HTTP ${aknResp.status} per "${codiceRedazionale}"`
      );
    }

    const xml = await aknResp.text();
    if (!xml.trim().startsWith("<") || xml.length < 500) {
      throw new Error(
        `caricaAKN web risposta non XML (${xml.length} chars): "${xml.slice(0, 200)}"`
      );
    }

    this.log(`[NORMATTIVA-WEB] AKN ricevuto: ${xml.length} chars`);
    return parseAkn(xml, this.source.shortName);
  }

  // ─── ZIP handling ───

  /**
   * Estrae articoli AKN da un file ZIP.
   * Se codiceRedazionale e specificato, estrae solo quel file XML.
   * Altrimenti estrae il primo/unico XML trovato.
   */
  private extractAknFromZip(
    zipBuffer: Buffer,
    codiceRedazionale?: string
  ): ParsedArticle[] {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // Trova il file XML corrispondente
    const xmlEntries = entries.filter(
      (e) => e.entryName.endsWith(".xml") && !e.isDirectory
    );

    if (xmlEntries.length === 0) {
      throw new Error(`Nessun file XML trovato nel ZIP`);
    }

    let targetEntry = xmlEntries[0];

    if (codiceRedazionale) {
      const match = xmlEntries.find((e) =>
        e.entryName.includes(codiceRedazionale)
      );
      if (match) {
        targetEntry = match;
      } else {
        this.log(
          `[NORMATTIVA] WARN: ${codiceRedazionale} non trovato nel ZIP, uso ${targetEntry.entryName}`
        );
      }
    }

    this.log(
      `[NORMATTIVA] Parsing AKN: ${targetEntry.entryName} (${(targetEntry.header.size / 1024).toFixed(0)} KB)`
    );

    const xml = targetEntry.getData().toString("utf-8");
    return parseAkn(xml, this.source.shortName);
  }
}
