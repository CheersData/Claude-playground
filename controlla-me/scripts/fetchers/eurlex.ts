/**
 * Fetcher EUR-Lex — Re-export dal fetcher CELLAR API-first.
 *
 * Questo file mantiene la compatibilità con il vecchio import.
 * Il fetcher effettivo è in eurlex-cellar.ts (CELLAR REST + fallback HTML).
 */

export { fetchEurLex } from "./eurlex-cellar";
