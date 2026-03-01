import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../types";
import { parseVisionResponse } from "../prompt";

export interface OllamaVisionOpts {
  model?: string;
  baseUrl?: string;
}

export function createOllamaVisionProvider(opts?: OllamaVisionOpts): VisionProviderAdapter {
  const model = opts?.model || "llava";
  const baseUrl = (opts?.baseUrl || "http://localhost:11434").replace(/\/$/, "");

  return {
    name: "ollama",
    model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          images: [req.imageBase64],
          stream: false,
          options: {
            temperature: req.temperature,
            num_predict: req.maxTokens,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ollama vision API error ${res.status}: ${text}`);
      }

      const body: any = await res.json();
      const text = body.response || "";
      const parsed = parseVisionResponse(text);

      return {
        description: parsed.description,
        objects: parsed.objects,
        textOverlay: parsed.textOverlay,
        sceneType: parsed.sceneType as VisionResponse["sceneType"],
        promptTokens: body.prompt_eval_count ?? null,
        completionTokens: body.eval_count ?? null,
        raw: body,
      };
    },
  };
}
