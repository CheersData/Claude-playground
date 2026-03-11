/**
 * Routing Registry — Parser e validatore per i decision tree YAML.
 *
 * Single source of truth: legge i file YAML in company/protocols/decision-trees/
 * e valida che il campo --routing dei task corrisponda a combinazioni reali.
 *
 * Consultati: Protocols (governance), Architecture (soluzione tecnica).
 * Approvazione: L3 boss (richiesta diretta).
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// ─── Types ───────────────────────────────────────────────────────────

export interface RoutingCategory {
  condition: string;
  type: "operativo" | "strategico" | "critico";
  approval: string; // "L1" | "L2" | "L3" | "L4" | "L1_immediate"
  consult: string[];
  execute: string[];
  review?: string[];
  requirement?: string;
  example?: string;
  note?: string;
}

export interface DecisionTree {
  name: string;
  description: string;
  trigger: string;
  categories: Map<string, RoutingCategory>;
}

export interface RoutingValidation {
  valid: boolean;
  tree?: string;
  category?: string;
  node?: RoutingCategory;
  error?: string;
  validOptions?: string[];
}

export interface RoutingClassification {
  treeName: string;
  treeDescription: string;
  score: number;
  categories: Array<{
    key: string;
    routing: string; // "tree:category"
    condition: string;
    type: string;
    approval: string;
    consult: string[];
  }>;
}

// ─── Registry ────────────────────────────────────────────────────────

const DECISION_TREES_DIR = path.resolve(
  __dirname,
  "../../company/protocols/decision-trees"
);

let _cache: Map<string, DecisionTree> | null = null;

/**
 * Carica e parsa tutti i decision tree YAML.
 * Cached in memoria per la durata del processo.
 */
export function loadDecisionTrees(): Map<string, DecisionTree> {
  if (_cache) return _cache;

  _cache = new Map();

  if (!fs.existsSync(DECISION_TREES_DIR)) {
    console.warn(
      `[routing] Directory decision trees non trovata: ${DECISION_TREES_DIR}`
    );
    return _cache;
  }

  const files = fs
    .readdirSync(DECISION_TREES_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  for (const file of files) {
    try {
      const content = fs.readFileSync(
        path.join(DECISION_TREES_DIR, file),
        "utf-8"
      );
      const raw = yaml.load(content) as Record<string, unknown>;

      if (!raw || !raw.name || !raw.routing) continue;

      const name = raw.name as string;
      const routing = raw.routing as Record<string, Record<string, unknown>>;
      const categories = new Map<string, RoutingCategory>();

      for (const [key, value] of Object.entries(routing)) {
        categories.set(key, {
          condition: (value.condition as string) ?? "",
          type: (value.type as RoutingCategory["type"]) ?? "operativo",
          approval: (value.approval as string) ?? "L2",
          consult: (value.consult as string[]) ?? [],
          execute: (value.execute as string[]) ?? [],
          review: (value.review as string[]) ?? undefined,
          requirement: (value.requirement as string) ?? undefined,
          example: (value.example as string) ?? undefined,
          note: (value.note as string) ?? undefined,
        });
      }

      _cache.set(name, {
        name,
        description: (raw.description as string) ?? "",
        trigger: (raw.trigger as string) ?? "",
        categories,
      });
    } catch (err) {
      console.warn(
        `[routing] Errore parsing ${file}: ${(err as Error).message}`
      );
    }
  }

  return _cache;
}

/**
 * Valida una stringa di routing "tree:category" contro i YAML reali.
 * Normalizza underscore/trattini (accetta entrambi).
 */
export function validateRouting(routing: string): RoutingValidation {
  const trees = loadDecisionTrees();

  // Check formato tree:category
  const colonIdx = routing.indexOf(":");
  if (colonIdx === -1) {
    return {
      valid: false,
      error: `Formato invalido: "${routing}". Atteso: "tree:category" (es. "feature-request:medium")`,
      validOptions: getAllValidRoutings(),
    };
  }

  const treeName = routing.slice(0, colonIdx);
  const category = routing.slice(colonIdx + 1);

  if (!treeName || !category) {
    return {
      valid: false,
      error: `Formato invalido: "${routing}". Tree e category non possono essere vuoti.`,
      validOptions: getAllValidRoutings(),
    };
  }

  // Check tree esiste
  const tree = trees.get(treeName);
  if (!tree) {
    return {
      valid: false,
      error: `Tree "${treeName}" non esiste.`,
      validOptions: [...trees.keys()],
    };
  }

  // Check category esiste (normalizza: accetta sia underscore che trattino)
  let node = tree.categories.get(category);
  if (!node) {
    // Prova con underscore <-> trattino
    const alt = category.includes("-")
      ? category.replace(/-/g, "_")
      : category.replace(/_/g, "-");
    node = tree.categories.get(alt);
  }

  if (!node) {
    return {
      valid: false,
      error: `Categoria "${category}" non esiste in tree "${treeName}".`,
      validOptions: [...tree.categories.keys()].map(
        (c) => `${treeName}:${c}`
      ),
    };
  }

  return { valid: true, tree: treeName, category, node };
}

/**
 * Ritorna tutte le combinazioni tree:category valide.
 */
export function getAllValidRoutings(): string[] {
  const trees = loadDecisionTrees();
  const result: string[] = [];

  for (const [treeName, tree] of trees) {
    for (const cat of tree.categories.keys()) {
      result.push(`${treeName}:${cat}`);
    }
  }

  return result.sort();
}

/**
 * Dato un testo di richiesta, suggerisce i tree che matchano
 * basandosi sulle keyword del campo trigger nei YAML.
 */
export function classifyRequest(text: string): RoutingClassification[] {
  const trees = loadDecisionTrees();
  const words = text
    .toLowerCase()
    .split(/[\s,.'"+\-/]+/)
    .filter((w) => w.length > 2);

  const matches: RoutingClassification[] = [];

  for (const [name, tree] of trees) {
    const triggers = tree.trigger
      .toLowerCase()
      .split(",")
      .map((t) => t.trim());

    let score = 0;
    for (const word of words) {
      for (const trigger of triggers) {
        if (trigger.includes(word)) score++;
      }
      // Match anche su description
      if (tree.description.toLowerCase().includes(word)) score += 0.5;
    }

    if (score > 0) {
      matches.push({
        treeName: name,
        treeDescription: tree.description,
        score,
        categories: [...tree.categories.entries()].map(([key, cat]) => ({
          key,
          routing: `${name}:${key}`,
          condition: cat.condition,
          type: cat.type,
          approval: cat.approval,
          consult: cat.consult,
        })),
      });
    }
  }

  // Sort per score decrescente
  matches.sort((a, b) => b.score - a.score);

  return matches;
}
