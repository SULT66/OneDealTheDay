"""Regression tests for the GPU worker's speech preparation and audio handoff."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch


class HostWorkerTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        avatar = self.root / "avatar" / "closeup" / "source.mp4"
        avatar.parent.mkdir(parents=True)
        avatar.touch()
        path = Path(__file__).resolve().parents[1] / "gpu-worker" / "odd_live_host_worker.py"
        spec = importlib.util.spec_from_file_location("odd_host_worker", path)
        self.worker = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"ODD_LIVE_AVATAR_SOURCE": str(avatar)}):
            spec.loader.exec_module(self.worker)

    def test_accepts_server_narration_longer_than_old_limit(self):
        speech = ("Take a closer look at this product and its listed features. " * 12).strip()
        with patch.object(self.worker, "load_local_llm_config", return_value=None):
            self.assertEqual(self.worker.prepare_speech({"spoken_text": speech}), speech)

    def test_local_model_timeout_uses_catalog_grounded_server_reply(self):
        speech = "The retailer listing shows that this model includes a removable drip tray."
        response = {"spoken_text": speech, "product": {"title": "Coffee machine"}}
        with patch.object(self.worker, "load_local_llm_config", return_value={"model": "local"}), \
             patch.object(self.worker, "generate_local_speech", side_effect=TimeoutError):
            self.assertEqual(self.worker.prepare_speech(response), speech)

    def test_invalid_speech_releases_leased_turn(self):
        response = {"kind": "presentation", "drop_key": "tv:1", "lease_token": "test-token"}
        with patch.dict(os.environ, {"ODD_LIVE_API_BASE": "https://example.invalid", "ODD_LIVE_WORKER_KEY": "test"}), \
             patch("sys.argv", ["worker", "--once"]), \
             patch.object(self.worker, "load_speech_config"), \
             patch.object(self.worker, "load_local_llm_config", return_value=None), \
             patch.object(self.worker, "post_json", side_effect=[response, {"ok": True}]) as post:
            with self.assertRaisesRegex(ValueError, "INVALID_SPEECH_LENGTH"):
                self.worker.main()
        self.assertEqual(post.call_args.args[1], "/api/odd-tv/worker/ack")
        self.assertEqual(post.call_args.args[3], {"drop_key": "tv:1", "lease_token": "test-token", "aired": False})

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "requires FFmpeg and ffprobe")
    def test_adds_speech_wav_to_video_only_renderer_output(self):
        self.worker.MUSETALK = self.root / "MuseTalk"
        generated = self.worker.MUSETALK / "results/v15/avatars" / self.worker.MODEL_AVATAR / "vid_output/audio_0.mp4"
        generated.parent.mkdir(parents=True)
        audio = self.root / "speech.wav"
        run = subprocess.run
        run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=25:d=1",
             "-c:v", "mpeg4", str(generated)], check=True)
        run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=440:r=48000:d=1",
             str(audio)], check=True)

        def run_with_fixture(command, **kwargs):
            if command[1:3] == ["-m", "scripts.odd_live_stream"]:
                return subprocess.CompletedProcess(command, 0)
            return run(command, **kwargs)

        with patch.object(self.worker.subprocess, "run", side_effect=run_with_fixture):
            clip = self.worker.render_musetalk(audio, self.root)
        streams = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "json", str(clip),
        ]))["streams"]
        self.assertEqual({stream["codec_type"] for stream in streams}, {"video", "audio"})
        samples = subprocess.check_output([
            "ffmpeg", "-v", "error", "-i", str(clip), "-map", "0:a:0", "-f", "s16le", "pipe:1",
        ])
        self.assertTrue(any(samples))
