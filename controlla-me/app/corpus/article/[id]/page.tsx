// Server component wrapper — export const dynamic only works in server components
// since Next.js 15/16 Turbopack ignores route segment config in "use client" files.
// Without this, static prerendering fails with "Cannot read properties of null
// (reading 'useContext')" because this page uses framer-motion, useParams, useState, etc.

export const dynamic = "force-dynamic";

import ArticlePageClient from "./ArticlePageClient";

export default function ArticlePage() {
  return <ArticlePageClient />;
}
