/**
 * Field Alias Rules — L1: Dizionari di mapping deterministici per connettore.
 *
 * Ogni alias e una variante nota di un campo target standard.
 * Il sistema cerca il campo sorgente (normalizzato) tra gli alias
 * e ritorna il target field corrispondente.
 *
 * Struttura:
 *   _global: alias universali (si applicano a tutti i connettori)
 *   <connector_id>: alias specifici del connettore
 *
 * Il lookup e: connettore-specifico prima, poi _global.
 * Se un campo e in entrambi, il connettore-specifico vince.
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

// ─── Field Aliases ───

/**
 * Dizionario di alias: nome campo normalizzato -> campo target standard.
 * I nomi sono tutti lowercase snake_case (il sistema normalizza prima del lookup).
 */
export const FIELD_ALIASES: Record<string, Record<string, string>> = {
  // ─── Alias globali (tutti i connettori) ───
  _global: {
    // Persona
    first_name: "first_name",
    firstname: "first_name",
    nome: "first_name",
    given_name: "first_name",
    prenom: "first_name",
    name_first: "first_name",

    last_name: "last_name",
    lastname: "last_name",
    cognome: "last_name",
    surname: "last_name",
    family_name: "last_name",
    nom: "last_name",
    name_last: "last_name",

    full_name: "full_name",
    fullname: "full_name",
    nome_completo: "full_name",
    display_name: "full_name",
    displayname: "full_name",
    name: "full_name",

    // Contatti
    email: "email",
    email_address: "email",
    e_mail: "email",
    mail: "email",
    pec: "email",
    indirizzo_email: "email",
    email_principale: "email",

    phone: "phone",
    phone_number: "phone",
    telefono: "phone",
    tel: "phone",
    mobile: "phone",
    cellulare: "phone",
    cell: "phone",

    fax: "fax",
    fax_number: "fax",
    numero_fax: "fax",

    // Azienda
    company_name: "company_name",
    company: "company_name",
    ragione_sociale: "company_name",
    org_name: "company_name",
    organization: "company_name",
    organisation: "company_name",
    organizzazione: "company_name",
    azienda: "company_name",
    societa: "company_name",
    denominazione: "company_name",
    account_name: "company_name",

    // Codici fiscali
    codice_fiscale: "tax_code",
    cf: "tax_code",
    fiscal_code: "tax_code",
    tax_id: "tax_code",
    tax_code: "tax_code",
    ssn: "tax_code",

    partita_iva: "vat_number",
    p_iva: "vat_number",
    piva: "vat_number",
    vat_number: "vat_number",
    vat_id: "vat_number",
    vat: "vat_number",
    vat_code: "vat_number",

    // Indirizzi
    address: "address",
    indirizzo: "address",
    street: "address",
    via: "address",
    street_address: "address",
    address_line_1: "address",
    billing_street: "address",

    city: "city",
    citta: "city",
    comune: "city",
    town: "city",
    billing_city: "city",

    state: "province",
    province: "province",
    provincia: "province",
    regione: "province",
    region: "province",
    billing_state: "province",

    zip: "postal_code",
    zip_code: "postal_code",
    postal_code: "postal_code",
    cap: "postal_code",
    postcode: "postal_code",
    billing_postal_code: "postal_code",

    country: "country",
    paese: "country",
    nazione: "country",
    country_code: "country",
    billing_country: "country",

    // Date
    created_at: "created_at",
    createdat: "created_at",
    creation_date: "created_at",
    data_creazione: "created_at",
    date_created: "created_at",
    created_date: "created_at",

    updated_at: "updated_at",
    updatedat: "updated_at",
    modification_date: "updated_at",
    data_modifica: "updated_at",
    date_modified: "updated_at",
    last_modified: "updated_at",
    modified_date: "updated_at",

    // Business
    status: "status",
    stato: "status",
    description: "description",
    descrizione: "description",
    desc: "description",
    note: "notes",
    notes: "notes",
    appunti: "notes",

    amount: "amount",
    importo: "amount",
    value: "amount",
    deal_value: "amount",
    deal_amount: "amount",

    currency: "currency",
    valuta: "currency",
    currency_code: "currency",

    // ID
    id: "external_id",
    record_id: "external_id",
    external_id: "external_id",
    ext_id: "external_id",
  },

  // ─── Fatture in Cloud (ERP italiano) ───
  fatture_in_cloud: {
    numero: "invoice_number",
    data: "invoice_date",
    importo_netto: "net_amount",
    importo_ivato: "gross_amount",
    iva: "vat_amount",
    aliquota_iva: "vat_rate",
    ragione_sociale: "company_name",
    partita_iva: "vat_number",
    codice_fiscale: "tax_code",
    data_scadenza: "due_date",
    pagato: "payment_status",
    totale_documento: "gross_amount",
    imponibile: "net_amount",
    tipo_documento: "document_type",
    numero_documento: "invoice_number",
    anno: "fiscal_year",
  },

  // ─── Google Drive ───
  google_drive: {
    mime_type: "file_type",
    modified_time: "modified_at",
    created_time: "created_at",
    web_view_link: "url",
    name: "file_name",
    size: "file_size",
    owners: "owner",
    shared: "shared_with",
    trashed: "is_trashed",
    parents: "folder_path",
  },

  // ─── HubSpot ───
  hubspot: {
    firstname: "first_name",
    lastname: "last_name",
    company: "company_name",
    jobtitle: "job_title",
    createdate: "created_at",
    lastmodifieddate: "updated_at",
    dealname: "deal_name",
    amount: "deal_amount",
    dealstage: "deal_stage",
    closedate: "close_date",
    hs_lead_status: "lead_status",
    lifecyclestage: "lifecycle_stage",
    associatedcompanyid: "company_id",
    pipeline: "pipeline",
    hs_object_id: "external_id",
    num_associated_contacts: "contact_count",
    domain: "website",
    industry: "industry",
    numberofemployees: "employee_count",
    annualrevenue: "annual_revenue",
  },

  // ─── Salesforce ───
  salesforce: {
    account_name: "company_name",
    billing_street: "address",
    billing_city: "city",
    billing_state: "province",
    billing_postal_code: "postal_code",
    billing_country: "country",
    annual_revenue: "annual_revenue",
    number_of_employees: "employee_count",
    stage_name: "deal_stage",
    close_date: "close_date",
    opportunity_name: "deal_name",
    lead_source: "lead_source",
    account_id: "account_id",
    contact_id: "contact_id",
    owner_id: "owner_id",
    is_won: "is_won",
    is_closed: "is_closed",
    fiscal_year: "fiscal_year",
    type: "record_type",
  },

  // ─── Stripe ───
  stripe: {
    customer_email: "email",
    customer_name: "full_name",
    payment_intent: "payment_id",
    payment_method_type: "payment_method",
    amount_paid: "amount",
    amount_due: "amount_due",
    amount_remaining: "amount_remaining",
    invoice_number: "invoice_number",
    subscription: "subscription_id",
    customer: "customer_id",
    billing_reason: "billing_reason",
    collection_method: "collection_method",
    default_payment_method: "payment_method",
    current_period_start: "period_start",
    current_period_end: "period_end",
    cancel_at_period_end: "cancel_at_period_end",
    canceled_at: "canceled_at",
    trial_start: "trial_start",
    trial_end: "trial_end",
  },
};

// ─── Normalizzazione ───

/**
 * Normalizza un nome campo per il lookup nelle alias:
 * - Lowercase
 * - camelCase -> snake_case
 * - Separatori -> underscore
 * - Rimuovi underscore multipli/trailing
 */
function normalizeForLookup(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Public API ───

/**
 * Risolve un campo sorgente usando le regole deterministiche (L1).
 *
 * Ordine di lookup:
 *   1. Alias specifico del connettore
 *   2. Alias globale (_global)
 *
 * @param connectorType - ID del connettore (es. "hubspot", "salesforce", "stripe")
 * @param sourceField - Nome del campo sorgente (qualsiasi formato)
 * @returns Campo target normalizzato, o null se nessun alias trovato
 */
export function resolveByRule(
  connectorType: string,
  sourceField: string
): string | null {
  const normalized = normalizeForLookup(sourceField);

  // 1. Prova alias connettore-specifico
  const connectorAliases = FIELD_ALIASES[connectorType];
  if (connectorAliases && normalized in connectorAliases) {
    return connectorAliases[normalized];
  }

  // 2. Prova alias globale
  const globalAliases = FIELD_ALIASES._global;
  if (normalized in globalAliases) {
    return globalAliases[normalized];
  }

  return null;
}

/**
 * Batch resolve: risolve piu campi sorgente con le regole.
 * Piu efficiente di chiamare resolveByRule() in loop per il logging.
 *
 * @returns Mappa sourceField -> targetField (solo i campi risolti)
 */
export function resolveByRuleBatch(
  connectorType: string,
  sourceFields: string[]
): Map<string, string> {
  const result = new Map<string, string>();

  for (const field of sourceFields) {
    const target = resolveByRule(connectorType, field);
    if (target !== null) {
      result.set(field, target);
    }
  }

  return result;
}
