/**
 * Profilo: Corpus Legislativo — 14 fonti (8 IT + 6 EU).
 *
 * Questo è il profilo base usato da controlla.me per il RAG legale.
 * Include codici italiani (Normattiva/HuggingFace) e regolamenti EU (EUR-Lex).
 *
 * Uso:
 *   npx tsx scripts/loader.ts --profile corpus-legislativo
 *   npm run loader:corpus
 */

import {
  NORMATTIVA_SOURCES,
  EURLEX_SOURCES,
  HUGGINGFACE_SOURCES,
  type CorpusSource,
} from "../corpus-sources";
import type { LoaderProfile } from "../lib/types";

const profile: LoaderProfile = {
  id: "corpus-legislativo",
  name: "Corpus Legislativo",
  description: "14 fonti legislative: 8 IT (Normattiva/HuggingFace) + 6 EU (EUR-Lex)",
  getSources: (): CorpusSource[] => [
    ...HUGGINGFACE_SOURCES,
    ...NORMATTIVA_SOURCES,
    ...EURLEX_SOURCES,
  ],
};

export default profile;
