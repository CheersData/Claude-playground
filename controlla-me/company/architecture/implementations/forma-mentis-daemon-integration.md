# Implementation: Forma Mentis — Daemon Integration

**Status:** COMPLETE (2026-03-18)
**PR:** #993 — "Daemon con Forma Mentis"
**Owner:** Architecture Builder

---

## Summary

The CME daemon (`scripts/cme-autorun.ts`) now integrates all 5 layers of Forma Mentis + SINAPSI department discovery at startup. This enriches the analysis prompt with company memory, active goals, pending decisions, and real-time department status snapshots—enabling more contextual and informed daemon decision-making.

**Key addition:** The daemon now queries:
- **Layer 1 (MEMORIA)**: Last 3 sessions, active department memories (warnings→learnings→context)
- **Layer 3 (COSCIENZA)**: Active goals + progress + goal-to-goal transitions
- **Layer 4 (RIFLESSIONE)**: Decisions pending review (count + context)
- **SINAPSI**: Real-time department status snapshots (QA, data-eng, ops, trading)

All context is loaded **in parallel** at daemon startup (before LLM analysis phase).

---

## Files Created

### 1. `lib/company/collaborazione/department-status-reader.ts`
**Purpose:** Read-only executors for department status.json files.

**Functions:**
- `readQAStatus()` — Read QA department status
- `readDataEngineeringStatus()` — Read data-eng status
- `readOperationsStatus()` — Read ops status
- `readTradingStatus()` — Read trading status
- `readAllDepartmentStatuses()` — Batch read all 4 departments
- `formatDepartmentStatusSummary()` — Format as markdown block for prompt injection

**Type:** `DepartmentStatus` — standard structure:
```typescript
{
  department: string;
  status: "operational" | "degraded" | "blocked" | "unknown";
  lastUpdate: string | null;
  currentFocus?: string;
  activeMetrics?: Record<string, unknown>;
  errors?: string[];
  summary?: string;
}
```

**Error Handling:** Fire-and-forget. Never throws. Returns partial data if status.json missing.

---

### 2. `lib/company/memory/daemon-context-loader.ts`
**Purpose:** Load complete Forma Mentis context at daemon startup.

**Main Function:**
```typescript
async function loadFormaMentisContext(): Promise<{
  context: FormaMentisContext;
  memoryBlock: string;      // Text for prompt injection
  goalBlock: string;        // Text for prompt injection
  statusBlock: string;      // Text for prompt injection
}>
```

**Parallel Loading:**
- `loadRecentSessionsSummary()` — Last 3 completed sessions
- `loadActiveGoalsSummary()` — Active + at_risk goals with progress %
- `loadAllDepartmentMemories()` — All dept memories (warnings first)
- `getDecisionsPendingReview()` — Decisions past review date
- `readAllDepartmentStatuses()` — Department status snapshot
- `getRecentReports()` — Last 2 daemon reports

**Formatting:**
Each context layer is formatted as a markdown block suitable for LLM prompt injection:
- Memory block groups by department, prioritizes warnings
- Goal block shows progress bars + at_risk indicators
- Status block uses emoji icons (🟢/🟡/🔴)

**Error Handling:** All failures are caught, logged, and return partial data. Never blocks startup.

---

### 3. `lib/company/collaborazione/register-daemon-executors.ts`
**Purpose:** Register skill executors for department status readers.

**Main Function:**
```typescript
function registerDaemonExecutors(): void
```

**Registered Skills:**
| Skill | Department | Description |
|-------|------------|-------------|
| `get-status` | quality-assurance | QA department status |
| `get-status` | data-engineering | Data-eng department status |
| `get-status` | operations | Operations status |
| `get-status` | trading | Trading status |
| `get-all-status` | operations | All 4 departments (bulk read) |
| `get-status-summary` | operations | Formatted markdown summary |

**Health Check:**
```typescript
function checkDaemonExecutorHealth(): { registered: boolean; missing: string[] }
```

---

### 4. `lib/company/memoria-daemon-integration.ts`
**Purpose:** Public API re-exports for daemon integration.

Consolidates all Forma Mentis + SINAPSI functions into a single namespace:
```typescript
import {
  loadFormaMentisContext,
  registerDaemonExecutors,
  formatDepartmentStatusSummary,
  // ... and 20+ other exports
} from "@/lib/company/memoria-daemon-integration";
```

---

## Integration into Daemon

### Modification to `scripts/cme-autorun.ts`

1. **Added imports:**
```typescript
import { loadFormaMentisContext } from "@/lib/company/memory/daemon-context-loader";
import { registerDaemonExecutors } from "@/lib/company/collaborazione/register-daemon-executors";
```

2. **Enhanced `buildAnalysisPrompt()`** to accept:
```typescript
extraContext?: {
  memoryContext?: string;
  goalContext?: string;        // NEW
  statusContext?: string;       // NEW
  reportHistory?: string;
  reportDiffSummary?: string;
}
```

3. **New prompt sections** injected into analysis prompt:
```
## DEPARTMENT STATUS (realtime snapshot)
🟢 operations: operational | Focus: Monitoring | Last update: ...
...

## GOAL TRACKING (active goals + progress)
### trading
  - [████████░░] Backtest Sharpe > 1.0 (87%) — at_risk

...

## MEMORIA DIPARTIMENTALE (warnings, learnings, context)
### trading
  - [warning] Kill switch active: P&L -2% threshold
  - [learning] Slope threshold 0.005 generates false signals
```

4. **Startup flow** (`runOnce()` in `main()`):
```
FASE 1: Daily plan
FASE 2: Vision scan (scanDepartmentStatus)
FASE 2.5: Register daemon executors  [NEW]
FASE 2.75: Load Forma Mentis context [NEW]
FASE 3: LLM analysis (with enriched context)
FASE 4: Report generation + persistence
```

---

## Architecture Decisions

### Why Parallel Loading?
All context queries run in `Promise.all()` for speed:
- Recent sessions (1 query)
- Active goals (1 query)
- Department memories × 13 depts (parallel)
- Pending decisions (1 query)
- Department statuses (5 synchronous file reads)
- Total: < 1 second in normal conditions

### Why Separate Blocks?
Memory + goals + status are formatted separately so the LLM analysis can:
1. Focus on memory warnings (actionable risks)
2. Understand goal progress (calibrate effort)
3. See real-time dept health (context for routing)

### Fire-and-Forget Error Handling
If Forma Mentis loading fails, the daemon continues with default context. This prevents:
- Daemon crashes from DB outages
- Cascading failures if embedding service is down
- Blocking on vector DB queries

The report is still generated; just with fewer context blocks.

---

## Testing

### Manual Test: Verify Context Loading
```bash
cd controlla-me
npx tsx scripts/cme-autorun.ts --dry-run
```

Expected output: Full analysis prompt with Forma Mentis sections included.

### Manual Test: Executor Health
```bash
npx tsx -e "
  import { checkDaemonExecutorHealth } from './lib/company/collaborazione/register-daemon-executors.ts';
  import { registerDaemonExecutors } from './lib/company/collaborazione/register-daemon-executors.ts';
  registerDaemonExecutors();
  const result = checkDaemonExecutorHealth();
  console.log(result);
"
```

Expected: `{ registered: true, missing: [] }`

### Automated: Simulate Daemon Cycle
```bash
npx tsx scripts/cme-autorun.ts --scan
npx tsx scripts/cme-autorun.ts --dry-run
# (First to see signal scan, second to see full enriched prompt)
```

---

## Constraints Respected

✅ **Free tier models:** All context loading uses Supabase client queries (free).
✅ **No breaking changes:** Existing daemon logic unchanged. New code is purely additive.
✅ **Lightweight:** All queries optimized (limit N results, filter on DB side).
✅ **Graceful degradation:** If any layer fails, daemon continues.
✅ **Department status readers:** Synchronous file reads, never throw.

---

## Future Enhancements

1. **Persistent daemon context cache** — Save last context snapshot to avoid re-querying on every cycle
2. **Forma Mentis-aware routing** — Use memory + goals to auto-select routing (e.g., if "trading blocked", route to trading-lead directly)
3. **Goal-based task generation** — Convert at_risk goals into auto-created tasks
4. **Memory decay strategy** — Automatically expire older memories to keep context focused
5. **Decision-action linkage** — If a pending decision is resolved, auto-update related tasks

---

## References

- **ADR:** `company/architecture/adr/ADR-forma-mentis.md`
- **Migration:** `supabase/migrations/040_forma_mentis.sql`
- **Daemon:** `scripts/cme-autorun.ts`
- **Company Knowledge:** `lib/company/memory/company-knowledge.ts`
- **Goal Monitoring:** `lib/company/coscienza/goal-monitor.ts`
- **Department Discovery:** `lib/company/sinapsi/department-discovery.ts`
