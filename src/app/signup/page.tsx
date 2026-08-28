"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";

export default function SignUpPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [foodBankName, setFoodBankName] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signUp({ email, password, firstName, lastName, role, foodBankName });
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
          <h1 className="text-2xl font-semibold text-(--color-text)">Create your account</h1>
          <p className="mt-2 text-(--color-text-muted)">Takes less than a minute. No credit card.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-(--color-text)">
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-primary)"
                  placeholder="Denise"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-(--color-text)">
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-primary)"
                  placeholder="Carter"
                />
              </div>
            </div>
            <div>
              <label htmlFor="foodBankName" className="block text-sm font-medium text-(--color-text)">
                Food bank name
              </label>
              <input
                id="foodBankName"
                type="text"
                required
                value={foodBankName}
                onChange={(e) => setFoodBankName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-primary)"
                placeholder="Example Food Bank"
              />
              <p className="mt-1 text-xs text-(--color-text-muted)">
                If this already exists, you&apos;ll be added to that food bank&apos;s account.
              </p>
            </div>
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-(--color-text)">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "staff")}
                className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-primary)"
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </div>
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
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-base outline-none focus:border-(--color-primary)"
                placeholder="At least 8 characters"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-(--color-text-muted)">
            Already have an account?{" "}
            <Link href="/signin" className="font-medium text-(--color-primary) hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
