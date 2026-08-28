import { z } from "zod";
import * as operationsService from "../../operations/operations.service";
import { defineTool, jsonResult } from "./types";

export const updateItemTool = defineTool({
  name: "update_item",
  description: "Correct or update one of your food bank's catalog items (name, category, unit of measure, active status). Only your own food bank's items can be updated.",
  mode: "write",
  inputSchema: {
    itemId: z.string().uuid(),
    canonicalItemName: z.string().min(1).optional(),
    itemCategory: z.string().optional(),
    unitOfMeasure: z.string().optional(),
    activeStatus: z.boolean().optional(),
  },
  async handler(args, ctx) {
    const { itemId, ...patch } = args;
    const item = await operationsService.updateItem(ctx.user.foodBankId, itemId, patch);
    return jsonResult(item);
  },
});
