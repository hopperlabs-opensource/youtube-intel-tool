"use client";

export const OPENAI_KEY_HEADER = "x-openai-api-key";
const OPENAI_KEY_STORAGE_KEY = "yit:openai_api_key";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getStoredOpenAIKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return clean(localStorage.getItem(OPENAI_KEY_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function hasStoredOpenAIKey(): boolean {
  return Boolean(getStoredOpenAIKey());
}

export function saveStoredOpenAIKey(value: string): void {
  if (typeof window === "undefined") return;
  const key = clean(value);
  try {
    if (!key) localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
    else localStorage.setItem(OPENAI_KEY_STORAGE_KEY, key);
  } catch {
    // Ignore browser storage failures (private mode/quota/etc).
  }
}

export function clearStoredOpenAIKey(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
  } catch {
    // Ignore browser storage failures.
  }
}

export function withOptionalOpenAIKey(headersInit?: HeadersInit): Headers {
  const headers = new Headers(headersInit);
  const key = getStoredOpenAIKey();
  if (key) headers.set(OPENAI_KEY_HEADER, key);
  return headers;
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withOptionalOpenAIKey(init.headers),
  });
}

