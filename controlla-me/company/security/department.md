# Security

## Missione

Proteggere Controlla.me e i suoi utenti. App legale = dati sensibili. Zero compromessi.

## Responsabilità

- Audit periodico delle API routes (auth, rate limit, sanitization)
- Implementare e mantenere `lib/middleware/` (auth, rate-limit, sanitize, csrf)
- Mantenere i security headers in `next.config.ts`
- Revisione PR che toccano autenticazione o input utente
- Segnalare vulnerabilità al CME con priorità e piano di fix
- Aggiornare la mappa fragilità in `docs/ARCHITECTURE.md` sezione 2.3

## Principi

1. **Defense in depth**: ogni layer ha la sua difesa (frontend, middleware, DB)
2. **Least privilege**: ogni route riceve solo i permessi che servono
3. **Fail secure**: se l'auth fallisce, nega l'accesso (non lo permette)
4. **Minimal surface**: meno codice esposto = meno vulnerabilità
5. **Zero trust**: non fidarsi mai dell'input utente, mai

## Copertura target (mappa auth)

| Route | Auth | Rate Limit | Sanitization | CSRF |
|-------|------|-----------|--------------|------|
| `/api/analyze` | ✅ requireAuth | ✅ | ✅ | ✅ |
| `/api/upload` | ✅ requireAuth | ✅ | — | ✅ |
| `/api/deep-search` | ✅ requireAuth | ✅ | ✅ | ✅ |
| `/api/vector-search` | ✅ requireAuth | ✅ | — | ✅ |
| `/api/corpus` | ✅ requireAuth+admin | ✅ | — | ✅ |
| `/api/session/[id]` | ✅ requireAuth | ✅ | ✅ | ✅ |
| `/api/user/usage` | ✅ requireAuth | ✅ | — | — |
| `/api/stripe/*` | ✅ requireAuth | — | — | — |
| `/api/webhook` | — (Stripe sig) | — | — | — |
| `/api/auth/callback` | — (OAuth) | — | — | — |
| `/api/corpus/ask` | optional + RL | ✅ | ✅ | — |
| `/api/console/*` | ✅ requireAuth | ✅ | — | ✅ |

## Flusso decisionale

```
Vulnerabilità identificata
  → Security crea task con severità (critical/high/medium/low)
  → CME approva priorità
  → Security implementa fix in lib/middleware/ o api route
  → QA valida (test di regressione)
  → Architecture aggiorna ADR + ARCHITECTURE.md
```

## Runbooks

- `runbooks/security-audit.md` — Audit completo delle API routes
- `runbooks/fix-vulnerability.md` — Procedura fix vulnerabilità

## Agenti

- `agents/security-auditor.md` — Responsabile audit e fix

---

## Visione (6 mesi)

Compliance automatizzata: audit security schedulati, DPA firmati con tutti i provider AI, EU AI Act readiness. Security scanning integrato nella CI/CD.

## Priorità operative (ordinate)

1. **[P0] DPA provider AI** — firmare Data Processing Agreement con Anthropic, Google, Mistral (IN REVIEW — prerequisito PMI)
2. **[P1] EU AI Act readiness** — ingaggiare consulente, classificazione sistema, gap analysis (IN REVIEW — deadline agosto 2026)
3. **[P2] Security scanning CI/CD** — integrare audit automatico delle route nella pipeline CI/CD

## Autonomia

- **L1 (auto)**: audit API routes, fix vulnerabilità medium/low, aggiornamento middleware, mappa auth
- **L2+ (escalation)**: modifica architettura auth (L2), DPA negoziazioni (L3 boss), cambio policy dati (L4)
