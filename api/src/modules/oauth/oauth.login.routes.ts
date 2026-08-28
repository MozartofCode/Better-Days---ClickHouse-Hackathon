import express, { Router, Request, Response } from "express";
import * as authService from "../auth/auth.service";
import * as oauthRepository from "./oauth.repository";
import { env } from "../../config/env";
import { verifyPendingAuthorization, generateAuthorizationCode, PendingAuthorization } from "./oauth.provider";

export const oauthLoginRouter = Router();
oauthLoginRouter.use(express.urlencoded({ extended: false }));

function renderLoginPage(pendingToken: string, opts: { clientName?: string; error?: string } = {}): string {
  const escapedError = opts.error ? escapeHtml(opts.error) : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sign in to Pana</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 360px; margin: 4rem auto; padding: 0 1rem; }
    h1 { font-size: 1.25rem; }
    p.sub { color: #555; margin-top: -0.5rem; }
    label { display: block; margin-top: 1rem; font-size: 0.9rem; }
    input { width: 100%; padding: 0.5rem; margin-top: 0.25rem; box-sizing: border-box; }
    button { margin-top: 1.5rem; width: 100%; padding: 0.6rem; }
    .error { color: #b00020; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Sign in to Pana</h1>
  <p class="sub">${opts.clientName ? escapeHtml(opts.clientName) + " is requesting access to your food bank's data." : "An application is requesting access to your food bank's data."}</p>
  ${escapedError ? `<p class="error">${escapedError}</p>` : ""}
  <form method="POST" action="/oauth/login">
    <input type="hidden" name="pending" value="${escapeHtml(pendingToken)}" />
    <label>Email<input type="email" name="email" required autofocus /></label>
    <label>Password<input type="password" name="password" required /></label>
    <button type="submit">Sign in &amp; authorize</button>
  </form>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function getPendingOrFail(req: Request, res: Response): PendingAuthorization | undefined {
  const pendingToken = (req.query.pending as string) ?? (req.body?.pending as string);
  if (!pendingToken) {
    res.status(400).send("Missing pending authorization");
    return undefined;
  }
  try {
    return verifyPendingAuthorization(pendingToken);
  } catch {
    res.status(400).send("This authorization request has expired. Please try connecting again from your chat client.");
    return undefined;
  }
}

oauthLoginRouter.get("/oauth/login", (req: Request, res: Response) => {
  const pendingToken = req.query.pending as string;
  if (!getPendingOrFail(req, res)) return;
  res.status(200).type("html").send(renderLoginPage(pendingToken));
});

oauthLoginRouter.post("/oauth/login", async (req: Request, res: Response) => {
  const pendingToken = req.body?.pending as string;
  const pending = getPendingOrFail(req, res);
  if (!pending) return;

  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).type("html").send(renderLoginPage(pendingToken, { error: "Email and password are required." }));
    return;
  }

  let user;
  try {
    ({ user } = await authService.login({ email, password }));
  } catch {
    res.status(401).type("html").send(renderLoginPage(pendingToken, { error: "Invalid email or password." }));
    return;
  }

  const code = generateAuthorizationCode();
  await oauthRepository.insertAuthorizationCode({
    code,
    clientId: pending.clientId,
    userId: user.id,
    redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge,
    resource: pending.resource ?? null,
    scopes: pending.scopes,
    expiresAt: new Date(Date.now() + env.mcp.authCodeTtlSeconds * 1000),
  });

  const redirectUrl = new URL(pending.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (pending.state) redirectUrl.searchParams.set("state", pending.state);
  res.redirect(302, redirectUrl.toString());
});
