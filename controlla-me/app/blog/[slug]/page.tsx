import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticleBySlug, getAllSlugs } from "../articles";
import ArticleDetailClient from "./ArticleDetailClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return { title: "Articolo non trovato" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://controlla.me";

  return {
    title: `${article.title} — controlla.me Blog`,
    description: article.description,
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      publishedTime: article.publishedAt,
      ...(article.updatedAt && { modifiedTime: article.updatedAt }),
      authors: [article.author],
      tags: article.tags,
      siteName: "controlla.me",
      url: `${baseUrl}/blog/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
    alternates: {
      canonical: `${baseUrl}/blog/${slug}`,
    },
  };
}

/**
 * JSON-LD structured data for Google rich results.
 * Generates Article schema markup per https://schema.org/Article
 */
function ArticleJsonLd({ slug }: { slug: string }) {
  const article = getArticleBySlug(slug);
  if (!article) return null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://controlla.me";

  // Extract plain text word count from all sections for wordCount
  const wordCount = article.sections.reduce((count, section) => {
    const words = section.content.split(/\s+/).length;
    const itemWords = section.items?.reduce((sum, item) => sum + item.split(/\s+/).length, 0) ?? 0;
    return count + words + itemWords;
  }, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    author: {
      "@type": "Organization",
      name: article.author,
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "controlla.me",
      url: baseUrl,
    },
    datePublished: article.publishedAt,
    ...(article.updatedAt && { dateModified: article.updatedAt }),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/blog/${slug}`,
    },
    wordCount,
    keywords: article.tags.join(", "),
    inLanguage: "it-IT",
    isAccessibleForFree: true,
    articleSection: article.category,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <>
      <ArticleJsonLd slug={slug} />
      <ArticleDetailClient article={article} />
    </>
  );
}
