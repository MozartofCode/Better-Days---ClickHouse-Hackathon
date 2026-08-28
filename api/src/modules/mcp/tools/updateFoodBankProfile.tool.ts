import { z } from "zod";
import * as operationsService from "../../operations/operations.service";
import { HttpError } from "../../../utils/http-error";
import { defineTool, jsonResult } from "./types";

export const updateFoodBankProfileTool = defineTool({
  name: "update_food_bank_profile",
  description: "Update your food bank's organization profile (address, primary contact, timezone). Admin role required.",
  mode: "write",
  inputSchema: {
    address: z.string().optional(),
    primaryContact: z.string().optional(),
    timezone: z.string().optional(),
  },
  async handler(args, ctx) {
    // Profile edits are more sensitive than item-quantity edits — gate with
    // an explicit role check here rather than adding per-tool middleware.
    if (ctx.user.role !== "admin") {
      throw new HttpError(403, "Only an admin can update the food bank profile");
    }
    const profile = await operationsService.updateFoodBankProfile(ctx.user.foodBankId, args);
    return jsonResult(profile);
  },
});
