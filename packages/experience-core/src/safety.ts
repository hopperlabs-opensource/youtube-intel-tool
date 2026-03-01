export const SAFETY_ACK_VERSION = 1;
export const SAFETY_ACK_KEY = `yit:safety_notice_ack_v${SAFETY_ACK_VERSION}`;
export const SAFETY_ACK_COOKIE_NAME = `yit_safety_ack_v${SAFETY_ACK_VERSION}`;
export const SAFETY_ACK_COOKIE_VALUE = "1";
export const SAFETY_ACK_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type SafetyStorageSupport = {
  localStorage: boolean;
  cookies: boolean;
};

export function readSafetyAckFromCookie(doc: Document = document): boolean {
  try {
    const needle = `${SAFETY_ACK_COOKIE_NAME}=${SAFETY_ACK_COOKIE_VALUE}`;
    return doc.cookie
      .split(";")
      .map((part) => part.trim())
      .some((part) => part === needle);
  } catch {
    return false;
  }
}

export function loadSafetyAck(win: Window = window): boolean {
  const cookieAck = readSafetyAckFromCookie(win.document);
  try {
    const raw = win.localStorage.getItem(SAFETY_ACK_KEY);
    if (!raw) return cookieAck;
    const parsed = JSON.parse(raw) as { accepted?: boolean } | null;
    return Boolean(parsed?.accepted) || cookieAck;
  } catch {
    return cookieAck;
  }
}

export function saveSafetyAck(win: Window = window): void {
  const payload = JSON.stringify({
    accepted: true,
    accepted_at: new Date().toISOString(),
    version: SAFETY_ACK_VERSION,
  });

  try {
    win.localStorage.setItem(SAFETY_ACK_KEY, payload);
  } catch {
    // Ignore storage failures.
  }

  try {
    win.document.cookie = `${SAFETY_ACK_COOKIE_NAME}=${SAFETY_ACK_COOKIE_VALUE}; Max-Age=${SAFETY_ACK_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie failures.
  }
}

export function detectSafetyStorageSupport(win: Window = window): SafetyStorageSupport {
  let localStorageOk = false;
  let cookiesOk = false;

  try {
    const probeKey = `${SAFETY_ACK_KEY}:probe`;
    win.localStorage.setItem(probeKey, "1");
    win.localStorage.removeItem(probeKey);
    localStorageOk = true;
  } catch {
    localStorageOk = false;
  }

  try {
    const probeName = "yit_safety_probe";
    win.document.cookie = `${probeName}=1; Max-Age=60; Path=/; SameSite=Lax`;
    cookiesOk = win.document.cookie.includes(`${probeName}=1`);
    win.document.cookie = `${probeName}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    cookiesOk = false;
  }

  return { localStorage: localStorageOk, cookies: cookiesOk };
}

export function computeSafetyBypassDelayMs(rawValue: string | undefined): number {
  const configuredDelay = Number(rawValue ?? "8000");
  if (!Number.isFinite(configuredDelay)) return 8000;
  return Math.max(2000, Math.floor(configuredDelay));
}
