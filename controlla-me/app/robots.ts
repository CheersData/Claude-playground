import { MetadataRoute } from "next";

/**
 * robots.txt generation for search engine crawling.
 *
 * Allows all crawlers on public pages, blocks internal/admin routes.
 * Sitemap URL is auto-generated from NEXT_PUBLIC_APP_URL.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://controlla.me";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/blog/", "/corpus", "/pricing", "/integrazione"],
        disallow: [
          "/api/",
          "/console/",
          "/ops/",
          "/dashboard/",
          "/legaloffice/",
          "/analysis/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
