#!/bin/bash
# YWA Cloudflare Tunnel - auto-start with URL capture
# Writes to logs/tunnel.log which GET /api/tunnel reads for the live public URL

YWA="/Users/richardstanford/Desktop/ywa"
LOG="$YWA/logs/tunnel.log"
URL_FILE="$YWA/.tunnel-url"

mkdir -p "$YWA/logs"
echo "" > "$URL_FILE"
echo "[$(date)] Starting YWA Cloudflare tunnel..." > "$LOG"

# Kill any stale cloudflared processes
pkill -f "cloudflared tunnel --url" 2>/dev/null
sleep 2

# Run cloudflared, write to log and also extract the public URL
/opt/homebrew/bin/cloudflared tunnel --url http://localhost:3000 2>&1 | \
tee -a "$LOG" | \
while IFS= read -r line; do
    if echo "$line" | grep -q 'trycloudflare.com'; then
        URL=$(echo "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
        if [ -n "$URL" ]; then
            echo "$URL" > "$URL_FILE"
            echo "[$(date)] URL captured: $URL" >> "$LOG"
        fi
    fi
done
