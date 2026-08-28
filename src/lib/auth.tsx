"use client";

// Real auth against the api/ backend (Postgres-backed users + JWT). See
// api/README.md for the /api/auth contract.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, ApiUser, clearToken, getToken, setToken } from "./api";

type AuthResult = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  user: ApiUser | null;
  ready: boolean;
  signUp: (input: { email: string; password: string; firstName: string; lastName: string; role: "admin" | "staff"; foodBankName: string }) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  acceptInvite: (token: string, input: { firstName: string; lastName: string; password: string }) => Promise<AuthResult>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Couldn't reach the server. Please try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external store (token presence) on mount
      setReady(true);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  const signUp = useCallback(async (input: { email: string; password: string; firstName: string; lastName: string; role: "admin" | "staff"; foodBankName: string }): Promise<AuthResult> => {
    try {
      const { token, user } = await api.register(input);
      setToken(token);
      setUser(user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      const { token, user } = await api.login({ email: email.trim().toLowerCase(), password });
      setToken(token);
      setUser(user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }, []);

  const acceptInvite = useCallback(async (token: string, input: { firstName: string; lastName: string; password: string }): Promise<AuthResult> => {
    try {
      const { token: authToken, user } = await api.acceptInvite(token, input);
      setToken(authToken);
      setUser(user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, signUp, signIn, acceptInvite, signOut }), [user, ready, signUp, signIn, acceptInvite, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
