#!/usr/bin/env bash
###############################################################################
# expand-roms.sh — Download homebrew / freeware ROMs from Archive.org
# for Molly's World Arcade empty system folders.
#
# Usage:  ./expand-roms.sh [system ...]
#   No args = process all supported systems
#   With args = process only named systems  (e.g. ./expand-roms.sh n64 sms)
#
# Idempotent — skips files that already exist.
###############################################################################
set -euo pipefail

ROM_BASE="/Users/richardstanford/Desktop/mollys-world-arcade/roms"
LOG_FILE="/Users/richardstanford/Desktop/mollys-world-arcade/scripts/expand-roms.log"
TMPBASE="/tmp/expand-roms-$$"
MAX_PER_SYSTEM=30
MAX_SIZE_BYTES=5242880   # 5 MB
CURL_TIMEOUT=120
API_BASE="https://archive.org"

mkdir -p "$TMPBASE"
echo "=== expand-roms.sh run started $(date) ===" > "$LOG_FILE"

log() { echo "$1" | tee -a "$LOG_FILE"; }

count_roms() {
  ls "$ROM_BASE/$1/" 2>/dev/null | wc -l | tr -d ' '
}

###############################################################################
# download_item_files — fetch individual files from an Archive.org item
#   Uses temp file for metadata to avoid JSON quoting issues
###############################################################################
download_item_files() {
  local system="$1" item="$2" extensions="$3" max="${4:-$MAX_PER_SYSTEM}"
  local dest="$ROM_BASE/$system"
  local downloaded=$(count_roms "$system")
  mkdir -p "$dest"

  log "  [item] $item -> $system (have $downloaded, want $max)"

  local meta_file="$TMPBASE/meta-$item.json"
  curl -sL --max-time 30 "$API_BASE/metadata/$item" -o "$meta_file" 2>/dev/null || {
    log "    ERROR: metadata fetch failed"; return 0
  }

  local files_list
  files_list=$(python3 -c "
import json, os, sys
with open('$meta_file', 'r') as f:
    data = json.load(f)
files = data.get('files', [])
exts = '$extensions'.split(',')
results = []
for fi in files:
    name = fi.get('name', '')
    try: size = int(fi.get('size', '0') or 0)
    except: size = 0
    ext = os.path.splitext(name.lower())[1]
    if ext in exts and 100 < size <= $MAX_SIZE_BYTES:
        results.append((name, size))
results.sort(key=lambda x: x[1])
for name, size in results[:${max}]:
    # Use tab separator to handle filenames with pipes
    print(name + '\t' + str(size))
" 2>/dev/null) || true

  [ -z "$files_list" ] && { log "    No matching files."; return 0; }

  while IFS=$'\t' read -r fname fsize; do
    [ -z "$fname" ] && continue
    [ "$downloaded" -ge "$max" ] && break

    local bname=$(basename "$fname")
    local dest_file="$dest/$bname"

    if [ -f "$dest_file" ]; then
      log "    SKIP: $bname"
      downloaded=$((downloaded + 1))
      continue
    fi

    local enc_fname
    enc_fname=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe='/'))" "$fname")
    log "    GET: $bname ($(( fsize / 1024 ))KB)"

    if curl -sL --max-time "$CURL_TIMEOUT" -o "$dest_file" "$API_BASE/download/$item/$enc_fname" 2>/dev/null; then
      local actual=$(stat -f%z "$dest_file" 2>/dev/null || echo 0)
      if [ "$actual" -lt 100 ] || head -c 15 "$dest_file" 2>/dev/null | grep -qi "<\!doctype\|<html"; then
        rm -f "$dest_file"
        log "      BAD (html or too small)"
        continue
      fi
      downloaded=$((downloaded + 1))
      log "      OK ($actual bytes)"
    else
      rm -f "$dest_file"
    fi
    sleep 0.2
  done <<< "$files_list"

  log "    Total $system: $downloaded files"
}

###############################################################################
# download_zip_extract — download zip from Archive.org, extract matching ROMs
###############################################################################
download_zip_extract() {
  local system="$1" item="$2" zipname="$3" extensions="$4" max="${5:-$MAX_PER_SYSTEM}"
  local dest="$ROM_BASE/$system"
  local existing=$(count_roms "$system")
  mkdir -p "$dest"

  if [ "$existing" -ge "$max" ]; then
    log "  [zip] $system already has $existing files, skipping"
    return 0
  fi

  local tmpdir="$TMPBASE/$system"
  mkdir -p "$tmpdir"

  local enc_zip
  enc_zip=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe='/'))" "$zipname")
  local zip_url="$API_BASE/download/$item/$enc_zip"
  local zip_path="$tmpdir/archive.zip"

  log "  [zip] Downloading $zipname from $item..."
  if ! curl -sL --max-time 300 -o "$zip_path" "$zip_url" 2>/dev/null; then
    log "    ERROR: download failed"
    rm -rf "$tmpdir"
    return 0
  fi

  local zipsize=$(stat -f%z "$zip_path" 2>/dev/null || echo 0)
  log "    Downloaded $(( zipsize / 1024 / 1024 ))MB zip"

  if ! file "$zip_path" | grep -qi "zip\|archive"; then
    log "    ERROR: not a zip file"
    rm -rf "$tmpdir"
    return 0
  fi

  log "    Extracting..."
  if ! unzip -q -o "$zip_path" -d "$tmpdir/ex" 2>/dev/null; then
    log "    ERROR: unzip failed"
    rm -rf "$tmpdir"
    return 0
  fi
  rm -f "$zip_path"

  local extracted=0
  local IFS_OLD="$IFS"
  IFS=','
  local ext_arr=($extensions)
  IFS="$IFS_OLD"

  for ext in "${ext_arr[@]}"; do
    [ "$extracted" -ge "$max" ] && break
    local ext_nodot="${ext#.}"
    while IFS= read -r -d '' romfile; do
      [ "$extracted" -ge "$max" ] && break
      local rombase=$(basename "$romfile")
      local romsize=$(stat -f%z "$romfile" 2>/dev/null || echo 0)
      [ "$romsize" -gt "$MAX_SIZE_BYTES" ] && continue
      [ "$romsize" -lt 100 ] && continue

      local dest_file="$dest/$rombase"
      if [ -f "$dest_file" ]; then
        extracted=$((extracted + 1))
        continue
      fi

      cp "$romfile" "$dest_file"
      extracted=$((extracted + 1))
      log "    Extracted: $rombase ($(( romsize / 1024 ))KB)"
    done < <(find "$tmpdir/ex" -iname "*.$ext_nodot" -print0 2>/dev/null | sort -z)
  done

  log "    Total extracted for $system: $extracted"
  rm -rf "$tmpdir"
}

###############################################################################
# Per-system handlers
###############################################################################

do_n64() {
  log ""
  log "========== N64 =========="
  download_zip_extract "n64" "N64-homebrew-archive" "1 - GAME.zip" ".n64,.z64,.v64" 25
}

do_atari7800() {
  log ""
  log "========== ATARI 7800 =========="
  download_item_files "atari7800" "openhomebew" ".a78" 25
  local c=$(count_roms "atari7800")
  if [ "$c" -lt 15 ]; then
    for item in Galaga-14_PAL_Hack_20130121 Gobbler_Hack_20130501 \
      Millipede_TBall_NTSC_Hack_20150405 Ms_Pac-Man_Inv_Fast_NTSC_Hack_20130128 \
      Moon_Crest_B_NTSC_Hack_20131125 Ms_Pac-Man_Ferrells_Hack_20170407 \
      Pac-Man_Remix_Hack_20120419 Pac-Prototype_Hack_20130408 \
      Pacaroids_NTSC_Hack_20140208 Num-Munch_Invincible_Hack_20181213 \
      Q-bert_Unlimited_Lives_Hack_20060531 \
      Centipede_Arcade_Bezel_Trak-Ball_Hack_v3_20200831; do
      download_item_files "atari7800" "$item" ".a78,.bin" 30
    done
  fi
}

do_gamegear() {
  log ""
  log "========== GAME GEAR =========="
  download_zip_extract "gamegear" "sega-game-gear-champion-collection" "Sega Game Gear Champion Collection.zip" ".gg" 25
}

do_sms() {
  log ""
  log "========== SEGA MASTER SYSTEM =========="
  download_item_files "sms" "openhomebew" ".sms" 25
}

do_tg16() {
  log ""
  log "========== TG16 / PC ENGINE =========="
  download_item_files "tg16" "openhomebew" ".pce" 25
  local c=$(count_roms "tg16")
  if [ "$c" -lt 10 ]; then
    download_item_files "tg16" "no-new-zealand-story-pc-engine" ".pce" 25
  fi
}

do_vb() {
  log ""
  log "========== VIRTUAL BOY =========="
  download_zip_extract "vb" "nintendo-virtual-boy-champion-collection" "MetaFlesh Spiritual Boy Champion Collection.zip" ".vb,.vboy" 25
}

do_lynx() {
  log ""
  log "========== ATARI LYNX =========="
  download_zip_extract "lynx" "atari-lynx-champion-collection" "Atari Lynx Champion Collection.zip" ".lnx" 25
}

do_wonderswan() {
  log ""
  log "========== WONDERSWAN =========="
  download_zip_extract "wonderswan" "bandai-wonderswan-champion-collection" "Bandai WonderSwan Champion Collection.zip" ".ws,.wsc" 25
}

do_ngp() {
  log ""
  log "========== NEO GEO POCKET =========="
  download_zip_extract "ngp" "neo-geo-pocket-champion-collection" "Neo Geo Pocket Champion Collection.zip" ".ngp,.ngc" 25
}

do_jaguar() {
  log ""
  log "========== ATARI JAGUAR =========="
  download_zip_extract "jaguar" "atari-jaguar-champion-collection" "Atari Jaguar March 4th 2024 Update.zip" ".j64,.jag,.rom,.bin" 25
  local c=$(count_roms "jaguar")
  if [ "$c" -lt 5 ]; then
    download_zip_extract "jaguar" "atari-jaguar-champion-collection" "Atari Jaguar Champion Collection.zip" ".j64,.jag,.rom,.bin" 20
  fi
}

do_32x() {
  log ""
  log "========== SEGA 32X =========="
  # No great homebrew source, try searching
  local dest="$ROM_BASE/32x"
  mkdir -p "$dest"
  log "  Searching for 32X content..."
  
  # Try specific search
  local search_url="$API_BASE/advancedsearch.php?q=sega+32x+homebrew+.32x&fl=identifier&rows=10&output=json"
  local identifiers
  identifiers=$(curl -sL --max-time 30 "$search_url" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
docs = data.get('response', {}).get('docs', [])
for d in docs:
    print(d.get('identifier', ''))
" 2>/dev/null) || true

  if [ -n "$identifiers" ]; then
    while IFS= read -r ident; do
      [ -z "$ident" ] && continue
      local c=$(count_roms "32x")
      [ "$c" -ge 15 ] && break
      download_item_files "32x" "$ident" ".32x,.bin" 15
    done <<< "$identifiers"
  fi
  log "  32X final: $(count_roms 32x) files"
}

do_fbneo() {
  log ""
  log "========== FBNEO =========="
  local dest="$ROM_BASE/fbneo"
  mkdir -p "$dest"

  # Copy small arcade ROMs (same format) as FBNeo content
  local arcade_dir="$ROM_BASE/arcade"
  if [ -d "$arcade_dir" ]; then
    log "  Copying small arcade ROMs to fbneo..."
    local copied=0
    for f in "$arcade_dir"/*.zip; do
      [ ! -f "$f" ] && continue
      [ "$copied" -ge 25 ] && break
      local fsize=$(stat -f%z "$f" 2>/dev/null || echo 0)
      [ "$fsize" -gt "$MAX_SIZE_BYTES" ] && continue
      [ "$fsize" -lt 1000 ] && continue
      local bname=$(basename "$f")
      if [ ! -f "$dest/$bname" ]; then
        cp "$f" "$dest/$bname"
        copied=$((copied + 1))
      fi
    done
    log "  Copied $copied arcade ROMs to fbneo"
  fi
  log "  FBNeo final: $(count_roms fbneo) files"
}

###############################################################################
# Main
###############################################################################

ALL_SYSTEMS="atari7800 sms tg16 ngp lynx vb gamegear wonderswan jaguar n64 32x fbneo"

if [ $# -gt 0 ]; then
  SYSTEMS="$*"
else
  SYSTEMS="$ALL_SYSTEMS"
fi

log "Processing systems: $SYSTEMS"

for sys in $SYSTEMS; do
  case "$sys" in
    n64)         do_n64 ;;
    atari7800)   do_atari7800 ;;
    gamegear)    do_gamegear ;;
    sms)         do_sms ;;
    tg16)        do_tg16 ;;
    vb)          do_vb ;;
    lynx)        do_lynx ;;
    wonderswan)  do_wonderswan ;;
    32x)         do_32x ;;
    ngp)         do_ngp ;;
    jaguar)      do_jaguar ;;
    fbneo)       do_fbneo ;;
    dos)         log "SKIP: dos (dosbox config too complex)" ;;
    psx)         log "SKIP: psx (ROMs too large)" ;;
    psp)         log "SKIP: psp (ROMs too large)" ;;
    saturn)      log "SKIP: saturn (ROMs too large)" ;;
    3do)         log "SKIP: 3do (ROMs too large)" ;;
    nds)         log "SKIP: nds (ROMs too large)" ;;
    *)           log "UNKNOWN system: $sys" ;;
  esac
done

log ""
log "==================== FINAL SUMMARY ===================="
for sys in $SYSTEMS; do
  dir="$ROM_BASE/$sys"
  if [ -d "$dir" ]; then
    count=$(count_roms "$sys")
    log "  $sys: $count files"
  fi
done
log "======================================================="
log "=== expand-roms.sh completed $(date) ==="

rm -rf "$TMPBASE"
