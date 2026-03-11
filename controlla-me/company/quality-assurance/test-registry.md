# Test Registry

> Aggiornato: 2026-03-07 | Test totali: ~520+ | P1-P5: tutti chiusi

## Unit Tests (18 file)

| File | Focus | Test stimati |
|------|-------|-------------|
| tests/unit/advisor.test.ts | Advisor agent, scoring, risk | 6 |
| tests/unit/agent-runner.test.ts | Fallback chains, tier switching | ~15 |
| tests/unit/analysis-cache.test.ts | Session caching, phase timing | ~10 |
| tests/unit/analyzer.test.ts | Clause extraction, risk detection | ~8 |
| tests/unit/anthropic.test.ts | JSON parsing, error handling | 12 |
| tests/unit/classifier.test.ts | Document type detection | ~8 |
| tests/unit/console-token.test.ts | HMAC-SHA256 token auth | ~8 |
| tests/unit/extract-text.test.ts | PDF/DOCX/TXT extraction | ~6 |
| tests/unit/generate.test.ts | Provider routing, model selection | ~10 |
| tests/unit/investigator.test.ts | Investigation, web search fallback | ~8 |
| tests/unit/orchestrator.test.ts | Pipeline sequencing, caching | 20 |
| tests/unit/tiers.test.ts | Tier system, agent chains, toggle | ~50 |
| tests/unit/middleware/auth.test.ts | requireAuth, OAuth | ~8 |
| tests/unit/middleware/csrf.test.ts | CSRF token validation | ~6 |
| tests/unit/middleware/rate-limit.test.ts | Rate limiting per IP/user | ~8 |
| tests/unit/middleware/sanitize.test.ts | HTML/input sanitization | ~6 |

## Integration Tests (3 file)

| File | Focus | Test stimati |
|------|-------|-------------|
| tests/integration/analyze-route.test.ts | POST /api/analyze SSE | ~12 |
| tests/integration/corpus-ask-route.test.ts | POST /api/corpus/ask | ~6 |
| tests/integration/vector-search-route.test.ts | POST /api/vector-search | ~6 |

## E2E Tests (13 file)

| File | Focus | Test |
|------|-------|------|
| e2e/analysis.spec.ts | SSE contract, event format | 3 |
| e2e/auth.spec.ts | OAuth flow, landing, pricing | 6 |
| e2e/console.spec.ts | Tier switching, agent toggle | 6 |
| e2e/upload.spec.ts | Upload zone UI, file validation | 7 |
| e2e/deep-search-paywall.spec.ts | Paywall scenarios (FREE/PRO) | 14 |
| tests/e2e/analysis-flow.spec.ts | Upload to results flow | 4 |
| tests/e2e/console-analysis.spec.ts | Console corpus Q&A | 3 |
| tests/e2e/console-auth.spec.ts | Console auth, password | 4 |
| tests/e2e/console.spec.ts | Auth + analysis + corpus | 6 |
| tests/e2e/corpus-qa.spec.ts | Corpus chat, citations | 4 |
| tests/e2e/navigation.spec.ts | Health check pages | 6 |
| tests/e2e/power-panel.spec.ts | Power panel, tier API | 2 |

## Python Tests (2 file)

| File | Focus | Test |
|------|-------|------|
| trading/tests/unit/test_models.py | Model validation | ~20 |
| trading/tests/unit/test_slope_and_trailing.py | Slope strategy + trailing | ~14 |

## Gap Status

| ID | Area | Stato |
|----|------|-------|
| P1 | agent-runner.ts | Chiuso (17 test) |
| P2 | tiers.ts | Chiuso (50+ test) |
| P3 | console-token.ts | Chiuso |
| P4 | analysis-cache.ts | Chiuso |
| P5 | generate.ts | Chiuso |
| E1 | E2E su CI | Aperto (Playwright non su CI) |

## KPI

| Metrica | Target | Attuale |
|---------|--------|---------|
| Test passing | 100% | 100% |
| Coverage | 80% | 72% |
| Type errors | 0 | 0 |
| Lint errors | 0 | 0 |