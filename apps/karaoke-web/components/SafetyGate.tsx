"use client";

import { useEffect, useState } from "react";
import {
  SAFETY_ACK_COOKIE_NAME,
  SAFETY_ACK_COOKIE_VALUE,
  SAFETY_ACK_KEY,
  SAFETY_ACK_VERSION,
} from "@/lib/safety_ack";

const ACK_VERSION = SAFETY_ACK_VERSION;
const ACK_KEY = SAFETY_ACK_KEY;
const ACK_COOKIE_NAME = SAFETY_ACK_COOKIE_NAME;
const ACK_COOKIE_VALUE = SAFETY_ACK_COOKIE_VALUE;

type SafetyGateProps = {
  initialAccepted: boolean;
};

type StorageSupport = {
  localStorage: boolean;
  cookies: boolean;
};

function readAckFromCookie(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const needle = `${ACK_COOKIE_NAME}=${ACK_COOKIE_VALUE}`;
    return document.cookie
      .split(";")
      .map((part) => part.trim())
      .some((part) => part === needle);
  } catch {
    return false;
  }
}

function loadAck(): boolean {
  const cookieAck = readAckFromCookie();
  if (typeof window === "undefined") return cookieAck;

  try {
    const raw = window.localStorage.getItem(ACK_KEY);
    if (!raw) return cookieAck;
    const parsed = JSON.parse(raw) as { accepted?: boolean } | null;
    return Boolean(parsed?.accepted) || cookieAck;
  } catch {
    return cookieAck;
  }
}

function saveAck(): void {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    accepted: true,
    accepted_at: new Date().toISOString(),
    version: ACK_VERSION,
  });

  try {
    window.localStorage.setItem(ACK_KEY, payload);
  } catch {
    // Ignore localStorage failures and continue with cookie fallback.
  }

  try {
    document.cookie = `${ACK_COOKIE_NAME}=${ACK_COOKIE_VALUE}; Max-Age=31536000; Path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie write failures.
  }
}

function detectStorageSupport(): StorageSupport {
  if (typeof window === "undefined") return { localStorage: false, cookies: false };

  let localStorageOk = false;
  let cookiesOk = false;

  try {
    const probeKey = `${ACK_KEY}:probe`;
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    localStorageOk = true;
  } catch {
    localStorageOk = false;
  }

  try {
    const probeName = "yit_safety_probe";
    document.cookie = `${probeName}=1; Max-Age=60; Path=/; SameSite=Lax`;
    cookiesOk = document.cookie.includes(`${probeName}=1`);
    document.cookie = `${probeName}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    cookiesOk = false;
  }

  return { localStorage: localStorageOk, cookies: cookiesOk };
}

export function SafetyGate({ initialAccepted }: SafetyGateProps) {
  const [accepted, setAccepted] = useState<boolean>(() => initialAccepted || loadAck());
  const [localOnly, setLocalOnly] = useState(false);
  const [risk, setRisk] = useState(false);
  const [storageSupport] = useState<StorageSupport>(() => detectStorageSupport());
  const [showBypass, setShowBypass] = useState(false);

  useEffect(() => {
    const configuredDelay = Number(process.env.NEXT_PUBLIC_YIT_SAFETY_BYPASS_DELAY_MS ?? "8000");
    const bypassDelayMs = Number.isFinite(configuredDelay) ? Math.max(2000, Math.floor(configuredDelay)) : 8000;
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
            saveAck();
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
