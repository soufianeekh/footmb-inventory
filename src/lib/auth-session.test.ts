import { describe, expect, it } from "vitest";
import {
  classifyInventoryResponse,
  hasSessionExceededAbsoluteAge,
  resolveSessionStartedAt,
  safeCallbackPath,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
} from "./auth-session";
import { shouldCheckInventoryVersion } from "./sync/client-poll";

describe("expired authentication handling", () => {
  it("distinguishes authentication failures from sync infrastructure failures", () => {
    expect(classifyInventoryResponse(401)).toBe("authentication");
    expect(classifyInventoryResponse(503)).toBe("retryable");
    expect(classifyInventoryResponse(429)).toBe("retryable");
    expect(classifyInventoryResponse(403)).toBe("terminal");
    expect(classifyInventoryResponse(200)).toBe("success");
  });

  it("cancels future revision checks after authentication expires", () => {
    expect(shouldCheckInventoryVersion("visible", false, false)).toBe(true);
    expect(shouldCheckInventoryVersion("visible", false, true)).toBe(false);
    expect(shouldCheckInventoryVersion("hidden", false, false)).toBe(false);
  });

  it("preserves a safe intended page through reauthentication", () => {
    expect(safeCallbackPath("/inventory?q=phantom&status=low")).toBe("/inventory?q=phantom&status=low");
    expect(safeCallbackPath("/inventory/12345")).toBe("/inventory/12345");
    expect(safeCallbackPath("https://attacker.example/inventory")).toBe("/");
    expect(safeCallbackPath("//attacker.example/inventory")).toBe("/");
    expect(safeCallbackPath("/api/inventory")).toBe("/");
    expect(safeCallbackPath("/login?callbackUrl=%2Fusers")).toBe("/");
  });

  it("migrates existing JWTs without making current sessions permanent", () => {
    const now = Date.UTC(2026, 9, 18, 12);
    const recentIssuedAt = now / 1_000 - 60 * 60;
    const migrated = resolveSessionStartedAt(undefined, recentIssuedAt, now);
    expect(migrated).toBe(recentIssuedAt * 1_000);
    expect(hasSessionExceededAbsoluteAge(migrated, now)).toBe(false);
    expect(
      hasSessionExceededAbsoluteAge(
        now - SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1_000,
        now,
      ),
    ).toBe(true);
    expect(resolveSessionStartedAt(undefined, undefined, now)).toBe(now);
  });
});
