/**
 * Tests: lib/seo.ts — SEO utilities (JSON-LD, metadata, word count).
 *
 * Coverage targets: 207 lines, previously 0%.
 * All functions are pure — no mocking needed.
 */

import { describe, it, expect } from "vitest";

import {
  POIMANDRES_URL,
  ORGANIZATION_POIMANDRES,
  generateArticleJsonLd,
  generateWebsiteJsonLd,
  generateBlogIndexJsonLd,
  generateBreadcrumbJsonLd,
  generateArticleMetadata,
  computeWordCount,
} from "@/lib/seo";

// =============================================================================
// Constants
// =============================================================================

describe("SEO constants", () => {
  it("POIMANDRES_URL is a valid HTTPS URL", () => {
    expect(POIMANDRES_URL).toMatch(/^https:\/\//);
  });

  it("ORGANIZATION_POIMANDRES has correct structure", () => {
    expect(ORGANIZATION_POIMANDRES["@type"]).toBe("Organization");
    expect(ORGANIZATION_POIMANDRES.name).toBe("Poimandres");
    expect(ORGANIZATION_POIMANDRES.url).toBe(POIMANDRES_URL);
  });
});

// =============================================================================
// generateArticleJsonLd
// =============================================================================

describe("generateArticleJsonLd", () => {
  const baseInput = {
    title: "Test Article",
    description: "A test description",
    slug: "test-article",
    publishedAt: "2026-01-15",
    author: "Poimandres",
    tags: ["contratto", "affitto"],
    category: "diritto civile",
    wordCount: 1500,
    baseUrl: "https://poimandres.work",
    publisher: ORGANIZATION_POIMANDRES,
  };

  it("generates valid Article schema", () => {
    const result = generateArticleJsonLd(baseInput);
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Article");
    expect(result.headline).toBe("Test Article");
    expect(result.description).toBe("A test description");
    expect(result.inLanguage).toBe("it-IT");
    expect(result.isAccessibleForFree).toBe(true);
  });

  it("includes datePublished", () => {
    const result = generateArticleJsonLd(baseInput);
    expect(result.datePublished).toBe("2026-01-15");
  });

  it("includes dateModified when updatedAt is provided", () => {
    const result = generateArticleJsonLd({ ...baseInput, updatedAt: "2026-02-01" });
    expect(result.dateModified).toBe("2026-02-01");
  });

  it("does NOT include dateModified when updatedAt is absent", () => {
    const result = generateArticleJsonLd(baseInput);
    expect(result).not.toHaveProperty("dateModified");
  });

  it("formats keywords from tags array", () => {
    const result = generateArticleJsonLd(baseInput);
    expect(result.keywords).toBe("contratto, affitto");
  });

  it("generates correct mainEntityOfPage URL", () => {
    const result = generateArticleJsonLd(baseInput);
    expect(result.mainEntityOfPage["@id"]).toBe("https://poimandres.work/blog/test-article");
  });

  it("includes wordCount and articleSection", () => {
    const result = generateArticleJsonLd(baseInput);
    expect(result.wordCount).toBe(1500);
    expect(result.articleSection).toBe("diritto civile");
  });
});

// =============================================================================
// generateWebsiteJsonLd
// =============================================================================

describe("generateWebsiteJsonLd", () => {
  it("generates valid WebSite schema", () => {
    const result = generateWebsiteJsonLd("Poimandres", "https://poimandres.work", "Test description");
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("WebSite");
    expect(result.name).toBe("Poimandres");
    expect(result.url).toBe("https://poimandres.work");
    expect(result.description).toBe("Test description");
    expect(result.inLanguage).toBe("it-IT");
  });

  it("includes publisher organization", () => {
    const result = generateWebsiteJsonLd("Poimandres", "https://poimandres.work", "desc");
    expect(result.publisher["@type"]).toBe("Organization");
    expect(result.publisher.name).toBe("Poimandres");
  });
});

// =============================================================================
// generateBlogIndexJsonLd
// =============================================================================

describe("generateBlogIndexJsonLd", () => {
  it("generates valid CollectionPage schema", () => {
    const articles = [
      { slug: "article-1", title: "Article 1" },
      { slug: "article-2", title: "Article 2" },
    ];
    const result = generateBlogIndexJsonLd("https://poimandres.work", articles, "Poimandres");

    expect(result["@type"]).toBe("CollectionPage");
    expect(result.url).toBe("https://poimandres.work/blog");
    expect(result.mainEntity["@type"]).toBe("ItemList");
    expect(result.mainEntity.itemListElement).toHaveLength(2);
  });

  it("assigns correct positions to items", () => {
    const articles = [
      { slug: "a", title: "A" },
      { slug: "b", title: "B" },
    ];
    const result = generateBlogIndexJsonLd("https://poimandres.work", articles, "Test");
    expect(result.mainEntity.itemListElement[0].position).toBe(1);
    expect(result.mainEntity.itemListElement[1].position).toBe(2);
  });

  it("generates correct URLs for each item", () => {
    const articles = [{ slug: "test-slug", title: "Test" }];
    const result = generateBlogIndexJsonLd("https://poimandres.work", articles, "Test");
    expect(result.mainEntity.itemListElement[0].url).toBe("https://poimandres.work/blog/test-slug");
  });

  it("handles empty articles array", () => {
    const result = generateBlogIndexJsonLd("https://poimandres.work", [], "Test");
    expect(result.mainEntity.itemListElement).toEqual([]);
  });
});

// =============================================================================
// generateBreadcrumbJsonLd
// =============================================================================

describe("generateBreadcrumbJsonLd", () => {
  it("generates valid BreadcrumbList schema", () => {
    const items = [
      { name: "Home", url: "https://poimandres.work" },
      { name: "Blog", url: "https://poimandres.work/blog" },
      { name: "Article", url: "https://poimandres.work/blog/article-1" },
    ];
    const result = generateBreadcrumbJsonLd(items);

    expect(result["@type"]).toBe("BreadcrumbList");
    expect(result.itemListElement).toHaveLength(3);
    expect(result.itemListElement[0].position).toBe(1);
    expect(result.itemListElement[2].position).toBe(3);
  });

  it("uses ListItem type for each element", () => {
    const items = [{ name: "Home", url: "/" }];
    const result = generateBreadcrumbJsonLd(items);
    expect(result.itemListElement[0]["@type"]).toBe("ListItem");
  });
});

// =============================================================================
// generateArticleMetadata
// =============================================================================

describe("generateArticleMetadata", () => {
  const baseInput = {
    title: "Test Article",
    description: "A test description",
    slug: "test-article",
    publishedAt: "2026-01-15",
    author: "Poimandres",
    tags: ["contratto", "affitto"],
    baseUrl: "https://poimandres.work",
    siteName: "Poimandres",
  };

  it("generates title with siteName suffix", () => {
    const meta = generateArticleMetadata(baseInput);
    expect(meta.title).toContain("Test Article");
    expect(meta.title).toContain("Poimandres");
  });

  it("includes Open Graph metadata", () => {
    const meta = generateArticleMetadata(baseInput);
    expect(meta.openGraph).toBeDefined();
    expect(meta.openGraph!.type).toBe("article");
    expect(meta.openGraph!.publishedTime).toBe("2026-01-15");
  });

  it("includes Twitter card metadata", () => {
    const meta = generateArticleMetadata(baseInput);
    expect(meta.twitter).toBeDefined();
    expect(meta.twitter!.card).toBe("summary_large_image");
  });

  it("sets canonical URL", () => {
    const meta = generateArticleMetadata(baseInput);
    expect(meta.alternates?.canonical).toBe("https://poimandres.work/blog/test-article");
  });

  it("includes modifiedTime when updatedAt is provided", () => {
    const meta = generateArticleMetadata({ ...baseInput, updatedAt: "2026-02-01" });
    expect(meta.openGraph!.modifiedTime).toBe("2026-02-01");
  });

  it("does NOT include modifiedTime when updatedAt is absent", () => {
    const meta = generateArticleMetadata(baseInput);
    expect(meta.openGraph!.modifiedTime).toBeUndefined();
  });
});

// =============================================================================
// computeWordCount
// =============================================================================

describe("computeWordCount", () => {
  it("counts words in a single section", () => {
    const result = computeWordCount([{ content: "one two three four" }]);
    expect(result).toBe(4);
  });

  it("counts words across multiple sections", () => {
    const result = computeWordCount([
      { content: "one two" },
      { content: "three four five" },
    ]);
    expect(result).toBe(5);
  });

  it("includes words from items array", () => {
    const result = computeWordCount([
      { content: "intro text", items: ["item one", "item two three"] },
    ]);
    // "intro text" = 2, "item one" = 2, "item two three" = 3 → total 7
    expect(result).toBe(7);
  });

  it("returns 0 for empty sections", () => {
    const result = computeWordCount([]);
    expect(result).toBe(0);
  });

  it("handles sections without items", () => {
    const result = computeWordCount([{ content: "hello world" }]);
    expect(result).toBe(2);
  });

  it("handles empty items array", () => {
    const result = computeWordCount([{ content: "hello", items: [] }]);
    expect(result).toBe(1);
  });
});
