"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "./Logo";
import Button from "./Button";
import { useAuth } from "@/lib/auth";

export default function Navbar() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  function handleSignOut() {
    signOut();
    router.push("/");
  }

  return (
    <header className="border-b border-(--color-border) bg-(--color-surface)">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href={user ? "/dashboard" : "/"}>
          <Logo />
        </Link>
        {user ? (
          <div className="flex items-center gap-4">
            <Link href="/settings/profile" className="hidden text-sm font-medium text-(--color-text-muted) hover:text-(--color-text) sm:inline">
              Profile setup
            </Link>
            <span className="hidden text-sm text-(--color-text-muted) sm:inline">{user.firstName}</span>
            <Button variant="secondary" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/signin" className="text-sm font-medium text-(--color-text-muted) hover:text-(--color-text)">
              Sign in
            </Link>
            <Link href="/signup">
              <Button>Sign up</Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
