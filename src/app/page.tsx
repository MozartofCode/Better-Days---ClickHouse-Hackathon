"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";

export default function LandingPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  function handleGetStarted() {
    if (ready && user) router.push("/dashboard");
    else router.push("/signup");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <span className="mb-6 inline-block rounded-full bg-(--color-primary-soft) px-4 py-1.5 text-sm font-medium text-(--color-primary)">
            Built for pantry operations teams
          </span>

          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-(--color-text) sm:text-5xl">
            Upload your inventory spreadsheet. Get an organized dashboard — even if it&apos;s messy.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-(--color-text-muted)">
            Pana reads the inventory sheet you already keep, matches your columns automatically, and
            shows you what&apos;s expiring soon, what&apos;s low, and what&apos;s out — missing fields and all.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button onClick={handleGetStarted} className="px-8 py-4 text-lg">
              Get Started
            </Button>
          </div>

          <p className="mt-6 text-sm text-(--color-text-muted)">
            Already have an account?{" "}
            <Link href="/signin" className="font-medium text-(--color-primary) hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-20 grid w-full max-w-4xl gap-6 sm:grid-cols-3">
          {[
            {
              title: "Auto-matched columns",
              body: "Item name, category, quantity, expiration date, and more — matched to your headers automatically.",
            },
            {
              title: "Works with gaps",
              body: "Missing a column or a few cells? Those just show as empty. Nothing blocks your upload.",
            },
            {
              title: "Saved to your account",
              body: "Your food bank's uploads are private to your team and there whenever you sign back in.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 text-left">
              <h3 className="text-base font-semibold text-(--color-text)">{f.title}</h3>
              <p className="mt-2 text-sm text-(--color-text-muted)">{f.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 max-w-xl text-sm text-(--color-text-muted)">
          Column matching runs in your browser before anything is sent — only your food bank&apos;s
          staff can ever see what you upload.
        </p>
      </main>

      <footer className="border-t border-(--color-border) py-6 text-center text-sm text-(--color-text-muted)">
        Pana — upload your inventory, see it clearly.
      </footer>
    </div>
  );
}
