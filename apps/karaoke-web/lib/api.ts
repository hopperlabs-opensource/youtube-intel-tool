"use client";

import { createYitClient, type YitClient } from "@yt/sdk";

let client: YitClient | null = null;

function getBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return process.env.NEXT_PUBLIC_KARAOKE_BASE_URL || "http://localhost:48334";
}

export function getApiClient(): YitClient {
  if (client) return client;
  client = createYitClient({ baseUrl: getBaseUrl() });
  return client;
}
