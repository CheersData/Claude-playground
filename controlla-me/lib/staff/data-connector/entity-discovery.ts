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

/**
 * Field definition for a discovered entity.
 * Used by the wizard, mapping engine, and agent chat to show
 * what data is available without needing an API connection.
 */
export interface EntityFieldDef {
  /** Technical field name (e.g., "email", "amount_net") */
  name: string;
  /** Human-readable label (Italian) */
  label: string;
  /** Data type hint */
  type: "string" | "number" | "boolean" | "date" | "email" | "phone" | "url" | "currency" | "json" | "enum";
  /** Whether this field is always present / required */
  required: boolean;
  /** Brief description (Italian) */
  description?: string;
  /** Standard business concept this maps to (for auto-mapping) */
  standardConcept?: string;
}

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
  /** Key fields available on this entity (static catalog for wizard/agent) */
  fields?: EntityFieldDef[];
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
  { aliases: ["drive condiviso", "drive condivisi", "shared drive"], entityId: "shared_drives", connectorId: "google-drive" },
  { aliases: ["permesso", "permessi", "condivisione", "accesso"], entityId: "permissions", connectorId: "google-drive" },
  { aliases: ["commento", "commenti"], entityId: "comments", connectorId: "google-drive" },
  { aliases: ["revisione", "revisioni", "versione", "versioni", "storico"], entityId: "revisions", connectorId: "google-drive" },

  // Fatture in Cloud (additional)
  { aliases: ["prima nota", "libro cassa", "cashbook", "cassa"], entityId: "cashbook", connectorId: "fatture-in-cloud" },
  { aliases: ["tassa", "tasse", "imposta", "imposte", "tributo fiscale"], entityId: "taxes", connectorId: "fatture-in-cloud" },

  // Stripe (additional)
  { aliases: ["checkout", "sessione checkout", "pagina pagamento"], entityId: "checkout_sessions", connectorId: "stripe" },
  { aliases: ["metodo di pagamento", "metodi di pagamento", "carta", "carte", "payment method"], entityId: "payment_methods", connectorId: "stripe" },
];

// ─── Entity Catalogs ───

const HUBSPOT_ENTITIES: DiscoveredEntity[] = [
  {
    id: "contacts", name: "Contatti", description: "Persone nel CRM: nome, email, telefono, azienda, lifecycle stage", category: "CRM", isCore: true,
    fields: [
      { name: "email", label: "Email", type: "email", required: true, standardConcept: "email" },
      { name: "firstname", label: "Nome", type: "string", required: false, standardConcept: "first_name" },
      { name: "lastname", label: "Cognome", type: "string", required: false, standardConcept: "last_name" },
      { name: "phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "mobilephone", label: "Cellulare", type: "phone", required: false },
      { name: "company", label: "Azienda", type: "string", required: false, standardConcept: "company_name" },
      { name: "jobtitle", label: "Qualifica", type: "string", required: false, standardConcept: "job_title" },
      { name: "lifecyclestage", label: "Fase lifecycle", type: "enum", required: false, description: "subscriber, lead, mql, sql, opportunity, customer, evangelist" },
      { name: "hs_lead_status", label: "Stato lead", type: "enum", required: false },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "address", label: "Indirizzo", type: "string", required: false, standardConcept: "address" },
      { name: "city", label: "Citta", type: "string", required: false, standardConcept: "city" },
      { name: "state", label: "Provincia/Stato", type: "string", required: false, standardConcept: "province" },
      { name: "zip", label: "CAP", type: "string", required: false, standardConcept: "postal_code" },
      { name: "country", label: "Paese", type: "string", required: false, standardConcept: "country" },
      { name: "website", label: "Sito web", type: "url", required: false, standardConcept: "website" },
      { name: "associatedcompanyid", label: "ID azienda associata", type: "string", required: false },
      { name: "notes_last_updated", label: "Ultima nota", type: "date", required: false },
      { name: "hs_email_last_email_name", label: "Ultima email inviata", type: "string", required: false },
      { name: "num_associated_deals", label: "Numero trattative", type: "number", required: false },
      { name: "createdate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "lastmodifieddate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "companies", name: "Aziende", description: "Organizzazioni: ragione sociale, dominio, settore, numero dipendenti", category: "CRM", isCore: true,
    fields: [
      { name: "name", label: "Ragione sociale", type: "string", required: true, standardConcept: "company_name" },
      { name: "domain", label: "Dominio web", type: "url", required: false, standardConcept: "website" },
      { name: "industry", label: "Settore", type: "enum", required: false, standardConcept: "industry" },
      { name: "phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "numberofemployees", label: "Numero dipendenti", type: "number", required: false, standardConcept: "employee_count" },
      { name: "annualrevenue", label: "Fatturato annuo", type: "currency", required: false, standardConcept: "annual_revenue" },
      { name: "city", label: "Citta", type: "string", required: false, standardConcept: "city" },
      { name: "state", label: "Provincia/Stato", type: "string", required: false, standardConcept: "province" },
      { name: "zip", label: "CAP", type: "string", required: false, standardConcept: "postal_code" },
      { name: "country", label: "Paese", type: "string", required: false, standardConcept: "country" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "type", label: "Tipo", type: "enum", required: false, description: "prospect, partner, reseller, vendor, customer" },
      { name: "lifecyclestage", label: "Fase lifecycle", type: "enum", required: false },
      { name: "hs_lead_status", label: "Stato lead", type: "enum", required: false },
      { name: "founded_year", label: "Anno fondazione", type: "string", required: false },
      { name: "num_associated_contacts", label: "Numero contatti", type: "number", required: false },
      { name: "num_associated_deals", label: "Numero trattative", type: "number", required: false },
      { name: "total_revenue", label: "Fatturato totale deal", type: "currency", required: false },
      { name: "createdate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "lastmodifieddate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "deals", name: "Trattative", description: "Opportunita di vendita: nome deal, valore, pipeline, stage, data chiusura", category: "Vendite", isCore: true,
    fields: [
      { name: "dealname", label: "Nome trattativa", type: "string", required: true, standardConcept: "deal_name" },
      { name: "amount", label: "Importo", type: "currency", required: false, standardConcept: "amount" },
      { name: "dealstage", label: "Fase", type: "enum", required: true, standardConcept: "stage" },
      { name: "pipeline", label: "Pipeline", type: "enum", required: true, standardConcept: "pipeline" },
      { name: "closedate", label: "Data chiusura prevista", type: "date", required: false, standardConcept: "close_date" },
      { name: "dealtype", label: "Tipo trattativa", type: "enum", required: false, description: "newbusiness, existingbusiness" },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "hs_priority", label: "Priorita", type: "enum", required: false, standardConcept: "priority" },
      { name: "hs_deal_stage_probability", label: "Probabilita chiusura", type: "number", required: false, standardConcept: "probability" },
      { name: "hs_forecast_amount", label: "Importo previsto", type: "currency", required: false },
      { name: "hs_forecast_probability", label: "Probabilita previsione", type: "number", required: false },
      { name: "num_associated_contacts", label: "Contatti associati", type: "number", required: false },
      { name: "hs_acv", label: "Valore contratto annuale", type: "currency", required: false },
      { name: "hs_mrr", label: "Ricavo mensile ricorrente", type: "currency", required: false },
      { name: "hs_tcv", label: "Valore contratto totale", type: "currency", required: false },
      { name: "createdate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "lastmodifieddate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "tickets", name: "Ticket", description: "Ticket di assistenza: oggetto, contenuto, pipeline, priorita, stato", category: "Supporto", isCore: true,
    fields: [
      { name: "subject", label: "Oggetto", type: "string", required: true, standardConcept: "subject" },
      { name: "content", label: "Contenuto", type: "string", required: false, standardConcept: "description" },
      { name: "hs_pipeline", label: "Pipeline", type: "enum", required: false, standardConcept: "pipeline" },
      { name: "hs_pipeline_stage", label: "Stato", type: "enum", required: false, standardConcept: "status" },
      { name: "hs_ticket_priority", label: "Priorita", type: "enum", required: false, description: "LOW, MEDIUM, HIGH", standardConcept: "priority" },
      { name: "hs_ticket_category", label: "Categoria", type: "enum", required: false },
      { name: "hubspot_owner_id", label: "Assegnatario", type: "string", required: false, standardConcept: "assignee" },
      { name: "source_type", label: "Canale di origine", type: "enum", required: false, description: "EMAIL, CHAT, PHONE, FORM" },
      { name: "hs_resolution", label: "Risoluzione", type: "string", required: false },
      { name: "closed_date", label: "Data chiusura", type: "date", required: false },
      { name: "hs_time_to_close_sla_status", label: "Stato SLA chiusura", type: "enum", required: false },
      { name: "hs_time_to_first_response_sla_status", label: "Stato SLA prima risposta", type: "enum", required: false },
      { name: "createdate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "lastmodifieddate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "products", name: "Prodotti", description: "Catalogo prodotti e servizi con prezzo, descrizione, SKU", category: "Vendite", isCore: false,
    fields: [
      { name: "name", label: "Nome prodotto", type: "string", required: true, standardConcept: "product_name" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "price", label: "Prezzo", type: "currency", required: false, standardConcept: "price" },
      { name: "hs_sku", label: "SKU", type: "string", required: false, standardConcept: "sku" },
      { name: "hs_cost_of_goods_sold", label: "Costo del venduto", type: "currency", required: false },
      { name: "hs_recurring_billing_period", label: "Periodo ricorrenza", type: "enum", required: false },
      { name: "tax", label: "Imposta", type: "number", required: false },
      { name: "hs_url", label: "URL prodotto", type: "url", required: false },
      { name: "createdate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "line_items", name: "Voci ordine", description: "Prodotti associati a trattative: quantita, prezzo, sconto", category: "Vendite", isCore: false,
    fields: [
      { name: "name", label: "Nome voce", type: "string", required: true },
      { name: "quantity", label: "Quantita", type: "number", required: false, standardConcept: "quantity" },
      { name: "price", label: "Prezzo unitario", type: "currency", required: false, standardConcept: "price" },
      { name: "amount", label: "Importo totale", type: "currency", required: false, standardConcept: "amount" },
      { name: "discount", label: "Sconto", type: "number", required: false },
      { name: "hs_sku", label: "SKU", type: "string", required: false, standardConcept: "sku" },
      { name: "hs_product_id", label: "ID prodotto", type: "string", required: false },
      { name: "tax", label: "Imposta", type: "number", required: false },
      { name: "createdate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "quotes", name: "Preventivi", description: "Offerte commerciali associate a deal, con voci e scadenza", category: "Vendite", isCore: false,
    fields: [
      { name: "hs_title", label: "Titolo", type: "string", required: true },
      { name: "hs_expiration_date", label: "Data scadenza", type: "date", required: false },
      { name: "hs_status", label: "Stato", type: "enum", required: false, description: "draft, pending_approval, approved, rejected, signed" },
      { name: "hs_quote_amount", label: "Importo", type: "currency", required: false, standardConcept: "amount" },
      { name: "hs_sender_email", label: "Email mittente", type: "email", required: false },
      { name: "hs_sender_firstname", label: "Nome mittente", type: "string", required: false },
      { name: "hs_sender_lastname", label: "Cognome mittente", type: "string", required: false },
      { name: "hs_terms", label: "Termini e condizioni", type: "string", required: false },
      { name: "hs_public_url_key", label: "Link pubblico", type: "url", required: false },
      { name: "createdate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "engagements", name: "Interazioni", description: "Attivita CRM: note, email, chiamate, riunioni, task", category: "CRM", isCore: false,
    fields: [
      { name: "hs_engagement_type", label: "Tipo", type: "enum", required: true, description: "NOTE, EMAIL, CALL, MEETING, TASK" },
      { name: "hs_timestamp", label: "Data/ora", type: "date", required: false },
      { name: "hs_body_preview", label: "Anteprima contenuto", type: "string", required: false },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "hs_activity_type", label: "Tipo attivita", type: "string", required: false },
    ],
  },
  {
    id: "feedback_submissions", name: "Feedback", description: "Risposte ai sondaggi di soddisfazione cliente", category: "Supporto", isCore: false,
    fields: [
      { name: "hs_submission_timestamp", label: "Data invio", type: "date", required: false },
      { name: "hs_content", label: "Contenuto risposta", type: "string", required: false },
      { name: "hs_survey_type", label: "Tipo sondaggio", type: "enum", required: false, description: "NPS, CES, CSAT" },
      { name: "hs_survey_channel", label: "Canale", type: "enum", required: false },
      { name: "hs_response_value", label: "Valore risposta", type: "number", required: false },
    ],
  },
  {
    id: "calls", name: "Chiamate", description: "Log delle chiamate: durata, esito, note", category: "CRM", isCore: false,
    fields: [
      { name: "hs_timestamp", label: "Data/ora", type: "date", required: false },
      { name: "hs_call_title", label: "Titolo", type: "string", required: false },
      { name: "hs_call_body", label: "Note chiamata", type: "string", required: false },
      { name: "hs_call_duration", label: "Durata (ms)", type: "number", required: false },
      { name: "hs_call_disposition", label: "Esito", type: "enum", required: false },
      { name: "hs_call_direction", label: "Direzione", type: "enum", required: false, description: "INBOUND, OUTBOUND" },
      { name: "hs_call_from_number", label: "Da numero", type: "phone", required: false },
      { name: "hs_call_to_number", label: "A numero", type: "phone", required: false },
      { name: "hs_call_recording_url", label: "URL registrazione", type: "url", required: false },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
    ],
  },
  {
    id: "emails", name: "Email", description: "Email tracciate nel CRM con oggetto, corpo e destinatari", category: "CRM", isCore: false,
    fields: [
      { name: "hs_timestamp", label: "Data/ora", type: "date", required: false },
      { name: "hs_email_subject", label: "Oggetto", type: "string", required: false, standardConcept: "subject" },
      { name: "hs_email_text", label: "Corpo testo", type: "string", required: false },
      { name: "hs_email_html", label: "Corpo HTML", type: "string", required: false },
      { name: "hs_email_direction", label: "Direzione", type: "enum", required: false, description: "INCOMING_EMAIL, FORWARDED_EMAIL, EMAIL" },
      { name: "hs_email_sender_email", label: "Mittente", type: "email", required: false },
      { name: "hs_email_status", label: "Stato", type: "enum", required: false, description: "SENT, BOUNCED, FAILED" },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
    ],
  },
  {
    id: "meetings", name: "Riunioni", description: "Riunioni programmate: titolo, partecipanti, orario", category: "CRM", isCore: false,
    fields: [
      { name: "hs_meeting_title", label: "Titolo", type: "string", required: false },
      { name: "hs_meeting_body", label: "Descrizione", type: "string", required: false },
      { name: "hs_meeting_start_time", label: "Inizio", type: "date", required: false },
      { name: "hs_meeting_end_time", label: "Fine", type: "date", required: false },
      { name: "hs_meeting_outcome", label: "Esito", type: "enum", required: false, description: "SCHEDULED, COMPLETED, RESCHEDULED, NO_SHOW, CANCELLED" },
      { name: "hs_meeting_location", label: "Luogo", type: "string", required: false },
      { name: "hs_meeting_external_url", label: "Link riunione", type: "url", required: false },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
    ],
  },
  {
    id: "notes", name: "Note", description: "Note testuali associate a contatti, aziende o deal", category: "CRM", isCore: false,
    fields: [
      { name: "hs_timestamp", label: "Data/ora", type: "date", required: false },
      { name: "hs_note_body", label: "Corpo nota", type: "string", required: true },
      { name: "hubspot_owner_id", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
    ],
  },
  {
    id: "tasks", name: "Compiti", description: "Attivita da completare con scadenza, priorita e assegnatario", category: "CRM", isCore: false,
    fields: [
      { name: "hs_task_subject", label: "Oggetto", type: "string", required: true, standardConcept: "subject" },
      { name: "hs_task_body", label: "Descrizione", type: "string", required: false },
      { name: "hs_task_status", label: "Stato", type: "enum", required: false, description: "NOT_STARTED, IN_PROGRESS, WAITING, COMPLETED, DEFERRED", standardConcept: "status" },
      { name: "hs_task_priority", label: "Priorita", type: "enum", required: false, description: "LOW, MEDIUM, HIGH", standardConcept: "priority" },
      { name: "hs_task_type", label: "Tipo", type: "enum", required: false, description: "TODO, CALL, EMAIL" },
      { name: "hs_timestamp", label: "Data scadenza", type: "date", required: false },
      { name: "hubspot_owner_id", label: "Assegnatario", type: "string", required: false, standardConcept: "assignee" },
    ],
  },
];

const GOOGLE_DRIVE_ENTITIES: DiscoveredEntity[] = [
  {
    id: "files", name: "Tutti i file", description: "Tutti i file nel Drive, indipendentemente dal tipo", category: "Documenti", isCore: true,
    fields: [
      { name: "id", label: "ID file", type: "string", required: true, standardConcept: "external_id" },
      { name: "name", label: "Nome file", type: "string", required: true, standardConcept: "file_name" },
      { name: "mimeType", label: "Tipo MIME", type: "string", required: true, standardConcept: "file_type" },
      { name: "size", label: "Dimensione (byte)", type: "number", required: false, standardConcept: "file_size" },
      { name: "createdTime", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false, standardConcept: "modified_at" },
      { name: "parents", label: "Cartelle padre", type: "json", required: false },
      { name: "owners", label: "Proprietari", type: "json", required: false, description: "displayName, emailAddress" },
      { name: "shared", label: "Condiviso", type: "boolean", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false, standardConcept: "url" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "starred", label: "Con stella", type: "boolean", required: false },
      { name: "trashed", label: "Nel cestino", type: "boolean", required: false },
      { name: "fileExtension", label: "Estensione", type: "string", required: false },
      { name: "md5Checksum", label: "Checksum MD5", type: "string", required: false },
      { name: "originalFilename", label: "Nome originale", type: "string", required: false },
      { name: "lastModifyingUser", label: "Ultima modifica da", type: "json", required: false, description: "displayName, emailAddress" },
    ],
  },
  {
    id: "folders", name: "Cartelle", description: "Struttura delle cartelle e sottocartelle", category: "Documenti", isCore: true,
    fields: [
      { name: "id", label: "ID cartella", type: "string", required: true, standardConcept: "external_id" },
      { name: "name", label: "Nome cartella", type: "string", required: true, standardConcept: "folder_name" },
      { name: "parents", label: "Cartella padre", type: "json", required: false },
      { name: "createdTime", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false, standardConcept: "modified_at" },
      { name: "owners", label: "Proprietari", type: "json", required: false },
      { name: "shared", label: "Condivisa", type: "boolean", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false },
    ],
  },
  {
    id: "documents", name: "Documenti Google", description: "Google Docs: documenti di testo modificabili online", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID documento", type: "string", required: true },
      { name: "name", label: "Titolo", type: "string", required: true },
      { name: "textContent", label: "Contenuto testo", type: "string", required: false, description: "Testo esportato dal documento" },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false },
      { name: "owners", label: "Proprietari", type: "json", required: false },
      { name: "shared", label: "Condiviso", type: "boolean", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false },
    ],
  },
  {
    id: "spreadsheets", name: "Fogli di calcolo", description: "Google Sheets: fogli di calcolo e tabelle", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID foglio", type: "string", required: true },
      { name: "name", label: "Titolo", type: "string", required: true },
      { name: "textContent", label: "Contenuto CSV", type: "string", required: false, description: "Dati esportati in formato CSV" },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false },
      { name: "owners", label: "Proprietari", type: "json", required: false },
      { name: "shared", label: "Condiviso", type: "boolean", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false },
    ],
  },
  {
    id: "presentations", name: "Presentazioni", description: "Google Slides: presentazioni", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID presentazione", type: "string", required: true },
      { name: "name", label: "Titolo", type: "string", required: true },
      { name: "textContent", label: "Contenuto testo", type: "string", required: false },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false },
      { name: "owners", label: "Proprietari", type: "json", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false },
    ],
  },
  {
    id: "pdfs", name: "PDF", description: "File PDF (fatture, contratti, report)", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID file", type: "string", required: true },
      { name: "name", label: "Nome file", type: "string", required: true },
      { name: "size", label: "Dimensione (byte)", type: "number", required: false },
      { name: "textContent", label: "Testo estratto", type: "string", required: false, description: "Testo estratto via OCR/parser" },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false },
      { name: "owners", label: "Proprietari", type: "json", required: false },
      { name: "md5Checksum", label: "Checksum MD5", type: "string", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false },
    ],
  },
  {
    id: "images", name: "Immagini", description: "File immagine: JPEG, PNG, GIF, WebP", category: "Media", isCore: false,
    fields: [
      { name: "id", label: "ID file", type: "string", required: true },
      { name: "name", label: "Nome file", type: "string", required: true },
      { name: "mimeType", label: "Formato", type: "string", required: false },
      { name: "size", label: "Dimensione (byte)", type: "number", required: false },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false },
    ],
  },
  {
    id: "videos", name: "Video", description: "File video: MP4, MOV, AVI", category: "Media", isCore: false,
    fields: [
      { name: "id", label: "ID file", type: "string", required: true },
      { name: "name", label: "Nome file", type: "string", required: true },
      { name: "mimeType", label: "Formato", type: "string", required: false },
      { name: "size", label: "Dimensione (byte)", type: "number", required: false },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false },
      { name: "webViewLink", label: "Link web", type: "url", required: false },
    ],
  },
  {
    id: "shared_drives", name: "Drive condivisi", description: "Team Drive e Drive condivisi dell'organizzazione", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID drive", type: "string", required: true },
      { name: "name", label: "Nome", type: "string", required: true },
      { name: "createdTime", label: "Data creazione", type: "date", required: false },
    ],
  },
  {
    id: "permissions", name: "Permessi", description: "Permessi di condivisione su file e cartelle", category: "Sicurezza", isCore: false,
    fields: [
      { name: "id", label: "ID permesso", type: "string", required: true },
      { name: "type", label: "Tipo", type: "enum", required: true, description: "user, group, domain, anyone" },
      { name: "role", label: "Ruolo", type: "enum", required: true, description: "owner, organizer, fileOrganizer, writer, commenter, reader" },
      { name: "emailAddress", label: "Email utente", type: "email", required: false },
      { name: "displayName", label: "Nome utente", type: "string", required: false },
      { name: "expirationTime", label: "Scadenza", type: "date", required: false },
    ],
  },
  {
    id: "comments", name: "Commenti", description: "Commenti e discussioni sui file", category: "Collaborazione", isCore: false,
    fields: [
      { name: "id", label: "ID commento", type: "string", required: true },
      { name: "content", label: "Contenuto", type: "string", required: true },
      { name: "author", label: "Autore", type: "json", required: false, description: "displayName, emailAddress" },
      { name: "createdTime", label: "Data creazione", type: "date", required: false },
      { name: "modifiedTime", label: "Ultima modifica", type: "date", required: false },
      { name: "resolved", label: "Risolto", type: "boolean", required: false },
    ],
  },
  {
    id: "revisions", name: "Revisioni", description: "Cronologia delle versioni dei file", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID revisione", type: "string", required: true },
      { name: "modifiedTime", label: "Data modifica", type: "date", required: false },
      { name: "lastModifyingUser", label: "Autore modifica", type: "json", required: false },
      { name: "size", label: "Dimensione (byte)", type: "number", required: false },
      { name: "keepForever", label: "Mantieni per sempre", type: "boolean", required: false },
    ],
  },
];

const FATTURE_IN_CLOUD_ENTITIES: DiscoveredEntity[] = [
  {
    id: "issued_invoices", name: "Fatture Emesse", description: "Fatture attive emesse ai clienti: numero, data, importo, IVA, stato pagamento, SDI", category: "Fatturazione", isCore: true,
    fields: [
      { name: "id", label: "ID fattura", type: "number", required: true, standardConcept: "external_id" },
      { name: "number", label: "Numero fattura", type: "number", required: true, standardConcept: "invoice_number" },
      { name: "numeration", label: "Sezionale", type: "string", required: false },
      { name: "date", label: "Data fattura", type: "date", required: true, standardConcept: "invoice_date" },
      { name: "year", label: "Anno fiscale", type: "number", required: false },
      { name: "subject", label: "Oggetto", type: "string", required: false, standardConcept: "description" },
      { name: "amount_net", label: "Imponibile (netto)", type: "currency", required: false, standardConcept: "net_amount" },
      { name: "amount_vat", label: "IVA", type: "currency", required: false, standardConcept: "vat_amount" },
      { name: "amount_gross", label: "Totale (lordo)", type: "currency", required: false, standardConcept: "gross_amount" },
      { name: "amount_due_discount", label: "Sconto cassa", type: "currency", required: false },
      { name: "currency.id", label: "Valuta", type: "string", required: false, standardConcept: "currency" },
      { name: "entity.name", label: "Cliente", type: "string", required: false, standardConcept: "company_name" },
      { name: "entity.vat_number", label: "P.IVA cliente", type: "string", required: false, standardConcept: "vat_number" },
      { name: "entity.tax_code", label: "CF cliente", type: "string", required: false, standardConcept: "tax_code" },
      { name: "entity.address_street", label: "Indirizzo cliente", type: "string", required: false, standardConcept: "address" },
      { name: "entity.address_city", label: "Citta cliente", type: "string", required: false, standardConcept: "city" },
      { name: "entity.address_province", label: "Provincia", type: "string", required: false, standardConcept: "province" },
      { name: "entity.address_postal_code", label: "CAP", type: "string", required: false, standardConcept: "postal_code" },
      { name: "status", label: "Stato pagamento", type: "enum", required: false, description: "paid, not_paid, reversed", standardConcept: "payment_status" },
      { name: "payment_method.name", label: "Metodo pagamento", type: "string", required: false, standardConcept: "payment_method" },
      { name: "e_invoice", label: "Fattura elettronica", type: "boolean", required: false },
      { name: "ei_status", label: "Stato SDI", type: "string", required: false },
      { name: "items_list", label: "Righe fattura", type: "json", required: false, description: "Prodotti, quantita, prezzi, IVA" },
      { name: "notes", label: "Note", type: "string", required: false },
      { name: "rivalsa", label: "Rivalsa", type: "currency", required: false },
      { name: "cassa", label: "Contributo cassa", type: "currency", required: false },
      { name: "withholding_tax", label: "Ritenuta d'acconto", type: "currency", required: false },
      { name: "created_at", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "updated_at", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "received_invoices", name: "Fatture Ricevute", description: "Fatture passive ricevute dai fornitori: numero, data, importo, IVA, stato", category: "Fatturazione", isCore: true,
    fields: [
      { name: "id", label: "ID fattura", type: "number", required: true, standardConcept: "external_id" },
      { name: "number", label: "Numero fattura", type: "number", required: true, standardConcept: "invoice_number" },
      { name: "date", label: "Data fattura", type: "date", required: true, standardConcept: "invoice_date" },
      { name: "subject", label: "Oggetto", type: "string", required: false, standardConcept: "description" },
      { name: "amount_net", label: "Imponibile (netto)", type: "currency", required: false, standardConcept: "net_amount" },
      { name: "amount_vat", label: "IVA", type: "currency", required: false, standardConcept: "vat_amount" },
      { name: "amount_gross", label: "Totale (lordo)", type: "currency", required: false, standardConcept: "gross_amount" },
      { name: "entity.name", label: "Fornitore", type: "string", required: false, standardConcept: "company_name" },
      { name: "entity.vat_number", label: "P.IVA fornitore", type: "string", required: false, standardConcept: "vat_number" },
      { name: "entity.tax_code", label: "CF fornitore", type: "string", required: false, standardConcept: "tax_code" },
      { name: "status", label: "Stato pagamento", type: "enum", required: false, description: "paid, not_paid, reversed", standardConcept: "payment_status" },
      { name: "payment_method.name", label: "Metodo pagamento", type: "string", required: false, standardConcept: "payment_method" },
      { name: "e_invoice", label: "Fattura elettronica", type: "boolean", required: false },
      { name: "ei_status", label: "Stato SDI", type: "string", required: false },
      { name: "items_list", label: "Righe fattura", type: "json", required: false },
      { name: "withholding_tax", label: "Ritenuta d'acconto", type: "currency", required: false },
      { name: "created_at", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "updated_at", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "clients", name: "Clienti", description: "Anagrafica clienti: ragione sociale, P.IVA, CF, indirizzo, email, PEC, codice SDI", category: "Anagrafiche", isCore: true,
    fields: [
      { name: "id", label: "ID cliente", type: "number", required: true, standardConcept: "external_id" },
      { name: "code", label: "Codice cliente", type: "string", required: false },
      { name: "name", label: "Ragione sociale", type: "string", required: true, standardConcept: "company_name" },
      { name: "type", label: "Tipo", type: "enum", required: false, description: "person, company" },
      { name: "first_name", label: "Nome", type: "string", required: false, standardConcept: "first_name" },
      { name: "last_name", label: "Cognome", type: "string", required: false, standardConcept: "last_name" },
      { name: "contact_person", label: "Referente", type: "string", required: false },
      { name: "vat_number", label: "Partita IVA", type: "string", required: false, standardConcept: "vat_number" },
      { name: "tax_code", label: "Codice Fiscale", type: "string", required: false, standardConcept: "tax_code" },
      { name: "address_street", label: "Indirizzo", type: "string", required: false, standardConcept: "address" },
      { name: "address_postal_code", label: "CAP", type: "string", required: false, standardConcept: "postal_code" },
      { name: "address_city", label: "Citta", type: "string", required: false, standardConcept: "city" },
      { name: "address_province", label: "Provincia", type: "string", required: false, standardConcept: "province" },
      { name: "country", label: "Paese", type: "string", required: false, standardConcept: "country" },
      { name: "email", label: "Email", type: "email", required: false, standardConcept: "email" },
      { name: "certified_email", label: "PEC", type: "email", required: false, description: "Posta Elettronica Certificata" },
      { name: "phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "fax", label: "Fax", type: "phone", required: false },
      { name: "notes", label: "Note", type: "string", required: false },
      { name: "ei_code", label: "Codice SDI", type: "string", required: false, description: "Codice destinatario fattura elettronica" },
      { name: "bank_name", label: "Banca", type: "string", required: false },
      { name: "bank_iban", label: "IBAN", type: "string", required: false },
      { name: "bank_swift_code", label: "SWIFT/BIC", type: "string", required: false },
      { name: "default_vats", label: "Aliquote IVA predefinite", type: "json", required: false },
      { name: "created_at", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "updated_at", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "suppliers", name: "Fornitori", description: "Anagrafica fornitori: ragione sociale, P.IVA, CF, indirizzo, email, PEC", category: "Anagrafiche", isCore: true,
    fields: [
      { name: "id", label: "ID fornitore", type: "number", required: true, standardConcept: "external_id" },
      { name: "code", label: "Codice fornitore", type: "string", required: false },
      { name: "name", label: "Ragione sociale", type: "string", required: true, standardConcept: "company_name" },
      { name: "type", label: "Tipo", type: "enum", required: false, description: "person, company" },
      { name: "vat_number", label: "Partita IVA", type: "string", required: false, standardConcept: "vat_number" },
      { name: "tax_code", label: "Codice Fiscale", type: "string", required: false, standardConcept: "tax_code" },
      { name: "address_street", label: "Indirizzo", type: "string", required: false, standardConcept: "address" },
      { name: "address_city", label: "Citta", type: "string", required: false, standardConcept: "city" },
      { name: "address_province", label: "Provincia", type: "string", required: false, standardConcept: "province" },
      { name: "address_postal_code", label: "CAP", type: "string", required: false, standardConcept: "postal_code" },
      { name: "country", label: "Paese", type: "string", required: false, standardConcept: "country" },
      { name: "email", label: "Email", type: "email", required: false, standardConcept: "email" },
      { name: "certified_email", label: "PEC", type: "email", required: false },
      { name: "phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "ei_code", label: "Codice SDI", type: "string", required: false },
      { name: "bank_name", label: "Banca", type: "string", required: false },
      { name: "bank_iban", label: "IBAN", type: "string", required: false },
      { name: "created_at", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "products", name: "Prodotti/Servizi", description: "Catalogo prodotti e servizi con prezzo, codice, aliquota IVA", category: "Anagrafiche", isCore: false,
    fields: [
      { name: "id", label: "ID prodotto", type: "number", required: true, standardConcept: "external_id" },
      { name: "name", label: "Nome prodotto", type: "string", required: true, standardConcept: "product_name" },
      { name: "code", label: "Codice", type: "string", required: false, standardConcept: "sku" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "net_price", label: "Prezzo netto", type: "currency", required: false, standardConcept: "price" },
      { name: "gross_price", label: "Prezzo lordo", type: "currency", required: false },
      { name: "net_cost", label: "Costo netto", type: "currency", required: false },
      { name: "measure", label: "Unita di misura", type: "string", required: false },
      { name: "category", label: "Categoria", type: "string", required: false },
      { name: "in_stock", label: "Disponibile", type: "boolean", required: false },
      { name: "stock_initial", label: "Giacenza iniziale", type: "number", required: false },
      { name: "default_vat.value", label: "Aliquota IVA (%)", type: "number", required: false },
      { name: "notes", label: "Note", type: "string", required: false },
      { name: "created_at", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "quotes", name: "Preventivi", description: "Preventivi e offerte commerciali inviati ai clienti", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID preventivo", type: "number", required: true },
      { name: "number", label: "Numero", type: "number", required: false },
      { name: "date", label: "Data", type: "date", required: false },
      { name: "subject", label: "Oggetto", type: "string", required: false },
      { name: "amount_net", label: "Imponibile", type: "currency", required: false },
      { name: "amount_gross", label: "Totale", type: "currency", required: false },
      { name: "entity.name", label: "Cliente", type: "string", required: false },
      { name: "status", label: "Stato", type: "enum", required: false, description: "accepted, not_accepted, waiting" },
      { name: "items_list", label: "Righe preventivo", type: "json", required: false },
      { name: "valid_until", label: "Valido fino al", type: "date", required: false },
    ],
  },
  {
    id: "orders", name: "Ordini", description: "Ordini ricevuti dai clienti", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID ordine", type: "number", required: true },
      { name: "number", label: "Numero ordine", type: "number", required: false },
      { name: "date", label: "Data", type: "date", required: false },
      { name: "subject", label: "Oggetto", type: "string", required: false },
      { name: "amount_net", label: "Imponibile", type: "currency", required: false },
      { name: "amount_gross", label: "Totale", type: "currency", required: false },
      { name: "entity.name", label: "Cliente", type: "string", required: false },
      { name: "status", label: "Stato", type: "enum", required: false },
      { name: "items_list", label: "Righe ordine", type: "json", required: false },
    ],
  },
  {
    id: "delivery_notes", name: "DDT", description: "Documenti di trasporto (DDT) per le spedizioni", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID DDT", type: "number", required: true },
      { name: "number", label: "Numero DDT", type: "number", required: false },
      { name: "date", label: "Data", type: "date", required: false },
      { name: "entity.name", label: "Destinatario", type: "string", required: false },
      { name: "items_list", label: "Righe DDT", type: "json", required: false },
      { name: "transport_data", label: "Dati trasporto", type: "json", required: false, description: "Vettore, causale, aspetto, colli, peso" },
    ],
  },
  {
    id: "receipts", name: "Corrispettivi", description: "Corrispettivi giornalieri per attivita al dettaglio", category: "Fatturazione", isCore: false,
    fields: [
      { name: "id", label: "ID corrispettivo", type: "number", required: true },
      { name: "date", label: "Data", type: "date", required: true },
      { name: "amount_net", label: "Imponibile", type: "currency", required: false },
      { name: "amount_vat", label: "IVA", type: "currency", required: false },
      { name: "amount_gross", label: "Totale", type: "currency", required: false },
      { name: "payment_method.name", label: "Metodo pagamento", type: "string", required: false },
    ],
  },
  {
    id: "fiscal_receipts", name: "Ricevute Fiscali", description: "Ricevute fiscali emesse al cliente finale", category: "Fatturazione", isCore: false,
    fields: [
      { name: "id", label: "ID ricevuta", type: "number", required: true },
      { name: "number", label: "Numero", type: "number", required: false },
      { name: "date", label: "Data", type: "date", required: false },
      { name: "amount_gross", label: "Totale", type: "currency", required: false },
      { name: "entity.name", label: "Cliente", type: "string", required: false },
    ],
  },
  {
    id: "credit_notes", name: "Note di Credito", description: "Note di credito emesse a fronte di rettifiche o resi", category: "Fatturazione", isCore: false,
    fields: [
      { name: "id", label: "ID nota credito", type: "number", required: true },
      { name: "number", label: "Numero", type: "number", required: false },
      { name: "date", label: "Data", type: "date", required: false },
      { name: "amount_net", label: "Imponibile", type: "currency", required: false },
      { name: "amount_vat", label: "IVA", type: "currency", required: false },
      { name: "amount_gross", label: "Totale", type: "currency", required: false },
      { name: "entity.name", label: "Cliente", type: "string", required: false },
      { name: "related_invoice_id", label: "Fattura collegata", type: "number", required: false },
    ],
  },
  {
    id: "proformas", name: "Proforma", description: "Fatture proforma (non fiscali, per anticipo pagamento)", category: "Documenti", isCore: false,
    fields: [
      { name: "id", label: "ID proforma", type: "number", required: true },
      { name: "number", label: "Numero", type: "number", required: false },
      { name: "date", label: "Data", type: "date", required: false },
      { name: "amount_gross", label: "Totale", type: "currency", required: false },
      { name: "entity.name", label: "Cliente", type: "string", required: false },
      { name: "items_list", label: "Righe proforma", type: "json", required: false },
    ],
  },
  {
    id: "f24", name: "F24", description: "Modelli F24 per il pagamento di imposte, tasse e contributi", category: "Fiscale", isCore: false,
    fields: [
      { name: "id", label: "ID F24", type: "number", required: true },
      { name: "date", label: "Data scadenza", type: "date", required: false },
      { name: "amount", label: "Importo", type: "currency", required: false },
      { name: "status", label: "Stato", type: "enum", required: false, description: "paid, not_paid" },
      { name: "tax_type", label: "Tipo tributo", type: "string", required: false },
    ],
  },
  {
    id: "cashbook", name: "Prima Nota", description: "Movimenti di prima nota e registrazioni contabili", category: "Contabilita", isCore: false,
    fields: [
      { name: "id", label: "ID movimento", type: "number", required: true },
      { name: "date", label: "Data", type: "date", required: true },
      { name: "description", label: "Descrizione", type: "string", required: false },
      { name: "kind", label: "Tipo", type: "enum", required: false, description: "cashbook, issued_document, received_document" },
      { name: "type", label: "Entrata/Uscita", type: "enum", required: false, description: "in, out" },
      { name: "amount_in", label: "Importo entrata", type: "currency", required: false },
      { name: "amount_out", label: "Importo uscita", type: "currency", required: false },
      { name: "payment_account.name", label: "Conto pagamento", type: "string", required: false },
    ],
  },
  {
    id: "taxes", name: "Tasse e Imposte", description: "Riepilogo tasse, imposte e scadenze fiscali", category: "Fiscale", isCore: false,
    fields: [
      { name: "id", label: "ID", type: "number", required: true },
      { name: "date", label: "Data scadenza", type: "date", required: false },
      { name: "amount", label: "Importo", type: "currency", required: false },
      { name: "description", label: "Descrizione", type: "string", required: false },
      { name: "status", label: "Stato", type: "enum", required: false, description: "paid, not_paid" },
    ],
  },
];

const SALESFORCE_ENTITIES: DiscoveredEntity[] = [
  {
    id: "accounts", name: "Account", description: "Aziende e organizzazioni clienti: nome, settore, fatturato, indirizzo", category: "CRM", isCore: true,
    fields: [
      { name: "Name", label: "Ragione sociale", type: "string", required: true, standardConcept: "company_name" },
      { name: "Industry", label: "Settore", type: "enum", required: false, standardConcept: "industry" },
      { name: "Type", label: "Tipo account", type: "enum", required: false, description: "Prospect, Customer, Partner, Competitor" },
      { name: "Website", label: "Sito web", type: "url", required: false, standardConcept: "website" },
      { name: "Phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "BillingStreet", label: "Indirizzo fatturazione", type: "string", required: false, standardConcept: "address" },
      { name: "BillingCity", label: "Citta fatturazione", type: "string", required: false, standardConcept: "city" },
      { name: "BillingState", label: "Provincia", type: "string", required: false, standardConcept: "province" },
      { name: "BillingPostalCode", label: "CAP", type: "string", required: false, standardConcept: "postal_code" },
      { name: "BillingCountry", label: "Paese fatturazione", type: "string", required: false, standardConcept: "country" },
      { name: "ShippingStreet", label: "Indirizzo spedizione", type: "string", required: false },
      { name: "ShippingCity", label: "Citta spedizione", type: "string", required: false },
      { name: "NumberOfEmployees", label: "Numero dipendenti", type: "number", required: false, standardConcept: "employee_count" },
      { name: "AnnualRevenue", label: "Fatturato annuo", type: "currency", required: false, standardConcept: "annual_revenue" },
      { name: "Description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "OwnerId", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "Rating", label: "Rating", type: "enum", required: false, description: "Hot, Warm, Cold" },
      { name: "Sic", label: "Codice SIC", type: "string", required: false },
      { name: "TickerSymbol", label: "Simbolo borsa", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "LastModifiedDate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "contacts", name: "Contatti", description: "Persone associate agli account: nome, email, telefono, ruolo", category: "CRM", isCore: true,
    fields: [
      { name: "FirstName", label: "Nome", type: "string", required: false, standardConcept: "first_name" },
      { name: "LastName", label: "Cognome", type: "string", required: true, standardConcept: "last_name" },
      { name: "Email", label: "Email", type: "email", required: false, standardConcept: "email" },
      { name: "Phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "MobilePhone", label: "Cellulare", type: "phone", required: false },
      { name: "AccountId", label: "Account associato", type: "string", required: false },
      { name: "Title", label: "Qualifica", type: "string", required: false, standardConcept: "job_title" },
      { name: "Department", label: "Dipartimento", type: "string", required: false },
      { name: "MailingStreet", label: "Indirizzo", type: "string", required: false, standardConcept: "address" },
      { name: "MailingCity", label: "Citta", type: "string", required: false, standardConcept: "city" },
      { name: "MailingCountry", label: "Paese", type: "string", required: false, standardConcept: "country" },
      { name: "Birthdate", label: "Data di nascita", type: "date", required: false },
      { name: "OwnerId", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "LeadSource", label: "Fonte", type: "enum", required: false },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "LastModifiedDate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "leads", name: "Lead", description: "Contatti potenziali non ancora qualificati: fonte, stato, rating", category: "CRM", isCore: true,
    fields: [
      { name: "FirstName", label: "Nome", type: "string", required: false, standardConcept: "first_name" },
      { name: "LastName", label: "Cognome", type: "string", required: true, standardConcept: "last_name" },
      { name: "Email", label: "Email", type: "email", required: false, standardConcept: "email" },
      { name: "Phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "Company", label: "Azienda", type: "string", required: true, standardConcept: "company_name" },
      { name: "Title", label: "Qualifica", type: "string", required: false, standardConcept: "job_title" },
      { name: "Status", label: "Stato", type: "enum", required: false, description: "Open, Working, Closed-Converted, Closed-Not Converted", standardConcept: "status" },
      { name: "LeadSource", label: "Fonte lead", type: "enum", required: false, description: "Web, Phone, Partner, Referral, Other" },
      { name: "Rating", label: "Rating", type: "enum", required: false, description: "Hot, Warm, Cold" },
      { name: "Industry", label: "Settore", type: "enum", required: false, standardConcept: "industry" },
      { name: "NumberOfEmployees", label: "Numero dipendenti", type: "number", required: false },
      { name: "AnnualRevenue", label: "Fatturato annuo", type: "currency", required: false },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "OwnerId", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "ConvertedAccountId", label: "Account convertito", type: "string", required: false },
      { name: "ConvertedContactId", label: "Contatto convertito", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "LastModifiedDate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "opportunities", name: "Opportunita", description: "Trattative di vendita: valore, probabilita, fase, data chiusura", category: "Vendite", isCore: true,
    fields: [
      { name: "Name", label: "Nome opportunita", type: "string", required: true, standardConcept: "deal_name" },
      { name: "Amount", label: "Importo", type: "currency", required: false, standardConcept: "amount" },
      { name: "StageName", label: "Fase", type: "enum", required: true, standardConcept: "stage" },
      { name: "CloseDate", label: "Data chiusura", type: "date", required: true, standardConcept: "close_date" },
      { name: "Probability", label: "Probabilita (%)", type: "number", required: false, standardConcept: "probability" },
      { name: "AccountId", label: "Account associato", type: "string", required: false },
      { name: "Type", label: "Tipo", type: "enum", required: false, description: "New Business, Existing Business" },
      { name: "LeadSource", label: "Fonte", type: "enum", required: false },
      { name: "ForecastCategory", label: "Categoria previsione", type: "enum", required: false },
      { name: "Description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "OwnerId", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "NextStep", label: "Prossimo step", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "LastModifiedDate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "cases", name: "Casi", description: "Richieste di supporto: oggetto, priorita, stato, assegnatario", category: "Supporto", isCore: true,
    fields: [
      { name: "Subject", label: "Oggetto", type: "string", required: false, standardConcept: "subject" },
      { name: "Description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "Status", label: "Stato", type: "enum", required: false, description: "New, Working, Escalated, Closed", standardConcept: "status" },
      { name: "Priority", label: "Priorita", type: "enum", required: false, description: "High, Medium, Low", standardConcept: "priority" },
      { name: "Origin", label: "Origine", type: "enum", required: false, description: "Phone, Email, Web" },
      { name: "Type", label: "Tipo", type: "enum", required: false, description: "Problem, Feature Request, Question" },
      { name: "AccountId", label: "Account associato", type: "string", required: false },
      { name: "ContactId", label: "Contatto associato", type: "string", required: false },
      { name: "OwnerId", label: "Assegnatario", type: "string", required: false, standardConcept: "assignee" },
      { name: "Reason", label: "Motivo", type: "string", required: false },
      { name: "ClosedDate", label: "Data chiusura", type: "date", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
      { name: "LastModifiedDate", label: "Ultima modifica", type: "date", required: false, standardConcept: "updated_at" },
    ],
  },
  {
    id: "tasks", name: "Attivita", description: "Compiti e attivita da completare con scadenza e priorita", category: "CRM", isCore: false,
    fields: [
      { name: "Subject", label: "Oggetto", type: "string", required: true, standardConcept: "subject" },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "Status", label: "Stato", type: "enum", required: false, description: "Not Started, In Progress, Completed, Deferred", standardConcept: "status" },
      { name: "Priority", label: "Priorita", type: "enum", required: false, description: "High, Normal, Low", standardConcept: "priority" },
      { name: "ActivityDate", label: "Data scadenza", type: "date", required: false },
      { name: "OwnerId", label: "Assegnatario", type: "string", required: false, standardConcept: "assignee" },
      { name: "WhoId", label: "Contatto/Lead", type: "string", required: false },
      { name: "WhatId", label: "Record correlato", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "events", name: "Eventi", description: "Appuntamenti e riunioni nel calendario Salesforce", category: "CRM", isCore: false,
    fields: [
      { name: "Subject", label: "Oggetto", type: "string", required: true, standardConcept: "subject" },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "StartDateTime", label: "Data/ora inizio", type: "date", required: true },
      { name: "EndDateTime", label: "Data/ora fine", type: "date", required: true },
      { name: "Location", label: "Luogo", type: "string", required: false },
      { name: "IsAllDayEvent", label: "Tutto il giorno", type: "boolean", required: false },
      { name: "OwnerId", label: "Proprietario", type: "string", required: false, standardConcept: "owner" },
      { name: "WhoId", label: "Contatto/Lead", type: "string", required: false },
      { name: "WhatId", label: "Record correlato", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "campaigns", name: "Campagne", description: "Campagne marketing: budget, tipo, stato, ROI atteso", category: "Marketing", isCore: false,
    fields: [
      { name: "Name", label: "Nome campagna", type: "string", required: true },
      { name: "Type", label: "Tipo", type: "enum", required: false, description: "Conference, Webinar, Email, Advertising, Social" },
      { name: "Status", label: "Stato", type: "enum", required: false, description: "Planned, In Progress, Completed, Aborted", standardConcept: "status" },
      { name: "StartDate", label: "Data inizio", type: "date", required: false },
      { name: "EndDate", label: "Data fine", type: "date", required: false },
      { name: "BudgetedCost", label: "Budget", type: "currency", required: false },
      { name: "ActualCost", label: "Costo effettivo", type: "currency", required: false },
      { name: "ExpectedRevenue", label: "Ricavi attesi", type: "currency", required: false },
      { name: "NumberOfContacts", label: "Numero contatti", type: "number", required: false },
      { name: "NumberOfLeads", label: "Numero lead", type: "number", required: false },
      { name: "NumberOfResponses", label: "Risposte", type: "number", required: false },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "products", name: "Prodotti", description: "Catalogo prodotti (Product2): nome, codice, prezzo listino", category: "Vendite", isCore: false,
    fields: [
      { name: "Name", label: "Nome prodotto", type: "string", required: true, standardConcept: "product_name" },
      { name: "ProductCode", label: "Codice prodotto", type: "string", required: false, standardConcept: "sku" },
      { name: "Description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "Family", label: "Famiglia", type: "enum", required: false },
      { name: "IsActive", label: "Attivo", type: "boolean", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "orders", name: "Ordini", description: "Ordini associati a contratti e account", category: "Vendite", isCore: false,
    fields: [
      { name: "OrderNumber", label: "Numero ordine", type: "string", required: false },
      { name: "Status", label: "Stato", type: "enum", required: true, standardConcept: "status" },
      { name: "TotalAmount", label: "Importo totale", type: "currency", required: false, standardConcept: "amount" },
      { name: "EffectiveDate", label: "Data decorrenza", type: "date", required: true },
      { name: "AccountId", label: "Account", type: "string", required: true },
      { name: "ContractId", label: "Contratto", type: "string", required: false },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "quotes", name: "Preventivi", description: "Offerte commerciali con voci prodotto e sconti", category: "Vendite", isCore: false,
    fields: [
      { name: "Name", label: "Nome preventivo", type: "string", required: true },
      { name: "TotalPrice", label: "Prezzo totale", type: "currency", required: false, standardConcept: "amount" },
      { name: "Status", label: "Stato", type: "enum", required: false, standardConcept: "status" },
      { name: "ExpirationDate", label: "Data scadenza", type: "date", required: false },
      { name: "OpportunityId", label: "Opportunita", type: "string", required: false },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "Discount", label: "Sconto", type: "number", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "contracts", name: "Contratti", description: "Contratti attivi con data inizio, fine e valore", category: "Vendite", isCore: false,
    fields: [
      { name: "ContractNumber", label: "Numero contratto", type: "string", required: false },
      { name: "Status", label: "Stato", type: "enum", required: false, description: "Draft, In Approval, Activated, Terminated, Expired", standardConcept: "status" },
      { name: "StartDate", label: "Data inizio", type: "date", required: true },
      { name: "EndDate", label: "Data fine", type: "date", required: false },
      { name: "ContractTerm", label: "Durata (mesi)", type: "number", required: false },
      { name: "AccountId", label: "Account", type: "string", required: true },
      { name: "Description", label: "Descrizione", type: "string", required: false },
      { name: "OwnerExpirationNotice", label: "Preavviso scadenza (gg)", type: "number", required: false },
      { name: "CreatedDate", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
];

const STRIPE_ENTITIES: DiscoveredEntity[] = [
  {
    id: "customers", name: "Clienti", description: "Anagrafica clienti Stripe: email, nome, indirizzo, metodo di pagamento", category: "Anagrafiche", isCore: true,
    fields: [
      { name: "id", label: "ID cliente", type: "string", required: true, standardConcept: "external_id" },
      { name: "email", label: "Email", type: "email", required: false, standardConcept: "email" },
      { name: "name", label: "Nome", type: "string", required: false, standardConcept: "full_name" },
      { name: "phone", label: "Telefono", type: "phone", required: false, standardConcept: "phone" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "address.line1", label: "Indirizzo riga 1", type: "string", required: false, standardConcept: "address" },
      { name: "address.line2", label: "Indirizzo riga 2", type: "string", required: false },
      { name: "address.city", label: "Citta", type: "string", required: false, standardConcept: "city" },
      { name: "address.state", label: "Provincia/Stato", type: "string", required: false, standardConcept: "province" },
      { name: "address.postal_code", label: "CAP", type: "string", required: false, standardConcept: "postal_code" },
      { name: "address.country", label: "Paese", type: "string", required: false, standardConcept: "country" },
      { name: "currency", label: "Valuta predefinita", type: "string", required: false, standardConcept: "currency" },
      { name: "balance", label: "Saldo conto (centesimi)", type: "number", required: false },
      { name: "delinquent", label: "Insolvente", type: "boolean", required: false },
      { name: "default_source", label: "Metodo pagamento predefinito", type: "string", required: false },
      { name: "tax_exempt", label: "Esente IVA", type: "enum", required: false, description: "none, exempt, reverse" },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "invoices", name: "Fatture", description: "Fatture Stripe: numero, importo, stato, cliente, righe, PDF", category: "Fatturazione", isCore: true,
    fields: [
      { name: "id", label: "ID fattura", type: "string", required: true, standardConcept: "external_id" },
      { name: "number", label: "Numero fattura", type: "string", required: false, standardConcept: "invoice_number" },
      { name: "customer", label: "ID cliente", type: "string", required: false, standardConcept: "customer_id" },
      { name: "customer_email", label: "Email cliente", type: "email", required: false, standardConcept: "email" },
      { name: "customer_name", label: "Nome cliente", type: "string", required: false, standardConcept: "company_name" },
      { name: "status", label: "Stato", type: "enum", required: false, description: "draft, open, paid, void, uncollectible", standardConcept: "status" },
      { name: "amount_due", label: "Importo dovuto (centesimi)", type: "number", required: false, standardConcept: "amount" },
      { name: "amount_paid", label: "Importo pagato (centesimi)", type: "number", required: false },
      { name: "amount_remaining", label: "Importo residuo (centesimi)", type: "number", required: false },
      { name: "subtotal", label: "Subtotale (centesimi)", type: "number", required: false, standardConcept: "net_amount" },
      { name: "tax", label: "Imposta (centesimi)", type: "number", required: false, standardConcept: "vat_amount" },
      { name: "total", label: "Totale (centesimi)", type: "number", required: false, standardConcept: "gross_amount" },
      { name: "currency", label: "Valuta", type: "string", required: false, standardConcept: "currency" },
      { name: "due_date", label: "Data scadenza", type: "date", required: false, standardConcept: "due_date" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "hosted_invoice_url", label: "URL fattura online", type: "url", required: false },
      { name: "invoice_pdf", label: "URL PDF", type: "url", required: false },
      { name: "subscription", label: "Abbonamento collegato", type: "string", required: false },
      { name: "lines", label: "Righe fattura", type: "json", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "subscriptions", name: "Abbonamenti", description: "Abbonamenti ricorrenti: piano, stato, rinnovo, periodo di prova", category: "Ricorrenti", isCore: true,
    fields: [
      { name: "id", label: "ID abbonamento", type: "string", required: true, standardConcept: "external_id" },
      { name: "customer", label: "ID cliente", type: "string", required: true, standardConcept: "customer_id" },
      { name: "status", label: "Stato", type: "enum", required: false, description: "active, past_due, unpaid, canceled, incomplete, trialing, paused", standardConcept: "status" },
      { name: "items", label: "Voci abbonamento", type: "json", required: false, description: "Piani, prezzi, quantita" },
      { name: "current_period_start", label: "Inizio periodo", type: "date", required: false },
      { name: "current_period_end", label: "Fine periodo", type: "date", required: false },
      { name: "cancel_at_period_end", label: "Cancella a fine periodo", type: "boolean", required: false },
      { name: "canceled_at", label: "Data cancellazione", type: "date", required: false },
      { name: "trial_start", label: "Inizio prova", type: "date", required: false },
      { name: "trial_end", label: "Fine prova", type: "date", required: false },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "currency", label: "Valuta", type: "string", required: false, standardConcept: "currency" },
      { name: "default_payment_method", label: "Metodo pagamento", type: "string", required: false },
      { name: "collection_method", label: "Metodo incasso", type: "enum", required: false, description: "charge_automatically, send_invoice" },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "payments", name: "Pagamenti", description: "Payment Intents: importo, stato, metodo, conferma", category: "Pagamenti", isCore: true,
    fields: [
      { name: "id", label: "ID pagamento", type: "string", required: true, standardConcept: "external_id" },
      { name: "amount", label: "Importo (centesimi)", type: "number", required: true, standardConcept: "amount" },
      { name: "amount_received", label: "Importo ricevuto (centesimi)", type: "number", required: false },
      { name: "currency", label: "Valuta", type: "string", required: true, standardConcept: "currency" },
      { name: "status", label: "Stato", type: "enum", required: false, description: "requires_payment_method, requires_confirmation, requires_action, processing, succeeded, canceled", standardConcept: "status" },
      { name: "customer", label: "ID cliente", type: "string", required: false, standardConcept: "customer_id" },
      { name: "receipt_email", label: "Email ricevuta", type: "email", required: false },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "payment_method", label: "Metodo pagamento", type: "string", required: false, standardConcept: "payment_method" },
      { name: "payment_method_types", label: "Tipi metodo accettati", type: "json", required: false },
      { name: "latest_charge", label: "Ultimo addebito", type: "string", required: false },
      { name: "cancellation_reason", label: "Motivo cancellazione", type: "string", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "products", name: "Prodotti", description: "Catalogo prodotti/servizi con nome, descrizione, immagini", category: "Anagrafiche", isCore: false,
    fields: [
      { name: "id", label: "ID prodotto", type: "string", required: true, standardConcept: "external_id" },
      { name: "name", label: "Nome", type: "string", required: true, standardConcept: "product_name" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "active", label: "Attivo", type: "boolean", required: false },
      { name: "images", label: "Immagini", type: "json", required: false, description: "Array di URL immagini" },
      { name: "default_price", label: "Prezzo predefinito", type: "string", required: false },
      { name: "unit_label", label: "Etichetta unita", type: "string", required: false },
      { name: "tax_code", label: "Codice fiscale prodotto", type: "string", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "prices", name: "Prezzi", description: "Listino prezzi: importo, valuta, ricorrenza, prodotto associato", category: "Anagrafiche", isCore: false,
    fields: [
      { name: "id", label: "ID prezzo", type: "string", required: true, standardConcept: "external_id" },
      { name: "product", label: "ID prodotto", type: "string", required: true },
      { name: "unit_amount", label: "Importo unitario (centesimi)", type: "number", required: false, standardConcept: "price" },
      { name: "currency", label: "Valuta", type: "string", required: true, standardConcept: "currency" },
      { name: "type", label: "Tipo", type: "enum", required: false, description: "one_time, recurring" },
      { name: "recurring.interval", label: "Intervallo ricorrenza", type: "enum", required: false, description: "day, week, month, year" },
      { name: "recurring.interval_count", label: "Numero intervalli", type: "number", required: false },
      { name: "active", label: "Attivo", type: "boolean", required: false },
      { name: "nickname", label: "Nome piano", type: "string", required: false },
      { name: "billing_scheme", label: "Schema fatturazione", type: "enum", required: false, description: "per_unit, tiered" },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "charges", name: "Addebiti", description: "Addebiti su carta/conto: importo, stato, metodo, receipt URL", category: "Pagamenti", isCore: false,
    fields: [
      { name: "id", label: "ID addebito", type: "string", required: true, standardConcept: "external_id" },
      { name: "amount", label: "Importo (centesimi)", type: "number", required: true, standardConcept: "amount" },
      { name: "amount_refunded", label: "Importo rimborsato (centesimi)", type: "number", required: false },
      { name: "currency", label: "Valuta", type: "string", required: true, standardConcept: "currency" },
      { name: "status", label: "Stato", type: "enum", required: false, description: "succeeded, pending, failed", standardConcept: "status" },
      { name: "customer", label: "ID cliente", type: "string", required: false, standardConcept: "customer_id" },
      { name: "description", label: "Descrizione", type: "string", required: false, standardConcept: "description" },
      { name: "receipt_email", label: "Email ricevuta", type: "email", required: false },
      { name: "receipt_url", label: "URL ricevuta", type: "url", required: false },
      { name: "payment_method_details", label: "Dettagli metodo pagamento", type: "json", required: false },
      { name: "failure_code", label: "Codice errore", type: "string", required: false },
      { name: "failure_message", label: "Messaggio errore", type: "string", required: false },
      { name: "refunded", label: "Rimborsato", type: "boolean", required: false },
      { name: "disputed", label: "Contestato", type: "boolean", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "refunds", name: "Rimborsi", description: "Rimborsi emessi: importo, motivo, addebito originale", category: "Pagamenti", isCore: false,
    fields: [
      { name: "id", label: "ID rimborso", type: "string", required: true, standardConcept: "external_id" },
      { name: "amount", label: "Importo (centesimi)", type: "number", required: true, standardConcept: "amount" },
      { name: "currency", label: "Valuta", type: "string", required: true, standardConcept: "currency" },
      { name: "charge", label: "ID addebito originale", type: "string", required: false },
      { name: "payment_intent", label: "ID pagamento", type: "string", required: false },
      { name: "reason", label: "Motivo", type: "enum", required: false, description: "duplicate, fraudulent, requested_by_customer" },
      { name: "status", label: "Stato", type: "enum", required: false, description: "succeeded, pending, failed, canceled", standardConcept: "status" },
      { name: "receipt_number", label: "Numero ricevuta", type: "string", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "disputes", name: "Contestazioni", description: "Dispute e chargeback: motivo, importo, evidenza, stato", category: "Pagamenti", isCore: false,
    fields: [
      { name: "id", label: "ID contestazione", type: "string", required: true, standardConcept: "external_id" },
      { name: "amount", label: "Importo contestato (centesimi)", type: "number", required: true, standardConcept: "amount" },
      { name: "currency", label: "Valuta", type: "string", required: true, standardConcept: "currency" },
      { name: "charge", label: "ID addebito", type: "string", required: false },
      { name: "reason", label: "Motivo", type: "enum", required: false, description: "credit_not_processed, duplicate, fraudulent, general, product_not_received, product_unacceptable, subscription_canceled, unrecognized" },
      { name: "status", label: "Stato", type: "enum", required: false, description: "warning_needs_response, warning_under_review, warning_closed, needs_response, under_review, won, lost", standardConcept: "status" },
      { name: "evidence_due_by", label: "Scadenza evidenza", type: "date", required: false },
      { name: "is_charge_refundable", label: "Rimborsabile", type: "boolean", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "payouts", name: "Accrediti", description: "Accrediti sul conto bancario: importo, data arrivo, stato", category: "Pagamenti", isCore: false,
    fields: [
      { name: "id", label: "ID accredito", type: "string", required: true, standardConcept: "external_id" },
      { name: "amount", label: "Importo (centesimi)", type: "number", required: true, standardConcept: "amount" },
      { name: "currency", label: "Valuta", type: "string", required: true, standardConcept: "currency" },
      { name: "status", label: "Stato", type: "enum", required: false, description: "paid, pending, in_transit, canceled, failed", standardConcept: "status" },
      { name: "arrival_date", label: "Data arrivo", type: "date", required: false },
      { name: "method", label: "Metodo", type: "enum", required: false, description: "standard, instant" },
      { name: "type", label: "Tipo", type: "enum", required: false, description: "bank_account, card" },
      { name: "description", label: "Descrizione", type: "string", required: false },
      { name: "destination", label: "Conto destinazione", type: "string", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "balance_transactions", name: "Movimenti saldo", description: "Movimenti sul saldo Stripe: tipo, importo, commissioni, netto", category: "Pagamenti", isCore: false,
    fields: [
      { name: "id", label: "ID movimento", type: "string", required: true, standardConcept: "external_id" },
      { name: "amount", label: "Importo lordo (centesimi)", type: "number", required: true, standardConcept: "amount" },
      { name: "fee", label: "Commissioni (centesimi)", type: "number", required: false },
      { name: "net", label: "Netto (centesimi)", type: "number", required: false },
      { name: "currency", label: "Valuta", type: "string", required: true, standardConcept: "currency" },
      { name: "type", label: "Tipo", type: "enum", required: false, description: "charge, refund, payout, payment, transfer, adjustment, etc." },
      { name: "status", label: "Stato", type: "enum", required: false, description: "available, pending", standardConcept: "status" },
      { name: "description", label: "Descrizione", type: "string", required: false },
      { name: "source", label: "Origine (ID oggetto)", type: "string", required: false },
      { name: "available_on", label: "Disponibile dal", type: "date", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "coupons", name: "Coupon", description: "Codici sconto: percentuale o importo fisso, durata, limite utilizzi", category: "Promozioni", isCore: false,
    fields: [
      { name: "id", label: "ID coupon", type: "string", required: true, standardConcept: "external_id" },
      { name: "name", label: "Nome", type: "string", required: false },
      { name: "percent_off", label: "Sconto percentuale", type: "number", required: false },
      { name: "amount_off", label: "Sconto fisso (centesimi)", type: "number", required: false },
      { name: "currency", label: "Valuta (per sconto fisso)", type: "string", required: false, standardConcept: "currency" },
      { name: "duration", label: "Durata", type: "enum", required: true, description: "forever, once, repeating" },
      { name: "duration_in_months", label: "Durata in mesi", type: "number", required: false },
      { name: "max_redemptions", label: "Utilizzi massimi", type: "number", required: false },
      { name: "times_redeemed", label: "Utilizzi effettuati", type: "number", required: false },
      { name: "valid", label: "Valido", type: "boolean", required: false },
      { name: "redeem_by", label: "Riscattabile entro", type: "date", required: false },
      { name: "metadata", label: "Metadati custom", type: "json", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "checkout_sessions", name: "Sessioni Checkout", description: "Sessioni di pagamento Stripe Checkout: link, stato, articoli, importo", category: "Pagamenti", isCore: false,
    fields: [
      { name: "id", label: "ID sessione", type: "string", required: true, standardConcept: "external_id" },
      { name: "url", label: "URL checkout", type: "url", required: false },
      { name: "status", label: "Stato", type: "enum", required: false, description: "open, complete, expired", standardConcept: "status" },
      { name: "payment_status", label: "Stato pagamento", type: "enum", required: false, description: "paid, unpaid, no_payment_required" },
      { name: "amount_total", label: "Totale (centesimi)", type: "number", required: false, standardConcept: "amount" },
      { name: "currency", label: "Valuta", type: "string", required: false, standardConcept: "currency" },
      { name: "customer", label: "ID cliente", type: "string", required: false },
      { name: "customer_email", label: "Email cliente", type: "email", required: false },
      { name: "mode", label: "Modalita", type: "enum", required: false, description: "payment, setup, subscription" },
      { name: "success_url", label: "URL successo", type: "url", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
  {
    id: "payment_methods", name: "Metodi di pagamento", description: "Carte, SEPA, iDEAL e altri metodi di pagamento salvati", category: "Anagrafiche", isCore: false,
    fields: [
      { name: "id", label: "ID metodo", type: "string", required: true, standardConcept: "external_id" },
      { name: "type", label: "Tipo", type: "enum", required: true, description: "card, sepa_debit, ideal, bancontact, etc." },
      { name: "customer", label: "ID cliente", type: "string", required: false },
      { name: "card.brand", label: "Brand carta", type: "string", required: false, description: "visa, mastercard, amex, etc." },
      { name: "card.last4", label: "Ultime 4 cifre", type: "string", required: false },
      { name: "card.exp_month", label: "Mese scadenza", type: "number", required: false },
      { name: "card.exp_year", label: "Anno scadenza", type: "number", required: false },
      { name: "billing_details.email", label: "Email fatturazione", type: "email", required: false },
      { name: "billing_details.name", label: "Nome fatturazione", type: "string", required: false },
      { name: "created", label: "Data creazione", type: "date", required: false, standardConcept: "created_at" },
    ],
  },
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
