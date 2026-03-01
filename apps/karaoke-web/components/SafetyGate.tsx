"use client";

import { useEffect, useState } from "react";
import {
  computeSafetyBypassDelayMs,
  detectSafetyStorageSupport,
  loadSafetyAck,
  saveSafetyAck,
  type SafetyStorageSupport,
} from "@yt/experience-core";

type SafetyGateProps = {
  initialAccepted: boolean;
};

export function SafetyGate({ initialAccepted }: SafetyGateProps) {
  const [accepted, setAccepted] = useState<boolean>(() => initialAccepted || (typeof window !== "undefined" ? loadSafetyAck() : false));
  const [localOnly, setLocalOnly] = useState(false);
  const [risk, setRisk] = useState(false);
  const [storageSupport] = useState<SafetyStorageSupport>(() =>
    typeof window !== "undefined" ? detectSafetyStorageSupport() : { localStorage: false, cookies: false }
  );
  const [showBypass, setShowBypass] = useState(false);

  useEffect(() => {
    const bypassDelayMs = computeSafetyBypassDelayMs(process.env.NEXT_PUBLIC_YIT_SAFETY_BYPASS_DELAY_MS);
    const timer = window.setTimeout(() => setShowBypass(true), bypassDelayMs);
    return () => window.clearTimeout(timer);
  }, []);

  if (accepted) return null;

  const canAccept = localOnly && risk;
  const storageLikelyBlocked = Boolean(storageSupport && !storageSupport.localStorage && !storageSupport.cookies);

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
        <p>If controls look stuck in Brave, disable Shields/extensions for localhost and hard refresh.</p>
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
            saveSafetyAck();
            setAccepted(true);
          }}
        >
          I Understand and Accept
        </button>

        {storageLikelyBlocked ? (
          <p className="safety-note">Browser storage appears blocked. Acknowledgement may not persist on reload.</p>
        ) : null}

        <details className="safety-fallback">
          <summary>Button stuck in Brave/extension-heavy browsers?</summary>
          <p>Use fallback accept to set the same acknowledgement cookie and reload this page.</p>
          <form method="post" action="/api/safety-ack">
            <button type="submit">Accept via Fallback Reload</button>
          </form>
        </details>

        {showBypass ? (
          <p className="safety-note">
            Fallback: if browser protections prevent this gate from working, continue in non-blocking mode for this
            session.
            <button
              type="button"
              className="safety-bypass"
              onClick={() => {
                setAccepted(true);
              }}
            >
              Continue Without Gate (This Session)
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
