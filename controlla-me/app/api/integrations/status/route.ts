import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Expanded connector catalog — static marketplace data.
// If user is authenticated, connection status is merged from integration_connections.
const connectors = [
  // ─── CRM ───
  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    status: "not_connected" as const,
    description: "Sincronizza account, contatti, opportunita e pipeline di vendita.",
    icon: "Building2",
    entityCount: 0,
    lastSync: null as string | null,
    popular: true,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    status: "not_connected" as const,
    description: "Contatti, aziende, deal, ticket e campagne marketing.",
    icon: "Users",
    entityCount: 0,
    lastSync: null as string | null,
    popular: true,
  },
  // ─── ERP ───
  {
    id: "sap",
    name: "SAP",
    category: "erp",
    status: "coming_soon" as const,
    description: "Gestionale completo ERP: ordini, fatture, inventario e contabilita.",
    icon: "BarChart3",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  {
    id: "odoo",
    name: "Odoo",
    category: "erp",
    status: "coming_soon" as const,
    description: "ERP open source: vendite, acquisti, magazzino e produzione.",
    icon: "BarChart3",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  // ─── Cloud Storage ───
  {
    id: "google-drive",
    name: "Google Drive",
    category: "storage",
    status: "not_connected" as const,
    description: "Importa file, documenti e fogli di calcolo dal tuo Drive.",
    icon: "HardDrive",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  // ─── Payments ───
  {
    id: "stripe",
    name: "Stripe",
    category: "payment",
    status: "not_connected" as const,
    description: "Pagamenti, fatture, abbonamenti e portale clienti.",
    icon: "CreditCard",
    entityCount: 0,
    lastSync: null as string | null,
    popular: true,
  },
  // ─── Marketing ───
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "marketing",
    status: "coming_soon" as const,
    description: "Liste contatti, campagne email e automazioni marketing.",
    icon: "Mail",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    category: "marketing",
    status: "coming_soon" as const,
    description: "Email transazionali, newsletter e analisi deliverability.",
    icon: "Mail",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  // ─── Legal ───
  {
    id: "normattiva",
    name: "Normattiva",
    category: "legal",
    status: "not_connected" as const,
    description: "Corpus legislativo italiano: codici, decreti e leggi ordinarie.",
    icon: "FileText",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  {
    id: "eurlex",
    name: "EUR-Lex",
    category: "legal",
    status: "not_connected" as const,
    description: "Normativa europea: regolamenti, direttive e decisioni UE.",
    icon: "FileText",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  // ─── HR ───
  {
    id: "personio",
    name: "Personio",
    category: "hr",
    status: "coming_soon" as const,
    description: "Gestione dipendenti, buste paga, assenze e recruiting.",
    icon: "Briefcase",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    category: "hr",
    status: "coming_soon" as const,
    description: "HR management: anagrafiche, documenti e workflow approvazione.",
    icon: "Briefcase",
    entityCount: 0,
    lastSync: null as string | null,
    popular: false,
  },
];

// Status mapping: DB status → catalog display status
function mapDbStatus(
  dbStatus: string
): "connected" | "not_connected" | "error" | "syncing" {
  switch (dbStatus) {
    case "active":
    case "connected":
      return "connected";
    case "error":
      return "error";
    case "syncing":
      return "syncing";
    default:
      return "not_connected";
  }
}

export async function GET(request: NextRequest) {
  // SEC-M12: rate-limit
  const rateLimitError = await checkRateLimit(request);
  if (rateLimitError) return rateLimitError;

  // SEC-M12: require authenticated user
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;

  // Start with a deep copy of static connectors
  const result = connectors.map((c) => ({ ...c }));

  // Merge connection status from DB for authenticated user
  try {
    const supabase = await createClient();

    const { data: connections, error } = await supabase
      .from("integration_connections")
      .select(
        "connector_type, status, last_sync_at, last_sync_items"
      )
      .eq("user_id", userId)
      .neq("status", "disconnected");

    if (!error && connections) {
      // Build a lookup map: connector_type → connection data
      const connectionMap = new Map(
        connections.map((c) => [c.connector_type, c])
      );

      for (const connector of result) {
        const conn = connectionMap.get(connector.id);
        if (conn) {
          connector.status = mapDbStatus(conn.status) as typeof connector.status;
          connector.entityCount = conn.last_sync_items ?? 0;
          connector.lastSync = conn.last_sync_at;
        }
      }
    }
  } catch {
    // If DB query fails, return static defaults silently
  }

  return NextResponse.json({ connectors: result });
}
