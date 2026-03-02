// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.
// The home page reads window.location.search for session params.

export const dynamic = "force-dynamic";

import HomePageClient from "./HomePageClient";

export default function Home() {
  return <HomePageClient />;
}
