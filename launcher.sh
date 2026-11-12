#!/bin/bash
# Startet den lokalen Server und öffnet die App im Browser.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="$(cd "$(dirname "$0")/../Resources/app" && pwd)"
PORT=8765
URL="http://localhost:$PORT"
BG=0; [ "$1" = "--background" ] && BG=1

# --- Automatische Aktualisierung über GitHub (nur Oberfläche + Server, die Engine bleibt lokal) ---
REPO="beunti125/beunti125-schachanalyse"
ver() { sed -n 's/.*"version"[^0-9]*\([0-9][0-9]*\).*/\1/p' "$1" 2>/dev/null | head -1; }
REMOTE=$(curl -fsL --max-time 4 "https://raw.githubusercontent.com/$REPO/main/version.json" 2>/dev/null | sed -n 's/.*"version"[^0-9]*\([0-9][0-9]*\).*/\1/p' | head -1)
LOCAL=$(ver "$DIR/version.json"); LOCAL=${LOCAL:-0}
if [ -n "$REMOTE" ] && [ "$REMOTE" -gt "$LOCAL" ] 2>/dev/null; then
  TMP=$(mktemp -d)
  if curl -fsL --max-time 90 -o "$TMP/u.zip" "https://codeload.github.com/$REPO/zip/refs/heads/main" && unzip -q "$TMP/u.zip" -d "$TMP/x"; then
    SRC=$(ls -d "$TMP"/x/*/ | head -1)
    if [ -f "$SRC/web/index.html" ] && [ -f "$SRC/server.py" ]; then
      curl -s -X POST --max-time 2 "$URL/api/quit" >/dev/null 2>&1; sleep 0.6
      cp -R "$SRC/web/." "$DIR/web/"
      cp "$SRC/server.py" "$SRC/server.js" "$SRC/version.json" "$DIR/"
      if [ -f "$SRC/launcher.sh" ]; then cp "$SRC/launcher.sh" "$0.neu" && chmod 755 "$0.neu" && mv -f "$0.neu" "$0"; fi
      echo "Aktualisiert auf Version $REMOTE" >> /tmp/schachanalyse.log
    fi
  fi
  rm -rf "$TMP"
fi
# Läuft schon? Dann nur die Oberfläche öffnen (im Hintergrundmodus gar nichts tun).
if curl -s --max-time 1 "$URL/api/ping" >/dev/null 2>&1; then
  # Läuft eine andere (alte) Version des Servers? Dann beenden und neu starten.
  RUNV=$(curl -s --max-time 2 "$URL/api/config" | sed -n 's/.*"version"[^0-9]*\([0-9][0-9]*\).*/\1/p' | head -1)
  if [ "$RUNV" = "$(ver "$DIR/version.json")" ]; then [ $BG = 0 ] && open "$URL"; exit 0; fi
  curl -s -X POST --max-time 2 "$URL/api/quit" >/dev/null 2>&1; sleep 0.6
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null); [ -n "$PIDS" ] && kill $PIDS 2>/dev/null; sleep 0.4
fi
cd "$DIR"
if xcode-select -p >/dev/null 2>&1 && /usr/bin/python3 -c 'import sys' >/dev/null 2>&1; then
  RUN=(/usr/bin/python3 "$DIR/server.py")
elif command -v python3 >/dev/null 2>&1 && [ "$(command -v python3)" != "/usr/bin/python3" ]; then
  RUN=(python3 "$DIR/server.py")
elif command -v node >/dev/null 2>&1; then
  RUN=(node "$DIR/server.js")
else
  [ $BG = 1 ] && exit 1
  osascript -e 'display dialog "Schachanalyse braucht Python 3 oder Node.js.\n\nAm einfachsten: Terminal öffnen und eingeben:\nxcode-select --install" buttons {"OK"} with icon caution with title "Schachanalyse"'
  exit 1
fi
if [ $BG = 1 ]; then
  # Hintergrundstart beim Anmelden (launchd): im Vordergrund weiterlaufen
  exec "${RUN[@]}"
fi
# Normaler Start: Server abgekoppelt starten, Browser öffnen und die App sofort beenden
# (sonst wartet das Dock auf ein Fenster und das Symbol hüpft endlos).
nohup "${RUN[@]}" >/tmp/schachanalyse.log 2>&1 </dev/null &
disown
for i in $(seq 1 40); do
  sleep 0.25
  if curl -s --max-time 1 "$URL/api/ping" >/dev/null 2>&1; then open "$URL"; exit 0; fi
done
osascript -e 'display dialog "Schachanalyse konnte nicht gestartet werden.\n\nDetails stehen in /tmp/schachanalyse.log" buttons {"OK"} with icon caution with title "Schachanalyse"'
exit 1
