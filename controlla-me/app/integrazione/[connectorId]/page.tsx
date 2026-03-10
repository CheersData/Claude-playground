// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.

export const dynamic = "force-dynamic";

import ConnectorDetailClient from "./ConnectorDetailClient";

export default function ConnectorDetailPage() {
  return <ConnectorDetailClient />;
}
