#!/usr/bin/env bash
# Neue Version veröffentlichen: Mac-App (Selbst-Update), Download-Zip und Handyversion (GitHub Pages).
# Aufruf: tools/release.sh "Kurzbeschreibung"
set -euo pipefail
cd "$(dirname "$0")/.."
MSG="${1:?Beschreibung fehlt}"
R=/home/claude/beunti125-schachanalyse
A=dist/Schachanalyse.app/Contents/Resources/app

# 1. Prüfen, bevor etwas rausgeht
for f in web/js/*.js; do node --check "$f"; done
node test/klassen/run.mjs > /tmp/release_klassen.txt || { tail -5 /tmp/release_klassen.txt; echo "Prüfstand rot – Abbruch"; exit 1; }
node test/classify.test.mjs > /dev/null

# 2. Version hochzählen
V=$(( $(python3 -c 'import json;print(json.load(open("version.json"))["version"])') + 1 ))
echo "{\"version\": $V}" > version.json
cp version.json web/version.json

# 3. Mac-App und Zip (Engine im App-Bündel bleibt erhalten)
rm -rf /tmp/eng_keep; mv "$A/web/engine" /tmp/eng_keep
rm -rf "$A/web"; cp -r web "$A/web"; rm -rf "$A/web/engine"; mv /tmp/eng_keep "$A/web/engine"
cp server.py server.js launcher.sh version.json "$A/"
rm -f dist/Schachanalyse.zip; (cd dist && zip -qr Schachanalyse.zip Schachanalyse.app ANLEITUNG.txt)

# 4. Repository (inkl. Stockfish-Lite für die Handyversion) und Push → Selbst-Update + Pages
rm -rf "$R/web"; cp -r web "$R/web"
test -f "$R/web/engine/stockfish-19-lite-single.wasm" || { echo "Engine fehlt in web/engine – Abbruch"; exit 1; }
cp server.py server.js launcher.sh version.json dist/Schachanalyse.zip "$R/"
# Arbeitsunterlagen des Zugbewertungs-Teams dauerhaft sichern (ohne neu erzeugbare Engine-Caches und Screenshots)
rm -rf "$R/docs" "$R/tools" "$R/test"
cp -r docs tools "$R/"
tar -cf - --exclude='test/klassen/cache' --exclude='test/klassen/team/cache_d22' --exclude='*.png' \
  --exclude='test/klassen/team/echte16.json' --exclude='test/klassen/team/echte_d16.json' test | tar -xf - -C "$R"
cd "$R"
git add -A
git commit -qm "v$V: $MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PZhtR4o4psMD7TJ8pvFP93"
git push -q
echo "Version $V veröffentlicht."
