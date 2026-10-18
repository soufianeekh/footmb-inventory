import {
  LOCATIONS,
  type LocationKey,
  type Product,
  type StockItem,
} from "./inventory";

export type AssistantProduct = {
  id: string;
  slug: string;
  model: string;
  image: string | null;
  total: number;
  locations: Array<{
    key: LocationKey;
    label: string;
    units: number;
    sizes: StockItem[];
  }>;
};

export type AssistantStats = {
  models: number;
  total: number;
  out: number;
  low: number;
  units: Record<LocationKey, number>;
};

export type AssistantIntent = "greeting" | "low" | "out" | "summary" | null;

const STOP_WORDS = new Set([
  "a",
  "about",
  "all",
  "and",
  "available",
  "avec",
  "bghit",
  "combien",
  "de",
  "des",
  "dial",
  "do",
  "du",
  "en",
  "est",
  "f",
  "fi",
  "for",
  "give",
  "how",
  "i",
  "in",
  "is",
  "la",
  "le",
  "les",
  "lia",
  "me",
  "montre",
  "of",
  "product",
  "products",
  "produit",
  "produits",
  "show",
  "size",
  "stock",
  "taille",
  "the",
  "to",
  "un",
  "une",
  "what",
  "with",
  "وريني",
  "عطيني",
  "ف",
  "في",
  "من",
]);

export function normalizeAssistantText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  return normalizeAssistantText(query)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function extractLocation(query: string): LocationKey | null {
  const normalized = normalizeAssistantText(query);
  if (/\b(stock casa|depot|warehouse|f stock|fi stock|dans stock|at stock)\b/.test(normalized)) return "stockCasa";
  if (/\b(casablanca|casa)\b/.test(normalized)) return "casa";
  if (/\b(tanger|tangier)\b/.test(normalized)) return "tanger";
  return null;
}

function extractSize(query: string): string | null {
  const normalized = normalizeAssistantText(query);
  const labelled = normalized.match(/(?:tailles?|sizes?|pointures?)\s+([a-z0-9./-]+)\b/);
  if (
    labelled?.[1] &&
    /^(?:\d{1,2}(?:[.,]\d)?|xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|tu|standard)$/i.test(labelled[1])
  ) {
    return labelled[1].toUpperCase().replace(",", ".");
  }
  const numeric = normalized.match(/\b(3[5-9]|4[0-9]|5[0-2])(?:[.,]5)?\b/);
  return numeric?.[0]?.replace(",", ".") || null;
}

export function getAssistantIntent(query: string): AssistantIntent {
  const normalized = normalizeAssistantText(query);
  if (/^(salam|slm|hello|hi|bonjour|salut|السلام|سلام)(\s|$)/u.test(normalized)) return "greeting";
  if (/\b(stock faible|low stock|faible|9lil|قليل|ضعيف)\b/.test(normalized)) return "low";
  if (/\b(rupture|out of stock|epuise|zero stock|سالاو|نفذ|منعدم)\b/.test(normalized)) return "out";
  if (/\b(resume|summary|total stock|statistique|statistics|احصائيات|ملخص)\b/.test(normalized)) return "summary";
  return null;
}

function sizeQuantity(product: Product, size: string, location: LocationKey | null): number {
  const locations = location ? [location] : LOCATIONS.map((item) => item.key);
  return locations.reduce(
    (total, key) =>
      total +
      product.sizes[key]
        .filter((item) => normalizeAssistantText(item.size) === normalizeAssistantText(size))
        .reduce((sum, item) => sum + item.quantity, 0),
    0,
  );
}

export function findAssistantProducts(
  products: Product[],
  query: string,
  limit = 5,
): Product[] {
  const normalizedQuery = normalizeAssistantText(query);
  const tokens = queryTokens(query);
  const location = extractLocation(query);
  const size = extractSize(query);
  const asksForAvailable = /\b(available|availability|disponible|disponibles|متوفر|متوفرة)\b/u.test(normalizedQuery);

  if (!tokens.length && !size) return [];

  return products
    .map((product) => {
      const model = normalizeAssistantText(product.model);
      let score = 0;
      if (normalizedQuery.length > 2 && model.includes(normalizedQuery)) score += 120;
      for (const token of tokens) {
        if (model === token) score += 50;
        else if (model.includes(token)) score += token.length >= 5 ? 24 : 12;
      }
      const matchingSizeQuantity = size ? sizeQuantity(product, size, location) : 0;
      if (size && matchingSizeQuantity > 0) score += 35 + Math.min(matchingSizeQuantity, 20);
      if (size && matchingSizeQuantity === 0) score = 0;
      const available = location ? product.units[location] : product.total;
      if (location && available === 0) score = 0;
      if (asksForAvailable && product.total === 0) score = 0;
      return { product, score, available };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.available - a.available || a.product.model.localeCompare(b.product.model))
    .slice(0, limit)
    .map((item) => item.product);
}

export function toAssistantProduct(product: Product): AssistantProduct {
  return {
    id: product.id,
    slug: product.slug,
    model: product.model,
    image: product.image,
    total: product.total,
    locations: LOCATIONS.map((location) => ({
      key: location.key,
      label: location.label,
      units: product.units[location.key],
      sizes: product.sizes[location.key].filter((item) => item.quantity > 0),
    })).filter((location) => location.units > 0),
  };
}

export function localAssistantReply(
  query: string,
  products: AssistantProduct[],
  stats?: AssistantStats,
): string {
  const normalized = normalizeAssistantText(query);
  const isArabic = /[\u0600-\u06ff]/.test(query);
  const isEnglish = /\b(hello|hi|please|show|find|where|which|what|how|available)\b/.test(normalized);
  const isFrench = /\b(bonjour|salut|merci|cherche|trouve|montre|quel|quelle|combien|disponible)\b/.test(normalized);
  const intent = getAssistantIntent(query);

  if (intent === "greeting") {
    if (isArabic) return "مرحبا! سولني على أي منتج، مقاس، مخزون أو إحصائية ديال FOOTMB.";
    if (isEnglish) return "Hello! Ask me about any FOOTMB product, size, stock level, or statistic.";
    if (isFrench) return "Bonjour ! Demandez-moi un produit, une taille, un niveau de stock ou une statistique FOOTMB.";
    return "Salam! Swelni 3la ay produit, taille, stock wla statistique dyal FOOTMB.";
  }

  if (stats && intent === "summary") {
    if (isArabic) return `المخزون الحالي فيه ${stats.total} وحدة موزعة على ${stats.models} منتج، منها ${stats.low} بمخزون ضعيف و${stats.out} منقطعة.`;
    if (isEnglish) return `Current inventory: ${stats.total} units across ${stats.models} products, including ${stats.low} low-stock and ${stats.out} out-of-stock products.`;
    if (isFrench) return `Inventaire actuel : ${stats.total} unités sur ${stats.models} produits, dont ${stats.low} en stock faible et ${stats.out} en rupture.`;
    return `Daba kaynin ${stats.total} unité f ${stats.models} produit: ${stats.low} stock faible w ${stats.out} rupture.`;
  }

  if (stats && (intent === "low" || intent === "out")) {
    const count = intent === "low" ? stats.low : stats.out;
    const label = intent === "low" ? "stock faible" : "rupture";
    if (isArabic) return `كاينين ${count} منتجات فحالة ${label}. هادي أول النتائج اللي خاصها الانتباه.`;
    if (isEnglish) return `There are ${count} ${label} products. These are the first items that need attention.`;
    if (isFrench) return `Il y a ${count} produits en ${label}. Voici les premiers produits à surveiller.`;
    return `Kaynin ${count} produits f ${label}. Hado homa lwelin li khasna nchofou.`;
  }

  if (products.length) {
    if (isArabic) return `لقيت ${products.length} من المنتجات المطابقة. المخزون والمقاسات المتوفرة باينين لتحت.`;
    if (isEnglish) return `I found ${products.length} matching product${products.length > 1 ? "s" : ""}. The live stock and available sizes are shown below.`;
    if (isFrench) return `J’ai trouvé ${products.length} produit${products.length > 1 ? "s" : ""} correspondant${products.length > 1 ? "s" : ""}. Le stock et les tailles disponibles sont affichés ci-dessous.`;
    return `L9it lik ${products.length} produit${products.length > 1 ? "s" : ""}. Stock w tailles disponibles kaynin lte7t.`;
  }

  if (isArabic) return "ما لقيتش منتج مطابق لهذا البحث. جرب الاسم الكامل، المرجع، المقاس أو الموقع.";
  if (isEnglish) return "I couldn’t find a matching product. Try its full name, SKU, size, or location.";
  if (isFrench) return "Je n’ai trouvé aucun produit correspondant. Essayez le nom complet, le SKU, la taille ou l’emplacement.";
  return "Mal9itch produit مطابق. Jرب smiya kamla, SKU, taille wla emplacement.";
}
