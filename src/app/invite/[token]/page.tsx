"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type InviteLookup } from "@/lib/api";

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { acceptInvite } = useAuth();
  const router = useRouter();

  const [invite, setInvite] = useState<InviteLookup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getInviteByToken(token)
      .then(setInvite)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "This invite link isn't valid."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    const result = await acceptInvite(token, { firstName, lastName, password });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          {loading && <p className="text-sm text-(--color-text-muted)">Loading invite…</p>}

          {loadError && (
            <p className="rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{loadError}</p>
          )}

          {invite && (
            <>
              <h1 className="text-2xl font-semibold text-(--color-text)">Join {invite.foodBankName}</h1>
              <p className="mt-2 text-(--color-text-muted)">
                You&apos;ve been invited as <span className="font-medium capitalize">{invite.role}</span> for{" "}
                <span className="font-medium">{invite.email}</span>. Set a password to finish joining.
              </p>

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
                    />
                  </div>
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

                {submitError && (
                  <p className="rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{submitError}</p>
                )}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Joining…" : "Join organization"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
