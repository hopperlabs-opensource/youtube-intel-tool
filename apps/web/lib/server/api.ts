import { NextResponse } from "next/server";

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

