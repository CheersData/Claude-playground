# UX/UI

## Missione

Interfacce semplici e potenti. Il creator capisce cosa fare in 10 secondi.

## Responsabilita

- Implementare modifiche UI richieste (nuovi componenti, restyling, fix)
- Mantenere il Design System coerente (palette, tipografia, spacing, componenti)
- Audit accessibilita periodico (WCAG 2.1 AA minimo)
- Review di ogni PR che tocca `components/`, `app/*/page.tsx`, `globals.css`
- Prototipare nuove feature con wireframe/mockup prima dell'implementazione
- Mantenere il Beauty Report aggiornato (`docs/BEAUTY-REPORT.md`)

## Principi

1. **Mobile-first**: progettare per mobile, adattare per desktop con breakpoint `md:`
2. **Accessibilita non e opzionale**: focus visible, aria-label, contrasto WCAG AA, touch target 44px+
3. **Design System > one-off**: ogni scelta visiva deve essere un token riusabile, non un valore hardcoded
4. **Framer Motion per animazioni**: mai CSS animation raw. Durate 150-300ms, easing naturale
5. **Lucide React per icone**: zero librerie miste. Import singolo per icona
6. **Less is more**: un'interfaccia elegante e vuota batte una piena di rumore

## Design System di riferimento

Vedi `docs/BEAUTY-REPORT.md` sezione "Design System estratto" per palette, tipografia, spacing e componenti attuali.

### Palette

| Token | Valore | Uso |
|-------|--------|-----|
| Background | #FAFAFA | Sfondo pagina |
| Surface | #FFFFFF | Card, container |
| Foreground | #1A1A2E | Testo primario |
| Accent | #FF6B35 | CTA, evidenza |
| Classifier | #4ECDC4 | Agente classificatore |
| Analyzer | #FF6B6B | Agente analista |
| Investigator | #A78BFA | Agente giurista |
| Advisor | #FFC832 | Agente consigliere |

### Tipografia

- **Display/H1**: Instrument Serif (premium feel)
- **Body/UI**: DM Sans (leggibilita)
- **Scale**: xs(12) → sm(14) → base(16) → lg(18) → xl(20) → 2xl(24) → 3xl(30) → 4xl+(clamp)

### Componenti standard

- Bottoni: gradient accent (#FF6B35 → #E8451A), rounded-full, hover scale 1.02
- Card: bg-white, rounded-2xl, shadow-sm, border border-gray-100
- Input: rounded-xl, border-gray-200, focus:ring-2 focus:ring-accent/30
- Badge: rounded-full, font-bold, 11px uppercase

## Struttura file

```
components/
├── Navbar.tsx            # Nav + menu mobile
├── HeroSection.tsx       # 3 hero variants
├── UploadZone.tsx        # Drag-drop upload
├── AnalysisProgress.tsx  # Progress real-time
├── ResultsView.tsx       # Risultati analisi
├── RiskCard.tsx          # Card rischio
├── FairnessScore.tsx     # Indicatore circolare
├── CorpusChat.tsx        # Chat Q&A corpus
└── console/              # Componenti console
    ├── StudioShell.tsx
    ├── ConsoleHeader.tsx
    ├── PowerPanel.tsx
    └── ...
```

## Flusso decisionale

```
Richiesta UX/UI → UX/UI propone mockup/wireframe → CME approva → UX/UI implementa → QA valida accessibilita
```

## Agenti

| Agente | Ruolo |
|--------|-------|
| ui-ux-designer | Implementazione UI, design system, accessibilita, component review |

## Runbooks

- `runbooks/implement-ui-change.md` — Come implementare una modifica UI
- `runbooks/accessibility-audit.md` — Come eseguire un audit accessibilita

---

## Visione (6 mesi)

Design system completo e riusabile per N verticali. Accessibilità WCAG 2.1 AA certificata. Ogni nuovo verticale eredita il design system senza lavoro custom.

## Priorità operative (ordinate)

1. **[P0] Design /creator (5 tab)** — progettare e implementare l'interfaccia creator con 5 tab
2. **[P1] WCAG 2.1 AA audit** — verificare accessibilità WCAG 2.1 AA su tutte le pagine
3. **[P2] Sotto-tema developer** — creare sotto-tema e componenti riusabili per developer sulla piattaforma

## Autonomia

- **L1 (auto)**: fix accessibilità, aggiornamento design system, restyling componenti esistenti, beauty report
- **L2+ (escalation)**: nuovo componente complesso, redesign pagina intera, modifica design system foundation
