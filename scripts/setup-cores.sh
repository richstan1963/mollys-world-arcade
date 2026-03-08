#!/bin/bash
# Self-host EmulatorJS cores — copies all .data files from node_modules to data/cores/
set -e

YWA="/Users/richardstanford/Desktop/ywa"
DEST="$YWA/data"
CORES_DEST="$DEST/cores"
NM="$YWA/node_modules/@emulatorjs"

echo "=== Setting up self-hosted EmulatorJS ==="
mkdir -p "$CORES_DEST"

# 1. Copy emulatorjs data assets (loader.js, emulator.css, src/, compression/, localization/)
echo "Copying EmulatorJS data assets..."
cp -r "$NM/emulatorjs/data/." "$DEST/"
echo "  ✅ Data assets copied"

# 2. Copy all core .data files into data/cores/
echo "Copying core .data files..."
TOTAL=0
for core_dir in "$NM"/core-*/; do
    core_name=$(basename "$core_dir")
    for f in "$core_dir"/*.data "$core_dir"/*.wasm "$core_dir"/*.zip; do
        [ -f "$f" ] || continue
        fname=$(basename "$f")
        cp "$f" "$CORES_DEST/$fname"
        echo "  ✅ $fname"
        ((TOTAL++))
    done
done

echo ""
echo "=== Done! $TOTAL core files copied ==="
echo "Cores available at: $CORES_DEST"
ls "$CORES_DEST" | wc -l | xargs echo "Total files:"
