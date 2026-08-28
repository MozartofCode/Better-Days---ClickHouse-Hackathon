import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AuthUser } from "../../../types";

export interface McpToolContext {
  user: AuthUser;
}

export interface McpToolDefinition<TInput extends z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: TInput;
  /** Documentation-only — not enforced by the SDK, but keeps the tool list scannable. */
  mode: "read" | "write";
  handler: (args: z.infer<z.ZodObject<TInput>>, ctx: McpToolContext) => Promise<CallToolResult>;
}

/** Identity helper — exists purely so tool files get inference without boilerplate. */
export function defineTool<T extends z.ZodRawShape>(def: McpToolDefinition<T>): McpToolDefinition<T> {
  return def;
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
