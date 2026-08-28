"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { InventoryItem } from "@/lib/inventorySchema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "I want to make a hamburger, what ingredients do I need?",
  "What's expiring soon that I should give out first?",
  "What are we completely out of?",
];

export default function ChatPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    api
      .dashboardSummary()
      .then(async (summary) => {
        if (!summary.currentInventory) return;
        const detail = await api.uploadDetail(summary.currentInventory.fromUpload.id);
        setItems(detail.items);
      })
      .catch(() => {
        // Chat still works without inventory context; it'll just say so.
      })
      .finally(() => setLoadingInventory(false));
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply as string }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  if (!ready || !user) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-(--color-text)">Ask about your pantry</h1>
          <p className="mt-2 text-sm text-(--color-text-muted)">
            {loadingInventory
              ? "Loading your inventory…"
              : items.length > 0
              ? `Answers use your current inventory (${items.length} item${items.length === 1 ? "" : "s"}).`
              : "No inventory uploaded yet — upload one from the dashboard for grounded answers."}
          </p>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-(--color-border) bg-(--color-surface) p-4"
          style={{ minHeight: "50vh", maxHeight: "60vh" }}
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
              <p className="text-sm text-(--color-text-muted)">
                Try asking something like:
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-2 text-sm text-(--color-text) hover:border-(--color-primary)"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-(--color-primary) text-white"
                    : "bg-(--color-primary-soft) text-(--color-text)"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl bg-(--color-primary-soft) px-4 py-3 text-sm text-(--color-text-muted)">
                Thinking…
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about ingredients, stock, or what's expiring…"
            className="flex-1 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm text-(--color-text) outline-none focus:border-(--color-primary)"
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            Send
          </Button>
        </form>
      </main>
    </div>
  );
}
