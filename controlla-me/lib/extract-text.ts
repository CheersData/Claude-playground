/**
 * Extract text from a file buffer based on its MIME type.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return extractFromPDF(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    return extractFromDOCX(buffer);
  }

  if (
    mimeType === "application/msword" ||
    fileName.endsWith(".doc")
  ) {
    return extractFromDOCX(buffer);
  }

  if (mimeType.startsWith("image/")) {
    return extractFromImage();
  }

  if (mimeType === "text/plain" || fileName.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  // Fallback: try to read as text
  return buffer.toString("utf-8");
}

async function extractFromPDF(buffer: Buffer): Promise<string> {
  // Use require() to avoid webpack mangling the dynamic import for pdf-parse v2
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParseModule = require("pdf-parse");
  const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse;

  if (typeof PDFParse !== "function") {
    // Fallback: try the v1 function-based API
    const pdfParseFn = pdfParseModule.default || pdfParseModule;
    if (typeof pdfParseFn === "function") {
      const data = await pdfParseFn(buffer);
      const text = data.text ?? "";
      if (text.trim().length === 0) {
        throw new Error(
          "Il PDF non contiene testo estraibile. Potrebbe essere un PDF scansionato — prova a caricare un'immagine."
        );
      }
      return text;
    }
    throw new Error("Impossibile caricare il modulo pdf-parse");
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text ?? "";
    if (text.trim().length === 0) {
      throw new Error(
        "Il PDF non contiene testo estraibile. Potrebbe essere un PDF scansionato — prova a caricare un'immagine."
      );
    }
    return text;
  } finally {
    parser.destroy();
  }
}

async function extractFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer });
  if (!result.value || result.value.trim().length === 0) {
    throw new Error("Il file Word non contiene testo estraibile.");
  }
  return result.value;
}

async function extractFromImage(): Promise<string> {
  throw new Error(
    "Per le immagini, il supporto OCR è in fase di attivazione. Per ora, carica un PDF o un file Word."
  );
}
