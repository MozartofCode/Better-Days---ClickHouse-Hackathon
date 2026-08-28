"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";

export default function SignInPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = signIn(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold text-(--color-text)">Sign in</h1>
          <p className="mt-2 text-(--color-text-muted)">Welcome back.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-(--color-text)">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-primary)"
                placeholder="you@pantry.org"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-(--color-text)">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-primary)"
                placeholder="Your password"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-(--color-text-muted)">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-(--color-primary) hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
