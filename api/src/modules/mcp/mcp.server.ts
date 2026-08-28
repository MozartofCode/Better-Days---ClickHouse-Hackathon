import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuthUser } from "../../types";
import { allTools } from "./tools/index";

/**
 * Builds a fresh McpServer instance registering every tool from the
 * tools/ registry. Called once per Streamable HTTP session (see
 * mcp.routes.ts) — cheap, since it just wires up handlers.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "pana-food-bank",
    version: "1.0.0",
  });

  for (const tool of allTools) {
    const registerTool = server.registerTool.bind(server) as (
      name: string,
      config: { description: string; inputSchema: unknown },
      cb: (args: unknown, extra: { authInfo?: { extra?: Record<string, unknown> } }) => Promise<unknown>
    ) => unknown;

    registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args, extra) => {
        const user = extra.authInfo?.extra?.user as AuthUser | undefined;
        if (!user) {
          throw new Error("Missing authenticated user on MCP request");
        }
        return tool.handler(args as any, { user });
      }
    );
  }

  return server;
}
