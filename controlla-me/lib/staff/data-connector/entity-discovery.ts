/**
 * Entity Discovery — Catalogo statico di entita disponibili per connettore.
 *
 * A differenza della discovery engine completa (./discovery/), questo modulo
 * NON richiede connessione API: utilizza cataloghi statici hardcoded con
 * metadati ricchi (descrizione, categoria, Italian aliases) per supportare:
 *
 *   1. L'Integration Setup Agent nella conversazione (entity lookup senza auth)
 *   2. La ricerca fuzzy per nome italiano/inglese (searchEntities)
 *   3. La selezione entita nel wizard di setup
 *
 * I cataloghi statici sono il DEFAULT/fallback. Se il connettore supporta
 * la discovery live (SchemaDiscoveryEngine), i risultati si combinano.
 */

// ─── Types ───

export interface DiscoveredEntity {
  /** Unique entity identifier (e.g., "contacts", "issued_invoices") */
  id: string;
  /** Display name (Italian) */
  name: string;
  /** Human-readable description of what this entity contains (Italian) */
  description: string;
  /** Functional category */
  category: string;
  /** Approximate record count (null = unknown) */
  estimatedCount?: number;
  /** Whether this is a core/primary entity for the connector */
  isCore: boolean;
}

/** Italian alias map: Italian term -> canonical entity ID */
interface AliasEntry {
  /** Italian terms that map to this entity */
  aliases: string[];
  /** Canonical entity ID */
  entityId: string;
  /** Connector this alias applies to (null = all connectors) */
  connectorId: string | null;
}

// ─── Italian Alias Registry ───

const ITALIAN_ALIASES: AliasEntry[] = [
  // Cross-connector
  { aliases: ["contatto", "contatti", "rubrica", "anagrafica"], entityId: "contacts", connectorId: null },
  { aliases: ["azienda", "aziende", "societa", "impresa", "imprese", "organizzazione", "organizzazioni"], entityId: "companies", connectorId: null },
  { aliases: ["prodotto", "prodotti", "catalogo", "articolo", "articoli"], entityId: "products", connectorId: null },
  { aliases: ["fattura", "fatture", "bolletta", "bollette", "documento fiscale"], entityId: "invoices", connectorId: null },
  { aliases: ["pagamento", "pagamenti", "transazione", "transazioni"], entityId: "payments", connectorId: null },
  { aliases: ["cliente", "clienti", "acquirente", "acquirenti"], entityId: "clients", connectorId: null },
  { aliases: ["fornitore", "fornitori"], entityId: "suppliers", connectorId: null },
  { aliases: ["ordine", "ordini"], entityId: "orders", connectorId: null },
  { aliases: ["preventivo", "preventivi", "offerta", "offerte"], entityId: "quotes", connectorId: null },
  { aliases: ["ticket", "richiesta", "richieste", "assistenza", "supporto"], entityId: "tickets", connectorId: null },
  { aliases: ["nota", "note", "appunto", "appunti"], entityId: "notes", connectorId: null },
  { aliases: ["email", "posta", "messaggi"], entityId: "emails", connectorId: null },
  { aliases: ["riunione", "riunioni", "meeting", "appuntamento", "appuntamenti"], entityId: "meetings", connectorId: null },
  { aliases: ["chiamata", "chiamate", "telefonata", "telefonate"], entityId: "calls", connectorId: null },
  { aliases: ["compito", "compiti", "task", "attivita"], entityId: "tasks", connectorId: null },
  { aliases: ["documento", "documenti", "file"], entityId: "files", connectorId: null },
  { aliases: ["cartella", "cartelle", "directory"], entityId: "folders", connectorId: null },
  { aliases: ["abbonamento", "abbonamenti", "sottoscrizione", "sottoscrizioni"], entityId: "subscriptions", connectorId: null },

  // HubSpot-specific
  { aliases: ["trattativa", "trattative", "deal", "opportunita"], entityId: "deals", connectorId: "hubspot" },
  { aliases: ["campagna", "campagne", "marketing"], entityId: "campaigns", connectorId: "hubspot" },
  { aliases: ["feedback", "sondaggio", "sondaggi"], entityId: "feedback_submissions", connectorId: "hubspot" },
  { aliases: ["impegno", "impegni", "engagement", "interazione", "interazioni"], entityId: "engagements", connectorId: "hubspot" },

  // Fatture in Cloud
  { aliases: ["fattura emessa", "fatture emesse", "fattura attiva", "fatture attive"], entityId: "issued_invoices", connectorId: "fatture-in-cloud" },
  { aliases: ["fattura ricevuta", "fatture ricevute", "fattura passiva", "fatture passive"], entityId: "received_invoices", connectorId: "fatture-in-cloud" },
  { aliases: ["corrispettivo", "corrispettivi"], entityId: "receipts", connectorId: "fatture-in-cloud" },
  { aliases: ["ddt", "documento di trasporto", "documenti di trasporto", "bolla", "bolle"], entityId: "delivery_notes", connectorId: "fatture-in-cloud" },
  { aliases: ["ricevuta fiscale", "ricevute fiscali"], entityId: "fiscal_receipts", connectorId: "fatture-in-cloud" },
  { aliases: ["f24", "modello f24", "tributo", "tributi"], entityId: "f24", connectorId: "fatture-in-cloud" },
  { aliases: ["proforma", "fattura proforma"], entityId: "proformas", connectorId: "fatture-in-cloud" },
  { aliases: ["nota di credito", "note di credito"], entityId: "credit_notes", connectorId: "fatture-in-cloud" },

  // Salesforce
  { aliases: ["lead", "contatto potenziale", "contatti potenziali", "prospect"], entityId: "leads", connectorId: "salesforce" },
  { aliases: ["opportunita di vendita", "trattativa"], entityId: "opportunities", connectorId: "salesforce" },
  { aliases: ["caso", "casi"], entityId: "cases", connectorId: "salesforce" },
  { aliases: ["evento", "eventi"], entityId: "events", connectorId: "salesforce" },
  { aliases: ["contratto", "contratti"], entityId: "contracts", connectorId: "salesforce" },

  // Stripe
  { aliases: ["addebito", "addebiti", "charge"], entityId: "charges", connectorId: "stripe" },
  { aliases: ["rimborso", "rimborsi"], entityId: "refunds", connectorId: "stripe" },
  { aliases: ["contestazione", "contestazioni", "disputa", "dispute"], entityId: "disputes", connectorId: "stripe" },
  { aliases: ["payout", "accredito", "accrediti", "bonifico", "bonifici"], entityId: "payouts", connectorId: "stripe" },
  { aliases: ["coupon", "sconto", "sconti", "codice sconto"], entityId: "coupons", connectorId: "stripe" },
  { aliases: ["prezzo", "prezzi", "listino"], entityId: "prices", connectorId: "stripe" },
  { aliases: ["saldo", "movimento", "movimenti"], entityId: "balance_transactions", connectorId: "stripe" },

  // Google Drive
  { aliases: ["foglio di calcolo", "fogli di calcolo", "spreadsheet", "excel"], entityId: "spreadsheets", connectorId: "google-drive" },
  { aliases: ["presentazione", "presentazioni", "slides", "slide"], entityId: "presentations", connectorId: "google-drive" },
  { aliases: ["pdf"], entityId: "pdfs", connectorId: "google-drive" },
  { aliases: ["immagine", "immagini", "foto"], entityId: "images", connectorId: "google-drive" },
  { aliases: ["video"], entityId: "videos", connectorId: "google-drive" },
];

// ─── Entity Catalogs ───

const HUBSPOT_ENTITIES: DiscoveredEntity[] = [
  { id: "contacts", name: "Contatti", description: "Persone nel CRM: nome, email, telefono, azienda, lifecycle stage", category: "CRM", isCore: true },
  { id: "companies", name: "Aziende", description: "Organizzazioni: ragione sociale, dominio, settore, numero dipendenti", category: "CRM", isCore: true },
  { id: "deals", name: "Trattative", description: "Opportunita di vendita: nome deal, valore, pipeline, stage, data chiusura", category: "Vendite", isCore: true },
  { id: "tickets", name: "Ticket", description: "Ticket di assistenza: oggetto, contenuto, pipeline, priorita, stato", category: "Supporto", isCore: true },
  { id: "products", name: "Prodotti", description: "Catalogo prodotti e servizi con prezzo, descrizione, SKU", category: "Vendite", isCore: false },
  { id: "line_items", name: "Voci ordine", description: "Prodotti associati a trattative: quantita, prezzo, sconto", category: "Vendite", isCore: false },
  { id: "quotes", name: "Preventivi", description: "Offerte commerciali associate a deal, con voci e scadenza", category: "Vendite", isCore: false },
  { id: "engagements", name: "Interazioni", description: "Attivita CRM: note, email, chiamate, riunioni, task", category: "CRM", isCore: false },
  { id: "feedback_submissions", name: "Feedback", description: "Risposte ai sondaggi di soddisfazione cliente", category: "Supporto", isCore: false },
  { id: "calls", name: "Chiamate", description: "Log delle chiamate: durata, esito, note", category: "CRM", isCore: false },
  { id: "emails", name: "Email", description: "Email tracciate nel CRM con oggetto, corpo e destinatari", category: "CRM", isCore: false },
  { id: "meetings", name: "Riunioni", description: "Riunioni programmate: titolo, partecipanti, orario", category: "CRM", isCore: false },
  { id: "notes", name: "Note", description: "Note testuali associate a contatti, aziende o deal", category: "CRM", isCore: false },
  { id: "tasks", name: "Compiti", description: "Attivita da completare con scadenza, priorita e assegnatario", category: "CRM", isCore: false },
];

const GOOGLE_DRIVE_ENTITIES: DiscoveredEntity[] = [
  { id: "files", name: "Tutti i file", description: "Tutti i file nel Drive, indipendentemente dal tipo", category: "Documenti", isCore: true },
  { id: "folders", name: "Cartelle", description: "Struttura delle cartelle e sottocartelle", category: "Documenti", isCore: true },
  { id: "documents", name: "Documenti Google", description: "Google Docs: documenti di testo modificabili online", category: "Documenti", isCore: false },
  { id: "spreadsheets", name: "Fogli di calcolo", description: "Google Sheets: fogli di calcolo e tabelle", category: "Documenti", isCore: false },
  { id: "presentations", name: "Presentazioni", description: "Google Slides: presentazioni", category: "Documenti", isCore: false },
  { id: "pdfs", name: "PDF", description: "File PDF (fatture, contratti, report)", category: "Documenti", isCore: false },
  { id: "images", name: "Immagini", description: "File immagine: JPEG, PNG, GIF, WebP", category: "Media", isCore: false },
  { id: "videos", name: "Video", description: "File video: MP4, MOV, AVI", category: "Media", isCore: false },
];

const FATTURE_IN_CLOUD_ENTITIES: DiscoveredEntity[] = [
  { id: "issued_invoices", name: "Fatture Emesse", description: "Fatture attive emesse ai clienti: numero, data, importo, IVA, stato pagamento, SDI", category: "Fatturazione", isCore: true },
  { id: "received_invoices", name: "Fatture Ricevute", description: "Fatture passive ricevute dai fornitori: numero, data, importo, IVA, stato", category: "Fatturazione", isCore: true },
  { id: "clients", name: "Clienti", description: "Anagrafica clienti: ragione sociale, P.IVA, CF, indirizzo, email, PEC, codice SDI", category: "Anagrafiche", isCore: true },
  { id: "suppliers", name: "Fornitori", description: "Anagrafica fornitori: ragione sociale, P.IVA, CF, indirizzo, email, PEC", category: "Anagrafiche", isCore: true },
  { id: "products", name: "Prodotti/Servizi", description: "Catalogo prodotti e servizi con prezzo, codice, aliquota IVA", category: "Anagrafiche", isCore: false },
  { id: "quotes", name: "Preventivi", description: "Preventivi e offerte commerciali inviati ai clienti", category: "Documenti", isCore: false },
  { id: "orders", name: "Ordini", description: "Ordini ricevuti dai clienti", category: "Documenti", isCore: false },
  { id: "delivery_notes", name: "DDT", description: "Documenti di trasporto (DDT) per le spedizioni", category: "Documenti", isCore: false },
  { id: "receipts", name: "Corrispettivi", description: "Corrispettivi giornalieri per attivita al dettaglio", category: "Fatturazione", isCore: false },
  { id: "fiscal_receipts", name: "Ricevute Fiscali", description: "Ricevute fiscali emesse al cliente finale", category: "Fatturazione", isCore: false },
  { id: "credit_notes", name: "Note di Credito", description: "Note di credito emesse a fronte di rettifiche o resi", category: "Fatturazione", isCore: false },
  { id: "proformas", name: "Proforma", description: "Fatture proforma (non fiscali, per anticipo pagamento)", category: "Documenti", isCore: false },
  { id: "f24", name: "F24", description: "Modelli F24 per il pagamento di imposte, tasse e contributi", category: "Fiscale", isCore: false },
];

const SALESFORCE_ENTITIES: DiscoveredEntity[] = [
  { id: "accounts", name: "Account", description: "Aziende e organizzazioni clienti: nome, settore, fatturato, indirizzo", category: "CRM", isCore: true },
  { id: "contacts", name: "Contatti", description: "Persone associate agli account: nome, email, telefono, ruolo", category: "CRM", isCore: true },
  { id: "leads", name: "Lead", description: "Contatti potenziali non ancora qualificati: fonte, stato, rating", category: "CRM", isCore: true },
  { id: "opportunities", name: "Opportunita", description: "Trattative di vendita: valore, probabilita, fase, data chiusura", category: "Vendite", isCore: true },
  { id: "cases", name: "Casi", description: "Richieste di supporto: oggetto, priorita, stato, assegnatario", category: "Supporto", isCore: true },
  { id: "tasks", name: "Attivita", description: "Compiti e attivita da completare con scadenza e priorita", category: "CRM", isCore: false },
  { id: "events", name: "Eventi", description: "Appuntamenti e riunioni nel calendario Salesforce", category: "CRM", isCore: false },
  { id: "campaigns", name: "Campagne", description: "Campagne marketing: budget, tipo, stato, ROI atteso", category: "Marketing", isCore: false },
  { id: "products", name: "Prodotti", description: "Catalogo prodotti (Product2): nome, codice, prezzo listino", category: "Vendite", isCore: false },
  { id: "orders", name: "Ordini", description: "Ordini associati a contratti e account", category: "Vendite", isCore: false },
  { id: "quotes", name: "Preventivi", description: "Offerte commerciali con voci prodotto e sconti", category: "Vendite", isCore: false },
  { id: "contracts", name: "Contratti", description: "Contratti attivi con data inizio, fine e valore", category: "Vendite", isCore: false },
];

const STRIPE_ENTITIES: DiscoveredEntity[] = [
  { id: "invoices", name: "Fatture", description: "Fatture Stripe: numero, importo, stato, cliente, righe, PDF", category: "Fatturazione", isCore: true },
  { id: "customers", name: "Clienti", description: "Anagrafica clienti Stripe: email, nome, indirizzo, metodo di pagamento", category: "Anagrafiche", isCore: true },
  { id: "subscriptions", name: "Abbonamenti", description: "Abbonamenti ricorrenti: piano, stato, rinnovo, periodo di prova", category: "Ricorrenti", isCore: true },
  { id: "payments", name: "Pagamenti", description: "Payment Intents: importo, stato, metodo, conferma", category: "Pagamenti", isCore: true },
  { id: "products", name: "Prodotti", description: "Catalogo prodotti/servizi con nome, descrizione, immagini", category: "Anagrafiche", isCore: false },
  { id: "prices", name: "Prezzi", description: "Listino prezzi: importo, valuta, ricorrenza, prodotto associato", category: "Anagrafiche", isCore: false },
  { id: "coupons", name: "Coupon", description: "Codici sconto: percentuale o importo fisso, durata, limite utilizzi", category: "Promozioni", isCore: false },
  { id: "charges", name: "Addebiti", description: "Addebiti su carta/conto: importo, stato, metodo, receipt URL", category: "Pagamenti", isCore: false },
  { id: "refunds", name: "Rimborsi", description: "Rimborsi emessi: importo, motivo, addebito originale", category: "Pagamenti", isCore: false },
  { id: "disputes", name: "Contestazioni", description: "Dispute e chargeback: motivo, importo, evidenza, stato", category: "Pagamenti", isCore: false },
  { id: "payouts", name: "Accrediti", description: "Accrediti sul conto bancario: importo, data arrivo, stato", category: "Pagamenti", isCore: false },
  { id: "balance_transactions", name: "Movimenti saldo", description: "Movimenti sul saldo Stripe: tipo, importo, commissioni, netto", category: "Pagamenti", isCore: false },
];

// ─── Connector → Catalog Map ───

const ENTITY_CATALOGS: Record<string, DiscoveredEntity[]> = {
  hubspot: HUBSPOT_ENTITIES,
  "google-drive": GOOGLE_DRIVE_ENTITIES,
  "fatture-in-cloud": FATTURE_IN_CLOUD_ENTITIES,
  salesforce: SALESFORCE_ENTITIES,
  stripe: STRIPE_ENTITIES,
};

// ─── Public API ───

/**
 * Discover available entities for a connector.
 *
 * Returns the full static catalog for the given connector.
 * If searchQuery is provided, filters entities by fuzzy match on
 * name, description, and Italian aliases.
 *
 * @param connectorId - Connector identifier (e.g., "hubspot", "stripe")
 * @param searchQuery - Optional search string (Italian or English)
 * @returns Array of discovered entities (sorted: core first, then alphabetical)
 */
export function discoverEntities(
  connectorId: string,
  searchQuery?: string
): DiscoveredEntity[] {
  const catalog = ENTITY_CATALOGS[connectorId];
  if (!catalog) return [];

  if (!searchQuery || searchQuery.trim().length === 0) {
    // Return full catalog sorted: core entities first
    return sortEntities(catalog);
  }

  return searchEntities(connectorId, searchQuery);
}

/**
 * Search entities across one or all connectors using fuzzy matching.
 *
 * Searches across:
 *   1. Entity name (Italian display name)
 *   2. Entity description
 *   3. Entity ID (English technical name)
 *   4. Italian alias registry
 *
 * Uses case-insensitive substring matching with normalized diacritics.
 *
 * @param connectorId - Connector to search in. Pass "*" to search all connectors.
 * @param query - Search string (Italian or English)
 * @returns Matching entities sorted by relevance (exact match > alias > partial)
 */
export function searchEntities(
  connectorId: string,
  query: string
): DiscoveredEntity[] {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length === 0) return [];

  // Determine which catalogs to search
  const catalogs: Array<{ connectorId: string; entities: DiscoveredEntity[] }> =
    connectorId === "*"
      ? Object.entries(ENTITY_CATALOGS).map(([id, entities]) => ({ connectorId: id, entities }))
      : ENTITY_CATALOGS[connectorId]
        ? [{ connectorId, entities: ENTITY_CATALOGS[connectorId] }]
        : [];

  if (catalogs.length === 0) return [];

  // Score and rank entities
  const scored: Array<{ entity: DiscoveredEntity; score: number }> = [];

  for (const catalog of catalogs) {
    for (const entity of catalog.entities) {
      const score = scoreEntity(entity, normalizedQuery, catalog.connectorId);
      if (score > 0) {
        scored.push({ entity, score });
      }
    }
  }

  // Sort by score descending, then by isCore, then alphabetically
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.entity.isCore !== b.entity.isCore) return a.entity.isCore ? -1 : 1;
    return a.entity.name.localeCompare(b.entity.name);
  });

  return scored.map((s) => s.entity);
}

/**
 * Get the list of supported connector IDs that have entity discovery.
 */
export function getDiscoverableConnectors(): string[] {
  return Object.keys(ENTITY_CATALOGS);
}

// ─── Internal: Scoring ───

/**
 * Score how well an entity matches a search query.
 * Higher score = better match.
 *
 * Scoring tiers:
 *   100 = exact match on entity ID or name
 *    80 = exact alias match
 *    60 = entity name starts with query
 *    40 = query found in entity name
 *    30 = query found in entity description
 *    20 = query found in entity ID
 *    10 = partial alias match
 *     0 = no match
 */
function scoreEntity(
  entity: DiscoveredEntity,
  normalizedQuery: string,
  connectorId: string
): number {
  const normalizedId = normalizeText(entity.id);
  const normalizedName = normalizeText(entity.name);
  const normalizedDesc = normalizeText(entity.description);

  // Exact match on ID or name
  if (normalizedId === normalizedQuery || normalizedName === normalizedQuery) {
    return 100;
  }

  // Check Italian aliases
  const aliasScore = scoreAliases(normalizedQuery, entity.id, connectorId);
  if (aliasScore > 0) {
    return aliasScore;
  }

  // Name starts with query
  if (normalizedName.startsWith(normalizedQuery)) {
    return 60;
  }

  // Query in name
  if (normalizedName.includes(normalizedQuery)) {
    return 40;
  }

  // Query in description
  if (normalizedDesc.includes(normalizedQuery)) {
    return 30;
  }

  // Query in ID
  if (normalizedId.includes(normalizedQuery)) {
    return 20;
  }

  // Multi-word: check if all query words appear somewhere
  const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length >= 2);
  if (queryWords.length > 1) {
    const combined = `${normalizedId} ${normalizedName} ${normalizedDesc}`;
    const allFound = queryWords.every((word) => combined.includes(word));
    if (allFound) return 25;
  }

  return 0;
}

/**
 * Score alias matches for a given query against the alias registry.
 */
function scoreAliases(
  normalizedQuery: string,
  entityId: string,
  connectorId: string
): number {
  for (const entry of ITALIAN_ALIASES) {
    // Skip if alias is for a different connector
    if (entry.connectorId !== null && entry.connectorId !== connectorId) continue;

    // Skip if this alias maps to a different entity
    if (entry.entityId !== entityId) continue;

    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeText(alias);

      // Exact alias match
      if (normalizedAlias === normalizedQuery) return 80;

      // Alias starts with query
      if (normalizedAlias.startsWith(normalizedQuery)) return 50;

      // Query in alias
      if (normalizedAlias.includes(normalizedQuery)) return 10;

      // Query starts with alias (user typed more than the alias)
      if (normalizedQuery.startsWith(normalizedAlias)) return 10;
    }
  }

  return 0;
}

// ─── Internal: Text Normalization ───

/**
 * Normalize text for fuzzy matching:
 * - Lowercase
 * - Remove diacritics (accented characters)
 * - Trim whitespace
 * - Collapse multiple spaces
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip diacritics
    .replace(/[''`]/g, "") // Strip apostrophes
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sort entities: core first, then alphabetical by name.
 */
function sortEntities(entities: DiscoveredEntity[]): DiscoveredEntity[] {
  return [...entities].sort((a, b) => {
    if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
    return a.name.localeCompare(b.name, "it");
  });
}
