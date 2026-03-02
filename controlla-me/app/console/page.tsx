// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.
// Without this, static prerendering fails with "Cannot read properties of null
// (reading 'useContext')" because console uses sessionStorage, window, etc.

export const dynamic = "force-dynamic";

import ConsolePageClient from "./ConsolePageClient";

export default function ConsolePage() {
  return <ConsolePageClient />;
}
