import * as operationsService from "../../operations/operations.service";
import { defineTool, jsonResult } from "./types";

export const listProgramsTool = defineTool({
  name: "list_programs",
  description: "List your food bank's active programs.",
  mode: "read",
  inputSchema: {},
  async handler(_args, ctx) {
    const programs = await operationsService.listPrograms(ctx.user.foodBankId);
    return jsonResult(programs);
  },
});
