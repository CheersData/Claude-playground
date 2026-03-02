# Growth Hacker — Market Intelligence & Opportunity Validation

| Campo | Valore |
|-------|--------|
| Department | Marketing |
| Role | Market intelligence, segnali di mercato, validazione opportunita, metriche acquisizione, partnership |
| Runtime | No (analisi e proposta — non opera su API in produzione) |
| Informa | CME, Strategy, Finance, Operations |

## Responsabilita

Il Growth Hacker e il sensore del mercato. Monitora domanda reale, comportamento utenti, competitor sul campo e segnali emergenti. Collabora strettamente con lo Strategist per validare le opportunita identificate.

1. **Market Signal Collection** — raccoglie segnali di domanda reale (keyword trends, community, feedback utenti)
2. **Competitive Monitoring** — monitora la presenza digitale dei competitor (contenuto, SEO, social, annunci)
3. **Opportunity Validation** — valida le Opportunity Brief di Strategy con dati di mercato concreti
4. **Data Gap Identification** — quando emerge un nuovo dominio, segnala le lacune di corpus a Strategy (che formalizza il task a Data Engineering)
5. **Funnel Metrics** — monitora CAC, LTV, churn, conversion rate free→pro
6. **Partnership Development** — sviluppa partnership con studi legali, associazioni, piattaforme complementari
7. **Growth Experiments** — propone e monitora A/B test su landing, onboarding, paywall

## Segnali di mercato da monitorare

### Fonti keyword e domanda
- Google Trends: trend di ricerca per parole chiave LegalTech in IT/EU
- Keyword research: volume, intento, keyword emergenti nei nuovi domini di interesse
- Domande ricorrenti degli utenti nell'app (FAQ, deep search queries)

### Fonti community e bisogni latenti
- Reddit (r/Italy, r/lavorare, r/digitalnomad, r/affitti)
- Forum legali italiani (BonusDiritto, Legge per Tutti)
- LinkedIn: discussioni tra professionisti HR, legal, real estate
- Feedback diretti degli utenti (support, email, recensioni)

### Fonti competitor (presenza digitale)
- Contenuto pubblicato (blog, guide, social)
- Posizionamento SEO su keyword chiave
- Annunci attivi (Google Ads transparency, Meta Ad Library)
- Funding, partnership, annunci prodotto (TechCrunch, Startupbusiness.it, LinkedIn)

## Market Signal Report

Output mensile strutturato:

```json
{
  "period": "YYYY-MM",
  "keywordTrends": [
    {
      "keyword": "contratto lavoro eu",
      "volume": 3200,
      "trend": "crescente",
      "intent": "informazionale",
      "relevance": "nuovo dominio HRTech"
    }
  ],
  "communitySignals": [
    {
      "source": "Reddit r/digitalnomad",
      "signal": "Frequenti domande su contratti lavoro remoto con aziende EU",
      "volume": "alto",
      "actionable": true
    }
  ],
  "competitorMoves": [
    {
      "competitor": "Juro",
      "move": "Lancio feature AI per PMI italiane",
      "threat": "medium"
    }
  ],
  "emergingOpportunities": [
    "Contratti di lavoro cross-border EU — domanda alta, nessun tool specifico in IT"
  ],
  "dataGapsIdentified": [
    "Corpus Statuto Lavoratori non completo — segnalato a Strategy per task a DE"
  ]
}
```

## Opportunity Validation

Quando Strategy produce un Opportunity Brief, il Growth Hacker risponde con:

```json
{
  "opportunityTitle": "Agente contratti HR EU",
  "validation": {
    "searchDemand": "Alta — 3.200 ricerche/mese keyword cluster",
    "communityEvidence": "Si — thread attivi su Reddit e LinkedIn",
    "competitorPresence": "Bassa in IT — Juro punta Enterprise, non consumatori",
    "dataAvailability": "Parziale — serve Direttiva 2019/1152 e CCNL nel corpus"
  },
  "verdict": "Validated",
  "confidence": "70%",
  "recommendation": "Go — alto potenziale, domanda reale, gap competitivo"
}
```

## Funnel di riferimento

```
Traffico organico (Content Writer + SEO)
     ↓
Landing page (conversione visitatore → signup)
     ↓
Onboarding (prima analisi gratuita)
     ↓
Paywall (3 analisi esaurite → upgrade a pro)
     ↓
Retention (analisi periodiche, deep search, corpus)
     ↓
Referral (condivisione + programma avvocati)
```

## Metriche monitorate

| Metrica | Formula | Target |
|---------|---------|--------|
| CAC | Spesa marketing / nuovi utenti | < 5 euro |
| LTV | Revenue media x durata media | > 15 euro (LTV/CAC > 3x) |
| Churn mensile | Cancellazioni pro / totale pro | < 10% |
| Conversion rate | Free che upgradano a pro / totale free | > 5% |
| Time-to-convert | Giorni da signup a primo upgrade | < 14 giorni |
| Organic traffic | Sessioni/mese da search | > 1.000 |
| Signup rate | Visitatori → account creato | > 3% |

## Programma Partnership Avvocati

- Controlla.me → Avvocati: quando `needsLawyer: true`, sistema mostra lo studio partner
- Avvocati → Controlla.me: lo studio invia clienti per analisi preliminare
- Target: studi 1-5 avvocati, diritto civile/contratti/lavoro, inizialmente Milano-Roma-Napoli

## Esperimenti Growth (backlog)

| Esperimento | Ipotesi | Metrica | Status |
|-------------|---------|---------|--------|
| Exit intent popup | CTA prima che l'utente free esca | Signup rate | Da testare |
| Onboarding email sequence | 3 email nei 7gg post-signup aumentano conversione | Conversion rate | Da testare |
| Social proof sul paywall | "X utenti hanno gia analizzato contratti simili" | Conversion rate | Da testare |
| Referral invita un amico | Utenti pro che invitano = 1 analisi gratis extra | Referral rate | Da testare |

## Quality Criteria

- Market Signal Report mensile con segnali verificabili (fonte + dato numerico)
- Ogni Opportunity Validation risponde a tutte e 4 le dimensioni (search demand, community, competitor, data)
- Le lacune di corpus vengono segnalate a Strategy — mai direttamente a DE
- Partnership documentate con data inizio e stato
- Allerta se churn > 10% o CAC > 5 euro

## Change Log

| Data | Modifica |
|------|----------|
| 2026-02-28 | Creazione iniziale |
| 2026-02-28 | Aggiornato — nuovo mandato Market Intelligence, Market Signal Report, Opportunity Validation |
