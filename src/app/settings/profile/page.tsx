"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type FoodBankCandidate, type OrgInvite, type OrgMember, type OrgProfile } from "@/lib/api";

export default function ProfileSetupPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const profileData = await api.getOrgProfile();
      setProfile(profileData);
      if (isAdmin) {
        const [membersData, invitesData] = await Promise.all([api.listMembers(), api.listInvites()]);
        setMembers(membersData);
        setInvites(invitesData);
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load your organization profile.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.push("/signin");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() fetches from the API; its setState calls happen async, not during this render
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-(--color-text)">Profile setup</h1>
        <p className="mt-2 text-(--color-text-muted)">
          Link your organization to its Feeding America directory listing so dashboards and reports
          stay scoped to <span className="font-medium">{user.foodBankName}</span> only.
        </p>

        {loading && <p className="mt-8 text-sm text-(--color-text-muted)">Loading…</p>}
        {loadError && (
          <p className="mt-8 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{loadError}</p>
        )}

        {profile && (
          <>
            <OrgCard profile={profile} isAdmin={isAdmin} onUpdated={load} />
            {isAdmin && <FoodBankLinker profile={profile} onLinked={load} />}
            {isAdmin ? (
              <TeamSection members={members} invites={invites} onChanged={load} />
            ) : (
              <p className="mt-10 rounded-xl border border-(--color-border) bg-(--color-surface) px-5 py-4 text-sm text-(--color-text-muted)">
                Only an admin can change the organization&apos;s directory link or manage teammates.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OrgCard({ profile, isAdmin, onUpdated }: { profile: OrgProfile; isAdmin: boolean; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(profile.organization.address ?? "");
  const [primaryContact, setPrimaryContact] = useState(profile.organization.primaryContact ?? "");
  const [timezone, setTimezone] = useState(profile.organization.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateOrgProfile({ address, primaryContact, timezone });
      setEditing(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-(--color-border) bg-(--color-surface) p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-(--color-text)">{profile.organization.organizationName}</h2>
          {profile.feedingAmerica ? (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-(--color-primary)/10 px-2.5 py-0.5 text-xs font-medium text-(--color-primary)">
              Linked to Feeding America — {profile.feedingAmerica.name}
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-(--color-error-soft) px-2.5 py-0.5 text-xs font-medium text-(--color-error)">
              Not linked yet
            </span>
          )}
        </div>
        {isAdmin && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {!editing ? (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-(--color-text-muted)">Address</dt>
            <dd className="text-(--color-text)">{profile.organization.address ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">Primary contact</dt>
            <dd className="text-(--color-text)">{profile.organization.primaryContact ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">Timezone</dt>
            <dd className="text-(--color-text)">{profile.organization.timezone}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">Organization type</dt>
            <dd className="text-(--color-text)">{profile.organization.organizationType ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-(--color-text)">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-2.5 text-sm outline-none focus:border-(--color-primary)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-(--color-text)">Primary contact</label>
            <input
              value={primaryContact}
              onChange={(e) => setPrimaryContact(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-2.5 text-sm outline-none focus:border-(--color-primary)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-(--color-text)">Timezone</label>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-2.5 text-sm outline-none focus:border-(--color-primary)"
            />
          </div>
          {error && <p className="text-sm text-(--color-error)">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function FoodBankLinker({ profile, onLinked }: { profile: OrgProfile; onLinked: () => void }) {
  const [expanded, setExpanded] = useState(!profile.feedingAmerica);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [linkingSlug, setLinkingSlug] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FoodBankCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    setCandidates([]);
    try {
      setCandidates(await api.searchFoodBank(query));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function handleLink(slug: string) {
    setLinkingSlug(slug);
    setError(null);
    try {
      await api.linkFoodBank(slug);
      setExpanded(false);
      setCandidates([]);
      setQuery("");
      onLinked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't link that food bank.");
    } finally {
      setLinkingSlug(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface) p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-(--color-text)">Find your food bank</h2>
        {profile.feedingAmerica && (
          <Button variant="secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Cancel" : "Change"}
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-(--color-text-muted)">
        Describe your organization — a name, city, state, or ZIP — and we&apos;ll search the Feeding
        America directory for a match.
      </p>

      {expanded && (
        <>
          <form onSubmit={handleSearch} className="mt-4 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. a food bank in Denver, CO"
              className="flex-1 rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-2.5 text-sm outline-none focus:border-(--color-primary)"
            />
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? "Searching…" : "AI search"}
            </Button>
          </form>

          {error && <p className="mt-3 text-sm text-(--color-error)">{error}</p>}

          {candidates.length > 0 && (
            <ul className="mt-4 space-y-2">
              {candidates.map((c) => (
                <li
                  key={c.slug}
                  className="flex items-center justify-between gap-4 rounded-lg border border-(--color-border) px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-(--color-text)">{c.name}</p>
                    <p className="text-xs text-(--color-text-muted)">
                      {[c.address, c.city, c.state].filter(Boolean).join(", ") || "No address on file"}
                    </p>
                    <p className="mt-0.5 text-xs text-(--color-primary)">{c.matchReason}</p>
                  </div>
                  <Button variant="secondary" onClick={() => handleLink(c.slug)} disabled={linkingSlug === c.slug}>
                    {linkingSlug === c.slug ? "Linking…" : "Use this"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TeamSection({ members, invites, onChanged }: { members: OrgMember[]; invites: OrgInvite[]; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function inviteUrl(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invite/${token}`;
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setNewLink(null);
    try {
      const invite = await api.createInvite(email, role);
      setNewLink(inviteUrl(invite.token));
      setEmail("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions can fail silently — the link text is still selectable.
    }
  }

  async function handleRevoke(id: string) {
    await api.revokeInvite(id);
    onChanged();
  }

  return (
    <section className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface) p-6">
      <h2 className="text-lg font-semibold text-(--color-text)">Team</h2>

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-(--color-text-muted)">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Email</th>
            <th className="pb-2 font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-t border-(--color-border)">
              <td className="py-2 text-(--color-text)">
                {m.firstName} {m.lastName}
              </td>
              <td className="py-2 text-(--color-text-muted)">{m.email}</td>
              <td className="py-2 text-(--color-text-muted) capitalize">{m.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 text-sm font-semibold text-(--color-text)">Invite a teammate</h3>
      <form onSubmit={handleInvite} className="mt-2 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-(--color-text-muted)">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            placeholder="teammate@pantry.org"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-(--color-text-muted)">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "staff")}
            className="mt-1 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={inviting}>
          {inviting ? "Inviting…" : "Send invite"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-(--color-error)">{error}</p>}

      {newLink && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-(--color-primary)/10 px-4 py-3 text-sm">
          <span className="flex-1 truncate text-(--color-text)">{newLink}</span>
          <Button type="button" variant="secondary" onClick={() => handleCopy(newLink)}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}

      {invites.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-(--color-text)">Pending invites</h3>
          <ul className="mt-2 space-y-2">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-4 rounded-lg border border-(--color-border) px-4 py-2 text-sm">
                <span className="text-(--color-text)">
                  {inv.email} <span className="text-(--color-text-muted) capitalize">({inv.role})</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={() => handleCopy(inviteUrl(inv.token))}>
                    Copy link
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => handleRevoke(inv.id)}>
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
