# ADR-001: Reuse data-connector as generic connector framework

## Status

Proposed

## Date

2026-03-10

## Context

The Ufficio Integrazione needs a connector framework to ingest data from arbitrary external sources (CRMs, ERPs, SaaS platforms, public APIs) into the Controlla.me platform. Today, `lib/staff/data-connector/` already implements a mature CONNECT->MODEL->LOAD pipeline used by 5 verticals (legal, HR, medical, real-estate, consumer) with 5 concrete connectors (Normattiva, EUR-Lex, StatPearls, EuropePMC, OpenStax).

The existing framework has significant strengths that make it a strong candidate for reuse:

1. **Well-defined 3-phase pipeline** (`CONNECT->MODEL->LOAD`) with clear interfaces (`ConnectorInterface`, `ModelInterface`, `StoreInterface`) in `types.ts`.
2. **Plugin registry** (`plugin-registry.ts`) that allows registering new connectors, models, and stores without modifying the orchestrator.
3. **BaseConnector** (`connectors/base.ts`) with retry logic, rate limiting, and User-Agent handling.
4. **Sync log** tracking for every pipeline run with status, timing, and error details.
5. **Vertical-aware registry** (`registry.ts`) mapping verticals to data types.

However, the current framework has limitations that prevent direct reuse for the Integration Office:

- **Authentication**: Only supports unauthenticated HTTP (fetch with User-Agent). No OAuth2, API key header injection, or basic auth.
- **Data types**: `DataType` enum is hardcoded to content-oriented types (`legal-articles`, `medical-articles`, etc.). No support for entity-oriented data (contacts, invoices, tickets).
- **Store layer**: Tightly coupled to `LegalArticle` type and `legal_articles` table. The `StoreInterface<T>` generic is not fully leveraged -- the plugin registry forces `StoreInterface<LegalArticle>`.
- **Config schema**: `DataSource.config` is `Record<string, unknown>` -- flexible but with no typed auth configuration.
- **No credential management**: API keys and tokens are assumed to come from environment variables, not from a per-source credential store.

Building a new framework from scratch would duplicate the pipeline orchestration, sync logging, retry logic, and plugin system -- estimated 2000+ lines of code already battle-tested across 5600+ articles ingested.

## Decision

**Refactor `lib/staff/data-connector/` into a generic connector framework** that supports both the existing corpus ingestion use case and the new Integration Office use case. The refactoring follows a backwards-compatible, additive approach.

### 1. Extend `DataSource` with authentication config

```typescript
// types.ts — additions

export type AuthType = "none" | "api-key" | "basic" | "oauth2" | "custom";

export interface AuthConfig {
  type: AuthType;
  /** Reference to credential in vault (ADR-003). Never stores secrets inline. */
  credentialId?: string;
  /** For api-key: header name (default: "Authorization") */
  headerName?: string;
  /** For api-key: prefix (e.g., "Bearer", "Token") */
  headerPrefix?: string;
  /** For oauth2: token endpoint, scopes, grant type */
  oauth2?: {
    tokenUrl: string;
    scopes: string[];
    grantType: "client_credentials" | "authorization_code" | "refresh_token";
    authorizeUrl?: string;  // For authorization_code flow
  };
}

export interface DataSource {
  // ... existing fields ...
  auth?: AuthConfig;  // NEW — defaults to { type: "none" }
}
```

### 2. Extend `DataType` for entity-oriented data

```typescript
export type DataType =
  | "legal-articles"
  | "medical-articles"
  | "hr-articles"
  // New entity types for Integration Office
  | "contacts"
  | "invoices"
  | "tickets"
  | "documents"
  | "custom";        // Catch-all for unmapped entity types
```

### 3. Extend `BaseConnector` with auth-aware fetch

```typescript
// connectors/base.ts — additions

export abstract class BaseConnector<T = unknown> {
  // ... existing methods ...

  /**
   * Fetch with authentication injected from source.auth config.
   * Resolves credentials from vault at call time (never cached in memory).
   */
  protected async fetchAuthenticated(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const authHeaders = await this.resolveAuthHeaders();
    return this.fetchWithRetry(url, {
      ...options,
      headers: { ...authHeaders, ...Object.fromEntries(new Headers(options?.headers ?? {}).entries()) },
    });
  }

  private async resolveAuthHeaders(): Promise<Record<string, string>> {
    const auth = this.source.auth;
    if (!auth || auth.type === "none") return {};

    // Resolve credential from vault (ADR-003)
    const credential = auth.credentialId
      ? await getCredential(auth.credentialId)
      : null;

    switch (auth.type) {
      case "api-key":
        return {
          [auth.headerName ?? "Authorization"]:
            `${auth.headerPrefix ?? "Bearer"} ${credential?.secret ?? ""}`,
        };
      case "basic":
        return {
          Authorization: `Basic ${Buffer.from(
            `${credential?.username ?? ""}:${credential?.secret ?? ""}`
          ).toString("base64")}`,
        };
      case "oauth2":
        return {
          Authorization: `Bearer ${await this.resolveOAuth2Token(auth, credential)}`,
        };
      default:
        return {};
    }
  }
}
```

### 4. Generalize `StoreInterface` in plugin registry

The `plugin-registry.ts` currently types `StoreFactory` as `StoreInterface<LegalArticle>`. This will be relaxed:

```typescript
// plugin-registry.ts — change

export type StoreFactory<T = unknown> = (
  source: DataSource,
  log: (msg: string) => void
) => StoreInterface<T>;

// Registry stores StoreFactory<unknown> — type safety at registration time
const storeRegistry = new Map<string, StoreFactory<unknown>>();
```

Existing legal/HR/medical stores continue to register as `StoreFactory<LegalArticle>` and are not affected.

### 5. Keep existing connector registrations untouched

All existing `registerDefaults()` calls in `plugin-registry.ts` remain as-is. New Integration Office connectors register themselves following the same pattern:

```typescript
// Example: future CRM connector
registerConnector("salesforce", (source, log) => new SalesforceConnector(source, log));
registerModel("contacts", (source) => new ContactModel(source));
registerStore("contacts", (source, log) => new SupabaseEntityStore("integration_contacts", source, log));
```

### 6. Migration path

| Phase | Action | Risk |
|-------|--------|------|
| Phase 1 | Add `AuthConfig` to types, add `fetchAuthenticated` to `BaseConnector` | Zero -- additive, no existing code changes |
| Phase 2 | Add new `DataType` values to union | Zero -- TypeScript union extension is additive |
| Phase 3 | Generalize `StoreFactory` type parameter | Low -- existing registrations need cast, test coverage exists |
| Phase 4 | Build first Integration Office connector (e.g., REST API with API key) | Zero -- uses new registration, no existing code touched |

## Consequences

### Positive

- **No code duplication**: Integration Office reuses ~2000 lines of battle-tested pipeline, retry, sync log, and plugin infrastructure.
- **Backward compatible**: All 5 existing connectors continue to work without changes. The `auth` field defaults to `{ type: "none" }`.
- **Single abstraction for data ingestion**: CME and Operations dashboard can monitor all data pipelines (legal + integration) through the same `connector_sync_log` table and `getConnectorStatus()` API.
- **Extensible auth**: New auth methods (e.g., SAML, mutual TLS) can be added by extending the `AuthType` union and `resolveAuthHeaders` method.
- **Plugin architecture preserved**: New verticals and connectors register without modifying any existing file (open/closed principle).

### Negative

- **Increased surface area** of `BaseConnector`: adding auth resolution adds complexity to a class that was intentionally simple.
- **Credential vault dependency**: `fetchAuthenticated` requires the credential vault (ADR-003) to be implemented. Until then, a stub that reads from env vars can bridge the gap.
- **`StoreFactory` generalization** requires careful TypeScript typing to avoid `any` leaks. Unit tests must cover the registration path.

### Neutral

- **No performance impact**: auth header resolution is a single vault lookup per request (cached per pipeline run).
- **Sync log schema unchanged**: existing `connector_sync_log` table works for all data types without migration.

## Alternatives Considered

### A1: Build a separate framework for Integration Office

A new `lib/staff/integration/` with its own pipeline, types, and registry. Rejected because:
- Duplicates 80% of existing code (pipeline orchestration, retry, sync log, plugin system).
- Creates two systems that the Operations department must monitor separately.
- Violates the Architecture department's principle #3 ("No over-engineering").

### A2: Use an off-the-shelf ETL/integration platform (Airbyte, Fivetran)

External platform for connectors. Rejected because:
- Adds SaaS dependency and recurring cost ($0.01-0.05/row for Fivetran) -- conflicts with cost-aware principle.
- Requires self-hosting Airbyte (Docker, maintenance) or accepting vendor lock-in.
- The existing framework already handles the CONNECT->MODEL->LOAD pattern well; the gap is only authentication and type generalization.
- For a demo environment without API credits, a self-contained solution is more practical.

### A3: Fork data-connector into a generic version

Copy `lib/staff/data-connector/` to `lib/staff/generic-connector/` and modify the copy. Rejected because:
- Creates maintenance burden: bug fixes must be applied to both copies.
- Existing connectors would need to be migrated to the fork or kept in the original, leading to confusion about which to use.

## References

- `lib/staff/data-connector/types.ts` -- current interface definitions
- `lib/staff/data-connector/index.ts` -- pipeline orchestrator
- `lib/staff/data-connector/plugin-registry.ts` -- plugin registration system
- `lib/staff/data-connector/connectors/base.ts` -- base connector with retry/rate-limit
- ADR-003 (this series) -- credential vault design
