# Rebrand Deploy Plan — poimandres.work as Primary Domain

Data: 2026-03-22 | Task: 10655adc | Responsabile: ops-sysadmin

---

## 1. Pre-deploy Checklist

- [ ] DNS A record for `poimandres.work` points to Hetzner VPS IP
- [ ] SSL cert for `poimandres.work` issued via certbot (`certbot certonly --webroot`)
- [ ] SSL cert for `controlla.me` still valid (needed for 301 redirect server block)
- [ ] `NEXT_PUBLIC_APP_URL=https://poimandres.work` in `deploy/.env.production`
- [ ] Stripe webhook + checkout URLs updated (see section 4)
- [ ] Supabase Auth callback URL updated (see section 5)
- [ ] Announce maintenance window (low traffic: domenica 04:00-05:00 CET)

## 2. DNS Changes

Already done: `poimandres.work` A record points to VPS. Verify with `dig poimandres.work`.

Remaining:
- [ ] Add `www.poimandres.work` CNAME -> `poimandres.work`
- [ ] Keep `controlla.me` A record pointing to same VPS (serves 301 redirects)
- [ ] TTL: set to 300s (5 min) 24h before switch, restore to 3600s after confirmation

## 3. 301 Redirects (nginx)

The nginx config (`deploy/nginx/nginx.conf`) already has the correct structure:
- `controlla.me` + `www.controlla.me` -> `return 301 https://poimandres.work$request_uri`
- `poimandres.work` is the primary server block serving the app

No changes needed in nginx. The redirect preserves the full path (`$request_uri`), so:
- `controlla.me/pricing` -> `poimandres.work/pricing`
- `controlla.me/api/analyze` -> `poimandres.work/api/analyze`
- `controlla.me/corpus/article/123` -> `poimandres.work/corpus/article/123`

SEO note: 301 = permanent. Search engines transfer link equity. Keep redirects active for 12+ months.

## 4. Stripe Updates

All changes in Stripe Dashboard (no deploy needed):
- [ ] **Webhook endpoint**: change URL to `https://poimandres.work/api/webhook`
- [ ] **Checkout success_url**: update in `app/api/stripe/checkout/route.ts` -> `${NEXT_PUBLIC_APP_URL}/dashboard`
- [ ] **Checkout cancel_url**: update in same file -> `${NEXT_PUBLIC_APP_URL}/pricing`
- [ ] **Customer portal return_url**: update in `app/api/stripe/portal/route.ts`
- [ ] Keep old webhook active for 48h (in-flight checkouts may still use controlla.me)

Note: `success_url` and `cancel_url` are built from `NEXT_PUBLIC_APP_URL` env var. Updating that env var handles all checkout URLs automatically.

## 5. Supabase Auth — OAuth Callback URLs

In Supabase Dashboard > Authentication > URL Configuration:
- [ ] **Site URL**: `https://poimandres.work`
- [ ] **Redirect URLs**: add `https://poimandres.work/**`, keep `https://controlla.me/**` for 30 days
- [ ] Verify `app/api/auth/callback/route.ts` uses `NEXT_PUBLIC_APP_URL` for redirects (it does)

For each OAuth provider (Google, GitHub, etc.):
- [ ] Update authorized redirect URI to `https://poimandres.work/api/auth/callback`
- [ ] Keep old URI active for 30 days

## 6. Nginx / Reverse Proxy Config

Current config already correct. Verify post-deploy:
- [ ] `server_name poimandres.work www.poimandres.work` on main server block
- [ ] `controlla.me` server block returns 301 to `poimandres.work`
- [ ] SSL certs valid for both domains
- [ ] `nginx -t` passes, then `systemctl reload nginx`

App-level changes:
- [ ] `NEXT_PUBLIC_APP_URL=https://poimandres.work` in `.env.production`
- [ ] `app/robots.ts` and `app/sitemap.ts` — verify they use `NEXT_PUBLIC_APP_URL`
- [ ] Rebuild and restart: `docker compose build && docker compose up -d`

## 7. Rollback Plan

If anything breaks within 1 hour of deploy:
1. Revert `NEXT_PUBLIC_APP_URL` to `https://controlla.me`
2. Swap nginx server blocks: make `controlla.me` the primary, `poimandres.work` the redirect
3. `nginx -t && systemctl reload nginx`
4. Revert Supabase Site URL to `https://controlla.me`
5. Revert Stripe webhook URL
6. Rebuild app: `docker compose build && docker compose up -d`

Total rollback time: ~5 minutes (nginx swap is instant, app rebuild ~2 min).

## 8. Post-deploy Monitoring (first 24h)

- [ ] `curl -I https://controlla.me/pricing` -> expect `301 Location: https://poimandres.work/pricing`
- [ ] `curl -I https://poimandres.work` -> expect `200`
- [ ] Test full auth flow: login -> callback -> dashboard
- [ ] Test Stripe checkout: pricing -> checkout -> success redirect
- [ ] Test SSE streaming: upload document -> analysis completes
- [ ] Check nginx error log: `tail -f /var/log/nginx/error.log`
- [ ] Check app logs: `docker compose logs -f --tail=100`
- [ ] Monitor Google Search Console for crawl errors (next 7 days)
- [ ] Submit updated sitemap: `https://poimandres.work/sitemap.xml`
