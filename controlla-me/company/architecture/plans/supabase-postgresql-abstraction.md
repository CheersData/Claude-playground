# Piano: Astrazione Supabase → PostgreSQL Standalone

> Data: 2026-03-24 | Task: e6daed43 | Effort stimato: 5-6 settimane (PostgREST) o 8-9 settimane (Drizzle ORM)

## Inventario Dipendenze Supabase

| Feature | Uso | Sostituzione Self-Host |
|---------|-----|----------------------|
| Auth (OAuth, getUser, session) | 12+ file, 16 call site | NextAuth.js |
| PostgREST query builder | 110+ file (69 lib, 41 app) | PostgREST sidecar o Drizzle ORM |
| RPC functions | 12+ RPC distinte | PL/pgSQL standard (già compatibile) |
| RLS policies | 84 auth.uid() in 17 migrazioni | App-level middleware (già esiste) |
| pgvector + pgcrypto | Core, 7 tabelle vector | Funzionano su PostgreSQL 15+ vanilla |
| Realtime/Storage/Edge | NON usati | N/A |

## Fasi

### Fase 0: Preparazione (1 settimana)
- Centralizzare creazione client in lib/db/index.ts con factory
- Estrarre auth in lib/auth/ con adapter interface
- Espandere pattern DAL (profiles.ts) a tutte le tabelle utente

### Fase 1: Auth Abstraction (2 settimane) — IL PEZZO PIÙ DIFFICILE
- NextAuth.js per OAuth provider-independent
- RLS: disabilitare per self-host, usare middleware app-level (già esiste)
- profiles.id FK: da auth.users a local users table
- Cookie/session compatibility

### Fase 2: Query Builder (3 giorni con PostgREST, 3 settimane con Drizzle)
- **Opzione A (raccomandata v1):** PostgREST sidecar, zero code change
- **Opzione B (long-term):** Drizzle ORM, riscrittura 110+ file
- **Opzione C (compromesso):** Shim query builder ~500 LOC

### Fase 3: PostgreSQL-Native (1 settimana)
- pgvector, pgcrypto già compatibili vanilla PG
- Pulizia migrazioni: rimuovere auth.users FK e auth.uid()

### Fase 4: Python Services (3 giorni)
- Trading e Music: cambiare URL o migrare a psycopg2

## Env Vars Self-Host

```env
DB_PROVIDER=postgresql        # "supabase" | "postgresql"
DATABASE_URL=postgresql://...
AUTH_PROVIDER=nextauth        # "supabase" | "nextauth"
NEXTAUTH_SECRET=...
```

## Raccomandazione

PostgREST sidecar (Opzione A) per v1: 5-6 settimane, minimo rischio.
Drizzle ORM (Opzione B) come evoluzione futura se si vuole eliminare PostgREST.
