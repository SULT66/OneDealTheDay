#!/usr/bin/env python3
"""Smoke test for the isolated Diana rehearsal API; no external services."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

MODULE = Path(__file__).resolve().parents[1] / "gpu-worker" / "odd_live_local_api.py"
spec = importlib.util.spec_from_file_location("odd_local", MODULE)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

class DemoAPITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        app.ROOT = Path(cls.temp.name)
        app.KEY_FILE = app.ROOT / "local-worker.key"
        cls.key = app.make_key()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.server.worker_key = cls.key
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_address[1])
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.temp.cleanup()

    def req(self, path, data=None, secret=None):
        body = None if data is None else json.dumps(data).encode()
        headers = {"Content-Type": "application/json"}
        if secret is not None:
            headers["X-ODD-Worker-Key"] = secret
        req = urllib.request.Request(self.base + path, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=3) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def test_demo_flow(self):
        code, health = self.req("/health")
        self.assertEqual(code, 200)
        self.assertEqual(health["mode"], "LOCAL_DEMO_ONLY")
        code, show = self.req("/api/odd-tv/live")
        self.assertEqual(code, 200)
        self.assertEqual(show["show"]["product_count"], 8)
        self.assertIsNone(show["show"]["product"]["price"])
        code, _ = self.req("/api/odd-tv/worker/next", {"market": "us"})
        self.assertEqual(code, 403)
        code, question = self.req("/api/odd-tv/chat", {"text": "Does this have a timer?", "session_id": "test-user-001"})
        self.assertEqual(code, 201)
        code, job = self.req("/api/odd-tv/worker/next", {"market": "us"}, self.key)
        self.assertEqual(code, 200)
        self.assertEqual(job["kind"], "question")
        self.assertEqual(job["question_id"], question["question_id"])
        self.assertIn("demo", job["spoken_text"].lower())
        code, busy = self.req("/api/odd-tv/worker/next", {"market": "us"}, self.key)
        self.assertEqual((code, busy["kind"]), (200, "busy"))
        code, _ = self.req("/api/odd-tv/worker/ack", {
            "drop_key": job["drop_key"], "lease_token": job["lease_token"], "aired": True
        }, "invalid")
        self.assertEqual(code, 403)
        code, result = self.req("/api/odd-tv/worker/ack", {
            "drop_key": job["drop_key"], "lease_token": job["lease_token"], "aired": True
        }, self.key)
        self.assertEqual(code, 200)
        code, chat = self.req("/api/odd-tv/chat")
        self.assertEqual(chat["messages"][0]["status"], "sent")
        code, show = self.req("/api/odd-tv/live")
        self.assertEqual(show["show"]["product_index"], 1)

if __name__ == "__main__":
    unittest.main()
