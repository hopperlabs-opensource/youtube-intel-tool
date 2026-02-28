"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiFetch,
  clearStoredOpenAIKey,
  getStoredOpenAIKey,
  hasStoredOpenAIKey,
  saveStoredOpenAIKey,
} from "@/lib/openai_key";

type SettingsStatusResponse = {
  openai: {
    env_available: boolean;
    request_key_provided: boolean;
    effective_source: "env" | "header" | "none";
  };
  embeddings: {
    enabled: boolean;
    provider: string | null;
    model_id: string | null;
    dimensions: number | null;
    reason: string | null;
  };
};

function sourceLabel(source: "env" | "header" | "none"): string {
  if (source === "env") return ".env (server)";
  if (source === "header") return "browser key (request header)";
  return "none";
}

export function SettingsButton() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState(() => getStoredOpenAIKey());
  const [showKey, setShowKey] = useState(false);
  const [savedInBrowser, setSavedInBrowser] = useState(() => hasStoredOpenAIKey());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const statusQ = useQuery({
    queryKey: ["settingsOpenAIStatus", savedInBrowser],
    enabled: open,
    queryFn: async () => {
      const res = await apiFetch("/api/settings/openai");
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as SettingsStatusResponse;
    },
  });

  const sourceText = useMemo(() => {
    const source = statusQ.data?.openai.effective_source ?? "none";
    return sourceLabel(source);
  }, [statusQ.data?.openai.effective_source]);

  function refreshDependents() {
    void queryClient.invalidateQueries({ queryKey: ["capabilities"] });
    void queryClient.invalidateQueries({ queryKey: ["settingsOpenAIStatus"] });
  }

  function saveKey() {
    saveStoredOpenAIKey(draftKey);
    const hasKey = hasStoredOpenAIKey();
    setSavedInBrowser(hasKey);
    if (!hasKey) setDraftKey("");
    setSaveMessage(hasKey ? "Saved to this browser profile." : "Stored key cleared.");
    refreshDependents();
    void statusQ.refetch();
  }

  function clearKey() {
    clearStoredOpenAIKey();
    setSavedInBrowser(false);
    setDraftKey("");
    setSaveMessage("Stored key cleared.");
    refreshDependents();
    void statusQ.refetch();
  }

  function openModal() {
    const saved = getStoredOpenAIKey();
    setDraftKey(saved);
    setSavedInBrowser(Boolean(saved));
    setSaveMessage(null);
    setOpen(true);
  }

  return (
    <>
      <button
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        onClick={openModal}
        title="Open settings"
      >
        Settings
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close settings modal"
            onClick={() => setOpen(false)}
          />

          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Settings</h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Configure optional OpenAI key behavior for browser-driven semantic features.
                </p>
              </div>
              <button
                className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-800">OpenAI Key Status</div>
              {statusQ.isPending && <div className="mt-2 text-zinc-500">Checking status...</div>}
              {statusQ.isError && (
                <div className="mt-2 text-red-700">Could not load key status: {String(statusQ.error.message || "")}</div>
              )}
              {!statusQ.isPending && !statusQ.isError && (
                <div className="mt-2 grid gap-1">
                  <div>
                    Server `.env` key:{" "}
                    <span className={statusQ.data?.openai.env_available ? "text-emerald-700" : "text-amber-800"}>
                      {statusQ.data?.openai.env_available ? "available" : "missing"}
                    </span>
                  </div>
                  <div>
                    Browser key: <span className={savedInBrowser ? "text-emerald-700" : "text-zinc-600"}>{savedInBrowser ? "saved" : "not saved"}</span>
                  </div>
                  <div>
                    Active key source: <span className="font-medium text-zinc-900">{sourceText}</span>
                  </div>
                  <div>
                    Embeddings:{" "}
                    <span className={statusQ.data?.embeddings.enabled ? "text-emerald-700" : "text-amber-800"}>
                      {statusQ.data?.embeddings.enabled ? "enabled" : "disabled"}
                    </span>
                    {statusQ.data?.embeddings.reason ? ` (${statusQ.data.embeddings.reason})` : ""}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 p-3">
              <div className="text-xs font-semibold text-zinc-800">Saved Browser Key</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type={showKey ? "text" : "password"}
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  placeholder="sk-..."
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800"
                  onClick={saveKey}
                >
                  Save in Browser
                </button>
                <button
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={clearKey}
                >
                  Clear Saved Key
                </button>
                {saveMessage && <span className="text-xs text-zinc-600">{saveMessage}</span>}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <div className="font-semibold">How this works and risks</div>
              <div className="mt-1">
                If `OPENAI_API_KEY` is set in server `.env`, that key is always used first. If not, this app can send your
                saved browser key in `x-openai-api-key` to local `/api/*` routes for embeddings-backed requests.
              </div>
              <div className="mt-1">
                Browser-saved keys live in `localStorage` as plaintext for this browser profile. Any script running in this
                origin, browser extensions, malware, or other users on the same OS account could read it.
              </div>
              <div className="mt-1">
                Do not use this storage mode on shared/untrusted machines. Prefer server `.env` for stronger isolation.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
