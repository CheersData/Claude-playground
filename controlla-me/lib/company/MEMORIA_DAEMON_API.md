# Forma Mentis Daemon Integration — API Reference

**File:** `lib/company/memoria-daemon-integration.ts`
**Entrypoint:** `scripts/cme-autorun.ts`

## Quick Start

```typescript
import {
  loadFormaMentisContext,
  registerDaemonExecutors,
  formatDepartmentStatusSummary,
} from "@/lib/company/memoria-daemon-integration";

// At daemon startup
registerDaemonExecutors();

// Load all context layers in parallel
const { context, memoryBlock, goalBlock, statusBlock } =
  await loadFormaMentisContext();

// Use in LLM prompt
const prompt = buildAnalysisPrompt({
  memoryContext: memoryBlock,
  goalContext: goalBlock,
  statusContext: statusBlock,
});
```

---

## API Layers

### Layer 1: MEMORIA (Memory System)

#### Session Recording
```typescript
// Open session at startup
const sessionId = await openSession({
  sessionType: "daemon",
  department: "operations",
  startedBy: "cme-daemon",
  metadata: { cycle: 42 },
});

// Get recent sessions
const sessions = await getRecentSessions(undefined, 3);

// Close with summary + learnings
await closeSession(sessionId, {
  summary: "Analyzed 47 signals, 5 critical",
  keyDecisions: [{
    decision: "Escalate trading risk",
    rationale: "Kill switch active"
  }],
});
```

#### Department Memory (Warnings, Learnings, Context)
```typescript
// Save a department warning
await upsertDepartmentMemory({
  department: "trading",
  category: "warning",
  key: "kill-switch-active",
  content: "Stop loss threshold exceeded: -2%",
  confidence: 0.95,
  expiresAt: new Date(Date.now() + 48*60*60*1000).toISOString(),
});

// Retrieve memories for a department
const warnings = await getDepartmentMemories("trading", {
  categories: ["warning"],
  limit: 5,
});

// Search semantically
const related = await searchDepartmentMemory("trading", "risk threshold");

// Clean up expired memories
const expired = await expireDepartmentMemories("trading");
```

#### Company Knowledge (Patterns, Decisions, Incidents)
```typescript
// Index a new pattern
const id = await indexCompanyKnowledge({
  category: "pattern",
  title: "Trading kill switch activated",
  content: "Kill switch triggers when portfolio loss > -2% daily",
  departments: ["trading"],
  sourceTaskId: "task-123",
  metadata: { detectedAt: new Date().toISOString() },
});

// Search for similar patterns
const results = await searchCompanyKnowledge("kill switch risk");
```

---

### Layer 3: COSCIENZA (Goal Monitoring)

#### Goal Management
```typescript
// Create a goal
const goal = await createGoal({
  title: "Backtest Sharpe > 1.0",
  description: "Achieve Sharpe ratio above 1.0 in live trading",
  metric: "sharpe_ratio",
  targetValue: 1.0,
  currentValue: 0.975,
  unit: "ratio",
  department: "trading",
  ownerAgent: "trading-lead",
  deadline: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
  checkIntervalMinutes: 1440, // Daily
});

// Update goal progress
await updateGoalValue(goal.id, 0.98);

// Get active goals
const goals = await getActiveGoals("trading");
const atRiskGoals = goals.filter(g => g.status === "at_risk");
```

#### Goal Checking (Daemon)
```typescript
// Evaluate all active goals
const checks = await checkGoals();
// Returns: [
//   {
//     goalId: "goal-123",
//     goalTitle: "Backtest Sharpe > 1.0",
//     previousValue: 0.975,
//     currentValue: 0.98,
//     targetValue: 1.0,
//     status: "at_risk",
//     actionTaken: "Escalated to priority high"
//   }
// ]
```

---

### Layer 4: RIFLESSIONE (Decision Journal)

#### Decision Recording
```typescript
// Record a significant decision
const decision = await recordDecision({
  title: "Switch to Slope+Volume strategy",
  description: "Shift from RSI+MACD to slope OLS + volume strategy for 1Min bars",
  department: "trading",
  decisionType: "strategy_change",
  decidedBy: "cme-daemon",
  expectedOutcome: "Better intraday signals, faster exits",
  successCriteria: [
    { criterion: "Win rate > 50%", weight: 0.4 },
    { criterion: "Sharpe > 0.8", weight: 0.4 },
    { criterion: "Max DD < 5%", weight: 0.2 },
  ],
  reviewDueAt: new Date(Date.now() + 14*24*60*60*1000).toISOString(),
});
```

#### Decision Review (Daemon)
```typescript
// Get decisions pending outcome evaluation
const pending = await getDecisionsPendingReview();
// Returns: [
//   {
//     id: "decision-456",
//     title: "Switch trading strategy",
//     status: "active",
//     reviewDueAt: "2026-03-25T00:00:00Z"
//   }
// ]

// Record outcome after decision review period
await recordDecisionOutcome(decision.id, {
  outcome: "succeeded",
  actualOutcome: "Sharpe improved to 0.975, win rate 52.1%",
  learnings: [
    { key: "slope-threshold", value: "0.005% is optimal", category: "learning" }
  ],
});
```

---

### Layer 5: COLLABORAZIONE (Multi-Department Coordination)

#### Fan-Out Task Creation
```typescript
// Create a fan-out review across departments
const { parentTaskId, subtaskIds } = await createFanOut({
  departments: ["architecture", "security", "quality-assurance"],
  templateTitle: "Review Forma Mentis Architecture",
  templateDesc: "Evaluate design, security, performance implications",
  priority: "high",
  createdBy: "cme-daemon",
  sharedContext: { adrId: "ADR-forma-mentis" },
});

// Check fan-out status
const status = await checkFanOutStatus(parentTaskId);
// Returns: {
//   parentTaskId: "task-789",
//   completedCount: 2,
//   pendingCount: 1,
//   allCompleted: false,
//   subtasks: [...]
// }

// Aggregate results when complete
const result = await aggregateFanOutResults(parentTaskId);
```

#### Department Skills (Direct Invocation)
```typescript
// List available skills across all departments
const allSkills = listAvailableSkills();

// List skills for a specific department
const qaSkills = listAvailableSkills("quality-assurance");

// Validate parameters before invocation
const validation = validateSkillParams(
  "quality-assurance",
  "run-tests",
  { suite: "e2e" }
);
if (validation.valid) {
  const result = await invokeDepartmentSkill(
    "quality-assurance",
    "run-tests",
    { suite: "e2e" },
    "cme" // caller
  );
}
```

---

### SINAPSI: Department Status Readers (Daemon)

```typescript
// Read individual department status
const qaStatus = readQAStatus();
// Returns: {
//   department: "quality-assurance",
//   status: "operational",
//   lastUpdate: "2026-03-18T13:45:00Z",
//   currentFocus: "E2E test coverage",
//   activeMetrics: { testSuites: 12, coverage: 78 },
// }

// Read all 4 department statuses
const allStatuses = readAllDepartmentStatuses();

// Format as markdown block for LLM prompt
const summary = formatDepartmentStatusSummary();
// Returns:
// ## DEPARTMENT STATUS SNAPSHOT
//
// ### 🟢 quality-assurance (operational)
// - Last update: 2026-03-18 13:45
// - Focus: E2E test coverage
// - testSuites: 12
// ...
```

#### Executor Registration (Daemon)
```typescript
// Register all daemon skill executors at startup
registerDaemonExecutors();

// Check if executors are healthy
const { registered, missing } = checkDaemonExecutorHealth();
if (!registered) {
  console.warn("Missing executors:", missing);
}
```

---

## Context Loading (Complete Integration)

```typescript
/**
 * Load complete Forma Mentis context at daemon startup.
 * Combines all 5 layers + SINAPSI in parallel.
 */
const { context, memoryBlock, goalBlock, statusBlock } =
  await loadFormaMentisContext();

// Returns:
// {
//   context: {
//     timestamp: "2026-03-18T13:50:00Z",
//     recentSessions: [...],
//     departmentMemories: [...],
//     activeGoals: [...],
//     pendingDecisions: 3,
//     recentReports: [...],
//     departmentStatuses: "...",
//   },
//   memoryBlock: "## MEMORIA DIPARTIMENTALE\n...",
//   goalBlock: "## GOAL TRACKING\n...",
//   statusBlock: "## DEPARTMENT STATUS\n...",
// }
```

The 4 text blocks (memory, goal, status, history) are injected directly into the LLM analysis prompt for context-aware decision making.

---

## Error Handling

All functions follow a **fire-and-forget** pattern:
- **Failures are logged** but never propagated
- **Partial results returned** (e.g., if some memories fail to load, others still return)
- **Daemon never blocks** on context loading failures
- **Graceful degradation** — fewer context blocks used if layers fail

Example:
```typescript
const formaMentisContext = await loadFormaMentisContext();
// If vector DB is down: memoryBlock = ""
// If goals table is empty: activeGoals = []
// If department status files missing: statusBlock shows "unknown" status
// Daemon continues normally — just with less context.
```

---

## Performance Targets

| Operation | Target | Typical |
|-----------|--------|---------|
| `loadFormaMentisContext()` | < 2s | 400-600ms |
| `registerDaemonExecutors()` | < 100ms | 50ms |
| Individual status reads | < 50ms | 5-10ms |
| Department memory search | < 1s | 200-400ms |
| Goal checking | < 2s | 500-800ms |

All queries use DB indexes and are optimized for read-heavy workloads.

---

## Integration Checklist

- [x] Department status readers created (4 readers + batch + formatter)
- [x] Context loader created (parallel loading of 5 layers + SINAPSI)
- [x] Daemon executor registration system created
- [x] Daemon startup modified to load context
- [x] Prompt building enhanced with 3 new context blocks (memory, goals, status)
- [x] Error handling (fire-and-forget, graceful degradation)
- [x] API consolidated into single import
- [x] Documentation complete

---

## See Also

- **Architecture Decision:** `company/architecture/adr/ADR-forma-mentis.md`
- **Daemon Implementation:** `scripts/cme-autorun.ts`
- **Database Migrations:** `supabase/migrations/040_forma_mentis.sql`
- **Daemon Reports:** `lib/company/coscienza/daemon-reports.ts`
- **Goal Monitoring:** `lib/company/coscienza/goal-monitor.ts`
