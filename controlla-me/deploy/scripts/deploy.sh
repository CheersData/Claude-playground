#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Build and deploy controlla.me on Hetzner VM
#
# Usage:
#   ./deploy/scripts/deploy.sh              # Full deploy (pull + build + restart)
#   ./deploy/scripts/deploy.sh --build-only # Build without restarting
#   ./deploy/scripts/deploy.sh --restart    # Restart without rebuilding
#   ./deploy/scripts/deploy.sh --nextjs     # Deploy only Next.js
#   ./deploy/scripts/deploy.sh --trading    # Deploy only trading
#
# This script implements near-zero-downtime deployment:
#   1. Pull latest code from git
#   2. Build new Docker images
#   3. Restart services one at a time (rolling)
#   4. Wait for health checks to pass
#   5. Rollback on failure
# =============================================================================

set -euo pipefail

# ---- Configuration ----
APP_DIR="/opt/controlla-me"
COMPOSE_FILE="$APP_DIR/deploy/docker-compose.yml"
BACKUP_DIR="$APP_DIR/deploy/backups"
LOG_FILE="$APP_DIR/deploy/logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY $(date +%H:%M:%S)]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN $(date +%H:%M:%S)]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR $(date +%H:%M:%S)]${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$BACKUP_DIR"

# Parse arguments
ACTION="full"
SERVICE=""
case "${1:-}" in
    --build-only) ACTION="build" ;;
    --restart)    ACTION="restart" ;;
    --nextjs)     SERVICE="nextjs" ;;
    --trading)    SERVICE="trading" ;;
    --help|-h)
        echo "Usage: $0 [--build-only|--restart|--nextjs|--trading]"
        exit 0
        ;;
esac

# =============================================================================
# Pre-flight checks
# =============================================================================
log "Starting deployment..."

# Check we're in the right directory
if [ ! -f "$COMPOSE_FILE" ]; then
    error "docker-compose.yml not found at $COMPOSE_FILE. Are you in the right directory?"
fi

# Check .env.production exists
if [ ! -f "$APP_DIR/deploy/.env.production" ]; then
    error ".env.production not found. Copy from .env.production.example and fill in values."
fi

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    error "Docker is not running. Start it with: sudo systemctl start docker"
fi

# =============================================================================
# Step 1: Pull latest code
# =============================================================================
if [ "$ACTION" != "restart" ]; then
    log "Pulling latest code from git..."
    cd "$APP_DIR"
    git fetch origin
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    CURRENT_COMMIT=$(git rev-parse --short HEAD)
    git pull origin "$CURRENT_BRANCH"
    NEW_COMMIT=$(git rev-parse --short HEAD)
    log "Git: $CURRENT_COMMIT -> $NEW_COMMIT (branch: $CURRENT_BRANCH)"
fi

# =============================================================================
# Step 2: Backup current state
# =============================================================================
log "Creating deployment backup..."
BACKUP_TAG="$(date +%Y%m%d-%H%M%S)"

# Save current image IDs for potential rollback
if docker image inspect controlla-me-deploy-nextjs > /dev/null 2>&1; then
    docker tag controlla-me-deploy-nextjs:latest "controlla-me-deploy-nextjs:backup-$BACKUP_TAG" 2>/dev/null || true
fi
if docker image inspect controlla-me-deploy-trading > /dev/null 2>&1; then
    docker tag controlla-me-deploy-trading:latest "controlla-me-deploy-trading:backup-$BACKUP_TAG" 2>/dev/null || true
fi

# =============================================================================
# Step 3: Build Docker images
# =============================================================================
if [ "$ACTION" != "restart" ]; then
    if [ -n "$SERVICE" ]; then
        log "Building Docker image for $SERVICE..."
        docker compose -f "$COMPOSE_FILE" build --no-cache "$SERVICE"
    else
        log "Building all Docker images..."
        docker compose -f "$COMPOSE_FILE" build --no-cache nextjs trading
    fi
fi

# =============================================================================
# Step 4: Rolling restart
# =============================================================================
restart_service() {
    local svc=$1
    local timeout=${2:-120}

    log "Restarting $svc..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps "$svc"

    # Wait for health check
    log "Waiting for $svc health check (timeout: ${timeout}s)..."
    local attempts=0
    local max_attempts=$((timeout / 5))

    while [ $attempts -lt $max_attempts ]; do
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "controlla-$svc" 2>/dev/null || echo "unknown")

        if [ "$health" = "healthy" ]; then
            log "$svc is healthy!"
            return 0
        fi

        if [ "$health" = "unhealthy" ]; then
            warn "$svc is unhealthy. Checking logs..."
            docker logs --tail 20 "controlla-$svc" 2>&1 | tee -a "$LOG_FILE"
            return 1
        fi

        attempts=$((attempts + 1))
        sleep 5
    done

    warn "$svc health check timed out after ${timeout}s (status: $(docker inspect --format='{{.State.Health.Status}}' "controlla-$svc" 2>/dev/null || echo 'unknown'))"
    return 1
}

if [ "$ACTION" = "build" ]; then
    log "Build complete. Skipping restart (--build-only mode)."
    exit 0
fi

# Rolling restart: Next.js first, then trading
if [ -z "$SERVICE" ] || [ "$SERVICE" = "nextjs" ]; then
    if ! restart_service "nextjs" 120; then
        warn "Next.js health check failed. Attempting rollback..."
        if docker image inspect "controlla-me-deploy-nextjs:backup-$BACKUP_TAG" > /dev/null 2>&1; then
            docker tag "controlla-me-deploy-nextjs:backup-$BACKUP_TAG" controlla-me-deploy-nextjs:latest
            docker compose -f "$COMPOSE_FILE" up -d --no-deps nextjs
            error "Rolled back Next.js to previous version. Check logs: docker logs controlla-nextjs"
        fi
        error "No backup image found. Manual intervention required."
    fi
fi

if [ -z "$SERVICE" ] || [ "$SERVICE" = "trading" ]; then
    if ! restart_service "trading" 60; then
        warn "Trading health check failed — this may be OK if market is closed."
        # Trading failures are non-fatal: the system runs without it
    fi
fi

# Restart cron service
if [ -z "$SERVICE" ]; then
    log "Restarting cron service..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps cron
fi

# =============================================================================
# Step 5: Cleanup
# =============================================================================
log "Cleaning up old Docker images..."
# Remove dangling images (untagged layers from previous builds)
docker image prune -f > /dev/null 2>&1

# Keep only last 3 backup images
BACKUP_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "backup-" | sort -r | tail -n +4)
if [ -n "$BACKUP_IMAGES" ]; then
    echo "$BACKUP_IMAGES" | xargs -r docker rmi 2>/dev/null || true
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================================================="
log "DEPLOYMENT COMPLETE"
echo "============================================================================="
echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""
log "Log file: $LOG_FILE"
echo "============================================================================="
