# README_START — MCP + OAuth setup (read this before deploying)

This covers exactly what's needed to make the new **MCP server + OAuth** feature work: an
authenticated agentic-chat integration (Claude, ChatGPT, LibreChat) that can query and update a
signed-in user's own food bank data, and nothing else. If you're the engineer picking this up to
integrate or deploy it, this is the checklist. It does not re-document the rest of the app — see
[`README.md`](README.md) and [`api/README.md`](api/README.md) for that.

## What was added

- `api/src/modules/oauth/` — a self-hosted OAuth 2.1 Authorization Server (RFC 8414/9728 metadata,
  RFC 7591 dynamic client registration, PKCE) built on top of the app's existing
  users/bcrypt/JWT system. No third-party IdP.
- `api/src/modules/mcp/` — the MCP server itself (Streamable HTTP transport), mounted at `/mcp`,
  gated by the OAuth layer above. Tools live one-per-file under `mcp/tools/` — every tool derives
  `foodBankId` from the verified token, never from client input.
- `api/src/db/migrations/004_mcp_oauth_schema.sql` — new `oauth_clients` / `oauth_authorization_codes`
  / `oauth_refresh_tokens` tables. Must be migrated like any other.
- `src/app/settings/mcp/page.tsx` — the in-app "Connect an AI chat client" page (linked from the
  navbar as "Connect AI chat").
- `librechat.template.yaml` + `librechat-render-config.js` — LibreChat's MCP config, templated (see
  "LibreChat in production" below for why it's a template and not a plain `librechat.yaml`).
- `api/src/modules/actions/` (the old shared-key LibreChat integration) is **still running**,
  untouched, as a fallback — it is not removed by this change.

## 1. Local dev setup

### `api/.env` (gitignored — create it, it doesn't ship with the repo)
```bash
cp api/.env.example api/.env   # if that doesn't exist yet, copy the values below
```
At minimum, on top of whatever Postgres/ClickHouse vars you already use:
```
JWT_SECRET=some_long_random_string
LIBRECHAT_SERVICE_API_KEY=some_long_random_string
MCP_ISSUER_URL=http://localhost:4000
MCP_RESOURCE_URL=http://localhost:4000/mcp
MCP_ACCESS_TOKEN_TTL_SECONDS=900
MCP_REFRESH_TOKEN_TTL_SECONDS=2592000
MCP_AUTH_CODE_TTL_SECONDS=120
```
Then apply the new migration (included automatically in `npm run migrate`):
```bash
cd api && npm install && npm run migrate && npm run dev
```

### Frontend
Nothing new — `src/app/settings/mcp/page.tsx` reuses the existing `NEXT_PUBLIC_API_URL` from
`.env.local` (see `.env.local.example`). If that's already set up, the new page just works.

### Verify it locally
```bash
curl http://localhost:4000/.well-known/oauth-authorization-server   # should return JSON, not 404
npx @modelcontextprotocol/inspector                                  # connect to http://localhost:4000/mcp, auth: OAuth
```
The Inspector will walk the full flow (discovery → dynamic client registration → browser login →
token exchange → tool calls) and is the fastest way to confirm the server works end to end.

## 2. LibreChat in production

LibreChat is **optional** — it's a separately self-hosted chat UI, not required for Claude or
ChatGPT to work (those two just need the frontend's "Connect AI chat" page and the live API).
Skip this section entirely if you're not deploying LibreChat.

**Why `librechat.template.yaml` and not a plain `librechat.yaml`:** LibreChat's own `${VAR}`
placeholder resolution does not reach `mcpServers.*.url` / `mcpServers.*.oauth.*` in the currently
published `ghcr.io/danny-avila/librechat:latest` image (verified by reading the shipped
`@librechat/api` source — `MCPServerInspector.inspect` uses the raw config object directly and
never routes it through the schema transform that would resolve `${VAR}`). So
`librechat-render-config.js` does that substitution itself, once, at container start, before
LibreChat's own process runs — this is not a workaround you can skip.

**One-time setup, local or production:**
1. Register an OAuth client for LibreChat (do this once per environment — the `redirect_uri` must
   match where LibreChat is actually reachable):
   ```bash
   curl -X POST https://<your-api-domain>/register -H "Content-Type: application/json" -d '{
     "redirect_uris": ["https://<your-librechat-domain>/api/mcp/pana-food-bank/oauth/callback"],
     "token_endpoint_auth_method": "client_secret_post",
     "grant_types": ["authorization_code","refresh_token"],
     "response_types": ["code"],
     "client_name": "LibreChat (Pana)"
   }'
   ```
   Save the `client_id` and `client_secret` from the response — set them as `PANA_MCP_CLIENT_ID` /
   `PANA_MCP_CLIENT_SECRET` wherever LibreChat is deployed.
2. Set `PANA_API_PUBLIC_URL` to the API's public URL (e.g. `https://pana-api.up.railway.app` — no
   trailing slash) and `PANA_LIBRECHAT_PUBLIC_URL` to LibreChat's own public URL, wherever you're
   deploying LibreChat from.
3. LibreChat also needs its own unrelated boot secrets — `JWT_SECRET`, `JWT_REFRESH_SECRET`,
   `CREDS_KEY` (64 hex chars), `CREDS_IV` (32 hex chars). Generate real ones for production:
   ```bash
   openssl rand -hex 32   # JWT_SECRET, JWT_REFRESH_SECRET, CREDS_KEY
   openssl rand -hex 16   # CREDS_IV
   ```
4. Make sure whatever runs the container executes `node librechat-render-config.js` before
   LibreChat's normal start command, with `CONFIG_PATH` pointing at the *rendered* `librechat.yaml`
   (docker-compose already does this — see the `librechat` service's `command:`; if you deploy
   LibreChat somewhere that isn't docker-compose, e.g. its own Railway service, replicate that same
   two-step command).
5. `mcpSettings.allowedAddresses: ["localhost:4000"]` in the template only matters for local dev
   (LibreChat's SSRF protection blocks loopback/private targets by default). A real public HTTPS
   URL in production needs no entry there — public domains are allowed by default.

**Local dev via docker-compose already does all of this** — `docker compose up -d librechat-mongo
librechat` after setting `PANA_MCP_CLIENT_ID`/`PANA_MCP_CLIENT_SECRET` in the root `.env` (see
`.env.example`); `PANA_API_PUBLIC_URL`/`PANA_LIBRECHAT_PUBLIC_URL` default to `localhost` already.

## 3. Deploying (Vercel + Railway + hosted ClickHouse)

### Railway (backend — `api/`)
Set every var from `api/.env.example`, plus:
- `MCP_ISSUER_URL` / `MCP_RESOURCE_URL` — **the API's public HTTPS Railway URL**, e.g.
  `https://pana-api-production.up.railway.app` and `.../mcp`. This is not optional: Claude and
  ChatGPT both refuse plain-`http` remote MCP servers, and this is also the URL your browser and
  every chat client hit for the OAuth login redirect — it must exactly match what's actually
  publicly reachable, not Railway's internal/private networking hostname.
- `CORS_ORIGIN` — your Vercel domain (or `*` while testing, then lock it down).
- `JWT_SECRET`, `LIBRECHAT_SERVICE_API_KEY` — real random values, not the dev defaults in
  `.env.example`.
- Postgres — if using Railway's managed Postgres plugin, map its connection info to this app's
  discrete `POSTGRES_HOST`/`PORT`/`DB`/`USER`/`PASSWORD` vars (Railway lets you reference another
  service's variables, e.g. `${{Postgres.PGHOST}}`) — the codebase does not read a single
  `DATABASE_URL`.
- ClickHouse — since it's hosted separately, point `CLICKHOUSE_HOST`/`CLICKHOUSE_DB`/
  `CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD` at that instance's public HTTPS endpoint.
- **Run the migration once after every deploy that adds one** — via the Railway CLI:
  `railway run npm run migrate` (or Railway's dashboard "run a command" option), from the `api/`
  service. `004_mcp_oauth_schema.sql` must be applied before the MCP server will work at all
  (`oauth_clients` / `oauth_authorization_codes` / `oauth_refresh_tokens` tables).

### Vercel (frontend)
Set `NEXT_PUBLIC_API_URL` to the same Railway public HTTPS URL as `MCP_ISSUER_URL` above. That's
the only env var this feature needs on the frontend — `src/app/settings/mcp/page.tsx` derives
everything else from it. Nothing else to configure; the `tsconfig.json` fix (excluding `api/` and
`services/` from the frontend's TypeScript check) is already committed, so `next build` won't fail
on the backend's own files.

### After deploying
Re-verify the same way as local dev, against the real URL:
```bash
curl https://<your-api-domain>/.well-known/oauth-authorization-server
npx @modelcontextprotocol/inspector   # point at https://<your-api-domain>/mcp
```
Then open the deployed frontend's `/settings/mcp` page and confirm the copy buttons show the real
production URL (not `localhost`).

## Known gaps (deliberate, not oversights)

- **No consent screen.** Logging in via `/oauth/login` *is* the consent step for v1 — there's no
  separate "App X wants to read/write your data" screen. Fine for now; add one before this is used
  by anyone outside your own org.
- **`api/src/modules/actions/`** (the old shared-key LibreChat integration) is left running in
  parallel, not deleted. Once LibreChat is confirmed working over MCP, delete it and
  `LIBRECHAT_SERVICE_API_KEY` in a follow-up cleanup.
- **ClickHouse-backed tools** (`get_dashboard_summary`, `list_uploads`, `get_upload_rows`,
  `correct_upload_row`) need a reachable ClickHouse to actually return data — same requirement the
  rest of the app already has, nothing new here.
