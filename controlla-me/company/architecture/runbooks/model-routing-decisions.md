# Model Routing per Sub-Agent Claude Code

> ADR-2026-03-25 | Autore: Architecture Dept | Approvato: CME
>
> Direttiva boss: "Preferiamo intelligenza a velocita quando c'e un dubbio."

---

## Scope

Questo documento governa SOLO l'allocazione dei modelli nei sub-agent di Claude Code (parametro `model` nell'Agent tool). NON riguarda i modelli dell'app runtime (`lib/tiers.ts`).

Contesto: Claude Max 20x, costo flat. Non stiamo ottimizzando costi, stiamo ottimizzando risultati. La velocita e un beneficio secondario che prendiamo SOLO quando non sacrifica qualita.

---

## 1. Matrice Sub-Agent -> Modello

| Tipo sub-agent | Modello default | Quando salire | Quando scendere |
|----------------|----------------|---------------|-----------------|
| **Explore** (read-only) | **sonnet** | Mai necessario — sonnet legge perfettamente | **haiku** solo per grep/glob puri (vedi sezione 3) |
| **Plan** (architect/design) | **opus** | Gia al massimo | Mai — le decisioni architetturali richiedono il massimo reasoning |
| **general-purpose** (multi-step) | **opus** | Gia al massimo | **sonnet** solo se il task e puramente meccanico (vedi sezione 4) |

### Razionale

- **Explore con sonnet (non haiku)**: un Explore non e mai "solo lettura". L'agente deve capire il codice, sintetizzare, identificare pattern, e riportare insight utili. Sonnet ha la capacita di comprensione necessaria. Haiku rischia di riportare informazioni superficiali o perdere connessioni tra file.

- **Plan con opus**: le decisioni architetturali hanno conseguenze a lungo termine. Un errore di design costa 10x in refactoring. Opus ha il reasoning profondo necessario per valutare trade-off, anticipare edge case, e produrre ADR solidi.

- **general-purpose con opus**: i task multi-step richiedono mantenere contesto attraverso molte operazioni, prendere decisioni intermedie, e adattarsi a risultati inattesi. Opus gestisce questa complessita meglio.

---

## 2. Regola di Prudenza

**Nel dubbio, sonnet.** Mai scendere a haiku se c'e incertezza sulla complessita del task.

Scala di decisione:
```
1. Il task richiede ragionamento, sintesi, o decisioni?     -> opus
2. Il task richiede comprensione del codice?                 -> sonnet
3. Il task e puramente meccanico (grep, list, count)?        -> haiku e accettabile
4. Non sei sicuro?                                           -> sonnet
```

---

## 3. Casi in cui Haiku e SICURAMENTE Sufficiente

Haiku va usato SOLO quando il task e completamente meccanico e non richiede giudizio:

| Task | Perche haiku basta |
|------|--------------------|
| Grep per una stringa esatta in N file | Zero reasoning, pattern match puro |
| Contare occorrenze di un pattern | Operazione numerica |
| Leggere un file e riportare il contenuto grezzo | Nessuna interpretazione richiesta |
| Verificare se un file/directory esiste | Booleano |
| Elencare file che matchano un glob | Lista meccanica |

**Attenzione**: se dopo il grep/read serve una SINTESI o un GIUDIZIO ("quali di questi sono problematici?", "questo pattern e corretto?"), allora non e piu un task haiku. Usa sonnet.

---

## 4. Casi in cui Opus e NECESSARIO

Opus e obbligatorio quando il task ha una o piu di queste caratteristiche:

| Caratteristica | Esempi |
|---------------|--------|
| **Decisione architetturale** | "Come strutturare il modulo X?", "Quale pattern per Y?" |
| **Cross-dipartimento** | Task che toccano 3+ aree del codebase |
| **Trade-off analysis** | "Pro/contro di approccio A vs B" |
| **Planning multi-step** | "Pianifica la migrazione da X a Y" |
| **Review con giudizio** | "Questo codice ha problemi?", "Questa architettura scala?" |
| **Sintesi complessa** | Leggere 10+ file e produrre un report coerente |
| **Decisioni con conseguenze** | Qualsiasi output che diventa un ADR o un runbook |
| **Debug non-triviale** | Quando il problema non e ovvio dai log |

---

## 5. Applicazione Pratica per CME

### Pattern: Analisi parallela (caso piu comune)

```
# 3 sub-agent Explore in parallelo per capire lo stato
# -> sonnet (default Explore)

# Poi 1 sub-agent Plan per decidere
# -> opus (default Plan)

# Poi CME implementa direttamente
# (nessun sub-agent, CME e gia opus)
```

### Pattern: Review dipartimento

```
# general-purpose per review completa di un'area
# -> opus (serve sintesi + giudizio)
```

### Pattern: Ricerca semplice

```
# "In quale file e definita la funzione X?"
# -> haiku (grep puro, zero giudizio)

# "Come funziona la funzione X?"
# -> sonnet (serve comprensione)

# "La funzione X ha problemi di sicurezza?"
# -> opus (serve giudizio esperto)
```

### Pattern: Task board smaltimento

```
# Leggere un task e capire cosa fare
# -> sonnet (comprensione)

# Implementare la soluzione
# -> CME direttamente (gia opus) oppure general-purpose opus

# Verificare che la soluzione funzioni
# -> sonnet (Explore per leggere e validare)
```

---

## 6. Riepilogo Decisioni

| # | Decisione | Razionale |
|---|-----------|-----------|
| 1 | Explore default = **sonnet** | La comprensione del codice non e un task banale. Haiku perde connessioni. |
| 2 | Plan default = **opus** | Le decisioni architetturali hanno conseguenze a lungo termine. Non risparmiamo qui. |
| 3 | general-purpose default = **opus** | I task multi-step richiedono reasoning profondo e adattamento. |
| 4 | Haiku = solo grep/glob/exists | Lista tassativa. Se c'e dubbio, non e un task haiku. |
| 5 | Nel dubbio = **sonnet** | Mai scendere sotto sonnet senza certezza che il task sia meccanico. |
| 6 | Nessun haiku per sintesi | Anche se "sembra semplice", la sintesi richiede comprensione. Sonnet minimo. |

---

## 7. Anti-pattern da Evitare

| Anti-pattern | Perche e sbagliato |
|-------------|-------------------|
| Haiku per "leggere e riassumere" | Riassumere richiede comprensione. Sonnet minimo. |
| Haiku per review codice | Review richiede giudizio. Opus. |
| Sonnet per decisioni architetturali | Le decisioni hanno conseguenze. Opus. |
| Opus per grep | Spreco di compute senza beneficio. Haiku. |
| Cambiare modello a meta task | Il contesto si perde. Scegli all'inizio e mantieni. |

---

*Questo documento e soggetto a revisione dopo 30 giorni di utilizzo. Metriche da monitorare: qualita output sub-agent (soggettiva), tempo di completamento, task che richiedono retry per insufficiente comprensione.*
