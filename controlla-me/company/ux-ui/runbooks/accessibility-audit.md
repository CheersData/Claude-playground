# Runbook: Audit Accessibilita

## Procedura

### 1. Scope

Definire cosa auditare:
- Intera app (audit completo — 2-4h)
- Singola pagina/componente (audit mirato — 30-60min)

### 2. Checklist WCAG 2.1 AA

#### Percepibile
- [ ] **1.1.1** Tutte le immagini hanno `alt` descrittivo (o `alt=""` se decorative)
- [ ] **1.3.1** Struttura semantica: heading gerarchici (h1→h2→h3), `<nav>`, `<main>`, `<aside>`
- [ ] **1.4.3** Contrasto testo >= 4.5:1 (testo grande >= 3:1)
- [ ] **1.4.11** Contrasto UI non-testo >= 3:1 (bordi input, icone interattive)

#### Operabile
- [ ] **2.1.1** Tutto accessibile da tastiera (Tab, Enter, Escape, Arrow)
- [ ] **2.4.3** Ordine di focus logico (non salta in modo confuso)
- [ ] **2.4.7** Focus visibile su tutti gli elementi interattivi
- [ ] **2.5.5** Touch target >= 44x44px (minimo WCAG: 24px, raccomandato: 44px)

#### Comprensibile
- [ ] **3.1.1** `lang="it"` sul tag `<html>`
- [ ] **3.3.1** Errori identificati con messaggio chiaro
- [ ] **3.3.2** Label o istruzioni per input obbligatori

#### Robusto
- [ ] **4.1.2** Ruoli, nomi e valori corretti per componenti custom (`aria-*`)

### 3. Strumenti

- **Contrasto**: incollare colori in https://webaim.org/resources/contrastchecker/
- **Struttura**: verificare heading nel DOM con DevTools (Elements → Accessibility)
- **Tastiera**: navigare l'intera pagina solo con Tab/Shift+Tab/Enter/Escape
- **Screen reader**: se disponibile, testare con NVDA (Windows) o VoiceOver (Mac)

### 4. Report

Formato identico a `docs/BEAUTY-REPORT.md`:

```markdown
## Score: X/10

| Canone | Stato | Violazioni |
|--------|-------|-----------|
| ... | ... | ... |

## Critici (da fixare prima del deploy)
### [N] Titolo
- Canone: ...
- File: ...
- Problema: ...
- Fix: ...

## Importanti
...

## Punti di forza
...
```

### 5. Creare task per i fix

Per ogni issue critico/importante:
```bash
npx tsx scripts/company-tasks.ts create \
  --title "Fix accessibilita: [titolo]" \
  --dept ux-ui \
  --priority high \
  --by ui-ux-designer \
  --desc "[problema e fix proposto]"
```
