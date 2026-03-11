# Ops Console — Design Guidelines
> Pilota: dashboard `/ops`. Poi estendere ad altri pannelli interni.
> Aggiornato: 2026-03-02

---

## 1. Principi

- **Developer-first**: la console è per operatori interni, non per clienti. Priorità a densità informativa > marketing.
- **Consistenza > creatività**: ogni nuovo componente segue il pattern esistente, non inventa.
- **Nessuna emoji decorativa**: solo lucide-react. Le emoji nei testi markdown sono tollerate (report, daily plan), mai nel codice JSX.
- **Dark-only**: la console non supporta light mode. Usa sempre i token `--ops-*`.

---

## 2. Palette Poimandres (token CSS)

Definiti in `app/globals.css` sotto `:root`. **Non usare valori hardcoded** — usa i token.

| Token | Valore | Uso |
|-------|--------|-----|
| `--ops-bg` | `#1b1e28` | Background pagina |
| `--ops-surface` | `#252837` | Card, pannelli |
| `--ops-surface-2` | `#2d3146` | Hover, nested container |
| `--ops-border` | `#383b4d` | Bordi standard |
| `--ops-border-subtle` | `#2a2d3e` | Bordi sottili, divisori |
| `--ops-muted` | `#4c5068` | Placeholder, disabilitato |
| `--ops-fg-muted` | `#a6accd` | Testo secondario |
| `--ops-fg` | `#e4f0fb` | Testo primario |
| `--ops-accent` | `#FF6B35` | **Brand orange — CTA, active state** |
| `--ops-teal` | `#5de4c7` | Successo, completato |
| `--ops-cyan` | `#add7ff` | Info, link |
| `--ops-error` | `#e58d78` | Errore, critico |

> **Nota pratica**: finché Tailwind non è configurato con questi token custom, si usano i valori hardcoded equivalenti (`var(--ops-surface)` ≈ `--ops-surface`, `var(--ops-surface-2)` ≈ `--ops-surface-2`, ecc.). Migrare ai token è backlog low-priority.

---

## 3. Componenti standard

### Bottone nav header

```tsx
// CORRETTO — active state uniforme #FF6B35
<button
  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors
    ${isActive ? "bg-[#FF6B35] text-white" : "bg-[var(--ops-surface-2)] hover:bg-[var(--ops-hover)] text-[var(--ops-fg-muted)]"}`}
>
  <IconaLucide className="w-4 h-4" />
  Label
</button>
```

**Regola**: tutti i bottoni nav usano `bg-[#FF6B35] text-white` quando attivi. Zero varianti `zinc-600`.

### Icone nei bottoni

Ogni bottone nav ha un'icona lucide-react 16px a sinistra del testo. Mappatura standard:

| Sezione | Icona |
|---------|-------|
| CME | `Bot` |
| Vision | `Telescope` |
| Trading | `TrendingUp` |
| Legal Q&A | `Scale` |
| Archivio | `Archive` |
| Reports | `FileText` |
| Refresh | `RefreshCw` |

### Badge di stato task

```tsx
const STATUS_COLORS = {
  open:        "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_progress: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  review:      "bg-amber-500/20 text-amber-400 border-amber-500/30",
  done:        "bg-green-500/20 text-green-400 border-green-500/30",
  blocked:     "bg-red-500/20 text-red-400 border-red-500/30",
};
```

### Badge priorità (dot)

```tsx
const PRIORITY_DOTS = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-500",
  low:      "bg-[var(--ops-muted)]",
};
// Rendering: <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOTS[priority]}`} />
```

### Card container

```
bg-[var(--ops-surface)] rounded-xl border border-[var(--ops-border)]
```

### Icone dipartimento

**Fonte unica**: `lib/company/dept-icons.ts` → `DEPT_ICONS[deptId]`

```tsx
import { DEPT_ICONS } from "@/lib/company/dept-icons";

const DeptIcon = DEPT_ICONS[department];
// Rendering:
<span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#FF6B35]/10 border border-[#FF6B35]/20">
  <DeptIcon className="w-5 h-5 text-[#FF6B35]" />
</span>
```

**Mai** aggiungere icone dipartimento hardcoded nei componenti — sempre via `DEPT_ICONS`.

### Gruppi report (sidebar)

**Fonte unica**: `GROUP_ICONS` in `components/ops/ReportsPanel.tsx`
Il campo `emoji` nell'interfaccia `ReportGroup` è legacy (optional, non renderizzato).

---

## 4. Animazioni

- **Framer Motion sempre** — mai CSS animation raw nei componenti ops
- Pattern di mount: `initial={{ opacity: 0, x: 24 }}` → `animate={{ opacity: 1, x: 0 }}` → `duration: 0.18`
- Pattern overlay/drawer: `initial={{ opacity: 0, x: 320 }}` → `animate={{ opacity: 1, x: 0 }}`
- `AnimatePresence` per mount/unmount condizionale

---

## 5. Tipografia

- **Corpo**: DM Sans (default)
- **Heading sezione**: `text-lg font-semibold text-white`
- **Label secondarie**: `text-xs text-[var(--ops-muted)]`
- **Testo body**: `text-sm text-[var(--ops-fg-muted)]`
- **Codice inline**: `bg-[var(--ops-surface-2)] px-1 rounded text-[#FF6B35] font-mono text-xs`
- **Zero `font-serif`** nella console — Instrument Serif è solo per la landing

---

## 6. Layout

- **Grid principale**: `grid-cols-1 lg:grid-cols-4` — sidebar `col-span-1`, main `col-span-3`
- **Gap**: `gap-6` tra le sezioni principali
- **Padding pagina**: `px-4 py-8`
- **Max width**: `max-w-7xl mx-auto`

---

## 7. Come aggiungere un nuovo pannello

1. Crea `components/ops/NomePannello.tsx` con `"use client"` e Framer Motion per il mount
2. Aggiungi stato `showNome` in `OpsPageClient.tsx`
3. Aggiungi bottone nav con icona lucide + active state `bg-[#FF6B35]`
4. Aggiungi render nella condizione nel main content
5. Segui il pattern `bg-[var(--ops-surface)] rounded-xl border border-[var(--ops-border)]` per il container root

---

## 8. File chiave

| File | Responsabilità |
|------|---------------|
| `app/ops/OpsPageClient.tsx` | Shell principale, routing pannelli, nav |
| `app/globals.css` | Token CSS Poimandres (`--ops-*`) |
| `lib/company/dept-icons.ts` | Icone dipartimento (fonte unica) |
| `components/ops/TaskBoard.tsx` | Board task principale |
| `components/ops/TaskModal.tsx` | Modal dettaglio task |
| `components/ops/DepartmentDetailPanel.tsx` | Pannello dettaglio dipartimento |
