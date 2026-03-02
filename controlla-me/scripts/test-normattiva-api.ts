import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const API = "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1";

async function trySearch(label: string, body: Record<string, unknown>) {
  console.log(`\n${label}`);
  try {
    const r = await fetch(`${API}/ricerca/semplice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log("  Status:", r.status);
    const text = await r.text();
    console.log("  Response:", text.slice(0, 400));
  } catch (e: unknown) {
    console.log("  Error:", e instanceof Error ? e.message : String(e));
  }
}

async function tryEndpoint(label: string, endpoint: string, method = "GET", body?: unknown) {
  console.log(`\n${label}`);
  try {
    const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${API}${endpoint}`, opts);
    console.log("  Status:", r.status);
    const text = await r.text();
    console.log("  Response:", text.slice(0, 500));
  } catch (e: unknown) {
    console.log("  Error:", e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  // Test diversi formati body per ricerca/semplice
  await trySearch("A. Body con testoCercato", {
    testoCercato: "codice civile",
    numeroPagina: 1,
    dimensionePagina: 3,
  });

  await trySearch("B. Body con testo", {
    testo: "codice civile",
    pagina: 1,
    dimensione: 3,
  });

  await trySearch("C. Body con query", {
    query: "codice civile",
    page: 1,
    size: 3,
  });

  await trySearch("D. Body con keyword", {
    keyword: "codice civile",
  });

  // Prova ricerca avanzata
  await tryEndpoint("E. Ricerca avanzata", "/ricerca/avanzata", "POST", {
    testoCercato: "codice civile",
    numeroPagina: 1,
    dimensionePagina: 3,
  });

  // Prova GET su ricerca semplice
  await tryEndpoint("F. GET ricerca/semplice?q=codice+civile", "/ricerca/semplice?testoCercato=codice+civile&numeroPagina=1&dimensionePagina=3");

  // Prova endpoint atti
  await tryEndpoint("G. GET atti (lista)", "/atti");

  // Prova catalogo
  await tryEndpoint("H. GET tipologiche/tipi-atto", "/tipologiche/tipi-atto");

  // Prova con URN specifica
  await tryEndpoint("I. GET atti by URN", "/atti?urn=urn:nir:stato:decreto.legislativo:2005-06-20;122");
}

main().catch(console.error);
