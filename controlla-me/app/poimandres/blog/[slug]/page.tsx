import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticleBySlug, getAllSlugs } from "@/app/blog/articles";
import PoimandresArticleDetailClient from "./PoimandresArticleDetailClient";
import {
  generateArticleJsonLd,
  generateBreadcrumbJsonLd,
  generateArticleMetadata,
  computeWordCount,
  POIMANDRES_URL,
  ORGANIZATION_POIMANDRES,
} from "@/lib/seo";

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

  return generateArticleMetadata({
    title: article.title,
    description: article.description,
    slug,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    author: article.author,
    tags: article.tags,
    baseUrl: POIMANDRES_URL,
    siteName: "poimandres",
  });
}

function ArticleJsonLd({ slug }: { slug: string }) {
  const article = getArticleBySlug(slug);
  if (!article) return null;

  const wordCount = computeWordCount(article.sections);

  const jsonLd = generateArticleJsonLd({
    title: article.title,
    description: article.description,
    slug,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    author: article.author,
    tags: article.tags,
    category: article.category,
    wordCount,
    baseUrl: POIMANDRES_URL,
    publisher: ORGANIZATION_POIMANDRES,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

function BreadcrumbJsonLd({ slug }: { slug: string }) {
  const article = getArticleBySlug(slug);
  if (!article) return null;

  const jsonLd = generateBreadcrumbJsonLd([
    { name: "Home", url: POIMANDRES_URL },
    { name: "Blog", url: `${POIMANDRES_URL}/blog` },
    { name: article.title, url: `${POIMANDRES_URL}/blog/${slug}` },
  ]);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function PoimandresArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <>
      <ArticleJsonLd slug={slug} />
      <BreadcrumbJsonLd slug={slug} />
      <PoimandresArticleDetailClient article={article} />
    </>
  );
}
