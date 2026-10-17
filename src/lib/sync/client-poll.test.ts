import { describe, expect, it } from "vitest";
import {
  getInventoryPollDelay,
  INVENTORY_HIDDEN_POLL_INTERVAL_MS,
  INVENTORY_MAX_RETRY_DELAY_MS,
  INVENTORY_POLL_INTERVAL_MS,
  shouldCheckInventoryVersion,
  shouldRefreshInventory,
} from "./client-poll";

describe("client revision polling", () => {
  it("pauses checks in hidden tabs and while a snapshot request is active", () => {
    expect(shouldCheckInventoryVersion("hidden", false)).toBe(false);
    expect(shouldCheckInventoryVersion("visible", true)).toBe(false);
    expect(shouldCheckInventoryVersion("visible", false)).toBe(true);
  });

  it("refreshes once only when the server revision advances", () => {
    expect(shouldRefreshInventory(5, 4)).toBe(true);
    expect(shouldRefreshInventory(5, 5)).toBe(false);
    expect(shouldRefreshInventory(4, 5)).toBe(false);
  });

  it("backs off failed checks and uses a reduced hidden-tab cadence", () => {
    expect(getInventoryPollDelay(0, "visible")).toBe(INVENTORY_POLL_INTERVAL_MS);
    expect(getInventoryPollDelay(1, "visible")).toBe(INVENTORY_POLL_INTERVAL_MS * 2);
    expect(getInventoryPollDelay(10, "visible")).toBe(INVENTORY_MAX_RETRY_DELAY_MS);
    expect(getInventoryPollDelay(0, "hidden")).toBe(
      INVENTORY_HIDDEN_POLL_INTERVAL_MS,
    );
  });
});
