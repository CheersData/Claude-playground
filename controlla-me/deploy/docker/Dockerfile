# =============================================================================
# Dockerfile — Next.js App (controlla.me)
# Multi-stage build optimized for Hetzner CX21 (2 vCPU, 4GB RAM)
#
# PREREQUISITE: Add `output: "standalone"` to next.config.ts before building.
# This produces a self-contained server (~80MB) instead of needing full
# node_modules (~500MB+). See deploy/MIGRATION.md Phase 5.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Install libc6-compat for Alpine (required by some native modules like pdf-parse)
RUN apk add --no-cache libc6-compat

# Copy package files only (cache layer — reinstalls only if these change)
COPY package.json package-lock.json ./

# Install all dependencies (dev needed for TypeScript build)
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: Build the Next.js application
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runner (standalone output)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets (static files served by Next.js)
COPY --from=builder /app/public ./public

# Copy standalone build output
# The standalone output includes server.js + minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy company/ data directory (needed for daemon, tasks, status files at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/company ./company

# Copy scripts/ directory (needed for company-tasks, daemon, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Copy tsconfig and lib for scripts that use tsx
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/lib ./lib

# Create directories for runtime data
RUN mkdir -p .analysis-cache && chown nextjs:nodejs .analysis-cache

# Health check — verify the server responds
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Standalone output produces server.js (no need for npm start)
CMD ["node", "server.js"]
