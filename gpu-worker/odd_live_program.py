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
MOTION_DIR=Path(os.getenv("ODD_LIVE_MOTION_DIR",str(ROOT/"assets/chloe/motions")))

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
        # JPEG image2pipe frames are self-delimiting. POSIX pipes can return
        # short writes; rawvideo treated those chunks like whole frames and
        # stalled before FFmpeg opened the RTSP publisher.
        "-probesize","32","-analyzeduration","0",
        "-thread_queue_size","32","-f","image2pipe","-vcodec","mjpeg",
        "-framerate",str(FPS),"-i",f"pipe:{vr}",
        "-probesize","32","-analyzeduration","0",
        "-thread_queue_size","64","-f","s16le","-ar",str(AUDIO_RATE),
        "-ac","1","-i",f"pipe:{ar}",
        "-map","0:v:0","-map","1:a:0",
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

def decode_motion(video,width,height):
    """Decode a short silent walk/gesture clip for occasional idle playback."""
    capture=cv2.VideoCapture(str(video))
    if not capture.isOpened(): raise RuntimeError("UNREADABLE_MOTION_CLIP")
    fps=capture.get(cv2.CAP_PROP_FPS)
    if not (10<=fps<=60):
        capture.release()
        raise RuntimeError("MOTION_CLIP_FPS_MUST_BE_10_TO_60")
    frames=[]
    try:
        while True:
            ok,frame=capture.read()
            if not ok: break
            if frame.shape[:2]!=(height,width):
                frame=cv2.resize(frame,(width,height))
            frames.append(frame)
            if len(frames)>FPS*20: raise RuntimeError("MOTION_CLIP_TOO_LONG")
    finally:
        capture.release()
    if not frames: raise RuntimeError("EMPTY_MOTION_CLIP")
    return frames

def ack(info):
    base=os.getenv("ODD_LIVE_API_BASE","").rstrip("/")
    key=os.getenv("ODD_LIVE_WORKER_KEY","")
    if not (base.startswith("https://") and key and info.get("lease_token")):
        raise RuntimeError("ACK_REQUIRES_HTTPS_AND_SECRET")
    payload=json.dumps({"drop_key":info["drop_key"],"lease_token":info["lease_token"],"aired":True}).encode()
    endpoint="/api/odd-tv/worker/ack" if str(info["drop_key"]).startswith("tv:") else "/api/odd-live/worker/ack"
    req=urllib.request.Request(
        base+endpoint,method="POST",data=payload,
        headers={"Content-Type":"application/json","X-ODD-Worker-Key":key}
    )
    with urllib.request.urlopen(req,timeout=12) as response:
        result=json.loads(response.read().decode())
        if not result.get("ok"): raise RuntimeError("ACK_REJECTED")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--rtsp",default="rtsp://127.0.0.1:8554/odd-live-smart")
    parser.add_argument("--ack-delivered",action="store_true",
                        help="Acknowledge chat only after the clip has been sent to the live encoder.")
    parser.add_argument("--motion-dir",default=str(MOTION_DIR),
                        help="Directory containing short Chloe idle-motion MP4s.")
    parser.add_argument("--motion-every-seconds",type=int,default=3,
                        help="Pause between distinct idle-motion clips while Chloe is not speaking.")
    args=parser.parse_args()
    if not 1<=args.motion_every_seconds<=600:
        parser.error("--motion-every-seconds must be between 1 and 600.")
    if not args.rtsp.startswith("rtsp://127.0.0.1:8554/"):
        raise ValueError("LOCAL_RTMP_ONLY_DISABLED")
    images=sorted(IDLE.glob("*.png"))
    if not images: raise RuntimeError("NO_CHLOE_IDLE_FRAMES")
    first=cv2.imread(str(images[0]))
    if first is None: raise RuntimeError("BAD_IDLE_IMAGE")
    height,width=first.shape[:2]
    process,video_fd,audio_fd=launch_ffmpeg(width,height,args.rtsp)
    audio_queue=queue.Queue(maxsize=64)
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
    motion_dir=Path(args.motion_dir).expanduser()
    motion_paths=sorted(motion_dir.glob("*.mp4")) if motion_dir.is_dir() else []
    # idle_05.mp4 is the prepared walk-in scene: play it once at stream start,
    # then exclude it from the recurring breathing/blinking/gesture rotation.
    entrance_path=motion_dir/"idle_05.mp4"
    if not entrance_path.is_file():
        entrance_path=None
    if entrance_path:
        motion_paths=[path for path in motion_paths if path!=entrance_path]
    motion_index=0
    motion_frames=[]
    motion_frame_index=0
    active_motion_is_entrance=False
    entry_pending=bool(entrance_path)
    if entrance_path:
        try:
            motion_frames=decode_motion(entrance_path,width,height)
            active_motion_is_entrance=True
            print("MOTION_ENTRANCE_PLAYING_ONCE",entrance_path.name,flush=True)
        except Exception as exc:
            entry_pending=False
            print("MOTION_ENTRANCE_SKIPPED",type(exc).__name__,flush=True)
    next_motion_at=time.monotonic()
    if motion_paths:
        print("MOTION_CLIPS_FOUND",len(motion_paths),str(motion_dir),flush=True)
    else:
        print("NO_MOTION_CLIPS: using MuseTalk idle frames",str(motion_dir),flush=True)
    next_tick=time.monotonic()
    # Decode queued clips off the real-time writer loop. A full MuseTalk clip
    # can take several seconds to load; blocking here starves FFmpeg's raw input
    # pipes, so it never opens the RTSP publisher and the public player gets 404.
    decoded_jobs=queue.Queue(maxsize=1)
    decode_thread=None
    next_job_check=0.0

    def prepare_next_job():
        job=read_job()
        if not job:
            return
        name,info,video=job
        try:
            frames,audio=decode_clip(video,width,height)
            decoded_jobs.put((name,info,frames,audio))
        except Exception as exc:
            failed=name.with_name(name.name.replace(".playing.json",".failed.json"))
            try:
                name.rename(failed)
            except OSError:
                pass
            print("CLIP_FAILED",type(exc).__name__,flush=True)

    print("ODD_LIVE_PROGRAM_STARTING",args.rtsp,flush=True)
    try:
        while process.poll() is None:
            if audio_error: raise RuntimeError("AUDIO_ENCODER_FAILED") from audio_error[0]
            try:
                prepared=decoded_jobs.get_nowait()
            except queue.Empty:
                prepared=None
            if prepared is not None:
                name,info,frames,audio=prepared
                current=(name,info,frames,audio)
                frame_count=0
                print("CHLOE_SPEECH_READY",name.name,flush=True)
            if current is None and time.monotonic()>=next_job_check:
                if decode_thread is None or not decode_thread.is_alive():
                    decode_thread=threading.Thread(target=prepare_next_job,daemon=True)
                    decode_thread.start()
                    next_job_check=time.monotonic()+1.0
            can_play=(current is not None and not entry_pending and
                      time.time()>=float(current[1].get("play_after",0)))
            if can_play:
                path,info,frames,audio=current
                index=min(frame_count,len(frames)-1)
                frame=frames[index]
                start=frame_count*AUDIO_BYTES_PER_FRAME
                segment=audio[start:start+AUDIO_BYTES_PER_FRAME]
                segment=segment.ljust(AUDIO_BYTES_PER_FRAME,b"\0")
                frame_count+=1
                total=max(len(frames),math.ceil(len(audio)/AUDIO_BYTES_PER_FRAME))
            else:
                now=time.monotonic()
                if motion_paths and not motion_frames and now>=next_motion_at:
                    candidate=motion_paths[motion_index%len(motion_paths)]
                    motion_index+=1
                    next_motion_at=now+args.motion_every_seconds
                    try:
                        motion_frames=decode_motion(candidate,width,height)
                        motion_frame_index=0
                        active_motion_is_entrance=False
                        print("MOTION_CLIP_PLAYING",candidate.name,flush=True)
                    except Exception as exc:
                        print("MOTION_CLIP_SKIPPED",candidate.name,type(exc).__name__,flush=True)
                if motion_frames:
                    frame=motion_frames[motion_frame_index]
                    motion_frame_index+=1
                    if motion_frame_index>=len(motion_frames):
                        motion_frames=[]
                        motion_frame_index=0
                        if active_motion_is_entrance:
                            entry_pending=False
                            active_motion_is_entrance=False
                            print("MOTION_ENTRANCE_COMPLETE",flush=True)
                        # Continue the idle motion rotation immediately, without
                        # replaying the walk-in scene or freezing on a still frame.
                        next_motion_at=time.monotonic()
                else:
                    frame=cv2.imread(str(images[idle_idx%len(images)]))
                    idle_idx+=1
                    if frame is None:
                        frame=first
                    elif frame.shape[:2]!=(height,width):
                        # All rawvideo writes must have the exact dimensions
                        # passed to FFmpeg at startup; a single mismatched idle
                        # PNG can desynchronize the stream indefinitely.
                        frame=cv2.resize(frame,(width,height),interpolation=cv2.INTER_AREA)
                segment=b"\0"*AUDIO_BYTES_PER_FRAME
            # Preserve one 40 ms audio slice for every video frame. If FFmpeg
            # temporarily back-pressures its audio input, pause the shared
            # producer clock instead of dropping speech samples; dropping even
            # one slice makes the separate audio and video timelines drift.
            while True:
                try:
                    audio_queue.put(segment,timeout=0.25)
                    break
                except queue.Full:
                    if audio_error:
                        raise RuntimeError("AUDIO_ENCODER_FAILED") from audio_error[0]
                    if process.poll() is not None:
                        raise RuntimeError("ENCODER_TERMINATED")
            ok,encoded=cv2.imencode(".jpg",frame,[cv2.IMWRITE_JPEG_QUALITY,90])
            if not ok: raise RuntimeError("JPEG_FRAME_ENCODE_FAILED")
            write_all(video_fd,encoded.tobytes())
            if can_play and frame_count>=total:
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
