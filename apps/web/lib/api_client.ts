"use client";

import { createYitClient, YitApiError, type YitClient } from "@yt/sdk";
import { apiFetch } from "@/lib/openai_key";

let client: YitClient | null = null;

function getBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://localhost:48333";
}

export function getApiClient(): YitClient {
  if (client) return client;
  client = createYitClient({
    baseUrl: getBaseUrl(),
    fetch: (input, init) => apiFetch(input, init),
  });
  return client;
}

export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof YitApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}
