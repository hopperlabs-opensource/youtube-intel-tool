#!/usr/bin/env python3

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time


def _json_ok(payload):
    print(json.dumps({"ok": True, **payload}))


def _json_err(msg):
    print(json.dumps({"ok": False, "error": str(msg)}))


def _run(cmd, timeout_s=1800):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout_s, check=True)


def _which(name):
    return shutil.which(name) is not None


def _pick_hf_token():
    for k in ["YIT_HF_TOKEN", "HUGGINGFACE_TOKEN", "HF_TOKEN", "PYANNOTE_AUTH_TOKEN"]:
        v = os.environ.get(k)
        if v and v.strip():
            return v.strip()
    return None


def _pick_device():
    # Allow explicit override.
    v = os.environ.get("YIT_DIARIZE_DEVICE")
    if v and v.strip():
        return v.strip()

    # Best-effort defaults.
    try:
        import torch

        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass

    return "cpu"


def _merge_segments(segments, max_gap_ms=200):
    # segments: list of dicts with {speaker_key,start_ms,end_ms}
    if not segments:
        return []
    segments = sorted(segments, key=lambda s: (s["speaker_key"], s["start_ms"], s["end_ms"]))
    out = []
    for s in segments:
        if not out:
            out.append(dict(s))
            continue
        prev = out[-1]
        if prev["speaker_key"] == s["speaker_key"] and s["start_ms"] <= prev["end_ms"] + max_gap_ms:
            prev["end_ms"] = max(prev["end_ms"], s["end_ms"])
        else:
            out.append(dict(s))
    # restore chronological order for consumers
    return sorted(out, key=lambda s: (s["start_ms"], s["end_ms"]))


def diarize_mock(url, transcript_end_ms):
    # Single anonymous speaker across the whole transcript.
    end_ms = int(max(0, int(transcript_end_ms or 0)))
    return {
        "backend": "mock",
        "model": None,
        "device": None,
        "duration_ms": 0,
        "audio_url": url,
        "speakers": [{"key": "speaker_0", "segments": [{"start_ms": 0, "end_ms": end_ms}]}],
    }


def diarize_pyannote(url, transcript_end_ms):
    if not _which("yt-dlp"):
        raise RuntimeError("yt-dlp not installed (required for diarization audio download)")
    if not _which("ffmpeg"):
        raise RuntimeError("ffmpeg not installed (required for diarization audio conversion)")

    token = _pick_hf_token()
    if not token:
        raise RuntimeError("missing HuggingFace token (set YIT_HF_TOKEN or HUGGINGFACE_TOKEN)")

    model = os.environ.get("YIT_DIARIZE_PYANNOTE_MODEL") or "pyannote/speaker-diarization-3.1"
    device = _pick_device()

    started = time.time()
    with tempfile.TemporaryDirectory(prefix="yit-diarize-") as tmp:
        out_tmpl = os.path.join(tmp, "audio.%(ext)s")
        wav_path = os.path.join(tmp, "audio.wav")
        wav16_path = os.path.join(tmp, "audio16k.wav")

        # Download + extract audio. yt-dlp uses ffmpeg internally.
        _run(
            [
                "yt-dlp",
                "--no-playlist",
                "-x",
                "--audio-format",
                "wav",
                "--audio-quality",
                "0",
                "-o",
                out_tmpl,
                url,
            ],
            timeout_s=1800,
        )

        if not os.path.exists(wav_path):
            # yt-dlp may append extension when template doesn't include it; look for any wav.
            cand = None
            for f in os.listdir(tmp):
                if f.lower().endswith(".wav"):
                    cand = os.path.join(tmp, f)
                    break
            if not cand:
                raise RuntimeError("yt-dlp did not produce a wav file")
            wav_path = cand

        # Normalize audio: mono, 16kHz (keeps diarization cheaper).
        _run(
            [
                "ffmpeg",
                "-y",
                "-i",
                wav_path,
                "-ac",
                "1",
                "-ar",
                "16000",
                wav16_path,
            ],
            timeout_s=1800,
        )

        try:
            from pyannote.audio import Pipeline
        except Exception as e:
            raise RuntimeError(f"pyannote.audio not available: {e}")

        pipeline = Pipeline.from_pretrained(model, use_auth_token=token)
        try:
            import torch

            pipeline.to(torch.device(device))
        except Exception:
            # Device placement is best-effort (CPU always works).
            pass

        diarization = pipeline(wav16_path)

        # Map pyannote speaker labels to stable speaker_N keys (order of first appearance).
        label_to_key = {}
        next_idx = 0
        flat = []

        for turn, _, label in diarization.itertracks(yield_label=True):
            if label not in label_to_key:
                label_to_key[label] = f"speaker_{next_idx}"
                next_idx += 1
            speaker_key = label_to_key[label]
            start_ms = int(max(0, round(float(turn.start) * 1000)))
            end_ms = int(max(start_ms, round(float(turn.end) * 1000)))
            if transcript_end_ms is not None:
                end_ms = min(end_ms, int(transcript_end_ms))
            if end_ms <= start_ms:
                continue
            flat.append({"speaker_key": speaker_key, "start_ms": start_ms, "end_ms": end_ms})

        flat = _merge_segments(flat, max_gap_ms=200)

        speakers = {}
        for seg in flat:
            speakers.setdefault(seg["speaker_key"], []).append(
                {"start_ms": seg["start_ms"], "end_ms": seg["end_ms"], "confidence": None}
            )

        duration_ms = int(round((time.time() - started) * 1000))
        return {
            "backend": "pyannote",
            "model": model,
            "device": device,
            "duration_ms": duration_ms,
            "audio_url": url,
            "speakers": [{"key": k, "segments": v} for (k, v) in sorted(speakers.items(), key=lambda kv: kv[0])],
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--backend", default=os.environ.get("YIT_DIARIZE_BACKEND") or "pyannote")
    parser.add_argument("--transcript-end-ms", type=int, default=None)
    args = parser.parse_args()

    url = args.url
    backend = (args.backend or "").strip().lower()
    transcript_end_ms = args.transcript_end_ms

    try:
        if backend == "mock":
            _json_ok(diarize_mock(url, transcript_end_ms))
            return
        if backend == "pyannote":
            _json_ok(diarize_pyannote(url, transcript_end_ms))
            return
        raise RuntimeError(f"unsupported backend: {backend}")
    except Exception as e:
        _json_err(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
