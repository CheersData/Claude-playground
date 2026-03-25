/**
 * Company Types — Tipi per il task system della virtual company.
 *
 * Department è ora un alias per string anziché un union type fisso.
 * Questo consente ai creator di registrare nuovi dipartimenti a runtime
 * senza modificare il codice sorgente.
 *
 * Per validazione: usare isKnownDepartment() (sync, solo hardcoded)
 * o isValidDepartment() (async, include DB).
 */

/** Dipartimenti storici hardcoded — backward compatibility */
export const KNOWN_DEPARTMENTS = [
  "ufficio-legale",
  "trading",
  "data-engineering",
  "quality-assurance",
  "architecture",
  "finance",
  "operations",
  "security",
  "strategy",
  "marketing",
  "ux-ui",
  "protocols",
  "acceleration",
  "integration",
  "music",
] as const;

/** Union type dei dipartimenti noti (backward compat) */
export type KnownDepartment = (typeof KNOWN_DEPARTMENTS)[number];

/**
 * Department — alias per string.
 * Accetta sia i dipartimenti noti (KnownDepartment) sia quelli registrati a runtime nel DB.
 * Il vecchio union type è preservato come KnownDepartment per chi necessita type narrowing.
 */
export type Department = string;

/** Verifica sincrona: il nome è un dipartimento hardcoded noto? */
export function isKnownDepartment(name: string): name is KnownDepartment {
  return (KNOWN_DEPARTMENTS as readonly string[]).includes(name);
}

/**
 * Verifica asincrona: il nome è un dipartimento valido (hardcoded O registrato nel DB)?
 * Usa Supabase solo se il nome non è tra quelli noti — zero overhead per i dipartimenti storici.
 */
export async function isValidDepartment(name: string): Promise<boolean> {
  if (isKnownDepartment(name)) return true;

  try {
    // Lazy import per evitare dipendenze circolari e mantenere il file leggero
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_departments")
      .select("name")
      .eq("name", name)
      .limit(1)
      .single();
    return !!data;
  } catch {
    // Se il DB non è raggiungibile o la tabella non esiste ancora, fallback a false
    return false;
  }
}

export type TaskStatus = "open" | "in_progress" | "review" | "done" | "blocked" | "on_hold";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  department: Department;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string;
  assignedTo: string | null;
  parentTaskId: string | null;
  blockedBy: string[];
  resultSummary: string | null;
  resultData: Record<string, unknown> | null;
  labels: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Decision-tree routing classification (es. 'feature-request:medium'). Obbligatorio alla creazione salvo routing_exempt. */
  routing: string | null;
  /** true se il task ha bypassato l'obbligo di routing (escape hatch con --routing-exempt) */
  routingExempt: boolean;
  /** Motivo del bypass, obbligatorio quando routingExempt = true */
  routingReason: string | null;
  /** Numero sequenziale leggibile (non sostituisce UUID) */
  seqNum?: number;
  /** Tag free-form per categorizzare il task (es. ['rag', 'performance']) */
  tags?: string[];
  /** Beneficio concreto atteso dal task (max 200 char) */
  expectedBenefit?: string;
  /** Stato del beneficio, valutato da CME + dept owner dopo il done */
  benefitStatus?: 'pending' | 'achieved' | 'partial' | 'missed';
  /** Annotazione libera sull'esito del beneficio */
  benefitNotes?: string;
  /** Hint testuale per il task successivo (creazione rimane manuale) */
  suggestedNext?: string;
  /** Livello di approvazione dal decision tree (auto-populated da routing) */
  approvalLevel?: 'L1' | 'L2' | 'L3' | 'L4';
  /** Dipartimenti da consultare dal decision tree (auto-populated da routing) */
  consultDepts?: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  department: Department;
  priority?: TaskPriority;
  status?: TaskStatus;        // default "open"; usare "review" per task che richiedono approvazione boss
  createdBy: string;
  assignedTo?: string;        // Se fornito, il task nasce in_progress con started_at settato
  parentTaskId?: string;
  blockedBy?: string[];
  labels?: string[];
  /** Decision-tree routing classification. Obbligatorio salvo routingExempt=true. */
  routing?: string;
  /** Se true, bypassa l'obbligo di routing (richiede routingReason). */
  routingExempt?: boolean;
  /** Motivo del bypass, obbligatorio quando routingExempt = true. */
  routingReason?: string;
  /** Tag free-form per categorizzare il task (es. ['rag', 'performance']) */
  tags?: string[];
  /** Beneficio concreto atteso dal task (max 200 char) */
  expectedBenefit?: string;
  /** Livello di approvazione dal decision tree (auto-populated da routing) */
  approvalLevel?: 'L1' | 'L2' | 'L3' | 'L4';
  /** Dipartimenti da consultare dal decision tree (auto-populated da routing) */
  consultDepts?: string[];
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  resultSummary?: string;
  resultData?: Record<string, unknown>;
  labels?: string[];
  /** Tag free-form per categorizzare il task */
  tags?: string[];
  /** Beneficio concreto atteso dal task */
  expectedBenefit?: string;
  /** Stato del beneficio, valutato dopo il done */
  benefitStatus?: 'pending' | 'achieved' | 'partial' | 'missed';
  /** Annotazione libera sull'esito del beneficio */
  benefitNotes?: string;
  /** Hint testuale per il task successivo */
  suggestedNext?: string;
  /** Livello di approvazione dal decision tree */
  approvalLevel?: 'L1' | 'L2' | 'L3' | 'L4';
  /** Dipartimenti da consultare dal decision tree */
  consultDepts?: string[];
}

export interface TaskBoard {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byDepartment: Record<string, { total: number; open: number; inProgress: number; done: number }>;
  recent: Task[];
  /** All tasks currently in_progress, ordered by started_at DESC */
  inProgress: Task[];
  /** ALL tasks awaiting boss approval (status=review) — NOT limited to recent slice */
  reviewPending: Task[];
  /** Last 15 completed tasks — used by Forma Mentis to prevent CME from re-proposing done work */
  recentDone: Task[];
}
