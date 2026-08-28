"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import Button from "./Button";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Inventory" },
  { href: "/dashboard/upload", label: "Upload" },
  { href: "/dashboard/uploads", label: "Uploaded Files" },
  { href: "/dashboard/chat", label: "Ask Pana" },
  { href: "/dashboard/ask-your-data", label: "Ask Your Data" },
];

export default function Navbar() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  function handleSignOut() {
    signOut();
    router.push("/");
  }

  return (
    <header className="border-b border-(--color-border) bg-(--color-surface)">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href={user ? "/dashboard" : "/"}>
            <Logo />
          </Link>
          {user && (
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV_ITEMS.map((item) => {
                const active = item.href === "/dashboard" ? pathname === item.href : pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-(--color-primary-soft) text-(--color-primary)"
                        : "text-(--color-text-muted) hover:bg-(--color-bg) hover:text-(--color-text)"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {user ? (
          <div className="flex items-center gap-4">
            <Link href="/settings/profile" className="hidden text-sm font-medium text-(--color-text-muted) hover:text-(--color-text) sm:inline">
              Profile setup
            </Link>
            <Link href="/settings/mcp" className="hidden text-sm font-medium text-(--color-text-muted) hover:text-(--color-text) sm:inline">
              Connect AI chat
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
