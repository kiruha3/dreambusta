#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  status) systemctl status dreambusta --no-pager ;;
  logs) journalctl -u dreambusta -n 100 --no-pager ;;
  restart)
    systemctl restart dreambusta
    systemctl status dreambusta --no-pager
    ;;
  backup)
    # No copying of a live SQLite/WAL or replacement of the working library.
    test -f /var/lib/dreambusta/library.sqlite
    install -d -m 700 /var/backups/dreambusta
    was_active=0
    if systemctl is-active --quiet dreambusta; then was_active=1; fi
    restore_service() {
      if [ "$was_active" = 1 ]; then systemctl start dreambusta; fi
    }
    trap restore_service EXIT
    systemctl stop dreambusta
    umask 077
    backup=$(mktemp /var/backups/dreambusta/library-"$(date -u +%Y%m%dT%H%M%SZ)"-XXXXXX.tgz)
    tar -czf "$backup" -C /var/lib/dreambusta .
    sha256sum "$backup" > "$backup.sha256"
    printf 'Backup: %s\n' "$backup"
    ;;
  *) echo 'Usage: service.sh status|logs|restart|backup' >&2; exit 2 ;;
esac
