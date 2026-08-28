import * as operationsService from "../../operations/operations.service";
import { defineTool, jsonResult } from "./types";

export const listSitesTool = defineTool({
  name: "list_sites",
  description: "List your food bank's active distribution sites.",
  mode: "read",
  inputSchema: {},
  async handler(_args, ctx) {
    const sites = await operationsService.listSites(ctx.user.foodBankId);
    return jsonResult(sites);
  },
});
