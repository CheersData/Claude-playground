---
description: "Crea o applica il design system 'lightlife' di okmom.mom al progetto corrente. Crea il preset Tailwind condiviso, configura il progetto, aggiorna beauty config."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# 💡 Lightlife — okmom.mom Design System

Sei un design system architect. Devi creare e/o applicare il design system "lightlife" al progetto corrente.

## STEP 1: Verifica se il preset esiste già

Cerca `../design/tailwind-preset.ts` relativo alla root del progetto.

- Se **esiste** → vai a STEP 3 (applica al progetto)
- Se **non esiste** → vai a STEP 2 (crea il preset)

## STEP 2: Crea il design system

Crea la cartella `../design/` (fratello del progetto corrente, nella stessa directory padre).

### Crea `../design/tailwind-preset.ts`:

```typescript
import type { Config } from "tailwindcss";

const lightlife: Partial<Config> = {
  theme: {
    extend: {
      // ─── COLORI ───
      colors: {
        // Superfici
        background: "#FFFFFF",
        "background-secondary": "#F8F8FA",
        surface: "#FFFFFF",
        "surface-hover": "#F5F5F7",
        "surface-active": "#EEEFF1",

        // Testo
        foreground: "#1A1A1A",
        "foreground-secondary": "#6B6B6B",
        "foreground-tertiary": "#9B9B9B",
        "foreground-inverse": "#FFFFFF",

        // Brand — ogni progetto può sovrascrivere "primary"
        primary: {
          DEFAULT: "#FF6B35",
          50: "#FFF5F0",
          100: "#FFE8DB",
          200: "#FFD0B5",
          300: "#FFB088",
          400: "#FF8E5A",
          500: "#FF6B35",
          600: "#E85A24",
          700: "#C44A18",
          800: "#9C3B12",
          900: "#7A2F0E",
        },

        // Semantici
        success: {
          DEFAULT: "#22C55E",
          light: "#F0FDF4",
          dark: "#166534",
        },
        warning: {
          DEFAULT: "#F59E0B",
          light: "#FFFBEB",
          dark: "#92400E",
        },
        danger: {
          DEFAULT: "#EF4444",
          light: "#FEF2F2",
          dark: "#991B1B",
        },
        info: {
          DEFAULT: "#3B82F6",
          light: "#EFF6FF",
          dark: "#1E40AF",
        },

        // Bordi & divisori
        border: "#E5E5E5",
        "border-strong": "#D4D4D4",
        "border-subtle": "#F0F0F0",
        divider: "#F0F0F0",
      },

      // ─── TIPOGRAFIA ───
      fontFamily: {
        heading: ['"DM Sans"', "system-ui", "sans-serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },

      fontSize: {
        // Scale coerente: niente valori random
        "display-xl": ["3rem", { lineHeight: "1.1", fontWeight: "700" }],      // 48px
        "display": ["2.25rem", { lineHeight: "1.15", fontWeight: "700" }],      // 36px
        "h1": ["1.875rem", { lineHeight: "1.2", fontWeight: "600" }],           // 30px
        "h2": ["1.5rem", { lineHeight: "1.25", fontWeight: "600" }],            // 24px
        "h3": ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],            // 20px
        "h4": ["1.125rem", { lineHeight: "1.35", fontWeight: "500" }],          // 18px
        "body-lg": ["1.0625rem", { lineHeight: "1.6", fontWeight: "400" }],     // 17px
        "body": ["0.9375rem", { lineHeight: "1.6", fontWeight: "400" }],        // 15px
        "body-sm": ["0.8125rem", { lineHeight: "1.5", fontWeight: "400" }],     // 13px
        "caption": ["0.75rem", { lineHeight: "1.5", fontWeight: "400" }],       // 12px
        "overline": ["0.6875rem", { lineHeight: "1.4", fontWeight: "600", letterSpacing: "0.05em" }],
      },

      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },

      // ─── SPACING ───
      // Scala 4px-based, no valori arbitrari
      spacing: {
        "0.5": "2px",
        "1": "4px",
        "1.5": "6px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
        "20": "80px",
        "24": "96px",
      },

      // ─── BORDER RADIUS ───
      borderRadius: {
        none: "0",
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        full: "9999px",
      },

      // ─── SHADOWS ───
      boxShadow: {
        "xs": "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
        "sm": "0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)",
        "DEFAULT": "0 2px 8px -2px rgba(0, 0, 0, 0.06), 0 1px 3px -1px rgba(0, 0, 0, 0.04)",
        "md": "0 4px 12px -4px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)",
        "lg": "0 8px 24px -8px rgba(0, 0, 0, 0.10), 0 4px 12px -4px rgba(0, 0, 0, 0.05)",
        "xl": "0 16px 40px -12px rgba(0, 0, 0, 0.12), 0 8px 20px -8px rgba(0, 0, 0, 0.06)",
        "inner": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.04)",
        "none": "0 0 #0000",
      },

      // ─── TRANSIZIONI ───
      transitionDuration: {
        "fast": "150ms",
        "DEFAULT": "200ms",
        "slow": "300ms",
      },

      transitionTimingFunction: {
        "DEFAULT": "cubic-bezier(0.4, 0, 0.2, 1)",
        "in": "cubic-bezier(0.4, 0, 1, 1)",
        "out": "cubic-bezier(0, 0, 0.2, 1)",
        "bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      // ─── BREAKPOINTS ───
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1440px",
      },

      // ─── CONTAINER ───
      maxWidth: {
        "content": "720px",
        "wide": "1024px",
        "page": "1200px",
      },

      // ─── Z-INDEX ───
      zIndex: {
        "dropdown": "100",
        "sticky": "200",
        "modal-backdrop": "300",
        "modal": "400",
        "toast": "500",
        "tooltip": "600",
      },
    },
  },
};

export default lightlife;
```

### Crea `../design/README.md`:

```markdown
# 💡 Lightlife — okmom.mom Design System

Design system condiviso per tutti i progetti okmom.mom.

## Uso

In qualsiasi progetto, nel `tailwind.config.ts`:

\`\`\`typescript
import lightlife from "../design/tailwind-preset";

export default {
  presets: [lightlife],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Override per questo progetto specifico
      colors: {
        primary: { DEFAULT: "#TUO_COLORE" },
      },
    },
  },
};
\`\`\`

## Cosa include

- **Colori**: superfici, testo, semantici, bordi (palette light)
- **Tipografia**: DM Sans (heading + body), scala coerente
- **Spacing**: scala 4px-based
- **Border radius**: 6-20px
- **Shadows**: 6 livelli soft
- **Transizioni**: fast/default/slow + easing curves
- **Breakpoints**: 640/768/1024/1280/1440px
- **Z-index**: dropdown/sticky/modal/toast/tooltip

## Principi

1. **Bianco e pulito** — sfondo #FFFFFF, ombre sottili, tanto respiro
2. **Niente valori random** — solo token dal preset
3. **Ogni progetto ha il suo primary** — controlla.me = #FF6B35, Soldi Persi = TBD
4. **Beauty valida contro questo** — il comando /beauty verifica compliance
```

### Crea `../design/package.json`:

```json
{
  "name": "okmom-design",
  "version": "1.0.0",
  "description": "Lightlife — okmom.mom design system (Tailwind preset)",
  "main": "tailwind-preset.ts",
  "private": true
}
```

## STEP 3: Applica al progetto corrente

### 3a. Aggiorna `tailwind.config.ts` del progetto

Leggi il tailwind.config.ts attuale. Modificalo per:
1. Importare il preset: `import lightlife from "../design/tailwind-preset";`
2. Aggiungerlo: `presets: [lightlife],`
3. Rimuovere dal `theme.extend` tutto quello che è già nel preset (colori, font, radius, shadow)
4. Tenere solo gli override specifici del progetto

Se non esiste tailwind.config.ts, crealo con il preset.

### 3b. Aggiorna `globals.css` o file CSS principale

Assicurati che:
- Lo sfondo sia `bg-background` (non hardcodato `bg-white` o `bg-[#xxx]`)
- Il testo sia `text-foreground` (non `text-black` o `text-[#xxx]`)
- I bordi usino `border-border` (non `border-gray-200` o hardcodati)

Trova e segnala (ma NON cambiare automaticamente) tutti i colori hardcodati:
```bash
grep -rn '#[0-9a-fA-F]\{3,8\}' --include='*.tsx' --include='*.jsx' --include='*.css' | grep -v node_modules | grep -v '.next' | head -40
```

### 3c. Aggiorna la sezione `beauty` di `qa.config.json`

Se esiste qa.config.json, aggiorna la sezione `beauty` con:
```json
{
  "beauty": {
    "design_system": "../design/tailwind-preset.ts",
    "palette": {
      "background": "#FFFFFF",
      "background_secondary": "#F8F8FA",
      "foreground": "#1A1A1A",
      "foreground_secondary": "#6B6B6B",
      "primary": "#FF6B35",
      "success": "#22C55E",
      "warning": "#F59E0B",
      "danger": "#EF4444",
      "border": "#E5E5E5"
    },
    "fonts": { "heading": "DM Sans", "body": "DM Sans", "mono": "JetBrains Mono" },
    "spacing_scale": [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96],
    "border_radius": "8px",
    "breakpoints": { "sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px", "2xl": "1440px" }
  }
}
```

## STEP 4: Report

Stampa un riepilogo:

1. ✅ Design system creato/trovato in `../design/`
2. ✅ Tailwind config aggiornato con preset
3. ✅ qa.config.json beauty aggiornata
4. ⚠️ [N] colori hardcodati trovati (elenco file:riga) — "Vuoi che li converta ai token lightlife?"
5. Suggerisci: "Lancia /beauty per verificare la compliance completa"
