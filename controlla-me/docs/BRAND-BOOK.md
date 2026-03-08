# CONTROLLA.ME — BRAND BOOK & DESIGN SYSTEM

Data: 2026-03-08
Versione: 2.0
Comandamento: "Ogni cosa che produciamo a livello di interfaccia con umano deve essere bella. Le cose che funzionano sono solo le cose belle."

---

## PARTE 0: MANIFESTO

La bellezza non e decorazione. La bellezza e un attributo funzionale.

L'aesthetic-usability effect (Kurosu & Kashimura, 1995) dimostra che gli utenti percepiscono le interfacce belle come piu funzionali. La correlazione tra appeal estetico e facilita d'uso percepita e r=0.79. Per una piattaforma di analisi legale, dove la fiducia e tutto, la bellezza non e un lusso — e un requisito.

Dieter Rams: "Good design is as little design as possible." Meno, ma meglio. Ogni pixel, ogni transizione, ogni colore deve giustificare la sua esistenza. Quello che rimuovi e piu importante di quello che aggiungi.

Harvey AI, il competitor da $1.5B: "Precision in design reflects the precision our customers bring to their work." Se un avvocato vede un'interfaccia disordinata, non si fida dell'analisi.

---

## PARTE 1: I 10 PRINCIPI

### 1. Riduzione Intenzionale
Ogni elemento deve giustificare la sua esistenza. Linear ha ridotto 98 variabili tema a 3 (base, accent, contrast). Se puoi rimuovere un elemento senza perdere funzione, rimuovilo.

### 2. Uniformita Percettiva
Colori, spaziatura e tipografia devono apparire matematicamente consistenti. L'occhio umano rileva incongruenze di 2-4px inconsciamente. Usare lo spazio colore LCH per garantire che colori con la stessa luminosita appaiano effettivamente ugualmente luminosi.

### 3. Ritmo Attraverso Vincoli
Grid 8px, scala tipografica 1.250, palette vincolata. I vincoli creano ritmo. Il cervello riconosce pattern inconsciamente — la consistenza matematica genera una sensazione di "ordine" che l'utente descrive come "bellezza".

### 4. Profondita Senza Artifici
Nei temi scuri, le ombre scompaiono. La profondita si comunica con elevazione tonale: superfici piu alte sono progressivamente piu chiare. 5 livelli da `#1b1e28` a `#383b4d`.

### 5. Animazione come Comunicazione
Il movimento deve rispondere a: Cosa e cambiato? Da dove viene? Cosa guardo dopo? Micro-interazioni quasi invisibili guidano senza chiedere attenzione. "The cumulative effect of excessive animations isn't delight — it's distraction." (UX research 2026)

### 6. Tipografia come Architettura
La tipografia non e styling — e lo scheletro dell'interfaccia. Contrasto serif/sans-serif crea gerarchia. La scala tipografica crea ritmo. Peso e colore creano livelli di enfasi. Se la tipografia e giusta, l'80% del design funziona.

### 7. Whitespace come Elemento Attivo
Lo spazio non e "vuoto" — e uno strumento compositivo. Crea focus tramite isolamento, raggruppa contenuti per prossimita, fornisce respiro cognitivo. L'uso corretto aumenta la comprensione fino al 20%.

### 8. Onesta Visiva (Rams #6)
Mai fingere capacita che non hai. Se la confidenza dell'AI e bassa, mostralo. Se una feature e beta, etichettala. Skeleton screen > contenuto falso. Per un prodotto legale, l'onesta visiva costruisce fiducia.

### 9. Colore Semantico (Poimandres)
Il colore deve significare qualcosa, non decorare. Insight chiave del tema Poimandres: "semantic meaning instead of color variety". Quando teal significa sempre successo e rosa significa sempre attenzione, il cervello costruisce modelli mentali piu veloci. Il carico cognitivo cala. L'interfaccia sembra piu semplice di quanto sia.

### 10. Processing Fluency
La misura ultima della bellezza: quanto facilmente il cervello processa quello che vede. Gerarchia chiara, pattern consistenti, comportamento prevedibile, whitespace generoso — tutto riduce il carico cognitivo. Il cervello premia il basso carico cognitivo con una sensazione di piacere estetico.

---

## PARTE 2: SISTEMA COLORI

### 2.1 Palette Fondazione: Dark Theme Poimandres

La palette e derivata dal tema Poimandres (pmndrs) di Paul Henschel. Lo sfondo non e nero neutro ma ha una sfumatura blu-viola sottile (`#1b1e28`) — il "blueberry tint" che crea calore e coesione.

**Sfondi (fondazione blu-grigio)**

| Token | Hex | Uso | Livello elevazione |
|-------|-----|-----|-------------------|
| `--bg-base` | `#1b1e28` | Sfondo pagina, layer piu profondo | 0 (base) |
| `--bg-raised` | `#252837` | Card, pannelli, sidebar | 1 (~5% white overlay) |
| `--bg-overlay` | `#2d3146` | Modal, dropdown, container nidificati | 2 (~8%) |
| `--bg-hover` | `#303340` | Stato hover su superfici | 3 (~11%) |
| `--bg-active` | `#383b4d` | Stato active/pressed | 4 (~14%) |

Mai usare nero puro `#000000`:
- OLED: pixel spenti causano "ghosting" nello scroll
- Halation: testo bianco su nero puro sfuma ai bordi
- Profondita: con #000 non puoi andare piu scuro per elementi recessi
- Percezione: nero puro e aggressivo, blu-grigio scuro e gentile

### 2.2 Testo & Foreground

| Token | Hex | Uso | Contrasto su #1b1e28 |
|-------|-----|-----|---------------------|
| `--fg-primary` | `#e4f0fb` | Testo primario, heading | ~13:1 |
| `--fg-secondary` | `#a6accd` | Corpo testo, descrizioni | ~7.5:1 |
| `--fg-muted` | `#767c9d` | Placeholder, disabilitato, caption | ~4.5:1 |
| `--fg-faint` | `#506477` | Decorativo, input bg, bordi sottili | ~2.8:1 |
| `--fg-invisible` | `#4c5068` | Appena visibile, separatori | ~2.5:1 |

Tutti i token di testo soddisfano WCAG 2.1 AA:
- `--fg-primary` e `--fg-secondary`: WCAG AAA (>7:1)
- `--fg-muted`: WCAG AA per testo normale (4.5:1)
- `--fg-faint` e `--fg-invisible`: solo per elementi decorativi (non testo leggibile)

**Mai bianco puro `#ffffff`**. Usare `#e4f0fb` (bianco con sfumatura blu). Riduce halation e affaticamento visivo.

### 2.3 Brand & Accent

| Token | Hex | Uso |
|-------|-----|-----|
| `--accent` | `#FF6B35` | CTA primaria, identita brand, link |
| `--accent-hover` | `#FF8557` | Stato hover (10% piu chiaro) |
| `--accent-pressed` | `#E85A24` | Stato pressed (10% piu scuro) |
| `--accent-muted` | `#CC5529` | Testo accent su sfondi scuri (desaturato per evitare vibrazione) |
| `--accent-ghost` | `rgba(255,107,53,0.12)` | Sfondo bottoni ghost |
| `--accent-glow` | `rgba(255,107,53,0.25)` | Effetti glow, focus ring |

Il `#FF6B35` raggiunge 6.7:1 di contrasto su #0A0A0A — eccellente. Si posiziona nella sweet spot degli arancioni caldi raccomandati (#E15A00 to #FF6600).

### 2.4 Colori Semantici (Palette Poimandres Originale)

| Token | Hex | Sorgente Poimandres | Uso |
|-------|-----|---------------------|-----|
| `--success` | `#5de4c7` | brightMint / teal1 | Completato, positivo, keyword |
| `--success-dim` | `#5fb3a1` | lowerMint / teal2 | Success secondario |
| `--info` | `#add7ff` | lightBlue / blue2 | Link, badge informativi, funzioni |
| `--info-dim` | `#91b4d5` | desaturatedBlue / blue3 | Info secondario |
| `--info-bright` | `#89ddff` | lowerBlue / blue1 | Info terminale, icone |
| `--warning` | `#d0679d` | hotRed / pink3 | Attenzione, errori, warning |
| `--warning-light` | `#fcc5e9` | pink2 | Warning sfondo |
| `--warning-faint` | `#fae4fc` | pink1 | Warning highlights sottili |
| `--error` | `#e58d78` | (custom) | Errori gravi, rischio critico |
| `--caution` | `#fffac2` | brightYellow | Badge cautela, pending, file |
| `--special` | `#a78bfa` | (custom, vicino a violet) | Tag, metadata, funzionalita speciali |

I colori semantici sono **desaturati**. Su sfondi scuri, colori saturi "vibrano" al confine con lo sfondo — la desaturazione li fa comunicare senza urlare. Anche i colori "bright" di Poimandres hanno saturazione ~56%, non ~100%.

### 2.5 Colori Identita Agenti

| Agente | Hex | Nome | Ruolo visivo |
|--------|-----|------|-------------|
| Leo (Catalogatore) | `#4ECDC4` | Teal | Classificazione, ordine |
| Marta (Analista) | `#FF6B6B` | Coral | Analisi rischi, attenzione |
| Giulia (Giurista) | `#A78BFA` | Violet | Ricerca legale, profondita |
| Enzo (Consulente) | `#FFC832` | Gold | Consiglio, saggezza |

Pattern ispirato a Figma: ogni agente/feature ha il suo colore per memoria spaziale. L'utente associa inconsciamente colore → funzione.

### 2.6 Regole d'Uso Colore

1. **Regola 60-30-10**: 60% sfondi, 30% testo/foreground, 10% accent/semantici
2. **Mai piu di 2 colori accent** simultaneamente in una vista
3. **Bordi translucenti** — `rgba(255,255,255,0.06)` a `rgba(255,255,255,0.12)`, non hex opachi
4. **Gradienti con parsimonia**: da `--bg-base` a `--bg-raised` per profondita, non decorazione
5. **Data visualization**: usare colori agenti per serie grafici
6. **Desaturazione obbligatoria per testo**: colori semantici usati come testo devono essere desaturati del 20-30%
7. **Hue caldo nelle scale di grigio**: undertone a ~90 gradi LCH (lezione da Harvey AI) per evitare il feeling "freddo e clinico"

---

## PARTE 3: TIPOGRAFIA

### 3.1 Font Stack

**DM Sans** — Sans-serif geometrico (Colophon Foundry, 2019)
- X-height alta: eccellente leggibilita su schermo
- Counter aperti: lettere come 'a', 'e' leggibili anche a dimensioni piccole
- Costruzione geometrica: sensazione moderna, tecnica
- Ottimale per: testo UI, body copy, navigazione, label, dati

**Instrument Serif** — Display serif transizionale
- Alto contrasto tra tratti spessi e sottili
- Qualita editoriale, elegante
- Influenze calligrafiche nelle forme corsive
- Premium senza essere ornato
- Ottimale per: hero headline, titoli pagina, marketing, citazioni

**Perche questa coppia funziona**: DM Sans e geometrico e razionale; Instrument Serif e organico e editoriale. Il contrasto crea gerarchia naturalmente. Condividono x-height e proporzioni simili, creando armonia nonostante il contrasto. Questa e considerata una delle migliori coppie per il 2025-2026.

### 3.2 Scala Tipografica (Rapporto 1.250 — Terza Maggiore)

| Token | Size | Weight | Line Height | Letter Spacing | Uso |
|-------|------|--------|-------------|---------------|-----|
| `--text-xs` | 12px | 400 | 1.5 | +0.02em | Caption, timestamp, badge |
| `--text-sm` | 14px | 400 | 1.5 | +0.01em | Testo secondario, celle tabella |
| `--text-base` | 16px | 400 | 1.6 | normal | Corpo testo |
| `--text-md` | 18px | 500 | 1.5 | normal | Lead paragraph, titoli card |
| `--text-lg` | 20px | 500 | 1.4 | -0.01em | Label sezione, nav item |
| `--text-xl` | 24px | 600 | 1.3 | -0.015em | Heading card, titoli sottosezione |
| `--text-2xl` | 30px | 600 | 1.2 | -0.02em | Heading sezione pagina |
| `--text-3xl` | 36px | 700 | 1.15 | -0.025em | Titoli pagina |
| `--text-4xl` | 48px | 700 | 1.1 | -0.03em | Hero headline (Instrument Serif) |
| `--text-5xl` | 60px | 700 | 1.05 | -0.035em | Landing hero (Instrument Serif) |
| `--text-6xl` | 72px+ | 700 | 1.0 | -0.04em | Hero drammatico (solo landing) |

La Terza Maggiore (1.250) e la scelta giusta: abbastanza contrasto per gerarchia chiara senza i salti drammatici del Rapporto Aureo (1.618), che risulta eccessivo in un tool professionale.

### 3.3 Regole Tipografia per Dark Theme

1. **Riduci il peso su sfondi scuri**: il testo appare piu pesante su sfondo scuro (illusione di irradiazione). Usa 400 per body, non 500
2. **Aumenta il letter-spacing leggermente**: sfondi scuri rendono il testo piu denso. +0.01em a +0.02em su body migliora la leggibilita
3. **Line height generoso**: 1.5-1.6 per body su sfondi scuri, piu del 1.4-1.5 dei temi chiari
4. **Larghezza massima riga**: 65-75 caratteri (~680px max-width). Critico per leggibilita di testo legale
5. **Instrument Serif solo per** `--text-4xl` e superiori
6. **ALL CAPS**: massimo 3 parole, con +0.05em letter-spacing
7. **Mai bianco puro per il testo**: `#e4f0fb` come massima luminosita

---

## PARTE 4: SISTEMA SPAZIATURA (Grid 8px)

### 4.1 Token

| Token | Valore | Uso |
|-------|--------|-----|
| `--space-0.5` | 2px | Micro-gap: tra icona e dot indicator |
| `--space-1` | 4px | Micro: icona-label, padding badge |
| `--space-2` | 8px | Compatto: padding bottone inline, tag |
| `--space-3` | 12px | Piccolo: gap lista, padding input |
| `--space-4` | 16px | Default: padding card, tra campi form |
| `--space-5` | 20px | Medio: tra sezioni card |
| `--space-6` | 24px | Padding sezione, tra gruppi |
| `--space-8` | 32px | Grande: tra sezioni pagina |
| `--space-10` | 40px | Margini sezione pagina |
| `--space-12` | 48px | Separatori sezione maggiore |
| `--space-16` | 64px | Ritmo verticale pagina |
| `--space-20` | 80px | Padding verticale hero |
| `--space-24` | 96px | Spaziatura tra sezioni landing |

### 4.2 Regole Spaziatura

1. **Legge di Prossimita (Gestalt)**: la regola piu importante.
   - Item correlati: `--space-2` a `--space-4` (8-16px)
   - Gruppi non correlati: `--space-8`+ (32px+)
   - Rapporto intra/inter-gruppo: **minimo 2:1**
   - Lo spaziamento interno di un contenitore deve essere sempre minore dello spaziamento esterno

2. **Padding consistente per tipo**:
   - Card compatta: `--space-4` (16px)
   - Card standard: `--space-6` (24px)
   - Modal/dialog: `--space-6` (24px)
   - Container pagina: `--space-8` (32px)
   - Sezione hero: `--space-20` (80px) verticale

3. **"Double your whitespace"** (Erik Kennedy):
   Se sembra abbastanza spazio, raddoppia. L'errore amatoriale piu comune e spaziatura insufficiente. Le interfacce professionali hanno padding generoso.

4. **Touch target**: minimo 44x44px (WCAG 2.1 AA). Mobile: 48x48px

### 4.3 Layout Grid

| Contesto | Colonne | Gutter | Margine |
|----------|---------|--------|---------|
| Mobile (<640px) | 4 | 16px | 16px |
| Tablet (640-1024px) | 8 | 24px | 32px |
| Desktop (1024-1440px) | 12 | 24px | 48px |
| Wide (>1440px) | 12 | 32px | auto (max 1280px centrato) |

**Larghezza contenuto testo**: 680-720px max (lunghezza di lettura ottimale). Container max: 1200-1440px.

---

## PARTE 5: MOTION DESIGN

### 5.1 Filosofia

**"Purpose Over Spectacle"** — consensus 2026 unanime.

"Good micro-interactions are almost invisible. They guide quietly without demanding attention."
"The cumulative effect of excessive animations isn't delight — it's distraction."

Il movimento risponde a 3 domande:
1. Cosa e cambiato?
2. Da dove viene?
3. Cosa guardo dopo?

Se un'animazione non risponde ad almeno una di queste domande, eliminala.

### 5.2 Token Durata

| Token | Durata | Uso | Easing |
|-------|--------|-----|--------|
| `--duration-instant` | 100ms | Hover colore, toggle, tooltip | `ease-out` |
| `--duration-fast` | 200ms | Press bottone, ripple, state change | `ease-out` |
| `--duration-normal` | 300ms | Espansione card, reveal pannello | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--duration-slow` | 500ms | Transizione pagina, entrata modal | spring |
| `--duration-scenic` | 800ms | Animazioni hero, solo onboarding | spring lento |

**Spring physics > bezier curves**. Spring imita l'inerzia reale. Parametri raccomandati:
- UI veloce: `stiffness: 300, damping: 30`
- UI standard: `stiffness: 200, damping: 24`
- UI drammatica: `stiffness: 100, damping: 20`

### 5.3 Pattern Animazione

**Entrata**: `y: 20 -> y: 0` + `opacity: 0 -> 1`. Mai slide piu di 20-30px.
**Uscita**: `opacity: 0, scale: 0.97`. Mai slide off-screen.
**Layout**: Prop `layout` di Framer Motion per riposizionamento fluido.
**Scroll**: `whileInView` con `viewport={{ once: true, amount: 0.3 }}`. ScrollObserver per pausare animazioni fuori viewport (pattern Stripe).
**Stagger**: 50-80ms tra figli. Mai sincronizzare entrate multiple.
**Skeleton**: Pulse 1.5s, opacity 0.5-1.0, colore `--bg-hover`.
**Reduced motion**: SEMPRE rispettare `prefers-reduced-motion`. Zero eccezioni.

### 5.4 Micro-interazioni

| Elemento | Interazione | Animazione | Durata |
|----------|-------------|-----------|---------|
| Bottone | Hover | `scale: 1.02`, sfondo si schiarisce | 150ms |
| Bottone | Press | `scale: 0.98`, sfondo si scurisce | 100ms |
| Card | Hover | `translateY: -2px`, bordo glow sottile | 200ms |
| Link | Hover | Underline scivola da sinistra (0->100%) | 200ms |
| Toggle | Switch | Spring circle + transizione colore | 300ms spring |
| Progress | Update | Numero conta su, barra animata spring | 500ms |
| Notifica | Entrata | Slide da destra + settle con spring | 400ms |
| Loading | Skeleton | Shimmer gradient da sinistra a destra | 1500ms loop |

### 5.5 Animazioni Agenti (Identita)

Ogni agente ha un'animazione che riflette la sua funzione:

| Agente | Animazione | Metafora |
|--------|-----------|----------|
| Leo (Catalogatore) | Scan line top-to-bottom | Scanner documenti |
| Marta (Analista) | Magnifying glass sweep + glow | Lente d'ingrandimento |
| Giulia (Giurista) | Scale di bilancia oscillanti | Giustizia, ponderazione |
| Enzo (Consulente) | Lightbulb pulse + rays rotate | Idea, illuminazione |

---

## PARTE 6: PATTERN COMPONENTI

### 6.1 Card

**Standard**: `bg-raised`, border `rgba(255,255,255,0.06)`, rounded-12px, p-16px
**Elevated**: `bg-raised`, border `rgba(255,255,255,0.08)`, rounded-16px, p-24px, shadow `0 8px 32px rgba(0,0,0,0.3)`
**Ghost**: transparent, border dashed `rgba(255,255,255,0.08)`, rounded-12px
**Agent**: `bg-raised`, border-left 3px solid `--agent-color`, rounded-12px, p-16px

### 6.2 Bottoni

**Primary**: bg `--accent`, text white w600 14px, p 10px 20px, rounded 8px
**Secondary**: transparent, border `rgba(255,255,255,0.12)`, text `--fg-secondary` w500
**Ghost**: transparent, text `--fg-secondary`, hover bg `rgba(255,255,255,0.04)`
**Destructive**: transparent, border `rgba(229,141,120,0.3)`, text `--error`

Hover: `scale(1.02)`, sfondo si schiarisce
Press: `scale(0.98)`, sfondo si scurisce

### 6.3 Input

bg `--bg-base`, border `rgba(255,255,255,0.08)`, rounded 8px, p 12px 16px, text `--fg-primary`.
Focus: border `--accent` + accent-glow ring 2px.
Placeholder: `--fg-muted`.

### 6.4 Badge

bg `rgba(semantic-color, 0.12)`, text semantic-color, p 2px 8px, rounded-full, 12px uppercase +0.05em letter-spacing.

### 6.5 Tabelle

Header: `--fg-muted`, 12px, uppercase, letter-spacing +0.05em.
Righe alternate: transparent / `rgba(255,255,255,0.02)`.
Hover riga: `rgba(255,255,255,0.04)`.
Bordi: `rgba(255,255,255,0.04)` orizzontali, no verticali.

### 6.6 Modal

Backdrop: `rgba(0,0,0,0.6)` + `backdrop-blur(8px)`.
Surface: `bg-raised`, rounded-16px, p-24px.
Shadow: `0 24px 64px rgba(0,0,0,0.5)`.
Entrata: `scale 0.95->1` + `opacity 0->1`, 300ms spring.

### 6.7 Score / Metriche

Fairness score colori:
- 9-10: `#2ECC40` (verde, equilibrato)
- 7-8: `#7BC67E` (verde-giallo, buono)
- 5-6: `#FF851B` (arancione, problematico)
- 3-4: `#E8601C` (arancione scuro, preoccupante)
- 1-2: `#FF4136` (rosso, grave)

Severita rischi:
- Alta: bg `rgba(239,68,68,0.08)`, border `rgba(239,68,68,0.4)`, text red
- Media: bg `rgba(245,158,11,0.08)`, border `rgba(245,158,11,0.4)`, text amber
- Bassa: bg `rgba(34,197,94,0.08)`, border `rgba(34,197,94,0.4)`, text green

---

## PARTE 7: REFERENCE DESIGN — I MIGLIORI DEL MONDO

### Tier 1: Standard di Riferimento

**Linear** (linear.app) — L'estetica SaaS definitiva 2025-2026
- Ha creato un movimento di design ora chiamato "Linear-style design"
- Monocromo nero/bianco con colore bold estremamente selettivo
- Dark mode non e una feature — e l'identita
- Lezione: ridurre variabili colore, generare algoritmicamente

**Stripe** (stripe.com) — Il benchmark finanziario
- WebGL gradient animato come firma visiva (4 colori via miniGL)
- Tipografia: Sohne-var (variable font di Klim Type Foundry)
- Color system con uniformita percettiva attraverso tutta la palette
- Lezione: un elemento di firma (gradient animato) > 10 decorazioni

**Apple** (apple.com) — Lo standard del "dire di piu con meno"
- Sfondi scuri con fotografia prodotto drammatica
- Zero elementi decorativi — ogni pixel serve la narrativa
- Lezione: lascia che il contenuto parli

**Vercel** (vercel.com) + Geist Design System
- Dark theme di riferimento per developer tools
- Sistema colori: 10 scale con 10 step ciascuna, CSS custom properties
- Lezione: design system pubblico, documentato, aperto

### Tier 2: SaaS/Product Leaders

**Raycast** — Glassmorphism corretto + noise overlays come texture organica
**Notion** — Complessita flessibile che sembra semplice. Progressive disclosure.
**Figma** — Dark mode ottimizzato per sessioni lunghe. Rainbow accent per memoria spaziale.
**Arc** — Colore come personalita. Animazioni fluide.

### Tier 3: Legal Tech / Fintech

**Harvey AI** (harvey.ai) — IL riferimento per legal AI design
- Color tokens semantici e role-based ("foreground-base", non "neutral-400")
- Prefisso "hy-" per tutti i token, mappati a Tailwind
- Warm neutral palette con chroma calibrato per evitare shift marroni
- "Saying the most with the least" — eco dell'economia del linguaggio legale
- 3 principi: Domain Awareness, Effortless Complexity, Intentional Design
- Trasparenza come feature di design: mostra i reasoning steps dell'AI

**Normand PLLC** — Deep gray-black con arancione bruciato per heading/CTA — l'analogo piu vicino alla nostra palette nel settore legale

**Mercury** (mercury.com) — Dark mode con screenshot high-fidelity. Gold standard per fintech dark.
**Wealthsimple** — "Emotionally intelligent, aesthetically mature." Dimostra che la finanza non deve essere fredda.

### Pattern Comuni dei Migliori

| Pattern | Dettaglio |
|---------|----------|
| Sfondi scuri | 80%+ dei siti premiati usano temi scuri o hero scure |
| Tipografia custom | Variable fonts, kinetic type, display faces oversized |
| Palette ridotta | 1-2 colori accent massimo contro neutri |
| Animazione performance-aware | ScrollObserver, GPU-accelerated transforms, will-change |
| WebGL/3D sottile | Per texture e profondita, non per spettacolo |

---

## PARTE 8: PSICOLOGIA DELLA BELLEZZA

### Gestalt: Come il Cervello Organizza

| Principio | Definizione | Applicazione UI |
|-----------|-----------|----------------|
| **Prossimita** | Elementi vicini sono percepiti come correlati | Raggruppare controlli correlati; separare con whitespace |
| **Similarita** | Elementi simili sono percepiti come correlati | Styling consistente per elementi dello stesso tipo |
| **Chiusura** | La mente completa forme incomplete | Progress indicator, loading states, reveal parziali |
| **Continuita** | Elementi su una linea/curva sono correlati | L'allineamento guida l'occhio; allineamento rotto crea frizione |
| **Figura-Sfondo** | La mente separa primo piano da sfondo | Modal con backdrop blur; card elevate su superficie base |
| **Regione Comune** | Elementi dentro un confine sono raggruppati | Card, sezioni con bordi, container |
| **Simmetria** | Elementi simmetrici appartengono insieme | Layout bilanciati; asimmetria per creare tensione visiva (CTA) |

### Processing Fluency

Il meccanismo sotto l'aesthetic-usability effect. Piu fluidamente il cervello processa un oggetto, piu positiva la risposta estetica. Quando si controlla per processing fluency, la correlazione estetica-usabilita cala da 0.79 a 0.34 — la fluency E il meccanismo.

Implicazione: rendi l'informazione facile da processare. Gerarchia chiara, pattern consistenti, layout prevedibili, spaziatura generosa.

### Cognitive Load

La working memory trattiene ~4 item simultaneamente. Ogni elemento UI, ogni colore, ogni animazione consuma risorse cognitive. Le interfacce belle minimizzano il carico con:
1. **Chunking**: raggruppa informazioni in unita digeribili
2. **Progressive disclosure**: sommario prima, dettagli on demand
3. **Consistenza**: riduci il costo di apprendimento
4. **Gerarchia visiva**: dirigi l'attenzione senza che l'utente chieda "dove guardo?"

---

## PARTE 9: LIGHT THEME (Lightlife)

Per le pagine pubbliche (landing, pricing, corpus):

### 9.1 Palette Light

| Token | Hex | Uso |
|-------|-----|-----|
| `--lt-bg` | `#FFFFFF` | Sfondo pagina |
| `--lt-bg-secondary` | `#F8F8FA` | Sezioni alternate, sfondo card |
| `--lt-bg-hover` | `#F5F5F7` | Hover state |
| `--lt-fg` | `#1A1A1A` | Testo primario |
| `--lt-fg-secondary` | `#6B6B6B` | Testo secondario |
| `--lt-fg-tertiary` | `#9B9B9B` | Placeholder, caption |
| `--lt-border` | `#E5E5E5` | Bordi card, divisori |
| `--lt-border-subtle` | `#F0F0F0` | Bordi molto sottili |

L'accent `#FF6B35` resta identico in entrambi i temi. E l'unico punto di contatto cromatico tra le due esperienze.

### 9.2 Pattern Landing

- Hero: headline Instrument Serif `--text-5xl`/`--text-6xl`, gradiente accent per testo (`bg-clip-text`)
- Video glow con colore `--accent`
- Agent card con gradiente identita prominente al hover
- CTA con glow/bloom sottile
- Sezione divider: gradiente trasparente -> accent -> trasparente
- Trust signals: icone Lucide, testo piccolo, toni grigi

---

## PARTE 10: TOKEN COMPLETI

```
BACKGROUNDS (Dark — Poimandres)
  --bg-base:       #1b1e28
  --bg-raised:     #252837
  --bg-overlay:    #2d3146
  --bg-hover:      #303340
  --bg-active:     #383b4d

BACKGROUNDS (Light — Lightlife)
  --lt-bg:           #FFFFFF
  --lt-bg-secondary: #F8F8FA
  --lt-bg-hover:     #F5F5F7

TEXT (Dark)
  --fg-primary:    #e4f0fb
  --fg-secondary:  #a6accd
  --fg-muted:      #767c9d
  --fg-faint:      #506477
  --fg-invisible:  #4c5068

TEXT (Light)
  --lt-fg:           #1A1A1A
  --lt-fg-secondary: #6B6B6B
  --lt-fg-tertiary:  #9B9B9B

BORDERS
  --border-default: rgba(255,255,255,0.06)
  --border-strong:  rgba(255,255,255,0.12)
  --border-focus:   rgba(255,107,53,0.5)

BRAND
  --accent:         #FF6B35
  --accent-hover:   #FF8557
  --accent-pressed: #E85A24
  --accent-muted:   #CC5529
  --accent-ghost:   rgba(255,107,53,0.12)
  --accent-glow:    rgba(255,107,53,0.25)

SEMANTIC (Poimandres-derived)
  --success:        #5de4c7
  --success-dim:    #5fb3a1
  --info:           #add7ff
  --info-dim:       #91b4d5
  --info-bright:    #89ddff
  --warning:        #d0679d
  --warning-light:  #fcc5e9
  --warning-faint:  #fae4fc
  --error:          #e58d78
  --caution:        #fffac2
  --special:        #a78bfa

AGENTS
  --agent-leo:      #4ECDC4
  --agent-marta:    #FF6B6B
  --agent-giulia:   #A78BFA
  --agent-enzo:     #FFC832

SPACING (8px grid)
  2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96

RADII
  xs: 4px | sm: 6px | md: 8px | lg: 12px | xl: 16px | 2xl: 24px | full: 9999px

SHADOWS (Dark theme — usare con parsimonia)
  sm: 0 2px 8px rgba(0,0,0,0.2)
  md: 0 8px 32px rgba(0,0,0,0.3)
  lg: 0 24px 64px rgba(0,0,0,0.5)
  glow-accent: 0 0 60px rgba(255,107,53,0.15)
  glow-agent: 0 0 60px rgba(agent-color, 0.15)

FONTS
  sans:  'DM Sans', system-ui, sans-serif
  serif: 'Instrument Serif', Georgia, serif
  mono:  'DM Mono', 'Fira Code', monospace

MOTION
  instant: 100ms | fast: 200ms | normal: 300ms | slow: 500ms | scenic: 800ms
```

---

## PARTE 11: CHECKLIST BELLEZZA

Prima di rilasciare qualsiasi interfaccia, verificare:

### Struttura
- [ ] Gerarchia visiva chiara: l'occhio sa dove andare in 1 secondo
- [ ] Spaziatura coerente con grid 8px
- [ ] Legge di prossimita rispettata: item correlati vicini, gruppi separati (2:1)
- [ ] Max 65-75 caratteri per riga di testo
- [ ] Touch target minimo 44x44px

### Colore
- [ ] Regola 60-30-10 rispettata
- [ ] Max 2 colori accent per vista
- [ ] Contrasto WCAG AA su tutti i testi (4.5:1 normale, 3:1 grande)
- [ ] Nessun colore saturo "vibrante" su sfondo scuro
- [ ] Bordi translucenti, non opachi

### Tipografia
- [ ] Scala tipografica rispettata (1.250)
- [ ] Instrument Serif solo per text-4xl+
- [ ] Peso 400 per body su sfondo scuro
- [ ] Letter-spacing corretto per dimensione

### Movimento
- [ ] Ogni animazione risponde a: cosa e cambiato?
- [ ] Durate entro i token (100-800ms)
- [ ] `prefers-reduced-motion` rispettato
- [ ] Stagger su gruppi, mai sincrono

### Onesta
- [ ] AI confidence mostrata quando bassa
- [ ] Feature beta etichettate
- [ ] Skeleton screen durante loading, mai contenuto falso
- [ ] Stato errore chiaro e actionable

---

## FONTI

### Award Sites & Trend
- Awwwards Annual Awards 2025 (Site of the Year: Lando Norris by OFF+BRAND)
- Webby Awards 2025 — 29th Annual
- CSS Design Awards WOTY 2025
- Figma: Top Web Design Trends 2026
- Wix, Elementor, Squarespace: Design Trends 2026

### Design Theory
- Dieter Rams: 10 Principles of Good Design
- Erik Kennedy: 7 Rules for Creating Gorgeous UI (2024)
- Tobias van Schneider: Design as differentiator
- Vitaly Friedman / Smashing Magazine: Smart Interface Design Patterns

### Psychology
- Kurosu & Kashimura (1995): Aesthetic-Usability Effect
- Processing Fluency Theory (PMC 2023)
- Gestalt Principles (IxDF, Toptal, UX Tigers)
- Cognitive Load Theory (Miller, revised)
- Laws of UX (lawsofux.com)

### Palette & Color
- Poimandres Theme (drcmda/poimandres-theme) — palette completa
- Poimandres Neovim (olivercederborg/poimandres.nvim) — valori hex
- Stripe: Designing Accessible Color Systems
- Material Design 3: Tone-based Surface Color, Dark Theme
- Harvey AI: Rebuilding Design System from the Ground Up

### Legal Tech / Fintech Design
- Harvey AI: How We Approach Design
- Harvey AI: Design System (basement.studio case study)
- Normand PLLC: Black + orange legal website
- Mercury, Wealthsimple, Revolut: Fintech design leaders

### SaaS/Product Design
- Linear: How We Redesigned the UI + Brand Guidelines
- Vercel Geist Design System (colors, typography, spacing)
- Raycast: 2025 redesign with noise overlays
- LogRocket: Linear Design Trend Analysis

### Dark Mode
- Material Design 2: Dark Theme guidelines
- Material Design 3: Choosing a Color Scheme
- Smashing Magazine: Inclusive Dark Mode (2025)
- darkmodedesign.com: Curated inspiration

### Typography
- Pangram Pangram: Best Sans+Serif Pairings 2025
- Figma: Best Fonts for Websites 2026
- A List Apart: More Meaningful Typography
- Typescale.com: Typography Scale Guide

### Animation & Interaction
- PrimoTech: UI/UX Micro-Interactions & Motion 2026
- Stripe Website Gradient Effect analysis (kevinhufnagl.com)
- Shadow Digital: Website Animations 2026
