import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../types";
import { parseVisionResponse } from "../prompt";

export interface OpenAIVisionOpts {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function createOpenAIVisionProvider(opts: OpenAIVisionOpts): VisionProviderAdapter {
  const model = opts.model || "gpt-4o";
  const baseUrl = (opts.baseUrl || "https://api.openai.com").replace(/\/$/, "");

  return {
    name: "openai",
    model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      const dataUri = `data:${req.mimeType};base64,${req.imageBase64}`;

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: dataUri, detail: "high" } },
                { type: "text", text: req.prompt },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OpenAI vision API error ${res.status}: ${text}`);
      }

      const body: any = await res.json();
      const text = body.choices?.[0]?.message?.content || "";
      const parsed = parseVisionResponse(text);

      return {
        description: parsed.description,
        objects: parsed.objects,
        textOverlay: parsed.textOverlay,
        sceneType: parsed.sceneType as VisionResponse["sceneType"],
        promptTokens: body.usage?.prompt_tokens ?? null,
        completionTokens: body.usage?.completion_tokens ?? null,
        raw: body,
      };
    },
  };
}
