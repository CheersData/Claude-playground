# Testbook — Controlla.me
**Versione:** 1.0 — 1 marzo 2026
**Owner:** Quality Assurance (test-runner)
**Revisione:** ogni sprint, o dopo modifiche strutturali a `lib/` o `app/api/`

---

## 0. PRINCIPI

1. **Verde reale, non verde cosmetico.** Un test che mocka tutto e non verifica nulla è peggio di nessun test — dà falsa sicurezza.
2. **Testa il contratto, non l'implementazione.** I test non devono rompersi se rinominiamo una variabile interna.
3. **Mock al bordo del sistema.** Mocka I/O (Supabase, API esterne, filesystem). Non mockare la logica applicativa.
4. **Un test = una ragione di fallimento.** Se un test fallisce, deve essere ovvio perché.
5. **CI/CD verde è obbligatorio su main.** Nessun merge con test fail.

---

## 1. STATO ATTUALE COPERTURA (1 marzo 2026)

### Unit test — 212/212 pass ✅

| File testato | File di test | Stato | Note |
|-------------|-------------|-------|------|
| `lib/anthropic.ts` | `tests/unit/anthropic.test.ts` | ✅ 11 test | parseAgentJSON + extractTextContent |
| `lib/agents/classifier.ts` | `tests/unit/classifier.test.ts` | ✅ | Schema output, fallback, JSON |
| `lib/agents/analyzer.ts` | `tests/unit/analyzer.test.ts` | ✅ | Clausole, scoring, punto vista debole |
| `lib/agents/investigator.ts` | `tests/unit/investigator.test.ts` | ✅ | Web search loop, max iterations |
| `lib/agents/advisor.ts` | `tests/unit/advisor.test.ts` | ✅ | Scoring multidim., max 3 risks/actions |
| `lib/agents/orchestrator.ts` | `tests/unit/orchestrator.test.ts` | ✅ | Pipeline completa, SSE events |
| `lib/ai-sdk/agent-runner.ts` | `tests/unit/agent-runner.test.ts` | ✅ 11 test | Fallback chain, provider skip, 429 |
| `lib/tiers.ts` | `tests/unit/tiers.test.ts` | ✅ | AsyncLocalStorage, getAgentChain, toggle |
| `lib/analysis-cache.ts` | `tests/unit/analysis-cache.test.ts` | ✅ | createSession, loadSession, savePhase |
| `lib/extract-text.ts` | `tests/unit/extract-text.test.ts` | ✅ | PDF/DOCX/TXT |
| `lib/middleware/auth.ts` | `tests/unit/middleware/auth.test.ts` | ✅ 5 test | isAuthError |
| `lib/middleware/csrf.ts` | `tests/unit/middleware/csrf.test.ts` | ✅ 13 test | CSRF validation |
| `lib/middleware/rate-limit.ts` | `tests/unit/middleware/rate-limit.test.ts` | ✅ 8 test | Rate limit logic |
| `lib/middleware/sanitize.ts` | `tests/unit/middleware/sanitize.test.ts` | ✅ 17 test | Input sanitization |

### File critici senza test ❌

| File | Priorità | Motivazione |
|------|----------|-------------|
| `lib/ai-sdk/generate.ts` | P1 | Router universale — instrada tutti i provider. Bug silenzioso = tutti gli agenti rotti |
| `lib/middleware/console-token.ts` | P2 | Auth HMAC-SHA256 — errore = accesso non autorizzato alla console |

### Test di integrazione

| Suite | File | Stato |
|-------|------|-------|
| `tests/integration/analysis-flow.spec.ts` | Flow analisi completa | ⚠️ Pre-esistenti, non in scope CI |

### Test E2E — Playwright

| Suite | Stato | Note |
|-------|-------|------|
| `e2e/auth.spec.ts` | ✅ | Landing + auth flow |
| `e2e/upload.spec.ts` | ✅ | Upload zone UI + API /api/upload |
| `e2e/analysis.spec.ts` | ✅ | SSE contract + pipeline UI (mock) |
| `e2e/console.spec.ts` | ⚠️ | Tier switch + agent toggle — skip in CI (richiede CONSOLE_TOKEN) |
| `tests/e2e/*.spec.ts` (7 file) | ✅ | Suite originale |

---

## 2. COSA TESTARE — PER COMPONENTE

### 2.1 `lib/ai-sdk/generate.ts` (P1 — DA IMPLEMENTARE)

**Funzione:** router universale `generate(modelKey, prompt, config)` → chiama il provider corretto.

**Comportamenti da coprire:**

```typescript
// Test 1: routing verso Anthropic
generate("claude-haiku-4.5", prompt) → chiama anthropic.messages.create

// Test 2: routing verso Gemini
generate("gemini-2.5-flash", prompt) → chiama generateWithGemini

// Test 3: routing verso OpenAI-compat (Mistral, Groq, Cerebras, OpenAI, DeepSeek)
generate("mistral-small-3", prompt) → chiama generateWithOpenAICompat con baseURL corretto

// Test 4: config forwarding
generate(key, prompt, { maxTokens: 1000, temperature: 0.3 }) → parametri passati al provider

// Test 5: errore per modelKey sconosciuto
generate("modello-inesistente", prompt) → throw con messaggio chiaro

// Test 6: GenerateResult shape
result.text, result.usage.inputTokens, result.usage.outputTokens, result.durationMs, result.model, result.provider
```

**Mock da usare:**
```typescript
vi.mock("@/lib/anthropic", () => ({ anthropic: mockAnthropicClient, extractTextContent: mockExtract }))
vi.mock("@/lib/gemini", () => ({ generateWithGemini: mockGemini }))
vi.mock("@/lib/ai-sdk/openai-compat", () => ({ generateWithOpenAICompat: mockOpenAI }))
```

---

### 2.2 `lib/middleware/console-token.ts` (P2 — DA IMPLEMENTARE)

**Funzioni da testare:** `issueToken()`, `verifyToken()`, `requireConsoleAuth()`, `refreshToken()`

**Comportamenti da coprire:**

```typescript
// Test 1: issueToken → token valido
const token = issueToken(payload)
// token è stringa non vuota, formato base64url.hex

// Test 2: verifyToken → payload corretto
const result = verifyToken(token)
result.nome === payload.nome, result.ruolo === payload.ruolo

// Test 3: token scaduto → verifyToken ritorna null
const expiredToken = issueToken({ ...payload, exp: Date.now() - 1000 })
verifyToken(expiredToken) === null

// Test 4: token manomesso → verifyToken ritorna null
const tampered = token.slice(0, -5) + "xxxxx"
verifyToken(tampered) === null

// Test 5: requireConsoleAuth → request senza token → NextResponse 401
// Test 6: requireConsoleAuth → request con token valido → ritorna ConsoleAuth object
// Test 7: refreshToken → aggiorna tier e disabledAgents, mantiene gli altri campi
```

**Strategia mock:**
```typescript
// Usare secret fisso nel test tramite env var
process.env.CONSOLE_JWT_SECRET = "test-secret-32-chars-minimum-ok!"
// Non mockare crypto — testare la crittografia reale
```

---

### 2.3 Agenti — pattern comune (riferimento)

Ogni agente rispetta questo pattern di test:

```typescript
describe("runClassifier", () => {
  it("ritorna schema valido su input normale")
  it("gestisce JSON con code fence (fallback parser)")
  it("rispetta MAX_TOKENS output")
  it("usa il punto di vista della parte debole") // solo analyzer
  it("non inventa sentenze — usa 'orientamento non verificato'") // solo investigator
  it("tronca a max 3 risks e max 3 actions") // solo advisor
})
```

---

## 3. STANDARD DI QUALITÀ

### Green Gate (obbligatorio per merge su main)

```
✅ 212/212 unit test pass (o superiore con nuovi test)
✅ TypeScript: 0 errori (npx tsc --noEmit)
✅ ESLint lib/ + app/api/: 0 errori (warning tollerati, errori no)
✅ Build produzione: npm run build completato senza errori
```

### Soglie consigliate

| Metrica | Target | Critico |
|---------|--------|---------|
| Unit test pass rate | 100% | <98% = blocca deploy |
| TypeScript errors | 0 | >0 = blocca deploy |
| ESLint errors (lib + api) | 0 | >0 = blocca merge |
| ESLint warnings | <20 | >50 = crea task fix |
| Build time | <3 min | >10 min = investigare |

---

## 4. COME SCRIVERE UN NUOVO TEST

### Template base

```typescript
/**
 * Tests: lib/path/to/module.ts
 *
 * Copre:
 * - Funzionalità 1
 * - Funzionalità 2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────
const mockDipendenza = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dipendenza", () => ({ funzione: mockDipendenza }));

// ── Import dopo i mock ───────────────────────────────────────────────────────
import { funzioneDaTestare } from "@/lib/path/to/module";

// ── Setup ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // stato default mock
});

// ── Test ─────────────────────────────────────────────────────────────────────
describe("funzioneDaTestare", () => {
  describe("caso normale", () => {
    it("descrizione comportamento atteso", async () => {
      // Arrange
      mockDipendenza.mockResolvedValue({ data: "ok" });

      // Act
      const result = await funzioneDaTestare("input");

      // Assert
      expect(result.field).toBe("expected");
      expect(mockDipendenza).toHaveBeenCalledWith("input");
    });
  });

  describe("gestione errori", () => {
    it("lancia errore su input non valido", async () => {
      await expect(funzioneDaTestare("")).rejects.toThrow(/messaggio/i);
    });
  });
});
```

### Regole mock

1. **`vi.hoisted()`** per tutti i mock — evita l'errore "Cannot access before initialization"
2. **`vi.clearAllMocks()` in `beforeEach`** — ogni test parte da stato pulito
3. **`vi.mock` con factory** — non usare `vi.spyOn` su moduli ES (instabile)
4. **Non mockare la logica applicativa** — solo I/O: Supabase, API HTTP, filesystem

---

## 5. GESTIONE FAIL

### Procedura quando un test fallisce in CI

1. **Non pushare mai su main con test fail** — fix prima, merge dopo
2. Leggere il messaggio di errore completo (non solo il nome del test)
3. Identificare: fail per bug nel codice o fail per test obsoleto?
   - Bug nel codice → fix il codice, non il test
   - Test obsoleto → aggiornare il test con commento che spiega il cambiamento
4. Se il fix richiede più di 2h → aprire task QA con priorità high
5. Se il fail è in integration test pre-esistente (analyze-route) → documentare, non bloccare il deploy

### Fail pre-esistenti noti (da risolvere)

| File | Tipo | Causa | Priorità |
|------|------|-------|----------|
| `tests/integration/analysis-flow.spec.ts` | Integration | Mock SSE incompleto | Media |

---

## 6. ESECUZIONE LOCALE

```bash
# Suite completa
npm test

# Watch mode (sviluppo)
npm run test:watch

# Coverage report
npm run test:coverage

# Solo un file
npx vitest run tests/unit/agent-runner.test.ts

# E2E (richiede server running)
npm run test:e2e

# TypeScript check
npx tsc --noEmit

# ESLint percorsi critici
npx eslint lib/ app/api/ --ext .ts
```

---

## 7. ROADMAP TEST

| Sprint | Task | Effort |
|--------|------|--------|
| Ora | generate.ts — P1 | 2-3h |
| Ora | console-token.ts — P2 | 3-4h |
| Ora | Fix prefer-const ESLint (rate-limit.ts:20) | 5 min |
| Ora | Fix 13 no-unused-vars warnings (lib/staff/) | 1h |
| Q2 | corpus-agent.ts test | 2h |
| Q2 | question-prep.ts test | 1h |
| Q2 | vector-store.ts test (con pgvector mock) | 4h |
| Q2 | legal-corpus.ts test | 3h |
