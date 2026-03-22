import { MetadataRoute } from "next";
import { articles } from "./blog/articles";

/**
 * Sitemap generator — produces entries for both controlla.me and poimandres.work.
 *
 * Next.js generates a single sitemap.xml at the root.
 * Both domains share the same deploy, so all URLs are included.
 * robots.txt references both domain sitemaps (same file served from both).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const controllaMeUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://controlla.me";
  const poimandresUrl = "https://poimandres.work";

  // ─── controlla.me entries ───

  const controllaMeEntries: MetadataRoute.Sitemap = [
    {
      url: controllaMeUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${controllaMeUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${controllaMeUrl}/corpus`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${controllaMeUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...articles.map((article) => ({
      url: `${controllaMeUrl}/blog/${article.slug}`,
      lastModified: new Date(article.updatedAt || article.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${controllaMeUrl}/integrazione`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  // ─── poimandres.work entries ───

  const poimandresEntries: MetadataRoute.Sitemap = [
    {
      url: poimandresUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${poimandresUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...articles.map((article) => ({
      url: `${poimandresUrl}/blog/${article.slug}`,
      lastModified: new Date(article.updatedAt || article.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  return [...controllaMeEntries, ...poimandresEntries];
}
