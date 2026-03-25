/**
 * Generate real (minimal but valid) test fixture files for UAT.
 *
 * Usage: npx tsx tests/uat/fixtures/generate-fixtures.ts
 *
 * Generates:
 *   - legale/sample-contratto-affitto.pdf   (valid PDF 1.4)
 *   - legale/sample-contratto-lavoro.docx   (valid DOCX / ZIP with XML)
 *   - musica/sample-demo.mp3                (valid MP3 frame, ~0.5s silence)
 */

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

const FIXTURES_DIR = path.resolve(__dirname);

// ─── PDF Generator ───────────────────────────────────────────────────────────

function generatePDF(): Buffer {
  // Minimal valid PDF 1.4 with text content
  const text = "CONTRATTO DI LOCAZIONE - Art. 1 - Le parti convengono quanto segue: " +
    "Il locatore concede in locazione al conduttore l'immobile sito in Via Roma 1, " +
    "per la durata di anni 4, rinnovabile per ulteriori 4 anni.";

  // PDF objects
  const objects: string[] = [];

  // Object 1: Catalog
  objects.push(
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj"
  );

  // Object 2: Pages
  objects.push(
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj"
  );

  // Object 3: Page
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj"
  );

  // Object 4: Content stream — break text into lines for readability in PDF
  const lines = [];
  const words = text.split(" ");
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).length > 70) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += " " + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  let streamContent = "BT\n/F1 10 Tf\n50 742 Td\n12 TL\n";
  for (const line of lines) {
    // Escape parentheses in PDF string
    const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    streamContent += `(${escaped}) Tj T*\n`;
  }
  streamContent += "ET";

  objects.push(
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`
  );

  // Object 5: Font
  objects.push(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj"
  );

  // Build PDF
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }

  const xrefOffset = pdf.length;
  pdf += "xref\n";
  pdf += `0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += "trailer\n";
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefOffset}\n`;
  pdf += "%%EOF\n";

  return Buffer.from(pdf, "ascii");
}

// ─── DOCX Generator ──────────────────────────────────────────────────────────

function generateDOCX(): Buffer {
  // A DOCX is a ZIP file containing XML files.
  // We'll build a minimal valid ZIP manually.

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>CONTRATTO DI LAVORO A TEMPO INDETERMINATO</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Art. 1 - Le parti convengono la costituzione di un rapporto di lavoro subordinato a tempo indeterminato con decorrenza dalla data odierna. Il lavoratore si impegna a prestare la propria attivita lavorativa presso la sede del datore di lavoro.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Art. 2 - La retribuzione annua lorda e fissata in EUR 30.000,00 suddivisa in 13 mensilita.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  // Build ZIP manually (store method — no compression needed for small files,
  // but we use deflate for full validity)
  const files: Array<{ name: string; data: Buffer }> = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypesXml, "utf-8") },
    { name: "_rels/.rels", data: Buffer.from(relsXml, "utf-8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf-8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(wordRelsXml, "utf-8") },
  ];

  return buildZip(files);
}

/**
 * Build a minimal valid ZIP file from an array of {name, data} entries.
 * Uses STORE method (no compression) for simplicity.
 */
function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, "utf-8");
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (store method = 0)
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);  // Local file header signature
    localHeader.writeUInt16LE(20, 4);           // Version needed to extract
    localHeader.writeUInt16LE(0, 6);            // General purpose bit flag
    localHeader.writeUInt16LE(0, 8);            // Compression method: STORE
    localHeader.writeUInt16LE(0, 10);           // Last mod file time
    localHeader.writeUInt16LE(0, 12);           // Last mod file date
    localHeader.writeUInt32LE(crc, 14);         // CRC-32
    localHeader.writeUInt32LE(size, 18);        // Compressed size
    localHeader.writeUInt32LE(size, 22);        // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);           // Extra field length
    nameBuffer.copy(localHeader, 30);

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + nameBuffer.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);       // Central directory file header signature
    cdEntry.writeUInt16LE(20, 4);               // Version made by
    cdEntry.writeUInt16LE(20, 6);               // Version needed
    cdEntry.writeUInt16LE(0, 8);                // General purpose bit flag
    cdEntry.writeUInt16LE(0, 10);               // Compression method: STORE
    cdEntry.writeUInt16LE(0, 12);               // Last mod file time
    cdEntry.writeUInt16LE(0, 14);               // Last mod file date
    cdEntry.writeUInt32LE(crc, 16);             // CRC-32
    cdEntry.writeUInt32LE(size, 20);            // Compressed size
    cdEntry.writeUInt32LE(size, 24);            // Uncompressed size
    cdEntry.writeUInt16LE(nameBuffer.length, 28); // File name length
    cdEntry.writeUInt16LE(0, 30);               // Extra field length
    cdEntry.writeUInt16LE(0, 32);               // File comment length
    cdEntry.writeUInt16LE(0, 34);               // Disk number start
    cdEntry.writeUInt16LE(0, 36);               // Internal file attributes
    cdEntry.writeUInt32LE(0, 38);               // External file attributes
    cdEntry.writeUInt32LE(offset, 42);          // Relative offset of local header
    nameBuffer.copy(cdEntry, 46);

    centralDirectory.push(cdEntry);
    parts.push(localHeader);
    parts.push(file.data);
    offset += localHeader.length + file.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDirectory) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // End of central directory signature
  eocd.writeUInt16LE(0, 4);                     // Number of this disk
  eocd.writeUInt16LE(0, 6);                     // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8);          // Number of central directory records on this disk
  eocd.writeUInt16LE(files.length, 10);         // Total number of central directory records
  eocd.writeUInt32LE(cdSize, 12);               // Size of central directory
  eocd.writeUInt32LE(cdOffset, 16);             // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                    // Comment length

  parts.push(eocd);

  return Buffer.concat(parts);
}

/**
 * CRC-32 implementation (standard IEEE polynomial).
 */
function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── MP3 Generator ───────────────────────────────────────────────────────────

function generateMP3(): Buffer {
  // Minimal valid MP3: MPEG1 Layer3, 128kbps, 44100Hz, stereo, ~0.5s
  // An MP3 frame at 128kbps/44100Hz is 417 or 418 bytes (with padding).
  // Frame size = 144 * bitrate / samplerate + padding
  // = 144 * 128000 / 44100 + 1 = 418 bytes

  const frameSize = 418;
  const numFrames = 19; // ~0.5s at 44100Hz (each frame = 1152 samples / 44100 = ~26ms)

  const frames: Buffer[] = [];

  for (let i = 0; i < numFrames; i++) {
    const frame = Buffer.alloc(frameSize, 0);

    // MP3 frame header: 4 bytes
    // Sync word: 0xFFE0 (11 bits all 1s)
    // MPEG version: 11 (MPEG1)
    // Layer: 01 (Layer III)
    // Protection: 1 (no CRC)
    // Bitrate index: 1001 (128kbps for MPEG1 Layer3)
    // Sample rate: 00 (44100Hz for MPEG1)
    // Padding: 1
    // Private: 0
    // Channel mode: 00 (stereo)
    // Mode extension: 00
    // Copyright: 0, Original: 0
    // Emphasis: 00

    // Byte 0: 0xFF
    frame[0] = 0xFF;
    // Byte 1: 111_11_01_1 = 0xFB (sync + MPEG1 + Layer3 + no CRC)
    frame[1] = 0xFB;
    // Byte 2: 1001_00_1_0 = 0x92 (128kbps + 44100Hz + padding + private=0)
    frame[2] = 0x92;
    // Byte 3: 00_00_0_0_00 = 0x00 (stereo + no mode ext + no copy + no orig + no emphasis)
    frame[3] = 0x00;

    // Side information for MPEG1 stereo: 32 bytes (after header)
    // Leave as zeros — represents silence

    frames.push(frame);
  }

  // Optional ID3v2 tag (minimal, makes it more recognizable as MP3)
  const id3Header = Buffer.alloc(10);
  id3Header.write("ID3", 0, 3, "ascii");    // ID3 magic
  id3Header[3] = 3;                          // Version 2.3
  id3Header[4] = 0;                          // Revision
  id3Header[5] = 0;                          // Flags
  // Size: 0 (no frames in this minimal tag)
  id3Header[6] = 0;
  id3Header[7] = 0;
  id3Header[8] = 0;
  id3Header[9] = 0;

  return Buffer.concat([id3Header, ...frames]);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log("Generating UAT fixture files...\n");

  // Ensure directories exist
  const legaleDir = path.join(FIXTURES_DIR, "legale");
  const musicaDir = path.join(FIXTURES_DIR, "musica");
  fs.mkdirSync(legaleDir, { recursive: true });
  fs.mkdirSync(musicaDir, { recursive: true });

  // Generate PDF
  const pdf = generatePDF();
  const pdfPath = path.join(legaleDir, "sample-contratto-affitto.pdf");
  fs.writeFileSync(pdfPath, pdf);
  console.log(`  PDF: ${pdfPath} (${pdf.length} bytes)`);

  // Generate DOCX
  const docx = generateDOCX();
  const docxPath = path.join(legaleDir, "sample-contratto-lavoro.docx");
  fs.writeFileSync(docxPath, docx);
  console.log(`  DOCX: ${docxPath} (${docx.length} bytes)`);

  // Generate MP3
  const mp3 = generateMP3();
  const mp3Path = path.join(musicaDir, "sample-demo.mp3");
  fs.writeFileSync(mp3Path, mp3);
  console.log(`  MP3: ${mp3Path} (${mp3.length} bytes)`);

  console.log("\nDone. All fixture files generated.");
}

main();
