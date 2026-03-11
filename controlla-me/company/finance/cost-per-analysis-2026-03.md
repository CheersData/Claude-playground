# Report: Costo per Analisi per Tier

**Data:** 2026-03-07
**Fonte dati:** lib/models.ts, lib/tiers.ts, lib/ai-sdk/agent-runner.ts

---

## Riepilogo

| Tier | Costo/Analisi | Modelli primari | Free tier? |
|------|--------------|-----------------|------------|
| **Intern** | ~$0.042 | Cerebras, Mistral Large, Groq | Sì (250-1000 req/day) |
| **Associate** | ~$0.099 | Gemini Flash/Pro, Haiku | Parziale (Gemini free) |
| **Partner** | ~$0.255 | Sonnet 4.5, Haiku | No |

---

## Breakdown per Agente

### Token usage stimato (pipeline completa)

| Agente | Input tokens | Output tokens | Ruolo |
|--------|-------------|---------------|-------|
| Classifier | ~5.000 | ~1.200 | Classificazione documento |
| Analyzer | ~10.000 | ~4.000 | Analisi rischi |
| Investigator | ~6.000 | ~3.000 | Ricerca legale (web_search) |
| Advisor | ~8.000 | ~2.000 | Consiglio finale |

### Costo per agente per tier

| Agente | Partner | Associate | Intern |
|--------|---------|-----------|--------|
| Classifier | $0.011 (Haiku) | $0.001 (Gemini Flash) | $0.003 (Cerebras) |
| Analyzer | $0.090 (Sonnet) | $0.043 (Gemini Pro) | $0.011 (Mistral Large) |
| Investigator | $0.101 (Sonnet+web) | $0.021 (Haiku*) | $0.021 (Haiku*) |
| Advisor | $0.054 (Sonnet) | $0.030 (Gemini Pro) | $0.007 (Mistral Large) |
| **TOTALE** | **$0.255** | **$0.099** | **$0.042** |

*\* Investigator richiede web_search (Anthropic-only) → Associate e Intern cadono su Haiku 4.5*

---

## Nota Investigator

L'investigatore usa `web_search`, feature esclusiva Anthropic. Questo crea un'asimmetria:
- Associate paga Gemini Pro per l'analyzer ma ottiene Haiku per l'investigator
- Il costo dell'investigator è uguale per Associate e Intern ($0.021)

---

## Proiezioni volume

| Volume | Intern | Associate | Partner |
|--------|--------|-----------|---------|
| 10 analisi | $0.42 | $0.99 | $2.55 |
| 100 analisi | $4.16 | $9.89 | $25.54 |
| 1.000 analisi/mese | $41.60 | $98.90 | $255.40 |

## Free tier capacity (Intern)

| Provider | Quota giornaliera | Analisi/giorno stimate |
|----------|------------------|----------------------|
| Gemini | 250 req/day | ~60 analisi (4 req/analisi) |
| Cerebras | 24M tok/day | ~200+ analisi |
| Groq | 1.000 req/day | ~250 analisi |
| Mistral | 2 RPM (1B tok/mese) | ~30/hour |

**Conclusione:** Il tier Intern può gestire ~30-60 analisi/giorno completamente gratis.

---

## Raccomandazioni

1. **Tier default: Intern** per utenti free — costo ~$0 con quota free providers
2. **Monitorare fallback rate** — se >30% significa che i free tier si esauriscono
3. **Investigator è il bottleneck di costo** — considerare alternative a web_search per ridurre dipendenza da Anthropic
4. **Cache aggressiva** — analisi ripetuta su stesso documento = $0
