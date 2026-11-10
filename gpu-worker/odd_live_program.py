#!/usr/bin/env python3
"""Local continuous ODD Live program bus: idle animation + queued voiced clips.

Prototype for Diana (WSL Ubuntu): one long-lived FFmpeg encoder sends H264/AAC
to the local MediaMTX RTSP endpoint. Clips are switched inside the Python
producer without restarting FFmpeg, so they share a single audience stream.

This program does not publicly expose MediaMTX. It does not ACK questions until
--ack-delivered is explicitly enabled after downstream player verification.
"""
import argparse
import json
import math
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import urllib.request

import cv2

FPS=25
AUDIO_RATE=48000
SAMPLES_PER_FRAME=AUDIO_RATE//FPS
AUDIO_BYTES_PER_FRAME=SAMPLES_PER_FRAME*2  # s16le mono

ROOT=Path.home()/"odd-ai-humans"
IDLE=ROOT/"MuseTalk/results/v15/avatars/chloe_closeup_01/full_imgs"
READY=ROOT/"output/chloe-smart/ready"

def write_all(fd, data):
    view=memoryview(data)
    while view:
        n=os.write(fd,view)
        if n<=0: raise BrokenPipeError("Output pipeline closed")
        view=view[n:]

def launch_ffmpeg(width,height,url):
    vr,vw=os.pipe()
    ar,aw=os.pipe()
    cmd=[
        "ffmpeg","-nostdin","-hide_banner","-loglevel","warning",
        "-thread_queue_size","32","-f","rawvideo",
        "-pixel_format","bgr24","-video_size",f"{width}x{height}",
        "-framerate",str(FPS),"-i",f"pipe:{vr}",
        "-thread_queue_size","64","-f","s16le","-ar",str(AUDIO_RATE),
        "-ac","1","-i",f"pipe:{ar}",
        "-c:v","h264_nvenc","-preset","p4","-pix_fmt","yuv420p",
        "-b:v","3M","-g","50","-c:a","aac","-b:a","128k",
        "-f","rtsp","-rtsp_transport","tcp",url
    ]
    process=subprocess.Popen(cmd,pass_fds=(vr,ar),stdin=subprocess.DEVNULL)
    os.close(vr);os.close(ar)
    return process,vw,aw

def read_job():
    READY.mkdir(parents=True,exist_ok=True)
    for path in sorted(READY.glob("*.ready.json")):
        try:
            info=json.loads(path.read_text(encoding="utf-8"))
            video=Path(info["video"]).resolve(strict=True)
            clips_root=(ROOT/"output/chloe-smart").resolve(strict=True)
            if clips_root not in video.parents or video.suffix.lower()!=".mp4":
                raise ValueError("UNTRUSTED_VIDEO_PATH")
            if info.get("lease_expires_at",0) and time.time()>float(info["lease_expires_at"]):
                path.rename(path.with_suffix(".expired"))
                continue
            playing=path.with_name(path.name.replace(".ready.json",".playing.json"))
            path.rename(playing)
            return playing,info,video
        except (OSError,ValueError,KeyError,json.JSONDecodeError) as exc:
            print("Job ignored:",path.name,type(exc).__name__,flush=True)
            try: path.rename(path.with_suffix(".bad"))
            except OSError: pass
    return None

def decode_clip(video,width,height):
    capture=cv2.VideoCapture(str(video))
    if not capture.isOpened(): raise RuntimeError("UNREADABLE_CLIP")
    fps=capture.get(cv2.CAP_PROP_FPS)
    if not (24<=fps<=26):
        capture.release()
        raise RuntimeError("CLIP_MUST_BE_25FPS")
    samples=subprocess.check_output([
        "ffmpeg","-nostdin","-v","error","-i",str(video),
        "-map","0:a:0","-f","s16le","-ar","48000","-ac","1","pipe:1"
    ],timeout=45)
    frames=[]
    try:
        while True:
            ok,frame=capture.read()
            if not ok: break
            if frame.shape[:2]!=(height,width):
                frame=cv2.resize(frame,(width,height))
            frames.append(frame)
            if len(frames)>FPS*90: raise RuntimeError("CLIP_TOO_LONG")
    finally: capture.release()
    if not frames: raise RuntimeError("NO_CLIP_FRAMES")
    return frames,samples

def ack(info):
    base=os.getenv("ODD_LIVE_API_BASE","").rstrip("/")
    key=os.getenv("ODD_LIVE_WORKER_KEY","")
    if not (base.startswith("https://") and key and info.get("lease_token")):
        raise RuntimeError("ACK_REQUIRES_HTTPS_AND_SECRET")
    payload=json.dumps({"drop_key":info["drop_key"],"lease_token":info["lease_token"],"aired":True}).encode()
    req=urllib.request.Request(
        base+"/api/odd-live/worker/ack",method="POST",data=payload,
        headers={"Content-Type":"application/json","X-ODD-Worker-Key":key}
    )
    with urllib.request.urlopen(req,timeout=12) as response:
        result=json.loads(response.read().decode())
        if not result.get("ok"): raise RuntimeError("ACK_REJECTED")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--rtsp",default="rtsp://127.0.0.1:8554/odd-live-smart")
    parser.add_argument("--ack-delivered",action="store_true",
                        help="Only after external live audio/video playback is verified.")
    args=parser.parse_args()
    if not args.rtsp.startswith("rtsp://127.0.0.1:8554/"):
        raise ValueError("LOCAL_RTMP_ONLY_DISABLED")
    images=sorted(IDLE.glob("*.png"))
    if not images: raise RuntimeError("NO_CHLOE_IDLE_FRAMES")
    first=cv2.imread(str(images[0]))
    if first is None: raise RuntimeError("BAD_IDLE_IMAGE")
    height,width=first.shape[:2]
    process,video_fd,audio_fd=launch_ffmpeg(width,height,args.rtsp)
    audio_queue=queue.Queue(maxsize=8)
    audio_error=[]
    def send_audio():
        try:
            while True:
                piece=audio_queue.get()
                if piece is None:return
                write_all(audio_fd,piece)
        except Exception as exc:
            audio_error.append(exc)
    audio_thread=threading.Thread(target=send_audio,daemon=True)
    audio_thread.start()
    idle_idx=0
    current=None
    frame_count=0
    next_tick=time.monotonic()
    print("ODD_LIVE_PROGRAM_ON_AIR",args.rtsp,flush=True)
    try:
        while process.poll() is None:
            if audio_error: raise RuntimeError("AUDIO_ENCODER_FAILED") from audio_error[0]
            if current is None:
                job=read_job()
                if job:
                    name,info,video=job
                    try:
                        frames,audio=decode_clip(video,width,height)
                        current=(name,info,frames,audio)
                        frame_count=0
                        print("CHLOE_SPEAKING",name.name,flush=True)
                    except Exception as exc:
                        name.rename(name.with_name(name.name.replace(".playing.json",".failed.json")))
                        print("CLIP_FAILED",type(exc).__name__,flush=True)
            if current is not None:
                path,info,frames,audio=current
                index=min(frame_count,len(frames)-1)
                frame=frames[index]
                start=frame_count*AUDIO_BYTES_PER_FRAME
                segment=audio[start:start+AUDIO_BYTES_PER_FRAME]
                segment=segment.ljust(AUDIO_BYTES_PER_FRAME,b"\0")
                frame_count+=1
                total=max(len(frames),math.ceil(len(audio)/AUDIO_BYTES_PER_FRAME))
            else:
                frame=cv2.imread(str(images[idle_idx%len(images)]))
                idle_idx+=1
                if frame is None: frame=first
                segment=b"\0"*AUDIO_BYTES_PER_FRAME
            audio_queue.put(segment,timeout=5)
            write_all(video_fd,frame.tobytes())
            if current is not None and frame_count>=total:
                path,info,_,_=current
                aired=path.with_name(path.name.replace(".playing.json",".aired.json"))
                path.rename(aired)
                print("CHLOE_CLIP_SENT",aired.name,flush=True)
                if args.ack_delivered:
                    try: ack(info); print("QUESTION_ACKNOWLEDGED",flush=True)
                    except Exception as exc: print("ACK_ERROR",type(exc).__name__,flush=True)
                current=None
            next_tick+=1/FPS
            pause=next_tick-time.monotonic()
            if pause>0:time.sleep(pause)
            elif pause< -1: next_tick=time.monotonic()
        raise RuntimeError("ENCODER_TERMINATED")
    finally:
        try:audio_queue.put(None,timeout=2)
        except queue.Full:pass
        for fd in (video_fd,audio_fd):
            try:os.close(fd)
            except OSError:pass
        process.terminate()
        try:process.wait(timeout=3)
        except subprocess.TimeoutExpired:process.kill()

if __name__=="__main__":
    main()
