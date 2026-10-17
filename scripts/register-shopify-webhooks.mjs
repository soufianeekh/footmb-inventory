const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-10";
const appUrl = (process.env.PUBLIC_APP_URL || process.env.URL || "").replace(/\/$/, "");

if (!shop || !clientId || !clientSecret || !appUrl) {
  throw new Error(
    "SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and PUBLIC_APP_URL (or Netlify URL) are required.",
  );
}

const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  }),
});
if (!tokenResponse.ok) throw new Error(`Shopify authentication failed (${tokenResponse.status})`);
const { access_token: accessToken } = await tokenResponse.json();
if (!accessToken) throw new Error("Shopify did not return an access token");

async function graphql(query, variables = {}) {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(body.errors?.map((error) => error.message).join("; ") || `GraphQL failed (${response.status})`);
  }
  return body.data;
}

const endpoint = `${appUrl}/api/webhooks/shopify`;
const required = [
  "INVENTORY_LEVELS_UPDATE",
  "INVENTORY_LEVELS_CONNECT",
  "INVENTORY_LEVELS_DISCONNECT",
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
];
const existingData = await graphql(`query ExistingWebhooks {
  webhookSubscriptions(first: 250) { nodes { id topic uri } }
}`);
const existing = existingData.webhookSubscriptions.nodes;
const mutation = `mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $uri: URL!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}`;

for (const topic of required) {
  if (existing.some((subscription) => subscription.topic === topic && subscription.uri === endpoint)) {
    console.log(`kept ${topic}`);
    continue;
  }
  const data = await graphql(mutation, { topic, uri: endpoint });
  const errors = data.webhookSubscriptionCreate.userErrors;
  if (errors.length) throw new Error(`${topic}: ${errors.map((error) => error.message).join("; ")}`);
  console.log(`created ${topic}`);
}
