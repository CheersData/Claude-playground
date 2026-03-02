# Runbook: Implementare una Modifica UI

## Procedura

### 1. Analizzare la richiesta

- Cosa deve cambiare? (nuovo componente, restyling, fix, responsive)
- Quali file sono coinvolti?
- Impatta il Design System (nuovi token, colori, spacing)?

### 2. Verificare il Design System

Leggere `docs/BEAUTY-REPORT.md`:
- La modifica usa token esistenti?
- Se serve un nuovo token, documentarlo nel Beauty Report
- Verificare che non crei inconsistenze (es. nuovo colore non in palette)

### 3. Implementare

```
1. Componente con "use client" se ha interattivita
2. Tailwind per styling (no inline style)
3. Framer Motion per animazioni
4. Lucide React per icone
5. Mobile-first → md: per desktop
```

### 4. Checklist pre-PR

- [ ] Focus visible su tutti gli elementi interattivi
- [ ] `aria-label` su input senza label visibile
- [ ] Touch target >= 44x44px su mobile
- [ ] Contrasto testo >= 4.5:1
- [ ] Responsive: testato su 375px, 768px, 1280px
- [ ] Nessun valore arbitrario (`px-[17px]`) se esiste un token Tailwind
- [ ] Animazioni con Framer Motion (durata 150-300ms)
- [ ] Nessuna icona esterna (solo lucide-react)

### 5. Aggiornare documentazione

Se il Design System e cambiato:
- Aggiornare `docs/BEAUTY-REPORT.md`
- Aggiornare `company/ux-ui/department.md` sezione Design System
