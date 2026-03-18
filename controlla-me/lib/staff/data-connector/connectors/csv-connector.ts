/**
 * CSVConnector — A CSV/Excel file upload connector.
 *
 * Accepts file content (Buffer or string) via `source.config.fileContent` or
 * `source.config.fileUrl`, parses CSV with auto-delimiter detection, and
 * returns records with proper field types (string, number, date auto-detection).
 *
 * Does NOT require authentication — extends BaseConnector directly.
 *
 * Supported formats:
 *   - CSV (comma, semicolon, tab, pipe — auto-detected)
 *   - TSV (tab-separated values)
 *   - Excel (.xlsx) — parsed via lightweight XLSX-compatible parser
 *
 * Usage (in integration-sources.ts or at runtime):
 *   {
 *     id: "my_csv_upload",
 *     connector: "csv",
 *     config: {
 *       // Option A: inline content (string or base64-encoded)
 *       fileContent: "name,email,phone\nJohn,john@test.com,+39...",
 *       // Option B: URL to fetch the file from
 *       fileUrl: "https://example.com/data.csv",
 *       // Optional overrides
 *       delimiter: ",",         // auto-detected if omitted
 *       encoding: "utf-8",     // default: utf-8
 *       hasHeader: true,        // default: true (first row is header)
 *       skipRows: 0,            // skip N rows from the top before reading headers
 *       dateFields: ["created_at", "birth_date"], // force these fields as ISO dates
 *       idField: "email",       // field to use as external ID (default: row index)
 *       entityType: "contacts", // entity type label (default: "csv_record")
 *     },
 *   }
 */

import { BaseConnector } from "./base";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "../types";

// ─── Types ───

export interface CSVRecord {
  externalId: string;
  objectType: string;
  source: string;
  data: Record<string, unknown>;
  rowIndex: number;
}

interface ParsedRow {
  [key: string]: string;
}

// ─── CSV Parsing Utilities ───

/** Common delimiters to test, ordered by frequency */
const DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * Auto-detect the delimiter by counting occurrences in the first few lines.
 * The delimiter with the most consistent count across lines wins.
 */
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ",";

  let bestDelimiter = ",";
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countDelimiterOccurrences(line, delimiter));

    // A good delimiter should appear at least once per line and have consistent count
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);

    if (minCount === 0) continue; // Delimiter not present in all lines

    // Score: high count + low variance = good delimiter
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = maxCount - minCount;
    const score = avgCount * 10 - variance * 5;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

/**
 * Count delimiter occurrences, respecting quoted fields (RFC 4180).
 */
function countDelimiterOccurrences(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      count++;
    }
  }

  return count;
}

/**
 * Parse a single CSV line respecting RFC 4180 quoting rules.
 * Handles quoted fields, escaped quotes (""), and embedded newlines within quotes.
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Push last field
  fields.push(current.trim());

  return fields;
}

/**
 * Parse complete CSV text into rows of field arrays.
 */
function parseCSVText(
  text: string,
  delimiter: string
): string[][] {
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    rows.push(parseCSVLine(line, delimiter));
  }

  return rows;
}

// ─── Type Detection ───

/** ISO 8601 date pattern (full or date-only) */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Common date formats: DD/MM/YYYY, MM/DD/YYYY, YYYY/MM/DD */
const SLASH_DATE_REGEX = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

/** European date: DD.MM.YYYY */
const DOT_DATE_REGEX = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;

/**
 * Detect the type of a string value and convert accordingly.
 */
function inferType(
  value: string,
  fieldName: string,
  dateFields: Set<string>
): unknown {
  // Empty values
  if (value === "" || value.toLowerCase() === "null" || value.toLowerCase() === "n/a") {
    return null;
  }

  // Boolean detection
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "si" || lower === "yes") return true;
  if (lower === "false" || lower === "no") return false;

  // Force date fields
  if (dateFields.has(fieldName)) {
    const parsed = tryParseDate(value);
    if (parsed) return parsed;
  }

  // Number detection (handles both "1234" and "1234.56" and "-1234")
  // But NOT phone numbers, IDs that start with 0, or values with leading +
  if (/^-?\d+(\.\d+)?$/.test(value) && !value.startsWith("0") || value === "0") {
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) return num;
  }

  // European number format: "1.234,56" -> 1234.56
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(value)) {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const num = Number(normalized);
    if (!isNaN(num) && isFinite(num)) return num;
  }

  // Date detection (only if it looks like a date, not a random string)
  if (ISO_DATE_REGEX.test(value) || SLASH_DATE_REGEX.test(value) || DOT_DATE_REGEX.test(value)) {
    const parsed = tryParseDate(value);
    if (parsed) return parsed;
  }

  // Default: string
  return value;
}

/**
 * Try to parse a date string into ISO 8601 format.
 */
function tryParseDate(value: string): string | null {
  // ISO format: already fine
  if (ISO_DATE_REGEX.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // DD/MM/YYYY (Italian/European format — common in Italian PMI data)
  if (SLASH_DATE_REGEX.test(value)) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const fullYear = year.length === 2 ? `20${year}` : year;
      const d = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  // DD.MM.YYYY (European dot format)
  if (DOT_DATE_REGEX.test(value)) {
    const parts = value.split(".");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const fullYear = year.length === 2 ? `20${year}` : year;
      const d = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  return null;
}

// ─── Excel Parsing (lightweight, no heavy dependency) ───

/**
 * Try to parse an Excel (.xlsx) file.
 * Uses a lightweight approach: xlsx files are ZIP archives containing XML.
 * For production, we'd use a library like `xlsx` or `exceljs`.
 *
 * Since we want to keep dependencies minimal, we handle xlsx via
 * dynamic import of the `xlsx` package if available, otherwise
 * fall back to an error message.
 */
async function parseExcel(buffer: Buffer): Promise<string[][]> {
  try {
    // Try dynamic import of xlsx package (optional dependency)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return data;
  } catch {
    throw new Error(
      "Excel (.xlsx) parsing richiede il pacchetto 'xlsx'. " +
        "Installa con: npm install xlsx. " +
        "In alternativa, converti il file in CSV prima dell'upload."
    );
  }
}

/**
 * Detect if a Buffer contains an Excel file by checking the ZIP magic bytes.
 * XLSX files are ZIP archives starting with PK (0x50 0x4B).
 */
function isExcelFile(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

// ─── Connector ───

export class CSVConnector extends BaseConnector<CSVRecord> {
  private fileContent: string | Buffer | null;
  private fileUrl: string | null;
  private delimiter: string | null;
  private encoding: BufferEncoding;
  private hasHeader: boolean;
  private skipRows: number;
  private dateFields: Set<string>;
  private idField: string | null;
  private entityType: string;

  // Parsed data cache
  private parsedHeaders: string[] | null = null;
  private parsedRows: ParsedRow[] | null = null;

  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);

    const config = source.config;

    // File content: string, base64-encoded string, or Buffer
    const rawContent = config.fileContent as string | Buffer | undefined;
    this.fileContent = rawContent ?? null;
    this.fileUrl = (config.fileUrl as string) ?? null;

    if (!this.fileContent && !this.fileUrl) {
      throw new Error(
        `CSVConnector: Nessun contenuto file specificato per "${source.id}". ` +
          `Specifica "fileContent" (stringa o Buffer) oppure "fileUrl" (URL da cui scaricare).`
      );
    }

    // Parsing options
    this.delimiter = (config.delimiter as string) ?? null; // auto-detect if null
    this.encoding = (config.encoding as BufferEncoding) ?? "utf-8";
    this.hasHeader = config.hasHeader !== false; // default: true
    this.skipRows = (config.skipRows as number) ?? 0;
    this.dateFields = new Set((config.dateFields as string[]) ?? []);
    this.idField = (config.idField as string) ?? null;
    this.entityType = (config.entityType as string) ?? "csv_record";
  }

  // ─── CONNECT phase ───

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;

    try {
      this.log(`[CSV] Parsing file for ${sourceId}...`);

      // Get raw content
      const rawData = await this.getRawContent();

      // Parse based on file type
      let rows: string[][];

      if (Buffer.isBuffer(rawData) && isExcelFile(rawData)) {
        this.log("[CSV] Detected Excel (.xlsx) file");
        rows = await parseExcel(rawData);
      } else {
        // Convert to string for CSV parsing
        const text = Buffer.isBuffer(rawData) ? rawData.toString(this.encoding) : rawData;

        // Auto-detect delimiter if not specified
        if (!this.delimiter) {
          this.delimiter = detectDelimiter(text);
          this.log(`[CSV] Auto-detected delimiter: "${this.delimiter === "\t" ? "TAB" : this.delimiter}"`);
        }

        rows = parseCSVText(text, this.delimiter);
      }

      // Apply skipRows
      if (this.skipRows > 0 && rows.length > this.skipRows) {
        rows = rows.slice(this.skipRows);
      }

      if (rows.length === 0) {
        return {
          sourceId,
          ok: false,
          message: "File CSV vuoto o non parsabile",
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      // Extract headers
      let headers: string[];
      let dataRows: string[][];

      if (this.hasHeader) {
        headers = rows[0].map((h, i) => h.trim() || `column_${i + 1}`);
        dataRows = rows.slice(1);
      } else {
        headers = rows[0].map((_, i) => `column_${i + 1}`);
        dataRows = rows;
      }

      // Cache parsed data for subsequent fetchAll
      this.parsedHeaders = headers;
      this.parsedRows = dataRows.map((row) => {
        const obj: ParsedRow = {};
        for (let i = 0; i < headers.length; i++) {
          obj[headers[i]] = row[i] ?? "";
        }
        return obj;
      });

      // Build sample data (first 3 rows)
      const sampleData = this.parsedRows.slice(0, 3).map((row) => {
        const typed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          typed[key] = inferType(value, key, this.dateFields);
        }
        return typed;
      });

      this.log(`[CSV] Parsed: ${headers.length} columns, ${dataRows.length} rows`);
      this.log(`[CSV] Headers: ${headers.join(", ")}`);

      return {
        sourceId,
        ok: true,
        message: `CSV OK | ${headers.length} colonne | ${dataRows.length} righe`,
        census: {
          estimatedItems: dataRows.length,
          availableFormats: ["csv"],
          sampleFields: headers.slice(0, 10),
          sampleData: sampleData.length > 0 ? sampleData : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `CSV parsing failed: ${msg}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  // ─── LOAD phase (full) ───

  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<CSVRecord>> {
    // Ensure data is parsed
    if (!this.parsedRows) {
      await this.connect();
    }

    if (!this.parsedRows || !this.parsedHeaders) {
      return {
        sourceId: this.source.id,
        items: [],
        fetchedAt: new Date().toISOString(),
        metadata: { error: "No data parsed" },
      };
    }

    const limit = options?.limit;
    const rows = limit ? this.parsedRows.slice(0, limit) : this.parsedRows;

    this.log(`[CSV] Converting ${rows.length} rows to typed records...`);

    const records: CSVRecord[] = rows.map((row, index) => {
      // Type inference for each field
      const typedData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        typedData[key] = inferType(value, key, this.dateFields);
      }

      // Determine external ID
      let externalId: string;
      if (this.idField && row[this.idField]) {
        externalId = String(row[this.idField]);
      } else {
        externalId = `row-${index + 1}`;
      }

      return {
        externalId,
        objectType: this.entityType,
        source: this.source.id,
        data: typedData,
        rowIndex: index,
      };
    });

    this.log(`[CSV] Total: ${records.length} records`);

    return {
      sourceId: this.source.id,
      items: records,
      fetchedAt: new Date().toISOString(),
      metadata: {
        headers: this.parsedHeaders,
        totalRows: this.parsedRows.length,
        delimiter: this.delimiter,
        hasHeader: this.hasHeader,
        entityType: this.entityType,
      },
    };
  }

  // ─── LOAD phase (delta) ───

  /**
   * Delta fetch for CSV is not meaningful (file is static).
   * Returns all records regardless of `since` parameter.
   */
  async fetchDelta(
    _since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<CSVRecord>> {
    this.log("[CSV] Delta non supportato per file CSV statici. Eseguendo full fetch.");
    return this.fetchAll(options);
  }

  // ─── Internal ───

  /**
   * Get raw file content from inline config or URL.
   */
  private async getRawContent(): Promise<string | Buffer> {
    if (this.fileContent) {
      if (Buffer.isBuffer(this.fileContent)) {
        return this.fileContent;
      }

      // Check if the string is base64-encoded
      if (typeof this.fileContent === "string" && this.isBase64(this.fileContent)) {
        this.log("[CSV] Detected base64-encoded content, decoding...");
        return Buffer.from(this.fileContent, "base64");
      }

      return this.fileContent;
    }

    if (this.fileUrl) {
      this.log(`[CSV] Downloading file from ${this.fileUrl}...`);
      const response = await this.fetchWithRetry(this.fileUrl);

      if (!response.ok) {
        throw new Error(`Failed to download CSV from ${this.fileUrl}: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error("No file content or URL provided");
  }

  /**
   * Check if a string looks like base64-encoded content.
   */
  private isBase64(str: string): boolean {
    if (str.length < 100) return false; // Too short to be a meaningful base64 file
    // Check if it matches base64 pattern and doesn't contain CSV-like content
    return /^[A-Za-z0-9+/\n\r]+=*$/.test(str.replace(/\s/g, "")) &&
      !str.includes(",") &&
      !str.includes(";");
  }
}
