#!/usr/bin/env python3
"""Local desktop companion for the Koblenzer Puppenspiele web app.

Runs only on loopback, talks to a local Ollama installation, accepts the latest
Chrome screen frame, and can optionally repair a configured local Git checkout.
No Gemini/OpenAI API is used by this helper.
"""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = "127.0.0.1"
PORT = int(os.environ.get("KP_LOCAL_LIVE_PORT", "17381"))
OLLAMA = os.environ.get("KP_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
MODEL = os.environ.get("KP_OLLAMA_MODEL", "gemma3:4b")
REPO = Path(os.environ.get("KP_LOCAL_REPO", "")).expanduser().resolve() if os.environ.get("KP_LOCAL_REPO") else None
AUTO_PUSH = os.environ.get("KP_LOCAL_AUTO_PUSH", "0").strip() == "1"
TARGET_BRANCH = os.environ.get("KP_LOCAL_BRANCH", "feature/webapp-primary-agent")
MAX_BODY = 8_000_000
TEXT_EXTENSIONS = {
    ".js", ".mjs", ".css", ".php", ".html", ".htm", ".json", ".md",
    ".kt", ".kts", ".xml", ".gradle", ".yml", ".yaml", ".txt", ".sh", ".ps1",
}
BLOCKED_PARTS = {".git", "node_modules", "vendor", "build", ".gradle"}
BLOCKED_NAMES = {".env", "wp-config.php", "google-services.json", "keystore.properties"}
ALLOWED_ORIGINS = {
    "https://neu.koblenzer-puppenspiele.de",
    "https://koblenzer-puppenspiele.de",
    "http://localhost",
    "http://127.0.0.1",
}


def compact_error(exc: BaseException) -> str:
    return str(exc).strip()[:700] or exc.__class__.__name__


def ollama_request(path: str, payload: dict[str, Any], timeout: int = 180) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        OLLAMA + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def ollama_tags() -> list[str]:
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=4) as response:
            body = json.loads(response.read().decode("utf-8"))
        return [str(item.get("name", "")) for item in body.get("models", [])]
    except Exception:
        return []


def model_ready() -> bool:
    names = ollama_tags()
    wanted = MODEL.split(":", 1)[0]
    return any(name == MODEL or name.split(":", 1)[0] == wanted for name in names)


def extract_json(text: str) -> dict[str, Any] | None:
    clean = (text or "").strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.I)
    clean = re.sub(r"\s*```$", "", clean)
    start, end = clean.find("{"), clean.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(clean[start : end + 1])
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        return None


def vision(text: str, image_b64: str, history: str, page_context: str) -> dict[str, Any]:
    prompt = f"""NUTZERWUNSCH:\n{text[:3000]}\n\nLETZTE UNTERHALTUNG:\n{history[-4500:]}\n\nWEB-SEITENKONTEXT:\n{page_context[:5000]}\n\nSieh dir das beigefügte aktuelle Bildschirmbild an. Antworte ausschließlich als JSON:\n{{\"reply\":\"kurze natürliche Antwort auf Deutsch\",\"handoff\":\"\"}}\n\nWenn der Nutzer nur fragt, was du siehst oder gemeinsam durch den Bildschirm gehen möchte, bleibt handoff leer. Wenn er ausdrücklich etwas ändern, reparieren, programmieren oder einen sichtbaren Fehler beheben möchte, formuliere in handoff eine eigenständige präzise technische Aufgabe. Nenne sichtbare Texte, Fehlermeldungen und Elemente konkret. Erfinde nichts."""
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": "Du bist der lokale visuelle Assistent der Koblenzer Puppenspiele. Du arbeitest vollständig auf diesem Rechner und beschreibst nur, was im bereitgestellten Bildschirmbild und Kontext erkennbar ist.",
            },
            {"role": "user", "content": prompt, "images": [image_b64]},
        ],
        "stream": False,
        "options": {"temperature": 0.15, "top_p": 0.82, "num_predict": 360},
    }
    raw = str(ollama_request("/api/chat", payload, timeout=180).get("message", {}).get("content", "")).strip()
    parsed = extract_json(raw) or {"reply": raw[:1800], "handoff": ""}
    return {
        "reply": str(parsed.get("reply", "")).strip()[:2200] or "Ich sehe den freigegebenen Bildschirm.",
        "handoff": str(parsed.get("handoff", "")).strip()[:2200],
        "model": MODEL,
    }


def repo_ready() -> bool:
    return bool(REPO and REPO.is_dir() and (REPO / ".git").exists())


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    if not repo_ready():
        raise RuntimeError("Kein lokaler Git-Arbeitsordner konfiguriert. Setze KP_LOCAL_REPO.")
    return subprocess.run(
        ["git", *args], cwd=str(REPO), text=True, capture_output=True, check=check, timeout=90
    )


def allowed_file(path_text: str) -> bool:
    if not repo_ready():
        return False
    rel = Path(path_text)
    if rel.is_absolute() or ".." in rel.parts or any(part in BLOCKED_PARTS for part in rel.parts):
        return False
    if rel.name in BLOCKED_NAMES or rel.suffix.lower() not in TEXT_EXTENSIONS:
        return False
    full = (REPO / rel).resolve()
    try:
        full.relative_to(REPO)
    except ValueError:
        return False
    return full.is_file() and full.stat().st_size <= 120_000


def repo_catalog(task: str) -> list[str]:
    files = git("ls-files").stdout.splitlines()
    clean = [p for p in files if allowed_file(p)]
    words = {w.lower() for w in re.findall(r"[a-zA-Z0-9_-]{3,}", task)}
    def score(path: str) -> tuple[int, int]:
        lower = path.lower()
        hits = sum(3 for word in words if word in lower)
        if "owner-web-agent" in lower or "homepage" in lower:
            hits += 2
        return (-hits, len(path))
    return sorted(clean, key=score)[:160]


def local_text_json(system: str, prompt: str, timeout: int = 180) -> dict[str, Any]:
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1, "top_p": 0.8, "num_predict": 1000},
    }
    raw = str(ollama_request("/api/chat", payload, timeout=timeout).get("message", {}).get("content", ""))
    parsed = extract_json(raw)
    if not parsed:
        raise RuntimeError("Die lokale KI hat keinen gültigen JSON-Reparaturplan geliefert.")
    return parsed


def select_files(task: str) -> list[str]:
    catalog = repo_catalog(task)
    if not catalog:
        return []
    prompt = f"AUFGABE:\n{task[:2400]}\n\nDATEIKATALOG:\n" + "\n".join(catalog)
    prompt += "\n\nWähle für die Untersuchung höchstens drei vorhandene Dateien. Antworte als JSON: {\"files\":[\"pfad\"],\"reason\":\"kurz\"}. Die Auswahl ist nur zum Lesen; ein Fehler muss noch nicht bewiesen sein."
    data = local_text_json(
        "Du wählst relevante Dateien für einen lokalen Coding-Agenten. Erfinde keine Pfade und wähle möglichst klein.",
        prompt,
        timeout=120,
    )
    result: list[str] = []
    for path in data.get("files", [])[:3]:
        value = str(path).strip()
        if value in catalog and allowed_file(value):
            result.append(value)
    return result


def build_patch(task: str, paths: list[str]) -> dict[str, Any]:
    blocks: list[str] = []
    total = 0
    for path in paths:
        text = (REPO / path).read_text(encoding="utf-8", errors="replace")
        remain = max(0, 180_000 - total)
        text = text[:remain]
        total += len(text)
        blocks.append(f"\n===== {path} =====\n{text}")
        if total >= 180_000:
            break
    prompt = f"AUFGABE:\n{task[:3000]}\n\nQUELLCODE:\n{''.join(blocks)}\n\nAntworte ausschließlich als JSON mit diesem Schema: {{\"summary\":\"...\",\"diagnosis\":\"...\",\"risk\":\"low|medium|high\",\"changes\":[{{\"path\":\"...\",\"search\":\"exakter vorhandener Text\",\"replace\":\"neuer Text\"}}]}}. Maximal drei kleine Änderungen. Jede search-Zeichenfolge muss exakt einmal in der angegebenen Datei vorkommen. Wenn kein konkreter belegbarer Fix möglich ist, changes=[] setzen."
    return local_text_json(
        "Du bist ein vorsichtiger lokaler Coding-Agent. Ändere nur gelesene Dateien, erfinde keine Fehler und bevorzuge kleine reversible Fixes.",
        prompt,
        timeout=220,
    )


def validate_and_apply(plan: dict[str, Any], selected: list[str]) -> tuple[list[str], str]:
    risk = str(plan.get("risk", "high")).lower()
    if risk != "low":
        return [], f"Lokaler Plan wurde wegen Risiko '{risk}' nicht automatisch angewendet."
    changes = plan.get("changes", [])
    if not isinstance(changes, list) or not changes:
        return [], "Die lokale KI hat keinen konkreten risikoarmen Code-Fix gefunden."
    changed: list[str] = []
    snapshots: dict[str, str] = {}
    try:
        for item in changes[:3]:
            if not isinstance(item, dict):
                continue
            path = str(item.get("path", "")).strip()
            search = str(item.get("search", ""))
            replace = str(item.get("replace", ""))
            if path not in selected or not allowed_file(path) or not search or search == replace:
                raise RuntimeError(f"Ungültige lokale Änderung für {path or 'unbekannte Datei'}.")
            full = REPO / path
            original = full.read_text(encoding="utf-8")
            if original.count(search) != 1:
                raise RuntimeError(f"Die Suchstelle in {path} ist nicht eindeutig.")
            snapshots[path] = original
            full.write_text(original.replace(search, replace, 1), encoding="utf-8")
            changed.append(path)
        if not changed:
            return [], "Die lokale KI hat keine anwendbare Änderung erzeugt."
        diffcheck = git("diff", "--check", check=False)
        if diffcheck.returncode != 0:
            raise RuntimeError(diffcheck.stderr or diffcheck.stdout or "git diff --check fehlgeschlagen")
        for path in changed:
            if path.endswith(".js") and shutil.which("node"):
                subprocess.run(["node", "--check", str(REPO / path)], check=True, capture_output=True, text=True, timeout=45)
            if path.endswith(".php") and shutil.which("php"):
                subprocess.run(["php", "-l", str(REPO / path)], check=True, capture_output=True, text=True, timeout=45)
        return changed, ""
    except Exception:
        for path, original in snapshots.items():
            (REPO / path).write_text(original, encoding="utf-8")
        raise


def repair(task: str) -> dict[str, Any]:
    if not repo_ready():
        return {"applied": False, "message": "Lokaler Code-Zugriff ist noch nicht eingerichtet. Setze KP_LOCAL_REPO auf deinen Git-Arbeitsordner.", "repoReady": False}
    branch = git("branch", "--show-current").stdout.strip()
    if branch != TARGET_BRANCH:
        return {"applied": False, "message": f"Lokaler Git-Ordner steht auf '{branch}'. Erwartet wird '{TARGET_BRANCH}'.", "repoReady": True}
    dirty = git("status", "--porcelain").stdout.strip()
    if dirty:
        return {"applied": False, "message": "Der lokale Git-Arbeitsordner enthält bereits ungespeicherte Änderungen. Ich fasse ihn deshalb nicht automatisch an.", "repoReady": True}
    selected = select_files(task)
    if not selected:
        return {"applied": False, "message": "Die lokale KI konnte keine passende Datei zur Untersuchung bestimmen.", "repoReady": True}
    plan = build_patch(task, selected)
    changed, message = validate_and_apply(plan, selected)
    if not changed:
        return {"applied": False, "message": message, "summary": str(plan.get("summary", "")), "diagnosis": str(plan.get("diagnosis", "")), "repoReady": True}
    summary = str(plan.get("summary", "Lokaler KI-Fix")).strip()[:180]
    git("add", "--", *changed)
    git("commit", "-m", f"fix(local-live): {summary[:100]}")
    pushed = False
    if AUTO_PUSH:
        git("push", "origin", f"HEAD:{TARGET_BRANCH}")
        pushed = True
    return {
        "applied": True,
        "pushed": pushed,
        "changed": changed,
        "summary": summary,
        "diagnosis": str(plan.get("diagnosis", "")).strip()[:1500],
        "message": "Fix lokal committed und gepusht." if pushed else "Fix lokal committed. Auto-Push ist noch ausgeschaltet.",
        "repoReady": True,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "KPLocalLive/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stdout.write("[local-live] " + fmt % args + "\n")

    def origin(self) -> str:
        return self.headers.get("Origin", "")

    def origin_allowed(self) -> bool:
        origin = self.origin()
        return not origin or origin in ALLOWED_ORIGINS

    def cors(self) -> None:
        origin = self.origin()
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")

    def json_response(self, status: int, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        if not self.origin_allowed():
            self.json_response(403, {"ok": False, "error": "Origin nicht erlaubt."})
            return
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:
        if not self.origin_allowed():
            self.json_response(403, {"ok": False, "error": "Origin nicht erlaubt."})
            return
        if self.path.rstrip("/") != "/health":
            self.json_response(404, {"ok": False, "error": "Nicht gefunden."})
            return
        tags = ollama_tags()
        self.json_response(200, {
            "ok": True,
            "service": "kp-local-live",
            "model": MODEL,
            "modelReady": model_ready(),
            "ollamaReady": bool(tags),
            "repoReady": repo_ready(),
            "autoPush": AUTO_PUSH,
            "branch": TARGET_BRANCH,
        })

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("Ungültige Anfragegröße.")
        body = self.rfile.read(length)
        data = json.loads(body.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("JSON-Objekt erwartet.")
        return data

    def do_POST(self) -> None:
        if not self.origin_allowed():
            self.json_response(403, {"ok": False, "error": "Origin nicht erlaubt."})
            return
        try:
            data = self.read_json()
            if self.path.rstrip("/") == "/vision":
                text = str(data.get("text", "")).strip()[:4000]
                image = str(data.get("image", "")).strip()
                history = str(data.get("history", ""))
                page_context = str(data.get("pageContext", ""))
                if len(text) < 1 or len(image) < 100:
                    raise ValueError("Text und Bildschirmbild werden benötigt.")
                try:
                    base64.b64decode(image[:4000] + "===", validate=False)
                except Exception as exc:
                    raise ValueError("Bilddaten sind ungültig.") from exc
                result = vision(text, image, history, page_context)
                self.json_response(200, {"ok": True, **result})
                return
            if self.path.rstrip("/") == "/repair":
                task = str(data.get("task", "")).strip()[:5000]
                if len(task) < 3:
                    raise ValueError("Reparaturauftrag fehlt.")
                self.json_response(200, {"ok": True, **repair(task)})
                return
            self.json_response(404, {"ok": False, "error": "Nicht gefunden."})
        except urllib.error.URLError as exc:
            self.json_response(503, {"ok": False, "error": "Ollama ist lokal nicht erreichbar: " + compact_error(exc)})
        except subprocess.CalledProcessError as exc:
            self.json_response(500, {"ok": False, "error": (exc.stderr or exc.stdout or "Lokaler Git-Befehl fehlgeschlagen.")[:1200]})
        except Exception as exc:
            self.json_response(500, {"ok": False, "error": compact_error(exc)})


def main() -> None:
    print(f"Homepage-Hilfe Live lokal: http://{HOST}:{PORT}")
    print(f"Ollama: {OLLAMA} · Modell: {MODEL}")
    print(f"Git-Arbeitsordner: {REPO if REPO else 'nicht konfiguriert'}")
    print(f"Auto-Push: {'an' if AUTO_PUSH else 'aus'} · Branch: {TARGET_BRANCH}")
    print("Beenden mit Strg+C.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
