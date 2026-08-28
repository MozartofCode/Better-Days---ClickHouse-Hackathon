import * as operationsService from "../../operations/operations.service";
import { defineTool, jsonResult } from "./types";

export const getFoodBankProfileTool = defineTool({
  name: "get_food_bank_profile",
  description: "Get your food bank's organization profile (name, type, address, timezone, contact).",
  mode: "read",
  inputSchema: {},
  async handler(_args, ctx) {
    const profile = await operationsService.getFoodBankProfile(ctx.user.foodBankId);
    return jsonResult(profile);
  },
});
