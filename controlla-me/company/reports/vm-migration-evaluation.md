# VM Migration Evaluation — Poimandres Always-On

Data: 2026-03-02
Autore: CME (con valutazione Architecture + Strategy + Security)

## Obiettivo

Spostare Poimandres su una VM always-on per garantire:
- Scheduler trading 24/7 (non dipende dal PC del boss)
- Company scheduler daemon sempre attivo
- Accessibilità da ovunque
- Autonomia operativa dei dipartimenti

## Provider Raccomandato: Hetzner Cloud

| Aspetto | Dettaglio |
|---------|-----------|
| Provider | **Hetzner Cloud** (Falkenstein/Nuremberg, Germania) |
| GDPR | Nativamente EU — data center in Germania |
| Server | CX21: 2 vCPU, 4GB RAM, 40GB SSD |
| Costo | **€4.85/mese** (CX21) o €8.49/mese (CX31: 2vCPU, 8GB, 80GB) |
| OS | Ubuntu 22.04 LTS |
| Backup | €1.16/mese aggiuntivo (20% del server) |
| Totale stimato | **€6-10/mese** (CX21 + backup) |

### Perché Hetzner e non altri

| Provider | Costo equivalente | GDPR | Note |
|----------|------------------|------|------|
| **Hetzner** | €4.85-8.49/mese | ✅ Germania | Miglior rapporto qualità/prezzo EU |
| DigitalOcean | $6-12/mese | ⚠️ US (EU available) | Più costoso, meno DC europei |
| Contabo | €4.99/mese | ✅ Germania | Economico ma supporto scarso |
| AWS Lightsail | $5-10/mese | ✅ Frankfurt | AWS overhead, billing complesso |
| Vercel (attuale) | $0-20/mese | ⚠️ US | Solo frontend, no processi long-running |

## Architettura Proposta

```
┌─────────────────────────────────────────┐
│          HETZNER VM (CX21)              │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ Next.js App │  │ Trading Scheduler│  │
│  │ (PM2/node)  │  │ (Python/PM2)     │  │
│  └─────────────┘  └──────────────────┘  │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ Company Scheduler Daemon            ││
│  │ (Node.js/PM2 — Telegram polling)    ││
│  └─────────────────────────────────────┘│
│                                         │
│  Supabase: cloud (invariato)            │
│  Alpaca: API (invariato)                │
│  Stripe: webhook → VM IP               │
└─────────────────────────────────────────┘
```

## Cosa cambia

| Componente | Ora (localhost) | VM |
|-----------|-----------------|-----|
| Next.js app | `npm run dev` su PC boss | PM2 + nginx reverse proxy |
| Trading scheduler | `python -m src.scheduler` (PID locale) | PM2 managed, auto-restart |
| Company scheduler | `npx tsx scripts/company-scheduler-daemon.ts` (manuale) | PM2 managed, auto-restart |
| Supabase | Cloud (invariato) | Cloud (invariato) |
| Alpaca | API (invariato) | API (invariato) |
| Claude Code | PC boss → SSH | PC boss → SSH in VM |
| Env vars | `.env.local` su PC | Vault o `.env` protetto |

## Security Assessment (dal dipartimento Security)

**Verdetto: CONDITIONAL GO** 🟡

### 13 Controlli P0 (obbligatori prima del deploy)

| # | Controllo | Effort | Note |
|---|-----------|--------|------|
| 1 | SSH key-only (no password) | 15 min | Disabilitare password auth |
| 2 | Firewall allow-list | 30 min | Solo porte 22 (SSH), 80, 443 |
| 3 | WireGuard VPN per admin | 1h | Accesso SSH solo via VPN |
| 4 | Secrets in env file (chmod 600) | 30 min | No secrets in repo |
| 5 | Auto-update OS | 30 min | `unattended-upgrades` |
| 6 | PM2 process manager | 30 min | Auto-restart su crash |
| 7 | nginx + Let's Encrypt SSL | 1h | HTTPS obbligatorio |
| 8 | Log rotation | 15 min | `logrotate` config |
| 9 | Monitoring (uptime) | 30 min | Uptime Robot o Hetrixtools (free) |
| 10 | Backup automated | 30 min | Hetzner snapshot + Supabase backup |
| 11 | fail2ban | 15 min | Protezione brute force |
| 12 | Node.js non-root | 15 min | Utente dedicato `poimandres` |
| 13 | Git deploy (pull-based) | 1h | `git pull && pm2 restart` |

**Effort totale setup sicuro: ~8h**

## Costi Mensili Stimati

| Voce | Costo |
|------|-------|
| Hetzner CX21 | €4.85 |
| Backup 20% | €0.97 |
| Dominio (se necessario) | €1-2 |
| **Totale** | **~€6-8/mese** |

Nota: Supabase, Alpaca, API AI sono già pagati indipendentemente.

## Timeline Setup

| Giorno | Attività |
|--------|----------|
| D1 (4h) | Provisioning VM, SSH, firewall, OS hardening |
| D1 (2h) | Node.js, Python, PM2, nginx, Let's Encrypt |
| D2 (2h) | Deploy app + trading + daemon, env vars |
| D2 (1h) | Test end-to-end, monitoring |
| D2 (1h) | WireGuard VPN, backup config |

**Totale: 2 giorni (10h)**

## Rischi

| Rischio | Mitigazione |
|---------|-------------|
| VM down = tutto down | Monitoring + alert + Hetzner SLA 99.9% |
| Secrets esposti | chmod 600 + VPN + no secrets in git |
| Costi crescono | CX21 fisso, nessun costo variabile |
| Latenza Supabase | Supabase EU + Hetzner EU = latenza minima |

## Decisione Richiesta (L3 — Boss Approval)

Per procedere serve:
1. **Boss approva** l'investimento (€6-8/mese)
2. **Boss fornisce** carta di credito per Hetzner
3. **Security esegue** i 13 controlli P0
4. **Operations implementa** il deploy

Questa è una decisione L3 (strategica) — richiede approvazione boss via Telegram.
