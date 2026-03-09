/**
 * /studia — Pagina corpus medico studia.me
 *
 * Server component wrapper per force-dynamic.
 * Next.js 16 Turbopack ignora route segment config in client components.
 */

export const dynamic = "force-dynamic";

import StudiaPageClient from "./StudiaPageClient";

export default function StudiaPage() {
  return <StudiaPageClient />;
}
