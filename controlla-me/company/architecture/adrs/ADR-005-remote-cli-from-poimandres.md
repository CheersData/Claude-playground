# ADR-005: Remote CLI Execution from poimandres.work

## Status

Proposed

## Date

2026-03-19

## Context

### The Problem

The `/ops` page on poimandres.work includes a Boss Terminal (`components/ops/BossTerminal.tsx`) that lets the boss run whitelisted CLI commands from the browser. The terminal calls `POST /api/ops/exec` which spawns local child processes via Node.js `child_process.spawn()` and streams output back via SSE.

**This works on localhost but breaks completely on Vercel.** Vercel Functions are serverless (AWS Lambda under the hood): there is no persistent filesystem, no `npx`, no `tsx`, no `git`, no project directory. The `spawn()` call fails immediately.

### Current Architecture

```
[Browser /ops]
    |
    | POST /api/ops/exec { command: "npx tsx scripts/company-tasks.ts board" }
    |
    v
[Vercel Function] -- spawn("npx.cmd", ["tsx", "scripts/company-tasks.ts", "board"])
    |
    X  FAILS: no npx, no tsx, no scripts/, no node_modules, no .env.local
```

### What the Scripts Do

The whitelisted commands in `/api/ops/exec/route.ts` are:

| Command | Dependencies | Notes |
|---------|-------------|-------|
| `company-tasks.ts board/list/create/claim/done` | Supabase (remote), fs (read/write `company/*.json`) | Core task management |
| `forma-mentis.ts context/goals/discover/remember` | Supabase (remote), fs (read `company/`) | Memory queries |
| `dept-context.ts` | fs (read `company/*/status.json`, `department.md`), Supabase | Reads 12+ status files |
| `daily-standup.ts` | fs (read/write `company/daily-plans/`), Supabase | Creates daily plan file |
| `data-connector.ts status/update` | Supabase (remote), some fs for sync log | Pipeline status |
| `check-data.ts` | Supabase (remote) | QA checks |
| `corpus-sources.ts` | fs (config), Supabase | Source config |
| `update-dept-status.ts` | fs (write `company/*/status.json`), Supabase | Updates status files |
| `git status` | git binary, `.git/` directory | Git state |
| `git log --oneline -20` | git binary, `.git/` directory | Commit history |
| `npm run build` | Full Node.js project | Build check |
| `npm run lint` | Full Node.js project | Lint check |

**Key observation**: Every script depends on at least one of: (a) the local filesystem (`company/*.json`, `company/*/status.json`), (b) Node.js binary tooling (`npx`, `tsx`, `git`, `npm`), (c) the full project tree. None of these exist on Vercel.

### Security Model (Preserved in All Options)

The current endpoint has a robust security stack that any solution must preserve:

1. **Command allowlist** (strict prefix matching, non-negotiable)
2. **HMAC-SHA256 console auth** (`requireConsoleAuth`)
3. **CSRF check** (`checkCsrf`)
4. **Rate limiting** (10/min via `checkRateLimit`)
5. **Shell metacharacter rejection** (defense-in-depth)
6. **No shell mode** (`spawn` without `shell: true`)
7. **Process timeout** (5 minutes)
8. **Kill capability** (`DELETE /api/ops/exec/:pid`)

## Options Evaluated

### Option A: VPS Companion

A small always-on VPS (Hetzner CX22 at 3.29 EUR/month, or DigitalOcean Basic at $4/month) runs the controlla-me project. It exposes an authenticated REST API that executes CLI commands. The Vercel frontend proxies requests to the VPS.

```
[Browser /ops]
    |
    | POST /api/ops/exec { command: "..." }
    |
    v
[Vercel Function] -- HTTPS POST --> [VPS: 5.9.x.x:3001/exec]
    |                                     |
    | SSE proxy <------- SSE stream ------| spawn("npx", [...])
    v                                     v
[Browser receives streamed output]   [Full project: git, node_modules, company/, scripts/]
```

**Implementation**:
- A lightweight Express/Fastify server on the VPS (50-80 lines of code)
- Same allowlist + HMAC auth as current `/api/ops/exec`
- Shared secret between Vercel and VPS (env var `OPS_VPS_SECRET`)
- SSE passthrough: VPS streams output, Vercel Function proxies the SSE stream to the browser
- HTTPS with Let's Encrypt (free, auto-renew with certbot)

**Evaluation**:

| Criterion | Score | Notes |
|-----------|-------|-------|
| Cost | 3-4 EUR/month | Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD) or DigitalOcean $4 Basic |
| Setup complexity | Medium | Provision VPS, install Node.js, clone repo, setup systemd service, configure HTTPS, firewall |
| Security | High | Shared secret + HMAC, HTTPS, firewall allows only Vercel IPs (or general HTTPS) |
| Latency | +20-50ms | One extra hop (Vercel -> VPS). Negligible for CLI commands that take seconds |
| Reliability | High | VPS is always on. systemd restart on crash. Unattended upgrades |
| Maintenance | Medium | OS updates, Node.js updates, git pull for new scripts. Can be automated with cron |
| Offline access | Yes | VPS is independent of boss's machine |
| Concurrent users | Yes | Multiple operators can use the terminal simultaneously |

**Pros**:
- Works immediately with minimal changes to the frontend
- Full project environment available (git, node_modules, company/, scripts/)
- Independent of the boss's machine being online
- Can also run the daemon (`cme-autorun.ts --watch`) 24/7
- Can serve as a staging server for other services (trading Python, etc.)

**Cons**:
- Monthly cost (though minimal)
- Server maintenance (OS patches, disk space, monitoring)
- Need to keep the repo in sync (git pull, npm install on updates)
- Another attack surface to protect

---

### Option B: WebSocket Tunnel (ngrok / Cloudflare Tunnel)

A daemon on the boss's machine opens a persistent tunnel to a relay service. The browser connects to the relay, which forwards commands to the local machine.

```
[Browser /ops]
    |
    | wss://tunnel.poimandres.work/exec
    |
    v
[Relay: Cloudflare Tunnel / ngrok]
    |
    | Persistent tunnel (outbound from boss machine)
    v
[Boss's machine: localhost]
    |
    | spawn("npx", [...])
    v
[Full project: git, node_modules, company/, scripts/]
```

**Implementation variants**:

- **B1: Cloudflare Tunnel (free)**: `cloudflared tunnel` on boss's machine. Points a subdomain (e.g., `ops-cli.poimandres.work`) to a local Express server on port 3001. Cloudflare handles TLS and auth (Access policies).
- **B2: ngrok (free tier)**: `ngrok http 3001` on boss's machine. Provides a public URL. Rate limited on free tier (40 connections/min).
- **B3: Custom WebSocket relay**: A tiny relay server on Vercel or Cloudflare Workers that bridges browser WebSocket to the local machine's WebSocket. Most complex to build.

**Evaluation**:

| Criterion | Score | Notes |
|-----------|-------|-------|
| Cost | 0 EUR/month | Cloudflare Tunnel is free. ngrok free tier has limits |
| Setup complexity | Low-Medium | Install cloudflared/ngrok, configure tunnel, run daemon |
| Security | Medium-High | Cloudflare Access provides SSO/OTP. ngrok free has no auth (must add own). Custom relay needs full auth implementation |
| Latency | +10-30ms | Tunnel adds minimal latency. Cloudflare edge is fast |
| Reliability | Low-Medium | Depends on boss's machine being ON and tunnel daemon running. Power outage / sleep = down |
| Maintenance | Low | Cloudflare auto-updates. ngrok is a single binary |
| Offline access | No | Requires boss's machine to be running |
| Concurrent users | Limited | Single machine, no multi-session isolation |

**Pros**:
- Zero monthly cost
- Zero server to maintain
- The boss's machine has full dev environment (VS Code, Claude Code, git state, everything)
- Commands execute on the actual dev machine, so results match what the boss sees locally
- Cloudflare Tunnel has built-in auth (Cloudflare Access, free for up to 50 users)

**Cons**:
- Boss's machine must be on and tunnel must be running
- If the machine sleeps/reboots, the terminal goes offline with no notice
- Commands run with the boss's user permissions (security consideration)
- Not suitable for 24/7 operations (daemon, automated tasks)
- Single point of failure

---

### Option C: Vercel Serverless Adaptation

Refactor the scripts to run inside Vercel Functions. Replace filesystem calls with Supabase queries. Bundle scripts as serverless functions.

```
[Browser /ops]
    |
    | POST /api/ops/exec-serverless { command: "company-tasks board" }
    |
    v
[Vercel Function: maxDuration=300]
    |
    | Direct function call (no spawn)
    | company-tasks board logic inlined
    v
[Supabase: task queries, status reads]
    |
    v
[Response streamed as SSE]
```

**Implementation**:
- Create serverless-compatible versions of each script
- Replace all `fs.readFileSync("company/*/status.json")` with Supabase table reads
- Replace `fs.writeFileSync("company/daemon-report.json")` with Supabase writes
- Replace `spawn("npx", ...)` and `execSync("git ...")` with API calls or remove
- Each "command" becomes a function import, not a process spawn

**Evaluation**:

| Criterion | Score | Notes |
|-----------|-------|-------|
| Cost | 0 EUR/month | Within Vercel free/pro plan limits |
| Setup complexity | Very High | Major refactoring: 142 filesystem calls across 28 script files. Every status.json read/write must be replaced with Supabase calls. Git commands impossible. |
| Security | High | Same Vercel security model. No extra attack surface |
| Latency | Low | No extra hop. Direct execution |
| Reliability | High | Vercel's uptime SLA |
| Maintenance | Low (once done) | No server to maintain. But scripts diverge from local versions |
| Offline access | Yes | Serverless is always available |
| Concurrent users | Yes | Stateless functions scale automatically |

**Pros**:
- Zero infrastructure cost
- Zero maintenance burden
- Always available (Vercel uptime)
- Scales automatically

**Cons**:
- **Massive refactoring effort**: 142 filesystem calls across 28 scripts must be replaced. This is not a weekend project.
- **Script divergence**: Serverless versions would diverge from CLI versions. Two codebases to maintain or a complete migration.
- **Impossible for some commands**: `git status`, `git log`, `npm run build`, `npm run lint` cannot run on Vercel. These would have to be replaced with GitHub API calls (partial info) or removed entirely.
- **5-minute timeout**: Vercel Pro maxDuration is 300s. Long-running scripts (daemon, build) cannot run.
- **Cold starts**: First invocation after idle adds 1-3s latency.
- **Loss of fidelity**: The boss uses these scripts to see the *local* state of the project. A serverless version would show a different (database-only) view, losing git state, local file changes, etc.

---

### Option D: Hybrid (Vercel UI + Local Agent)

The boss runs a lightweight Node.js agent on their machine. The agent connects to poimandres.work via WebSocket (outbound). The browser sends commands to Vercel, Vercel relays to the agent via WebSocket, the agent executes locally and streams output back.

```
[Browser /ops]
    |
    | POST /api/ops/exec { command: "..." }
    |
    v
[Vercel Function]
    |
    | WebSocket relay (via Vercel or external WS service)
    |
    v
[Local Agent: ws-client.ts running on boss's machine]
    |
    | spawn("npx", [...]) — same as current /api/ops/exec logic
    v
[Full project: git, node_modules, company/, scripts/]
```

**Implementation**:
- A `scripts/ops-agent.ts` (100-150 lines) that:
  1. Connects to a WebSocket endpoint (e.g., `wss://poimandres.work/api/ops/ws` or a Pusher/Ably channel)
  2. Authenticates with HMAC token
  3. Listens for command messages
  4. Spawns processes (reusing the exact same allowlist and spawn logic)
  5. Streams stdout/stderr back via WebSocket
- Vercel needs a WebSocket relay. Options: Pusher (free tier: 200K messages/day), Ably, or a Cloudflare Durable Object.
- `BossTerminal.tsx` modified to use WebSocket instead of fetch+SSE

**Evaluation**:

| Criterion | Score | Notes |
|-----------|-------|-------|
| Cost | 0-5 EUR/month | Free with Pusher/Ably free tier. Cloudflare Workers with Durable Objects: ~$5/month if used |
| Setup complexity | Medium-High | Agent script, WebSocket relay service, reconnection logic, auth handshake |
| Security | Medium | WebSocket auth needed. Agent runs with boss's permissions. Relay service adds trust surface |
| Latency | +30-80ms | Browser -> Vercel -> Relay -> Agent -> spawn. More hops |
| Reliability | Low-Medium | Same as Option B: depends on boss's machine being on |
| Maintenance | Medium | Agent script updates, WebSocket reconnection handling, heartbeat monitoring |
| Offline access | No | Requires boss's machine |
| Concurrent users | Limited | Single machine (unless multiple agents register) |

**Pros**:
- Executes on the actual dev machine (same as current localhost behavior)
- Agent is a single script, easy to start (`npx tsx scripts/ops-agent.ts`)
- Can be launched from a batch file / startup script
- Zero monthly cost with Pusher free tier

**Cons**:
- WebSocket relay adds architectural complexity and a third-party dependency
- Vercel Functions cannot maintain persistent WebSocket connections (they are request/response)
  - This means we need an external relay (Pusher, Ably, Cloudflare Durable Object) -- not a simple Vercel WebSocket endpoint
- Reconnection logic is non-trivial (network drops, machine sleep, agent restart)
- Boss's machine must be on and agent running
- Not suitable for 24/7 operations

---

### Option E: Hybrid VPS + Tunnel (Composite)

Use Option A (VPS) as the primary execution environment for 24/7 operations (daemon, automated tasks), and Option B (Cloudflare Tunnel) as a secondary path for when the boss wants to execute on their local machine.

This is mentioned for completeness but adds complexity without clear benefit over choosing A or B.

## Decision Matrix

| Criterion (weight) | A: VPS (4EUR) | B: CF Tunnel (free) | C: Serverless | D: WS Agent |
|---------------------|:---:|:---:|:---:|:---:|
| **Monthly cost** | 3-4 EUR | 0 | 0 | 0-5 EUR |
| **Setup effort** (1-5, 1=easy) | 3 | 2 | 5 | 4 |
| **Security** (1-5, 5=best) | 5 | 4 | 5 | 3 |
| **Reliability** (1-5, 5=best) | 5 | 2 | 5 | 2 |
| **Latency** | +20-50ms | +10-30ms | +0ms | +30-80ms |
| **Fidelity** (sees real state) | Medium | Full | Low | Full |
| **24/7 availability** | Yes | No | Yes | No |
| **Git commands work** | Yes | Yes | No | Yes |
| **Can run daemon** | Yes | Yes (if on) | No | Yes (if on) |
| **Multi-operator** | Yes | No | Yes | No |
| **Frontend changes** | Minimal | Moderate | Major | Major |

## Recommendation

**Option A (VPS Companion)** is the recommended approach for the following reasons:

1. **Reliability**: A VPS is always on. The boss can use the terminal from any device, any network, at any time. This matches the expectation of a production tool.

2. **Full fidelity**: All 12 whitelisted commands work as-is. The VPS has the full project tree, git history, node_modules, `.env.local`. No command needs adaptation.

3. **Minimal frontend changes**: `BossTerminal.tsx` continues to call `POST /api/ops/exec`. The only change is that the Vercel function proxies to the VPS instead of calling `spawn()` locally. The SSE protocol stays identical.

4. **Daemon hosting**: The VPS can run `cme-autorun.ts --watch` 24/7, eliminating the need for the boss to keep a terminal open locally.

5. **Security**: HTTPS + shared secret + existing HMAC auth. The VPS firewall can restrict access to Vercel's IP ranges and the boss's IP.

6. **Cost**: 3-4 EUR/month is negligible for a business tool. Hetzner CX22 (2 vCPU, 4GB RAM) is overkill for CLI commands -- even the cheapest CX11 (1 vCPU, 2GB RAM, 2.49 EUR/month) would suffice.

7. **Growth path**: The VPS becomes the "ops server" for the virtual company. It can later host the trading Python scripts, background data-connector sync jobs, and CI/CD runners -- all things that cannot run on Vercel.

### Why Not the Others

- **Option B (Tunnel)**: Attractive for zero cost, but "only works when the boss's machine is on" is a non-starter for a production ops tool. Good as a *complementary* setup for local dev, not as the primary path.
- **Option C (Serverless)**: The refactoring cost is prohibitive (142 fs calls across 28 files) and the result would be degraded (no git, no real filesystem state). The effort would be better spent on features.
- **Option D (WS Agent)**: Combines the disadvantages of B (requires local machine) with additional complexity (WebSocket relay, reconnection). No clear advantage over B.

## Implementation Plan (if approved)

### Phase 1: VPS Setup (1 day)

1. Provision Hetzner CX11 (or CX22) with Ubuntu 24.04
2. Install Node.js 20 LTS, git, npm
3. Clone the controlla-me repo
4. Copy `.env.local` (via secure channel, not git)
5. `npm install`
6. Create a minimal Express server (`scripts/ops-server.ts`, ~80 lines):
   - POST `/exec` -- same allowlist logic as current `route.ts`, SSE output
   - DELETE `/exec/:pid` -- kill endpoint
   - Auth: verify `OPS_VPS_SECRET` header (shared secret)
   - HTTPS via Let's Encrypt (or behind Caddy reverse proxy)
7. systemd unit file for auto-start + restart on crash
8. Firewall: allow 443 from anywhere (or restrict to Vercel + boss IP)

### Phase 2: Vercel Proxy (0.5 day)

1. Modify `app/api/ops/exec/route.ts`:
   - If `OPS_VPS_URL` env is set, proxy the request to the VPS instead of spawning locally
   - If `OPS_VPS_URL` is not set, fall back to local spawn (preserves localhost dev)
   - SSE passthrough: pipe the VPS response stream to the browser
2. Same for `app/api/ops/exec/[pid]/route.ts` (kill proxy)
3. Add env vars to Vercel: `OPS_VPS_URL`, `OPS_VPS_SECRET`

### Phase 3: Daemon on VPS (0.5 day)

1. systemd unit for `npx tsx scripts/cme-autorun.ts --watch`
2. Logs to journald (queryable via `journalctl`)
3. Healthcheck endpoint on the ops-server

### Phase 4: Sync Automation (optional, 0.5 day)

1. Git hook or cron: `cd /opt/controlla-me && git pull && npm install` every 30 minutes
2. Restart ops-server on code changes (systemd `PathModified` or nodemon)
3. Webhook from GitHub to trigger pull on push to main

### Total effort: 2-3 days

### New env vars required:

```env
# VPS Companion (Vercel → VPS proxy)
OPS_VPS_URL=https://ops.poimandres.work     # or https://5.9.x.x:3001
OPS_VPS_SECRET=...                           # min 32 chars, shared between Vercel and VPS
```

## Consequences

### Positive

- Boss Terminal works from poimandres.work with full fidelity
- All 12 whitelisted commands execute on a real Linux environment
- Daemon can run 24/7 without the boss's machine
- Foundation for hosting other background services (trading, data sync)
- Minimal frontend changes (SSE protocol unchanged)

### Negative

- Monthly cost of 3-4 EUR
- Another server to maintain (OS updates, disk space, monitoring)
- Repo sync required when scripts change (mitigated by auto-pull)
- Shared secret management between Vercel and VPS

### Neutral

- The localhost developer experience is preserved (fallback to local spawn when `OPS_VPS_URL` is not set)
- Security posture is unchanged or improved (the VPS is a controlled environment, unlike the boss's dev machine)

## References

- `app/api/ops/exec/route.ts` -- current CLI execution endpoint (354 lines)
- `app/api/ops/exec/[pid]/route.ts` -- current kill endpoint (101 lines)
- `components/ops/BossTerminal.tsx` -- terminal UI component (905 lines)
- `lib/middleware/console-token.ts` -- HMAC-SHA256 auth
- `lib/middleware/rate-limit.ts` -- rate limiting
- `scripts/cme-autorun.ts` -- daemon (1400+ lines, 142 fs calls across all scripts)
- ADR-001 -- data-connector framework (context on how scripts interact with Supabase)
