export const SESSION_IDLE_MAX_AGE_SECONDS = 60 * 60 * 12;
export const SESSION_RENEWAL_INTERVAL_SECONDS = 60 * 30;
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 60 * 60 * 16;

const ALLOWED_CALLBACK_PATH = /^\/(?:inventory(?:\/[A-Za-z0-9_-]+)?|pos|stats|activity|settings|users|client-notif|notepad)?$/;

export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const url = new URL(value, "https://footmb.invalid");
    if (url.origin !== "https://footmb.invalid" || !ALLOWED_CALLBACK_PATH.test(url.pathname)) return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

export function classifyInventoryResponse(status: number): "authentication" | "retryable" | "terminal" | "success" {
  if (status === 401) return "authentication";
  if ([429, 500, 502, 503, 504].includes(status)) return "retryable";
  if (status >= 200 && status < 300) return "success";
  return "terminal";
}

export function resolveSessionStartedAt(
  currentValue: unknown,
  issuedAtSeconds: unknown,
  now = Date.now(),
): number {
  if (typeof currentValue === "number" && Number.isFinite(currentValue) && currentValue > 0) {
    return currentValue;
  }
  if (typeof issuedAtSeconds === "number" && Number.isFinite(issuedAtSeconds) && issuedAtSeconds > 0) {
    return issuedAtSeconds * 1_000;
  }
  return now;
}

export function hasSessionExceededAbsoluteAge(startedAt: number, now = Date.now()): boolean {
  return now - startedAt >= SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1_000;
}
