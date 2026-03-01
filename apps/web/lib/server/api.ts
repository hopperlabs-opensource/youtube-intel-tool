import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(
  code: string,
  message: string,
  opts?: { status?: number; details?: unknown }
) {
  return NextResponse.json(
    { error: { code, message, details: opts?.details } },
    { status: opts?.status ?? 400 }
  );
}

type ClassifiedApiError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

function cleanMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const trimmed = raw.trim();
  return trimmed || "unknown_error";
}

function looksLikeInvalidUrlError(err: unknown, message: string): boolean {
  if (!(err instanceof Error)) return false;
  const lowered = message.toLowerCase();
  if (lowered.includes("invalid url")) return true;
  if (lowered.includes("failed to parse url")) return true;
  if (err.name === "TypeError" && lowered.includes("url")) return true;
  return false;
}

function looksLikeJsonParseError(err: unknown, message: string): boolean {
  if (!(err instanceof Error)) return false;
  if (!(err instanceof SyntaxError)) return false;
  const lowered = message.toLowerCase();
  return lowered.includes("json") || lowered.includes("unexpected token");
}

export function classifyApiError(err: unknown): ClassifiedApiError {
  const message = cleanMessage(err);

  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "invalid_request",
      message,
      details: err.issues,
    };
  }

  if (looksLikeJsonParseError(err, message) || looksLikeInvalidUrlError(err, message)) {
    return {
      status: 400,
      code: "invalid_request",
      message,
    };
  }

  return {
    status: 500,
    code: "internal_error",
    message,
  };
}
