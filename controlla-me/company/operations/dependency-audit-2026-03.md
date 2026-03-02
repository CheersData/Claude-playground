# Dependency Audit Report — March 2026

**Auditor:** ops-monitor agent (Operations dept)
**Date:** 2026-03-01
**Scope:** All production and dev dependencies in `package.json`
**Objective:** Version discrepancy check, security scan, outdated packages review

---

## 1. Version Discrepancies (CLAUDE.md vs installed)

### 1.1 `openai` — DISCREPANCY CONFIRMED

| | CLAUDE.md | package.json | Installed |
|---|-----------|-------------|-----------|
| Version | 5.x | ^6.24.0 | 6.24.0 |

**Status: Major version mismatch in documentation.**

The codebase was migrated to openai SDK v6, but CLAUDE.md still documents "5.x".

**Breaking change analysis for `lib/ai-sdk/openai-compat.ts`:**

The file uses only these v6 APIs:
- `new OpenAI({ apiKey, baseURL })` -- constructor unchanged in v6
- `client.chat.completions.create({ model, messages, max_tokens, temperature, response_format })` -- core API unchanged in v6
- `response.choices[0]?.message?.content` -- response shape unchanged
- `response.usage?.prompt_tokens` / `completion_tokens` -- unchanged
- `OpenAI.Chat.Completions.ChatCompletionMessageParam` type -- still valid in v6

**Risk: NONE.** The breaking changes in openai v6 (named path parameters, `.del()` to `.delete()`, `httpAgent` removal, Web API response types, import path reorganization) do NOT affect our usage. We only use `chat.completions.create` with standard parameters and do not use any of the changed APIs (Assistants, file operations, streaming body, custom HTTP agents, submodule imports).

**Action required:** Update CLAUDE.md to document `openai` as `6.x` instead of `5.x`.

### 1.2 `@google/genai` — MINOR DISCREPANCY

| | CLAUDE.md | package.json | Installed |
|---|-----------|-------------|-----------|
| Version | 1.x | ^1.42.0 | 1.42.0 |

**Status: Documentation says "1.x" which is technically correct (1.42.0 is within 1.x).**

**Compatibility analysis for `lib/gemini.ts`:**

The file uses:
- `import { GoogleGenAI } from "@google/genai"` -- correct for the new unified SDK
- `new GoogleGenAI({ apiKey })` -- standard constructor
- `client.models.generateContent({ model, contents, config: { systemInstruction, maxOutputTokens, temperature, responseMimeType } })` -- current API
- `response.text` -- current property
- `response.usageMetadata?.promptTokenCount` / `candidatesTokenCount` -- current properties

**Risk: LOW.** The `@google/genai` package is the current recommended SDK (replacing the deprecated `@google/generative-ai`). The API surface used is stable and part of the GA release. However, Google notes that some beta features (e.g., Interactions API) may have breaking changes. Our code does not use any beta features.

**Action required:** Consider updating CLAUDE.md to say `1.42+` for clarity, but `1.x` is not wrong.

### 1.3 Other version notes in CLAUDE.md

| Package | CLAUDE.md | Installed | Match? |
|---------|-----------|-----------|--------|
| Next.js | 16.1.6 | 16.1.6 | YES |
| React | 19.2.3 | 19.2.3 | YES |
| TypeScript | 5 | 5.9.3 | YES |
| @anthropic-ai/sdk | 0.77.0 | 0.77.0 | YES |
| framer-motion | 12.34.2 | 12.34.2 | YES |
| lucide-react | 0.575.0 | 0.575.0 | YES |
| @supabase/supabase-js | 2.97.0 | 2.97.0 | YES |
| stripe | 20.3.1 | 20.3.1 | YES |
| mammoth | 1.11.0 | 1.11.0 | YES |
| pdf-parse | 2.4.5 | 2.4.5 | YES |
| fast-xml-parser | 5.x | 5.3.7 | YES |

---

## 2. Security Vulnerabilities

```
npm audit: found 0 vulnerabilities
```

**Status: CLEAN.** No known security vulnerabilities in the current dependency tree.

---

## 3. Outdated Packages

| Package | Current | Wanted | Latest | Severity |
|---------|---------|--------|--------|----------|
| @anthropic-ai/sdk | 0.77.0 | 0.77.0 | 0.78.0 | Minor patch, outside semver range |
| @google/genai | 1.42.0 | 1.43.0 | 1.43.0 | Minor patch |
| @supabase/supabase-js | 2.97.0 | 2.98.0 | 2.98.0 | Minor patch |
| @tailwindcss/postcss | 4.2.0 | 4.2.1 | 4.2.1 | Patch |
| @types/node | 20.19.33 | 20.19.35 | 25.3.3 | Types — latest is major 25, pinned to ^20 |
| eslint | 9.39.2 | 9.39.3 | 10.0.2 | Major 10 available, pinned to ^9 |
| framer-motion | 12.34.2 | 12.34.3 | 12.34.3 | Patch |
| openai | 6.24.0 | 6.25.0 | 6.25.0 | Minor patch |
| react | 19.2.3 | 19.2.3 | 19.2.4 | Patch — outside pinned range (exact pin) |
| react-dom | 19.2.3 | 19.2.3 | 19.2.4 | Patch — outside pinned range (exact pin) |
| stripe | 20.3.1 | 20.4.0 | 20.4.0 | Minor patch |
| tailwindcss | 4.2.0 | 4.2.1 | 4.2.1 | Patch |

**Summary:** All outdated packages are minor or patch updates. No critical updates pending. Two packages have new major versions available (eslint 10, @types/node 25) but we are correctly pinned to the current majors.

### Notes on specific packages

- **@anthropic-ai/sdk 0.78.0**: Outside our `^0.77.0` semver range (0.x versions treat minor as breaking per semver). Review changelog before updating.
- **react / react-dom 19.2.4**: Pinned exactly (`19.2.3` without `^`), so `npm update` won't pick up the patch. Intentional for stability.
- **eslint 10.0.2**: Major bump. Do NOT upgrade without verifying `eslint-config-next` compatibility with ESLint 10.
- **@types/node 25.x**: Major bump. Pinned to `^20` which matches our Node.js 18+ target. Upgrading to 25 may introduce type incompatibilities.

---

## 4. Breaking Change Risk Assessment

### 4.1 openai v6 — NO RISK (already migrated)

Our sole usage in `lib/ai-sdk/openai-compat.ts` uses only the core `chat.completions.create` API which is unchanged between v5 and v6. The v6 breaking changes affect:

- Named path parameters for Assistants/Threads API -- we don't use these
- `.del()` renamed to `.delete()` -- we don't delete resources
- `httpAgent` replaced by `fetchOptions` -- we don't configure custom agents
- Web API types for streaming -- we don't stream from OpenAI-compat providers
- Import path reorganization (`openai/error` to `openai/core/error`) -- we only import `OpenAI` default

**Verdict:** The migration to v6 was clean. No code changes needed.

### 4.2 @google/genai — LOW RISK

- We use `@google/genai` (the new unified SDK), NOT the deprecated `@google/generative-ai`
- The API surface we use (`GoogleGenAI`, `models.generateContent`, `response.text`, `usageMetadata`) is part of the GA release
- Google has marked some sub-APIs (Interactions) as beta with potential breaking changes, but we don't use those
- The legacy `@google/generative-ai` package reaches end-of-support August 31, 2025 -- we are already on the correct package

**Verdict:** No action needed. Continue updating within `^1.x` range.

### 4.3 @anthropic-ai/sdk 0.78.0 — REVIEW BEFORE UPDATE

Per semver, `0.x` versions treat each minor bump as potentially breaking. The `^0.77.0` range in package.json will NOT automatically install 0.78.0. Before upgrading:
- Review the 0.78.0 changelog for breaking changes to `messages.create`, `web_search` tool, or response types
- Test the classifier, analyzer, investigator, and advisor agents after upgrade

---

## 5. Dependency Import Map

Single points of usage (reduces blast radius):

| Package | Files importing it |
|---------|-------------------|
| `openai` | `lib/ai-sdk/openai-compat.ts` only |
| `@google/genai` | `lib/gemini.ts` only |
| `@anthropic-ai/sdk` | `lib/anthropic.ts` only |
| `stripe` | `lib/stripe.ts` + webhook/checkout routes |
| `@supabase/supabase-js` | `lib/supabase/client.ts`, `server.ts`, `admin.ts` |

This is good architecture -- each external SDK is wrapped in a single adapter file, making future migrations low-effort.

---

## 6. Recommended Actions

### Priority HIGH

| # | Action | Effort | Why |
|---|--------|--------|-----|
| 1 | Update CLAUDE.md: change `openai` version from `5.x` to `6.x` | 1 min | Documentation accuracy. The discrepancy could mislead developers into thinking we need a migration. |

### Priority MEDIUM

| # | Action | Effort | Why |
|---|--------|--------|-----|
| 2 | Run `npm update` to pick up patch-level updates (framer-motion, openai, stripe, tailwindcss, @google/genai, etc.) | 5 min | Stay current on bug fixes. All are within semver range. |
| 3 | Review @anthropic-ai/sdk 0.78.0 changelog before bumping | 15 min | 0.x semver means minor = potentially breaking. Need manual review. |
| 4 | Update react/react-dom pin from `19.2.3` to `19.2.4` | 5 min | Patch update, likely bug fixes. Requires manual version bump since pinned exact. |

### Priority LOW

| # | Action | Effort | Why |
|---|--------|--------|-----|
| 5 | Evaluate eslint 10 migration | 1-2 hours | Major version. Wait for `eslint-config-next` to officially support ESLint 10. Not urgent. |
| 6 | Consider @types/node 22.x bump (skip 25.x for now) | 30 min | Node 22 is current LTS. @types/node@25 may be too bleeding-edge. |
| 7 | Update CLAUDE.md minor version notes for accuracy (`@google/genai` 1.42+, `TypeScript` 5.9.3) | 5 min | Minor documentation hygiene. |

### NO ACTION NEEDED

- `npm audit` is clean -- no security patches required
- openai v6 migration is already complete and working
- @google/genai is on the correct (non-deprecated) package
- All external SDKs are properly wrapped in single adapter files

---

## 7. Summary

| Category | Status |
|----------|--------|
| Security vulnerabilities | CLEAN -- 0 found |
| Version discrepancies | 1 HIGH (openai 5.x vs 6.x in docs), 1 LOW (@google/genai minor) |
| Breaking change risk | NONE for current code |
| Outdated packages | 12 packages have minor/patch updates available |
| Architecture health | GOOD -- all SDKs wrapped in single adapter files |

**Overall assessment: GREEN.** The codebase is healthy from a dependency perspective. The only actionable item is a documentation update in CLAUDE.md to reflect the openai v6 migration that has already been completed.
