#!/usr/bin/env npx tsx
/**
 * qa-corpus.ts — Corpus Quality Auditor
 *
 * Runs offline quality checks against:
 *   1. The corpus-config JSON (hierarchy gaps, institute coverage, etc.)
 *   2. The raw data source (fetch sample, verify fields)
 *   3. Optionally the live Supabase DB (if env configured)
 *
 * Usage:
 *   npx tsx scripts/qa-corpus.ts --domain=legal
 *   npx tsx scripts/qa-corpus.ts --domain=legal --db     # also check live DB
 *   npx tsx scripts/qa-corpus.ts --domain=legal --fix     # auto-fix config issues
 *
 * Output:
 *   - Console report with severity levels
 *   - JSON report at corpus-configs/{domain}.qa-report.json
 */

import * as fs from "fs";
import * as path from "path";
import type { CorpusConfig, HierarchyRule, InstituteRule } from "../lib/types/corpus-config";

// ─── Types ───

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface QAIssue {
  id: string;
  severity: Severity;
  category: string;
  message: string;
  details?: Record<string, unknown>;
  remediation: string;
}

interface QAReport {
  domain: string;
  configPath: string;
  timestamp: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    score: number; // 0-100
  };
  issues: QAIssue[];
  coverage: {
    hierarchyRanges: number;
    hierarchyGaps: Array<{ from: number; to: number }>;
    hierarchyCoverage: string;
    instituteRanges: number;
    instituteCoverage: string;
    termPatterns: number;
    dataSources: number;
  };
  recommendations: string[];
}

// ─── Known legal structure (ground truth) ───

/** Expected structure of the Italian Civil Code for validation */
const CODICE_CIVILE_STRUCTURE = {
  totalArticles: 2969,
  books: [
    { num: 1, name: "Delle persone e della famiglia", from: 1, to: 455 },
    { num: 2, name: "Delle successioni", from: 456, to: 809 },
    { num: 3, name: "Della proprietà", from: 810, to: 1172 },
    { num: 4, name: "Delle obbligazioni", from: 1173, to: 2059 },
    { num: 5, name: "Del lavoro", from: 2060, to: 2642 },
    { num: 6, name: "Della tutela dei diritti", from: 2643, to: 2969 },
  ],
  /** Important articles that MUST have correct classification */
  landmarkArticles: [
    { num: 1, desc: "Capacità giuridica" },
    { num: 2, desc: "Maggiore età" },
    { num: 832, desc: "Contenuto del diritto di proprietà" },
    { num: 1140, desc: "Possesso" },
    { num: 1173, desc: "Fonti delle obbligazioni" },
    { num: 1218, desc: "Responsabilità del debitore" },
    { num: 1321, desc: "Nozione di contratto" },
    { num: 1322, desc: "Autonomia contrattuale" },
    { num: 1325, desc: "Indicazione dei requisiti" },
    { num: 1350, desc: "Atti che devono farsi per iscritto" },
    { num: 1362, desc: "Interpretazione del contratto" },
    { num: 1372, desc: "Efficacia del contratto" },
    { num: 1376, desc: "Trasferimento della proprietà" },
    { num: 1453, desc: "Risoluzione per inadempimento" },
    { num: 1470, desc: "Nozione di vendita" },
    { num: 1490, desc: "Garanzia per i vizi" },
    { num: 1571, desc: "Nozione di locazione" },
    { num: 1655, desc: "Nozione di appalto" },
    { num: 2043, desc: "Risarcimento per fatto illecito" },
    { num: 2049, desc: "Responsabilità padroni e committenti" },
    { num: 2059, desc: "Danni non patrimoniali" },
    { num: 2082, desc: "Imprenditore" },
    { num: 2247, desc: "Contratto d'opera" },
    { num: 2325, desc: "Nozione di società per azioni" },
    { num: 2462, desc: "Nozione di s.r.l." },
    { num: 2697, desc: "Onere della prova" },
    { num: 2934, desc: "Prescrizione estintiva" },
  ],
  /** Laws that users commonly confuse with Codice Civile */
  commonlyConfusedLaws: [
    { name: "Codice del Consumo", ref: "D.Lgs. 206/2005", note: "Spesso citato come parte del CC ma è legge separata" },
    { name: "Codice di Procedura Civile", ref: "R.D. 1443/1940", note: "Norme processuali, non sostanziali" },
    { name: "Legge sull'equo canone", ref: "L. 392/1978", note: "Locazioni abitative, integra art. 1571+ CC" },
    { name: "Codice delle Assicurazioni", ref: "D.Lgs. 209/2005", note: "Integra art. 1882+ CC" },
    { name: "Testo Unico Bancario", ref: "D.Lgs. 385/1993", note: "Integra disciplina mutuo/credito" },
    { name: "Codice della Crisi", ref: "D.Lgs. 14/2019", note: "Sostituisce legge fallimentare" },
  ],
};

// ─── Parse args ───

function parseArgs(): { domain: string; checkDb: boolean; autoFix: boolean } {
  const args = process.argv.slice(2);
  let domain = "legal";
  let checkDb = false;
  let autoFix = false;

  for (const arg of args) {
    const match = arg.match(/^--domain=(.+)$/);
    if (match) domain = match[1];
    if (arg === "--db") checkDb = true;
    if (arg === "--fix") autoFix = true;
  }

  return { domain, checkDb, autoFix };
}

// ─── Audit functions ───

function auditHierarchy(config: CorpusConfig): QAIssue[] {
  const issues: QAIssue[] = [];
  const rules = config.hierarchy;

  if (rules.length === 0) {
    issues.push({
      id: "HIER-001",
      severity: "critical",
      category: "hierarchy",
      message: "No hierarchy rules defined",
      remediation: "Add hierarchy rules to corpus config covering all article ranges",
    });
    return issues;
  }

  // Sort rules by 'from'
  const sorted = [...rules].sort((a, b) => a.from - b.from);

  // Check for gaps between rules
  const gaps: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = sorted[i].to;
    const nextStart = sorted[i + 1].from;
    if (nextStart > currentEnd + 1) {
      gaps.push({ from: currentEnd + 1, to: nextStart - 1 });
    }
  }

  // Check coverage at start and end
  if (sorted[0].from > 1) {
    gaps.unshift({ from: 1, to: sorted[0].from - 1 });
  }
  if (sorted[sorted.length - 1].to < CODICE_CIVILE_STRUCTURE.totalArticles) {
    gaps.push({
      from: sorted[sorted.length - 1].to + 1,
      to: CODICE_CIVILE_STRUCTURE.totalArticles,
    });
  }

  for (const gap of gaps) {
    const size = gap.to - gap.from + 1;
    const severity: Severity = size > 100 ? "high" : size > 20 ? "medium" : "low";
    issues.push({
      id: `HIER-GAP-${gap.from}-${gap.to}`,
      severity,
      category: "hierarchy_gap",
      message: `Hierarchy gap: articles ${gap.from}-${gap.to} (${size} articles) have no hierarchy rule`,
      details: { from: gap.from, to: gap.to, size },
      remediation: `Add hierarchy rule(s) covering articles ${gap.from}-${gap.to}`,
    });
  }

  // Check for overlapping ranges (not always wrong, but worth noting)
  const overlaps: Array<{ ruleA: HierarchyRule; ruleB: HierarchyRule }> = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].from <= sorted[i].to) {
        overlaps.push({ ruleA: sorted[i], ruleB: sorted[j] });
      }
    }
  }

  if (overlaps.length > 5) {
    issues.push({
      id: "HIER-OVERLAP",
      severity: "info",
      category: "hierarchy_overlap",
      message: `${overlaps.length} overlapping hierarchy ranges detected. Last rule wins — verify this is intentional`,
      details: { count: overlaps.length, sample: overlaps.slice(0, 3) },
      remediation: "Review overlapping ranges to ensure correct classification",
    });
  }

  // Check all 6 books are covered
  for (const book of CODICE_CIVILE_STRUCTURE.books) {
    const coveringRules = rules.filter(
      (r) => r.from <= book.to && r.to >= book.from
    );
    if (coveringRules.length === 0) {
      issues.push({
        id: `HIER-BOOK-${book.num}`,
        severity: "critical",
        category: "hierarchy_missing_book",
        message: `Libro ${book.num} — ${book.name} (art. ${book.from}-${book.to}) has NO hierarchy rules`,
        details: { book },
        remediation: `Add hierarchy rules for Libro ${book.num}`,
      });
    }
  }

  // Calculate coverage percentage
  const coveredArticles = new Set<number>();
  for (const rule of rules) {
    for (let n = rule.from; n <= rule.to; n++) {
      coveredArticles.add(n);
    }
  }
  const coveragePct = (coveredArticles.size / CODICE_CIVILE_STRUCTURE.totalArticles * 100).toFixed(1);

  if (parseFloat(coveragePct) < 80) {
    issues.push({
      id: "HIER-COVERAGE",
      severity: "high",
      category: "hierarchy_coverage",
      message: `Hierarchy coverage: ${coveragePct}% (${coveredArticles.size}/${CODICE_CIVILE_STRUCTURE.totalArticles})`,
      remediation: "Expand hierarchy rules to cover at least 90% of articles",
    });
  }

  return issues;
}

function auditInstitutes(config: CorpusConfig): QAIssue[] {
  const issues: QAIssue[] = [];
  const rules = config.institutes;

  if (rules.length === 0) {
    issues.push({
      id: "INST-001",
      severity: "critical",
      category: "institutes",
      message: "No institute mappings defined",
      remediation: "Add institute rules covering the major legal institutes",
    });
    return issues;
  }

  // Check coverage
  const coveredArticles = new Set<number>();
  for (const rule of rules) {
    for (let n = rule.from; n <= rule.to; n++) {
      coveredArticles.add(n);
    }
  }
  const coveragePct = (coveredArticles.size / CODICE_CIVILE_STRUCTURE.totalArticles * 100).toFixed(1);

  if (parseFloat(coveragePct) < 30) {
    issues.push({
      id: "INST-COVERAGE",
      severity: "medium",
      category: "institute_coverage",
      message: `Institute coverage: ${coveragePct}% — only ${coveredArticles.size} articles have institute mapping`,
      details: { covered: coveredArticles.size, total: CODICE_CIVILE_STRUCTURE.totalArticles },
      remediation: "Add institute mappings for Libro I (persone/famiglia), Libro II (successioni), Libro III (proprietà)",
    });
  }

  // Check landmark articles are covered
  const uncoveredLandmarks = CODICE_CIVILE_STRUCTURE.landmarkArticles.filter(
    (lm) => !coveredArticles.has(lm.num)
  );

  for (const lm of uncoveredLandmarks) {
    issues.push({
      id: `INST-LANDMARK-${lm.num}`,
      severity: "medium",
      category: "institute_missing_landmark",
      message: `Landmark Art. ${lm.num} (${lm.desc}) has no institute mapping`,
      details: { articleNum: lm.num, description: lm.desc },
      remediation: `Add institute rule covering Art. ${lm.num}`,
    });
  }

  // Check for empty keywords
  for (const rule of rules) {
    if (rule.keywords.length === 0) {
      issues.push({
        id: `INST-NOKW-${rule.from}`,
        severity: "low",
        category: "institute_no_keywords",
        message: `Institute rule ${rule.from}-${rule.to} has no keywords`,
        remediation: "Add relevant keywords for this article range",
      });
    }
  }

  return issues;
}

function auditTermPatterns(config: CorpusConfig): QAIssue[] {
  const issues: QAIssue[] = [];

  if (config.termPatterns.length === 0) {
    issues.push({
      id: "TERM-001",
      severity: "high",
      category: "term_patterns",
      message: "No term patterns defined",
      remediation: "Add regex patterns for key legal terms",
    });
    return issues;
  }

  // Validate regex syntax
  for (const { pattern, term } of config.termPatterns) {
    try {
      new RegExp(pattern, "i");
    } catch {
      issues.push({
        id: `TERM-INVALID-${term}`,
        severity: "high",
        category: "term_pattern_invalid",
        message: `Invalid regex pattern for term "${term}": ${pattern}`,
        remediation: "Fix the regex pattern syntax",
      });
    }
  }

  // Check for important missing terms
  const existingTerms = new Set(config.termPatterns.map((t) => t.term));
  const expectedTerms = [
    "vendita_a_corpo", "vendita_a_misura", "caparra_confirmatoria",
    "fideiussione", "ipoteca", "prescrizione", "locazione",
    "appalto", "mandato", "responsabilità_civile", "danno",
    "successione", "testamento", "donazione", "proprietà",
    "possesso", "obbligazione", "contratto",
  ];

  const missingTerms = expectedTerms.filter((t) => !existingTerms.has(t));
  if (missingTerms.length > 0) {
    issues.push({
      id: "TERM-MISSING",
      severity: "low",
      category: "term_pattern_missing",
      message: `Missing term patterns: ${missingTerms.join(", ")}`,
      details: { missing: missingTerms },
      remediation: "Add patterns for commonly searched legal terms",
    });
  }

  return issues;
}

function auditDataSources(config: CorpusConfig): QAIssue[] {
  const issues: QAIssue[] = [];

  if (config.dataSources.length === 0) {
    issues.push({
      id: "SRC-001",
      severity: "critical",
      category: "data_sources",
      message: "No data sources configured",
      remediation: "Add at least one data source to corpus config",
    });
    return issues;
  }

  for (const src of config.dataSources) {
    // Check field mapping
    if (!src.fieldMapping.id || !src.fieldMapping.text) {
      issues.push({
        id: `SRC-FMAP-${src.name}`,
        severity: "critical",
        category: "source_field_mapping",
        message: `Source "${src.name}" has incomplete field mapping (missing id or text)`,
        remediation: "Add complete field mapping with id, title, text fields",
      });
    }

    // Check lawSource
    if (!src.lawSource) {
      issues.push({
        id: `SRC-LAWSRC-${src.name}`,
        severity: "high",
        category: "source_law_source",
        message: `Source "${src.name}" has no lawSource label`,
        remediation: "Set lawSource (e.g. 'Codice Civile', 'D.Lgs. 206/2005')",
      });
    }
  }

  // Check for missing important sources
  const lawSources = new Set(config.dataSources.map((s) => s.lawSource));

  if (config.domain === "legal") {
    if (!lawSources.has("Codice Civile")) {
      issues.push({
        id: "SRC-MISSING-CC",
        severity: "critical",
        category: "source_missing",
        message: "Codice Civile not present in data sources",
        remediation: "Add Codice Civile as primary data source",
      });
    }

    // Recommend additional sources
    for (const law of CODICE_CIVILE_STRUCTURE.commonlyConfusedLaws) {
      if (!lawSources.has(law.ref) && !lawSources.has(law.name)) {
        issues.push({
          id: `SRC-RECOMMEND-${law.ref.replace(/[^a-zA-Z0-9]/g, "")}`,
          severity: "info",
          category: "source_recommended",
          message: `${law.name} (${law.ref}) not in corpus — ${law.note}`,
          details: { law },
          remediation: `Run connector workflow: ./scripts/run-connector.sh ${law.name.toLowerCase().replace(/\s+/g, "-")} legal`,
        });
      }
    }
  }

  return issues;
}

function auditCrossValidation(config: CorpusConfig): QAIssue[] {
  const issues: QAIssue[] = [];

  // Check hierarchy vs institutes consistency
  const hierCovered = new Set<number>();
  for (const rule of config.hierarchy) {
    for (let n = rule.from; n <= rule.to; n++) hierCovered.add(n);
  }

  const instCovered = new Set<number>();
  for (const rule of config.institutes) {
    for (let n = rule.from; n <= rule.to; n++) instCovered.add(n);
  }

  // Articles with institute but no hierarchy
  const instNoHier: number[] = [];
  for (const n of instCovered) {
    if (!hierCovered.has(n)) instNoHier.push(n);
  }

  if (instNoHier.length > 0) {
    issues.push({
      id: "XVAL-INST-NO-HIER",
      severity: "medium",
      category: "cross_validation",
      message: `${instNoHier.length} articles have institute mapping but no hierarchy (range: ${Math.min(...instNoHier)}-${Math.max(...instNoHier)})`,
      details: { sample: instNoHier.slice(0, 10) },
      remediation: "Add hierarchy rules to cover these articles",
    });
  }

  // Check hierarchy rules reference valid book names
  const bookNames = new Set(
    CODICE_CIVILE_STRUCTURE.books.map((b) => `Libro ${toRoman(b.num)}`)
  );

  for (const rule of config.hierarchy) {
    const bookField = rule.hierarchy.book;
    // Extract "Libro X" from the book name
    const bookMatch = bookField.match(/^Libro\s+([IVX]+)/);
    if (bookMatch) {
      const bookRef = `Libro ${bookMatch[1]}`;
      if (!bookNames.has(bookRef)) {
        issues.push({
          id: `XVAL-BOOK-${rule.from}`,
          severity: "low",
          category: "cross_validation",
          message: `Hierarchy rule ${rule.from}-${rule.to} references unknown book: "${bookField}"`,
          remediation: "Verify the book name matches the Civil Code structure",
        });
      }
    }
  }

  return issues;
}

async function auditDataSourceSample(config: CorpusConfig): Promise<QAIssue[]> {
  const issues: QAIssue[] = [];

  for (const src of config.dataSources) {
    if (src.type !== "huggingface" || !src.dataset) continue;

    try {
      const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(src.dataset)}&config=default&split=train&offset=0&length=20`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (!data.rows || data.rows.length === 0) {
        issues.push({
          id: `SRC-EMPTY-${src.name}`,
          severity: "critical",
          category: "source_empty",
          message: `Source "${src.name}" returned 0 rows from HuggingFace`,
          remediation: "Verify the dataset ID and check HuggingFace availability",
        });
        continue;
      }

      const totalRows = data.num_rows_total;
      issues.push({
        id: `SRC-INFO-${src.name}`,
        severity: "info",
        category: "source_info",
        message: `Source "${src.name}": ${totalRows} total rows in dataset`,
        details: { totalRows, sampleFields: Object.keys(data.rows[0].row) },
        remediation: "N/A",
      });

      // Check sample quality
      let emptyCount = 0;
      let shortCount = 0;
      let noTitleCount = 0;
      let noIdCount = 0;

      for (const item of data.rows) {
        const row = item.row;
        const text = String(row[src.fieldMapping.text] ?? "");
        const title = row[src.fieldMapping.title];
        const id = row[src.fieldMapping.id];

        if (!text || text.length < 10) emptyCount++;
        else if (text.length < 50) shortCount++;
        if (!title) noTitleCount++;
        if (!id) noIdCount++;
      }

      const sampleSize = data.rows.length;

      if (emptyCount > 0) {
        issues.push({
          id: `SRC-EMPTY-TEXT-${src.name}`,
          severity: "high",
          category: "source_empty_text",
          message: `${emptyCount}/${sampleSize} sample articles have empty/very short text (<10 chars)`,
          details: { emptyCount, sampleSize },
          remediation: "Check data source for missing article text; may need alternative source",
        });
      }

      if (shortCount > 0) {
        issues.push({
          id: `SRC-SHORT-TEXT-${src.name}`,
          severity: "medium",
          category: "source_short_text",
          message: `${shortCount}/${sampleSize} sample articles have short text (10-50 chars)`,
          remediation: "Verify these articles are complete; may be abrogated or placeholder",
        });
      }

      if (noTitleCount > sampleSize * 0.5) {
        issues.push({
          id: `SRC-NO-TITLE-${src.name}`,
          severity: "medium",
          category: "source_no_title",
          message: `${noTitleCount}/${sampleSize} sample articles have no title`,
          remediation: "Titles improve search quality; consider enriching from Normattiva",
        });
      }

    } catch (err) {
      issues.push({
        id: `SRC-FETCH-ERR-${src.name}`,
        severity: "high",
        category: "source_fetch_error",
        message: `Failed to fetch sample from "${src.name}": ${err instanceof Error ? err.message : String(err)}`,
        remediation: "Check network connectivity and dataset availability",
      });
    }
  }

  return issues;
}

// ─── Report generation ───

function computeScore(issues: QAIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    switch (issue.severity) {
      case "critical": score -= 15; break;
      case "high": score -= 8; break;
      case "medium": score -= 4; break;
      case "low": score -= 1; break;
      // info doesn't reduce score
    }
  }
  return Math.max(0, score);
}

function generateRecommendations(issues: QAIssue[], config: CorpusConfig): string[] {
  const recs: string[] = [];
  const categories = new Set(issues.map((i) => i.category));

  if (categories.has("hierarchy_gap") || categories.has("hierarchy_missing_book")) {
    recs.push(
      "PRIORITÀ ALTA: Espandere hierarchy rules per coprire tutti i 6 Libri del Codice Civile. " +
      "Attualmente ci sono gap significativi. Eseguire il workflow remediate per generare le regole mancanti."
    );
  }

  if (categories.has("institute_coverage") || categories.has("institute_missing_landmark")) {
    recs.push(
      "PRIORITÀ MEDIA: Aggiungere institute mapping per Libri I, II, III. " +
      "Attualmente solo gli articoli del Libro IV e V hanno istituti giuridici assegnati."
    );
  }

  if (categories.has("source_recommended")) {
    const missingLaws = issues
      .filter((i) => i.category === "source_recommended")
      .map((i) => (i.details?.law as { name: string })?.name)
      .filter(Boolean);
    if (missingLaws.length > 0) {
      recs.push(
        `CRESCITA CORPUS: Integrare fonti legislative complementari: ${missingLaws.join(", ")}. ` +
        "Usare il connector workflow per ciascuna fonte."
      );
    }
  }

  if (categories.has("source_empty_text")) {
    recs.push(
      "QUALITÀ DATI: Alcuni articoli nel dataset hanno testo vuoto o molto corto. " +
      "Considerare una fonte alternativa (Normattiva) per integrare gli articoli mancanti."
    );
  }

  if (config.dataSources.length === 1) {
    recs.push(
      "RESILIENZA: Il corpus dipende da una singola fonte dati. " +
      "Aggiungere almeno una fonte alternativa (es. Normattiva) per cross-validazione."
    );
  }

  return recs;
}

function printReport(report: QAReport): void {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  CORPUS QUALITY AUDIT REPORT                               ║");
  console.log(`║  Domain: ${report.domain.padEnd(53)}║`);
  console.log(`║  Score:  ${String(report.summary.score + "/100").padEnd(53)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Critical: ${String(report.summary.critical).padStart(3)}  │  High: ${String(report.summary.high).padStart(3)}  │  Medium: ${String(report.summary.medium).padStart(3)}  │  Low: ${String(report.summary.low).padStart(3)}  ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  console.log("\n─── Coverage ───\n");
  console.log(`  Hierarchy rules:   ${report.coverage.hierarchyRanges} ranges → ${report.coverage.hierarchyCoverage} coverage`);
  console.log(`  Institute rules:   ${report.coverage.instituteRanges} ranges → ${report.coverage.instituteCoverage} coverage`);
  console.log(`  Term patterns:     ${report.coverage.termPatterns}`);
  console.log(`  Data sources:      ${report.coverage.dataSources}`);
  if (report.coverage.hierarchyGaps.length > 0) {
    console.log(`  Hierarchy gaps:    ${report.coverage.hierarchyGaps.length}`);
    for (const gap of report.coverage.hierarchyGaps.slice(0, 5)) {
      console.log(`    • Art. ${gap.from}-${gap.to} (${gap.to - gap.from + 1} articoli)`);
    }
    if (report.coverage.hierarchyGaps.length > 5) {
      console.log(`    ... e altri ${report.coverage.hierarchyGaps.length - 5} gap`);
    }
  }

  // Print issues by severity
  const bySeverity: Record<Severity, QAIssue[]> = {
    critical: [], high: [], medium: [], low: [], info: [],
  };
  for (const issue of report.issues) {
    bySeverity[issue.severity].push(issue);
  }

  for (const sev of ["critical", "high", "medium", "low"] as Severity[]) {
    if (bySeverity[sev].length === 0) continue;
    const icon = sev === "critical" ? "🔴" : sev === "high" ? "🟠" : sev === "medium" ? "🟡" : "🔵";
    console.log(`\n─── ${icon} ${sev.toUpperCase()} (${bySeverity[sev].length}) ───\n`);
    for (const issue of bySeverity[sev]) {
      console.log(`  [${issue.id}] ${issue.message}`);
      console.log(`    → ${issue.remediation}`);
    }
  }

  if (bySeverity.info.length > 0) {
    console.log(`\n─── ℹ️  INFO (${bySeverity.info.length}) ───\n`);
    for (const issue of bySeverity.info) {
      console.log(`  [${issue.id}] ${issue.message}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log("\n─── RACCOMANDAZIONI ───\n");
    for (let i = 0; i < report.recommendations.length; i++) {
      console.log(`  ${i + 1}. ${report.recommendations[i]}`);
    }
  }

  console.log("\n");
}

// ─── Utility ───

function toRoman(num: number): string {
  const map: [number, string][] = [
    [6, "VI"], [5, "V"], [4, "IV"], [3, "III"], [2, "II"], [1, "I"],
  ];
  for (const [val, roman] of map) {
    if (num === val) return roman;
  }
  return String(num);
}

// ─── Main ───

async function main() {
  const { domain, checkDb } = parseArgs();

  console.log("\n[QA] Starting corpus quality audit...");
  console.log(`[QA] Domain: ${domain}`);

  // Load config
  const configPath = path.resolve(__dirname, `../corpus-configs/${domain}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`\n❌ Config non trovata: ${configPath}\n`);
    process.exit(1);
  }

  const config: CorpusConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  console.log(`[QA] Config: ${config.name}`);

  // Run all audits
  const allIssues: QAIssue[] = [];

  console.log("[QA] Checking hierarchy...");
  allIssues.push(...auditHierarchy(config));

  console.log("[QA] Checking institutes...");
  allIssues.push(...auditInstitutes(config));

  console.log("[QA] Checking term patterns...");
  allIssues.push(...auditTermPatterns(config));

  console.log("[QA] Checking data sources...");
  allIssues.push(...auditDataSources(config));

  console.log("[QA] Cross-validating...");
  allIssues.push(...auditCrossValidation(config));

  console.log("[QA] Fetching data source sample...");
  allIssues.push(...await auditDataSourceSample(config));

  // Compute coverage
  const hierCovered = new Set<number>();
  for (const rule of config.hierarchy) {
    for (let n = rule.from; n <= rule.to; n++) hierCovered.add(n);
  }
  const instCovered = new Set<number>();
  for (const rule of config.institutes) {
    for (let n = rule.from; n <= rule.to; n++) instCovered.add(n);
  }

  const hierarchyGaps: Array<{ from: number; to: number }> = [];
  const sorted = [...config.hierarchy].sort((a, b) => a.from - b.from);
  if (sorted.length > 0) {
    if (sorted[0].from > 1) hierarchyGaps.push({ from: 1, to: sorted[0].from - 1 });
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1].from > sorted[i].to + 1) {
        hierarchyGaps.push({ from: sorted[i].to + 1, to: sorted[i + 1].from - 1 });
      }
    }
    if (sorted[sorted.length - 1].to < CODICE_CIVILE_STRUCTURE.totalArticles) {
      hierarchyGaps.push({ from: sorted[sorted.length - 1].to + 1, to: CODICE_CIVILE_STRUCTURE.totalArticles });
    }
  }

  // Build report
  const report: QAReport = {
    domain,
    configPath,
    timestamp: new Date().toISOString(),
    summary: {
      total: allIssues.length,
      critical: allIssues.filter((i) => i.severity === "critical").length,
      high: allIssues.filter((i) => i.severity === "high").length,
      medium: allIssues.filter((i) => i.severity === "medium").length,
      low: allIssues.filter((i) => i.severity === "low").length,
      info: allIssues.filter((i) => i.severity === "info").length,
      score: computeScore(allIssues),
    },
    issues: allIssues,
    coverage: {
      hierarchyRanges: config.hierarchy.length,
      hierarchyGaps,
      hierarchyCoverage: `${(hierCovered.size / CODICE_CIVILE_STRUCTURE.totalArticles * 100).toFixed(1)}%`,
      instituteRanges: config.institutes.length,
      instituteCoverage: `${(instCovered.size / CODICE_CIVILE_STRUCTURE.totalArticles * 100).toFixed(1)}%`,
      termPatterns: config.termPatterns.length,
      dataSources: config.dataSources.length,
    },
    recommendations: generateRecommendations(allIssues, config),
  };

  // Print and save
  printReport(report);

  const reportPath = path.resolve(__dirname, `../corpus-configs/${domain}.qa-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[QA] Report saved to: ${reportPath}\n`);

  // Exit with error code if critical issues found
  if (report.summary.critical > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("\n❌ QA Audit failed:", err);
  process.exit(1);
});
