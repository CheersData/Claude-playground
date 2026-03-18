/**
 * SINAPSI Layer 2 — Inter-Department Communication
 *
 * Re-exports all types and functions for external consumption.
 *
 * Usage:
 *   import { loadDepartmentCards, findByCapability } from '@/lib/company/sinapsi';
 *   import type { DepartmentCard } from '@/lib/company/sinapsi';
 */

// Types
export type {
  DepartmentCard,
  DepartmentCapability,
  DepartmentSkill,
  SkillParameter,
  InputMode,
  OutputMode,
} from './types';

// Discovery functions
export {
  loadDepartmentCards,
  invalidateCardCache,
  findByCapability,
  findSkill,
  canQueryDirectly,
  getCapabilitySummary,
} from './department-discovery';
