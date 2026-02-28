import { getEmbeddingsStatus, initMetrics } from "@yt/core";
import { CapabilitiesResponseSchema } from "@yt/contracts";
import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function cmdExists(cmd: string): boolean {
  const res = spawnSync("bash", ["-lc", `command -v ${cmd} >/dev/null 2>&1`], { stdio: "ignore" });
  return res.status === 0;
}

export async function GET() {
  const metrics = initMetrics();
  try {
    const tools = {
      yt_dlp: cmdExists("yt-dlp"),
      ffmpeg: cmdExists("ffmpeg"),
      python: cmdExists(clean(process.env.YIT_PYTHON_BIN) || "python3"),
    };

    const cli = {
      gemini: cmdExists("gemini"),
      claude: cmdExists("claude"),
      codex: cmdExists("codex"),
      default_provider: clean(process.env.YIT_CHAT_CLI_PROVIDER || "") || null,
    };

    const embeddings = (() => {
      const e = getEmbeddingsStatus(process.env);
      return { ...e };
    })();
    if (embeddings.enabled && embeddings.provider === "ollama") {
      const baseUrl = clean(process.env.OLLAMA_BASE_URL) || "http://127.0.0.1:11434";
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(500) });
        if (!res.ok) {
          embeddings.enabled = false;
          embeddings.reason = `ollama not healthy (${res.status})`;
        }
      } catch {
        embeddings.enabled = false;
        embeddings.reason = `ollama not reachable`;
      }
    }

    const sttProvider = clean(process.env.YIT_STT_PROVIDER).toLowerCase();
    const sttModel = clean(process.env.YIT_OPENAI_STT_MODEL) || "whisper-1";
    const stt = (() => {
      if (!sttProvider) return { enabled: false, provider: null, model_id: null, reason: "stt disabled" };
      if (sttProvider === "mock") return { enabled: true, provider: "mock", model_id: "mock", reason: null };
      if (sttProvider === "openai") {
        const apiKey = clean(process.env.OPENAI_API_KEY);
        if (!apiKey) return { enabled: false, provider: "openai", model_id: null, reason: "OPENAI_API_KEY not set" };
        if (!tools.yt_dlp) return { enabled: false, provider: "openai", model_id: null, reason: "yt-dlp not installed" };
        if (!tools.ffmpeg) return { enabled: false, provider: "openai", model_id: null, reason: "ffmpeg not installed" };
        if (!cmdExists("curl")) return { enabled: false, provider: "openai", model_id: null, reason: "curl not installed" };
        return { enabled: true, provider: "openai", model_id: sttModel, reason: null };
      }
      return { enabled: false, provider: sttProvider, model_id: null, reason: `unknown stt provider '${sttProvider}'` };
    })();

    const diarizeBackend = clean(process.env.YIT_DIARIZE_BACKEND).toLowerCase();
    const diarization = (() => {
      if (!diarizeBackend) return { enabled: false, backend: null, reason: "diarization disabled" };
      if (diarizeBackend === "mock") return { enabled: true, backend: "mock", reason: null };
      if (diarizeBackend === "pyannote") {
        const hf = clean(process.env.YIT_HF_TOKEN || process.env.HUGGINGFACE_TOKEN);
        if (!tools.yt_dlp) return { enabled: false, backend: "pyannote", reason: "yt-dlp not installed" };
        if (!tools.ffmpeg) return { enabled: false, backend: "pyannote", reason: "ffmpeg not installed" };
        if (!tools.python) return { enabled: false, backend: "pyannote", reason: "python not installed" };
        if (!hf) return { enabled: false, backend: "pyannote", reason: "YIT_HF_TOKEN not set" };
        return { enabled: true, backend: "pyannote", reason: null };
      }
      return { enabled: false, backend: diarizeBackend, reason: `unknown diarization backend '${diarizeBackend}'` };
    })();

    metrics.httpRequestsTotal.inc({ route: "/api/capabilities", method: "GET", status: "200" });
    return NextResponse.json(
      CapabilitiesResponseSchema.parse({
        embeddings,
        stt,
        diarization,
        cli,
        tools,
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    metrics.httpRequestsTotal.inc({ route: "/api/capabilities", method: "GET", status: "400" });
    return NextResponse.json({ error: { code: "capabilities_failed", message: msg } }, { status: 400 });
  }
}
