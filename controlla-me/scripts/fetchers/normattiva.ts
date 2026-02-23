/**
 * Fetcher Normattiva — Re-export dal fetcher API-first.
 *
 * Questo file mantiene la compatibilità con il vecchio import (seed-corpus.ts).
 * Il fetcher effettivo è in normattiva-api.ts (API OpenData + fallback HTML).
 */

export { fetchNormattiva } from "./normattiva-api";
