"use client";

import { useEffect, useState } from "react";
import {
  computeSafetyBypassDelayMs,
  detectSafetyStorageSupport,
  loadSafetyAck,
  saveSafetyAck,
  type SafetyStorageSupport,
} from "@yt/experience-core";

type SafetyNoticeGateProps = {
  initialAccepted: boolean;
};

export function SafetyNoticeGate({ initialAccepted }: SafetyNoticeGateProps) {
  const [accepted, setAccepted] = useState(() => initialAccepted || (typeof window !== "undefined" ? loadSafetyAck() : false));
  const [localOnlyChecked, setLocalOnlyChecked] = useState(false);
  const [riskChecked, setRiskChecked] = useState(false);
  const [storageSupport] = useState<SafetyStorageSupport>(() =>
    typeof window !== "undefined" ? detectSafetyStorageSupport() : { localStorage: false, cookies: false }
  );
  const [showBypass, setShowBypass] = useState(false);

  const canAccept = localOnlyChecked && riskChecked;

  useEffect(() => {
    const bypassDelayMs = computeSafetyBypassDelayMs(process.env.NEXT_PUBLIC_YIT_SAFETY_BYPASS_DELAY_MS);
    const timer = window.setTimeout(() => setShowBypass(true), bypassDelayMs);

    return () => window.clearTimeout(timer);
  }, []);

  if (accepted) return null;

  const storageLikelyBlocked = Boolean(storageSupport && !storageSupport.localStorage && !storageSupport.cookies);

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
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            If controls look stuck in Brave, disable Shields/extensions for <span className="font-medium">localhost</span>{" "}
            and hard refresh.
          </p>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-start gap-2 text-sm text-zinc-800">
            <input
              id="safety-local-only"
              type="checkbox"
              checked={localOnlyChecked}
              onChange={(e) => setLocalOnlyChecked(e.currentTarget.checked)}
              className="mt-1"
            />
            <label htmlFor="safety-local-only" className="cursor-pointer">
              I understand this tool is intended for local/self-hosted use, not public internet serving.
            </label>
          </div>
          <div className="flex items-start gap-2 text-sm text-zinc-800">
            <input
              id="safety-risk"
              type="checkbox"
              checked={riskChecked}
              onChange={(e) => setRiskChecked(e.currentTarget.checked)}
              className="mt-1"
            />
            <label htmlFor="safety-risk" className="cursor-pointer">
              I understand public exposure without hardening can leak data or keys and allow abuse.
            </label>
          </div>
        </div>

        {storageLikelyBlocked ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Browser storage appears blocked. Acknowledgement may not persist across reloads in this profile.
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canAccept}
            onClick={() => {
              saveSafetyAck();
              setAccepted(true);
            }}
          >
            I Understand and Accept
          </button>
        </div>

        <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
          <summary className="cursor-pointer font-medium text-zinc-800">
            Button stuck in Brave/extension-heavy browsers?
          </summary>
          <p className="mt-2">
            Use fallback accept to set the same acknowledgement cookie and reload this page without relying on React
            hydration.
          </p>
          <form method="post" action="/api/safety-ack" className="mt-2">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Accept via Fallback Reload
            </button>
          </form>
        </details>

        {showBypass ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            Fallback: if browser protections prevent this gate from working, continue in non-blocking mode for this
            session.
            <div className="mt-2">
              <button
                type="button"
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                onClick={() => setAccepted(true)}
              >
                Continue Without Gate (This Session)
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
