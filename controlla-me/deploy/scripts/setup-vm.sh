#!/usr/bin/env bash
# =============================================================================
# setup-vm.sh — Initial setup for Hetzner CX21 VM
# Run once after provisioning the VM
#
# Usage:
#   ssh root@<VM_IP> 'bash -s' < deploy/scripts/setup-vm.sh
#   OR
#   scp deploy/scripts/setup-vm.sh root@<VM_IP>:/tmp/ && ssh root@<VM_IP> bash /tmp/setup-vm.sh
#
# What it does:
#   1. System updates + essential packages
#   2. Creates deploy user (non-root)
#   3. Installs Docker + Docker Compose
#   4. Installs and configures nginx
#   5. Configures UFW firewall
#   6. Installs certbot for SSL
#   7. Generates DH parameters
#   8. Sets up log rotation
#   9. Configures automatic security updates
#  10. Sets up swap (recommended for 4GB RAM)
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[SETUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- Configuration ----
DEPLOY_USER="deploy"
APP_DIR="/opt/controlla-me"
DOMAIN_MAIN="poimandres.work"
DOMAIN_OPS="poimandres.work"

# =============================================================================
# 1. System updates
# =============================================================================
log "Updating system packages..."
apt-get update -y
apt-get upgrade -y
apt-get install -y \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    htop \
    unzip \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    logrotate

# =============================================================================
# 2. Create deploy user
# =============================================================================
if id "$DEPLOY_USER" &>/dev/null; then
    warn "User $DEPLOY_USER already exists, skipping creation"
else
    log "Creating deploy user..."
    adduser --disabled-password --gecos "" $DEPLOY_USER
    usermod -aG sudo $DEPLOY_USER

    # Copy SSH keys from root
    mkdir -p /home/$DEPLOY_USER/.ssh
    cp /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/
    chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
    chmod 700 /home/$DEPLOY_USER/.ssh
    chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
fi

# =============================================================================
# 3. Install Docker + Docker Compose
# =============================================================================
if command -v docker &>/dev/null; then
    warn "Docker already installed: $(docker --version)"
else
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker $DEPLOY_USER
    systemctl enable docker
    systemctl start docker
    log "Docker installed: $(docker --version)"
fi

# Docker Compose is included with Docker Engine (compose v2)
log "Docker Compose version: $(docker compose version)"

# =============================================================================
# 4. Install nginx
# =============================================================================
if command -v nginx &>/dev/null; then
    warn "nginx already installed: $(nginx -v 2>&1)"
else
    log "Installing nginx..."
    apt-get install -y nginx
    systemctl enable nginx
fi

# Create snippets directory for SSL params
mkdir -p /etc/nginx/snippets

# =============================================================================
# 5. Configure UFW firewall
# =============================================================================
log "Configuring firewall (UFW)..."
ufw --force reset

# Allow SSH (important: do this FIRST before enabling UFW)
ufw allow 22/tcp comment 'SSH'

# Allow HTTP and HTTPS
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Deny all other incoming by default
ufw default deny incoming
ufw default allow outgoing

# Enable UFW (non-interactive)
echo "y" | ufw enable
log "Firewall configured. Active rules:"
ufw status verbose

# =============================================================================
# 6. Install certbot
# =============================================================================
log "Installing certbot..."
apt-get install -y certbot python3-certbot-nginx

# =============================================================================
# 7. Generate DH parameters (takes a few minutes)
# =============================================================================
DH_FILE="/etc/ssl/certs/dhparam.pem"
if [ -f "$DH_FILE" ]; then
    warn "DH parameters already exist at $DH_FILE"
else
    log "Generating DH parameters (2048 bit) — this takes 1-3 minutes..."
    openssl dhparam -out "$DH_FILE" 2048
    log "DH parameters generated at $DH_FILE"
fi

# =============================================================================
# 8. Create application directory
# =============================================================================
log "Creating application directory at $APP_DIR..."
mkdir -p $APP_DIR
chown $DEPLOY_USER:$DEPLOY_USER $APP_DIR

# Create certbot webroot
mkdir -p /var/www/certbot

# =============================================================================
# 9. Configure log rotation
# =============================================================================
log "Configuring log rotation..."
cat > /etc/logrotate.d/controlla-me << 'LOGROTATE'
/opt/controlla-me/deploy/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        docker compose -f /opt/controlla-me/deploy/docker-compose.yml restart nextjs > /dev/null 2>&1 || true
    endscript
}
LOGROTATE

# Docker log rotation (in case json-file limits are not enough)
cat > /etc/docker/daemon.json << 'DOCKER_LOG'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "5"
    }
}
DOCKER_LOG

systemctl restart docker

# =============================================================================
# 10. Configure automatic security updates
# =============================================================================
log "Configuring unattended-upgrades..."
apt-get install -y unattended-upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOUPDATE'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOUPDATE

# =============================================================================
# 11. Configure swap (important for 4GB RAM VM)
# =============================================================================
SWAP_FILE="/swapfile"
if [ -f "$SWAP_FILE" ]; then
    warn "Swap file already exists"
else
    log "Creating 2GB swap file..."
    fallocate -l 2G $SWAP_FILE
    chmod 600 $SWAP_FILE
    mkswap $SWAP_FILE
    swapon $SWAP_FILE
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab

    # Optimize swappiness for server workload
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    echo "vm.vfs_cache_pressure=50" >> /etc/sysctl.conf
    sysctl -p
    log "Swap configured: $(swapon --show)"
fi

# =============================================================================
# 12. Configure fail2ban
# =============================================================================
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'FAIL2BAN'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 5

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 10
findtime = 60
bantime = 600
FAIL2BAN

systemctl enable fail2ban
systemctl restart fail2ban

# =============================================================================
# 13. Harden SSH
# =============================================================================
log "Hardening SSH configuration..."
# Disable password auth (keys only)
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
# Disable root login (use deploy user + sudo)
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================================================="
echo -e "${GREEN}VM SETUP COMPLETE${NC}"
echo "============================================================================="
echo ""
echo "Next steps:"
echo "  1. Clone the repo:          git clone <repo-url> $APP_DIR"
echo "  2. Copy env file:           cp .env.production.example $APP_DIR/deploy/.env.production"
echo "  3. Edit env vars:           nano $APP_DIR/deploy/.env.production"
echo "  4. Copy nginx config:       cp $APP_DIR/deploy/nginx/nginx.conf /etc/nginx/nginx.conf"
echo "  5. Copy SSL params:         cp $APP_DIR/deploy/nginx/ssl-params.conf /etc/nginx/snippets/"
echo "  6. Get SSL certificates:    certbot certonly --webroot -w /var/www/certbot -d $DOMAIN_MAIN -d www.$DOMAIN_MAIN"
echo "                              certbot certonly --webroot -w /var/www/certbot -d $DOMAIN_OPS -d www.$DOMAIN_OPS"
echo "  7. Test nginx:              nginx -t && systemctl restart nginx"
echo "  8. Deploy:                  cd $APP_DIR && bash deploy/scripts/deploy.sh"
echo "  9. Setup certbot renewal:   systemctl enable certbot.timer"
echo ""
echo "SSH login: ssh $DEPLOY_USER@<VM_IP>"
echo "WARNING: Root SSH login is now disabled. Use '$DEPLOY_USER' user."
echo "============================================================================="
