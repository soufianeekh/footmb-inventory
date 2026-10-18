import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, type UserRole } from "./permissions";

describe("role permissions", () => {
  const roles: UserRole[] = ["builder", "admin", "editor", "reader"];

  it("defines an authorization result for every permission and role", () => {
    for (const role of roles) {
      for (const permission of PERMISSIONS) {
        expect(typeof hasPermission(role, permission)).toBe("boolean");
      }
    }
  });

  it("grants the Builder every declared permission", () => {
    for (const permission of PERMISSIONS) expect(hasPermission("builder", permission)).toBe(true);
  });

  it("lets Admin operate and inspect staff activity without managing accounts", () => {
    expect(hasPermission("admin", "pos.adjust")).toBe(true);
    expect(hasPermission("admin", "statistics.read")).toBe(true);
    expect(hasPermission("admin", "staff.activity.read")).toBe(true);
    expect(hasPermission("admin", "staff.manage")).toBe(false);
    expect(hasPermission("admin", "settings.manage")).toBe(false);
  });

  it("keeps readers read-only", () => {
    expect(hasPermission("reader", "inventory.read")).toBe(true);
    expect(hasPermission("reader", "pos.adjust")).toBe(false);
    expect(hasPermission("reader", "pos.read")).toBe(false);
    expect(hasPermission("reader", "statistics.read")).toBe(false);
    expect(hasPermission("reader", "staff.manage")).toBe(false);
  });

  it("allows editors to operate stock without managing staff", () => {
    expect(hasPermission("editor", "pos.adjust")).toBe(true);
    expect(hasPermission("editor", "inventory.verify")).toBe(true);
    expect(hasPermission("editor", "staff.manage")).toBe(false);
  });

});

