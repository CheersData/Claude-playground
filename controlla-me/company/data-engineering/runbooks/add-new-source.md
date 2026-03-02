# Runbook: Aggiungere una Nuova Fonte Legislativa

## Prerequisiti

- Identificare URL e formato della fonte (XML Akoma Ntoso o HTML)
- Verificare che la fonte sia pubblica e accessibile

## Procedura

### 1. Configurare la fonte

Aggiungere entry in `scripts/corpus-sources.ts`:

```typescript
{
  id: "nome-fonte",
  name: "Nome Completo Fonte",
  provider: "normattiva" | "eurlex",
  config: {
    urn: "urn:nir:stato:..." // per Normattiva
    // oppure
    cellarId: "..." // per EUR-Lex
  },
  lifecycle: "active",
  category: "codice" | "legge" | "regolamento" | "direttiva"
}
```

### 2. Testare la connessione

```bash
npx tsx scripts/data-connector.ts connect <source-id>
```

Verificare che il fetch restituisca dati validi.

### 3. Testare il parsing

```bash
npx tsx scripts/data-connector.ts model <source-id>
```

Verificare che gli articoli siano estratti correttamente.

### 4. Caricare

```bash
npx tsx scripts/data-connector.ts load <source-id>
```

### 5. Verificare

```bash
npx tsx scripts/data-connector.ts status
```

Verificare conteggio articoli e assenza errori.

### 6. Creare task QA

Creare task per Quality Assurance: "Validare nuova fonte: <nome>"
