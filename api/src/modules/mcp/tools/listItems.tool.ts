import * as operationsService from "../../operations/operations.service";
import { defineTool, jsonResult } from "./types";

export const listItemsTool = defineTool({
  name: "list_items",
  description: "List your food bank's active inventory item catalog (canonical items, categories, units of measure).",
  mode: "read",
  inputSchema: {},
  async handler(_args, ctx) {
    const items = await operationsService.listItems(ctx.user.foodBankId);
    return jsonResult(items);
  },
});
