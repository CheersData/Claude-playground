# Health Check — 2026-03-09

## Summary

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | 0 errors |
| ESLint (`app/ lib/ components/`) | 6 errors, 38 warnings (44 total) |
| Unused dependencies (`depcheck`) | 3 unused devDeps, 2 missing deps |

---

## 1. TypeScript Errors: 0

`npx tsc --noEmit` passed cleanly with zero errors. Type safety is solid.

---

## 2. ESLint: 6 errors + 38 warnings

### 6 Errors (must fix)

| File | Line | Rule | Issue |
|------|------|------|-------|
| `app/mattia/MattiaClient.tsx` | 423 | `react-hooks/set-state-in-effect` | `setImages([])` called synchronously in useEffect |
| `app/api/console/route.ts` | 147 | `react-hooks/purity` | `new Date()` impure call during render |
| `app/api/console/route.ts` | 150 | `react-hooks/purity` | `new Date()` impure call during render |
| `components/ops/DebugPanel.tsx` | 293 | `react-hooks/purity` | `Date.now()` impure call in render-time function |
| `components/ops/DebugPanel.tsx` | 282 | `react-hooks/purity` | `Date.now()` impure call in render-time function |
| `components/ops/DebugStrip.tsx` | 160 | `react-hooks/set-state-in-effect` | `setInternalExpanded(false)` called synchronously in useEffect |

### 38 Warnings breakdown

| Category | Count | Files affected |
|----------|-------|----------------|
| `@typescript-eslint/no-unused-vars` (unused variables/imports) | 28 | 13 files |
| `react-hooks/exhaustive-deps` (missing hook dependencies) | 4 | 2 files |
| Unused `eslint-disable` directives | 3 | 3 files |
| `react-hooks/purity` (impure render calls) | 3 | 2 files |

### Warnings by file

| File | Warnings | Details |
|------|----------|---------|
| `app/legaloffice/LegalOfficeClient.tsx` | 7 | 5 unused vars/imports, 2 missing hook deps |
| `app/HomePageClient.tsx` | 3 | 3 unused vars (`error`, `phaseEstimates`, `handleRetry`) |
| `app/mattia/MattiaClient.tsx` | 2 | 2 unused imports (`Check`, `TrendingUp`) |
| `app/api/console/route.ts` | 3 | 3 purity warnings (`Date.now()` in render) |
| `lib/cdp/profile-builder.ts` | 2 | 2 unused `supabase` assignments (lines 228, 316) |
| `components/ops/QAResultsDashboard.tsx` | 3 | 1 unused import, 1 unused directive, 1 unused var |
| `components/ops/DebugPanel.tsx` | 2 | 2 purity warnings (`Date.now()`) |
| `components/workspace/AgentBox.tsx` | 2 | 1 unused var, 1 unused param |
| `components/workspace/WorkspaceRightPanel.tsx` | 2 | 1 unused param, 1 unused directive |
| `components/ops/StressTestResultsPanel.tsx` | 1 | unused import `Activity` |
| `components/ops/VisionMissionPanel.tsx` | 1 | unused import `TrendingUp` |
| `components/ops/OverviewSummaryPanel.tsx` | 1 | unused var `healthEmoji` |
| `components/ops/LiveConsolePanel.tsx` | 1 | unused eslint-disable directive |
| `components/workspace/FinalEvaluationPanel.tsx` | 1 | unused import `Lightbulb` |
| `lib/gemini.ts` | 1 | unused var `RETRY_WAIT_MS` |
| `lib/staff/data-connector/connectors/openstax.ts` | 1 | unused var `OPENSTAX_ARCHIVE` |

---

## 3. Unused Dependencies

### Unused devDependencies (3)

| Package | Notes |
|---------|-------|
| `@tailwindcss/postcss` | May be loaded implicitly by PostCSS config -- verify before removing |
| `@vitest/coverage-v8` | Coverage provider for Vitest -- likely used via `vitest --coverage`, depcheck cannot detect this |
| `cross-env` | Check if any npm scripts use it; if not, safe to remove |

### Missing dependencies (2)

| Package | Used in |
|---------|---------|
| `undici` | `scripts/seed-normattiva.ts` |
| `fflate` | `scripts/seed-opendata.ts` |

These are scripts-only dependencies. They may work via Node.js built-in (`undici` is bundled in Node 18+) or were installed globally. Low risk but worth adding to `devDependencies` for reproducibility.

---

## 4. Recommended Cleanup Actions

### Priority 1 — Fix 6 ESLint errors

1. **`app/mattia/MattiaClient.tsx:423`** — Move `setImages([])` out of useEffect body. Use a ref or restructure to avoid synchronous setState in effect.
2. **`components/ops/DebugStrip.tsx:160`** — Same pattern: `setInternalExpanded(false)` in useEffect. Consider using a derived state or moving the reset logic.
3. **`app/api/console/route.ts:147,150`** — Wrap `new Date()` calls in a `useMemo` or move to event handler. These are flagged as impure render-time calls.
4. **`components/ops/DebugPanel.tsx:282,293`** — `Date.now()` in `formatLastCall`. Move to a `useEffect`/`useCallback` or accept the impurity with an eslint-disable comment (with justification).

### Priority 2 — Clean up 28 unused variable warnings

These are all safe, mechanical fixes:
- Remove unused imports: `Activity`, `TrendingUp` (x3), `Globe`, `BookOpen`, `Check`, `Lightbulb`, `motion`
- Remove unused variables: `error`, `phaseEstimates`, `handleRetry`, `AGENT_LABELS`, `documentType`, `overallRisk`, `healthEmoji`, `filteredEvaluated`, `RETRY_WAIT_MS`, `OPENSTAX_ARCHIVE`
- Prefix unused params with `_`: `onArticleClick` -> `_onArticleClick`, `onClose` -> `_onClose`
- Remove unused `supabase` assignments in `lib/cdp/profile-builder.ts` (lines 228, 316)

### Priority 3 — Fix 4 missing hook dependencies

- `app/legaloffice/LegalOfficeClient.tsx:322` — Add `leaderMessages` to useCallback deps
- `app/legaloffice/LegalOfficeClient.tsx:349` — Add `BLOCK_LABELS` to useCallback deps (or move BLOCK_LABELS outside component)

### Priority 4 — Remove 3 stale eslint-disable directives

- `components/workspace/WorkspaceRightPanel.tsx:21`
- `components/ops/LiveConsolePanel.tsx:598`
- `components/ops/QAResultsDashboard.tsx:463`

### Priority 5 — Dependency cleanup

- Verify `@tailwindcss/postcss` is referenced in `postcss.config.*` before removing
- Verify `cross-env` is not used in any `package.json` scripts before removing
- Keep `@vitest/coverage-v8` (false positive — used by vitest coverage command)
- Add `undici` and `fflate` to `devDependencies` for script reproducibility

---

## Trend

This is the first automated health check. Future runs will track delta.
