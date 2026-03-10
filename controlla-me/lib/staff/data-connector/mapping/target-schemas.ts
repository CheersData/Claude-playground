/**
 * Target Schemas — Schema destinazione per ogni DataType.
 *
 * Definisce i campi target normalizzati per ciascun tipo di dato business.
 * Usato dal MappingEngine e dal mapper pipeline per sapere quali colonne
 * sono disponibili nella tabella destinazione.
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

/**
 * Schema target per tipo di dato.
 * Chiave = DataType semplificato (es. "invoices", "contacts").
 * Valore = lista ordinata di nomi colonne normalizzati.
 */
export const TARGET_SCHEMAS: Record<string, string[]> = {
  invoices: [
    "invoice_number",
    "invoice_date",
    "due_date",
    "net_amount",
    "vat_amount",
    "gross_amount",
    "vat_rate",
    "currency",
    "company_name",
    "vat_number",
    "tax_code",
    "description",
    "status",
    "payment_status",
  ],
  contacts: [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company_name",
    "job_title",
    "address",
    "city",
    "country",
    "notes",
    "created_at",
    "updated_at",
  ],
  documents: [
    "file_name",
    "file_type",
    "file_size",
    "url",
    "folder_path",
    "created_at",
    "modified_at",
    "owner",
    "shared_with",
  ],
  tickets: [
    "ticket_id",
    "subject",
    "description",
    "status",
    "priority",
    "assignee",
    "reporter",
    "created_at",
    "updated_at",
    "resolved_at",
  ],
  deals: [
    "deal_name",
    "amount",
    "currency",
    "stage",
    "pipeline",
    "close_date",
    "probability",
    "owner",
    "company_name",
    "description",
    "created_at",
    "updated_at",
  ],
  companies: [
    "company_name",
    "industry",
    "website",
    "phone",
    "email",
    "address",
    "city",
    "country",
    "postal_code",
    "province",
    "vat_number",
    "tax_id",
    "employee_count",
    "annual_revenue",
    "description",
    "created_at",
    "updated_at",
  ],
  payments: [
    "payment_id",
    "amount",
    "currency",
    "status",
    "payment_method",
    "customer_id",
    "customer_email",
    "description",
    "created_at",
  ],
  subscriptions: [
    "subscription_id",
    "customer_id",
    "status",
    "amount",
    "currency",
    "billing_interval",
    "start_date",
    "end_date",
    "created_at",
    "updated_at",
  ],
};

/**
 * Ritorna lo schema target per un DataType.
 * Se il tipo non esiste, ritorna un array vuoto.
 */
export function getTargetSchema(dataType: string): string[] {
  return TARGET_SCHEMAS[dataType] ?? [];
}

/**
 * Ritorna tutti i DataType con schema target definito.
 */
export function getAvailableDataTypes(): string[] {
  return Object.keys(TARGET_SCHEMAS);
}
