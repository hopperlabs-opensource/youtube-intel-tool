import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../types";
import { parseVisionResponse } from "../prompt";

export interface ClaudeVisionOpts {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function createClaudeVisionProvider(opts: ClaudeVisionOpts): VisionProviderAdapter {
  const model = opts.model || "claude-sonnet-4-20250514";
  const baseUrl = (opts.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");

  return {
    name: "claude",
    model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: req.mimeType,
                    data: req.imageBase64,
                  },
                },
                { type: "text", text: req.prompt },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Claude vision API error ${res.status}: ${text}`);
      }

      const body: any = await res.json();
      const text =
        body.content?.find((c: any) => c.type === "text")?.text || "";
      const parsed = parseVisionResponse(text);

      return {
        description: parsed.description,
        objects: parsed.objects,
        textOverlay: parsed.textOverlay,
        sceneType: parsed.sceneType as VisionResponse["sceneType"],
        promptTokens: body.usage?.input_tokens ?? null,
        completionTokens: body.usage?.output_tokens ?? null,
        raw: body,
      };
    },
  };
}
