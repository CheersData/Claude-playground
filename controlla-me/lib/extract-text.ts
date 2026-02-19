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
  const { PDFParse } = await import("pdf-parse");
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
