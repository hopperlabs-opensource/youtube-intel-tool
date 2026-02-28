export const OPENAI_KEY_HEADER = "x-openai-api-key";

type OpenAIKeySource = "env" | "header" | "none";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getOpenAIKeySourceForRequest(req: Request): {
  envAvailable: boolean;
  headerProvided: boolean;
  effectiveSource: OpenAIKeySource;
} {
  const envKey = clean(process.env.OPENAI_API_KEY);
  const headerKey = clean(req.headers.get(OPENAI_KEY_HEADER));

  if (envKey) {
    return { envAvailable: true, headerProvided: Boolean(headerKey), effectiveSource: "env" };
  }
  if (headerKey) {
    return { envAvailable: false, headerProvided: true, effectiveSource: "header" };
  }
  return { envAvailable: false, headerProvided: false, effectiveSource: "none" };
}

export function getEmbeddingsEnvForRequest(req: Request): Record<string, string | undefined> {
  const source = getOpenAIKeySourceForRequest(req);
  if (source.effectiveSource !== "header") return process.env;
  const headerKey = clean(req.headers.get(OPENAI_KEY_HEADER));
  return { ...process.env, OPENAI_API_KEY: headerKey };
}

