"use client";

import { useState } from "react";

const ACK_VERSION = 1;
const ACK_KEY = `yit:safety_notice_ack_v${ACK_VERSION}`;

function loadAck(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { accepted?: boolean } | null;
    return Boolean(parsed?.accepted);
  } catch {
    return false;
  }
}

function saveAck(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      ACK_KEY,
      JSON.stringify({
        accepted: true,
        accepted_at: new Date().toISOString(),
        version: ACK_VERSION,
      })
    );
  } catch {
    // Ignore localStorage write failures.
  }
}

export function SafetyNoticeGate() {
  const [accepted, setAccepted] = useState(() => loadAck());
  const [localOnlyChecked, setLocalOnlyChecked] = useState(false);
  const [riskChecked, setRiskChecked] = useState(false);

  if (accepted) return null;

  const canAccept = localOnlyChecked && riskChecked;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-amber-300 bg-white p-6 shadow-2xl">
        <div className="text-lg font-semibold text-zinc-900">Local-Only Security Notice</div>
        <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
          <p>
            This project is for local/self-hosted personal use. It is <span className="font-semibold">not hardened</span>{" "}
            for exposing directly to the public internet.
          </p>
          <p>
            Public exposure risks include: unauthenticated API access, transcript/chat data leakage, key/header
            leakage, queue abuse, and cost/compute abuse.
          </p>
          <p>
            If you want internet-facing deployment, you must add your own auth, TLS/reverse proxy, rate limits, CORS
            restrictions, secret management, and operational monitoring.
          </p>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <label className="flex items-start gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={localOnlyChecked}
              onChange={(e) => setLocalOnlyChecked(e.target.checked)}
              className="mt-1"
            />
            <span>I understand this tool is intended for local/self-hosted use, not public internet serving.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={riskChecked}
              onChange={(e) => setRiskChecked(e.target.checked)}
              className="mt-1"
            />
            <span>I understand public exposure without hardening can leak data or keys and allow abuse.</span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canAccept}
            onClick={() => {
              saveAck();
              setAccepted(true);
            }}
          >
            I Understand and Accept
          </button>
        </div>
      </div>
    </div>
  );
}

