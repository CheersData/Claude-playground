# Migration Checklist: Vercel to Hetzner Cloud VM

Target: **Hetzner CX21** (2 vCPU, 4GB RAM, 40GB SSD, EUR 5.39/month)

---

## Pre-Migration Assessment

### Current Architecture (Vercel)
- Next.js app deployed on Vercel (Node.js runtime, NOT Edge)
- Python trading system runs locally (same machine, communicates via Supabase)
- Supabase hosted (PostgreSQL + pgvector + Auth + RLS)
- Stripe for payments (webhook -> Vercel endpoint)
- Vercel Crons: `0 6 * * 0` -> `/api/platform/cron/data-connector`

### Vercel-Specific Features Used
- `maxDuration` on 12 route handlers (60-300 seconds) -- on self-hosted Node.js these have no effect (unlimited by default)
- `vercel.json` with one cron job -- replaced by Alpine cron container
- Domain rewrites for `poimandres.work` -> `/console` -- handled in `next.config.ts`, works on any Node.js runtime
- No Edge Runtime, no Vercel KV, no Vercel Blob, no `@vercel/*` packages

### What Does NOT Change
- Supabase remains hosted (no migration needed)
- Stripe remains external (update webhook URL only)
- All API keys stay the same
- DNS management stays with current provider (just update A records)

---

## Phase 1: Hetzner Account and VM

- [ ] Create Hetzner Cloud account at https://console.hetzner.cloud
- [ ] Choose datacenter: **Falkenstein (fsn1)** or **Nuremberg (nbg1)** (Germany, GDPR-compliant)
- [ ] Provision **CX21** VM (2 vCPU AMD, 4GB RAM, 40GB SSD)
  - OS: **Ubuntu 22.04 LTS**
  - Enable IPv4 + IPv6
  - Add SSH key during provisioning
- [ ] Note the VM IP address: `___________________________`
- [ ] Test SSH access: `ssh root@<VM_IP>`

## Phase 2: VM Setup

- [ ] Upload and run setup script:
  ```bash
  scp deploy/scripts/setup-vm.sh root@<VM_IP>:/tmp/
  ssh root@<VM_IP> bash /tmp/setup-vm.sh
  ```
- [ ] Verify setup completed:
  - [ ] Docker installed and running
  - [ ] nginx installed
  - [ ] UFW firewall active (ports 22, 80, 443 only)
  - [ ] fail2ban running
  - [ ] 2GB swap configured
  - [ ] `deploy` user created with SSH keys
- [ ] Test login as deploy user: `ssh deploy@<VM_IP>`

## Phase 3: DNS Configuration

- [ ] Update DNS A records (keep TTL low during migration, e.g., 300s):
  ```
  poimandres.work         A    <VM_IP>
  www.poimandres.work     A    <VM_IP>
  poimandres.work      A    <VM_IP>
  www.poimandres.work  A    <VM_IP>
  ```
- [ ] Wait for DNS propagation (check with `dig poimandres.work`)
- [ ] Verify with: `curl -I http://poimandres.work` (should get nginx default page)

## Phase 4: SSL Certificates

- [ ] Copy nginx config files:
  ```bash
  sudo cp /opt/controlla-me/deploy/nginx/ssl-params.conf /etc/nginx/snippets/
  ```
- [ ] Get certificates (use temporary nginx config without SSL first):
  ```bash
  # Temporary config for certbot validation
  sudo certbot certonly --webroot -w /var/www/certbot \
    -d poimandres.work -d www.poimandres.work \
    --email <your-email> --agree-tos --no-eff-email

  sudo certbot certonly --webroot -w /var/www/certbot \
    -d poimandres.work -d www.poimandres.work \
    --email <your-email> --agree-tos --no-eff-email
  ```
- [ ] Install full nginx config:
  ```bash
  sudo cp /opt/controlla-me/deploy/nginx/nginx.conf /etc/nginx/nginx.conf
  sudo nginx -t && sudo systemctl restart nginx
  ```
- [ ] Enable auto-renewal: `sudo systemctl enable certbot.timer`
- [ ] Test SSL: `curl -I https://poimandres.work`

## Phase 5: Application Deployment

- [ ] Clone repository on VM:
  ```bash
  cd /opt
  sudo -u deploy git clone <repo-url> controlla-me
  ```
- [ ] Create production environment file:
  ```bash
  cd /opt/controlla-me
  cp deploy/.env.production.example deploy/.env.production
  nano deploy/.env.production    # Fill in all values
  ```
- [ ] Add `output: "standalone"` to `next.config.ts`:
  ```typescript
  const nextConfig: NextConfig = {
    output: "standalone",    // <-- ADD THIS for Docker deployment
    serverExternalPackages: ["pdf-parse"],
    // ...
  };
  ```
- [ ] Build and deploy:
  ```bash
  bash deploy/scripts/deploy.sh
  ```
- [ ] Verify services are running:
  ```bash
  docker compose -f deploy/docker-compose.yml ps
  docker logs controlla-nextjs --tail 50
  docker logs controlla-trading --tail 50
  ```

## Phase 6: External Service Updates

### Stripe
- [ ] Update webhook endpoint in Stripe Dashboard:
  - Old: `https://poimandres.work/api/webhook` (via Vercel)
  - New: `https://poimandres.work/api/webhook` (same URL, different server)
  - Stripe does not need changes if the domain stays the same
- [ ] Send a test webhook from Stripe Dashboard
- [ ] Verify webhook received: `docker logs controlla-nextjs | grep webhook`

### Supabase
- [ ] Supabase cloud is accessible from any IP (no whitelist needed with anon/service keys)
- [ ] Verify DB connection from VM:
  ```bash
  docker exec controlla-nextjs wget -qO- https://xxx.supabase.co/rest/v1/ \
    -H "apikey: <anon-key>" | head -c 200
  ```

### OAuth Redirect URIs (if using Integration Office)
- [ ] Google Cloud Console: update redirect URI to `https://poimandres.work/api/integrations/google-drive/callback`
- [ ] HubSpot App: update redirect URI to `https://poimandres.work/api/integrations/hubspot/callback`

## Phase 7: Verification

- [ ] Homepage loads: `https://poimandres.work`
- [ ] Console loads: `https://poimandres.work`
- [ ] Auth flow works (Supabase OAuth login)
- [ ] File upload works (PDF analysis pipeline)
- [ ] SSE streaming works (analysis progress)
- [ ] Corpus search works (`/corpus`)
- [ ] Stripe checkout flow works
- [ ] Trading system running (check logs)
- [ ] Cron job fires (wait for Sunday 06:00 UTC or test manually)
- [ ] Health check: `curl -s http://localhost:3000/ | head -c 100` (from VM)

## Phase 8: Decommission Vercel

- [ ] Keep Vercel deployment running for 48-72 hours as fallback
- [ ] Monitor error rates and response times on Hetzner
- [ ] Once stable:
  - [ ] Remove custom domains from Vercel project
  - [ ] Optionally delete Vercel project
  - [ ] Remove `vercel.json` from codebase (crons now handled by Alpine container)
- [ ] Update CI/CD pipeline (`.github/workflows/ci.yml`):
  - Add SSH deploy step or webhook trigger for automatic deployments

---

## Post-Migration: Monitoring Setup

### Basic monitoring (included in setup)
- Docker health checks (auto-restart on failure)
- fail2ban (SSH brute force protection)
- Log rotation (14 days, compressed)

### Recommended additions
- [ ] Set up Uptime Robot (free) or Hetrix Tools for external monitoring
  - Monitor `https://poimandres.work` (HTTP 200)
  - Monitor `https://poimandres.work` (HTTP 200)
  - Alert via Telegram
- [ ] Configure Hetzner Cloud monitoring (free, in dashboard)
  - CPU, RAM, disk, network graphs
- [ ] Set up log aggregation (optional):
  - Grafana Loki + Promtail (self-hosted, free)
  - Or Betterstack/Logtail (hosted, free tier)

---

## Backup Strategy

### What to back up
1. **`.env.production`** -- store a copy in a password manager (1Password, Bitwarden)
2. **`company/` directory** -- task board state, daemon reports, status files
3. **`.analysis-cache/`** -- optional, can be regenerated
4. **SSL certificates** -- auto-renewed by certbot, but good to have a copy

### Automated backups
```bash
# Add to crontab (deploy user):
# Daily backup of company data and env to /opt/backups/
0 3 * * * tar -czf /opt/backups/controlla-$(date +\%Y\%m\%d).tar.gz \
  /opt/controlla-me/deploy/.env.production \
  /opt/controlla-me/company/ \
  /opt/controlla-me/.analysis-cache/ 2>/dev/null

# Keep last 7 days
0 4 * * * find /opt/backups/ -name "controlla-*.tar.gz" -mtime +7 -delete
```

### Database backups
- Supabase provides daily automatic backups (Pro plan)
- For manual backups: Supabase Dashboard -> Database -> Backups

---

## Resource Estimates (CX21: 2 vCPU, 4GB RAM)

| Service | CPU | RAM | Disk |
|---------|-----|-----|------|
| Next.js | 0.5-1.5 cores | 512MB-2.5GB | ~500MB (image) |
| Trading | 0.1-0.5 cores | 256MB-1GB | ~300MB (image) |
| nginx | negligible | ~20MB | negligible |
| Cron | negligible | ~10MB | negligible |
| OS + Docker | 0.1 cores | ~300MB | ~3GB |
| Swap | -- | 2GB (disk) | 2GB |
| **Total peak** | **~2 cores** | **~4GB** | **~6GB of 40GB** |

The CX21 is tight but sufficient. If traffic grows, upgrade to CX31 (EUR 8.49/month, 2 vCPU, 8GB RAM).

---

## Rollback Plan

If the Hetzner deployment fails:

1. **Immediate** (< 5 min): Revert DNS A records to Vercel IP
2. **DNS propagation**: 5-30 minutes (depends on TTL)
3. **Vercel re-enable**: Re-add custom domains in Vercel dashboard

Keep Vercel project alive for at least 72 hours after migration.

---

## Cost Comparison

| Item | Vercel | Hetzner |
|------|--------|---------|
| Hosting | Free (Hobby) or EUR 20/mo (Pro) | EUR 5.39/mo (CX21) |
| Build minutes | Limited (Hobby) | Unlimited (self-hosted) |
| Bandwidth | 100GB (Hobby) / 1TB (Pro) | 20TB included |
| Serverless functions | 10s (Hobby) / 300s (Pro) | Unlimited duration |
| Cron jobs | 1/day (Hobby) / unlimited (Pro) | Unlimited |
| GDPR | US servers by default | Germany (EU) |
| **Total/month** | **EUR 0-20** | **EUR 5.39** |

Main advantages of Hetzner:
- GDPR compliance (EU datacenter)
- No function duration limits (critical for 5-min analysis pipeline)
- Python trading and Next.js on same machine (lower latency to shared Supabase)
- Full control over server configuration
- Predictable costs

---

## CI/CD Integration (Future)

After migration is stable, add automatic deployment to `.github/workflows/ci.yml`:

```yaml
deploy:
  needs: ci
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  steps:
    - name: Deploy to Hetzner
      uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.HETZNER_HOST }}
        username: deploy
        key: ${{ secrets.HETZNER_SSH_KEY }}
        script: |
          cd /opt/controlla-me
          bash deploy/scripts/deploy.sh
```

Required GitHub secrets:
- `HETZNER_HOST`: VM IP address
- `HETZNER_SSH_KEY`: Private SSH key for deploy user
