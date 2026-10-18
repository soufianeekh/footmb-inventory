"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import type { AssistantProduct } from "@/lib/assistant";
import { fmt } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: AssistantProduct[];
  mode?: "ai" | "local";
};

const welcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Salam! Ana FOOTMB Assistant. Swelni 3la chi produit, taille, stock wla statistique. نقدر نجاوبك بالدارجة، العربية، français أو English.",
};

const suggestions = [
  "Qelleb lia 3la Phantom",
  "Quels produits sont en stock faible ?",
  "Show me cleats in size 43",
];

function ProductResult({ product, close }: { product: AssistantProduct; close: () => void }) {
  return (
    <Link
      href={`/inventory/${product.slug}`}
      onClick={close}
      className="mt-2 block rounded-xl border bg-white p-3 shadow-sm transition hover:border-[#ff9d0a]"
    >
      <div className="flex gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f7f8fc]">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.model}
              width={64}
              height={64}
              unoptimized
              className="size-full object-contain"
            />
          ) : (
            <Bot className="size-6 text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold leading-5 text-[#111244]">{product.model}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {fmt(product.total)} unités disponibles
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2 border-t pt-2">
        {product.locations.map((location) => (
          <div key={location.key} className="flex items-start justify-between gap-3 text-[10px]">
            <span className="shrink-0 font-semibold text-[#24215f]">
              {location.label} · {fmt(location.units)}
            </span>
            <span className="flex flex-wrap justify-end gap-1 text-muted-foreground">
              {location.sizes.slice(0, 6).map((size) => (
                <span key={size.size} className="rounded bg-[#f3f4f9] px-1.5 py-0.5">
                  {size.size}: {size.quantity}
                </span>
              ))}
              {location.sizes.length > 6 && <span>+{location.sizes.length - 6}</span>}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function FootmbAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || loading) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    const history = messages
      .filter((message) => message.id !== "welcome")
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history }),
      });
      const body = (await response.json()) as {
        reply?: string;
        products?: AssistantProduct[];
        mode?: "ai" | "local";
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Assistant indisponible");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: body.reply || "Assistant indisponible",
          products: body.products,
          mode: body.mode,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Assistant indisponible. Réessayez dans un moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-5 right-5 z-40 h-12 rounded-full bg-[#17145f] px-4 shadow-[0_10px_30px_#15125735] hover:bg-[#242076] sm:bottom-7 sm:right-7"
          aria-label="Ouvrir FOOTMB Assistant"
        >
          <span className="relative">
            <Bot className="size-5" />
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#ff9d0a] ring-2 ring-[#17145f]" />
          </span>
          <span className="hidden sm:inline">Assistant</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-full gap-0 bg-[#f6f7fb] p-0 sm:max-w-[430px]"
        aria-label="FOOTMB Assistant"
      >
        <SheetHeader className="border-b bg-white px-5 py-4 pr-12">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#17145f] text-white">
              <Sparkles className="size-5 text-[#ff9d0a]" />
            </span>
            <div>
              <SheetTitle className="text-[#111244]">FOOTMB Assistant</SheetTitle>
              <SheetDescription className="text-xs">
                Stock Shopify en direct · Lecture sécurisée
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4 pb-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "ml-10" : "mr-4"}
              >
                <div
                  dir="auto"
                  className={`rounded-2xl px-3.5 py-3 text-[13px] leading-5 ${
                    message.role === "user"
                      ? "rounded-br-md bg-[#17145f] text-white"
                      : "rounded-bl-md border bg-white text-[#252653] shadow-sm"
                  }`}
                >
                  {message.content}
                </div>
                {message.products?.map((product) => (
                  <ProductResult
                    key={product.id}
                    product={product}
                    close={() => setOpen(false)}
                  />
                ))}
                {message.role === "assistant" && message.mode === "local" && (
                  <Badge variant="secondary" className="mt-2 text-[9px] font-normal">
                    Recherche FOOTMB
                  </Badge>
                )}
              </div>
            ))}
            {loading && (
              <div role="status" className="mr-16 rounded-2xl rounded-bl-md border bg-white p-3 shadow-sm">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((item) => (
                    <span
                      key={item}
                      className="size-1.5 animate-pulse rounded-full bg-[#ff9d0a]"
                      style={{ animationDelay: `${item * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void ask(suggestion)}
                    className="rounded-full border bg-white px-3 py-2 text-left text-[10px] font-medium text-[#3a3a6b] shadow-sm hover:border-[#ff9d0a]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        <div className="border-t bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <form onSubmit={submit} className="flex items-end gap-2">
            <label htmlFor="footmb-assistant-input" className="sr-only">
              Question pour FOOTMB Assistant
            </label>
            <textarea
              id="footmb-assistant-input"
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 500))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Sowelni 3la stock, produit, taille…"
              rows={1}
              className="min-h-10 max-h-28 flex-1 resize-none rounded-xl border bg-[#f7f8fc] px-3 py-2.5 text-sm outline-none focus:border-[#ff9d0a] focus:ring-2 focus:ring-[#ff9d0a]/20"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || loading}
              className="size-10 rounded-xl"
              aria-label="Envoyer"
            >
              <Send className="size-4" />
            </Button>
          </form>
          <p className="mt-2 text-center text-[9px] text-muted-foreground">
            Vérifiez la fiche produit avant de confirmer une vente.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
