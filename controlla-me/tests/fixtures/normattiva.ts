/**
 * Test fixtures for Normattiva connectors.
 */

// ─── Open Data API fixtures ───

/** Simulated response from POST /ricerca/avanzata */
export function makeSearchResult(overrides?: Partial<{
  codiceRedazionale: string;
  titoloAtto: string;
  annoProvvedimento: string;
  numeroProvvedimento: string;
  denominazioneAtto: string;
  descrizioneAtto: string;
}>) {
  return {
    listaAtti: [
      {
        codiceRedazionale: "005G0232",
        dataGU: "2005-10-08",
        titoloAtto: "Codice del consumo",
        annoProvvedimento: "2005",
        numeroProvvedimento: "206",
        denominazioneAtto: "DECRETO LEGISLATIVO",
        descrizioneAtto: "Codice del consumo, a norma dell'articolo 7 della legge 29 luglio 2003, n. 229.",
        ...overrides,
      },
    ],
    numeroAttiTrovati: 1,
  };
}

/** Simulated empty search result */
export function makeEmptySearchResult() {
  return { listaAtti: [], numeroAttiTrovati: 0 };
}

/** Simulated async export confirm response */
export function makeAsyncConfirmState() {
  return {
    stato: 1,
    descrizioneStato: "In corso",
    descrizioneErrore: null,
    totAtti: 1,
    attiElaborati: 0,
    percentuale: 0,
  };
}

/** Simulated async export polling response (in progress) */
export function makeAsyncPollingState(percentuale: number) {
  return {
    stato: 1,
    descrizioneStato: "In corso",
    descrizioneErrore: null,
    totAtti: 1,
    attiElaborati: percentuale === 100 ? 1 : 0,
    percentuale,
  };
}

/** Simulated Normattiva Open Data JSON act structure */
export function makeNormativaJsonAct(overrides?: {
  urn?: string;
  titoloDoc?: string;
  articlesCount?: number;
}) {
  const urn = overrides?.urn ?? "urn:nir:stato:decreto.legislativo:2005-09-06;206";
  const titolo = overrides?.titoloDoc ?? "Codice del consumo";
  const count = overrides?.articlesCount ?? 3;

  const articles = Array.from({ length: count }, (_, i) => ({
    nomeNir: "articolo",
    idNir: `art${i + 1}`,
    numNir: String(i + 1),
    rubricaNir: `Rubrica articolo ${i + 1}`,
    testo: `Art. ${i + 1} Testo dell'articolo ${i + 1} del ${titolo}. Il presente comma disciplina le modalità e condizioni previste dalla normativa vigente in materia.`,
    dataVigoreVersione: [
      { inizioVigore: "20050906", fineVigore: "99999999" },
    ],
  }));

  return {
    metadati: {
      urn,
      eli: `http://www.normattiva.it/eli/id/2005/10/08/005G0232/CONSOLIDATED`,
      emettitore: "stato",
      numDoc: "206",
      tipoDoc: "DECRETO LEGISLATIVO",
      titoloDoc: titolo,
      dataDoc: "2005-09-06",
      dataPubblicazione: "2005-10-08",
      numeroPubblicazione: "235",
      redazione: "V",
    },
    articolato: {
      elementi: [
        {
          idInterno: 1,
          numNir: "PARTE I*Disposizioni generali*-*-*TITOLO I*Disposizioni generali e finalità*",
          elementi: articles,
        },
      ],
    },
  };
}

/** Simulated Normattiva HTML article page */
export function makeNormativaHtmlPage(artNum: string, opts?: {
  title?: string;
  text?: string;
}) {
  const title = opts?.title ?? `Rubrica dell'articolo ${artNum}`;
  const text = opts?.text ?? `1. Il consumatore ha diritto alla tutela prevista dall'articolo ${artNum} del presente codice. 2. Le disposizioni del presente articolo si applicano anche ai contratti a distanza e negoziati fuori dai locali commerciali.`;

  return `<!DOCTYPE html>
<html>
<head><title>Normattiva</title></head>
<body>
<article>
  <div class="article-heading-akn"><span>Art. ${artNum}</span> - ${title}</div>
  <div class="art-commi-div-akn">
    <p>${text}</p>
  </div>
  <div class="box_generico">note</div>
</article>
</body>
</html>`;
}

/** Simulated Normattiva HTML page with no article content */
export function makeNormativaEmptyHtmlPage() {
  return `<!DOCTYPE html>
<html><body><div class="no-article">Articolo non trovato</div></body></html>`;
}
