"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";

const MCP_URL = `${API_BASE_URL}/mcp`;
const CLAUDE_CODE_COMMAND = `claude mcp add --transport http pana-food-bank ${MCP_URL}`;

export default function McpConnectPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.push("/signin");
  }, [ready, user, router]);

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
        <h1 className="text-2xl font-semibold text-(--color-text)">Connect an AI chat client</h1>
        <p className="mt-2 text-(--color-text-muted)">
          Pana runs a Model Context Protocol (MCP) server so you can query and update{" "}
          <span className="font-medium">{user.foodBankName}</span>&apos;s data from Claude, ChatGPT, or
          LibreChat directly — no exports, no copy-pasting. Every connection is tied to your own sign-in,
          so a chat client can only ever see or change your organization&apos;s data.
        </p>

        <ServerUrlCard />

        <div className="mt-6 space-y-6">
          <ClaudeCard />
          <ChatGptCard />
          <LibreChatCard />
        </div>

        <section className="mt-10 rounded-xl border border-(--color-border) bg-(--color-bg) p-6">
          <h2 className="text-sm font-semibold text-(--color-text)">What to expect</h2>
          <ul className="mt-3 space-y-2 text-sm text-(--color-text-muted)">
            <li>
              Every client above signs you in through Pana&apos;s own login (the same email and password
              you use here) — there&apos;s nothing to copy from a &quot;service key&quot; or admin panel.
            </li>
            <li>
              Both read tools (dashboard, uploads, sites, programs, items) and write tools (correcting an
              item or an upload row) are available. Your chat client will typically ask you to approve
              write actions the first time it uses one.
            </li>
            <li>Disconnecting later just means removing the connector from that client&apos;s own settings — nothing to undo here.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function ServerUrlCard() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions can fail silently — the URL text is still selectable.
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-(--color-border) bg-(--color-surface) p-6">
      <h2 className="text-lg font-semibold text-(--color-text)">Your MCP server URL</h2>
      <p className="mt-1 text-sm text-(--color-text-muted)">
        Every client below just needs this one address — paste it in wherever it asks for a &quot;remote
        MCP server URL&quot; or &quot;connector URL&quot;.
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-(--color-primary)/10 px-4 py-3 text-sm">
        <code className="flex-1 truncate font-mono text-(--color-text)">{MCP_URL}</code>
        <Button type="button" variant="secondary" onClick={handleCopy}>
          {copied ? "Copied" : "Copy URL"}
        </Button>
      </div>
    </section>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions can fail silently — the text is still selectable.
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={handleCopy}>
      {copied ? "Copied" : label}
    </Button>
  );
}

function ConnectorCard({
  monogram,
  name,
  tagline,
  children,
}: {
  monogram: string;
  name: string;
  tagline: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-primary) text-sm font-semibold text-white">
          {monogram}
        </span>
        <div>
          <h2 className="text-lg font-semibold text-(--color-text)">{name}</h2>
          <p className="text-sm text-(--color-text-muted)">{tagline}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-4 space-y-2 text-sm text-(--color-text)">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--color-primary-soft) text-xs font-semibold text-(--color-primary)">
            {i + 1}
          </span>
          <span className="pt-px">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function ClaudeCard() {
  return (
    <ConnectorCard monogram="C" name="Claude" tagline="Claude.ai, Claude Desktop, or Claude Code">
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-(--color-text)">Claude.ai or Claude Desktop</h3>
          <Steps
            items={[
              <>Go to Customize &rarr; Connectors &rarr; Add custom connector.</>,
              <>Paste your server URL (copied above) and click Add.</>,
              <>Click Connect and sign in with your Pana account.</>,
            ]}
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-(--color-text)">Claude Code (CLI)</h3>
          <p className="mt-1 text-sm text-(--color-text-muted)">Run this in your terminal, then follow the browser prompt to sign in:</p>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-(--color-bg) px-3 py-2.5">
            <code className="flex-1 break-all font-mono text-xs text-(--color-text)">{CLAUDE_CODE_COMMAND}</code>
          </div>
          <div className="mt-2">
            <CopyButton value={CLAUDE_CODE_COMMAND} label="Copy command" />
          </div>
        </div>
      </div>
    </ConnectorCard>
  );
}

function ChatGptCard() {
  return (
    <ConnectorCard monogram="G" name="ChatGPT" tagline="Requires a paid plan with Developer mode enabled">
      <Steps
        items={[
          <>Go to Settings &rarr; Connectors &rarr; Advanced settings, and turn on Developer mode.</>,
          <>Back in Connectors, click Create &rarr; Add custom connector.</>,
          <>Paste your server URL (copied above) and complete the sign-in step with your Pana account.</>,
          <>Enable the connector for the chat where you want to use it.</>,
        ]}
      />
    </ConnectorCard>
  );
}

function LibreChatCard() {
  return (
    <ConnectorCard monogram="L" name="LibreChat" tagline="Self-hosted — one-time setup by your team's admin">
      <p className="mt-4 text-sm text-(--color-text-muted)">
        LibreChat is configured per-deployment rather than per-user, so there&apos;s no sign-in step to do
        here yourself. If you run Pana&apos;s LibreChat instance, add an entry to its{" "}
        <code className="font-mono text-xs">librechat.yaml</code> under <code className="font-mono text-xs">mcpServers</code>{" "}
        pointing at your server URL above, with OAuth credentials registered through the server&apos;s{" "}
        <code className="font-mono text-xs">/register</code> endpoint. See the repo&apos;s{" "}
        <code className="font-mono text-xs">librechat.yaml</code> for a working example. Once it&apos;s set
        up, each teammate authenticates with their own Pana account the first time they use it, just like
        the other clients above.
      </p>
    </ConnectorCard>
  );
}
