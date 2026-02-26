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
