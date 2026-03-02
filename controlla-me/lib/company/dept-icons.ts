/**
 * Dept Icons — Mappa centralizzata delle icone Lucide per i dipartimenti.
 * Fonte unica importata da DepartmentList, TaskBoard e DepartmentDetailPanel.
 */

import {
  Scale,
  TrendingUp,
  Database,
  CheckCircle,
  Building2,
  Palette,
  Shield,
  DollarSign,
  Monitor,
  Target,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

export const DEPT_ICONS: Record<string, LucideIcon> = {
  "ufficio-legale":    Scale,
  "trading":          TrendingUp,
  "data-engineering": Database,
  "quality-assurance": CheckCircle,
  "architecture":     Building2,
  "ux-ui":            Palette,
  "security":         Shield,
  "finance":          DollarSign,
  "operations":       Monitor,
  "strategy":         Target,
  "marketing":        Megaphone,
};
