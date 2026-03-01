import { NextResponse } from "next/server";
import {
  SAFETY_ACK_COOKIE_NAME,
  SAFETY_ACK_COOKIE_VALUE,
  SAFETY_ACK_MAX_AGE_SECONDS,
} from "@/lib/safety_ack";

function resolveReturnUrl(request: Request, requested: string | null): URL {
  const current = new URL(request.url);

  if (requested) {
    try {
      if (requested.startsWith("/")) return new URL(requested, current.origin);
      const parsed = new URL(requested);
      if (parsed.origin === current.origin) return parsed;
    } catch {
      // Fall back below.
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const parsedReferer = new URL(referer);
      if (parsedReferer.origin === current.origin) return parsedReferer;
    } catch {
      // Fall back below.
    }
  }

  return new URL("/", current.origin);
}

function buildAckResponse(target: URL): NextResponse {
  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set({
    name: SAFETY_ACK_COOKIE_NAME,
    value: SAFETY_ACK_COOKIE_VALUE,
    maxAge: SAFETY_ACK_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
  });
  return response;
}

export async function POST(request: Request) {
  let returnTo: string | null = null;

  try {
    const formData = await request.formData();
    const raw = formData.get("return_to");
    if (typeof raw === "string" && raw.length > 0) returnTo = raw;
  } catch {
    // Fall back to referer/root.
  }

  return buildAckResponse(resolveReturnUrl(request, returnTo));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return buildAckResponse(resolveReturnUrl(request, url.searchParams.get("return_to")));
}
