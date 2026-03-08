// Server component wrapper — export const dynamic only works in server components
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import PietroClient from "./PietroClient";

export const metadata: Metadata = {
  title: "Guida Universita per Pietro — Marketing + Moda + Real Estate + AI",
  description:
    "Analisi completa delle facolta italiane e delle opportunita di carriera in Marketing, Moda e Real Estate nell'era dell'AI.",
};

export default function PietroPage() {
  return <PietroClient />;
}
