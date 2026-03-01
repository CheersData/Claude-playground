# Runbook: Growth Analysis — Report Metriche Mensile

## Obiettivo

Produrre ogni mese un report strutturato su acquisizione, conversione e retention. Identificare anomalie e proporre esperimenti per il mese successivo.

## Quando eseguire

Primo giorno lavorativo di ogni mese (per il mese precedente) o su richiesta CME.

## Procedure

### Fase 1: Raccolta dati (~15 min)

1. **Dati utenti** — da Supabase
   ```sql
   -- Nuovi signup del mese
   SELECT COUNT(*) FROM profiles WHERE created_at >= '[inizio mese]';

   -- Upgrade free→pro
   SELECT COUNT(*) FROM profiles WHERE plan = 'pro' AND updated_at >= '[inizio mese]';

   -- Churn (downgrade pro→free)
   SELECT COUNT(*) FROM profiles WHERE plan = 'free' AND stripe_customer_id IS NOT NULL;
   ```

2. **Dati analisi** — da Supabase
   ```sql
   -- Analisi totali del mese
   SELECT COUNT(*) FROM analyses WHERE created_at >= '[inizio mese]';

   -- Analisi per utente (engagement)
   SELECT user_id, COUNT(*) as analisi FROM analyses
   WHERE created_at >= '[inizio mese]'
   GROUP BY user_id ORDER BY analisi DESC LIMIT 10;
   ```

3. **Dati costi** — da API company
   ```bash
   curl http://localhost:3000/api/company/costs?days=30
   ```

4. **Dati traffico** — Google Search Console o Analytics (se configurato)
   - Sessioni organiche totali
   - Click su query target
   - Pagine con più traffico

### Fase 2: Calcolo metriche (~10 min)

5. **Calcola il funnel mensile**:
   ```
   Organic visits → Signups → Free analyses → Upgrades → Retention
   ```

6. **Calcola metriche chiave**:
   - `Signup rate = Signups / Organic visits × 100`
   - `Conversion rate = Upgrades / Total free users × 100`
   - `Churn rate = Cancellazioni / Total pro × 100`
   - `CAC = (Spesa marketing) / Nuovi utenti paganti`
   - `LTV = ARPU × (1 / Churn rate)` dove ARPU = €4.99

### Fase 3: Analisi anomalie (~10 min)

7. **Confronta con mese precedente**:
   - Crescita/calo > 20% su qualsiasi metrica → analizza causa
   - Churn > 10% → alert a CME immediato
   - CAC > €5 → revedi canali di acquisizione

8. **Identifica colli di bottiglia**:
   - Molti signup ma poca conversione → problema onboarding/paywall
   - Molte analisi ma poca retention → problema valore percepito
   - Poco traffico → problema SEO/content

### Fase 4: Esperimenti prossimo mese (~10 min)

9. **Proponi 1-2 esperimenti** basati sui dati:
   - Ogni esperimento: ipotesi → metrica → durata → come misurare
   - Max 2 esperimenti contemporanei (troppi = difficile isolare causa)

### Fase 5: Output report

10. **Produci report** e crea task per CME:
    ```bash
    npx tsx scripts/company-tasks.ts create \
      --title "Growth Report [Mese]" \
      --dept marketing \
      --priority low \
      --by growth-hacker \
      --desc "[Summary]"
    ```

## Output atteso

```markdown
# Growth Report — Febbraio 2026

## Funnel del mese
| Step | Valore | vs Gennaio |
|------|--------|-----------|
| Organic visits | 320 | +28% |
| Signups | 14 | +17% |
| Signup rate | 4.4% | +0.3pp |
| Free users totali | 87 | +19% |
| Upgrades pro | 2 | +100% |
| Conversion rate | 2.3% | +1.1pp |
| Churn pro | 1 | stabile |

## KPI principali
- CAC: €0 (solo canali organici attivi)
- LTV stimato: €35 (7 mesi a €4.99)
- LTV/CAC: ∞ (ma non scala senza investimento)

## Anomalie
- ⚠️ Conversion rate 2.3% vs target 5% — paywall raggiunto solo da 6 utenti
- ✅ Traffico organico in crescita costante
- ✅ Zero churn massivo

## Esperimenti proposti (Marzo)
1. **Exit intent popup** — Ipotesi: mostrare valore pro prima che l'utente free esca aumenta signup rate del 15%. Metrica: signup rate. Durata: 2 settimane.
2. **Email day 3** — Ipotesi: email di follow-up dopo 3 giorni aumenta la conversione. Metrica: conversion rate utenti con 1-2 analisi. Durata: 1 mese.

## Partnership avvocati
- In negoziazione: Studio Rossi (Milano), Studio Bianchi (Roma)
- Prossimo step: demo schedulata per 15 marzo

## Raccomandazione CME
Priorità al conversion rate: il funnel porta traffico ma non converte abbastanza.
Suggerito: A/B test sul copy del paywall + esperimento email nurturing.
```

## Alert automatici (soglie)

| Metrica | Soglia alert | Azione |
|---------|-------------|--------|
| Churn pro | > 10% | Alert CME immediato |
| Conversion rate | < 2% | Review paywall urgente |
| Organic traffic | < 200 sessioni/mese | Review content strategy |
| CAC | > €5 | Ferma campagne a pagamento |

## Errori comuni

| Errore | Soluzione |
|--------|-----------|
| Report senza confronto temporale | Sempre confronta con mese precedente |
| Metriche senza contesto | Spiega sempre perché un numero è buono o cattivo |
| Troppe metriche | Max 6-8 KPI nel report — le altre in appendice |
| Esperimenti senza ipotesi | Nessun esperimento senza "se X allora Y perché Z" |
