import type { Metadata } from "next";
import PoimandresBlogIndexClient from "./PoimandresBlogIndexClient";
import { articles } from "@/app/blog/articles";
import {
  generateBlogIndexJsonLd,
  POIMANDRES_URL,
} from "@/lib/seo";

export const metadata: Metadata = {
  title: "Blog — poimandres",
  description:
    "Guide, approfondimenti e analisi sul diritto italiano: contratti, lavoro, consumatori. Contenuti verificati dall'AI legale di controlla.me.",
  openGraph: {
    title: "Blog — poimandres",
    description:
      "Guide e approfondimenti sul diritto italiano dei contratti, del lavoro e dei consumatori.",
    type: "website",
    url: `${POIMANDRES_URL}/blog`,
    siteName: "poimandres",
  },
  alternates: {
    canonical: `${POIMANDRES_URL}/blog`,
  },
};

function BlogIndexJsonLd() {
  const jsonLd = generateBlogIndexJsonLd(POIMANDRES_URL, articles, "poimandres");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function PoimandresBlogPage() {
  return (
    <>
      <BlogIndexJsonLd />
      <PoimandresBlogIndexClient />
    </>
  );
}
