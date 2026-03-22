import type { Metadata } from "next";
import BlogIndexClient from "./BlogIndexClient";
import { articles } from "./articles";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://controlla.me";

export const metadata: Metadata = {
  title: "Blog — controlla.me",
  description:
    "Guide, approfondimenti e analisi sul diritto italiano: contratti, lavoro, consumatori. Contenuti verificati dall'AI legale di controlla.me.",
  openGraph: {
    title: "Blog — controlla.me",
    description:
      "Guide e approfondimenti sul diritto italiano dei contratti, del lavoro e dei consumatori.",
    type: "website",
    url: `${baseUrl}/blog`,
    siteName: "controlla.me",
  },
  alternates: {
    canonical: `${baseUrl}/blog`,
  },
};

/**
 * JSON-LD structured data for the blog index page.
 * Generates CollectionPage + itemListElement for article previews.
 */
function BlogIndexJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Blog — controlla.me",
    description:
      "Guide, approfondimenti e analisi sul diritto italiano: contratti, lavoro, consumatori.",
    url: `${baseUrl}/blog`,
    publisher: {
      "@type": "Organization",
      name: "controlla.me",
      url: baseUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${baseUrl}/blog/${article.slug}`,
        name: article.title,
      })),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function BlogPage() {
  return (
    <>
      <BlogIndexJsonLd />
      <BlogIndexClient />
    </>
  );
}
