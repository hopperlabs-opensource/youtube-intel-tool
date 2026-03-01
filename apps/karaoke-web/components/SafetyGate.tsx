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
  const [accepted, setAccepted] = useState<boolean>(initialAccepted);
  const [storageSupport, setStorageSupport] = useState<SafetyStorageSupport | null>(null);
  const [showBypass, setShowBypass] = useState(false);

  useEffect(() => {
    if (initialAccepted) return;
    const timer = window.setTimeout(() => {
      if (loadSafetyAck()) {
        setAccepted(true);
        return;
      }
      setStorageSupport(detectSafetyStorageSupport());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialAccepted]);

  useEffect(() => {
    const bypassDelayMs = computeSafetyBypassDelayMs(process.env.NEXT_PUBLIC_YIT_SAFETY_BYPASS_DELAY_MS);
    const timer = window.setTimeout(() => setShowBypass(true), bypassDelayMs);
    return () => window.clearTimeout(timer);
  }, []);

  if (accepted) return null;

  const storageLikelyBlocked = Boolean(storageSupport && !storageSupport.localStorage && !storageSupport.cookies);
  const fallbackUrl = "/api/safety-ack?return_to=/";

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
        <form
          method="get"
          action="/api/safety-ack"
          className="safety-consent-form"
          onSubmit={(e) => {
            if (!e.currentTarget.checkValidity()) return;
            e.preventDefault();
            saveSafetyAck();
            setAccepted(true);
          }}
        >
          <input type="hidden" name="return_to" value="/" />
          <label>
            <input id="karaoke-safety-local" name="local_only_ack" type="checkbox" required />{" "}
            I understand this is local-use software.
          </label>
          <label>
            <input id="karaoke-safety-risk" name="risk_ack" type="checkbox" required />{" "}
            I understand public exposure without hardening can leak data and allow abuse.
          </label>
          <button className="safety-accept-btn" type="submit">
            I Understand and Accept
          </button>
        </form>

        {storageLikelyBlocked ? (
          <p className="safety-note">Browser storage appears blocked. Acknowledgement may not persist on reload.</p>
        ) : null}

        <div className="safety-fallback">
          <p>Button stuck in Brave/extension-heavy browsers? Use fallback accept to set the same cookie and reload.</p>
          <a className="safety-fallback-link" href={fallbackUrl}>
            Accept via Fallback Reload
          </a>
        </div>

        {showBypass ? (
          <div className="safety-note">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
