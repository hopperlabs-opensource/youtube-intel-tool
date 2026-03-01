"use client";

import { useState } from "react";

const KEY = "yit:karaoke:safety_ack_v1";

function readAck(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function writeAck(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Ignore blocked storage.
  }
}

export function SafetyGate() {
  const [accepted, setAccepted] = useState<boolean>(() => readAck());
  const [localOnly, setLocalOnly] = useState(false);
  const [risk, setRisk] = useState(false);

  if (accepted) return null;

  const canAccept = localOnly && risk;

  return (
    <div className="safety-overlay">
      <div className="safety-modal">
        <h2>Local-Only Security Notice</h2>
        <p>
          Eureka Karaoke Tube is intended for local/self-hosted personal use. It is not hardened for direct public
          internet exposure.
        </p>
        <p>
          If you expose this publicly, you must add your own auth, TLS/reverse proxy, rate limits, CORS controls,
          secrets management, and abuse protection.
        </p>
        <label>
          <input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.currentTarget.checked)} /> I
          understand this is local-use software.
        </label>
        <label>
          <input type="checkbox" checked={risk} onChange={(e) => setRisk(e.currentTarget.checked)} /> I understand
          public exposure without hardening can leak data and allow abuse.
        </label>
        <button
          disabled={!canAccept}
          onClick={() => {
            writeAck();
            setAccepted(true);
          }}
        >
          I Understand and Accept
        </button>
      </div>
    </div>
  );
}
