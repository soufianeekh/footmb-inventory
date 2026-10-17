"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useInventory } from "@/components/inventory-provider";
import { Icon } from "@/components/icons";
import {
  ProductImage,
  StatusTag,
  StockBadges,
  LoadingPanel,
  Surface,
} from "@/components/ui";
import { LOCATIONS, fmt } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/components/user-context";

export default function ProductDetailPage() {
  const params = useParams<{ productId: string }>();
  const { products, ready } = useInventory();
  const currentUser = useCurrentUser();
  const product = products.find((p) => p.slug === params.productId);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<string | null>(null);

  const verify = async () => {
    if (!product) return;
    setVerifying(true);
    setVerification(null);
    try {
      const response = await fetch("/api/inventory/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const body = (await response.json()) as { repaired?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error || "Vérification impossible");
      setVerification(body.repaired ? "Écart réparé depuis Shopify" : "Quantités confirmées");
    } catch (error) {
      setVerification(error instanceof Error ? error.message : "Vérification impossible");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div>
      <Link
        href="/inventory"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <Icon name="arrow-left" size={19} /> Retour à l’inventaire
      </Link>
      {!ready ? (
        <LoadingPanel rows={4} />
      ) : !product ? (
        <Surface className="p-8 text-center">
          <h1 className="text-xl font-bold">Modèle introuvable</h1>
          <p className="mt-2 text-sm text-[#84929f]">
            Vérifiez le lien ou recherchez le modèle dans l’inventaire.
          </p>
        </Surface>
      ) : (
        <>
          <Surface className="p-4 sm:p-6">
            <div className="flex items-start gap-4 sm:gap-6">
              <ProductImage src={product.image} alt={product.model} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#f29a11]">
                  Fiche produit
                </p>
                <h1 className="text-base font-bold leading-6 sm:text-2xl">
                  {product.model}
                </h1>
                <div className="mt-2">
                  <StatusTag product={product} />
                </div>
                <div className="mt-4 text-3xl font-bold tabular-nums">
                  {fmt(product.total)}{" "}
                  <span className="text-sm font-medium text-muted-foreground">
                    unités disponibles
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {currentUser.role !== "reader" && (
                    <Button variant="outline" onClick={() => void verify()} disabled={verifying}>
                      <Icon name="refresh" size={16} className={verifying ? "animate-spin" : ""} />
                      {verifying ? "Vérification…" : "Vérifier dans Shopify"}
                    </Button>
                  )}
                  {verification && (
                    <span className="text-xs font-medium text-muted-foreground">{verification}</span>
                  )}
                </div>
              </div>
            </div>
          </Surface>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {LOCATIONS.map((loc) => (
              <Surface key={loc.key} className="p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="store" size={18} className="text-[#f29a11]" />
                    <h2 className="text-sm font-semibold">{loc.label}</h2>
                  </div>
                  <span className="text-base font-black tabular-nums">
                    {fmt(product.units[loc.key])}
                  </span>
                </div>
                <StockBadges items={product.sizes[loc.key]} />
                {!product.sizes[loc.key].length &&
                  product.trackedVariants === 0 && (
                    <p className="mt-2 text-xs text-amber-300">
                      Stock non suivi pour ce modèle
                    </p>
                  )}
              </Surface>
            ))}
          </div>
          <Surface className="mt-4 p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Informations de suivi</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
              <div>
                <p className="text-[#82909d]">Variantes suivies</p>
                <p className="mt-1 text-lg font-bold">
                  {product.trackedVariants}
                </p>
              </div>
              <div>
                <p className="text-[#82909d]">Non suivies</p>
                <p className="mt-1 text-lg font-bold">
                  {product.untrackedVariants}
                </p>
              </div>
              <div>
                <p className="text-[#82909d]">Emplacements complets</p>
                <p className="mt-1 text-lg font-bold">
                  {product.locationsComplete ? "Oui" : "Non"}
                </p>
              </div>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
