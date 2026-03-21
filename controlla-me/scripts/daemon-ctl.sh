#!/usr/bin/env bash
#
# daemon-ctl.sh — Controllo rapido del servizio controlla-daemon
#
# Usage:
#   ./scripts/daemon-ctl.sh status
#   ./scripts/daemon-ctl.sh start
#   ./scripts/daemon-ctl.sh stop
#   ./scripts/daemon-ctl.sh restart
#   ./scripts/daemon-ctl.sh logs
#   ./scripts/daemon-ctl.sh logs-follow
#   ./scripts/daemon-ctl.sh install

set -euo pipefail

SERVICE_NAME="controlla-daemon"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_FILE="$PROJECT_ROOT/systemd/controlla-daemon.service"

usage() {
    echo "Usage: $0 {status|start|stop|restart|logs|logs-follow|install}"
    echo ""
    echo "Commands:"
    echo "  status       Show service status"
    echo "  start        Start the daemon"
    echo "  stop         Stop the daemon"
    echo "  restart      Restart the daemon"
    echo "  logs         Show last 50 log lines"
    echo "  logs-follow  Follow logs in real time"
    echo "  install      Copy .service file, enable and start"
    exit 1
}

require_root() {
    if [[ $EUID -ne 0 ]]; then
        echo "Error: this command requires root. Use: sudo $0 $1"
        exit 1
    fi
}

if [[ $# -lt 1 ]]; then
    usage
fi

case "$1" in
    status)
        systemctl status "$SERVICE_NAME" --no-pager || true
        ;;

    start)
        require_root "$1"
        systemctl start "$SERVICE_NAME"
        echo "Started $SERVICE_NAME"
        systemctl status "$SERVICE_NAME" --no-pager --lines=3 || true
        ;;

    stop)
        require_root "$1"
        systemctl stop "$SERVICE_NAME"
        echo "Stopped $SERVICE_NAME"
        ;;

    restart)
        require_root "$1"
        systemctl restart "$SERVICE_NAME"
        echo "Restarted $SERVICE_NAME"
        systemctl status "$SERVICE_NAME" --no-pager --lines=3 || true
        ;;

    logs)
        journalctl -u "$SERVICE_NAME" -n 50 --no-pager
        ;;

    logs-follow)
        journalctl -u "$SERVICE_NAME" -f
        ;;

    install)
        require_root "$1"
        if [[ ! -f "$SERVICE_FILE" ]]; then
            echo "Error: $SERVICE_FILE not found"
            exit 1
        fi
        cp "$SERVICE_FILE" /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable "$SERVICE_NAME"
        systemctl start "$SERVICE_NAME"
        echo ""
        echo "Installed, enabled, and started $SERVICE_NAME"
        echo ""
        systemctl status "$SERVICE_NAME" --no-pager --lines=5 || true
        ;;

    *)
        usage
        ;;
esac
