# ADR: Forma Mentis — Unified Company Intelligence Architecture

**Date**: 2026-03-18
**Status**: proposed
**Author**: Architecture Department
**Deciders**: CME, Architecture, Operations, Protocols
**Task**: #981

## Context

Controlla.me's virtual company has 12 departments, a CEO agent (CME), a daemon, and a task system. Today they operate as **isolated sessions**: each Claude Code session starts fresh with no memory of previous sessions, departments cannot find or communicate with each other directly, the daemon produces ephemeral reports that get overwritten every cycle, and there is no systematic way to learn from past decisions.

The boss wants to reorganize this into **one mind/organism** -- a system that remembers, communicates, monitors goals, reflects on outcomes, and collaborates structurally.

This ADR defines the **Forma Mentis** architecture across 5 layers:

1. **MEMORIA** -- Persistent cross-session memory
2. **SINAPSI** -- Inter-department communication
3. **COSCIENZA** -- Goal monitoring and self-awareness
4. **RIFLESSIONE** -- Learning from decisions
5. **COLLABORAZIONE** -- Structured multi-agent patterns

### Design Principles

- **Extend, don't replace**: Existing legal RAG (`vector-store.ts`), trading pipeline, task system, and agent-runner all continue working unchanged.
- **Supabase-first**: All persistent state goes to the shared Supabase PostgreSQL database. No new infrastructure.
- **Zero external dependencies**: No Redis, no message brokers, no new SaaS. Supabase + filesystem + in-process state.
- **Cost-aware**: Company memory uses the same Voyage AI embeddings already deployed for legal RAG. No new API keys required.
- **Incremental adoption**: Each layer is independently deployable. Layer 1 delivers value alone.

### What Exists Today (inventory)

| Component | Location | State Storage | Persistence |
|-----------|----------|---------------|-------------|
| Task system | `lib/company/tasks.ts` | `company_tasks` table (Supabase) | Permanent |
| Cost logger | `lib/company/cost-logger.ts` | `agent_cost_log` table | TTL 90 days |
| Department registry | `lib/company/departments.ts` | In-memory constant (DEPARTMENTS map) | Code-only |
| Session tracker | `lib/company/sessions.ts` | In-memory Map + `.active-sessions.json` | Ephemeral |
| Routing | `lib/company/routing.ts` | YAML decision trees (filesystem) | Code-only |
| Daemon report | `company/daemon-report.json` | Single JSON file (overwritten) | Last cycle only |
| Department status | `company/<dept>/status.json` | Manual JSON files | Manual updates |
| Legal RAG | `lib/vector-store.ts` | `legal_knowledge`, `document_chunks`, `legal_articles` | Permanent |
| Contracts | `company/contracts.md` | Markdown file | Code-only |
| Vision/OKR | `lib/company/vision.ts` | `company_vision` table | Permanent |
| Agent runner | `lib/ai-sdk/agent-runner.ts` | N/A (stateless per-call) | N/A |
| Tier system | `lib/tiers.ts` | Global + AsyncLocalStorage | Per-process |

---

## Layer 1: MEMORIA -- Persistent Cross-Session Memory

### Problem

Every Claude Code session starts with zero knowledge of what happened in previous sessions. CME re-reads the same files, re-discovers the same context, and re-learns the same patterns. Session summaries exist nowhere. Department-specific knowledge (e.g., "the Normattiva ZIP download failed last 3 times for L.300/1970") is lost.

### Solution

Three new Supabase tables that persist session context, department-scoped memory, and company-wide knowledge. The existing `vector-store.ts` RAG infrastructure is extended (not replaced) with a new `company_knowledge` table that follows the same embedding pattern as `legal_knowledge`.

### 1.1 Table: `company_sessions`

Stores a structured summary of every Claude Code session. Written at session end (or periodically during long sessions).

```sql
-- Migration: 040_forma_mentis_memoria.sql

create table public.company_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Session identity
  session_type text not null,                -- 'interactive' | 'console' | 'task-runner' | 'daemon'
  department text,                           -- nullable (CME sessions span departments)
  task_id uuid references company_tasks(id) on delete set null,  -- task being worked on (if any)

  -- Who and when
  started_by text not null,                  -- 'boss' | 'cme' | 'daemon' | agent name
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms int,

  -- Session content
  summary text not null,                     -- 2-5 sentence natural language summary
  key_decisions jsonb default '[]',          -- [{decision, rationale, department, impact}]
  files_modified text[] default '{}',        -- absolute paths of files changed
  tasks_created uuid[] default '{}',         -- task IDs created during session
  tasks_completed uuid[] default '{}',       -- task IDs completed during session
  errors_encountered jsonb default '[]',     -- [{error, context, resolution}]

  -- Embedding for semantic search
  embedding vector(1024),                    -- Voyage AI embedding of summary + key decisions

  -- Metadata
  metadata jsonb default '{}',              -- extensible: git_branch, commit_hash, etc.

  created_at timestamptz default now()
);

-- Indexes
create index idx_company_sessions_dept on company_sessions(department);
create index idx_company_sessions_type on company_sessions(session_type);
create index idx_company_sessions_started on company_sessions(started_at desc);
create index idx_company_sessions_task on company_sessions(task_id);
create index idx_company_sessions_embedding on company_sessions
  using hnsw (embedding vector_cosine_ops);

-- RLS: service_role only (company internal)
alter table company_sessions enable row level security;
create policy "Service role manages company sessions" on company_sessions
  for all using (true);
```

**TypeScript interface:**

```typescript
// lib/company/memory/types.ts

export interface CompanySession {
  id: string;
  sessionType: 'interactive' | 'console' | 'task-runner' | 'daemon';
  department: string | null;
  taskId: string | null;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  summary: string;
  keyDecisions: SessionDecision[];
  filesModified: string[];
  tasksCreated: string[];
  tasksCompleted: string[];
  errorsEncountered: SessionError[];
  metadata: Record<string, unknown>;
}

export interface SessionDecision {
  decision: string;
  rationale: string;
  department: string;
  impact: 'low' | 'medium' | 'high';
}

export interface SessionError {
  error: string;
  context: string;
  resolution: string | null;
}
```

**How session summaries are generated:**

Session summaries are generated at two points:

1. **End of session** -- When a Claude Code session ends (interactive or console), the system collects: files modified (from `git diff`), tasks created/completed (from task system), key decisions made, and errors encountered. It generates a natural language summary using the cheapest available model (Cerebras/Groq from intern tier) via `runAgent('session-summarizer', ...)`.

2. **Periodic checkpoint** -- For long sessions (>30 minutes), a checkpoint summary is saved every 30 minutes. The checkpoint uses the same format but `ended_at` is null (session still active).

The summary prompt is intentionally minimal to keep costs near zero:

```
Summarize this Claude Code session in 2-5 sentences. Focus on: what was accomplished,
what decisions were made, what problems were encountered.

Session data:
- Type: {sessionType}
- Department: {department}
- Duration: {durationMinutes} minutes
- Files modified: {filesList}
- Tasks created: {taskTitles}
- Tasks completed: {taskTitles}
- Errors: {errorsList}
```

### 1.2 Table: `department_memory`

Department-scoped persistent memory. Each department stores key-value facts, learnings, and warnings that survive across sessions. Unlike `company_sessions` (which is append-only), this table is actively managed -- entries are created, updated, and expired.

```sql
create table public.department_memory (
  id uuid primary key default gen_random_uuid(),

  department text not null,                  -- 'architecture' | 'trading' | etc.
  category text not null,                    -- 'fact' | 'learning' | 'warning' | 'preference' | 'context'
  key text not null,                         -- human-readable key: 'normattiva_zip_failure_pattern'
  content text not null,                     -- the actual memory content
  confidence float default 1.0,             -- 0.0-1.0 (decays over time if not reinforced)
  source_session_id uuid references company_sessions(id) on delete set null,
  source_task_id uuid references company_tasks(id) on delete set null,

  -- Lifecycle
  times_accessed int default 0,
  last_accessed_at timestamptz,
  expires_at timestamptz,                    -- null = never expires
  is_active boolean default true,

  -- Embedding for semantic retrieval
  embedding vector(1024),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Unique per department + key (upsert pattern)
  unique(department, key)
);

create index idx_dept_memory_dept on department_memory(department);
create index idx_dept_memory_category on department_memory(category);
create index idx_dept_memory_active on department_memory(is_active) where is_active = true;
create index idx_dept_memory_embedding on department_memory
  using hnsw (embedding vector_cosine_ops);

alter table department_memory enable row level security;
create policy "Service role manages department memory" on department_memory
  for all using (true);
```

**TypeScript interface:**

```typescript
export interface DepartmentMemoryEntry {
  id: string;
  department: string;
  category: 'fact' | 'learning' | 'warning' | 'preference' | 'context';
  key: string;
  content: string;
  confidence: number;
  sourceSessionId: string | null;
  sourceTaskId: string | null;
  timesAccessed: number;
  lastAccessedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}
```

**Usage pattern:**

```typescript
// At session start, load relevant department memories
const memories = await getDepartmentMemories('trading', {
  categories: ['fact', 'warning', 'learning'],
  limit: 20,
});

// During session, store new learnings
await upsertDepartmentMemory({
  department: 'trading',
  category: 'learning',
  key: 'slope_threshold_optimal_range',
  content: 'Grid search cycles 1-4 show optimal slope threshold between 0.005-0.01. ' +
           'Below 0.005 generates too many false signals. Above 0.01 misses entries.',
  confidence: 0.85,
  sourceTaskId: currentTaskId,
});
```

### 1.3 Table: `company_knowledge`

Company-wide knowledge base. Similar to `legal_knowledge` but for operational intelligence: patterns, best practices, architectural decisions, cross-department insights. Uses the same Voyage AI embeddings and the same HNSW index pattern.

```sql
create table public.company_knowledge (
  id uuid primary key default gen_random_uuid(),

  category text not null,                    -- 'pattern' | 'decision' | 'best_practice' | 'incident' | 'metric'
  title text not null,
  content text not null,
  departments text[] default '{}',           -- which departments this applies to (empty = all)

  -- Source tracking
  source_session_id uuid references company_sessions(id) on delete set null,
  source_task_id uuid references company_tasks(id) on delete set null,
  source_decision_id uuid,                   -- FK to decision_journal (Layer 4), added later

  -- RAG
  embedding vector(1024),
  times_referenced int default 1,

  -- Metadata
  metadata jsonb default '{}',
  is_active boolean default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_company_knowledge_category on company_knowledge(category);
create index idx_company_knowledge_depts on company_knowledge using gin(departments);
create index idx_company_knowledge_embedding on company_knowledge
  using hnsw (embedding vector_cosine_ops);

alter table company_knowledge enable row level security;
create policy "Service role manages company knowledge" on company_knowledge
  for all using (true);

-- Semantic search function (mirrors match_legal_knowledge pattern)
create or replace function match_company_knowledge(
  query_embedding vector(1024),
  filter_category text default null,
  filter_departments text[] default null,
  match_threshold float default 0.55,
  match_count int default 5
)
returns table (
  id uuid,
  category text,
  title text,
  content text,
  departments text[],
  metadata jsonb,
  times_referenced int,
  similarity float
)
language sql stable
as $$
  select
    ck.id,
    ck.category,
    ck.title,
    ck.content,
    ck.departments,
    ck.metadata,
    ck.times_referenced,
    1 - (ck.embedding <=> query_embedding) as similarity
  from public.company_knowledge ck
  where ck.is_active = true
    and ck.embedding is not null
    and 1 - (ck.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or ck.category = filter_category)
    and (filter_departments is null or ck.departments && filter_departments)
  order by ck.embedding <=> query_embedding
  limit match_count;
$$;

-- Semantic search for department memory
create or replace function match_department_memory(
  query_embedding vector(1024),
  filter_department text,
  filter_category text default null,
  match_threshold float default 0.55,
  match_count int default 10
)
returns table (
  id uuid,
  department text,
  category text,
  key text,
  content text,
  confidence float,
  times_accessed int,
  similarity float
)
language sql stable
as $$
  select
    dm.id,
    dm.department,
    dm.category,
    dm.key,
    dm.content,
    dm.confidence,
    dm.times_accessed,
    1 - (dm.embedding <=> query_embedding) as similarity
  from public.department_memory dm
  where dm.is_active = true
    and dm.embedding is not null
    and dm.department = filter_department
    and 1 - (dm.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or dm.category = filter_category)
    and (dm.expires_at is null or dm.expires_at > now())
  order by dm.embedding <=> query_embedding
  limit match_count;
$$;

-- Semantic search for session history
create or replace function match_company_sessions(
  query_embedding vector(1024),
  filter_department text default null,
  filter_type text default null,
  match_threshold float default 0.50,
  match_count int default 5
)
returns table (
  id uuid,
  session_type text,
  department text,
  summary text,
  key_decisions jsonb,
  started_at timestamptz,
  duration_ms int,
  similarity float
)
language sql stable
as $$
  select
    cs.id,
    cs.session_type,
    cs.department,
    cs.summary,
    cs.key_decisions,
    cs.started_at,
    cs.duration_ms,
    1 - (cs.embedding <=> query_embedding) as similarity
  from public.company_sessions cs
  where cs.embedding is not null
    and 1 - (cs.embedding <=> query_embedding) > match_threshold
    and (filter_department is null or cs.department = filter_department)
    and (filter_type is null or cs.session_type = filter_type)
  order by cs.embedding <=> query_embedding
  limit match_count;
$$;
```

### 1.4 Extending vector-store.ts for Company RAG

The existing `lib/vector-store.ts` handles legal RAG. Company memory RAG follows the same patterns but lives in a new file to avoid polluting the legal pipeline.

**New file: `lib/company/memory/company-rag.ts`**

```typescript
// lib/company/memory/company-rag.ts

import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding, isVectorDBEnabled, truncateForEmbedding } from '@/lib/embeddings';

/**
 * Build a RAG context block for a company operation.
 * Searches across: company_knowledge, department_memory, recent sessions.
 *
 * Returns a formatted text block injectable into agent prompts.
 */
export async function buildCompanyRAGContext(
  query: string,
  options: {
    department?: string;
    maxChars?: number;
    includeSessionHistory?: boolean;
    categories?: string[];
  } = {}
): Promise<string> {
  if (!isVectorDBEnabled()) return '';

  const { department, maxChars = 2000, includeSessionHistory = true } = options;

  const embedding = await generateEmbedding(truncateForEmbedding(query), 'query');
  if (!embedding) return '';

  const admin = createAdminClient();
  const embeddingJson = JSON.stringify(embedding);

  // Parallel search across all memory layers
  const searches = [
    admin.rpc('match_company_knowledge', {
      query_embedding: embeddingJson,
      filter_departments: department ? [department] : null,
      match_threshold: 0.55,
      match_count: 5,
    }),
  ];

  if (department) {
    searches.push(
      admin.rpc('match_department_memory', {
        query_embedding: embeddingJson,
        filter_department: department,
        match_threshold: 0.55,
        match_count: 5,
      })
    );
  }

  if (includeSessionHistory) {
    searches.push(
      admin.rpc('match_company_sessions', {
        query_embedding: embeddingJson,
        filter_department: department ?? null,
        match_threshold: 0.50,
        match_count: 3,
      })
    );
  }

  const results = await Promise.all(searches);
  // ... format into text block (same pattern as buildRAGContext in vector-store.ts)
  // Returns formatted context string
  return ''; // implementation follows buildRAGContext pattern
}
```

### 1.5 Session Summary Generation

**New file: `lib/company/memory/session-recorder.ts`**

```typescript
// lib/company/memory/session-recorder.ts

import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding, isVectorDBEnabled, truncateForEmbedding } from '@/lib/embeddings';
import type { CompanySession, SessionDecision, SessionError } from './types';

/**
 * Open a new session record. Call at session start.
 * Returns the session ID for later updates.
 */
export async function openSession(params: {
  sessionType: CompanySession['sessionType'];
  department?: string;
  taskId?: string;
  startedBy: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('company_sessions').insert({
    session_type: params.sessionType,
    department: params.department ?? null,
    task_id: params.taskId ?? null,
    started_by: params.startedBy,
    summary: '', // placeholder until close
  }).select('id').single();

  if (error) throw new Error(`[MEMORY] Failed to open session: ${error.message}`);
  return data!.id;
}

/**
 * Close a session with a generated summary.
 * Generates embedding for future semantic search.
 */
export async function closeSession(sessionId: string, params: {
  summary: string;
  keyDecisions?: SessionDecision[];
  filesModified?: string[];
  tasksCreated?: string[];
  tasksCompleted?: string[];
  errorsEncountered?: SessionError[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();

  // Generate embedding from summary + decision text
  const embeddingText = [
    params.summary,
    ...(params.keyDecisions ?? []).map(d => `${d.decision}: ${d.rationale}`),
  ].join('\n');

  let embedding: number[] | null = null;
  if (isVectorDBEnabled()) {
    embedding = await generateEmbedding(truncateForEmbedding(embeddingText), 'document');
  }

  const { error } = await admin.from('company_sessions').update({
    summary: params.summary,
    key_decisions: params.keyDecisions ?? [],
    files_modified: params.filesModified ?? [],
    tasks_created: params.tasksCreated ?? [],
    tasks_completed: params.tasksCompleted ?? [],
    errors_encountered: params.errorsEncountered ?? [],
    metadata: params.metadata ?? {},
    embedding: embedding ? JSON.stringify(embedding) : null,
    ended_at: new Date().toISOString(),
    duration_ms: null, // computed from started_at - ended_at via trigger or app code
  }).eq('id', sessionId);

  if (error) console.error(`[MEMORY] Failed to close session: ${error.message}`);
}

/**
 * Get recent sessions for a department (non-semantic, chronological).
 */
export async function getRecentSessions(
  department?: string,
  limit = 10
): Promise<CompanySession[]> {
  const admin = createAdminClient();
  let query = admin.from('company_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (department) {
    query = query.eq('department', department);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapSessionRow);
}

function mapSessionRow(row: Record<string, unknown>): CompanySession {
  return {
    id: row.id as string,
    sessionType: row.session_type as CompanySession['sessionType'],
    department: row.department as string | null,
    taskId: row.task_id as string | null,
    startedBy: row.started_by as string,
    startedAt: row.started_at as string,
    endedAt: row.ended_at as string | null,
    durationMs: row.duration_ms as number | null,
    summary: row.summary as string,
    keyDecisions: (row.key_decisions ?? []) as SessionDecision[],
    filesModified: (row.files_modified ?? []) as string[],
    tasksCreated: (row.tasks_created ?? []) as string[],
    tasksCompleted: (row.tasks_completed ?? []) as string[],
    errorsEncountered: (row.errors_encountered ?? []) as SessionError[],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
```

---

## Layer 2: SINAPSI -- Inter-Department Communication

### Problem

Departments today communicate only through the task system (async, heavyweight). CME manually routes all requests. Departments cannot discover each other's capabilities, cannot make direct lightweight queries, and the contracts.md is a static document that code never reads.

### Solution

A machine-readable `department-card.json` for each department, a discovery service that loads these cards at runtime, and a protocol for lightweight direct queries (bypassing the task system for read-only informational requests).

### 2.1 Department Card Schema

Each department publishes a `department-card.json` alongside its `department.md`. This file is the machine-readable API surface of the department.

**File location**: `company/<dept>/department-card.json`

```typescript
// lib/company/sinapsi/types.ts

export interface DepartmentCard {
  /** Department identifier (matches Department type) */
  id: string;

  /** Human-readable display name */
  name: string;

  /** What this department can do (machine-readable capabilities) */
  capabilities: DepartmentCapability[];

  /** What inputs this department accepts */
  inputModes: InputMode[];

  /** What outputs this department produces */
  outputModes: OutputMode[];

  /** Skills: named operations this department can perform directly */
  skills: DepartmentSkill[];

  /** Departments this department can query directly (without CME routing) */
  directQueryTargets: string[];

  /** Departments that can query this department directly */
  directQuerySources: string[];

  /** Current operational status */
  status: 'active' | 'degraded' | 'offline';

  /** Version of the card schema */
  schemaVersion: 1;
}

export interface DepartmentCapability {
  id: string;                    // 'legal-analysis' | 'cost-estimation' | 'security-audit'
  description: string;
  inputType: string;             // 'document' | 'query' | 'task' | 'config'
  outputType: string;            // 'report' | 'analysis' | 'config' | 'alert'
  estimatedDurationMs?: number;
  costEstimate?: string;         // '~gratis' | '~$0.05' | '~$0.50'
}

export interface DepartmentSkill {
  id: string;                    // 'run-tests' | 'estimate-cost' | 'audit-route'
  description: string;
  parameters: SkillParameter[];
  returns: string;               // description of return value
  /** If true, this skill can be called directly without a task */
  isDirectCallable: boolean;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required: boolean;
  description: string;
}

export type InputMode = 'task' | 'direct-query' | 'event' | 'cron';
export type OutputMode = 'task-result' | 'direct-response' | 'event' | 'report';
```

**Example department-card.json for Quality Assurance:**

```json
{
  "id": "quality-assurance",
  "name": "Quality Assurance",
  "capabilities": [
    {
      "id": "run-test-suite",
      "description": "Run full Vitest + Playwright test suite",
      "inputType": "query",
      "outputType": "report",
      "estimatedDurationMs": 120000,
      "costEstimate": "~gratis"
    },
    {
      "id": "validate-component",
      "description": "Type-check and lint a specific file or directory",
      "inputType": "query",
      "outputType": "report",
      "estimatedDurationMs": 15000,
      "costEstimate": "~gratis"
    }
  ],
  "inputModes": ["task", "direct-query"],
  "outputModes": ["task-result", "direct-response", "report"],
  "skills": [
    {
      "id": "run-tests",
      "description": "Run npx vitest run and return pass/fail summary",
      "parameters": [
        { "name": "filter", "type": "string", "required": false, "description": "Test file filter pattern" }
      ],
      "returns": "{ passed: number, failed: number, skipped: number, duration: number }",
      "isDirectCallable": true
    },
    {
      "id": "type-check",
      "description": "Run npx tsc --noEmit and return error count",
      "parameters": [],
      "returns": "{ errors: number, warnings: number }",
      "isDirectCallable": true
    }
  ],
  "directQueryTargets": [],
  "directQuerySources": ["architecture", "ufficio-legale", "trading"],
  "status": "active",
  "schemaVersion": 1
}
```

### 2.2 Department Discovery Service

**New file: `lib/company/sinapsi/department-discovery.ts`**

```typescript
// lib/company/sinapsi/department-discovery.ts

import * as fs from 'fs';
import * as path from 'path';
import type { DepartmentCard, DepartmentSkill } from './types';

const COMPANY_DIR = path.resolve(process.cwd(), 'company');

let _cardCache: Map<string, DepartmentCard> | null = null;

/**
 * Load all department cards from the filesystem.
 * Cached in-process (same pattern as routing.ts).
 */
export function loadDepartmentCards(): Map<string, DepartmentCard> {
  if (_cardCache) return _cardCache;

  _cardCache = new Map();

  const deptDirs = fs.readdirSync(COMPANY_DIR).filter(d => {
    const cardPath = path.join(COMPANY_DIR, d, 'department-card.json');
    return fs.existsSync(cardPath);
  });

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

/** Invalidate the card cache (call after department card file changes). */
export function invalidateCardCache(): void {
  _cardCache = null;
}

/**
 * Find departments that have a specific capability.
 * Example: findByCapability('cost-estimation') => ['finance']
 */
export function findByCapability(capabilityId: string): DepartmentCard[] {
  const cards = loadDepartmentCards();
  return Array.from(cards.values()).filter(card =>
    card.capabilities.some(cap => cap.id === capabilityId)
  );
}

/**
 * Find a specific skill across all departments.
 * Returns the department card and the skill definition.
 */
export function findSkill(skillId: string): { card: DepartmentCard; skill: DepartmentSkill } | null {
  const cards = loadDepartmentCards();
  for (const card of cards.values()) {
    const skill = card.skills.find(s => s.id === skillId);
    if (skill) return { card, skill };
  }
  return null;
}

/**
 * Check if department A can query department B directly (without CME routing).
 * This is the programmatic equivalent of checking contracts.md.
 */
export function canQueryDirectly(sourceDept: string, targetDept: string): boolean {
  const targetCard = loadDepartmentCards().get(targetDept);
  if (!targetCard) return false;
  return targetCard.directQuerySources.includes(sourceDept);
}

/**
 * Get a summary of all departments and their capabilities.
 * Useful for CME to understand what's available before routing.
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
```

### 2.3 Direct Query Protocol

For read-only informational requests between departments that have `directQuery` authorization. This supplements the task system (which remains the primary channel for work that produces artifacts).

**Rules:**
- Direct queries are synchronous, lightweight, and read-only.
- They do NOT create tasks. They do NOT modify files.
- They are logged in `company_sessions` as part of the calling session's activity.
- Authorization is checked via `canQueryDirectly()` from department cards.
- Unauthorized queries are rejected with an error (fail-closed).

**Examples of valid direct queries:**
- Architecture asks QA: "What is the current test pass rate?"
- Architecture asks Finance: "What is the estimated cost of adding a new provider?"
- Trading asks Finance: "What was yesterday's API spend?"

**Examples that MUST use the task system (not direct queries):**
- CME asks Architecture: "Design a new caching layer" (produces artifacts)
- QA asks Trading: "Fix this failing test" (modifies code)
- Security asks any: "Audit this route" (produces report)

### 2.4 Changes to contracts.md

`contracts.md` remains the human-readable source of truth for authorized flows. The `department-card.json` files encode the same information in machine-readable form. When a new flow is authorized in `contracts.md`, the corresponding department cards must be updated.

New section to add to `contracts.md`:

```markdown
## Direct Query Protocol (Forma Mentis Layer 2)

In addition to task-based communication, departments can make lightweight
direct queries to other departments. Direct queries are:
- Synchronous and read-only
- Do not create tasks or modify files
- Authorized via department-card.json `directQuerySources`

See ADR-forma-mentis.md Layer 2 for details.
```

---

## Layer 3: COSCIENZA -- Goal Monitoring and Self-Awareness

### Problem

The daemon today produces a single `daemon-report.json` that is overwritten every 15-minute cycle. There is no history, no trend detection, no goal tracking, and no way to know if the company is on track for its OKRs. The daemon collects signals but does not monitor progress toward goals.

### Solution

A `company_goals` table for explicit goal tracking, versioned (append-only) daemon reports, and an alert escalation system.

### 3.1 Table: `company_goals`

```sql
-- Part of migration 040_forma_mentis_memoria.sql (or split into separate migration)

create table public.company_goals (
  id uuid primary key default gen_random_uuid(),

  -- Goal definition
  title text not null,                       -- 'Sharpe ratio > 1.0 in backtest'
  description text,                          -- longer explanation
  metric text not null,                      -- 'sharpe_ratio' | 'test_pass_rate' | 'corpus_articles_count'
  target_value float not null,               -- 1.0 | 100.0 | 6000
  current_value float default 0,
  unit text default '',                      -- '%' | 'ratio' | 'count' | 'USD'

  -- Ownership
  department text not null,                  -- which dept owns this goal
  owner_agent text,                          -- specific agent responsible

  -- Timeline
  deadline timestamptz,                      -- null = ongoing
  status text default 'active',              -- 'active' | 'achieved' | 'at_risk' | 'missed' | 'paused'

  -- What to do when off track
  actions_if_behind jsonb default '[]',      -- [{action, trigger_threshold, escalation_level}]
  last_checked_at timestamptz,
  check_interval_minutes int default 60,     -- how often daemon should check this

  -- History of value changes (append-only JSONB array)
  value_history jsonb default '[]',          -- [{value, timestamp, source}]

  -- Metadata
  parent_goal_id uuid references company_goals(id),  -- goal hierarchy (OKR: O -> KR)
  tags text[] default '{}',
  metadata jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_company_goals_dept on company_goals(department);
create index idx_company_goals_status on company_goals(status);
create index idx_company_goals_deadline on company_goals(deadline)
  where deadline is not null and status = 'active';

alter table company_goals enable row level security;
create policy "Service role manages company goals" on company_goals
  for all using (true);
```

**TypeScript interface:**

```typescript
// lib/company/coscienza/types.ts

export interface CompanyGoal {
  id: string;
  title: string;
  description: string | null;
  metric: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  department: string;
  ownerAgent: string | null;
  deadline: string | null;
  status: 'active' | 'achieved' | 'at_risk' | 'missed' | 'paused';
  actionsIfBehind: GoalAction[];
  lastCheckedAt: string | null;
  checkIntervalMinutes: number;
  valueHistory: GoalValueEntry[];
  parentGoalId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface GoalAction {
  action: string;           // 'Create task for grid search optimization'
  triggerThreshold: number;  // when current_value/target_value < this ratio, trigger
  escalationLevel: 'L1' | 'L2' | 'L3';
}

export interface GoalValueEntry {
  value: number;
  timestamp: string;
  source: string;           // 'daemon' | 'manual' | task_id
}
```

### 3.2 Table: `daemon_reports` (Versioned, Append-Only)

Replaces the overwritten `daemon-report.json` with a persistent, queryable history.

```sql
create table public.daemon_reports (
  id uuid primary key default gen_random_uuid(),

  -- Report content (same structure as current daemon-report.json)
  board jsonb not null,                      -- {total, open, inProgress, done}
  signals jsonb not null default '[]',       -- array of signal objects
  llm_analysis text,                         -- LLM summary (when available)
  llm_suggestions jsonb default '[]',
  alerts jsonb default '[]',

  -- Goal check results (new)
  goal_checks jsonb default '[]',            -- [{goalId, previousValue, currentValue, status, action_taken}]

  -- Performance
  duration_ms int,

  -- Metadata
  cycle_number int,                          -- monotonically increasing cycle counter
  metadata jsonb default '{}',

  created_at timestamptz default now()
);

create index idx_daemon_reports_created on daemon_reports(created_at desc);
create index idx_daemon_reports_cycle on daemon_reports(cycle_number);

-- TTL: keep 30 days of daemon reports (cleanup via cron or app logic)
-- Older reports are auto-deleted to prevent unbounded growth.

alter table daemon_reports enable row level security;
create policy "Service role manages daemon reports" on daemon_reports
  for all using (true);
```

### 3.3 Daemon Evolution: From Snapshot to Goal Monitor

The daemon currently runs every 15 minutes, reads department status files, scans signals, and writes a single JSON file. The transformation:

**Current flow:**
```
Every 15 min: scan signals → write daemon-report.json (overwrite) → done
```

**New flow:**
```
Every 15 min:
  1. Scan signals (unchanged)
  2. Check active goals:
     - For each goal with lastCheckedAt + checkIntervalMinutes < now():
       - Query current metric value (from Supabase, trading, agent_cost_log, etc.)
       - Update current_value, append to value_history
       - If deviating: check actionsIfBehind thresholds
       - If threshold breached: execute action (create task, send alert, escalate)
       - Update status: active → at_risk → missed
  3. Write to daemon_reports table (append, not overwrite)
  4. ALSO write daemon-report.json (backward compatibility for existing readers)
  5. If goals at risk: trigger escalation alerts
```

**Metric resolution**: The daemon needs to know how to query each metric. This is done via a `MetricResolver` registry:

```typescript
// lib/company/coscienza/metric-resolver.ts

export type MetricResolver = () => Promise<number>;

const resolvers: Record<string, MetricResolver> = {
  // Trading metrics
  'sharpe_ratio': async () => {
    const admin = createAdminClient();
    const { data } = await admin.from('portfolio_snapshots')
      .select('sharpe_ratio')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data?.sharpe_ratio ?? 0;
  },

  // QA metrics
  'test_pass_rate': async () => {
    // Read from latest CI run or company_tasks result_data
    return 100; // placeholder
  },

  // Corpus metrics
  'corpus_articles_count': async () => {
    const admin = createAdminClient();
    const { count } = await admin.from('legal_articles')
      .select('*', { count: 'exact', head: true });
    return count ?? 0;
  },

  // Cost metrics
  'daily_api_cost': async () => {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await admin.from('agent_cost_log')
      .select('total_cost_usd')
      .gte('created_at', `${today}T00:00:00Z`);
    return (data ?? []).reduce((sum, r) => sum + Number(r.total_cost_usd), 0);
  },
};

export function resolveMetric(metricName: string): MetricResolver | null {
  return resolvers[metricName] ?? null;
}

export function registerMetricResolver(name: string, resolver: MetricResolver): void {
  resolvers[name] = resolver;
}
```

### 3.4 Alert Escalation

When a goal deviates beyond its `triggerThreshold`, the system takes action according to the `escalationLevel`:

| Level | Action |
|-------|--------|
| L1 | Log warning in daemon report + create task for owning department |
| L2 | L1 + notify CME (task with priority=high) |
| L3 | L2 + send Telegram alert to boss |

This uses the existing Telegram integration (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`) already configured for Trading alerts.

---

## Layer 4: RIFLESSIONE -- Learning from Decisions

### Problem

The company makes decisions constantly (which model to use, which architecture to adopt, which strategy to pursue) but never records whether those decisions worked out. There is no feedback loop: no way to score past decisions, no way to learn from failures, and no way to improve decision-making over time.

### Solution

A `decision_journal` table that tracks every significant decision, its expected outcome, actual outcome, and a retrospective score. The daemon periodically checks decisions that are past their review date and prompts for evaluation.

### 4.1 Table: `decision_journal`

```sql
create table public.decision_journal (
  id uuid primary key default gen_random_uuid(),

  -- Decision identity
  title text not null,                       -- 'Adopted Voyage AI voyage-law-2 for legal embeddings'
  description text not null,                 -- full context and rationale
  department text not null,
  decision_type text not null,               -- 'architectural' | 'operational' | 'strategic' | 'tactical'

  -- Source
  source_task_id uuid references company_tasks(id) on delete set null,
  source_session_id uuid references company_sessions(id) on delete set null,
  source_adr text,                           -- 'ADR-forma-mentis' | 'ADR-integration-framework'
  decided_by text not null,                  -- 'cme' | 'boss' | 'architect'

  -- Expected outcome
  expected_outcome text not null,            -- 'Legal article similarity scores > 0.7 for IT text'
  expected_benefit text,                     -- 'Reduced hallucination by 40%'
  success_criteria jsonb default '[]',       -- [{criterion, measurable: bool, metric, target}]

  -- Actual outcome (filled in during review)
  actual_outcome text,
  outcome_score float,                       -- 0.0-1.0 (0=total failure, 1=exceeded expectations)
  outcome_notes text,
  reviewed_at timestamptz,
  reviewed_by text,

  -- Timeline
  decided_at timestamptz default now(),
  review_due_at timestamptz,                 -- when to evaluate the outcome
  status text default 'active',              -- 'active' | 'reviewed' | 'superseded' | 'reverted'

  -- Learning extraction
  learnings jsonb default '[]',              -- [{learning, confidence, applicable_to_departments}]

  -- Embedding for semantic search
  embedding vector(1024),

  -- Metadata
  tags text[] default '{}',
  metadata jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_decision_journal_dept on decision_journal(department);
create index idx_decision_journal_type on decision_journal(decision_type);
create index idx_decision_journal_status on decision_journal(status);
create index idx_decision_journal_review_due on decision_journal(review_due_at)
  where status = 'active' and review_due_at is not null;
create index idx_decision_journal_embedding on decision_journal
  using hnsw (embedding vector_cosine_ops);

alter table decision_journal enable row level security;
create policy "Service role manages decision journal" on decision_journal
  for all using (true);

-- Semantic search function
create or replace function match_decisions(
  query_embedding vector(1024),
  filter_department text default null,
  filter_type text default null,
  match_threshold float default 0.55,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  description text,
  department text,
  decision_type text,
  expected_outcome text,
  actual_outcome text,
  outcome_score float,
  status text,
  decided_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    dj.id,
    dj.title,
    dj.description,
    dj.department,
    dj.decision_type,
    dj.expected_outcome,
    dj.actual_outcome,
    dj.outcome_score,
    dj.status,
    dj.decided_at,
    1 - (dj.embedding <=> query_embedding) as similarity
  from public.decision_journal dj
  where dj.embedding is not null
    and 1 - (dj.embedding <=> query_embedding) > match_threshold
    and (filter_department is null or dj.department = filter_department)
    and (filter_type is null or dj.decision_type = filter_type)
  order by dj.embedding <=> query_embedding
  limit match_count;
$$;
```

**TypeScript interface:**

```typescript
// lib/company/riflessione/types.ts

export interface DecisionEntry {
  id: string;
  title: string;
  description: string;
  department: string;
  decisionType: 'architectural' | 'operational' | 'strategic' | 'tactical';
  sourceTaskId: string | null;
  sourceSessionId: string | null;
  sourceAdr: string | null;
  decidedBy: string;
  expectedOutcome: string;
  expectedBenefit: string | null;
  successCriteria: SuccessCriterion[];
  actualOutcome: string | null;
  outcomeScore: number | null;
  outcomeNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  decidedAt: string;
  reviewDueAt: string | null;
  status: 'active' | 'reviewed' | 'superseded' | 'reverted';
  learnings: DecisionLearning[];
  tags: string[];
}

export interface SuccessCriterion {
  criterion: string;
  measurable: boolean;
  metric?: string;
  target?: number;
}

export interface DecisionLearning {
  learning: string;
  confidence: number;
  applicableToDepartments: string[];
}
```

### 4.2 Feedback Loop

The feedback loop for decisions works as follows:

```
1. RECORD: When a significant decision is made (ADR written, strategy chosen,
   architecture selected), create a decision_journal entry with:
   - expected_outcome, success_criteria
   - review_due_at (typically 2-4 weeks after decision)

2. MONITOR: Daemon checks decisions where review_due_at < now() AND status = 'active'
   - For each overdue decision: creates a task for the owning department
   - Task title: "Review decision: {title}"
   - Task description includes the expected outcome and success criteria

3. REVIEW: Department (or CME) evaluates the decision:
   - actual_outcome: what actually happened
   - outcome_score: 0.0-1.0
   - learnings: extracted insights

4. INDEX: Learnings are extracted and stored in:
   - decision_journal.learnings (structured)
   - company_knowledge (vectorized for RAG)
   - department_memory (if department-specific)

5. INFORM: Future similar decisions can now query:
   - "What happened last time we chose X?"
   - Semantic search finds relevant past decisions and their outcomes
```

### 4.3 Daemon Suggestions Tracking

Currently, daemon `llmSuggestions` in the report are fire-and-forget. Under Forma Mentis, each suggestion becomes trackable:

```typescript
// In the daemon report flow, after generating suggestions:
for (const suggestion of llmSuggestions) {
  // Check if a similar suggestion was already made (semantic dedup)
  const similar = await searchCompanyKnowledge(suggestion.text, {
    category: 'daemon_suggestion',
    threshold: 0.85,
  });

  if (similar.length === 0) {
    // New suggestion: index it
    await indexCompanyKnowledge({
      category: 'daemon_suggestion',
      title: suggestion.title,
      content: suggestion.text,
      metadata: {
        cycleNumber: currentCycle,
        priority: suggestion.priority,
        actioned: false,
      },
    });
  } else {
    // Repeated suggestion: increment times_referenced
    // This signals urgency: the same issue keeps surfacing
    await incrementKnowledgeReference(similar[0].id);
  }
}
```

---

## Layer 5: COLLABORAZIONE -- Structured Multi-Agent Patterns

### Problem

Today, multi-department work is ad-hoc. CME manually coordinates departments, there is no standard protocol for fan-out/fan-in reviews, and the agent-runner.ts has no concept of "department as a callable unit." Each collaboration is reinvented from scratch.

### Solution

Three structural patterns that formalize how departments collaborate, plus changes to how CME invokes departments.

### 5.1 Department-as-Tool Pattern

Each department with `isDirectCallable` skills becomes invocable as a tool by CME or by authorized departments. This does NOT change `agent-runner.ts` (which handles AI model invocation). Instead, it adds a new layer on top.

**New file: `lib/company/collaborazione/department-tool.ts`**

```typescript
// lib/company/collaborazione/department-tool.ts

import { loadDepartmentCards, canQueryDirectly } from '../sinapsi/department-discovery';
import type { DepartmentSkill } from '../sinapsi/types';

export interface DepartmentToolResult {
  department: string;
  skill: string;
  success: boolean;
  result: unknown;
  durationMs: number;
  error?: string;
}

/**
 * Invoke a department skill directly.
 *
 * This is the programmatic equivalent of CME saying:
 * "QA, run the test suite and tell me the results."
 *
 * Authorization: the caller must be in the target department's directQuerySources,
 * OR the caller must be 'cme' (CME can invoke any department).
 */
export async function invokeDepartmentSkill(
  callerDept: string,
  targetDept: string,
  skillId: string,
  params: Record<string, unknown> = {}
): Promise<DepartmentToolResult> {
  const start = Date.now();

  // Authorization check
  if (callerDept !== 'cme' && !canQueryDirectly(callerDept, targetDept)) {
    return {
      department: targetDept,
      skill: skillId,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Department "${callerDept}" is not authorized to query "${targetDept}" directly. Use the task system instead.`,
    };
  }

  // Find the skill
  const cards = loadDepartmentCards();
  const card = cards.get(targetDept);
  if (!card) {
    return {
      department: targetDept,
      skill: skillId,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Department "${targetDept}" not found or has no department-card.json.`,
    };
  }

  const skill = card.skills.find(s => s.id === skillId);
  if (!skill) {
    return {
      department: targetDept,
      skill: skillId,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Skill "${skillId}" not found in department "${targetDept}". Available skills: ${card.skills.map(s => s.id).join(', ')}`,
    };
  }

  if (!skill.isDirectCallable) {
    return {
      department: targetDept,
      skill: skillId,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Skill "${skillId}" is not directly callable. Create a task instead.`,
    };
  }

  // Execute the skill (implementation is skill-specific)
  try {
    const result = await executeSkill(targetDept, skillId, params);
    return {
      department: targetDept,
      skill: skillId,
      success: true,
      result,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      department: targetDept,
      skill: skillId,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Skill execution registry. Maps department:skill to implementation.
 * Implementations are registered at startup, not dynamically loaded.
 */
const skillExecutors: Map<string, (params: Record<string, unknown>) => Promise<unknown>> = new Map();

export function registerSkillExecutor(
  department: string,
  skillId: string,
  executor: (params: Record<string, unknown>) => Promise<unknown>
): void {
  skillExecutors.set(`${department}:${skillId}`, executor);
}

async function executeSkill(
  department: string,
  skillId: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const executor = skillExecutors.get(`${department}:${skillId}`);
  if (!executor) {
    throw new Error(
      `No executor registered for ${department}:${skillId}. ` +
      `Register one with registerSkillExecutor().`
    );
  }
  return executor(params);
}
```

### 5.2 Fan-Out / Fan-In Protocol

For multi-department reviews (e.g., "Architecture, QA, Security, and Finance all review this proposal"), a structured protocol:

```typescript
// lib/company/collaborazione/fan-out.ts

import { createTask } from '../tasks';
import type { Department, Task } from '../types';

export interface FanOutRequest {
  title: string;
  description: string;
  departments: Department[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdBy: string;
  routing: string;
  /** Maximum time to wait for all departments (ms). Default: 5 minutes. */
  timeoutMs?: number;
  /** Payload shared with all departments */
  sharedContext: Record<string, unknown>;
}

export interface FanOutResult {
  parentTaskId: string;
  subtasks: Array<{
    department: Department;
    taskId: string;
    status: 'completed' | 'pending' | 'timeout';
    result: unknown | null;
  }>;
  allCompleted: boolean;
  durationMs: number;
}

/**
 * Fan-out a review request to multiple departments in parallel.
 *
 * Creates a parent task + N subtasks (one per department).
 * Each subtask is independent and can be worked on concurrently.
 *
 * Does NOT wait for completion (async). Use pollFanOut() to check status.
 */
export async function fanOut(request: FanOutRequest): Promise<{
  parentTaskId: string;
  subtaskIds: Record<Department, string>;
}> {
  // 1. Create parent task
  const parentTask = await createTask({
    title: `[FAN-OUT] ${request.title}`,
    description: request.description,
    department: 'architecture', // CME is the logical owner
    priority: request.priority,
    createdBy: request.createdBy,
    routing: request.routing,
    labels: ['fan-out', 'multi-dept'],
    tags: request.departments,
  });

  // 2. Create subtasks for each department
  const subtaskIds: Record<string, string> = {};
  for (const dept of request.departments) {
    const subtask = await createTask({
      title: `[REVIEW] ${request.title}`,
      description: `Fan-out review request. Shared context:\n${JSON.stringify(request.sharedContext, null, 2)}`,
      department: dept,
      priority: request.priority,
      createdBy: request.createdBy,
      parentTaskId: parentTask.id,
      routing: request.routing,
      labels: ['fan-out-subtask'],
    });
    subtaskIds[dept] = subtask.id;
  }

  return { parentTaskId: parentTask.id, subtaskIds: subtaskIds as Record<Department, string> };
}

/**
 * Fan-in: check if all subtasks of a fan-out are completed.
 * Returns the aggregated results.
 */
export async function fanIn(parentTaskId: string): Promise<FanOutResult> {
  // Query all subtasks with this parent
  // Check their status
  // Return aggregated result
  // Implementation uses getOpenTasks with parentTaskId filter
  return {} as FanOutResult; // implementation follows getOpenTasks pattern
}
```

### 5.3 Loop Pattern for Iterative Tasks

For tasks that require iteration (backtest tuning, prompt optimization, grid search), a structured loop pattern:

```typescript
// lib/company/collaborazione/iteration-loop.ts

export interface IterationConfig {
  /** Maximum number of iterations */
  maxIterations: number;
  /** Success criterion: when to stop iterating */
  successCriterion: (result: unknown) => boolean;
  /** Generate the next iteration's parameters based on previous result */
  nextParams: (iteration: number, previousResult: unknown) => Record<string, unknown>;
  /** Department that executes each iteration */
  executorDepartment: string;
  /** Skill to invoke (if direct-callable) or task title prefix */
  skillOrTaskTitle: string;
}

export interface IterationResult {
  iterations: Array<{
    number: number;
    params: Record<string, unknown>;
    result: unknown;
    durationMs: number;
    meetsSuccessCriterion: boolean;
  }>;
  converged: boolean;
  totalIterations: number;
  totalDurationMs: number;
  bestResult: unknown;
  bestIteration: number;
}
```

This pattern is used for:
- **Backtest optimization**: `maxIterations=10`, `successCriterion=(r) => r.sharpe > 1.0`
- **Prompt tuning**: `maxIterations=5`, `successCriterion=(r) => r.accuracy > 0.95`
- **Grid search**: `maxIterations=96`, `successCriterion=(r) => r.sharpe > 1.0`

### 5.4 Changes to agent-runner.ts

**No changes to agent-runner.ts.** The agent-runner handles AI model invocation with fallback chains. Department collaboration is a higher-level concern that operates above the model layer.

The only new agent added to the tier system is `session-summarizer` (for Layer 1):

```typescript
// Addition to AGENT_CHAINS in lib/tiers.ts

'session-summarizer': [
  'cerebras-gpt-oss-120b',  // cheapest first (summary is simple task)
  'groq-llama4-scout',
  'gemini-2.5-flash',
  'mistral-small-3',
],
```

```typescript
// Addition to TIER_START in lib/tiers.ts

'session-summarizer': { partner: 0, associate: 0, intern: 0 },
// Always starts at cheapest — summaries don't need quality models
```

```typescript
// Addition to AGENT_EXECUTION_MODE in lib/tiers.ts

'session-summarizer': 'sdk',  // lightweight, no CLI needed
```

```typescript
// Addition to CLI_MODEL_MAP in lib/tiers.ts

'session-summarizer': 'haiku',  // fallback if CLI mode ever used
```

---

## Implementation Order

### Dependencies

```
Layer 1 (MEMORIA) ─── standalone, no dependencies
      │
      ├── Layer 2 (SINAPSI) ─── needs department-card.json files (manual creation)
      │
      ├── Layer 3 (COSCIENZA) ─── needs Layer 1 for session recording
      │         │
      │         └── Layer 4 (RIFLESSIONE) ─── needs Layer 3 for goal-linked decisions
      │
      └── Layer 5 (COLLABORAZIONE) ─── needs Layer 2 for department discovery
```

### Phase 1: MEMORIA (Week 1-2)

| Step | Action | Files | Effort |
|------|--------|-------|--------|
| 1.1 | Create migration SQL | `supabase/migrations/040_forma_mentis_memoria.sql` | 1h |
| 1.2 | Create TypeScript types | `lib/company/memory/types.ts` | 30min |
| 1.3 | Implement session recorder | `lib/company/memory/session-recorder.ts` | 2h |
| 1.4 | Implement department memory CRUD | `lib/company/memory/department-memory.ts` | 2h |
| 1.5 | Implement company knowledge CRUD | `lib/company/memory/company-knowledge.ts` | 2h |
| 1.6 | Implement company RAG | `lib/company/memory/company-rag.ts` | 3h |
| 1.7 | Add `session-summarizer` agent to tiers | `lib/tiers.ts`, `lib/models.ts` | 30min |
| 1.8 | Integration: hook session recording into daemon | `scripts/cme-autorun.ts` (modify) | 1h |
| 1.9 | Tests | `tests/unit/company/memory.test.ts` | 2h |

**Total: ~14 hours**

### Phase 2: SINAPSI (Week 2-3)

| Step | Action | Files | Effort |
|------|--------|-------|--------|
| 2.1 | Define TypeScript types | `lib/company/sinapsi/types.ts` | 30min |
| 2.2 | Create department-card.json for all 12 depts | `company/*/department-card.json` (12 files) | 3h |
| 2.3 | Implement department discovery | `lib/company/sinapsi/department-discovery.ts` | 2h |
| 2.4 | Update contracts.md with direct query protocol | `company/contracts.md` (modify) | 30min |
| 2.5 | Tests | `tests/unit/company/sinapsi.test.ts` | 1h |

**Total: ~7 hours**

### Phase 3: COSCIENZA (Week 3-4)

| Step | Action | Files | Effort |
|------|--------|-------|--------|
| 3.1 | Add goals + daemon_reports tables to migration | `supabase/migrations/040_forma_mentis_memoria.sql` (extend) | 1h |
| 3.2 | Create TypeScript types | `lib/company/coscienza/types.ts` | 30min |
| 3.3 | Implement goals CRUD | `lib/company/coscienza/goals.ts` | 2h |
| 3.4 | Implement metric resolver registry | `lib/company/coscienza/metric-resolver.ts` | 2h |
| 3.5 | Implement daemon report persistence | `lib/company/coscienza/daemon-reports.ts` | 1h |
| 3.6 | Modify daemon to check goals + persist reports | `scripts/cme-autorun.ts` (modify) | 3h |
| 3.7 | Seed initial goals from existing OKRs | `scripts/seed-goals.ts` (new) | 1h |
| 3.8 | Tests | `tests/unit/company/coscienza.test.ts` | 2h |

**Total: ~12.5 hours**

### Phase 4: RIFLESSIONE (Week 4-5)

| Step | Action | Files | Effort |
|------|--------|-------|--------|
| 4.1 | Add decision_journal table to migration | `supabase/migrations/040_forma_mentis_memoria.sql` (extend) | 1h |
| 4.2 | Create TypeScript types | `lib/company/riflessione/types.ts` | 30min |
| 4.3 | Implement decision journal CRUD | `lib/company/riflessione/decision-journal.ts` | 2h |
| 4.4 | Implement feedback loop (review checker) | `lib/company/riflessione/review-checker.ts` | 2h |
| 4.5 | Modify daemon to check overdue reviews | `scripts/cme-autorun.ts` (modify) | 1h |
| 4.6 | Seed existing ADR decisions into journal | `scripts/seed-decisions.ts` (new) | 1h |
| 4.7 | Tests | `tests/unit/company/riflessione.test.ts` | 1h |

**Total: ~8.5 hours**

### Phase 5: COLLABORAZIONE (Week 5-6)

| Step | Action | Files | Effort |
|------|--------|-------|--------|
| 5.1 | Implement department-tool invocation | `lib/company/collaborazione/department-tool.ts` | 3h |
| 5.2 | Implement fan-out/fan-in protocol | `lib/company/collaborazione/fan-out.ts` | 2h |
| 5.3 | Implement iteration loop | `lib/company/collaborazione/iteration-loop.ts` | 2h |
| 5.4 | Register initial skill executors | `lib/company/collaborazione/skill-registry.ts` | 2h |
| 5.5 | Tests | `tests/unit/company/collaborazione.test.ts` | 2h |

**Total: ~11 hours**

### Grand Total: ~53 hours (~7 working days)

### Migration Complexity

Single migration file `040_forma_mentis_memoria.sql` containing:
- 5 new tables: `company_sessions`, `department_memory`, `company_knowledge`, `company_goals`, `daemon_reports`, `decision_journal`
- 4 new RPC functions: `match_company_knowledge`, `match_department_memory`, `match_company_sessions`, `match_decisions`
- 6 HNSW vector indexes (one per table with embeddings)
- RLS policies (service_role only for all tables)
- No changes to existing tables

**Risk**: Low. All new tables. Zero modification to existing schema. Migration is additive.

### What NOT to Change

The following components are explicitly out of scope and must not be modified:

| Component | Reason |
|-----------|--------|
| `lib/vector-store.ts` | Legal RAG works. Company RAG is a separate file. |
| `lib/ai-sdk/agent-runner.ts` | Model invocation is orthogonal to department collaboration. |
| `lib/ai-sdk/generate.ts` | Provider routing is unchanged. |
| `lib/agents/*.ts` | Legal analysis pipeline agents are unchanged. |
| `lib/prompts/*.ts` | Legal prompts are unchanged. |
| `trading/src/**` | Trading pipeline is unchanged. Python code is out of scope. |
| Existing Supabase tables | All 39 existing migrations are preserved. |
| `lib/company/tasks.ts` | Task system is extended, not replaced. |
| `lib/company/sessions.ts` | Session tracker continues working for console sessions. |
| `lib/company/routing.ts` | Decision tree routing is unchanged. |

### New Files Summary

```
lib/company/
  memory/
    types.ts                      # CompanySession, DepartmentMemoryEntry, etc.
    session-recorder.ts           # openSession(), closeSession(), getRecentSessions()
    department-memory.ts          # upsertDepartmentMemory(), getDepartmentMemories()
    company-knowledge.ts          # indexCompanyKnowledge(), searchCompanyKnowledge()
    company-rag.ts               # buildCompanyRAGContext()
  sinapsi/
    types.ts                     # DepartmentCard, DepartmentSkill, etc.
    department-discovery.ts      # loadDepartmentCards(), findByCapability(), canQueryDirectly()
  coscienza/
    types.ts                     # CompanyGoal, GoalAction, GoalValueEntry
    goals.ts                     # CRUD for company_goals
    metric-resolver.ts           # MetricResolver registry
    daemon-reports.ts            # persistDaemonReport(), getRecentReports()
  riflessione/
    types.ts                     # DecisionEntry, SuccessCriterion, DecisionLearning
    decision-journal.ts          # CRUD for decision_journal
    review-checker.ts            # checkOverdueReviews()
  collaborazione/
    department-tool.ts           # invokeDepartmentSkill()
    fan-out.ts                   # fanOut(), fanIn()
    iteration-loop.ts            # runIterationLoop()
    skill-registry.ts            # registerSkillExecutor(), initial registrations

company/*/department-card.json   # 12 files, one per department

supabase/migrations/
  040_forma_mentis_memoria.sql   # All new tables, indexes, RPC functions

scripts/
  seed-goals.ts                  # Seed initial goals from OKRs
  seed-decisions.ts              # Seed existing ADR decisions

tests/unit/company/
  memory.test.ts
  sinapsi.test.ts
  coscienza.test.ts
  riflessione.test.ts
  collaborazione.test.ts
```

### Modified Files

```
lib/tiers.ts                     # Add 'session-summarizer' agent chain
lib/models.ts                    # Add 'session-summarizer' to AgentName type (if needed)
scripts/cme-autorun.ts           # Hook session recording + goal checking + report persistence
company/contracts.md             # Add direct query protocol section
```

---

## Cost Analysis

### Embedding Costs (Voyage AI)

- Session summaries: ~1 embedding per session (negligible at current volume)
- Department memories: ~10-50 embeddings per week (negligible)
- Company knowledge: ~5-20 embeddings per week (negligible)
- Decision journal: ~1-5 embeddings per week (negligible)

**Estimated monthly embedding cost: < $0.10** (using existing Voyage AI key, voyage-law-2 pricing at $0.12/1M tokens)

### LLM Costs (Session Summarizer)

- Uses cheapest models (Cerebras/Groq free tier)
- ~1-5 summaries per day, ~200 tokens each
- **Estimated monthly cost: ~$0.00** (free tier models)

### Storage Costs (Supabase)

- 6 new tables, moderate growth (hundreds of rows per week, not thousands)
- Vector indexes: 6 HNSW indexes, manageable at current scale
- **No additional Supabase cost** (within free/pro tier limits)

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Embedding costs grow unexpectedly | Low | Low | All company tables use same Voyage AI key with known pricing. Monitor via cost-logger. |
| Department cards become stale | Medium | Medium | Daemon checks card freshness. Alert if card not updated in 30 days. |
| Goal metric resolution fails | Medium | Low | MetricResolver returns null on failure, daemon logs warning but continues. |
| Decision reviews never happen | Medium | Medium | Daemon auto-creates review tasks. Repeated reminder escalation (L1 -> L2 -> L3). |
| Session summaries are low quality | Low | Low | Summaries are informational, not decision-critical. Use cheapest model by design. |
| Migration conflicts with future work | Low | Medium | Single additive migration, no FK to modified tables. |

---

## Decision

**Adopt Forma Mentis architecture as described.** Begin with Layer 1 (MEMORIA) as it has no dependencies and delivers immediate value (cross-session memory). Layers 2-5 follow in order based on dependencies.

The architecture transforms the virtual company from "isolated sessions" to "one organism" while preserving all existing functionality and keeping costs near zero.
