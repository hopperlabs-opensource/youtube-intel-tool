import type { DetectedObject, SceneType } from "@yt/contracts";

export interface VisionRequest {
  /** Base64-encoded image data */
  imageBase64: string;
  /** MIME type of the image */
  mimeType: "image/jpeg" | "image/png";
  /** System/user prompt instructing the model */
  prompt: string;
  /** Max tokens for the response */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
}

export interface VisionResponse {
  description: string;
  objects: DetectedObject[];
  textOverlay: string | null;
  sceneType: SceneType | null;
  promptTokens: number | null;
  completionTokens: number | null;
  raw?: unknown;
}

export interface VisionProviderAdapter {
  readonly name: string;
  readonly model: string;
  analyze(req: VisionRequest): Promise<VisionResponse>;
}
