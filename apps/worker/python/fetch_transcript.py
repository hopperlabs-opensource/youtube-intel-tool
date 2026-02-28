#!/usr/bin/env python3

import argparse
import json
import sys

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except Exception as e:
    print(json.dumps({"ok": False, "error": f"youtube_transcript_api_not_available: {str(e)}"}))
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--lang", default="en")
    args = parser.parse_args()

    video_id = args.video_id
    lang = args.lang

    try:
        ytt = YouTubeTranscriptApi()
        tlist = ytt.list(video_id)
        tr = tlist.find_transcript([lang])
        # This is frequently auto-generated for most public videos.
        data = tr.fetch()
        cues = []
        for snip in data:
            start = float(snip.start)
            dur = float(snip.duration)
            cues.append(
                {
                    "start": start,
                    "duration": dur,
                    "text": snip.text,
                }
            )

        print(
            json.dumps(
                {
                    "ok": True,
                    "language": tr.language_code,
                    "is_generated": bool(tr.is_generated),
                    "cues": cues,
                }
            )
        )
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

