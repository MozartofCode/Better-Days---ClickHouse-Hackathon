"use client";

// Frontend-only auth. No server, no database — accounts live in this
// browser's localStorage. Good enough for a demo/MVP; swap for a real
// backend (NextAuth, Supabase, etc.) without touching any component that
// calls useAuth(), since the hook shape stays the same.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface StoredUser {
  name: string;
  email: string;
  password: string; // demo-only; never do this with a real backend
}

interface Session {
  name: string;
  email: string;
}

interface AuthContextValue {
  user: Session | null;
  ready: boolean;
  signUp: (name: string, email: string, password: string) => { ok: true } | { ok: false; error: string };
  signIn: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USERS_KEY = "pana_users";
const SESSION_KEY = "pana_session";

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Reading localStorage on mount and syncing it into React state is the
    // documented case for an effect (external system -> React state).
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external store (localStorage) on mount
      if (raw) setUser(JSON.parse(raw));
    } catch {
      // ignore corrupt session
    }
    setReady(true);
  }, []);

  const signUp = useCallback((name: string, email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!name.trim() || !cleanEmail || password.length < 6) {
      return { ok: false as const, error: "Please fill in every field. Password needs at least 6 characters." };
    }
    const users = loadUsers();
    if (users.some((u) => u.email === cleanEmail)) {
      return { ok: false as const, error: "An account with that email already exists. Try signing in instead." };
    }
    users.push({ name: name.trim(), email: cleanEmail, password });
    saveUsers(users);
    const session = { name: name.trim(), email: cleanEmail };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return { ok: true as const };
  }, []);

  const signIn = useCallback((email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const users = loadUsers();
    const found = users.find((u) => u.email === cleanEmail && u.password === password);
    if (!found) {
      return { ok: false as const, error: "That email and password don't match an account." };
    }
    const session = { name: found.name, email: found.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return { ok: true as const };
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, signUp, signIn, signOut }), [user, ready, signUp, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
