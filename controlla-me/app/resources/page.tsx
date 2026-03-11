// Server component wrapper — export const dynamic only works in server components
// since Next.js 15/16 Turbopack ignores route segment config in "use client" files.
// Without this, static prerendering fails with "Cannot read properties of null
// (reading 'useContext')" because this page uses framer-motion, useState, etc.

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import ResourcesClient from "./ResourcesClient";

export const metadata: Metadata = {
  title: "Risorse Legali Gratuite — Controlla.me",
  description:
    "Guide pratiche sui contratti, scritte da avvocati e aggiornate al 2025. Scarica gratis la Guida ai contratti d'affitto: clausole rischiose, diritti del conduttore, template lettere legali.",
};

export default function ResourcesPage() {
  return <ResourcesClient />;
}
