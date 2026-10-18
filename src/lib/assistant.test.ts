import { describe, expect, it } from "vitest";
import {
  assistantReplyDeniesMatches,
  findAssistantProducts,
  getAssistantIntent,
  localAssistantReply,
  toAssistantProduct,
} from "./assistant";
import type { Product } from "./inventory";

const products: Product[] = [
  {
    id: "gid://shopify/Product/1",
    slug: "1",
    model: "Nike Phantom GX Elite",
    image: "https://example.com/phantom.jpg",
    sizes: {
      stockCasa: [
        { size: "42", quantity: 2 },
        { size: "43", quantity: 1 },
      ],
      casa: [{ size: "43", quantity: 3 }],
      tanger: [],
    },
    units: { stockCasa: 3, casa: 3, tanger: 0 },
    total: 6,
    trackedVariants: 2,
    untrackedVariants: 0,
    locationsComplete: true,
  },
  {
    id: "gid://shopify/Product/2",
    slug: "2",
    model: "Real Madrid Home Jersey",
    image: null,
    sizes: {
      stockCasa: [{ size: "M", quantity: 4 }],
      casa: [{ size: "L", quantity: 2 }],
      tanger: [],
    },
    units: { stockCasa: 4, casa: 2, tanger: 0 },
    total: 6,
    trackedVariants: 2,
    untrackedVariants: 0,
    locationsComplete: true,
  },
];

describe("FOOTMB assistant product grounding", () => {
  it("finds a product from a partial model name", () => {
    expect(findAssistantProducts(products, "phantom x").map((item) => item.model)).toEqual([
      "Nike Phantom GX Elite",
    ]);
    expect(
      findAssistantProducts(
        products,
        "Qelleb lia 3la Phantom w wrini stock w tailles disponibles.",
      ).map((item) => item.model),
    ).toEqual(["Nike Phantom GX Elite"]);
  });

  it("treats generic stock questions as all locations and hides unavailable matches when requested", () => {
    const casaOnly = {
      ...products[0],
      id: "gid://shopify/Product/3",
      slug: "3",
      model: "Phantom Casa Only",
      sizes: { stockCasa: [], casa: [{ size: "44", quantity: 1 }], tanger: [] },
      units: { stockCasa: 0, casa: 1, tanger: 0 },
      total: 1,
    };
    const unavailable = {
      ...casaOnly,
      id: "gid://shopify/Product/4",
      slug: "4",
      model: "Phantom Sold Out",
      sizes: { stockCasa: [], casa: [], tanger: [] },
      units: { stockCasa: 0, casa: 0, tanger: 0 },
      total: 0,
    };
    expect(
      findAssistantProducts(
        [casaOnly, unavailable],
        "wrini stock Phantom disponible",
      ).map((item) => item.model),
    ).toEqual(["Phantom Casa Only"]);
  });

  it("filters size and location questions against positive stock", () => {
    expect(findAssistantProducts(products, "pointure 43 f Casa").map((item) => item.model)).toEqual([
      "Nike Phantom GX Elite",
    ]);
    expect(findAssistantProducts(products, "pointure 42 f Tanger")).toEqual([]);
  });

  it("only exposes locations and sizes that are available", () => {
    const result = toAssistantProduct(products[0]);
    expect(result.locations.map((item) => item.label)).toEqual(["Stock Casa", "Casablanca"]);
    expect(result.locations.flatMap((item) => item.sizes).every((item) => item.quantity > 0)).toBe(true);
  });

  it("keeps the local fallback in the employee's language", () => {
    const card = toAssistantProduct(products[0]);
    expect(localAssistantReply("show me phantom", [card])).toMatch(/I found 1 matching product/);
    expect(localAssistantReply("montre phantom", [card])).toMatch(/J’ai trouvé 1 produit/);
  });

  it("recognizes inventory intents without depending on the AI provider", () => {
    expect(getAssistantIntent("Quels produits sont en stock faible ?")).toBe("low");
    expect(getAssistantIntent("give me a stock summary")).toBe("summary");
    expect(getAssistantIntent("سلام")).toBe("greeting");
  });

  it("detects an AI answer that contradicts grounded product cards", () => {
    expect(assistantReplyDeniesMatches("ما كاين حتى منتوج باسم Phantom X")).toBe(true);
    expect(assistantReplyDeniesMatches("J’ai trouvé des modèles Phantom proches.")).toBe(false);
  });
});
