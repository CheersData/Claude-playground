# Middleware Engine

Motore middleware config-driven in C# / .NET 8. Ogni integrazione con un servizio esterno viene definita come un documento JSON (la "config") che descrive endpoint esposto, autenticazione verso il target, validazione input, mapping parametri, esecuzione e trasformazione della risposta. Zero codice custom per aggiungere una nuova integrazione.

## Installazione rapida

### Prerequisiti

- .NET 8 SDK (lo script di setup lo installa automaticamente se assente)
- PostgreSQL (per persistenza config e log di esecuzione)

### Setup automatico

```bash
chmod +x middleware/setup.sh
./middleware/setup.sh
```

Lo script:
1. Verifica se .NET 8 SDK e' installato; se assente lo scarica in `$HOME/.dotnet`
2. Esegue `dotnet restore` (dipendenze NuGet)
3. Esegue `dotnet build` in configurazione Release
4. Esegue `dotnet test` (xUnit)
5. Stampa un sommario con risultati

### Setup manuale

```bash
cd middleware
dotnet restore
dotnet build
dotnet test
```

### Avvio del server

```bash
# Sviluppo (con hot reload)
dotnet run --project src/Middleware.Api

# Produzione
dotnet run --project src/Middleware.Api --configuration Release
```

Il server parte su `http://localhost:5000` (configurabile in `appsettings.json` o con `--urls`).

### Variabili d'ambiente

| Variabile | Descrizione | Default |
|-----------|-------------|---------|
| `DATABASE_URL` | Connection string PostgreSQL | Da `appsettings.json` |
| `ASPNETCORE_ENVIRONMENT` | `Development` o `Production` | `Production` |

Le credenziali per i target (API key, token OAuth2, ecc.) vengono lette da variabili d'ambiente referenziate nelle config tramite i campi `*_env` (es. `token_env`, `api_key_env`).

## Struttura del progetto

```
middleware/
├── Middleware.sln                          # Solution file
├── setup.sh                               # Script di setup automatico
├── src/
│   └── Middleware.Api/
│       ├── Middleware.Api.csproj            # Target: net8.0, deps: Dapper + Npgsql
│       ├── Program.cs                      # Entry point: DI, CORS, routing, DB init
│       ├── appsettings.json                # Config: connessione DB, CORS, cache TTL
│       ├── appsettings.Development.json    # Override per sviluppo
│       ├── Models/                         # Record immutabili per la config JSON
│       │   ├── MiddlewareConfig.cs         # Root: slug, name, version, enabled
│       │   ├── EndpointConfig.cs           # Path esposto, metodo HTTP, rate limit
│       │   ├── AuthConfig.cs               # Tipo auth (none/bearer/api_key/basic/oauth2)
│       │   ├── InputConfig.cs              # Content type, campi con validazione, cross-field validators
│       │   ├── FieldConfig.cs              # Tipo, required, pattern, min/max, enum, format
│       │   ├── TargetConfig.cs             # URL target, metodo, timeout, retry policy
│       │   ├── MappingNode.cs              # Mapping parametri: source, transform, conditions
│       │   ├── ResponseConfig.cs           # Estrazione campi risposta, static fields, error handling
│       │   ├── ExecutionResult.cs          # Risultato esecuzione pipeline
│       │   └── ValidationError.cs          # Errore validazione input
│       ├── Auth/                           # Resolver autenticazione per target
│       │   ├── IAuthResolver.cs            # Interfaccia: ResolveHeaders()
│       │   ├── AuthResolverFactory.cs      # Factory: type -> resolver
│       │   ├── BearerAuthResolver.cs       # Authorization: Bearer {token}
│       │   ├── ApiKeyAuthResolver.cs       # Header custom con API key
│       │   ├── BasicAuthResolver.cs        # HTTP Basic Auth
│       │   └── OAuth2AuthResolver.cs       # OAuth2 client_credentials con cache token
│       ├── Engine/                         # Pipeline di esecuzione
│       │   ├── ConfigLoader.cs             # CRUD config da PostgreSQL + cache in-memory
│       │   ├── InputValidator.cs           # Validazione campi input (tipo, required, pattern, range)
│       │   ├── ParameterMapper.cs          # Mapping input -> parametri target (template, transform, conditions)
│       │   ├── TargetExecutor.cs           # HTTP call verso target con retry e timeout
│       │   ├── ResponseExtractor.cs        # Estrazione/trasformazione risposta target
│       │   ├── MiddlewareOrchestrator.cs   # Orchestratore: validate -> auth -> map -> execute -> extract
│       │   └── ExecutionLogger.cs          # Logging esecuzioni su PostgreSQL
│       ├── Endpoints/                      # Route HTTP
│       │   ├── AdminEndpoints.cs           # CRUD config + test + logs (/admin/configs/*)
│       │   └── MiddlewareEndpoints.cs      # Catch-all: risolve config da path, esegue pipeline
│       └── Middleware/
│           └── ErrorHandlingMiddleware.cs  # Global error handler
│
└── tests/
    └── Middleware.Tests/
        ├── Middleware.Tests.csproj          # xUnit 2.7
        ├── ValidatorTests.cs               # Test InputValidator
        ├── MapperTests.cs                  # Test ParameterMapper
        └── ExtractorTests.cs               # Test ResponseExtractor
```

## Come aggiungere una nuova integrazione

Una config descrive completamente un'integrazione. Non serve scrivere codice.

### 1. Definisci la config JSON

Ogni config ha 7 sezioni:

| Sezione | Scopo |
|---------|-------|
| `slug` / `name` / `version` | Identita' della config |
| `endpoint` | Path e metodo HTTP esposto dal middleware |
| `auth` | Come autenticarsi verso il servizio target |
| `input` | Schema dei campi accettati, con validazione |
| `target` | URL del servizio target, metodo, timeout, retry |
| `mapping` | Come trasformare l'input nei parametri del target |
| `response` | Come estrarre e trasformare la risposta del target |

### 2. Carica la config via API

```bash
curl -X POST http://localhost:5000/admin/configs \
  -H "Content-Type: application/json" \
  -d @mia-config.json
```

### 3. Testa con dry-run

```bash
curl -X POST http://localhost:5000/admin/configs/mio-slug/test \
  -H "Content-Type: application/json" \
  -d '{"campo1": "valore1"}'
```

### 4. Usa l'endpoint

```bash
curl -X POST http://localhost:5000/fatture/crea \
  -H "Content-Type: application/json" \
  -d '{"cliente": "Mario Rossi", "importo": 1500.00}'
```

Il middleware intercetta la richiesta su `/fatture/crea`, trova la config con quel path, valida l'input, mappa i parametri, chiama il target, estrae la risposta e la restituisce.

## Esempio di config completo: Fattura

Questa config espone `POST /fatture/crea` che crea una fattura su un servizio di fatturazione esterno.

```json
{
  "slug": "fatture-crea",
  "name": "Crea Fattura",
  "version": "1.0.0",
  "enabled": true,

  "endpoint": {
    "path": "/fatture/crea",
    "method": "POST",
    "description": "Crea una nuova fattura elettronica",
    "rate_limit": {
      "requests_per_minute": 30,
      "burst": 5
    }
  },

  "auth": {
    "type": "oauth2",
    "client_id_env": "FATTURE_CLIENT_ID",
    "client_secret_env": "FATTURE_CLIENT_SECRET",
    "token_url": "https://api.fattureincloud.it/oauth/token",
    "scopes": ["entity.invoices:a"]
  },

  "input": {
    "content_type": "application/json",
    "fields": {
      "cliente_nome": {
        "type": "string",
        "required": true,
        "description": "Nome o ragione sociale del cliente",
        "min_length": 2,
        "max_length": 200
      },
      "cliente_piva": {
        "type": "string",
        "required": false,
        "description": "Partita IVA del cliente (11 cifre)",
        "pattern": "^[0-9]{11}$"
      },
      "cliente_cf": {
        "type": "string",
        "required": false,
        "description": "Codice fiscale del cliente",
        "pattern": "^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$"
      },
      "importo": {
        "type": "number",
        "required": true,
        "description": "Importo netto in EUR",
        "min": 0.01,
        "max": 999999.99
      },
      "aliquota_iva": {
        "type": "number",
        "required": false,
        "description": "Aliquota IVA in percentuale",
        "default": 22,
        "enum": ["0", "4", "5", "10", "22"]
      },
      "descrizione": {
        "type": "string",
        "required": true,
        "description": "Descrizione del bene o servizio",
        "min_length": 5,
        "max_length": 1000
      },
      "metodo_pagamento": {
        "type": "string",
        "required": false,
        "description": "Metodo di pagamento",
        "default": "bonifico",
        "enum": ["bonifico", "contanti", "carta", "ri.ba", "assegno"]
      },
      "data_emissione": {
        "type": "string",
        "required": false,
        "description": "Data emissione (YYYY-MM-DD). Default: oggi",
        "format": "date"
      },
      "scadenza_giorni": {
        "type": "integer",
        "required": false,
        "description": "Giorni alla scadenza dal momento dell'emissione",
        "default": 30,
        "min": 0,
        "max": 365
      }
    },
    "validators": [
      {
        "type": "at_least_one",
        "fields": ["cliente_piva", "cliente_cf"],
        "message": "Almeno uno tra Partita IVA e Codice Fiscale e' obbligatorio"
      }
    ]
  },

  "target": {
    "base_url": "https://api-v2.fattureincloud.it",
    "path": "/c/{company_id}/issued_documents",
    "method": "POST",
    "content_type": "application/json",
    "timeout_ms": 15000,
    "retry": {
      "max_retries": 2,
      "backoff_ms": 1000,
      "backoff_multiplier": 2.0,
      "retry_on_status": [429, 500, 502, 503]
    },
    "headers": {
      "Accept": "application/json"
    }
  },

  "mapping": {
    "headers": {
      "X-Company-Id": {
        "source": "env",
        "env": "FATTURE_COMPANY_ID"
      }
    },
    "body": {
      "data": {
        "source": "static",
        "children": {
          "type": {
            "source": "static",
            "value": "invoice"
          },
          "entity": {
            "source": "static",
            "children": {
              "name": {
                "source": "input",
                "field": "cliente_nome"
              },
              "vat_number": {
                "source": "input",
                "field": "cliente_piva"
              },
              "tax_code": {
                "source": "input",
                "field": "cliente_cf"
              }
            }
          },
          "items_list": {
            "source": "static",
            "value": [
              {
                "description": {
                  "source": "input",
                  "field": "descrizione"
                },
                "net_price": {
                  "source": "input",
                  "field": "importo"
                },
                "vat": {
                  "source": "static",
                  "children": {
                    "value": {
                      "source": "input",
                      "field": "aliquota_iva",
                      "default": 22
                    }
                  }
                },
                "qty": {
                  "source": "static",
                  "value": 1
                }
              }
            ]
          },
          "date": {
            "source": "input",
            "field": "data_emissione",
            "transform": "date_today_if_empty"
          },
          "payment_method": {
            "source": "input",
            "field": "metodo_pagamento",
            "default": "bonifico",
            "conditions": [
              { "field": "metodo_pagamento", "operator": "eq", "value": "bonifico", "then": "MP05" },
              { "field": "metodo_pagamento", "operator": "eq", "value": "contanti", "then": "MP01" },
              { "field": "metodo_pagamento", "operator": "eq", "value": "carta",    "then": "MP08" },
              { "field": "metodo_pagamento", "operator": "eq", "value": "ri.ba",    "then": "MP12" },
              { "field": "metodo_pagamento", "operator": "eq", "value": "assegno",  "then": "MP02" }
            ]
          }
        }
      }
    }
  },

  "response": {
    "extract": {
      "fattura_id": "$.data.id",
      "numero": "$.data.number",
      "data_emissione": "$.data.date",
      "importo_totale": "$.data.amount_gross",
      "stato": "$.data.status",
      "pdf_url": "$.data.url"
    },
    "static_fields": {
      "provider": "fattureincloud",
      "versione_api": "v2"
    },
    "forward_status": false,
    "on_error": {
      "include_target_error": false,
      "default_message": "Errore nella creazione della fattura. Riprova."
    }
  }
}
```

## API Reference

Base URL: `http://localhost:5000`

### Health check

```
GET /health
```

Risposta:
```json
{ "status": "healthy", "timestamp": "2026-03-25T10:00:00Z" }
```

---

### Admin Endpoints

Tutti sotto il prefisso `/admin/configs`.

#### Lista config

```
GET /admin/configs
```

Restituisce un array con il sommario di tutte le config caricate (slug, name, version, enabled, endpoint, auth type, target URL).

#### Crea config

```
POST /admin/configs
Content-Type: application/json

{...config JSON...}
```

| Status | Significato |
|--------|-------------|
| `201 Created` | Config creata. Body: la config completa |
| `400 Bad Request` | JSON invalido o slug mancante |
| `409 Conflict` | Slug gia' esistente |

#### Leggi config

```
GET /admin/configs/{slug}
```

| Status | Significato |
|--------|-------------|
| `200 OK` | Body: la config completa |
| `404 Not Found` | Slug non trovato |

#### Sostituisci config (PUT)

```
PUT /admin/configs/{slug}
Content-Type: application/json

{...config JSON completa...}
```

Sostituisce interamente la config mantenendo id e slug originali.

| Status | Significato |
|--------|-------------|
| `200 OK` | Config sostituita |
| `400 Bad Request` | JSON invalido |
| `404 Not Found` | Slug non trovato |

#### Aggiorna config (PATCH)

```
PATCH /admin/configs/{slug}
Content-Type: application/json

{...campi da aggiornare...}
```

Merge parziale: aggiorna solo i campi inviati, mantiene il resto.

| Status | Significato |
|--------|-------------|
| `200 OK` | Config aggiornata |
| `400 Bad Request` | JSON invalido |
| `404 Not Found` | Slug non trovato |

#### Elimina config

```
DELETE /admin/configs/{slug}
```

| Status | Significato |
|--------|-------------|
| `200 OK` | `{ "deleted": true, "slug": "..." }` |
| `404 Not Found` | Slug non trovato |

#### Test config (dry-run)

```
POST /admin/configs/{slug}/test
Content-Type: application/json

{...input di esempio...}
```

Esegue l'intera pipeline (validazione, auth, mapping, chiamata target) in modalita' dry-run. Utile per verificare che la config funzioni prima di usarla in produzione.

| Status | Significato |
|--------|-------------|
| `200 OK` | Risultato dell'esecuzione test |
| `404 Not Found` | Slug non trovato |

#### Log esecuzioni

```
GET /admin/configs/{slug}/logs?limit=50&offset=0
```

Restituisce lo storico delle esecuzioni per una config. Massimo 200 record per richiesta.

#### Health check admin

```
GET /admin/health
```

Risposta:
```json
{ "status": "healthy", "configCount": 5, "timestamp": "2026-03-25T10:00:00Z" }
```

In caso di problemi DB:
```json
{ "status": "unhealthy", "error": "...", "timestamp": "..." }
```
Status code: `503`.

---

### Middleware Endpoints (catch-all)

Qualsiasi richiesta che non matcha `/admin/*` o `/health` viene gestita dal middleware engine.

```
{METHOD} /{path-definito-nella-config}
Content-Type: application/json

{...input secondo lo schema della config...}
```

Il motore:
1. Cerca una config con `endpoint.path` corrispondente al path della richiesta
2. Verifica che il metodo HTTP corrisponda (o che la config accetti `*`)
3. Verifica che la config sia `enabled: true`
4. Valida l'input secondo `input.fields` e `input.validators`
5. Risolve l'autenticazione verso il target (`auth`)
6. Mappa i parametri dell'input nei parametri del target (`mapping`)
7. Esegue la chiamata HTTP al target con retry automatico
8. Estrae i campi dalla risposta del target (`response.extract`)
9. Restituisce la risposta trasformata

| Status | Significato |
|--------|-------------|
| `200 OK` | Esecuzione riuscita, risposta dal target |
| `400 Bad Request` | Validazione input fallita |
| `404 Not Found` | Nessuna config trovata per questo path |
| `405 Method Not Allowed` | Metodo HTTP non corrispondente |
| `503 Service Unavailable` | Config disabilitata |

### Tipi di autenticazione supportati

| Tipo | Campo `auth.type` | Campi richiesti |
|------|-------------------|-----------------|
| Nessuna | `none` | - |
| Bearer token | `bearer` | `token_env` |
| API Key | `api_key` | `api_key_env`, `api_key_header` |
| Basic Auth | `basic` | `username_env`, `password_env` |
| OAuth2 Client Credentials | `oauth2` | `client_id_env`, `client_secret_env`, `token_url`, `scopes` |

I campi `*_env` contengono il nome della variabile d'ambiente da cui leggere il valore. Le credenziali non sono mai salvate nelle config.

### Mapping: sorgenti disponibili

Ogni `MappingNode` ha un campo `source` che indica da dove prendere il valore:

| Source | Descrizione | Campo chiave |
|--------|-------------|--------------|
| `static` | Valore fisso | `value` |
| `input` | Dal body della richiesta | `field` |
| `env` | Da variabile d'ambiente | `env` |
| `auth` | Dal risultato dell'auth (es. token) | `auth_field` |
| `template` | Stringa con placeholder `{campo}` | `template` |

Ogni nodo supporta `transform` per trasformazioni (es. `date_today_if_empty`, `uppercase`, `lowercase`) e `conditions` per mapping condizionale.
