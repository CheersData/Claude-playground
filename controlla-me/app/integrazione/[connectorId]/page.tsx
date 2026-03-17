// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ConnectorDetailClient from "./ConnectorDetailClient";
import { ToastProvider } from "@/components/integrations/Toast";

// ─── Static connector name map ───

const CONNECTOR_NAMES: Record<string, string> = {
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  sap: "SAP",
  odoo: "Odoo",
  "google-drive": "Google Drive",
  stripe: "Stripe",
  "fatture-in-cloud": "Fatture in Cloud",
  mailchimp: "Mailchimp",
  sendgrid: "SendGrid",
  normattiva: "Normattiva",
  eurlex: "EUR-Lex",
  personio: "Personio",
  bamboohr: "BambooHR",
};

const VALID_CONNECTOR_IDS = new Set(Object.keys(CONNECTOR_NAMES));

// ─── Metadata ───

type PageProps = { params: Promise<{ connectorId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { connectorId } = await params;
  const displayName = CONNECTOR_NAMES[connectorId];
  if (!displayName) {
    return { title: "Connettore non trovato — controlla.me" };
  }
  return {
    title: `${displayName} — Integrazioni — controlla.me`,
    description: `Configura il connettore ${displayName} per sincronizzare i tuoi dati aziendali con controlla.me.`,
  };
}

// ─── Page ───

export default async function ConnectorDetailPage({ params }: PageProps) {
  const { connectorId } = await params;

  if (!VALID_CONNECTOR_IDS.has(connectorId)) {
    notFound();
  }

  return (
    <ToastProvider>
      <ConnectorDetailClient />
    </ToastProvider>
  );
}
