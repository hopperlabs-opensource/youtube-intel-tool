#!/usr/bin/env python3

import argparse
import json
import os
import sys
import tempfile


def _json_ok(payload):
    print(json.dumps({"ok": True, **payload}))


def _json_err(msg):
    print(json.dumps({"ok": False, "error": str(msg)}))


def _pick_device():
    v = os.environ.get("YIT_VOICE_DEVICE")
    if v and v.strip():
        return v.strip()

    try:
        import torch

        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass

    return "cpu"


def run_voice_embedding(audio_path, segments_json_path):
    """Extract d-vector voice embeddings per speaker using resemblyzer."""
    try:
        from resemblyzer import VoiceEncoder, preprocess_wav
    except ImportError:
        raise RuntimeError(
            "resemblyzer not installed. Install with: pip install resemblyzer"
        )

    import numpy as np

    device = _pick_device()

    # Load segments
    with open(segments_json_path, "r") as f:
        segments = json.load(f)

    # Load and preprocess audio
    wav = preprocess_wav(audio_path)

    # Initialize encoder
    encoder = VoiceEncoder(device)

    results = []
    sample_rate = 16000  # resemblyzer expects 16kHz

    for speaker_info in segments:
        speaker_label = speaker_info["label"]
        speaker_segments = speaker_info.get("segments", [])

        if not speaker_segments:
            continue

        # Extract audio segments for this speaker
        segment_embeddings = []
        for seg in speaker_segments:
            start_sample = int(seg["start_ms"] / 1000 * sample_rate)
            end_sample = int(seg["end_ms"] / 1000 * sample_rate)

            if start_sample >= len(wav) or end_sample <= start_sample:
                continue

            segment_wav = wav[start_sample:min(end_sample, len(wav))]

            # Skip very short segments (< 0.5s)
            if len(segment_wav) < sample_rate * 0.5:
                continue

            try:
                emb = encoder.embed_utterance(segment_wav)
                segment_embeddings.append(emb)
            except Exception:
                continue

        if not segment_embeddings:
            continue

        # Average embeddings across segments
        avg_embedding = np.mean(segment_embeddings, axis=0)

        # Normalize to unit vector
        norm = float(np.linalg.norm(avg_embedding))
        if norm > 0:
            avg_embedding = avg_embedding / norm

        results.append({
            "label": speaker_label,
            "embedding_256d": avg_embedding.tolist(),
            "segment_count": len(segment_embeddings),
        })

    return {
        "model": "resemblyzer",
        "device": device,
        "speakers": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Voice embedding extraction")
    parser.add_argument("--audio-path", required=True, help="Path to audio file (WAV, 16kHz)")
    parser.add_argument("--segments-json", required=True, help="Path to JSON with speaker segments")
    args = parser.parse_args()

    try:
        result = run_voice_embedding(
            audio_path=args.audio_path,
            segments_json_path=args.segments_json,
        )
        _json_ok(result)
    except Exception as e:
        _json_err(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
