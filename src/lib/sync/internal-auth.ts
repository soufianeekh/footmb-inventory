import { timingSafeEqual } from "node:crypto";

export function hasInternalAccess(request: Request): boolean {
  const configured = process.env.INVENTORY_SYNC_SECRET || "";
  const supplied =
    request.headers.get("x-footmb-sync-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
