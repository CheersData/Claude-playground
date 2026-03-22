// Server component wrapper for SyncDashboard route.
// Next.js 16 Turbopack requires route segment config in server components.

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sync Dashboard — controlla.me",
  description:
    "Monitora lo stato delle tue integrazioni: sync in corso, errori, record sincronizzati.",
};

import SyncDashboard from "@/components/integrations/SyncDashboard";

export default function DashboardPage() {
  return <SyncDashboard />;
}
