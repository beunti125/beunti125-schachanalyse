#!/usr/bin/env python3
"""Lokaler Server für Schachanalyse: liefert die Oberfläche aus, setzt die Header für
Stockfish mit mehreren Threads, leitet chess.com-Anfragen weiter und öffnet nach jeder
neuen Partie automatisch den Spielbericht."""
import json, os, subprocess, sys, threading, time, urllib.parse, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

APP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(APP, "web")
PORT = int(os.environ.get("SCHACH_PORT", "8765"))
UA = "Schachanalyse/1.0 (lokale App)"
CFG_DIR = os.path.expanduser("~/Library/Application Support/Schachanalyse")
CFG = os.path.join(CFG_DIR, "config.json")
AGENT = os.path.expanduser("~/Library/LaunchAgents/de.yunus.schachanalyse.plist")
EXE = os.path.normpath(os.path.join(APP, "..", "..", "MacOS", "Schachanalyse"))
POLL = 60  # Sekunden


def load_cfg():
    try:
        with open(CFG) as f:
            c = json.load(f)
    except Exception:
        c = {}
    c.setdefault("user", ""); c.setdefault("autoOpen", True)
    c["autostart"] = os.path.exists(AGENT)
    try:
        with open(os.path.join(APP, "version.json")) as f:
            c["version"] = json.load(f).get("version")
    except Exception:
        c["version"] = None
    return c


def save_cfg(c):
    os.makedirs(CFG_DIR, exist_ok=True)
    with open(CFG, "w") as f:
        json.dump({k: c[k] for k in ("user", "autoOpen")}, f)


def set_autostart(on):
    if on:
        os.makedirs(os.path.dirname(AGENT), exist_ok=True)
        with open(AGENT, "w") as f:
            f.write(f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>de.yunus.schachanalyse</string>
<key>ProgramArguments</key><array><string>{EXE}</string><string>--background</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
""")
    elif os.path.exists(AGENT):
        os.remove(AGENT)


def fetch_chesscom(path):
    url = "https://api.chess.com/pub/" + path
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception:
        # Fallback: macOS-curl nutzt die Zertifikate des Systems
        out = subprocess.run(["curl", "-s", "-A", UA, "-w", "\n%{http_code}", url], capture_output=True, timeout=30)
        body, _, code = out.stdout.rpartition(b"\n")
        return int(code or 502), body


def newest_game(user):
    code, body = fetch_chesscom(f"player/{urllib.parse.quote(user.lower())}/games/archives")
    if code != 200:
        return None
    arch = json.loads(body).get("archives", [])
    if not arch:
        return None
    code, body = fetch_chesscom(arch[-1].split("/pub/")[1])
    if code != 200:
        return None
    games = [g for g in json.loads(body).get("games", []) if g.get("rules") == "chess"]
    return max(games, key=lambda g: g.get("end_time", 0)) if games else None


def watcher():
    """Prüft regelmäßig auf eine neue beendete Partie und öffnet dann den Spielbericht."""
    last = {}
    while True:
        try:
            c = load_cfg()
            u = c["user"].lower()
            if u and c["autoOpen"]:
                g = newest_game(u)
                if g:
                    if u not in last:
                        last[u] = g["end_time"]  # beim Start nichts Altes öffnen
                    elif g["end_time"] > last[u]:
                        last[u] = g["end_time"]
                        url = f"http://localhost:{PORT}/?game=" + urllib.parse.quote(g["url"], safe="")
                        subprocess.run(["open", url])
        except Exception as e:
            print("Watcher:", e, flush=True)
        time.sleep(POLL)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript",
                      ".wasm": "application/wasm", ".svg": "image/svg+xml"}

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/api/ping":
            return self._send(200, b'{"ok":true}')
        if p == "/api/config":
            return self._send(200, json.dumps(load_cfg()).encode())
        if self.path.startswith("/api/cc/"):
            try:
                code, body = fetch_chesscom(self.path[len("/api/cc/"):])
            except Exception as e:
                code, body = 502, json.dumps({"error": str(e)}).encode()
            return self._send(code, body)
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/quit":
            self._send(200, b'{"ok":true}')
            threading.Thread(target=lambda: (time.sleep(.3), os._exit(0)), daemon=True).start()
            return
        if self.path == "/api/config":
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}")
            c = load_cfg()
            for k in ("user", "autoOpen"):
                if k in data:
                    c[k] = data[k]
            save_cfg(c)
            if "autostart" in data:
                set_autostart(bool(data["autostart"]))
            return self._send(200, json.dumps(load_cfg()).encode())
        self._send(404, b"{}")

    def _send(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    if sys.platform == "darwin" or os.environ.get("SCHACH_WATCH"):
        threading.Thread(target=watcher, daemon=True).start()
    print(f"Schachanalyse läuft auf http://localhost:{PORT}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
