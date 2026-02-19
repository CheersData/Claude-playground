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
  // Dynamic import to avoid canvas polyfill issues at build time
  const pdfModule = await import("pdf-parse");
  const pdfParse = (pdfModule as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default || pdfModule;
  const data = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
  if (!data.text || data.text.trim().length === 0) {
    throw new Error(
      "Il PDF non contiene testo estraibile. Potrebbe essere un PDF scansionato — prova a caricare un'immagine."
    );
  }
  return data.text;
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
