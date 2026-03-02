import { describe, it, expect, vi, beforeEach } from "vitest";

// The source code uses createRequire(import.meta.url)("pdf-parse").
// vi.mock intercepts CJS requires (including createRequire) via Node's Module._load hook.
const mockPdfParseFn = vi.hoisted(() => vi.fn());
const mockMammothExtract = vi.hoisted(() => vi.fn());

vi.mock("pdf-parse", () => ({
  // Expose as default export — code does: pdfParseModule.default ?? pdfParseModule
  default: mockPdfParseFn,
  // PDFParse is the v2 class API. Set to undefined so the typeof check is "undefined"
  // (not "function") and code falls through to the v1 function-based API.
  PDFParse: undefined,
}));

vi.mock("mammoth", () => ({
  default: { extractRawText: mockMammothExtract },
}));

import { extractText } from "@/lib/extract-text";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractText", () => {
  describe("text/plain", () => {
    it("extracts text from a UTF-8 buffer", async () => {
      const text = "Questo è un contratto di prova con testo sufficiente.";
      const buffer = Buffer.from(text, "utf-8");
      const result = await extractText(buffer, "text/plain", "doc.txt");
      expect(result).toBe(text);
    });

    it("handles text file by extension when MIME is empty", async () => {
      const text = "Testo dal file senza MIME type specificato nel sistema.";
      const buffer = Buffer.from(text, "utf-8");
      const result = await extractText(buffer, "", "document.txt");
      expect(result).toBe(text);
    });
  });

  describe("application/pdf", () => {
    it("extracts text using pdf-parse v1 function API", async () => {
      mockPdfParseFn.mockResolvedValue({
        text: "Testo estratto dal PDF di prova con contenuto sufficiente.",
      });

      const buffer = Buffer.from("fake-pdf-content");
      const result = await extractText(buffer, "application/pdf", "test.pdf");
      expect(result).toBe(
        "Testo estratto dal PDF di prova con contenuto sufficiente."
      );
      expect(mockPdfParseFn).toHaveBeenCalledWith(buffer);
    });

    it("throws Italian error when PDF has no extractable text", async () => {
      mockPdfParseFn.mockResolvedValue({ text: "   " });

      const buffer = Buffer.from("fake-pdf");
      await expect(
        extractText(buffer, "application/pdf", "empty.pdf")
      ).rejects.toThrow("Il PDF non contiene testo estraibile");
    });

    it("uses .pdf extension when MIME type is empty", async () => {
      mockPdfParseFn.mockResolvedValue({ text: "PDF text content here" });

      const buffer = Buffer.from("fake-pdf");
      const result = await extractText(buffer, "", "document.pdf");
      expect(result).toBe("PDF text content here");
    });
  });

  describe("DOCX", () => {
    it("extracts text from DOCX buffer using mammoth", async () => {
      mockMammothExtract.mockResolvedValue({
        value: "Testo dal documento Word di prova.",
      });

      const buffer = Buffer.from("fake-docx");
      const result = await extractText(
        buffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "test.docx"
      );
      expect(result).toBe("Testo dal documento Word di prova.");
    });

    it("throws Italian error when DOCX has no text", async () => {
      mockMammothExtract.mockResolvedValue({ value: "" });

      const buffer = Buffer.from("fake-docx");
      await expect(
        extractText(
          buffer,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "empty.docx"
        )
      ).rejects.toThrow("Il file Word non contiene testo estraibile");
    });
  });

  describe("DOC (legacy Word)", () => {
    it("routes .doc files through DOCX extractor", async () => {
      mockMammothExtract.mockResolvedValue({
        value: "Testo da file DOC legacy.",
      });

      const buffer = Buffer.from("fake-doc");
      const result = await extractText(
        buffer,
        "application/msword",
        "test.doc"
      );
      expect(result).toBe("Testo da file DOC legacy.");
    });
  });

  describe("image/*", () => {
    it("throws OCR not-yet-implemented error in Italian", async () => {
      const buffer = Buffer.from("fake-image");
      await expect(
        extractText(buffer, "image/png", "scan.png")
      ).rejects.toThrow("il supporto OCR è in fase di attivazione");
    });

    it("throws for image/jpeg as well", async () => {
      const buffer = Buffer.from("fake-image");
      await expect(
        extractText(buffer, "image/jpeg", "photo.jpg")
      ).rejects.toThrow("il supporto OCR è in fase di attivazione");
    });
  });

  describe("unknown MIME type", () => {
    it("falls back to UTF-8 text decoding", async () => {
      const text = "Fallback text content for unknown MIME types works fine.";
      const buffer = Buffer.from(text);
      const result = await extractText(
        buffer,
        "application/octet-stream",
        "file.xyz"
      );
      expect(result).toBe(text);
    });
  });
});
