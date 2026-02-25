/**
 * DAL — Data Access Layer
 *
 * Single entry point for all database operations.
 * Import from here: import { profiles, corpus, knowledge, auth } from "@/lib/db"
 */

export * as auth from "./auth";
export * as profiles from "./profiles";
export * as corpus from "./corpus";
export * as knowledge from "./knowledge";
