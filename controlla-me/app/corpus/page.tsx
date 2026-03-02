// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.
// Without this, static prerendering fails with "Cannot read properties of null
// (reading 'useContext')" because corpus uses useSearchParams, framer-motion, etc.

export const dynamic = "force-dynamic";

import CorpusPageClient from "./CorpusPageClient";

export default function CorpusPage() {
  return <CorpusPageClient />;
}
