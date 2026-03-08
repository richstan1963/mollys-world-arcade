#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# upload-roms.sh — Upload local ROM files to Railway volume via HTTP
#
# Usage:
#   ./scripts/upload-roms.sh psx          # upload all PSX ROMs
#   ./scripts/upload-roms.sh dreamcast    # upload all Dreamcast ROMs
#   ./scripts/upload-roms.sh psx dreamcast saturn gba   # multiple systems
#
# Env vars (set in your shell or edit defaults below):
#   ARCADE_URL     — Railway URL (no trailing slash)
#   ARCADE_KEY     — Admin key
#   ROMS_DIR       — Local roms directory
# ──────────────────────────────────────────────────────────────────────────────

ARCADE_URL="${ARCADE_URL:-https://harmonious-blessing-production-f3d3.up.railway.app}"
ARCADE_KEY="${ARCADE_KEY:-molly2026}"
ROMS_DIR="${ROMS_DIR:-$(dirname "$0")/../roms}"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <system> [system2] ..."
    echo "Example: $0 psx dreamcast"
    exit 1
fi

upload_system() {
    local SYSTEM="$1"
    local DIR="$ROMS_DIR/$SYSTEM"

    if [ ! -d "$DIR" ]; then
        echo "⚠️  No local directory: $DIR"
        return
    fi

    local FILES=("$DIR"/*)
    local TOTAL=${#FILES[@]}
    local COUNT=0
    local SKIPPED=0
    local FAILED=0

    echo ""
    echo "══ Uploading $SYSTEM ($TOTAL files) ══"

    for FILE in "${FILES[@]}"; do
        [ -f "$FILE" ] || continue
        local FILENAME=$(basename "$FILE")
        local SIZE_MB=$(du -sm "$FILE" 2>/dev/null | cut -f1)
        COUNT=$((COUNT + 1))

        printf "[%d/%d] %s (%s MB)... " "$COUNT" "$TOTAL" "$FILENAME" "$SIZE_MB"

        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            "${ARCADE_URL}/api/admin/upload?key=${ARCADE_KEY}&system=${SYSTEM}&filename=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILENAME")" \
            -H "Content-Type: application/octet-stream" \
            --data-binary "@${FILE}" \
            --max-time 600 \
            --retry 3 \
            --retry-delay 5 \
            2>/dev/null)

        if [ "$HTTP_CODE" = "200" ]; then
            echo "✓"
        else
            echo "✗ HTTP $HTTP_CODE"
            FAILED=$((FAILED + 1))
        fi
    done

    echo ""
    echo "Done: $SYSTEM — $((COUNT - FAILED))/$TOTAL uploaded, $FAILED failed"
}

# Check disk space on Railway first
echo "Checking Railway storage..."
STORAGE=$(curl -s "${ARCADE_URL}/api/admin/storage?key=${ARCADE_KEY}" 2>/dev/null)
echo "$STORAGE" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
print(f'  Volume: {d[\"disk_total\"]} total, {d[\"disk_free\"]} free, {d[\"roms_size\"]} ROMs')
" 2>/dev/null || echo "  (could not fetch storage info)"

echo ""
for SYSTEM in "$@"; do
    upload_system "$SYSTEM"
done

echo ""
echo "✅ Upload complete. ROMs will appear in the library after server rescan."
echo "   Trigger artwork fetch: curl -X POST ${ARCADE_URL}/api/metadata/batch"
