/**
 * SEO utilities — Metadata, JSON-LD, Open Graph helpers.
 *
 * Shared across Poimandres verticals (poimandres.work).
 * Centralizes structured data generation for articles, organization,
 * and website schemas.
 */

import type { Metadata } from "next";

// ─── Constants ───

export const POIMANDRES_URL = "https://poimandres.work";

/** @deprecated Use POIMANDRES_URL — controlla.me redirects to poimandres.work */
export const CONTROLLA_ME_URL = POIMANDRES_URL;

export const ORGANIZATION_POIMANDRES = {
  "@type": "Organization" as const,
  name: "Poimandres",
  url: POIMANDRES_URL,
  description:
    "Piattaforma AI multi-verticale — analisi legale, trading, musica e strumenti per professionisti e PMI.",
  sameAs: [] as string[],
};

/** @deprecated Use ORGANIZATION_POIMANDRES — kept for backward compatibility */
export const ORGANIZATION_CONTROLLA = ORGANIZATION_POIMANDRES;

// ─── JSON-LD Generators ───

export interface ArticleJsonLdInput {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  tags: string[];
  category: string;
  wordCount: number;
  baseUrl: string;
  publisher: typeof ORGANIZATION_POIMANDRES;
}

/**
 * Generate Article JSON-LD structured data for Google rich results.
 * Conforms to https://schema.org/Article
 */
export function generateArticleJsonLd(input: ArticleJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    author: {
      "@type": "Organization",
      name: input.author,
      url: input.baseUrl,
    },
    publisher: input.publisher,
    datePublished: input.publishedAt,
    ...(input.updatedAt && { dateModified: input.updatedAt }),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${input.baseUrl}/blog/${input.slug}`,
    },
    wordCount: input.wordCount,
    keywords: input.tags.join(", "),
    inLanguage: "it-IT",
    isAccessibleForFree: true,
    articleSection: input.category,
  };
}

/**
 * Generate WebSite JSON-LD for site-wide structured data.
 */
export function generateWebsiteJsonLd(
  name: string,
  url: string,
  description: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    description,
    inLanguage: "it-IT",
    publisher: {
      "@type": "Organization",
      name,
      url,
    },
  };
}

/**
 * Generate CollectionPage JSON-LD for blog index pages.
 */
export function generateBlogIndexJsonLd(
  baseUrl: string,
  articles: Array<{ slug: string; title: string }>,
  siteName: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Blog — ${siteName}`,
    description: `Guide, approfondimenti e analisi sul diritto italiano: contratti, lavoro, consumatori.`,
    url: `${baseUrl}/blog`,
    publisher: {
      "@type": "Organization",
      name: siteName,
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
}

/**
 * Generate BreadcrumbList JSON-LD for breadcrumb navigation.
 */
export function generateBreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ─── Metadata Helpers ───

/**
 * Generate standard article metadata for Next.js.
 */
export function generateArticleMetadata(input: {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  tags: string[];
  baseUrl: string;
  siteName: string;
}): Metadata {
  return {
    title: `${input.title} — ${input.siteName} Blog`,
    description: input.description,
    openGraph: {
      title: input.title,
      description: input.description,
      type: "article",
      publishedTime: input.publishedAt,
      ...(input.updatedAt && { modifiedTime: input.updatedAt }),
      authors: [input.author],
      tags: input.tags,
      siteName: input.siteName,
      url: `${input.baseUrl}/blog/${input.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
    },
    alternates: {
      canonical: `${input.baseUrl}/blog/${input.slug}`,
    },
  };
}

/**
 * Compute word count from article sections.
 */
export function computeWordCount(
  sections: Array<{
    content: string;
    items?: string[];
  }>,
): number {
  return sections.reduce((count, section) => {
    const words = section.content.split(/\s+/).length;
    const itemWords =
      section.items?.reduce(
        (sum, item) => sum + item.split(/\s+/).length,
        0,
      ) ?? 0;
    return count + words + itemWords;
  }, 0);
}
