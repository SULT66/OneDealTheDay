#!/usr/bin/env python3
"""ODD Live local rehearsal API. Never connects to the production shop.

Python stdlib only; listens on Diana's LOOPBACK interface. The eight products
are conspicuously fictional; real product import and public delivery are NOT
part of this rehearsal.
"""
import argparse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
from urllib.parse import parse_qs, urlsplit

ROOT = Path.home() / ".config" / "odd-live"
KEY_FILE = ROOT / "local-worker.key"
SHOW_ID = 1
PORT = 8765
_lock = threading.RLock()
_messages = []
_lease = None
_product_index = 0
_turn_number = 0
_counter = 0
_demo_names = (
    "Demo Coffee Maker", "Demo Desk Lamp", "Demo Kitchen Scale",
    "Demo Wireless Speaker", "Demo Travel Mug", "Demo Backpack",
    "Demo Air Purifier", "Demo Blender"
)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def make_key():
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not KEY_FILE.exists():
        fd = os.open(str(KEY_FILE), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(secrets.token_hex(32) + "\n")
    if KEY_FILE.stat().st_mode & 0o077:
        raise PermissionError("KEY_FILE_MUST_BE_PRIVATE")
    secret = KEY_FILE.read_text(encoding="utf-8").strip()
    if len(secret) < 32:
        raise ValueError("INVALID_LOCAL_WORKER_KEY")
    return secret

def product():
    title = _demo_names[_product_index]
    return {"id": _product_index + 1, "title": title,
            "brand": None, "retailer_name": "DEMO ONLY",
            "description": "Fictional sample for testing AI presentation.",
            "price": None, "currency": "USD", "image_url": None,
            "affiliate_url": None, "price_verified": False}

class Handler(BaseHTTPRequestHandler):
    server_version = "ODDLocalRehearsal/0.1"

    def respond(self, status, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def request_data(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("BAD_LENGTH")
        if n <= 0 or n > 4096:
            raise ValueError("INVALID_BODY_SIZE")
        data = json.loads(self.rfile.read(n))
        if not isinstance(data, dict):
            raise ValueError("BODY_MUST_BE_OBJECT")
        return data

    def authorized(self):
        token = self.headers.get("X-ODD-Worker-Key", "")
        return hmac.compare_digest(token, self.server.worker_key)

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == "/health":
            return self.respond(200, {"ok": True, "mode": "LOCAL_DEMO_ONLY"})
        if route == "/api/odd-tv/live":
            with _lock:
                return self.respond(200, {"show": {
                    "show_id": SHOW_ID, "state": "live", "product_index": _product_index,
                    "product_count": len(_demo_names), "product": product(),
                    "mode": "LOCAL_DEMO_ONLY"}})
        if route == "/api/odd-tv/chat":
            with _lock:
                return self.respond(200, {"show_id": SHOW_ID, "messages": list(_messages[-30:])})
        return self.respond(404, {"error": "NOT_FOUND"})

    def do_POST(self):
        global _counter, _lease, _product_index, _turn_number
        route = urlsplit(self.path).path
        try:
            data = self.request_data()
        except (ValueError, json.JSONDecodeError) as e:
            return self.respond(400, {"error": str(e)})
        if route == "/api/odd-tv/chat":
            message = data.get("text")
            if not isinstance(message, str) or len(message.strip()) < 3 or len(message) > 350:
                return self.respond(400, {"error": "INVALID_QUESTION"})
            if not re.fullmatch(r"[a-zA-Z0-9_-]{6,80}", str(data.get("session_id", ""))):
                return self.respond(400, {"error": "INVALID_SESSION"})
            with _lock:
                if len(_messages) >= 100:
                    return self.respond(429, {"error": "DEMO_CHAT_LIMIT_REACHED"})
                recent = [m for m in _messages if m["session_id"] == data["session_id"] and time.time() - m["_at"] < 20]
                if recent:
                    return self.respond(429, {"error": "CHAT_RATE_LIMIT"})
                _counter += 1
                _messages.append({"id": _counter, "text": message.strip(),
                                  "session_id": data["session_id"], "status": "queued",
                                  "created_at": now_iso(), "_at": time.time()})
                return self.respond(201, {"ok": True, "question_id": _counter})
        if route not in ("/api/odd-tv/worker/next", "/api/odd-tv/worker/ack"):
            return self.respond(404, {"error": "NOT_FOUND"})
        if not self.authorized():
            return self.respond(403, {"error": "FORBIDDEN"})
        with _lock:
            if route.endswith("/next"):
                if _lease and _lease["expiry"] > time.time():
                    return self.respond(200, {"kind": "busy"})
                question = next((m for m in _messages if m["status"] == "queued"), None)
                _turn_number += 1
                name = product()["title"]
                if question:
                    spoken = ("Thanks for asking about " + name + "! "
                              "This is a demo item, so I cannot verify that feature. "
                              "Once connected to the real catalog, I'll check its specifications.")
                else:
                    spoken = ("Welcome to ODD Live! I'm Chloe. Today we're showing the "
                              + name + ". This is a test product, not a real offer. "
                              "Let's explore how our live shopping show will sound!")
                token = secrets.token_hex(24)
                expiry = time.time() + 600
                _lease = {"token": token, "expiry": expiry,
                          "question_id": question["id"] if question else None}
                return self.respond(200, {
                    "kind": "question" if question else "presentation",
                    "show_id": SHOW_ID, "drop_key": "tv:1",
                    "question_id": _lease["question_id"], "product_id": _product_index + 1,
                    "spoken_text": spoken, "lease_token": token,
                    "lease_expires_at": datetime.fromtimestamp(expiry, timezone.utc).isoformat()})
            if not _lease or _lease["expiry"] < time.time() or not hmac.compare_digest(
                    str(data.get("lease_token", "")), _lease["token"]):
                return self.respond(409, {"error": "LEASE_EXPIRED"})
            if data.get("drop_key") != "tv:1":
                return self.respond(400, {"error": "INVALID_SHOW"})
            if data.get("aired") is True and _lease["question_id"] is not None:
                for msg in _messages:
                    if msg["id"] == _lease["question_id"]:
                        msg["status"] = "sent"
                        break
            if data.get("aired") is True:
                _product_index = (_product_index + 1) % len(_demo_names)
            _lease = None
            return self.respond(200, {"ok": True, "mode": "LOCAL_DEMO_ONLY"})

def main():
    p = argparse.ArgumentParser(description="Local-only ODD TV rehearsal API")
    p.add_argument("--port", type=int, default=PORT)
    args = p.parse_args()
    if not 1024 <= args.port <= 65535:
        p.error("port must be between 1024 and 65535")
    key = make_key()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.worker_key = key
    print(f"ODD_TV_DEMO_API_READY http://127.0.0.1:{args.port}/health", flush=True)
    print("FICTIONAL PRODUCTS ONLY. NO REAL CATALOG, NO PUBLIC STREAM.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
