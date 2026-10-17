import { after, NextResponse } from "next/server";
import { assertProductionSyncConfiguration } from "@/lib/sync/config";
import { enqueueWebhook } from "@/lib/sync/store";
import {
  MAX_WEBHOOK_BYTES,
  parseWebhook,
  verifyWebhookSignature,
} from "@/lib/sync/webhook";
import { processInventoryQueue } from "@/lib/sync/worker";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const signature = request.headers.get("x-shopify-hmac-sha256") || "";
  const secret = process.env.SHOPIFY_CLIENT_SECRET || "";
  if (!verifyWebhookSignature(raw, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    assertProductionSyncConfiguration();
    const event = parseWebhook(raw, request.headers);
    const enqueued = await enqueueWebhook(event);
    if (enqueued) {
      after(async () => {
        await processInventoryQueue(20);
      });
    }
    return NextResponse.json(
      { accepted: true, duplicate: !enqueued },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    const unavailable = /Redis|required|configuration|credentials/i.test(message);
    return NextResponse.json({ error: message }, { status: unavailable ? 503 : 400 });
  }
}
