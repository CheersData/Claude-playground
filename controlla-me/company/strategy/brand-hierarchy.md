# Brand Hierarchy — Poimandres

Data: 2026-03-22 | Dept: Strategy | Versione: 1.0

---

## 1. Architettura di Brand

```
POIMANDRES (parent brand — "Il Nous")
├── controlla.me    → Verticale Legale (consumer)
├── studia.me       → Verticale Medico (studio)
├── Music Office    → Verticale Musica (label virtuale)
├── Trading Office  → Verticale Trading (swing automatizzato)
└── Integrazione    → Verticale PMI (connettori OAuth2)
```

**Modello: Endorsed Brand.** Ogni verticale ha identita propria ma e "powered by Poimandres". Il parent brand da credibilita tecnica; i sub-brand parlano la lingua dell'utente finale.

---

## 2. Convenzione di Naming

| Contesto | Usa | Esempio |
|----------|-----|---------|
| Utente finale (consumer) | Nome del verticale | "Analizza il tuo contratto su controlla.me" |
| B2B / investitori / press | Poimandres + verticale | "Poimandres, tramite controlla.me, offre..." |
| Comunicazione interna | Sempre Poimandres | "Il dipartimento Architecture di Poimandres" |
| Codice / repo / infra | Poimandres come namespace | `poimandres.work/api/...` |
| Footer / legal | Entrambi | "controlla.me e un servizio Poimandres" |

**Regola d'oro:** l'utente non deve mai sentirsi confuso. Se parli a un consumatore, usa il nome del prodotto. Se parli a chi investe o firma contratti, usa Poimandres.

---

## 3. Posizionamento per Verticale

| Verticale | Target | Posizionamento | Differenziatore |
|-----------|--------|---------------|-----------------|
| **controlla.me** | Consumatori IT, lavoratori, inquilini | "Il tuo avvocato AI tascabile" | Prospettiva parte debole, corpus IT+EU, 4 agenti specializzati |
| **studia.me** | Studenti medicina, medici | "Studia con l'AI che capisce la medicina" | Fonti peer-reviewed (StatPearls, EuropePMC), citazioni verificabili |
| **Music Office** | Artisti emergenti | "Il tuo A&R personale, powered by AI" | AudioDNA + trend analysis, artista mantiene 100% IP |
| **Trading Office** | Interno (sostenibilita finanziaria) | "Swing trading automatizzato per sostenere la piattaforma" | Slope+volume 24/7, risk management non negoziabile |
| **Integrazione** | PMI italiane | "Collega i tuoi strumenti, analizza i tuoi contratti" | OAuth2 per-utente, credential vault AES-256-GCM |

---

## 4. Struttura URL

| URL | Prodotto | Note |
|-----|----------|------|
| `poimandres.work` | Landing parent brand | Console multi-agente, vision, team |
| `poimandres.work/legal` oppure `controlla.me` | Verticale Legale | Dominio dedicato per SEO consumer |
| `poimandres.work/studia` oppure `studia.me` | Verticale Medico | Dominio dedicato per SEO studenti |
| `poimandres.work/music` | Verticale Musica | Sotto-path, no dominio dedicato (fase MVP) |
| `poimandres.work/trading` | Verticale Trading | Solo interno, non pubblico |
| `poimandres.work/integrazione` | Verticale PMI | Sotto-path, accessibile da utenti autenticati |
| `poimandres.work/ops` | Console operativa | Solo interno (CME + team) |

**Regola:** i verticali consumer con SEO autonomo ottengono dominio `.me`. Gli altri vivono come sotto-path di `poimandres.work`.

---

## 5. Regole di Comunicazione

### Interna (team, company/, agenti AI, docs)
- Sempre **Poimandres**
- I verticali si chiamano "Ufficio Legale", "Ufficio Musica", ecc.
- Il CEO virtuale e CME di Poimandres, non di controlla.me

### Esterna — Consumer (landing, blog, social, email)
- **Nome del verticale** come protagonista
- Footer: "Un servizio Poimandres"
- Mai spiegare l'architettura multi-agente all'utente finale

### Esterna — B2B / Investitori / Press
- **Poimandres** come protagonista
- I verticali sono "prodotti" o "servizi" di Poimandres
- Enfasi su: piattaforma multi-verticale, 7 provider AI, tier system, corpus proprietario
- Pitch: "Poimandres e la piattaforma madre per team di agenti AI specializzati"

### Legal / Compliance
- Tutti i contratti, DPA, termini di servizio: **Poimandres** come entita giuridica
- Privacy policy: "Poimandres, operante tramite controlla.me / studia.me"

---

## 6. Gerarchia Tagline

| Livello | Brand | Tagline | Uso |
|---------|-------|---------|-----|
| Parent | **Poimandres** | "AI per gli umani" | Deck investitori, header poimandres.work, about page |
| Legale | **controlla.me** | "Il tuo contratto, sotto controllo" | Landing, social, blog legale |
| Medico | **studia.me** | "Studia con chi sa la medicina" | Landing, onboarding studenti |
| Musica | **Music Office** | "Il tuo A&R personale, powered by AI" | Landing /music, onboarding artisti |
| Trading | **Trading Office** | — (non pubblico) | Solo report interni |
| Integrazione | **Integrazione** | "Collega tutto, controlla tutto" | Dashboard /integrazione |

---

## Appendice: Checklist Applicazione

- [ ] Ogni landing page ha il footer "Un servizio Poimandres"
- [ ] Il deck investitori usa "Poimandres" come brand primario
- [ ] I blog post consumer non menzionano mai "Poimandres" nel titolo
- [ ] Le email transazionali partono da `noreply@poimandres.work`
- [ ] I social media hanno account separati per verticale consumer (controlla.me, studia.me)
- [ ] L'account LinkedIn e unico: Poimandres
