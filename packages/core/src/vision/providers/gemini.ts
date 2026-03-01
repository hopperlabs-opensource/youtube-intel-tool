import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../types";
import { parseVisionResponse } from "../prompt";

export interface GeminiVisionOpts {
  apiKey: string;
  model?: string;
}

export function createGeminiVisionProvider(opts: GeminiVisionOpts): VisionProviderAdapter {
  const model = opts.model || "gemini-2.0-flash";

  return {
    name: "gemini",
    model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: req.mimeType,
                    data: req.imageBase64,
                  },
                },
                { text: req.prompt },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: req.maxTokens,
            temperature: req.temperature,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini vision API error ${res.status}: ${text}`);
      }

      const body: any = await res.json();
      const text =
        body.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = parseVisionResponse(text);

      const usage = body.usageMetadata;

      return {
        description: parsed.description,
        objects: parsed.objects,
        textOverlay: parsed.textOverlay,
        sceneType: parsed.sceneType as VisionResponse["sceneType"],
        promptTokens: usage?.promptTokenCount ?? null,
        completionTokens: usage?.candidatesTokenCount ?? null,
        raw: body,
      };
    },
  };
}
