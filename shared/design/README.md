# Lightlife — okmom.mom Design System

Design system condiviso per tutti i progetti okmom.mom.

## Uso

In qualsiasi progetto, nel `tailwind.config.ts`:

```typescript
import lightlife from "../okmom-design/tailwind-preset";

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
```

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
