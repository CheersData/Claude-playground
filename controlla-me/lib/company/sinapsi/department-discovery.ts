/**
 * SINAPSI Layer 2 — Department Discovery Service
 *
 * Loads department cards from the filesystem, caches them in-process,
 * and provides lookup functions for capability discovery, skill search,
 * and direct query authorization.
 *
 * Same caching pattern as routing.ts (in-memory, invalidate on demand).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DepartmentCard, DepartmentSkill } from './types';

const COMPANY_DIR = path.resolve(process.cwd(), 'company');

let _cardCache: Map<string, DepartmentCard> | null = null;

/**
 * Load all department cards from the filesystem.
 * Cached in-process (same pattern as routing.ts).
 * Reads `company/<dept>/department-card.json` for each department directory.
 */
export function loadDepartmentCards(): Map<string, DepartmentCard> {
  if (_cardCache) return _cardCache;

  _cardCache = new Map();

  let deptDirs: string[];
  try {
    deptDirs = fs.readdirSync(COMPANY_DIR).filter(d => {
      try {
        const stat = fs.statSync(path.join(COMPANY_DIR, d));
        if (!stat.isDirectory()) return false;
        const cardPath = path.join(COMPANY_DIR, d, 'department-card.json');
        return fs.existsSync(cardPath);
      } catch {
        return false;
      }
    });
  } catch {
    console.warn('[SINAPSI] Could not read company directory:', COMPANY_DIR);
    return _cardCache;
  }

  for (const dir of deptDirs) {
    try {
      const cardPath = path.join(COMPANY_DIR, dir, 'department-card.json');
      const raw = fs.readFileSync(cardPath, 'utf-8');
      const card: DepartmentCard = JSON.parse(raw);
      _cardCache.set(card.id, card);
    } catch (err) {
      console.warn(`[SINAPSI] Failed to load card for ${dir}: ${(err as Error).message}`);
    }
  }

  return _cardCache;
}

/**
 * Invalidate the card cache.
 * Call after department card files are modified.
 */
export function invalidateCardCache(): void {
  _cardCache = null;
}

/**
 * Find departments that have a specific capability.
 * Example: findByCapability('cost-estimation') => [financeCard]
 */
export function findByCapability(capabilityId: string): DepartmentCard[] {
  const cards = loadDepartmentCards();
  return Array.from(cards.values()).filter(card =>
    card.capabilities.some(cap => cap.id === capabilityId)
  );
}

/**
 * Find a specific skill across all departments.
 * Returns the department card and the skill definition, or null if not found.
 */
export function findSkill(skillId: string): { card: DepartmentCard; skill: DepartmentSkill } | null {
  const cards = loadDepartmentCards();
  const allCards = Array.from(cards.values());
  for (const card of allCards) {
    const skill = card.skills.find(s => s.id === skillId);
    if (skill) return { card, skill };
  }
  return null;
}

/**
 * Check if sourceDept can query targetDept directly (without CME routing).
 * This is the programmatic equivalent of checking contracts.md.
 *
 * Authorization is checked from the TARGET's perspective:
 * the target card lists which departments are allowed to query it.
 */
export function canQueryDirectly(sourceDept: string, targetDept: string): boolean {
  const targetCard = loadDepartmentCards().get(targetDept);
  if (!targetCard) return false;
  return targetCard.directQuerySources.includes(sourceDept);
}

/**
 * Get a summary of all departments and their capabilities.
 * Useful for CME to understand what is available before routing.
 */
export function getCapabilitySummary(): Array<{
  department: string;
  capabilities: string[];
  skills: string[];
  status: string;
}> {
  const cards = loadDepartmentCards();
  return Array.from(cards.values()).map(card => ({
    department: card.id,
    capabilities: card.capabilities.map(c => c.id),
    skills: card.skills.map(s => s.id),
    status: card.status,
  }));
}
